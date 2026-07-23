const RARITY_ORDER = Object.freeze({ common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, exclusive: 6 });
const RARITY_LABELS = Object.freeze({ common:'Common', rare:'Rare', epic:'Epic', legendary:'Legendary', mythic:'Mythic', exclusive:'Exclusive' });
const SLOT_LABELS = Object.freeze({ weapon:'⚔️ Оружие', armor:'🛡️ Броня', helmet:'🪖 Шлем', gloves:'🧤 Перчатки', boots:'🥾 Ботинки', ring:'💍 Кольцо', amulet:'📿 Амулет', backpack:'🎒 Рюкзак' });
const TYPE_LABELS = Object.freeze({ weapon:'Оружие', armor:'Броня', helmet:'Шлем', gloves:'Перчатки', boots:'Ботинки', ring:'Кольцо', amulet:'Амулет', backpack:'Рюкзак', consumable:'Расходник', material:'Материал', utility:'Инструмент', artifact:'Артефакт' });

const ITEMS = Object.freeze({
  rusty_blade:{name:'Ржавый клинок',type:'weapon',slot:'weapon',rarity:'common',description:'Простой клинок начинающего странника.',lore:'На гарде едва различим знак забытой дружины.',bonuses:{strength:2}},
  hunters_bow:{name:'Лук лесного охотника',type:'weapon',slot:'weapon',rarity:'common',description:'Лёгкий лук для быстрых выстрелов.',lore:'Тетива пахнет сосновой смолой.',bonuses:{dexterity:2,expedition_success:1}},
  novice_staff:{name:'Посох ученика',type:'weapon',slot:'weapon',rarity:'common',description:'Проводник слабой магической энергии.',lore:'Первый посох выпускников Лунной академии.',bonuses:{intelligence:2}},
  iron_axe:{name:'Железный топор',type:'weapon',slot:'weapon',rarity:'rare',description:'Тяжёлое оружие для ближнего боя.',lore:'Его лезвие закаляли в горном снегу.',bonuses:{strength:4,defense:1}},
  shadow_dagger:{name:'Кинжал Тихой Тени',type:'weapon',slot:'weapon',rarity:'epic',description:'Клинок почти не отражает свет.',lore:'Говорят, владельца слышат только после удара.',bonuses:{dexterity:6,luck:2,expedition_success:2}},
  last_lord_blade:{name:'Клинок Последнего Лорда',type:'weapon',slot:'weapon',rarity:'legendary',description:'Реликвия павшей Северной крепости.',lore:'Он становится легче в руках достойного владельца.',bonuses:{strength:10,defense:3,world_boss_damage:5}},
  void_scepter:{name:'Скипетр Пустоты',type:'weapon',slot:'weapon',rarity:'mythic',description:'Искажает пространство вокруг владельца.',lore:'Кристалл внутри отвечает шёпотом на мысли.',bonuses:{intelligence:12,luck:4,world_boss_damage:8}},

  patched_leather:{name:'Латаная кожаная броня',type:'armor',slot:'armor',rarity:'common',description:'Не новая, но всё ещё надёжная.',lore:'Каждая заплата напоминает о пережитом походе.',bonuses:{hp:8,defense:2}},
  chainmail:{name:'Кольчуга дозорного',type:'armor',slot:'armor',rarity:'rare',description:'Крепкая кольчуга городского дозора.',lore:'На внутренней стороне выцарапано: «Держи строй».',bonuses:{hp:15,defense:4}},
  paladin_plate:{name:'Латы Рассвета',type:'armor',slot:'armor',rarity:'epic',description:'Светлая броня ордена защитников.',lore:'Даже в темноте её края хранят золотой отблеск.',bonuses:{hp:28,defense:7}},
  north_guardian_armor:{name:'Доспех Хранителя Севера',type:'armor',slot:'armor',rarity:'legendary',description:'Выдерживал удары ледяных великанов.',lore:'Последний хранитель не отступил ни на шаг.',bonuses:{hp:45,defense:10,world_boss_resistance:5}},

  leather_cap:{name:'Кожаный капюшон',type:'helmet',slot:'helmet',rarity:'common',description:'Скрывает лицо и защищает от ветра.',lore:'Любимая вещь дорожных разведчиков.',bonuses:{dexterity:1,defense:1}},
  iron_helm:{name:'Железный шлем',type:'helmet',slot:'helmet',rarity:'rare',description:'Тяжёлый шлем с укреплённым забралом.',lore:'На нём остались следы трёх неудачных стрел.',bonuses:{hp:7,defense:3}},
  seer_crown:{name:'Венец Провидца',type:'helmet',slot:'helmet',rarity:'epic',description:'Помогает замечать скрытые пути.',lore:'Камни мерцают рядом с древними тайниками.',bonuses:{intelligence:5,luck:3,rare_find:2}},

  traveler_gloves:{name:'Перчатки путешественника',type:'gloves',slot:'gloves',rarity:'common',description:'Не дают рукам мёрзнуть в дороге.',lore:'Карта старого тракта зашита под манжету.',bonuses:{dexterity:1}},
  duelist_gloves:{name:'Перчатки дуэлянта',type:'gloves',slot:'gloves',rarity:'rare',description:'Позволяют увереннее держать оружие.',lore:'Их прежний владелец не проиграл ни одной честной дуэли.',bonuses:{strength:2,dexterity:3}},
  rune_gauntlets:{name:'Рунные рукавицы',type:'gloves',slot:'gloves',rarity:'epic',description:'Руны усиливают каждый точный удар.',lore:'Символы загораются только перед опасностью.',bonuses:{strength:4,intelligence:3,world_boss_damage:2}},

  worn_boots:{name:'Походные сапоги',type:'boots',slot:'boots',rarity:'common',description:'Удобная обувь для долгих переходов.',lore:'Подошвы помнят сотни дорог.',bonuses:{dexterity:1,expedition_success:1}},
  mountain_boots:{name:'Сапоги горца',type:'boots',slot:'boots',rarity:'rare',description:'Не скользят на камне и льду.',lore:'Сделаны мастером из Железных гор.',bonuses:{defense:2,dexterity:3}},
  windstep_boots:{name:'Сапоги Шага Ветра',type:'boots',slot:'boots',rarity:'epic',description:'Каждый шаг становится почти невесомым.',lore:'Их следы исчезают раньше, чем оседает пыль.',bonuses:{dexterity:6,expedition_success:2}},

  copper_ring:{name:'Медное кольцо удачи',type:'ring',slot:'ring',rarity:'common',description:'Небольшой талисман путника.',lore:'Монету согнули в кольцо перед первой дорогой.',bonuses:{luck:1}},
  ring_strength:{name:'Кольцо крепкой руки',type:'ring',slot:'ring',rarity:'rare',description:'Придаёт уверенности в бою.',lore:'Когда-то было наградой победителю арены.',bonuses:{strength:3}},
  ring_fortune:{name:'Кольцо Фортуны',type:'ring',slot:'ring',rarity:'epic',description:'Удача чаще поворачивается лицом.',lore:'Кость на оправе всегда падает удачной стороной.',bonuses:{luck:6,rare_find:3}},
  king_signet:{name:'Печать Забытого Короля',type:'ring',slot:'ring',rarity:'legendary',description:'Символ власти исчезнувшей династии.',lore:'Двери старых руин будто узнают эту печать.',bonuses:{luck:7,intelligence:4,expedition_success:4}},

  forest_amulet:{name:'Амулет Леса',type:'amulet',slot:'amulet',rarity:'common',description:'Тёплый деревянный оберег.',lore:'Вырезан из ветви дерева, пережившего великий пожар.',bonuses:{hp:5,luck:1}},
  sun_amulet:{name:'Амулет Рассвета',type:'amulet',slot:'amulet',rarity:'rare',description:'Защищает владельца от тьмы.',lore:'Священники носили такие в ночных походах.',bonuses:{hp:10,defense:2,intelligence:2}},
  dragon_amulet:{name:'Амулет Драконьего Сердца',type:'amulet',slot:'amulet',rarity:'epic',description:'Согревается рядом с сильным противником.',lore:'Внутри заключена чешуя древнего дракона.',bonuses:{strength:5,hp:15,world_boss_damage:3}},

  canvas_backpack:{name:'Холщовый рюкзак',type:'backpack',slot:'backpack',rarity:'common',description:'Вмещает самое необходимое.',lore:'Его карманы всегда оказываются глубже, чем кажутся.',bonuses:{expedition_success:1}},
  explorers_pack:{name:'Рюкзак исследователя',type:'backpack',slot:'backpack',rarity:'rare',description:'Оснащён ремнями, крючками и отделениями.',lore:'Создан специально для опасных экспедиций.',bonuses:{expedition_success:2,rare_find:2}},
  bottomless_satchel:{name:'Сумка без дна',type:'backpack',slot:'backpack',rarity:'legendary',description:'Редкая пространственная реликвия.',lore:'Никто ещё не смог нащупать её дно.',bonuses:{expedition_success:4,rare_find:5,luck:3}},

  healing_potion_small:{name:'Малое зелье лечения',type:'consumable',rarity:'common',description:'Восстанавливает часть здоровья героя.',lore:'Красный настой с горьким запахом трав.',bonuses:{heal:30},consumable:1},
  healing_potion_large:{name:'Большое зелье лечения',type:'consumable',rarity:'rare',description:'Восстанавливает много здоровья.',lore:'Рецепт хранится у алхимиков Старого города.',bonuses:{heal:75},consumable:1},
  rage_scroll:{name:'Свиток ярости',type:'consumable',rarity:'rare',description:'Временно усиливает урон в бою.',lore:'Буквы на нём невозможно читать спокойно.',bonuses:{world_boss_damage:10},consumable:1},
  defense_scroll:{name:'Свиток защиты',type:'consumable',rarity:'rare',description:'Создаёт кратковременный защитный барьер.',lore:'Чернила становятся серебряными перед ударом.',bonuses:{world_boss_resistance:10},consumable:1},
  alchemist_bomb:{name:'Алхимическая бомба',type:'consumable',rarity:'epic',description:'Наносит дополнительный урон мировому боссу.',lore:'Хрупкое стекло. Не трясти.',bonuses:{boss_flat_damage:120},consumable:1},
  lockpick_set:{name:'Набор отмычек',type:'utility',rarity:'common',description:'Помогает открыть запертые сундуки.',lore:'Тонкие инструменты неизвестного мастера.',bonuses:{rare_find:1},consumable:1},
  treasure_map:{name:'Карта сокровищ',type:'utility',rarity:'rare',description:'Повышает шанс найти редкую добычу.',lore:'Часть маршрута смыта морской водой.',bonuses:{rare_find:5},consumable:1},
  forest_herbs:{name:'Лесные травы',type:'material',rarity:'common',description:'Набор трав для будущей алхимии.',lore:'Собраны до восхода солнца.',bonuses:{}},
  iron_ore:{name:'Железная руда',type:'material',rarity:'common',description:'Материал для будущей кузницы.',lore:'Тяжёлая руда из Железных гор.',bonuses:{}},
  ancient_fragment:{name:'Древний фрагмент',type:'material',rarity:'rare',description:'Осколок неизвестного механизма.',lore:'На поверхности движутся едва заметные символы.',bonuses:{}},
  moon_dust:{name:'Лунная пыль',type:'material',rarity:'epic',description:'Редкий магический реагент.',lore:'Не падает на землю даже при сильном ветре.',bonuses:{}},
  void_crystal:{name:'Кристалл Пустоты',type:'material',rarity:'epic',description:'Материал, наполненный нестабильной энергией.',lore:'Если долго смотреть внутрь, он будто смотрит в ответ.',bonuses:{}},
  dragon_fang:{name:'Клык Древнего Дракона',type:'artifact',rarity:'mythic',description:'Постоянная реликвия невероятной силы.',lore:'Клык пережил хозяина и всё ещё хранит его ярость.',bonuses:{strength:8,world_boss_damage:8}},
  angel_wing:{name:'Перо Небесного Стража',type:'artifact',rarity:'mythic',description:'Редчайшая реликвия света.',lore:'Никогда не касается земли.',bonuses:{hp:25,defense:6,world_boss_resistance:8}},
});

const STARTER_BY_CLASS = Object.freeze({
  warrior:'rusty_blade', paladin:'rusty_blade', guardian:'rusty_blade', berserker:'iron_axe',
  ranger:'hunters_bow', assassin:'shadow_dagger', rogue:'hunters_bow', monk:'traveler_gloves',
  mage:'novice_staff', healer:'novice_staff', necromancer:'novice_staff', bard:'hunters_bow'
});

const EXPEDITION_LOOT = Object.freeze({
  1:['forest_herbs','iron_ore','healing_potion_small','lockpick_set','worn_boots','copper_ring','canvas_backpack'],
  2:['chainmail','iron_helm','duelist_gloves','mountain_boots','ring_strength','sun_amulet','explorers_pack','treasure_map','ancient_fragment'],
  3:['shadow_dagger','paladin_plate','seer_crown','rune_gauntlets','windstep_boots','ring_fortune','dragon_amulet','moon_dust','healing_potion_large'],
  4:['last_lord_blade','north_guardian_armor','king_signet','bottomless_satchel','rage_scroll','defense_scroll','alchemist_bomb'],
  5:['void_scepter','dragon_fang','angel_wing','bottomless_satchel','king_signet']
});

module.exports={ITEMS,RARITY_ORDER,RARITY_LABELS,SLOT_LABELS,TYPE_LABELS,STARTER_BY_CLASS,EXPEDITION_LOOT};
