const { db } = require('../../database/db');
const { COMPANIONS } = require('./companionData');
function grantCompanion(userId,key,source='system'){
 const c=COMPANIONS[key]; if(!c)return null;
 const exists=db.prepare('SELECT * FROM hero_companions WHERE user_id=? AND companion_key=?').get(userId,key);
 if(exists)return exists;
 db.prepare(`INSERT INTO hero_companions(user_id,companion_key,name,rarity,level,xp,active) VALUES(?,?,?,?,1,0,0)`).run(userId,key,c.name,c.rarity);
 return db.prepare('SELECT * FROM hero_companions WHERE user_id=? AND companion_key=?').get(userId,key);
}
function listCompanions(userId){return db.prepare('SELECT * FROM hero_companions WHERE user_id=? ORDER BY active DESC, rarity DESC, id ASC').all(userId);}
function activateCompanion(userId,id){
 const row=db.prepare('SELECT * FROM hero_companions WHERE user_id=? AND id=?').get(userId,id); if(!row)return {ok:false};
 const tx=db.transaction(()=>{db.prepare('UPDATE hero_companions SET active=0 WHERE user_id=?').run(userId);db.prepare('UPDATE hero_companions SET active=1 WHERE user_id=? AND id=?').run(userId,id);});tx();return {ok:true,companion:row};
}
function getActiveCompanion(userId){return db.prepare('SELECT * FROM hero_companions WHERE user_id=? AND active=1 LIMIT 1').get(userId)||null;}
function getCompanionBonuses(userId){const active=getActiveCompanion(userId);if(!active)return {};return COMPANIONS[active.companion_key]?.bonuses||{};}
module.exports={grantCompanion,listCompanions,activateCompanion,getActiveCompanion,getCompanionBonuses};
