const crypto = require('crypto');
const { db, addCardDust } = require('../../database/db');
const { MATERIALS, CHESTS, LOCATION_MATERIALS } = require('./materialData');
const { EXPEDITION_LOOT } = require('./itemData');
const { grantItem } = require('./itemService');

function seeded(seed) {
  let s = parseInt(crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 12), 16) % 2147483647;
  return () => ((s = s * 48271 % 2147483647) - 1) / 2147483646;
}
function int(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }

function grantMaterial(userId, materialKey, quantity) {
  const material = MATERIALS[materialKey];
  const amount = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!material || !amount) return null;
  db.prepare(`INSERT INTO hero_materials (user_id, material_key, quantity) VALUES (?,?,?)
    ON CONFLICT(user_id, material_key) DO UPDATE SET quantity=quantity+excluded.quantity, updated_at=CURRENT_TIMESTAMP`)
    .run(userId, materialKey, amount);
  return { key: materialKey, ...material, quantity: amount };
}
function getMaterials(userId) {
  return db.prepare('SELECT material_key, quantity FROM hero_materials WHERE user_id=? AND quantity>0 ORDER BY quantity DESC, material_key').all(userId)
    .map(row => ({ key: row.material_key, quantity: row.quantity, ...(MATERIALS[row.material_key] || { name: row.material_key, icon: '📦', rarity: 'unknown' }) }));
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
  const materials = [...grouped.entries()].map(([key, qty]) => grantMaterial(userId, key, qty)).filter(Boolean);
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
    addCardDust(userId, dust);
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
    const materials = [...grouped.entries()].map(([key, qty]) => grantMaterial(userId, key, qty)).filter(Boolean);
    let item = null;
    if (rng() < chest.itemChance) {
      const tier = chest.rarity === 'legendary' || chest.rarity === 'boss' ? 5 : chest.rarity === 'epic' ? 4 : chest.rarity === 'rare' ? 3 : 2;
      const itemPool = EXPEDITION_LOOT[tier] || EXPEDITION_LOOT[1] || [];
      if (itemPool.length) item = grantItem(userId, pick(rng, itemPool), 1, `chest:${chestKey}`);
    }
    const rewards = { dust, materials: materials.map(m => ({ key:m.key, quantity:m.quantity })), item: item ? { key:item.item_key, name:item.name, rarity:item.rarity } : null };
    db.prepare('INSERT INTO hero_chest_openings (user_id,chest_key,rewards_json) VALUES (?,?,?)').run(userId, chestKey, JSON.stringify(rewards));
    return rewards;
  });
  try { return { ok: true, chest: { key: chestKey, ...chest }, rewards: tx() }; }
  catch (error) { console.error('[Chests] open failed:', error); return { ok: false, reason: 'error' }; }
}

module.exports = { grantMaterial, getMaterials, grantChest, getChests, expeditionMaterialRewards, openChest };
