'use strict';

const achievements = require('../data/achievements.json');
const { db, unlockAchievement, updatePlayer, addCardDust } = require('../database/db');
const { grantResource, resourceMeta } = require('../systems/hero/resourceService');
const { grantItem, seedItems } = require('../systems/hero/itemService');
const { getHero } = require('../systems/hero/heroService');
const { grantClassXp } = require('../systems/hero/classProgressService');
const { ITEMS } = require('../systems/hero/itemData');

const GRANT_DIFFICULTIES = Object.freeze({
  normal:{name:'Обычная',icon:'🟢',mult:1,itemChance:.10,rarities:['common','rare']},
  dangerous:{name:'Опасная',icon:'🔵',mult:1.25,itemChance:.18,rarities:['common','rare','epic']},
  heroic:{name:'Героическая',icon:'🟣',mult:1.6,itemChance:.30,rarities:['rare','epic']},
  epic:{name:'Эпическая',icon:'🟠',mult:2.1,itemChance:.45,rarities:['epic','legendary']},
  legendary:{name:'Легендарная',icon:'🔴',mult:3,itemChance:.65,rarities:['legendary','mythic']},
});
const RANDOM_MATERIALS=['forest_herbs','iron_ore','hardwood','fresh_fish','raw_meat','wild_berries','forest_mushrooms','grain','shellfish','beast_hide','beast_bone','gemstone','ancient_wood','moon_carp','pearl','crystal','essence','ancient_fragment'];
function randomInt(min,max){return Math.floor(Math.random()*(max-min+1))+min;}
function randomMaterialRewards(userId,diff,count=2){
  const out=[]; const pool=[...RANDOM_MATERIALS];
  for(let i=0;i<count&&pool.length;i++){
    const key=pool.splice(randomInt(0,pool.length-1),1)[0];
    const qty=Math.max(1,Math.round(randomInt(1,3)*diff.mult));
    const granted=grantResource(String(userId),key,qty,'owner_random_completion');
    if(granted)out.push({...resourceMeta(key),quantity:qty});
  }
  return out;
}
function randomEquipment(userId,diff,source){
  if(Math.random()>=diff.itemChance)return null;
  const pool=Object.entries(ITEMS).filter(([,item])=>item.slot&&diff.rarities.includes(String(item.rarity||'common').toLowerCase()));
  if(!pool.length)return null;
  const [key,meta]=pool[randomInt(0,pool.length-1)];
  const item=grantItem(String(userId),key,1,source);
  return item?{key,name:item.name||meta.name,rarity:meta.rarity}:null;
}

function findAchievement(query) {
  const q = String(query || '').trim().toLowerCase();
  return achievements.find(a => String(a.id).toLowerCase() === q)
    || achievements.find(a => String(a.title || '').toLowerCase() === q)
    || achievements.find(a => String(a.title || '').toLowerCase().includes(q));
}

function grantAchievement(userId, query) {
  const achievement = findAchievement(query);
  if (!achievement) return { ok:false, reason:'not_found' };
  const before = db.prepare('SELECT 1 FROM player_achievements WHERE user_id=? AND achievement_id=?').get(String(userId), achievement.id);
  if (!before) {
    unlockAchievement(String(userId), achievement.id);
    const player = db.prepare('SELECT * FROM players WHERE user_id=?').get(String(userId));
    if (player) updatePlayer({ ...player, achievements: Number(player.achievements || 0) + 1, xp: Number(player.xp || 0) + Number(achievement.xp || 0) });
  }
  return { ok:true, achievement, already:Boolean(before) };
}

function grantMaterial(userId, key, quantity) {
  const result = grantResource(String(userId), String(key), Number(quantity), 'owner_admin');
  return { ok:Boolean(result), key:String(key), quantity:Number(quantity) };
}

function grantInventoryItem(userId, key, quantity) {
  seedItems();
  const item = grantItem(String(userId), String(key), Number(quantity), 'owner_admin');
  return { ok:Boolean(item), item, key:String(key), quantity:Number(quantity) };
}

function completeExpedition({ userId, guildId='global', locationKey, hours=4, difficulty='normal', materialKey=null, materialQty=0 }) {
  const hero=getHero(String(userId)); if(!hero)return {ok:false,reason:'no_hero'};
  const duration=[2,4,8].includes(Number(hours))?Number(hours):4;
  const diff=GRANT_DIFFICULTIES[difficulty]||GRANT_DIFFICULTIES.normal;
  const rewards={xp:Math.round(duration*20*diff.mult),classXp:Math.round(duration*12.5*diff.mult),dust:Math.round(duration*50*diff.mult)};
  const materials=randomMaterialRewards(userId,diff,Math.max(1,Math.round(diff.mult)));
  if(materialKey&&Number(materialQty)>0){const meta=resourceMeta(String(materialKey));grantResource(String(userId),String(materialKey),Number(materialQty),'owner_expedition_extra');materials.push({...meta,quantity:Number(materialQty)});}
  const item=randomEquipment(userId,diff,'owner_expedition_random');
  const now=new Date(),started=new Date(now.getTime()-duration*3600000).toISOString();
  const result={outcome:'success',chance:100,roll:1,event:'Экспедиция засчитана владельцем бота.',xp:rewards.xp,classXp:rewards.classXp,classKey:hero.class_key||'warrior',dust:rewards.dust,materials,item,adminGrant:true,difficultyKey:difficulty,difficultyName:diff.name,difficultyIcon:diff.icon};
  const cols=new Set(db.prepare('PRAGMA table_info(hero_expeditions)').all().map(r=>r.name));
  const names=['user_id','guild_id','location_key','status','started_at','returns_at','resolved_at','result_json'];
  const vals=[String(userId),String(guildId||'global'),String(locationKey),'resolved',started,now.toISOString(),now.toISOString(),JSON.stringify(result)];
  for(const [name,val] of [['class_key',hero.class_key||'warrior'],['duration_hours',duration],['tactic_key','balanced'],['success_chance',100],['hp_after',hero.hp]])if(cols.has(name)){names.push(name);vals.push(val);}
  db.prepare(`INSERT INTO hero_expeditions(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...vals);
  db.prepare('UPDATE heroes SET xp=COALESCE(xp,0)+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(rewards.xp,String(userId));
  grantClassXp(String(userId),hero.class_key||'warrior',rewards.classXp,{completed:true}); addCardDust(String(userId),rewards.dust,`Owner: экспедиция ${locationKey}`);
  return {ok:true,duration,difficulty:{key:difficulty,...diff},rewards:{...rewards,materials,item},locationKey:String(locationKey)};
}

function completeDungeon({ userId, guildId, dungeonName='Забытая шахта', difficulty='normal', itemKey=null }) {
  const hero=getHero(String(userId)); if(!hero)return {ok:false,reason:'no_hero'};
  const diff=GRANT_DIFFICULTIES[difficulty]||GRANT_DIFFICULTIES.normal;
  const reward={userId:String(userId),classKey:hero.class_key||'warrior',dust:Math.round(250*diff.mult),heroXp:Math.round(120*diff.mult),classXp:Math.round(100*diff.mult),materials:randomMaterialRewards(userId,diff,Math.max(1,Math.round(diff.mult)))};
  let item=null;
  if(itemKey){const granted=grantItem(String(userId),String(itemKey),1,'owner_dungeon');if(granted)item={key:String(itemKey),name:granted.name||String(itemKey),rarity:ITEMS[itemKey]?.rarity||'common'};}
  else item=randomEquipment(userId,diff,'owner_dungeon_random');
  if(item){reward.valuable=item.name;reward.valuableKey=item.key;reward.valuableItem={itemKey:item.key,name:item.name,rarity:item.rarity};}
  const now=new Date().toISOString();
  const res=db.prepare(`INSERT INTO dungeon_groups(guild_id,leader_id,name,status,dungeon_name,difficulty_key,difficulty_name,difficulty_icon,base_chance,success_chance,created_at,started_at,ends_at,resolved_at,success,result_json) VALUES(?,?,?,'resolved',?,?,?,?,100,100,?,?,?,?,1,?)`).run(String(guildId),String(userId),`Owner grant: ${dungeonName}`,String(dungeonName),String(difficulty),diff.name,diff.icon,now,now,now,now,JSON.stringify({version:4,dungeon:dungeonName,difficulty,rewards:[reward],adminGrant:true}));
  db.prepare('INSERT INTO dungeon_members(group_id,user_id,class_key,hero_snapshot_json,reward_claimed) VALUES(?,?,?,?,1)').run(Number(res.lastInsertRowid),String(userId),hero.class_key||'warrior','{}');
  addCardDust(String(userId),reward.dust,`Owner: подземелье ${dungeonName}`); db.prepare('UPDATE heroes SET xp=COALESCE(xp,0)+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(reward.heroXp,String(userId)); grantClassXp(String(userId),hero.class_key||'warrior',reward.classXp,{completed:true});
  return {ok:true,groupId:Number(res.lastInsertRowid),difficulty:{key:difficulty,...diff},reward};
}


function repairZeroOwnerExpeditionGrants() {
  db.exec(`CREATE TABLE IF NOT EXISTS owner_grant_repairs (
    repair_key TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const rows = db.prepare(`SELECT id,user_id,class_key,duration_hours,result_json
    FROM hero_expeditions
    WHERE status='resolved' AND result_json IS NOT NULL`).all();
  for (const row of rows) {
    let result;
    try { result = JSON.parse(row.result_json); } catch { continue; }
    if (!result?.adminGrant) continue;
    if (Number(result.xp || 0) !== 0 || Number(result.classXp || 0) !== 0 || Number(result.dust || 0) !== 0) continue;
    const repairKey = `owner-expedition-zero-rewards:${row.id}`;
    if (db.prepare('SELECT 1 FROM owner_grant_repairs WHERE repair_key=?').get(repairKey)) continue;
    const duration = [2,4,8].includes(Number(row.duration_hours)) ? Number(row.duration_hours) : 4;
    const xp = duration * 20;
    const classXp = Math.round(duration * 12.5);
    const dust = duration * 50;
    const classKey = result.classKey || row.class_key || 'warrior';
    db.transaction(() => {
      db.prepare('UPDATE heroes SET xp=COALESCE(xp,0)+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(xp,String(row.user_id));
      grantClassXp(String(row.user_id),classKey,classXp,{completed:true});
      addCardDust(String(row.user_id),dust,`Repair: owner expedition #${row.id}`);
      result.xp = xp;
      result.classXp = classXp;
      result.dust = dust;
      result.classKey = classKey;
      result.repaired = true;
      db.prepare('UPDATE hero_expeditions SET result_json=? WHERE id=?').run(JSON.stringify(result),Number(row.id));
      db.prepare('INSERT INTO owner_grant_repairs(repair_key) VALUES(?)').run(repairKey);
    })();
    console.log(`[Owner Grant Repair] Expedition #${row.id}: +${xp} hero XP, +${classXp} class XP, +${dust} Dust.`);
  }
}

function autocomplete(kind, focused) {
  const q=String(focused||'').toLowerCase();
  let rows=[];
  if(kind==='achievement') rows=achievements.map(a=>({name:`${a.title} — ${a.id}`,value:a.id}));
  else if(kind==='item') rows=Object.entries(ITEMS).filter(([,v])=>v.type!=='material').map(([key,v])=>({name:`${v.name} — ${key}`,value:key}));
  else if(kind==='material') rows=Object.entries(ITEMS).filter(([,v])=>v.type==='material').map(([key,v])=>({name:`${v.name} — ${key}`,value:key}));
  return rows.filter(x=>x.name.toLowerCase().includes(q)||x.value.toLowerCase().includes(q)).slice(0,25);
}

repairZeroOwnerExpeditionGrants();
module.exports={grantAchievement,grantMaterial,grantInventoryItem,completeExpedition,completeDungeon,autocomplete,repairZeroOwnerExpeditionGrants};
