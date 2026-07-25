const ALCHEMY_EFFECTS = Object.freeze({
  healing_potion_small: {
    name: 'Малое зелье лечения', icon: '❤️', kind: 'instant', context: 'hero',
    description: 'Восстанавливает 30 HP героя.', allyAllowed: true, bonuses: { heal: 30 },
  },
  healing_potion_large: {
    name: 'Большое зелье лечения', icon: '💖', kind: 'instant', context: 'hero',
    description: 'Восстанавливает 75 HP героя.', allyAllowed: true, bonuses: { heal: 75 },
  },
  swift_tonic: {
    name: 'Тоник следопыта', icon: '💨', kind: 'buff', context: 'expedition', group: 'scout', charges: 1,
    description: 'Даёт +8% к успеху следующей экспедиции.', bonuses: { expedition_success: 8 },
  },
  fortune_elixir: {
    name: 'Эликсир удачи', icon: '🍀', kind: 'buff', context: 'expedition', group: 'fortune', charges: 1,
    description: 'Следующая экспедиция получает +6% к успеху и +12% к редкой добыче.', bonuses: { expedition_success: 6, rare_find: 12 },
  },
  rage_scroll: {
    name: 'Свиток ярости', icon: '🔥', kind: 'buff', context: 'world_boss', group: 'offense', charges: 1,
    description: 'Даёт +10% урона в следующем бою с мировым боссом.', bonuses: { world_boss_damage: 10 },
  },
  defense_scroll: {
    name: 'Свиток защиты', icon: '🛡️', kind: 'buff', context: 'world_boss', group: 'defense', charges: 1,
    description: 'Даёт +10% сопротивления в следующем бою с мировым боссом.', allyAllowed: true, bonuses: { world_boss_resistance: 10 },
  },
  alchemist_bomb: {
    name: 'Алхимическая бомба', icon: '💣', kind: 'buff', context: 'world_boss', group: 'bomb', charges: 1,
    description: 'Добавляет 120 единиц особого урона в следующем бою с мировым боссом.', bonuses: { boss_flat_damage: 120 },
  },
  healing_potion_supreme: {
    name: 'Зелье полного восстановления', icon: '🌟', kind: 'instant', context: 'hero',
    description: 'Восстанавливает 140 HP героя.', allyAllowed: true, bonuses: { heal: 140 },
  },
  sturdy_draught: {
    name: 'Отвар неутомимого путника', icon: '🥾', kind: 'buff', context: 'expedition', group: 'scout', charges: 1,
    description: 'Даёт +12% к успеху следующей экспедиции.', bonuses: { expedition_success: 12 },
  },
  treasure_incense: {
    name: 'Благовоние кладоискателя', icon: '🕯️', kind: 'buff', context: 'expedition', group: 'treasure', charges: 1,
    description: 'Даёт +20% к редкой добыче следующей экспедиции.', bonuses: { rare_find: 20 },
  },
  grand_fortune_elixir: {
    name: 'Великий эликсир Фортуны', icon: '🌠', kind: 'buff', context: 'expedition', group: 'fortune', charges: 1,
    description: 'Следующая экспедиция получает +10% к успеху и +20% к редкой добыче.', bonuses: { expedition_success: 10, rare_find: 20 },
  },
  war_elixir: {
    name: 'Эликсир боевого транса', icon: '⚔️', kind: 'buff', context: 'world_boss', group: 'offense', charges: 1,
    description: 'Даёт +15% урона в следующем бою с мировым боссом.', bonuses: { world_boss_damage: 15 },
  },
  stone_skin_elixir: {
    name: 'Эликсир каменной кожи', icon: '🪨', kind: 'buff', context: 'world_boss', group: 'defense', charges: 1,
    description: 'Даёт +15% сопротивления в следующем бою с мировым боссом.', allyAllowed: true, bonuses: { world_boss_resistance: 15 },
  },
  travel_stew: {
    name: 'Походное рагу', icon: '🍲', kind: 'buff', context: 'expedition', group: 'food', charges: 1, allyAllowed: true,
    description: 'Даёт +5% к успеху следующей экспедиции и снижает риск ранения.', bonuses: { expedition_success: 5, injury_resistance: 10 },
  },
  hunters_meal: {
    name: 'Ужин охотника', icon: '🍖', kind: 'buff', context: 'expedition', group: 'food', charges: 1, allyAllowed: true,
    description: 'Даёт +8% к успеху, +10% к редкой добыче и +10% к опыту класса в следующей экспедиции.', bonuses: { expedition_success: 8, rare_find: 10, class_xp_bonus: 10 },
  },
  guild_feast: {
    name: 'Гильдейский пирог', icon: '🥧', kind: 'buff', context: 'expedition', group: 'food', charges: 1, allyAllowed: true,
    description: 'Даёт +10% к успеху следующей экспедиции. Можно применить на союзника.', bonuses: { expedition_success: 10, world_boss_damage: 8, world_boss_resistance: 8 },
  },
  greater_alchemist_bomb: {
    name: 'Бомба нестабильной Пустоты', icon: '🌀', kind: 'buff', context: 'world_boss', group: 'bomb', charges: 1,
    description: 'Добавляет 250 единиц особого урона в следующем бою с мировым боссом.', bonuses: { boss_flat_damage: 250 },
  },
});

module.exports = { ALCHEMY_EFFECTS };
