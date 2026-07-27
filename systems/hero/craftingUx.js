
const BONUS_LABELS = Object.freeze({
  strength:'⚔️ Сила', dexterity:'🎯 Ловкость', intelligence:'✨ Интеллект', hp:'❤️ HP', defense:'🛡️ Защита', luck:'🍀 Удача',
  expedition_success:'🗺️ Успех экспедиций', rare_find:'💎 Шанс редкой добычи', world_boss_damage:'👹 Урон по боссу',
  world_boss_resistance:'🛡️ Защита от босса', heal:'❤️ Лечение', boss_flat_damage:'💥 Урон по боссу'
});
function itemBonusLines(item) {
  const entries=Object.entries(item?.bonuses||{});
  if(!entries.length) return '• Без дополнительных характеристик';
  return entries.map(([key,value])=>`• ${BONUS_LABELS[key]||key}: **+${value}${['expedition_success','rare_find','world_boss_damage','world_boss_resistance'].includes(key)?'%':''}**`).join('\n');
}

const MATERIAL_SOURCES = Object.freeze({
  iron_ore: 'работа горняка',
  iron_ingot: 'переплавка железной руды через /profession process',
  wood: 'старые запасы древесины',
  hardwood: 'работа лесника',
  board: 'переработка крепкой древесины через меню профессии или /profession process',
  beast_hide: 'работа охотника и охотничьи экспедиции',
  leather: 'выделка шкур через меню профессии или /profession process',
  stone: 'горы, шахты и каменистые локации',
  herb: 'старые запасы трав (автоматически объединяются)',
  forest_herbs: 'работа травника и лесные экспедиции',
  herb_extract: 'переработка лесных трав через меню профессии или /profession process',
  essence: 'магические события, сундуки и сильные противники',
  crystal: 'пещеры, руины, сундуки и редкие события',
  bone: 'нежить, кладбища и опасные боевые события',
  ancient_fragment: 'сложные экспедиции, древние руины и редкие сундуки',
  void_crystal: 'высокоуровневые экспедиции и особо редкие противники',
  raw_meat: 'охота и профессия охотника',
  forest_mushrooms: 'лесные экспедиции и профессия собирателя',
  culinary_herbs: 'лесные поляны, сбор трав и профессии собирателей',
  wild_berries: 'лесные экспедиции и сбор ягод',
  grain: 'равнинные экспедиции, фермерские события и торговые находки',
  fresh_fish: 'рыбалка и водные экспедиции',
  shellfish: 'побережье, реки и профессия рыбака',
  moon_carp: 'редкий улов рыбака и особые водные события',
});

function sourceFor(key) {
  return MATERIAL_SOURCES[key] || 'экспедиции, сундуки и события Гильдии';
}

function missingRecipeSummary(recipe) {
  const missing = [];
  if (Number(recipe.heroLevel || 0) < Number(recipe.level || 0)) {
    missing.push(`уровень героя ${recipe.heroLevel}/${recipe.level}`);
  }
  if (Number(recipe.dustBalance || 0) < Number(recipe.dust || 0)) {
    missing.push(`ещё ${Math.max(0, recipe.dust - recipe.dustBalance)} Dust`);
  }
  for (const material of recipe.materials || []) {
    if (material.owned < material.required) missing.push(`${material.name} ×${material.required - material.owned}`);
  }
  return missing;
}

function missingCookSummary(recipe) {
  const missing = [];
  if (Number(recipe.heroLevel || 0) < Number(recipe.level || 0)) {
    missing.push(`уровень героя ${recipe.heroLevel}/${recipe.level}`);
  }
  for (const ingredient of recipe.ingredients || []) {
    if (ingredient.owned < ingredient.required) missing.push(`${ingredient.item.name} ×${ingredient.required - ingredient.owned}`);
  }
  return missing;
}

function recipeState(recipe) {
  if (recipe.canCraft) return { icon: '✅', label: 'Можно создать' };
  if (recipe.heroLevel < recipe.level) return { icon: '🔒', label: `Откроется на уровне ${recipe.level}` };
  return { icon: '🟡', label: 'Уровень открыт, не хватает ресурсов' };
}

function cookState(recipe) {
  if (recipe.canCook) return { icon: '✅', label: 'Можно приготовить' };
  if (recipe.heroLevel < recipe.level) return { icon: '🔒', label: `Откроется на уровне ${recipe.level}` };
  return { icon: '🟡', label: 'Уровень открыт, не хватает ингредиентов' };
}

module.exports = {
  MATERIAL_SOURCES,
  sourceFor,
  missingRecipeSummary,
  missingCookSummary,
  recipeState,
  cookState,
  itemBonusLines,
};
