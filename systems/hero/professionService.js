const { db } = require('../../database/db');
const { grantItem } = require('./itemService');

const BASE_ENERGY_MAX = 100;
const BASE_ENERGY_COST = 20;
const ENERGY_REGEN_PER_HOUR = 5;
const LEVEL_CAP = 50;

const PROFESSIONS = Object.freeze({
  herbalist: { name: 'Травник', icon: '🌿', description: 'Собирает алхимические растения, пряные травы и редкие цветы.' },
  miner: { name: 'Горняк', icon: '⛏️', description: 'Добывает руду, самоцветы и кристаллы для кузнеца и алхимика.' },
  lumberjack: { name: 'Лесник', icon: '🪓', description: 'Заготавливает древесину, грибы, орехи и лесные ягоды.' },
  fisher: { name: 'Рыбак', icon: '🎣', description: 'Ловит обычную и редкую рыбу, морепродукты и жемчуг.' },
  hunter: { name: 'Охотник', icon: '🏹', description: 'Добывает мясо, кожу, кости, перья и редкие части зверей.' },
});

const SPECIALIZATIONS = Object.freeze({
  herbalist: {
    healer: { name:'Целитель', icon:'🌱', description:'Повышенный шанс лечебных и редких растений.' },
    toxicologist: { name:'Токсиколог', icon:'☠️', description:'Лучше находит опасные и необычные ингредиенты.' },
    mycologist: { name:'Грибник', icon:'🍄', description:'Специалист по редким грибам и лесным компонентам.' },
  },
  miner: {
    jeweler: { name:'Ювелир', icon:'💎', description:'Повышенный шанс самоцветов и кристаллов.' },
    ore_master: { name:'Рудокоп', icon:'⚙️', description:'Добывает больше основной руды.' },
    antiquarian: { name:'Искатель древностей', icon:'🏺', description:'Ищет древние фрагменты и редкие металлы.' },
  },
  lumberjack: {
    woodcutter: { name:'Дровосек', icon:'🌳', description:'Получает больше древесины.' },
    tracker: { name:'Следопыт', icon:'🍄', description:'Чаще находит грибы, ягоды и орехи.' },
    gatherer: { name:'Собиратель', icon:'🌿', description:'Повышенный шанс редких лесных ресурсов.' },
  },
  fisher: {
    river: { name:'Речник', icon:'🐟', description:'Получает больше обычной и редкой речной рыбы.' },
    sailor: { name:'Моряк', icon:'🌊', description:'Чаще находит морепродукты и жемчуг.' },
    legendary: { name:'Легендарный рыболов', icon:'🦈', description:'Лучший шанс крайне редкого улова.' },
  },
  hunter: {
    tracker: { name:'Следопыт', icon:'🦌', description:'Получает больше мяса и обычной добычи.' },
    skinner: { name:'Скорняк', icon:'🛡️', description:'Чаще добывает кожу и мех.' },
    trophy: { name:'Добытчик трофеев', icon:'🦴', description:'Повышенный шанс костей и редких частей зверей.' },
  },
});

const WORK_TABLES = Object.freeze({
  herbalist: [
    { key:'forest_herbs', min:2, max:4, chance:1, tier:'common' },
    { key:'culinary_herbs', min:1, max:3, chance:.72, tier:'uncommon' },
    { key:'moon_blossom', min:1, max:1, chance:.12, tier:'rare' },
  ],
  miner: [
    { key:'iron_ore', min:2, max:4, chance:1, tier:'common' },
    { key:'gemstone', min:1, max:2, chance:.42, tier:'uncommon' },
    { key:'ancient_fragment', min:1, max:1, chance:.10, tier:'rare' },
  ],
  lumberjack: [
    { key:'hardwood', min:2, max:4, chance:1, tier:'common' },
    { key:'wild_berries', min:1, max:3, chance:.70, tier:'uncommon' },
    { key:'forest_mushrooms', min:1, max:2, chance:.42, tier:'uncommon' },
    { key:'ancient_wood', min:1, max:1, chance:.10, tier:'rare' },
  ],
  fisher: [
    { key:'fresh_fish', min:2, max:4, chance:1, tier:'common' },
    { key:'shellfish', min:1, max:2, chance:.48, tier:'uncommon' },
    { key:'moon_carp', min:1, max:1, chance:.09, tier:'rare' },
    { key:'pearl', min:1, max:1, chance:.06, tier:'rare' },
  ],
  hunter: [
    { key:'raw_meat', min:2, max:4, chance:1, tier:'common' },
    { key:'beast_hide', min:1, max:2, chance:.62, tier:'uncommon' },
    { key:'beast_bone', min:1, max:2, chance:.38, tier:'uncommon' },
    { key:'beast_heart', min:1, max:1, chance:.08, tier:'rare' },
  ],
});

db.exec(`
CREATE TABLE IF NOT EXISTS hero_professions (
  user_id TEXT PRIMARY KEY,
  profession_key TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  work_count INTEGER NOT NULL DEFAULT 0,
  last_work_at TEXT,
  energy INTEGER NOT NULL DEFAULT 100,
  energy_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  specialization_key TEXT,
  resources_gathered INTEGER NOT NULL DEFAULT 0,
  orders_completed INTEGER NOT NULL DEFAULT 0,
  dust_earned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hero_professions_rank ON hero_professions(profession_key, level DESC, xp DESC, work_count DESC);
`);

function ensureColumn(name, definition) {
  const cols = db.prepare('PRAGMA table_info(hero_professions)').all().map(r => r.name);
  if (!cols.includes(name)) db.exec(`ALTER TABLE hero_professions ADD COLUMN ${name} ${definition}`);
}
ensureColumn('energy', 'INTEGER NOT NULL DEFAULT 100');
ensureColumn('energy_updated_at', 'TEXT');
ensureColumn('specialization_key', 'TEXT');
ensureColumn('resources_gathered', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('orders_completed', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('dust_earned', 'INTEGER NOT NULL DEFAULT 0');
db.prepare("UPDATE hero_professions SET energy_updated_at=COALESCE(energy_updated_at,updated_at,created_at,CURRENT_TIMESTAMP)").run();

function xpNeeded(level) { return Math.floor(80 + Math.max(0, Number(level) - 1) * 45 + Math.pow(Math.max(0, Number(level)-1), 1.35) * 4); }
function energyMaxForLevel(level) { return BASE_ENERGY_MAX + Math.floor(Math.max(0, Number(level)-1) / 5) * 5; }
function energyCostForLevel(level) { return Number(level) >= 40 ? 17 : Number(level) >= 20 ? 19 : BASE_ENERGY_COST; }
function rareBonusForLevel(level) { return Math.floor(Math.max(0, Number(level)) / 10) * 0.025; }
function quantityBonusForLevel(level) { return Math.floor(Math.max(0, Number(level)) / 15); }
function randomInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function parseUtc(value){ if(!value) return Date.now(); const s=String(value); return new Date(s.endsWith('Z')?s:`${s}Z`).getTime(); }

function energyState(row) {
  if (!row) return null;
  const max = energyMaxForLevel(row.level);
  const elapsedHours = Math.max(0, (Date.now() - parseUtc(row.energy_updated_at)) / 3600000);
  const regenerated = Math.floor(elapsedHours * ENERGY_REGEN_PER_HOUR);
  const energy = Math.min(max, Math.max(0, Number(row.energy) || 0) + regenerated);
  const usedHours = regenerated / ENERGY_REGEN_PER_HOUR;
  const timestamp = regenerated > 0 ? new Date(parseUtc(row.energy_updated_at) + usedHours * 3600000) : new Date(parseUtc(row.energy_updated_at));
  return { energy, max, updatedAt: timestamp, regenerated };
}
function getProfessionRaw(userId){ return db.prepare('SELECT * FROM hero_professions WHERE user_id=?').get(userId)||null; }
function syncEnergy(userId, row=getProfessionRaw(userId)) {
  if (!row) return null;
  const state=energyState(row);
  if(state.regenerated>0 || Number(row.energy)>state.max){
    db.prepare('UPDATE hero_professions SET energy=?,energy_updated_at=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
      .run(state.energy,state.updatedAt.toISOString().replace('T',' ').replace('Z',''),userId);
  }
  return {...row,energy:state.energy,energy_max:state.max,energy_updated_at:state.updatedAt.toISOString()};
}
function getProfession(userId){ return syncEnergy(userId); }
function chooseProfession(userId,key){
  if(!PROFESSIONS[key]) return {ok:false,reason:'invalid'};
  const current=getProfession(userId); if(current) return {ok:false,reason:'already',current};
  db.prepare('INSERT INTO hero_professions(user_id,profession_key,energy,energy_updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)').run(userId,key,BASE_ENERGY_MAX);
  return {ok:true,row:getProfession(userId)};
}
function levelFromXp(level,xp){
  let l=Number(level)||1,x=Number(xp)||0,gained=0;
  while(x>=xpNeeded(l)&&l<LEVEL_CAP){x-=xpNeeded(l);l++;gained++;}
  if(l>=LEVEL_CAP) x=Math.min(x,xpNeeded(LEVEL_CAP));
  return {level:l,xp:x,gained};
}
function addProfessionXp(userId, amount, stats={}) {
  const row=getProfessionRaw(userId);
  if(!row) return {ok:false,reason:'missing'};
  const next=levelFromXp(row.level,Number(row.xp)+Math.max(0,Number(amount)||0));
  db.prepare(`UPDATE hero_professions SET level=?,xp=?,
    resources_gathered=resources_gathered+?,
    orders_completed=orders_completed+?,
    dust_earned=dust_earned+?,
    updated_at=CURRENT_TIMESTAMP WHERE user_id=?`)
    .run(next.level,next.xp,Number(stats.resources)||0,Number(stats.orders)||0,Number(stats.dust)||0,userId);
  return {ok:true,...next,row:getProfession(userId)};
}
function msUntilEnergy(row, amount=energyCostForLevel(row?.level||1)){
  const missing=Math.max(0,amount-Number(row?.energy||0));
  return Math.ceil((missing/ENERGY_REGEN_PER_HOUR)*3600000);
}
function specializationBonus(row, drop) {
  const s=row.specialization_key;
  if(!s) return {chance:0,quantity:0};
  if(row.profession_key==='herbalist') {
    if(s==='healer' && drop.key==='forest_herbs') return {chance:.12,quantity:1};
    if(s==='toxicologist' && drop.tier==='rare') return {chance:.08,quantity:0};
    if(s==='mycologist' && drop.key==='forest_mushrooms') return {chance:.25,quantity:1};
  }
  if(row.profession_key==='miner') {
    if(s==='jeweler' && drop.key==='gemstone') return {chance:.18,quantity:1};
    if(s==='ore_master' && drop.key==='iron_ore') return {chance:0,quantity:2};
    if(s==='antiquarian' && drop.tier==='rare') return {chance:.09,quantity:0};
  }
  if(row.profession_key==='lumberjack') {
    if(s==='woodcutter' && drop.key==='hardwood') return {chance:0,quantity:2};
    if(s==='tracker' && ['wild_berries','forest_mushrooms'].includes(drop.key)) return {chance:.15,quantity:1};
    if(s==='gatherer' && drop.tier==='rare') return {chance:.09,quantity:0};
  }
  if(row.profession_key==='fisher') {
    if(s==='river' && ['fresh_fish','moon_carp'].includes(drop.key)) return {chance:.12,quantity:1};
    if(s==='sailor' && ['shellfish','pearl'].includes(drop.key)) return {chance:.14,quantity:0};
    if(s==='legendary' && drop.tier==='rare') return {chance:.12,quantity:0};
  }
  if(row.profession_key==='hunter') {
    if(s==='tracker' && drop.key==='raw_meat') return {chance:0,quantity:2};
    if(s==='skinner' && drop.key==='beast_hide') return {chance:.18,quantity:1};
    if(s==='trophy' && ['beast_bone','beast_heart'].includes(drop.key)) return {chance:.12,quantity:0};
  }
  return {chance:0,quantity:0};
}
function work(userId){
  const row=getProfession(userId); if(!row)return {ok:false,reason:'missing'};
  const cost=energyCostForLevel(row.level);
  if(row.energy<cost)return {ok:false,reason:'energy',energy:row.energy,maxEnergy:row.energy_max,waitMs:msUntilEnergy(row,cost)};
  const rewards=[];
  const rareBonus=rareBonusForLevel(row.level);
  const qtyBonus=quantityBonusForLevel(row.level);
  for(const drop of WORK_TABLES[row.profession_key]||[]){
    const spec=specializationBonus(row,drop);
    const chance=Math.min(1,drop.chance+(drop.tier==='rare'?rareBonus:rareBonus/3)+spec.chance);
    if(Math.random()<=chance){
      const q=randomInt(drop.min,drop.max)+(drop.tier==='common'?qtyBonus:0)+spec.quantity;
      grantItem(userId,drop.key,q,'profession');
      rewards.push([drop.key,q]);
    }
  }
  const totalResources=rewards.reduce((s,[,q])=>s+q,0);
  const now=new Date().toISOString().replace('T',' ').replace('Z','');
  db.prepare('UPDATE hero_professions SET energy=?,energy_updated_at=?,work_count=work_count+1,last_work_at=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
    .run(row.energy-cost,now,now,userId);
  const progress=addProfessionXp(userId,35,{resources:totalResources});
  return {ok:true,rewards,energy:Math.min(progress.row.energy,energyMaxForLevel(progress.level)),maxEnergy:energyMaxForLevel(progress.level),cost,level:progress.level,xp:progress.xp,leveled:progress.gained>0,gained:progress.gained};
}
function chooseSpecialization(userId,key){
  const row=getProfession(userId); if(!row)return {ok:false,reason:'missing'};
  if(row.level<LEVEL_CAP)return {ok:false,reason:'level'};
  if(row.specialization_key)return {ok:false,reason:'already',current:row.specialization_key};
  if(!SPECIALIZATIONS[row.profession_key]?.[key])return {ok:false,reason:'invalid'};
  db.prepare('UPDATE hero_professions SET specialization_key=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(key,userId);
  return {ok:true,row:getProfession(userId)};
}
function getProfessionCounts(){
  const rows=db.prepare('SELECT profession_key,COUNT(*) count FROM hero_professions GROUP BY profession_key').all();
  return Object.fromEntries(rows.map(r=>[r.profession_key,Number(r.count)]));
}
function listProfessionMembers(key,limit=25){
  return db.prepare(`SELECT hp.*,h.name hero_name,h.level hero_level,h.class_key
    FROM hero_professions hp LEFT JOIN heroes h ON h.user_id=hp.user_id
    WHERE hp.profession_key=? ORDER BY hp.level DESC,hp.xp DESC,hp.work_count DESC LIMIT ?`).all(key,limit);
}
function getProfessionLeaders(key,limit=5){ return listProfessionMembers(key,limit); }
function getAllProfessionLeaders(limit=5){
  return Object.fromEntries(Object.keys(PROFESSIONS).map(k=>[k,getProfessionLeaders(k,limit)]));
}
function getMilestones(level){
  const out=[];
  for(let l=5;l<=LEVEL_CAP;l+=5){
    if(l>level) {
      if(l===20) out.push({level:l,text:'Стоимость работы снижается до 19 энергии'});
      else if(l===40) out.push({level:l,text:'Стоимость работы снижается до 17 энергии'});
      else if(l===50) out.push({level:l,text:'Открывается мастерство и специализация'});
      else out.push({level:l,text:`Максимальная энергия +5${l%10===0?' и повышается шанс редкой добычи':''}`});
      break;
    }
  }
  return out[0]||null;
}

module.exports={
  PROFESSIONS,SPECIALIZATIONS,WORK_TABLES,BASE_ENERGY_MAX,BASE_ENERGY_COST,ENERGY_REGEN_PER_HOUR,LEVEL_CAP,
  xpNeeded,energyMaxForLevel,energyCostForLevel,rareBonusForLevel,getProfession,chooseProfession,work,
  chooseSpecialization,addProfessionXp,getProfessionCounts,listProfessionMembers,getProfessionLeaders,
  getAllProfessionLeaders,getMilestones
};
