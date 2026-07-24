const { db } = require('../../database/db');
const { HERO_CLASSES, ORIGINS, xpForNextLevel } = require('./heroData');
const { STARTER_BY_CLASS } = require('./itemData');
const { ensureClassProgress, normalizeClassKey } = require('./classProgressService');

function getHero(userId) {
  return db.prepare('SELECT * FROM heroes WHERE user_id = ?').get(userId) || null;
}
function getHeroByNumber(heroNumber) {
  return db.prepare('SELECT * FROM heroes WHERE hero_number = ?').get(heroNumber) || null;
}
function createHero({ userId, name, gender, classKey, originKey }) {
  if (getHero(userId)) return { ok: false, reason: 'exists' };
  classKey = normalizeClassKey(classKey);
  const heroClass = HERO_CLASSES[classKey];
  const origin = ORIGINS[originKey];
  if (!heroClass || !origin) return { ok: false, reason: 'invalid' };
  const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
  if (cleanName.length < 2 || cleanName.length > 24) return { ok: false, reason: 'name' };
  const bonus = origin.bonus || {};
  const stats = {
    hp: heroClass.hp + (bonus.hp || 0), strength: heroClass.strength + (bonus.strength || 0),
    defense: heroClass.defense + (bonus.defense || 0), dexterity: heroClass.dexterity + (bonus.dexterity || 0),
    intelligence: heroClass.intelligence + (bonus.intelligence || 0), luck: heroClass.luck + (bonus.luck || 0),
  };
  const insert = db.prepare(`INSERT INTO heroes
    (user_id, name, gender, class_key, origin_key, hp, max_hp, strength, defense, dexterity, intelligence, luck)
    VALUES (@userId,@name,@gender,@classKey,@originKey,@hp,@hp,@strength,@defense,@dexterity,@intelligence,@luck)`);
  const result = insert.run({ userId, name: cleanName, gender, classKey, originKey, ...stats });
  const hero = getHero(userId);
  ensureClassProgress(userId, classKey);
  addHistory(userId, 'hero_created', `Герой ${cleanName} начал свой путь.`, null);
  try {
    const { grantItem } = require('./itemService');
    const starterKey = STARTER_BY_CLASS[classKey] || 'rusty_blade';
    const starter = grantItem(userId, starterKey, 1, 'starter');
    if (starter) addHistory(userId, 'starter_item', `Получен стартовый предмет «${starter.name}».`, { itemKey: starterKey });
  } catch (error) { console.error('[Hero] starter item error:', error); }
  return { ok: true, hero: getHero(userId), insertId: result.lastInsertRowid };
}
function addHistory(userId, eventType, description, metadata = null) {
  db.prepare(`INSERT INTO hero_history (user_id,event_type,description,metadata_json) VALUES (?,?,?,?)`)
    .run(userId, eventType, description, metadata ? JSON.stringify(metadata) : null);
}
function getHistory(userId, limit = 10) {
  return db.prepare('SELECT * FROM hero_history WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, limit);
}
function getInventory(userId, limit = 30) {
  return db.prepare(`SELECT hi.*, i.name, i.rarity, i.item_type, i.description
    FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key
    WHERE hi.user_id=? ORDER BY hi.id DESC LIMIT ?`).all(userId, limit);
}
function getEquipment(userId) {
  return db.prepare(`SELECT he.slot, he.inventory_id, i.name, i.rarity, i.item_type
    FROM hero_equipment he LEFT JOIN hero_inventory hi ON hi.id=he.inventory_id
    LEFT JOIN hero_items i ON i.item_key=hi.item_key WHERE he.user_id=?`).all(userId);
}

function deleteHero(userId) {
  const hero = getHero(userId);
  if (!hero) return { ok: false, reason: 'missing' };

  const tx = db.transaction(() => {
    // Удаляем только RPG-прогресс героя. Профиль сообщества, Dust,
    // карточки, достижения и ежедневная активность остаются нетронутыми.
    const explicitTables = [
      'hero_class_equipment', 'hero_equipment', 'hero_active_buffs',
      'hero_consumable_history', 'hero_upgrade_history', 'hero_crafting_history',
      'hero_chest_openings', 'hero_chests', 'hero_materials', 'hero_shop_purchases',
      'hero_expeditions', 'hero_class_progress', 'hero_reputation', 'hero_history',
      'hero_artifacts', 'hero_companions', 'hero_item_collection', 'hero_inventory',
      'player_miniboss_stats', 'miniboss_kills', 'expedition_activity'
    ];

    for (const table of explicitTables) {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!exists) continue;
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      if (columns.some(column => column.name === 'user_id')) {
        db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(userId);
      }
    }

    db.prepare('DELETE FROM heroes WHERE user_id=?').run(userId);
  });

  tx();
  return { ok: true, heroName: hero.name, heroNumber: hero.hero_number };
}

function grantXp(userId, amount) {
  const hero = getHero(userId); if (!hero) return null;
  let xp = hero.xp + Math.max(0, Number(amount) || 0), level = hero.level;
  let levels = 0;
  while (xp >= xpForNextLevel(level)) { xp -= xpForNextLevel(level); level++; levels++; }
  db.prepare('UPDATE heroes SET xp=?, level=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(xp, level, userId);
  if (levels) addHistory(userId, 'level_up', `Герой достиг уровня ${level}.`, { level });
  return { ...getHero(userId), levelsGained: levels };
}
module.exports = { getHero, getHeroByNumber, createHero, deleteHero, addHistory, getHistory, getInventory, getEquipment, grantXp };
