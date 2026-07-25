const { db } = require('../../database/db');
const { grantItem, getInventoryItemByKey } = require('./itemService');

const PROFESSIONS = Object.freeze({
  cook: { name: 'Повар', icon: '👨‍🍳', description: 'Готовит еду, усиливающую экспедиции и восстановление.' },
  herbalist: { name: 'Травник', icon: '🌿', description: 'Собирает лечебные травы и редкие растения.' },
  miner: { name: 'Горняк', icon: '⛏️', description: 'Добывает руду и камень для кузницы.' },
  fisher: { name: 'Рыбак', icon: '🎣', description: 'Ловит рыбу для блюд и припасов.' },
  lumberjack: { name: 'Лесник', icon: '🪓', description: 'Заготавливает древесину и походные материалы.' },
});

const WORK_REWARDS = Object.freeze({
  cook: [['grain', 2], ['forest_herbs', 1]],
  herbalist: [['forest_herbs', 3], ['grain', 1]],
  miner: [['iron_ore', 3], ['ancient_fragment', 1]],
  fisher: [['fresh_fish', 3]],
  lumberjack: [['hardwood', 3], ['forest_herbs', 1]],
});

const RECIPES = Object.freeze({
  travel_stew: { name: 'Походное рагу', icon: '🍲', profession: 'cook', level: 1, ingredients: { fresh_fish: 2, forest_herbs: 1 }, item: 'travel_stew' },
  hunters_meal: { name: 'Ужин охотника', icon: '🍖', profession: 'cook', level: 3, ingredients: { raw_meat: 2, grain: 1, forest_herbs: 1 }, item: 'hunters_meal' },
  guild_feast: { name: 'Гильдейский пирог', icon: '🥧', profession: 'cook', level: 5, ingredients: { grain: 3, fresh_fish: 1, forest_herbs: 2 }, item: 'guild_feast' },
});

db.exec(`
CREATE TABLE IF NOT EXISTS hero_professions (
  user_id TEXT PRIMARY KEY,
  profession_key TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  work_count INTEGER NOT NULL DEFAULT 0,
  last_work_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS hero_profession_crafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  recipe_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function xpNeeded(level) { return 80 + Math.max(0, Number(level) - 1) * 40; }
function getProfession(userId) { return db.prepare('SELECT * FROM hero_professions WHERE user_id=?').get(userId) || null; }
function chooseProfession(userId, key) {
  if (!PROFESSIONS[key]) return { ok: false, reason: 'invalid' };
  const current = getProfession(userId);
  if (current) return { ok: false, reason: 'already', current };
  db.prepare('INSERT INTO hero_professions(user_id,profession_key) VALUES(?,?)').run(userId, key);
  return { ok: true, row: getProfession(userId) };
}
function levelFromXp(level, xp) {
  let l = Number(level) || 1; let x = Number(xp) || 0; let gained = 0;
  while (x >= xpNeeded(l) && l < 20) { x -= xpNeeded(l); l += 1; gained += 1; }
  return { level: l, xp: x, gained };
}
function work(userId) {
  const row = getProfession(userId); if (!row) return { ok: false, reason: 'none' };
  if (row.last_work_at) {
    const elapsed = Date.now() - new Date(`${row.last_work_at}Z`).getTime();
    const wait = 4 * 60 * 60 * 1000 - elapsed;
    if (wait > 0) return { ok: false, reason: 'cooldown', waitMs: wait };
  }
  const rewards = WORK_REWARDS[row.profession_key] || [];
  const bonus = Math.floor((Number(row.level) || 1) / 5);
  for (const [key, qty] of rewards) grantItem(userId, key, qty + bonus, `profession:${row.profession_key}`);
  const progress = levelFromXp(row.level, Number(row.xp) + 35);
  db.prepare(`UPDATE hero_professions SET level=?,xp=?,work_count=work_count+1,last_work_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).run(progress.level, progress.xp, userId);
  return { ok: true, rewards: rewards.map(([key, qty]) => [key, qty + bonus]), level: progress.level, xp: progress.xp, leveled: progress.gained > 0 };
}
function hasIngredients(userId, ingredients) {
  return Object.entries(ingredients).every(([key, qty]) => Number(getInventoryItemByKey(userId, key)?.quantity || 0) >= qty);
}
function consumeIngredients(userId, ingredients) {
  for (const [key, qty] of Object.entries(ingredients)) {
    const row = getInventoryItemByKey(userId, key);
    if (!row || Number(row.quantity) < qty) return false;
  }
  for (const [key, qty] of Object.entries(ingredients)) {
    db.prepare('UPDATE hero_inventory SET quantity=quantity-? WHERE user_id=? AND item_key=?').run(qty, userId, key);
    db.prepare('DELETE FROM hero_inventory WHERE user_id=? AND item_key=? AND quantity<=0').run(userId, key);
  }
  return true;
}
function cook(userId, recipeKey) {
  const row = getProfession(userId); const recipe = RECIPES[recipeKey];
  if (!row) return { ok: false, reason: 'none' };
  if (row.profession_key !== 'cook') return { ok: false, reason: 'wrong_profession' };
  if (!recipe) return { ok: false, reason: 'invalid' };
  if (Number(row.level) < recipe.level) return { ok: false, reason: 'level', required: recipe.level };
  if (!hasIngredients(userId, recipe.ingredients)) return { ok: false, reason: 'materials' };
  const tx = db.transaction(() => {
    if (!consumeIngredients(userId, recipe.ingredients)) throw new Error('ingredients_changed');
    grantItem(userId, recipe.item, 1, `cooking:${recipeKey}`);
    db.prepare('INSERT INTO hero_profession_crafts(user_id,recipe_key) VALUES(?,?)').run(userId, recipeKey);
    const progress = levelFromXp(row.level, Number(row.xp) + 20);
    db.prepare('UPDATE hero_professions SET level=?,xp=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(progress.level, progress.xp, userId);
    return progress;
  });
  try { const progress = tx(); return { ok: true, recipe, level: progress.level, leveled: progress.gained > 0 }; }
  catch (_) { return { ok: false, reason: 'materials' }; }
}

module.exports = { PROFESSIONS, RECIPES, xpNeeded, getProfession, chooseProfession, work, cook };
