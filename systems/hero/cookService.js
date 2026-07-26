const { db } = require('../../database/db');
const { ITEMS } = require('./itemData');
const { grantItem, getInventoryItemByKey } = require('./itemService');
const { getHero } = require('./heroService');

const COOK_RECIPES = Object.freeze({
  travel_stew: {
    itemKey: 'travel_stew',
    name: 'Походное рагу',
    level: 1,
    ingredients: { raw_meat: 2, forest_mushrooms: 2, culinary_herbs: 1 },
  },
  hunters_meal: {
    itemKey: 'hunters_meal',
    name: 'Ужин охотника',
    level: 3,
    ingredients: { raw_meat: 3, wild_berries: 2, grain: 2, culinary_herbs: 1 },
  },
  guild_feast: {
    itemKey: 'guild_feast',
    name: 'Гильдейский пирог',
    level: 6,
    ingredients: { fresh_fish: 2, shellfish: 2, moon_carp: 1, grain: 3, culinary_herbs: 2 },
  },
});

function getOwned(userId, itemKey) {
  return Number(getInventoryItemByKey(userId, itemKey)?.quantity || 0);
}

function hydrateCookRecipe(userId, recipeKey) {
  const recipe = COOK_RECIPES[recipeKey];
  const item = recipe ? ITEMS[recipe.itemKey] : null;
  if (!recipe || !item) return null;
  const hero = getHero(userId);
  const ingredients = Object.entries(recipe.ingredients).map(([key, required]) => ({
    key,
    required,
    owned: getOwned(userId, key),
    item: ITEMS[key] || { name: key },
  }));
  return {
    key: recipeKey,
    ...recipe,
    item,
    heroLevel: Number(hero?.level || 0),
    ingredients,
    canCook: Boolean(hero) && Number(hero.level || 0) >= recipe.level && ingredients.every(i => i.owned >= i.required),
  };
}

function listCookRecipes(userId) {
  return Object.keys(COOK_RECIPES).map(key => hydrateCookRecipe(userId, key)).filter(Boolean);
}

function cook(userId, recipeKey) {
  const recipe = hydrateCookRecipe(userId, recipeKey);
  if (!recipe) return { ok: false, reason: 'invalid_recipe' };
  const hero = getHero(userId);
  if (!hero) return { ok: false, reason: 'no_hero' };
  if (Number(hero.level || 0) < recipe.level) return { ok: false, reason: 'level', requiredLevel: recipe.level };
  const missing = recipe.ingredients.filter(i => i.owned < i.required);
  if (missing.length) return { ok: false, reason: 'ingredients', missing };

  try {
    const produced = db.transaction(() => {
      for (const ingredient of recipe.ingredients) {
        const row = getInventoryItemByKey(userId, ingredient.key);
        const result = db.prepare(`UPDATE hero_inventory SET quantity=quantity-? WHERE user_id=? AND item_key=? AND quantity>=?`)
          .run(ingredient.required, userId, ingredient.key, ingredient.required);
        if (!result.changes) throw new Error(`Insufficient ingredient: ${ingredient.key}`);
        db.prepare('DELETE FROM hero_inventory WHERE user_id=? AND item_key=? AND quantity<=0').run(userId, ingredient.key);
      }
      return grantItem(userId, recipe.itemKey, 1, `cook:${recipeKey}`);
    })();
    return { ok: true, recipe, item: produced };
  } catch (error) {
    console.error('[Cook] cooking failed:', error);
    return { ok: false, reason: 'error' };
  }
}

module.exports = { COOK_RECIPES, hydrateCookRecipe, listCookRecipes, cook };
