const crypto = require('crypto');
const { db, addCardDust } = require('../../database/db');
const { MATERIALS, CHESTS, LOCATION_MATERIALS } = require('./materialData');
const { grantResource, listResources } = require('./resourceService');
const { EXPEDITION_LOOT } = require('./itemData');
const { grantItem } = require('./itemService');

function seeded(seed) {
  let s = parseInt(crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 12), 16) % 2147483647;
  return () => ((s = s * 48271 % 2147483647) - 1) / 2147483646;
}
function int(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }

function grantMaterial(userId, materialKey, quantity, source = 'material-reward') {
  const amount = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!amount) return null;
  const granted = grantResource(userId, materialKey, amount, source);
  if (!granted) return null;
  // В наградах показываем именно полученное количество, а не общий остаток.
  // Раньше поле quantity содержало итоговый баланс, из-за чего игрокам казалось,
  // что старые ресурсы были заменены наградой сундука.
  return { ...granted, quantity: amount, totalQuantity: Number(granted.quantity) || amount };
}

function getMaterials(userId) {
  return listResources(userId);
}
function grantChest(userId, chestKey, quantity = 1) {
  const chest = CHESTS[chestKey];
  const amount = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!chest || !amount) return null;
  db.prepare(`INSERT INTO hero_chests (user_id, chest_key, quantity) VALUES (?,?,?)
    ON CONFLICT(user_id, chest_key) DO UPDATE SET quantity=quantity+excluded.quantity, updated_at=CURRENT_TIMESTAMP`)
    .run(userId, chestKey, amount);
  return { key: chestKey, ...chest, quantity: amount };
}
function getChests(userId) {
  return db.prepare('SELECT chest_key, quantity FROM hero_chests WHERE user_id=? AND quantity>0 ORDER BY chest_key').all(userId)
    .map(row => ({ key: row.chest_key, quantity: row.quantity, ...(CHESTS[row.chest_key] || { name: row.chest_key, icon: '📦', rarity: 'unknown' }) }));
}

// Адресная разовая компенсация сундука, который был показан в результате экспедиции,
// но раньше не имел понятного интерфейса открытия. Маркер исключает повторную выдачу.
db.exec(`CREATE TABLE IF NOT EXISTS system_one_time_grants (
  grant_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
function applyOneTimeChestGrant() {
  const userId = '308557208147329025';
  const grantKey = 'expedition-common-chest-ui-compensation-v1842';
  if (db.prepare('SELECT 1 FROM system_one_time_grants WHERE grant_key=?').get(grantKey)) return;
  const tx = db.transaction(() => {
    grantChest(userId, 'common_chest', 1);
    db.prepare('INSERT INTO system_one_time_grants(grant_key,user_id) VALUES(?,?)').run(grantKey,userId);
  });
  try { tx(); console.log(`[Chests] One-time common chest granted to ${userId}`); }
  catch (error) { console.error('[Chests] One-time grant failed:', error); }
}


applyOneTimeChestGrant();

// V18.4.9 hotfix: проверка баланса игрока после неверного отображения награды сундука.
// Сообщение «+60 трав / +22 экстракта» показывало итоговый баланс, а не размер дропа.
// Не начисляем ресурсы повторно; только гарантируем, что подтверждённый остаток не ниже 60/22.
function applyChestDisplayReconciliation() {
  const userId = '1080729129915256843';
  const grantKey = 'chest-total-vs-reward-display-reconciliation-v1849';
  if (db.prepare('SELECT 1 FROM system_one_time_grants WHERE grant_key=?').get(grantKey)) return;
  const tx = db.transaction(() => {
    const ensureMinimum = db.prepare(`
      INSERT INTO hero_materials(user_id,material_key,quantity,updated_at)
      VALUES(?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,material_key) DO UPDATE SET
        quantity=MAX(quantity,excluded.quantity), updated_at=CURRENT_TIMESTAMP
    `);
    ensureMinimum.run(userId, 'forest_herbs', 60);
    ensureMinimum.run(userId, 'herb_extract', 22);
    db.prepare('INSERT INTO system_one_time_grants(grant_key,user_id) VALUES(?,?)').run(grantKey,userId);
  });
  try { tx(); console.log(`[Chests] Reconciled minimum resource balances for ${userId}: forest_herbs>=60, herb_extract>=22`); }
  catch (error) { console.error('[Chests] Resource reconciliation failed:', error); }
}

applyChestDisplayReconciliation();

// V18.4.9 FINAL hotfix: подтверждённая ручная корректировка баланса игрока.
// Значения устанавливаются РОВНО один раз, затем будущие награды снова
// прибавляются обычным grantResource. Новый marker нужен, потому что старая
// сверка могла уже отметить только минимумы 60/22 как выполненные.
function applyConfirmedChestCompensation() {
  const userId = '1080729129915256843';
  const grantKey = 'confirmed-chest-balance-110-42-v1849-final';
  if (db.prepare('SELECT 1 FROM system_one_time_grants WHERE grant_key=?').get(grantKey)) return;
  const tx = db.transaction(() => {
    const setExact = db.prepare(`
      INSERT INTO hero_materials(user_id,material_key,quantity,updated_at)
      VALUES(?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id,material_key) DO UPDATE SET
        quantity=excluded.quantity, updated_at=CURRENT_TIMESTAMP
    `);
    setExact.run(userId, 'forest_herbs', 110);
    setExact.run(userId, 'herb_extract', 42);
    db.prepare('INSERT INTO system_one_time_grants(grant_key,user_id) VALUES(?,?)').run(grantKey,userId);
  });
  try { tx(); console.log(`[Chests] Confirmed balance applied for ${userId}: forest_herbs=110, herb_extract=42`); }
  catch (error) { console.error('[Chests] Confirmed balance compensation failed:', error); }
}

applyConfirmedChestCompensation();

function expeditionMaterialRewards(userId, locationKey, difficulty, outcome, sourceId) {
  if (outcome === 'fail') return { materials: [], chest: null };
  const rng = seeded(`materials:${userId}:${locationKey}:${sourceId}`);
  const pool = LOCATION_MATERIALS[locationKey] || ['wood', 'stone', 'herb'];
  const rolls = outcome === 'great' ? 3 : outcome === 'success' ? 2 : 1;
  const grouped = new Map();
  for (let i = 0; i < rolls; i++) {
    let key = pick(rng, pool);
    if (key === 'void_crystal' && rng() > 0.25) key = 'crystal';
    const qty = int(rng, 1, Math.max(2, Number(difficulty) + (outcome === 'great' ? 2 : 0)));
    grouped.set(key, (grouped.get(key) || 0) + qty);
  }
  const materials = [...grouped.entries()].map(([key, qty]) => grantMaterial(userId, key, qty, `expedition:${sourceId}`)).filter(Boolean);
  let chest = null;
  const chance = outcome === 'great' ? 0.62 : outcome === 'success' ? 0.24 : 0.08;
  if (rng() < chance) {
    const chestKey = difficulty >= 5 && outcome === 'great' ? 'epic_chest' : difficulty >= 3 ? 'rare_chest' : 'common_chest';
    chest = grantChest(userId, chestKey, 1);
  }
  return { materials, chest };
}
function openChest(userId, chestKey) {
  const chest = CHESTS[chestKey];
  if (!chest) return { ok: false, reason: 'invalid' };
  const row = db.prepare('SELECT quantity FROM hero_chests WHERE user_id=? AND chest_key=?').get(userId, chestKey);
  if (!row || row.quantity < 1) return { ok: false, reason: 'none' };
  const openingId = `${Date.now()}:${userId}:${chestKey}:${row.quantity}`;
  const rng = seeded(openingId);
  const tx = db.transaction(() => {
    const changed = db.prepare('UPDATE hero_chests SET quantity=quantity-1, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND chest_key=? AND quantity>0').run(userId, chestKey);
    if (!changed.changes) throw new Error('Chest already consumed');
    const dust = int(rng, chest.dust[0], chest.dust[1]);
    addCardDust(userId, dust, `Открытие сундука: ${chest.name}`);
    const pool = Object.keys(MATERIALS).filter(key => {
      const r = MATERIALS[key].rarity;
      if (chest.rarity === 'common') return r === 'common';
      if (chest.rarity === 'rare') return r !== 'epic';
      return true;
    });
    const rolls = int(rng, chest.materialRolls[0], chest.materialRolls[1]);
    const grouped = new Map();
    for (let i = 0; i < rolls; i++) {
      let key = pick(rng, pool);
      if (MATERIALS[key].rarity === 'epic' && rng() > 0.20) key = 'crystal';
      grouped.set(key, (grouped.get(key) || 0) + int(rng, 1, chest.rarity === 'common' ? 3 : 5));
    }
    const materials = [...grouped.entries()].map(([key, qty]) => grantMaterial(userId, key, qty, `chest:${chestKey}`)).filter(Boolean);
    let item = null;
    if (rng() < chest.itemChance) {
      const tier = chest.rarity === 'legendary' || chest.rarity === 'boss' ? 5 : chest.rarity === 'epic' ? 4 : chest.rarity === 'rare' ? 3 : 2;
      const itemPool = EXPEDITION_LOOT[tier] || EXPEDITION_LOOT[1] || [];
      if (itemPool.length) item = grantItem(userId, pick(rng, itemPool), 1, `chest:${chestKey}`);
    }
    const rewards = { dust, materials: materials.map(m => ({ key:m.key, quantity:m.quantity, totalQuantity:m.totalQuantity })), item: item ? { key:item.item_key, name:item.name, rarity:item.rarity } : null };
    db.prepare('INSERT INTO hero_chest_openings (user_id,chest_key,rewards_json) VALUES (?,?,?)').run(userId, chestKey, JSON.stringify(rewards));
    return rewards;
  });
  try { return { ok: true, chest: { key: chestKey, ...chest }, rewards: tx() }; }
  catch (error) { console.error('[Chests] open failed:', error); return { ok: false, reason: 'error' }; }
}

module.exports = { grantMaterial, getMaterials, grantChest, getChests, expeditionMaterialRewards, openChest };
