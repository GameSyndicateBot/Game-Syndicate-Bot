const REGION_MINIBOSSES = Object.freeze({
  forest: {
    key:'alpha_wolf', region:'forest', icon:'🐺', name:'Альфа-волк', title:'Хозяин древней стаи',
    encounterChance:0.025, power:72, hp:260, attack:30,
    loot:[
      { key:'alpha_fang', chance:0.90, min:1, max:2 },
      { key:'alpha_hide', chance:0.65, min:1, max:1 },
      { key:'alpha_blood', chance:0.16, min:1, max:1 },
      { key:'ancient_alpha_fang', chance:0.025, min:1, max:1 },
    ],
    regionBuff:{ key:'incident', value:-0.08, hours:6, description:'🐺 Стая рассеяна: риск происшествий −8% на 6 часов.' },
  },
  mountain: {
    key:'stone_troll', region:'mountain', icon:'🗿', name:'Каменный тролль', title:'Страж горного перевала',
    encounterChance:0.022, power:88, hp:330, attack:36,
    loot:[
      { key:'troll_stone', chance:0.90, min:1, max:3 },
      { key:'troll_hide', chance:0.60, min:1, max:1 },
      { key:'troll_core', chance:0.14, min:1, max:1 },
      { key:'ancient_troll_rune', chance:0.02, min:1, max:1 },
    ],
    regionBuff:{ key:'materials', value:1.12, hours:6, description:'⛏️ Перевал очищен: добыча материалов +12% на 6 часов.' },
  },
  water: {
    key:'marsh_hydra', region:'water', icon:'🐍', name:'Болотная гидра', title:'Пожиратель затопленных дорог',
    encounterChance:0.021, power:94, hp:360, attack:38,
    loot:[
      { key:'hydra_scale', chance:0.88, min:1, max:2 },
      { key:'hydra_venom', chance:0.58, min:1, max:2 },
      { key:'hydra_heart', chance:0.13, min:1, max:1 },
      { key:'ancient_hydra_eye', chance:0.018, min:1, max:1 },
    ],
    regionBuff:{ key:'rare', value:6, hours:6, description:'🐍 Топи успокоились: шанс редкой находки +6% на 6 часов.' },
  },
  desert: {
    key:'scorpion_king', region:'desert', icon:'🦂', name:'Король Скорпионов', title:'Повелитель пепельных дюн',
    encounterChance:0.020, power:108, hp:410, attack:43,
    loot:[
      { key:'royal_stinger', chance:0.88, min:1, max:2 },
      { key:'scorpion_carapace', chance:0.62, min:1, max:2 },
      { key:'scorpion_venom', chance:0.14, min:1, max:1 },
      { key:'sun_scorpio_gem', chance:0.018, min:1, max:1 },
    ],
    regionBuff:{ key:'success', value:5, hours:6, description:'🦂 Караванные пути свободны: шанс успеха +5% на 6 часов.' },
  },
  ruins: {
    key:'tomb_guardian', region:'ruins', icon:'☠️', name:'Страж Гробницы', title:'Проклятый хранитель реликвий',
    encounterChance:0.019, power:116, hp:450, attack:46,
    loot:[
      { key:'guardian_bone', chance:0.90, min:1, max:2 },
      { key:'tomb_rune', chance:0.60, min:1, max:1 },
      { key:'guardian_soul', chance:0.12, min:1, max:1 },
      { key:'royal_funeral_seal', chance:0.015, min:1, max:1 },
    ],
    regionBuff:{ key:'rare', value:8, hours:6, description:'🏺 Печать ослабла: шанс редкой находки +8% на 6 часов.' },
  },
  ice: {
    key:'frost_bear', region:'ice', icon:'🐻‍❄️', name:'Ледяной Медведь', title:'Белый ужас ледяных пустошей',
    encounterChance:0.018, power:126, hp:500, attack:50,
    loot:[
      { key:'frost_fur', chance:0.90, min:1, max:2 },
      { key:'ice_claw', chance:0.62, min:1, max:2 },
      { key:'frozen_heart', chance:0.11, min:1, max:1 },
      { key:'eternal_ice_eye', chance:0.014, min:1, max:1 },
    ],
    regionBuff:{ key:'xp', value:1.10, hours:6, description:'❄️ Охотники вдохновлены: опыт экспедиций +10% на 6 часов.' },
  },
  volcano: {
    key:'fire_golem', region:'volcano', icon:'🔥', name:'Огненный Голем', title:'Живое сердце вулкана',
    encounterChance:0.017, power:138, hp:560, attack:55,
    loot:[
      { key:'golem_obsidian', chance:0.92, min:1, max:3 },
      { key:'molten_core', chance:0.58, min:1, max:1 },
      { key:'golem_heart', chance:0.10, min:1, max:1 },
      { key:'titan_ember', chance:0.012, min:1, max:1 },
    ],
    regionBuff:{ key:'materials', value:1.20, hours:6, description:'🔥 Лавовые жилы открыты: добыча материалов +20% на 6 часов.' },
  },
});

module.exports = { REGION_MINIBOSSES };
