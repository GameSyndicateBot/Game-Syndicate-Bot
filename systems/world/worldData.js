const WORLD_REGIONS = Object.freeze({
  forest: { key:'forest', icon:'🌲', name:'Древний лес', danger:2, description:'Леса, старые дороги, звери и разбойничьи лагеря.', resources:['Древесина','Травы','Ягоды'], unlockStage:1 },
  mountain: { key:'mountain', icon:'🏔️', name:'Железные горы', danger:3, description:'Перевалы, шахты и древние каменные святилища.', resources:['Железо','Камень','Кристаллы'], unlockStage:1 },
  water: { key:'water', icon:'🌊', name:'Затопленные земли', danger:3, description:'Болота, затонувшие храмы и опасные водные твари.', resources:['Травы','Жемчуг','Грибы'], unlockStage:1 },
  desert: { key:'desert', icon:'🏜️', name:'Пепельная пустыня', danger:4, description:'Караваны, песчаные бури и погребённые храмы.', resources:['Пепел','Кожа','Редкая руда'], unlockStage:1 },
  ruins: { key:'ruins', icon:'🏰', name:'Затонувшие руины', danger:4, description:'Проклятые коридоры, механизмы и древние сокровища.', resources:['Реликвии','Кристаллы','Свитки'], unlockStage:1 },
  ice: { key:'ice', icon:'❄️', name:'Ледяные пустоши', danger:5, description:'Мороз, древние пещеры и ледяные чудовища.', resources:['Ледяной кристалл','Мех','Морозная руда'], unlockStage:1 },
  volcano: { key:'volcano', icon:'🌋', name:'Огненный вулкан', danger:5, description:'Лава, саламандры и кузницы титанов.', resources:['Обсидиан','Огненная руда','Сера'], unlockStage:1 },
  void: { key:'void', icon:'⚫', name:'Бездна', danger:5, description:'Неизведанная область за границей первого континента.', resources:['Неизвестно'], unlockStage:5 },
});
const WORLD_EVENTS = Object.freeze({
  calm: { key:'calm', icon:'🌤️', name:'Спокойный день', description:'Регион живёт обычной жизнью.', danger:0, reputation:1 },
  rain: { key:'rain', icon:'🌧️', name:'После дождя', description:'Ресурсов стало больше, но дороги опаснее.', danger:0, reputation:1 },
  bandits: { key:'bandits', icon:'☠️', name:'Разбойничьи засады', description:'Засады случаются чаще. За успешные походы дают больше репутации.', danger:1, reputation:2 },
  caravan: { key:'caravan', icon:'🛒', name:'Странствующий караван', description:'В регион прибыл временный торговец.', danger:0, reputation:1 },
  arcane_storm: { key:'arcane_storm', icon:'🔮', name:'Магический шторм', description:'Мир нестабилен, но награды экспедиций ценнее.', danger:1, reputation:2 },
  invasion: { key:'invasion', icon:'⚔️', name:'Вторжение', description:'Регион атакован. Любая успешная экспедиция помогает обороне.', danger:2, reputation:3 },
});
const CONTRACT_TEMPLATES = Object.freeze([
  { type:'expeditions', icon:'🗺️', title:'Исследовать регион', targets:[12,18,25], reward:'Опыт экспедиций +10% на 24 часа' },
  { type:'successes', icon:'⚔️', title:'Очистить опасные маршруты', targets:[8,12,16], reward:'Опасность региона временно снижена' },
  { type:'materials', icon:'🌿', title:'Собрать припасы', targets:[35,55,80], reward:'Добыча материалов +15% на 24 часа' },
  { type:'reputation', icon:'🏅', title:'Укрепить влияние Гильдии', targets:[40,65,90], reward:'В регион прибывает особый NPC' },
]);
module.exports = { WORLD_REGIONS, WORLD_EVENTS, CONTRACT_TEMPLATES };
