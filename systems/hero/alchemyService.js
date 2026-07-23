const { db } = require('../../database/db');
const { getHero } = require('./heroService');
const { getInventory, getInventoryItemByKey } = require('./itemService');
const { ALCHEMY_EFFECTS } = require('./alchemyData');

function safeJson(value) { try { return JSON.parse(value || '{}') || {}; } catch { return {}; } }
function mergeBonuses(rows) {
  const out = {};
  for (const row of rows) for (const [key, value] of Object.entries(safeJson(row.bonuses_json))) out[key] = (Number(out[key]) || 0) + (Number(value) || 0);
  return out;
}
function getConsumables(userId) {
  return getInventory(userId, { type: 'consumable', limit: 100 })
    .filter(item => ALCHEMY_EFFECTS[item.item_key])
    .map(item => ({ ...item, effect: ALCHEMY_EFFECTS[item.item_key] }));
}
function getActiveBuffs(userId, context = null) {
  let sql = `SELECT * FROM hero_active_buffs WHERE user_id=? AND charges>0 AND (expires_at IS NULL OR datetime(expires_at)>datetime('now'))`;
  const params = [userId];
  if (context) { sql += ' AND context=?'; params.push(context); }
  return db.prepare(sql + ' ORDER BY activated_at DESC').all(...params).map(row => ({ ...row, bonuses: safeJson(row.bonuses_json) }));
}
function getBuffBonuses(userId, context) { return mergeBonuses(getActiveBuffs(userId, context)); }
function consumeContextBuffs(userId, context) {
  const rows = getActiveBuffs(userId, context);
  if (!rows.length) return { bonuses: {}, consumed: [] };
  const tx = db.transaction(() => {
    for (const row of rows) {
      db.prepare('UPDATE hero_active_buffs SET charges=charges-1 WHERE user_id=? AND buff_key=? AND charges>0').run(userId, row.buff_key);
      db.prepare('DELETE FROM hero_active_buffs WHERE user_id=? AND buff_key=? AND charges<=0').run(userId, row.buff_key);
    }
  });
  tx();
  return { bonuses: mergeBonuses(rows), consumed: rows.map(r => r.buff_key) };
}
function removeOneInventoryItem(userId, itemKey) {
  const row = getInventoryItemByKey(userId, itemKey);
  if (!row || Number(row.quantity) < 1) return false;
  if (Number(row.quantity) === 1) db.prepare('DELETE FROM hero_inventory WHERE user_id=? AND item_key=?').run(userId, itemKey);
  else db.prepare('UPDATE hero_inventory SET quantity=quantity-1 WHERE user_id=? AND item_key=? AND quantity>0').run(userId, itemKey);
  return true;
}
function useConsumable(userId, itemKey) {
  const effect = ALCHEMY_EFFECTS[itemKey];
  if (!effect) return { ok: false, reason: 'unsupported' };
  const hero = getHero(userId);
  if (!hero) return { ok: false, reason: 'no_hero' };
  const tx = db.transaction(() => {
    if (!removeOneInventoryItem(userId, itemKey)) return { ok: false, reason: 'none' };
    if (effect.kind === 'instant' && effect.bonuses.heal) {
      const before = Number(hero.hp || 0);
      const after = Math.min(Number(hero.max_hp || 0), before + Number(effect.bonuses.heal || 0));
      db.prepare('UPDATE heroes SET hp=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(after, userId);
      const result = { healed: after - before, hp: after, maxHp: Number(hero.max_hp || 0) };
      db.prepare('INSERT INTO hero_consumable_history(user_id,item_key,effect_json) VALUES(?,?,?)').run(userId, itemKey, JSON.stringify(result));
      return { ok: true, effect, result };
    }
    db.prepare(`INSERT INTO hero_active_buffs(user_id,buff_key,source_item_key,context,charges,bonuses_json)
      VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,buff_key) DO UPDATE SET charges=hero_active_buffs.charges+excluded.charges, bonuses_json=excluded.bonuses_json, activated_at=CURRENT_TIMESTAMP`)
      .run(userId, itemKey, itemKey, effect.context, effect.charges || 1, JSON.stringify(effect.bonuses || {}));
    db.prepare('INSERT INTO hero_consumable_history(user_id,item_key,effect_json) VALUES(?,?,?)').run(userId, itemKey, JSON.stringify(effect));
    return { ok: true, effect, result: { charges: effect.charges || 1 } };
  });
  return tx();
}

module.exports = { getConsumables, getActiveBuffs, getBuffBonuses, consumeContextBuffs, useConsumable };
