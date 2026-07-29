const { db } = require('../../database/db');
const { MATERIALS } = require('./materialData');
const { ITEMS } = require('./itemData');
const { logEconomyChange } = require('../../services/economyService');

const RESOURCE_ALIASES = Object.freeze({ herb: 'forest_herbs' });
function normalizeResourceKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return RESOURCE_ALIASES[key] || key;
}

function isResourceKey(key) {
  const normalized = normalizeResourceKey(key);
  return Boolean(MATERIALS[normalized] || ITEMS[normalized]?.type === 'material' || normalized === 'lockpick_set');
}

function resourceMeta(key) {
  const normalized = normalizeResourceKey(key);
  const source = MATERIALS[normalized] || ITEMS[normalized] || {};
  return {
    key: normalized,
    name: source.name || normalized,
    icon: source.icon || '📦',
    rarity: source.rarity || 'common',
    description: source.description || '',
  };
}

function ensureResourceTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hero_materials (
      user_id TEXT NOT NULL,
      material_key TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, material_key)
    );
    CREATE INDEX IF NOT EXISTS idx_hero_materials_user ON hero_materials(user_id);
  `);
}

function migrateLegacyResources() {
  ensureResourceTable();

  // V18.3.9: старые лечебные травы объединяются с лесными травами.
  const legacyHerbs = db.prepare("SELECT user_id,quantity FROM hero_materials WHERE material_key='herb' AND quantity>0").all();
  if (legacyHerbs.length) {
    const merge = db.transaction(() => {
      const upsert = db.prepare(`INSERT INTO hero_materials(user_id,material_key,quantity,updated_at) VALUES(?,'forest_herbs',?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,material_key) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=CURRENT_TIMESTAMP`);
      for (const row of legacyHerbs) upsert.run(row.user_id, Number(row.quantity)||0);
      db.prepare("DELETE FROM hero_materials WHERE material_key='herb'").run();
    });
    merge();
  }

  const legacy = db.prepare(`
    SELECT id, user_id, item_key, quantity
    FROM hero_inventory
    WHERE quantity > 0
  `).all().filter(row => (ITEMS[normalizeResourceKey(row.item_key)]?.type === 'material' || normalizeResourceKey(row.item_key) === 'lockpick_set'));

  if (!legacy.length) return { movedRows: 0, movedQuantity: 0 };

  let movedQuantity = 0;
  const tx = db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO hero_materials(user_id, material_key, quantity, updated_at)
      VALUES(?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, material_key)
      DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP
    `);
    const remove = db.prepare('DELETE FROM hero_inventory WHERE id=?');
    for (const row of legacy) {
      const key = normalizeResourceKey(row.item_key);
      const quantity = Math.max(0, Number(row.quantity) || 0);
      if (!key || !quantity) continue;
      upsert.run(String(row.user_id), key, quantity);
      remove.run(row.id);
      movedQuantity += quantity;
    }
  });
  tx();
  console.log(`[Unified Resources] Migrated ${legacy.length} legacy rows (${movedQuantity} units) from hero_inventory to hero_materials.`);
  return { movedRows: legacy.length, movedQuantity };
}

function getResourceQuantity(userId, resourceKey) {
  migrateLegacyResources();
  const key = normalizeResourceKey(resourceKey);
  return Number(db.prepare('SELECT quantity FROM hero_materials WHERE user_id=? AND material_key=?').get(String(userId), key)?.quantity || 0);
}

function listResources(userId, { positiveOnly = true } = {}) {
  migrateLegacyResources();
  const rows = db.prepare(`SELECT material_key, quantity FROM hero_materials WHERE user_id=? ${positiveOnly ? 'AND quantity>0' : ''} ORDER BY quantity DESC, material_key`).all(String(userId));
  return rows.map(row => ({ ...resourceMeta(row.material_key), quantity: Number(row.quantity) || 0 }));
}

function getResourceMap(userId) {
  return new Map(listResources(userId, { positiveOnly: false }).map(row => [row.key, row.quantity]));
}

function grantResource(userId, resourceKey, quantity, source = 'system', metadata = null) {
  migrateLegacyResources();
  const key = normalizeResourceKey(resourceKey);
  const amount = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!key || !amount || !isResourceKey(key)) return null;
  const meta = resourceMeta(key);
  const tx = db.transaction(() => {
    const before = Number(db.prepare('SELECT quantity FROM hero_materials WHERE user_id=? AND material_key=?').get(String(userId), key)?.quantity || 0);
    db.prepare(`
      INSERT INTO hero_materials(user_id, material_key, quantity, updated_at)
      VALUES(?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, material_key)
      DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP
    `).run(String(userId), key, amount);
    const after = before + amount;
    logEconomyChange({ userId, assetType:'material', assetKey:key, assetName:meta.name, delta:amount, before, after, reason:source, metadata });
    return after;
  });
  const balance = tx();
  return { user_id: String(userId), item_key: key, item_type: 'material', quantity: balance, acquired_from: source, ...meta };
}

function hasResources(userId, requirements, multiplier = 1) {
  const owned = getResourceMap(userId);
  return Object.entries(requirements || {}).every(([key, required]) => (owned.get(normalizeResourceKey(key)) || 0) >= Number(required) * multiplier);
}

function resourceRows(userId, requirements, multiplier = 1) {
  const owned = getResourceMap(userId);
  return Object.entries(requirements || {}).map(([rawKey, required]) => {
    const key = normalizeResourceKey(rawKey);
    return {
      ...resourceMeta(key),
      required: Number(required) * multiplier,
      owned: owned.get(key) || 0,
    };
  });
}

function consumeResources(userId, requirements, multiplier = 1) {
  migrateLegacyResources();
  const rows = resourceRows(userId, requirements, multiplier);
  const missing = rows.filter(row => row.owned < row.required);
  if (missing.length) return { ok: false, missing };
  const tx = db.transaction(() => {
    for (const row of rows) {
      const before = Number(db.prepare('SELECT quantity FROM hero_materials WHERE user_id=? AND material_key=?').get(String(userId), row.key)?.quantity || 0);
      const changed = db.prepare(`
        UPDATE hero_materials
        SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP
        WHERE user_id=? AND material_key=? AND quantity>=?
      `).run(row.required, String(userId), row.key, row.required);
      if (!changed.changes) throw new Error(`Insufficient resource: ${row.key}`);
      const after = before - row.required;
      logEconomyChange({ userId, assetType:'material', assetKey:row.key, assetName:row.name, delta:-row.required, before, after, reason:'resource_consumption' });
    }
    db.prepare('DELETE FROM hero_materials WHERE user_id=? AND quantity<=0').run(String(userId));
  });
  try {
    tx();
    return { ok: true, rows };
  } catch (error) {
    console.error('[Unified Resources] consume failed:', error);
    return { ok: false, reason: 'transaction', missing: resourceRows(userId, requirements, multiplier).filter(row => row.owned < row.required) };
  }
}

function transferResource(fromUserId, toUserId, resourceKey, quantity) {
  const key = normalizeResourceKey(resourceKey);
  const amount = Math.max(1, Math.floor(Number(quantity) || 0));
  const tx = db.transaction(() => {
    const taken = consumeResources(fromUserId, { [key]: amount });
    if (!taken.ok) throw new Error('materials');
    const granted = grantResource(toUserId, key, amount, 'transfer');
    if (!granted) throw new Error('grant');
  });
  try { tx(); return { ok: true, key, quantity: amount }; }
  catch (error) { return { ok: false, reason: error.message === 'materials' ? 'materials' : 'transaction' }; }
}

migrateLegacyResources();

module.exports = {
  normalizeResourceKey,
  isResourceKey,
  resourceMeta,
  migrateLegacyResources,
  getResourceQuantity,
  listResources,
  getResourceMap,
  grantResource,
  add: grantResource,
  hasResources,
  resourceRows,
  consumeResources,
  transferResource,
};
