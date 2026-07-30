'use strict';
const achievements=require('../data/achievements.json');
const {db,unlockAchievement}=require('../database/db');
const KEY='v19.6.3-achievement-repair-20260730';
function applyTargetedRecoveryV1963(){
 db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations(migration_key TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
 if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(KEY))return {applied:false};
 const full=achievements.find(a=>a.id==='collection_177');
 const result=db.transaction(()=>{
   const revoked=db.prepare("DELETE FROM player_achievements WHERE achievement_id IN ('collection_82','collection_177')").run().changes;
   const target='830515570377097259';
   const exists=db.prepare('SELECT 1 FROM player_achievements WHERE user_id=? AND achievement_id=?').get(target,'quick_event_streak_5');
   if(!exists) unlockAchievement(target,'quick_event_streak_5');
   db.prepare('UPDATE players SET achievements=(SELECT COUNT(*) FROM player_achievements pa WHERE pa.user_id=players.user_id)').run();
   db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(KEY);
   return {revoked,granted:!exists,fullTarget:full?.target||177};
 })();
 console.log('[V19.6.3] Achievement repair:',result);return {applied:true,...result};
}
module.exports={applyTargetedRecoveryV1963};
