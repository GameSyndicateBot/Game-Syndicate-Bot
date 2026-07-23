const MATERIALS = Object.freeze({
  wood: { name: 'Древесина', icon: '🪵', rarity: 'common', value: 8, description: 'Базовый материал для оружия и инструментов.' },
  iron_ore: { name: 'Железная руда', icon: '⛓️', rarity: 'common', value: 12, description: 'Руда для кузнечного дела.' },
  stone: { name: 'Камень', icon: '🪨', rarity: 'common', value: 7, description: 'Прочный строительный материал.' },
  herb: { name: 'Лечебная трава', icon: '🌿', rarity: 'common', value: 9, description: 'Основа будущих зелий.' },
  bone: { name: 'Кость', icon: '🦴', rarity: 'common', value: 10, description: 'Материал для талисманов и тёмного ремесла.' },
  leather: { name: 'Кожа', icon: '🟫', rarity: 'common', value: 11, description: 'Используется для лёгкой брони.' },
  crystal: { name: 'Магический кристалл', icon: '💎', rarity: 'rare', value: 45, description: 'Накопитель магической энергии.' },
  essence: { name: 'Эссенция', icon: '✨', rarity: 'rare', value: 55, description: 'Редкая субстанция для чар и алхимии.' },
  ancient_fragment: { name: 'Древний фрагмент', icon: '🏺', rarity: 'rare', value: 70, description: 'Обломок исчезнувшей цивилизации.' },
  void_crystal: { name: 'Кристалл Пустоты', icon: '🌀', rarity: 'epic', value: 180, description: 'Опасный материал, наполненный энергией Разлома.' },
});

const CHESTS = Object.freeze({
  common_chest: { name: 'Обычный сундук', icon: '📦', rarity: 'common', materialRolls: [2, 3], dust: [25, 60], itemChance: 0.08 },
  rare_chest: { name: 'Редкий сундук', icon: '🎁', rarity: 'rare', materialRolls: [3, 4], dust: [60, 120], itemChance: 0.22 },
  epic_chest: { name: 'Эпический сундук', icon: '🧰', rarity: 'epic', materialRolls: [4, 5], dust: [120, 230], itemChance: 0.42 },
  legendary_chest: { name: 'Легендарный сундук', icon: '👑', rarity: 'legendary', materialRolls: [5, 6], dust: [250, 450], itemChance: 0.70 },
  boss_chest: { name: 'Сундук мирового босса', icon: '🐉', rarity: 'boss', materialRolls: [5, 7], dust: [180, 380], itemChance: 0.62 },
});

const LOCATION_MATERIALS = Object.freeze({
  whispering_forest: ['wood', 'herb', 'leather'],
  misty_marsh: ['herb', 'essence', 'bone'],
  sunken_ruins: ['stone', 'ancient_fragment', 'crystal'],
  iron_mountains: ['iron_ore', 'stone', 'crystal'],
  ash_desert: ['stone', 'leather', 'ancient_fragment'],
  moon_catacombs: ['bone', 'essence', 'crystal'],
  crimson_citadel: ['iron_ore', 'bone', 'ancient_fragment'],
  void_rift: ['essence', 'crystal', 'void_crystal'],
});

module.exports = { MATERIALS, CHESTS, LOCATION_MATERIALS };
