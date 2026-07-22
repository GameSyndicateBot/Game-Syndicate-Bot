const LOCATIONS = Object.freeze({
  whispering_forest: { name: 'Шепчущий лес', icon: '🌲', difficulty: 1, durationHours: 6, baseXp: [18, 30], dust: [35, 70], stat: 'dexterity', tags: ['nature'], description: 'Безопасные тропы, звери и забытые охотничьи тайники.' },
  misty_marsh: { name: 'Туманное болото', icon: '🌫️', difficulty: 2, durationHours: 7, baseXp: [24, 38], dust: [45, 90], stat: 'intelligence', tags: ['nature','magic'], description: 'Ядовитые испарения скрывают редкие травы и древние огни.' },
  sunken_ruins: { name: 'Затонувшие руины', icon: '🏛️', difficulty: 2, durationHours: 7, baseXp: [25, 40], dust: [50, 100], stat: 'luck', tags: ['ruins','water'], description: 'Разрушенный храм, ловушки и следы давно исчезнувшей цивилизации.' },
  iron_mountains: { name: 'Железные горы', icon: '🏔️', difficulty: 3, durationHours: 8, baseXp: [32, 50], dust: [65, 125], stat: 'defense', tags: ['mountain'], description: 'Холод, обрывы и шахты, в которых всё ещё слышен звон кирок.' },
  ash_desert: { name: 'Пепельная пустыня', icon: '🏜️', difficulty: 3, durationHours: 8, baseXp: [34, 52], dust: [70, 135], stat: 'strength', tags: ['desert'], description: 'Жара, караваны и погребённые песком сокровища.' },
  moon_catacombs: { name: 'Лунные катакомбы', icon: '🕯️', difficulty: 4, durationHours: 9, baseXp: [42, 65], dust: [90, 170], stat: 'intelligence', tags: ['magic','dungeon'], description: 'Некромантские печати, призраки и опасные реликвии.' },
  crimson_citadel: { name: 'Багровая цитадель', icon: '🏰', difficulty: 4, durationHours: 9, baseXp: [44, 68], dust: [95, 180], stat: 'strength', tags: ['combat','ruins'], description: 'Заброшенная крепость, где всё ещё несут службу проклятые стражи.' },
  void_rift: { name: 'Разлом Пустоты', icon: '🌀', difficulty: 5, durationHours: 10, baseXp: [55, 85], dust: [125, 240], stat: 'luck', tags: ['magic','void'], description: 'Нестабильная область с лучшей добычей и смертельной опасностью.' },
});

const EXPEDITION_ITEMS = Object.freeze({
  forest_herbs: { name: 'Лесные травы', type: 'material', rarity: 'common', description: 'Набор трав для будущей алхимии.' },
  ancient_fragment: { name: 'Древний фрагмент', type: 'material', rarity: 'rare', description: 'Осколок неизвестного артефакта.' },
  healing_potion_small: { name: 'Малое зелье лечения', type: 'consumable', rarity: 'common', description: 'Восстанавливает здоровье героя.', consumable: 1 },
  lockpick_set: { name: 'Набор отмычек', type: 'utility', rarity: 'common', description: 'Поможет открыть запертые сундуки в будущих приключениях.', consumable: 1 },
  void_crystal: { name: 'Кристалл Пустоты', type: 'material', rarity: 'epic', description: 'Редкий материал, наполненный энергией Разлома.' },
});

const EVENTS = Object.freeze({
  success: [
    'Герой нашёл безопасный путь и вернулся с полной сумкой добычи.',
    'Старые знания помогли избежать ловушек и добраться до тайника.',
    'После долгих поисков герой обнаружил следы забытой экспедиции.',
  ],
  great: [
    'Удача улыбнулась герою: за скрытой стеной оказался редкий тайник.',
    'Опасный противник был побеждён, а его сокровища стали наградой.',
  ],
  partial: [
    'Путешествие оказалось тяжёлым, но герой всё же принёс часть добычи.',
    'Из-за непогоды пришлось повернуть назад раньше времени.',
  ],
  fail: [
    'Экспедиция провалилась: герой попал в засаду и едва выбрался.',
    'Ловушка уничтожила припасы, и возвращаться пришлось с пустыми руками.',
  ],
});

module.exports = { LOCATIONS, EXPEDITION_ITEMS, EVENTS };
