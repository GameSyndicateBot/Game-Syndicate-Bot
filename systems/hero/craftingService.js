const { db, getCardDust, removeCardDust, addCardDust } = require('../../database/db');
const { ITEMS } = require('./itemData');
const { MATERIALS } = require('./materialData');
const { RECIPES } = require('./craftingData');
const { grantItem } = require('./itemService');
const { getHero } = require('./heroService');

function getOwnedMaterialMap(userId) {
  return new Map(db.prepare('SELECT material_key, quantity FROM hero_materials WHERE user_id=?').all(userId).map(r => [r.material_key, r.quantity]));
}

function hydrateRecipe(key, userId = null) {
  const recipe = RECIPES[key];
  if (!recipe || !ITEMS[recipe.itemKey]) return null;
  const owned = userId ? getOwnedMaterialMap(userId) : new Map();
  const hero = userId ? getHero(userId) : null;
  const materials = Object.entries(recipe.materials).map(([materialKey, required]) => ({
    key: materialKey,
    required,
    owned: owned.get(materialKey) || 0,
    ...(MATERIALS[materialKey] || { name:materialKey, icon:'📦', rarity:'unknown' }),
  }));
  const dust = userId ? getCardDust(userId) : 0;
  return {
    key,
    ...recipe,
    item: ITEMS[recipe.itemKey],
    materials,
    heroLevel: hero?.level || 0,
    dust,
    canCraft: !!hero && hero.level >= recipe.level && dust >= recipe.dust && materials.every(m => m.owned >= m.required),
  };
}

function listRecipes(userId, { craftableOnly = false } = {}) {
  return Object.keys(RECIPES).map(key => hydrateRecipe(key, userId)).filter(Boolean)
    .filter(r => !craftableOnly || r.canCraft)
    .sort((a,b) => a.level-b.level || a.item.rarity.localeCompare(b.item.rarity) || a.item.name.localeCompare(b.item.name));
}

function craft(userId, recipeKey, quantity = 1) {
  quantity = Math.max(1, Math.min(10, Math.floor(Number(quantity) || 1)));
  const recipe = hydrateRecipe(recipeKey, userId);
  if (!recipe) return { ok:false, reason:'invalid_recipe' };
  const hero = getHero(userId);
  if (!hero) return { ok:false, reason:'no_hero' };
  if (hero.level < recipe.level) return { ok:false, reason:'level', requiredLevel:recipe.level, heroLevel:hero.level };
  const totalDust = recipe.dust * quantity;
  const missing = recipe.materials.map(m => ({ ...m, required:m.required*quantity }))
    .filter(m => m.owned < m.required);
  if (missing.length) return { ok:false, reason:'materials', missing };
  const payment = removeCardDust(userId, totalDust);
  if (!payment.ok) return { ok:false, reason:'dust', required:totalDust, balance:payment.balance };

  try {
    const result = db.transaction(() => {
      for (const m of recipe.materials) {
        const needed = m.required * quantity;
        const changed = db.prepare(`UPDATE hero_materials SET quantity=quantity-?, updated_at=CURRENT_TIMESTAMP
          WHERE user_id=? AND material_key=? AND quantity>=?`).run(needed, userId, m.key, needed);
        if (!changed.changes) throw new Error(`Insufficient material: ${m.key}`);
      }
      const item = grantItem(userId, recipe.itemKey, quantity, `craft:${recipeKey}`);
      db.prepare(`INSERT INTO hero_crafting_history(user_id,recipe_key,item_key,quantity,dust_spent,materials_json)
        VALUES(?,?,?,?,?,?)`).run(userId, recipeKey, recipe.itemKey, quantity, totalDust,
          JSON.stringify(Object.fromEntries(recipe.materials.map(m => [m.key, m.required*quantity]))));
      return item;
    })();
    return { ok:true, recipe, item:result, quantity, spent:totalDust, balance:payment.balance };
  } catch (error) {
    addCardDust(userId, totalDust);
    console.error('[Crafting] craft failed:', error);
    return { ok:false, reason:'error' };
  }
}

module.exports = { hydrateRecipe, listRecipes, craft };
