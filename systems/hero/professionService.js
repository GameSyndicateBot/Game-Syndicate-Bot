const { db } = require('../../database/db');
const { grantItem } = require('./itemService');

const ENERGY_MAX = 100;
const ENERGY_COST = 20;
const ENERGY_REGEN_PER_HOUR = 5;
const LEVEL_CAP = 20;

const PROFESSIONS = Object.freeze({
  herbalist: { name: 'Травник', icon: '🌿', description: 'Собирает алхимические растения, пряные травы и редкие цветы.' },
  miner: { name: 'Горняк', icon: '⛏️', description: 'Добывает руду, самоцветы и кристаллы для кузнеца и алхимика.' },
  lumberjack: { name: 'Лесник', icon: '🪓', description: 'Заготавливает древесину, смолу, грибы, орехи и лесные ягоды.' },
  fisher: { name: 'Рыбак', icon: '🎣', description: 'Ловит обычную и редкую рыбу, морепродукты и жемчуг.' },
  hunter: { name: 'Охотник', icon: '🏹', description: 'Добывает мясо, кожу, кости, перья и редкие части зверей.' },
});

const WORK_TABLES = Object.freeze({
  herbalist: [
    { key:'forest_herbs', min:2, max:4, chance:1 },
    { key:'culinary_herbs', min:1, max:3, chance:.72 },
    { key:'moon_blossom', min:1, max:1, chance:.12 },
  ],
  miner: [
    { key:'iron_ore', min:2, max:4, chance:1 },
    { key:'gemstone', min:1, max:2, chance:.42 },
    { key:'ancient_fragment', min:1, max:1, chance:.10 },
  ],
  lumberjack: [
    { key:'hardwood', min:2, max:4, chance:1 },
    { key:'wild_berries', min:1, max:3, chance:.70 },
    { key:'forest_mushrooms', min:1, max:2, chance:.42 },
    { key:'ancient_wood', min:1, max:1, chance:.10 },
  ],
  fisher: [
    { key:'fresh_fish', min:2, max:4, chance:1 },
    { key:'shellfish', min:1, max:2, chance:.48 },
    { key:'moon_carp', min:1, max:1, chance:.09 },
    { key:'pearl', min:1, max:1, chance:.06 },
  ],
  hunter: [
    { key:'raw_meat', min:2, max:4, chance:1 },
    { key:'beast_hide', min:1, max:2, chance:.62 },
    { key:'beast_bone', min:1, max:2, chance:.38 },
    { key:'beast_heart', min:1, max:1, chance:.08 },
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function ensureColumn(name, definition) {
  const cols = db.prepare('PRAGMA table_info(hero_professions)').all().map(r => r.name);
  if (!cols.includes(name)) db.exec(`ALTER TABLE hero_professions ADD COLUMN ${name} ${definition}`);
}
ensureColumn('energy', 'INTEGER NOT NULL DEFAULT 100');
ensureColumn('energy_updated_at', 'TEXT');
db.prepare("UPDATE hero_professions SET energy_updated_at=COALESCE(energy_updated_at,updated_at,created_at,CURRENT_TIMESTAMP)").run();

function xpNeeded(level) { return 80 + Math.max(0, Number(level) - 1) * 40; }
function randomInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function parseUtc(value){ if(!value) return Date.now(); const s=String(value); return new Date(s.endsWith('Z')?s:`${s}Z`).getTime(); }
function energyState(row) {
  if (!row) return null;
  const elapsedHours = Math.max(0, (Date.now() - parseUtc(row.energy_updated_at)) / 3600000);
  const regenerated = Math.floor(elapsedHours * ENERGY_REGEN_PER_HOUR);
  const energy = Math.min(ENERGY_MAX, Math.max(0, Number(row.energy) || 0) + regenerated);
  const usedHours = regenerated / ENERGY_REGEN_PER_HOUR;
  const timestamp = regenerated > 0 ? new Date(parseUtc(row.energy_updated_at) + usedHours * 3600000) : new Date(parseUtc(row.energy_updated_at));
  return { energy, updatedAt: timestamp, regenerated };
}
function syncEnergy(userId, row=getProfessionRaw(userId)) {
  if (!row) return null;
  const state=energyState(row);
  if(state.regenerated>0){
    db.prepare('UPDATE hero_professions SET energy=?,energy_updated_at=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
      .run(state.energy,state.updatedAt.toISOString().replace('T',' ').replace('Z',''),userId);
  }
  return {...row,energy:state.energy,energy_updated_at:state.updatedAt.toISOString()};
}
function getProfessionRaw(userId){ return db.prepare('SELECT * FROM hero_professions WHERE user_id=?').get(userId)||null; }
function getProfession(userId){ return syncEnergy(userId); }
function chooseProfession(userId,key){
  if(!PROFESSIONS[key]) return {ok:false,reason:'invalid'};
  const current=getProfession(userId); if(current) return {ok:false,reason:'already',current};
  db.prepare('INSERT INTO hero_professions(user_id,profession_key,energy,energy_updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)').run(userId,key,ENERGY_MAX);
  return {ok:true,row:getProfession(userId)};
}
function levelFromXp(level,xp){ let l=Number(level)||1,x=Number(xp)||0,gained=0; while(x>=xpNeeded(l)&&l<LEVEL_CAP){x-=xpNeeded(l);l++;gained++;} return {level:l,xp:x,gained}; }
function msUntilEnergy(row, amount=ENERGY_COST){
  const missing=Math.max(0,amount-Number(row?.energy||0));
  return Math.ceil((missing/ENERGY_REGEN_PER_HOUR)*3600000);
}
function work(userId){
  const row=getProfession(userId); if(!row) return {ok:false,reason:'none'};
  if(Number(row.energy)<ENERGY_COST) return {ok:false,reason:'energy',energy:Number(row.energy),waitMs:msUntilEnergy(row)};
  const rewards=[]; const levelBonus=Math.floor((Number(row.level)||1)/5);
  for(const drop of WORK_TABLES[row.profession_key]||[]){
    const improvedChance=Math.min(1,drop.chance + Math.floor((Number(row.level)||1)/5)*0.02);
    if(Math.random()<=improvedChance){ const qty=randomInt(drop.min,drop.max)+levelBonus; grantItem(userId,drop.key,qty,`profession:${row.profession_key}`); rewards.push([drop.key,qty]); }
  }
  const progress=levelFromXp(row.level,Number(row.xp)+35);
  db.prepare(`UPDATE hero_professions SET level=?,xp=?,work_count=work_count+1,energy=MAX(0,energy-?),energy_updated_at=CURRENT_TIMESTAMP,last_work_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`)
    .run(progress.level,progress.xp,ENERGY_COST,userId);
  return {ok:true,rewards,level:progress.level,xp:progress.xp,leveled:progress.gained>0,energy:Math.max(0,Number(row.energy)-ENERGY_COST)};
}
function getProfessionCounts(){
  const counts=Object.fromEntries(Object.keys(PROFESSIONS).map(k=>[k,0]));
  for(const row of db.prepare('SELECT profession_key,COUNT(*) count FROM hero_professions GROUP BY profession_key').all()) if(counts[row.profession_key]!==undefined) counts[row.profession_key]=Number(row.count)||0;
  return counts;
}
function listProfessionMembers(key,limit=25){
  return db.prepare(`SELECT hp.user_id,hp.level profession_level,h.name,h.class_key,h.level hero_level FROM hero_professions hp JOIN heroes h ON h.user_id=hp.user_id WHERE hp.profession_key=? ORDER BY hp.level DESC,h.level DESC,h.name ASC LIMIT ?`).all(key,limit);
}
module.exports={PROFESSIONS,WORK_TABLES,ENERGY_MAX,ENERGY_COST,ENERGY_REGEN_PER_HOUR,xpNeeded,getProfession,chooseProfession,work,getProfessionCounts,listProfessionMembers,msUntilEnergy};
