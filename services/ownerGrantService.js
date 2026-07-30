'use strict';

const achievements = require('../data/achievements.json');
const { db, unlockAchievement, updatePlayer, addCardDust } = require('../database/db');
const { grantResource } = require('../systems/hero/resourceService');
const { grantItem, seedItems } = require('../systems/hero/itemService');
const { getHero } = require('../systems/hero/heroService');
const { grantClassXp } = require('../systems/hero/classProgressService');
const { ITEMS } = require('../systems/hero/itemData');

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

function completeExpedition({ userId, guildId='global', locationKey, hours=4, dust=null, xp=null, classXp=null, materialKey=null, materialQty=0 }) {
  const hero = getHero(String(userId));
  if (!hero) return { ok:false, reason:'no_hero' };
  const duration = [2,4,8].includes(Number(hours)) ? Number(hours) : 4;
  const rewards = {
    xp: Number.isFinite(Number(xp)) ? Number(xp) : duration * 20,
    classXp: Number.isFinite(Number(classXp)) ? Number(classXp) : Math.round(duration * 12.5),
    dust: Number.isFinite(Number(dust)) ? Number(dust) : duration * 50,
  };
  const now = new Date();
  const started = new Date(now.getTime() - duration * 3600000).toISOString();
  const result = {
    outcome:'success', chance:100, roll:1,
    event:'Экспедиция засчитана владельцем бота.',
    xp:rewards.xp, classXp:rewards.classXp, classKey:hero.class_key || 'warrior', dust:rewards.dust,
    materials: materialKey && Number(materialQty)>0 ? [{key:String(materialKey),name:String(materialKey),quantity:Number(materialQty)}] : [],
    adminGrant:true,
  };
  const cols = new Set(db.prepare('PRAGMA table_info(hero_expeditions)').all().map(r=>r.name));
  const names=['user_id','guild_id','location_key','status','started_at','returns_at','resolved_at','result_json'];
  const vals=[String(userId),String(guildId||'global'),String(locationKey),'resolved',started,now.toISOString(),now.toISOString(),JSON.stringify(result)];
  for (const [name,val] of [['class_key',hero.class_key||'warrior'],['duration_hours',duration],['tactic_key','balanced'],['success_chance',100],['hp_after',hero.hp]]) if(cols.has(name)){names.push(name);vals.push(val);}
  db.prepare(`INSERT INTO hero_expeditions(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...vals);
  db.prepare('UPDATE heroes SET xp=COALESCE(xp,0)+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(rewards.xp,String(userId));
  grantClassXp(String(userId), hero.class_key || 'warrior', rewards.classXp, { completed:true });
  addCardDust(String(userId), rewards.dust, `Owner: экспедиция ${locationKey}`);
  if (materialKey && Number(materialQty)>0) grantResource(String(userId),String(materialKey),Number(materialQty),'owner_expedition');
  return { ok:true, duration, rewards, locationKey:String(locationKey) };
}

function completeDungeon({ userId, guildId, dungeonName='Забытая шахта', difficulty='normal', dust=250, classXp=100, itemKey=null }) {
  const hero=getHero(String(userId));
  if(!hero)return {ok:false,reason:'no_hero'};
  const diffMap={normal:['Обычная','🟢'],dangerous:['Опасная','🔵'],heroic:['Героическая','🟣'],epic:['Эпическая','🟠'],legendary:['Легендарная','🔴']};
  const [diffName,diffIcon]=diffMap[difficulty]||diffMap.normal;
  const reward={userId:String(userId),classKey:hero.class_key||'warrior',dust:Number(dust),classXp:Number(classXp)};
  if(itemKey){ const item=grantItem(String(userId),String(itemKey),1,'owner_dungeon'); if(item){reward.valuable=item.name||String(itemKey);reward.valuableKey=String(itemKey);} }
  const now=new Date().toISOString();
  const res=db.prepare(`INSERT INTO dungeon_groups(guild_id,leader_id,name,status,dungeon_name,difficulty_key,difficulty_name,difficulty_icon,base_chance,success_chance,created_at,started_at,ends_at,resolved_at,success,result_json)
    VALUES(?,?,?,'resolved',?,?,?,?,100,100,?,?,?,?,1,?)`).run(String(guildId),String(userId),`Owner grant: ${dungeonName}`,String(dungeonName),String(difficulty),diffName,diffIcon,now,now,now,now,JSON.stringify({version:3,dungeon:dungeonName,difficulty,rewards:[reward],adminGrant:true}));
  db.prepare('INSERT INTO dungeon_members(group_id,user_id,class_key,hero_snapshot_json,reward_claimed) VALUES(?,?,?,?,1)').run(Number(res.lastInsertRowid),String(userId),hero.class_key||'warrior','{}');
  addCardDust(String(userId),Number(dust),`Owner: подземелье ${dungeonName}`);
  grantClassXp(String(userId),hero.class_key||'warrior',Number(classXp),{completed:true});
  return {ok:true,groupId:Number(res.lastInsertRowid),reward};
}

function autocomplete(kind, focused) {
  const q=String(focused||'').toLowerCase();
  let rows=[];
  if(kind==='achievement') rows=achievements.map(a=>({name:`${a.title} — ${a.id}`,value:a.id}));
  else if(kind==='item') rows=Object.entries(ITEMS).filter(([,v])=>v.type!=='material').map(([key,v])=>({name:`${v.name} — ${key}`,value:key}));
  else if(kind==='material') rows=Object.entries(ITEMS).filter(([,v])=>v.type==='material').map(([key,v])=>({name:`${v.name} — ${key}`,value:key}));
  return rows.filter(x=>x.name.toLowerCase().includes(q)||x.value.toLowerCase().includes(q)).slice(0,25);
}

module.exports={grantAchievement,grantMaterial,grantInventoryItem,completeExpedition,completeDungeon,autocomplete};
