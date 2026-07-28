const { db } = require('../../database/db');
const { COMPANIONS } = require('./companionData');

const MAX_ACTIVE_PETS = 3;

function normalizeBonuses(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function ensureActivationTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hero_active_companions (
      user_id TEXT NOT NULL,
      slot_no INTEGER NOT NULL CHECK(slot_no BETWEEN 1 AND 3),
      companion_id INTEGER NOT NULL,
      equipped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, slot_no),
      UNIQUE(user_id, companion_id)
    );
    CREATE TABLE IF NOT EXISTS hero_active_mounts (
      user_id TEXT PRIMARY KEY,
      companion_id INTEGER NOT NULL,
      equipped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Мягкая миграция старой системы: прежний active=1 становится первым питомцем,
  // если у игрока ещё нет новых активных слотов.
  const old = db.prepare(`
    SELECT hc.id, hc.user_id
    FROM hero_companions hc
    WHERE hc.active=1
      AND NOT EXISTS (SELECT 1 FROM hero_active_companions a WHERE a.user_id=hc.user_id)
      AND NOT EXISTS (SELECT 1 FROM hero_active_mounts m WHERE m.user_id=hc.user_id)
  `).all();
  const insert = db.prepare('INSERT OR IGNORE INTO hero_active_companions(user_id,slot_no,companion_id) VALUES(?,1,?)');
  for (const row of old) insert.run(String(row.user_id), Number(row.id));
}
ensureActivationTables();

function registerCompanionDefinition(key, data = {}) {
  if (!key) return null;
  const existing = COMPANIONS[key] || {};
  COMPANIONS[key] = {
    name: data.name || existing.name || key,
    icon: data.icon || existing.icon || (data.kind === 'mount' ? '🐎' : '🐾'),
    rarity: data.rarity || existing.rarity || 'common',
    kind: data.kind || existing.kind || null,
    description: data.description || existing.description || 'Редкий спутник героя.',
    bonuses: normalizeBonuses(data.bonuses || existing.bonuses),
  };
  return COMPANIONS[key];
}

function inferCompanionKind(rowOrKey) {
  const key = typeof rowOrKey === 'string' ? rowOrKey : rowOrKey?.companion_key;
  const row = typeof rowOrKey === 'object' ? rowOrKey : null;
  const def = COMPANIONS[key] || {};
  if (def.kind === 'mount') return 'mount';
  if (def.kind === 'pet') return 'pet';
  if (String(key || '').startsWith('caravan_mount_')) return 'mount';

  try {
    const item = db.prepare('SELECT item_type,name FROM hero_items WHERE item_key=?').get(key);
    if (item?.item_type === 'mount') return 'mount';
    const name = String(item?.name || row?.name || def.name || '').toLowerCase();
    if (/виверн|конь|олень|скакун|маунт|верблюд|грифон|пантера|тигр|медведь/.test(name)) return 'mount';
  } catch (_) {}
  return 'pet';
}

function grantCompanion(userId, key, source = 'system', customData = null) {
  const c = customData ? registerCompanionDefinition(key, customData) : COMPANIONS[key];
  if (!c) return null;
  const uid = String(userId);
  const exists = db.prepare('SELECT * FROM hero_companions WHERE user_id=? AND companion_key=?').get(uid, key);
  if (exists) return exists;
  db.prepare(`INSERT INTO hero_companions(user_id,companion_key,name,rarity,level,xp,active) VALUES(?,?,?,?,1,0,0)`).run(uid, key, c.name, c.rarity);
  return db.prepare('SELECT * FROM hero_companions WHERE user_id=? AND companion_key=?').get(uid, key);
}

function grantCustomCompanion(userId, key, data = {}, source = 'system') {
  return grantCompanion(userId, key, source, data);
}

function listCompanions(userId) {
  const uid = String(userId);
  return db.prepare(`
    SELECT hc.*,
      CASE WHEN ap.companion_id IS NOT NULL OR am.companion_id IS NOT NULL THEN 1 ELSE 0 END AS active,
      ap.slot_no AS active_slot,
      CASE WHEN am.companion_id IS NOT NULL THEN 1 ELSE 0 END AS active_mount
    FROM hero_companions hc
    LEFT JOIN hero_active_companions ap ON ap.user_id=hc.user_id AND ap.companion_id=hc.id
    LEFT JOIN hero_active_mounts am ON am.user_id=hc.user_id AND am.companion_id=hc.id
    WHERE hc.user_id=?
    ORDER BY active_mount DESC, active DESC, active_slot ASC, hc.rarity DESC, hc.id ASC
  `).all(uid).map(row => ({ ...row, companion_kind: inferCompanionKind(row) }));
}

function syncLegacyActive(userId) {
  const uid = String(userId);
  db.prepare('UPDATE hero_companions SET active=0 WHERE user_id=?').run(uid);
  db.prepare(`UPDATE hero_companions SET active=1 WHERE user_id=? AND id IN (
    SELECT companion_id FROM hero_active_companions WHERE user_id=?
    UNION SELECT companion_id FROM hero_active_mounts WHERE user_id=?
  )`).run(uid, uid, uid);
}

function activateCompanion(userId, id, requestedSlot = null) {
  const uid = String(userId);
  const row = db.prepare('SELECT * FROM hero_companions WHERE user_id=? AND id=?').get(uid, id);
  if (!row) return { ok:false, reason:'not_found' };
  const kind = inferCompanionKind(row);

  if (kind === 'mount') {
    const current = db.prepare('SELECT companion_id FROM hero_active_mounts WHERE user_id=?').get(uid);
    if (Number(current?.companion_id) === Number(id)) {
      db.prepare('DELETE FROM hero_active_mounts WHERE user_id=?').run(uid);
      syncLegacyActive(uid);
      return { ok:true, companion:row, kind, active:false, removed:true };
    }
    db.prepare(`INSERT INTO hero_active_mounts(user_id,companion_id,equipped_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET companion_id=excluded.companion_id,equipped_at=CURRENT_TIMESTAMP`).run(uid,id);
    syncLegacyActive(uid);
    return { ok:true, companion:row, kind, active:true };
  }

  const existing = db.prepare('SELECT slot_no FROM hero_active_companions WHERE user_id=? AND companion_id=?').get(uid,id);
  if (existing) {
    db.prepare('DELETE FROM hero_active_companions WHERE user_id=? AND companion_id=?').run(uid,id);
    syncLegacyActive(uid);
    return { ok:true, companion:row, kind, active:false, removed:true, slot:existing.slot_no };
  }

  let slot = Number(requestedSlot);
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_ACTIVE_PETS) {
    const used = new Set(db.prepare('SELECT slot_no FROM hero_active_companions WHERE user_id=?').all(uid).map(x=>Number(x.slot_no)));
    slot = [1,2,3].find(x=>!used.has(x));
  }
  if (!slot) return { ok:false, reason:'max_active', max:MAX_ACTIVE_PETS };

  db.prepare(`INSERT INTO hero_active_companions(user_id,slot_no,companion_id,equipped_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,slot_no) DO UPDATE SET companion_id=excluded.companion_id,equipped_at=CURRENT_TIMESTAMP`).run(uid,slot,id);
  syncLegacyActive(uid);
  return { ok:true, companion:row, kind, active:true, slot };
}

function getActiveCompanions(userId) {
  return db.prepare(`SELECT hc.*,a.slot_no FROM hero_active_companions a JOIN hero_companions hc ON hc.id=a.companion_id WHERE a.user_id=? ORDER BY a.slot_no`).all(String(userId));
}
function getActiveMount(userId) {
  return db.prepare(`SELECT hc.* FROM hero_active_mounts m JOIN hero_companions hc ON hc.id=m.companion_id WHERE m.user_id=? LIMIT 1`).get(String(userId)) || null;
}
function getActiveCompanion(userId) { return getActiveCompanions(userId)[0] || null; }

function bonusesForRow(active) {
  const known = COMPANIONS[active.companion_key];
  if (known?.bonuses) return known.bonuses;
  const item = db.prepare('SELECT name, rarity, description, bonuses_json,item_type FROM hero_items WHERE item_key=?').get(active.companion_key);
  if (!item) return {};
  const bonuses = normalizeBonuses(item.bonuses_json);
  registerCompanionDefinition(active.companion_key, {
    name: active.name || item.name,
    rarity: active.rarity || item.rarity,
    description: item.description,
    bonuses,
    kind: item.item_type === 'mount' ? 'mount' : 'pet',
    icon: item.item_type === 'mount' ? '🐎' : '🐾',
  });
  return bonuses;
}

function getCompanionBonuses(userId) {
  const rows = [...getActiveCompanions(userId)];
  const mount = getActiveMount(userId);
  if (mount) rows.push(mount);
  const total = {};
  for (const row of rows) {
    for (const [key,value] of Object.entries(bonusesForRow(row))) total[key]=(Number(total[key])||0)+(Number(value)||0);
  }
  return total;
}

module.exports = {
  MAX_ACTIVE_PETS,
  grantCompanion,
  grantCustomCompanion,
  registerCompanionDefinition,
  inferCompanionKind,
  listCompanions,
  activateCompanion,
  getActiveCompanion,
  getActiveCompanions,
  getActiveMount,
  getCompanionBonuses,
};
