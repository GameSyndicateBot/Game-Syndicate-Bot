'use strict';

const CLASSES = {
  warrior:{name:'Воин',role:'tank',cardId:2060,maxHp:180,damage:[28,36],miss:6,skill:{name:'Перехват',cost:40},ultimate:{name:'Несокрушимый удар',cost:100}},
  paladin:{name:'Паладин',role:'tank',cardId:2061,maxHp:170,damage:[24,32],miss:7,skill:{name:'Щит веры',cost:40},ultimate:{name:'Благословение света',cost:100}},
  guardian:{name:'Страж',role:'tank',cardId:2062,maxHp:200,damage:[22,30],miss:5,skill:{name:'Стальная защита',cost:40},ultimate:{name:'Провокация',cost:100}},
  cleric:{name:'Клирик',role:'healer',cardId:2063,maxHp:120,damage:[18,24],miss:6,skill:{name:'Передача жизни',cost:40},selfSkill:{name:'Малое исцеление',cost:20,heal:25},ultimate:{name:'Божественное исцеление',cost:100}},
  priest:{name:'Жрец',role:'healer',cardId:2064,maxHp:125,damage:[20,26],miss:6,skill:{name:'Молитва жизни',cost:40},ultimate:{name:'Воскрешение',cost:100}},
  bard:{name:'Бард',role:'healer',cardId:2065,maxHp:130,damage:[18,25],miss:7,skill:{name:'Воодушевление',cost:40},ultimate:{name:'Гимн героев',cost:100}},
  assassin:{name:'Ассасин',role:'dps',cardId:2066,maxHp:100,damage:[36,46],miss:15,skill:{name:'Удар из тени',cost:40},ultimate:{name:'Смертельный удар',cost:100}},
  archer:{name:'Лучник',role:'dps',cardId:2067,maxHp:110,damage:[35,48],miss:10,skill:{name:'3 удара',cost:40},ultimate:{name:'Дождь стрел',cost:100}},
  mage:{name:'Маг',role:'dps',cardId:2068,maxHp:95,damage:[40,55],miss:8,skill:{name:'Огненный шар',cost:40},ultimate:{name:'Метеор',cost:100}},
  berserker:{name:'Берсерк',role:'dps',cardId:2069,maxHp:150,damage:[38,48],miss:10,skill:{name:'Тройной удар',cost:40},ultimate:{name:'Кровавая ярость',cost:100}},
  engineer:{name:'Инженер',role:'support',cardId:2070,maxHp:125,damage:[30,40],miss:9,skill:{name:'Турель',cost:40},ultimate:{name:'Голем',cost:100}},
  necromancer:{name:'Некромант',role:'support',cardId:2071,maxHp:115,damage:[32,43],miss:10,skill:{name:'Скелет',cost:40},ultimate:{name:'Армия',cost:100}},
};

const MINIONS = {
  2045:{name:'Тень Бездны',maxHp:140,damage:[10,16],miss:20},
  2046:{name:'Искажённая Тень',maxHp:160,damage:[12,18],miss:18},
  2047:{name:'Паразит Бездны',maxHp:180,damage:[12,20],miss:18},
  2048:{name:'Сгусток Пустоты',maxHp:200,damage:[8,14],miss:15},
  2049:{name:'Хаосит',maxHp:170,damage:[14,22],miss:20},
  2050:{name:'Разломный Демон',maxHp:200,damage:[16,24],miss:15},
  2051:{name:'Автоматон',maxHp:240,damage:[14,20],miss:10},
  2052:{name:'Искра Бури',maxHp:150,damage:[12,18],miss:15},
  2053:{name:'Грозовой Элементаль',maxHp:210,damage:[16,24],miss:12},
  2054:{name:'Скелет-Воин',maxHp:200,damage:[16,22],miss:12},
  2055:{name:'Некромант-Призрак',maxHp:160,damage:[12,18],miss:16},
  2056:{name:'Ледяной Осколок',maxHp:150,damage:[10,16],miss:20},
  2057:{name:'Ледяной Голем',maxHp:230,damage:[14,20],miss:10},
  2058:{name:'Драконье Яйцо',maxHp:200,damage:[0,0],miss:0},
  2059:{name:'Дракончик',maxHp:180,damage:[18,26],miss:15},
};

const BOSSES = [
  {cardId:2037,name:'Теневой Страж',baseHp:1100,damage:[28,42],miss:12,minions:[2045,2046],summonEvery:3},
  {cardId:2038,name:'Пожиратель Пустоты',baseHp:1350,damage:[30,45],miss:12,minions:[2047,2048],summonEvery:3},
  {cardId:2039,name:'Архонт Хаоса',baseHp:1500,damage:[32,48],miss:12,minions:[2049,2050],summonEvery:3},
  {cardId:2040,name:'Железный Колосс',baseHp:1750,damage:[30,45],miss:12,minions:[2051],summonEvery:3},
  {cardId:2041,name:'Грозовой Тиран',baseHp:1600,damage:[30,44],miss:12,minions:[2052,2053],summonEvery:2},
  {cardId:2042,name:'Костяной Император',baseHp:1800,damage:[32,48],miss:12,minions:[2054,2055],summonEvery:3},
  {cardId:2043,name:'Ледяной Левиафан',baseHp:1900,damage:[35,50],miss:12,minions:[2056,2057],summonEvery:3},
  {cardId:2044,name:'Багровый Дракон',baseHp:2100,damage:[40,55],miss:12,minions:[2058,2059],summonEvery:3},
];

module.exports={CLASSES,MINIONS,BOSSES};
