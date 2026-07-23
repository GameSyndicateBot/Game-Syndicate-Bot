const ALCHEMY_EFFECTS = Object.freeze({
  healing_potion_small: {
    name: 'Малое зелье лечения', icon: '❤️', kind: 'instant', context: 'hero',
    description: 'Восстанавливает 30 HP героя.', bonuses: { heal: 30 },
  },
  healing_potion_large: {
    name: 'Большое зелье лечения', icon: '💖', kind: 'instant', context: 'hero',
    description: 'Восстанавливает 75 HP героя.', bonuses: { heal: 75 },
  },
  swift_tonic: {
    name: 'Тоник следопыта', icon: '💨', kind: 'buff', context: 'expedition', charges: 1,
    description: 'Даёт +8% к успеху следующей экспедиции.', bonuses: { expedition_success: 8 },
  },
  fortune_elixir: {
    name: 'Эликсир удачи', icon: '🍀', kind: 'buff', context: 'expedition', charges: 1,
    description: 'Следующая экспедиция получает +6% к успеху и +12% к редкой добыче.', bonuses: { expedition_success: 6, rare_find: 12 },
  },
  rage_scroll: {
    name: 'Свиток ярости', icon: '🔥', kind: 'buff', context: 'world_boss', charges: 1,
    description: 'Даёт +10% урона в следующем бою с мировым боссом.', bonuses: { world_boss_damage: 10 },
  },
  defense_scroll: {
    name: 'Свиток защиты', icon: '🛡️', kind: 'buff', context: 'world_boss', charges: 1,
    description: 'Даёт +10% сопротивления в следующем бою с мировым боссом.', bonuses: { world_boss_resistance: 10 },
  },
  alchemist_bomb: {
    name: 'Алхимическая бомба', icon: '💣', kind: 'buff', context: 'world_boss', charges: 1,
    description: 'Добавляет 120 единиц особого урона в следующем бою с мировым боссом.', bonuses: { boss_flat_damage: 120 },
  },
});

module.exports = { ALCHEMY_EFFECTS };
