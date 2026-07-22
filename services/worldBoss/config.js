'use strict';

const CLASSES = {
  warrior:{name:'Воин',role:'tank',resourceType:'rage',damageType:'physical',physicalResist:18,magicResist:-8,cardId:2060,maxHp:180,damage:[28,36],miss:6,skill:{name:'Перехват',cost:40},ultimate:{name:'Несокрушимый удар',cost:100}},
  paladin:{name:'Паладин',role:'tank',resourceType:'rage',damageType:'holy',physicalResist:12,magicResist:10,cardId:2061,maxHp:170,damage:[24,32],miss:7,skill:{name:'Щит веры',cost:40},ultimate:{name:'Благословение света',cost:100}},
  guardian:{name:'Страж',role:'tank',resourceType:'rage',damageType:'physical',physicalResist:25,magicResist:-12,cardId:2062,maxHp:200,damage:[22,30],miss:5,skill:{name:'Стальная защита',cost:40},ultimate:{name:'Провокация',cost:100}},
  cleric:{name:'Клирик',role:'healer',resourceType:'energy',damageType:'holy',physicalResist:-12,magicResist:12,cardId:2063,maxHp:120,damage:[18,24],miss:6,skill:{name:'Передача жизни',cost:40},ultimate:{name:'Божественное исцеление',cost:100}},
  priest:{name:'Жрец',role:'healer',resourceType:'mana',damageType:'holy',physicalResist:-15,magicResist:15,cardId:2064,maxHp:125,damage:[20,26],miss:6,skill:{name:'Молитва жизни',cost:40},ultimate:{name:'Воскрешение',cost:100}},
  bard:{name:'Бард',role:'healer',resourceType:'mana',damageType:'magic',physicalResist:-8,magicResist:8,cardId:2065,maxHp:130,damage:[18,25],miss:7,skill:{name:'Воодушевление',cost:40},ultimate:{name:'Гимн героев',cost:100}},
  assassin:{name:'Ассасин',role:'dps',resourceType:'energy',damageType:'physical',physicalResist:3,magicResist:-5,cardId:2066,maxHp:100,damage:[36,46],miss:15,skill:{name:'Удар из тени',cost:40},ultimate:{name:'Смертельный удар',cost:100}},
  archer:{name:'Лучник',role:'dps',resourceType:'energy',damageType:'physical',physicalResist:5,magicResist:-6,cardId:2067,maxHp:110,damage:[35,48],miss:10,skill:{name:'3 удара',cost:40},ultimate:{name:'Дождь стрел',cost:100}},
  mage:{name:'Маг',role:'dps',resourceType:'mana',damageType:'magic',physicalResist:-18,magicResist:20,cardId:2068,maxHp:95,damage:[25,38],miss:8,skill:{name:'Огненный шар',cost:40},ultimate:{name:'Метеор',cost:100}},
  berserker:{name:'Берсерк',role:'dps',resourceType:'energy',damageType:'physical',physicalResist:8,magicResist:-10,cardId:2069,maxHp:150,damage:[38,48],miss:10,skill:{name:'Тройной удар',cost:40},ultimate:{name:'Кровавая ярость',cost:100}},
  engineer:{name:'Инженер',role:'support',resourceType:'energy',damageType:'physical',physicalResist:10,magicResist:-5,cardId:2070,maxHp:125,damage:[30,40],miss:9,skill:{name:'Турель',cost:40},ultimate:{name:'Голем',cost:100}},
  necromancer:{name:'Некромант',role:'support',resourceType:'mana',damageType:'magic',physicalResist:-10,magicResist:18,cardId:2071,maxHp:115,damage:[32,43],miss:10,skill:{name:'Скелет',cost:40},ultimate:{name:'Армия',cost:100}},
};

const MINIONS = {
  2045:{damageType:'magic',name:'Тень Бездны',dark:true,physicalResist:10,magicResist:0,maxHp:140,damage:[10,16],miss:20},
  2046:{damageType:'magic',name:'Искажённая Тень',dark:true,physicalResist:12,magicResist:4,maxHp:160,damage:[12,18],miss:18},
  2047:{damageType:'physical',name:'Паразит Бездны',maxHp:180,damage:[12,20],miss:18},
  2048:{damageType:'magic',name:'Сгусток Пустоты',maxHp:200,damage:[8,14],miss:15},
  2049:{damageType:'physical',name:'Хаосит',maxHp:170,damage:[14,22],miss:20},
  2050:{damageType:'magic',name:'Разломный Демон',maxHp:200,damage:[16,24],miss:15},
  2051:{damageType:'physical',name:'Автоматон',physicalResist:25,magicResist:-10,maxHp:240,damage:[14,20],miss:10},
  2052:{damageType:'magic',name:'Искра Бури',maxHp:150,damage:[12,18],miss:15},
  2053:{damageType:'magic',name:'Грозовой Элементаль',maxHp:210,damage:[16,24],miss:12},
  2054:{damageType:'physical',name:'Скелет-Воин',undead:true,dark:true,physicalResist:18,magicResist:0,maxHp:200,damage:[16,22],miss:12},
  2055:{damageType:'magic',name:'Некромант-Призрак',undead:true,dark:true,physicalResist:5,magicResist:15,maxHp:160,damage:[12,18],miss:16},
  2056:{damageType:'magic',name:'Ледяной Осколок',maxHp:150,damage:[10,16],miss:20},
  2057:{damageType:'physical',name:'Ледяной Голем',maxHp:230,damage:[14,20],miss:10},
  2058:{damageType:'magic',name:'Драконье Яйцо',maxHp:200,damage:[0,0],miss:0},
  2059:{damageType:'physical',name:'Дракончик',maxHp:180,damage:[18,26],miss:15},
};

const BOSSES = [
  {cardId:2037,attackTypes:[['physical',45],['magic',55]],name:'Теневой Страж',baseHp:1100,damage:[28,42],miss:7,physicalResist:18,magicResist:5,dark:true,minions:[2045,2046],summonEvery:3},
  {cardId:2038,attackTypes:[['physical',25],['magic',75]],name:'Пожиратель Пустоты',baseHp:1350,damage:[30,45],miss:7,physicalResist:8,magicResist:22,dark:true,minions:[2047,2048],summonEvery:3},
  {cardId:2039,attackTypes:[['physical',50],['magic',50]],name:'Архонт Хаоса',baseHp:1500,damage:[32,48],miss:7,physicalResist:12,magicResist:18,dark:true,minions:[2049,2050],summonEvery:3},
  {cardId:2040,attackTypes:[['physical',85],['magic',15]],name:'Железный Колосс',baseHp:1750,damage:[30,45],miss:6,physicalResist:28,magicResist:-8,minions:[2051],summonEvery:3},
  {cardId:2041,attackTypes:[['physical',20],['magic',80]],name:'Грозовой Тиран',baseHp:1600,damage:[30,44],miss:7,physicalResist:5,magicResist:25,minions:[2052,2053],summonEvery:2},
  {cardId:2042,attackTypes:[['physical',65],['magic',35]],name:'Костяной Император',baseHp:1800,damage:[32,48],miss:7,physicalResist:22,magicResist:8,undead:true,dark:true,minions:[2054,2055],summonEvery:3},
  {cardId:2043,attackTypes:[['physical',40],['magic',60]],name:'Ледяной Левиафан',baseHp:1900,damage:[35,50],miss:7,physicalResist:15,magicResist:20,minions:[2056,2057],summonEvery:3},
  {cardId:2044,attackTypes:[['physical',60],['magic',40]],name:'Багровый Дракон',baseHp:2100,damage:[40,55],miss:6,physicalResist:20,magicResist:15,minions:[2058,2059],summonEvery:3},
];

module.exports={CLASSES,MINIONS,BOSSES};
