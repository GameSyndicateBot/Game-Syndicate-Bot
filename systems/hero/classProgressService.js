'use strict';

const { db } = require('../../database/db');
const { HERO_CLASSES } = require('./heroData');

const MAX_CLASS_LEVEL = 50;
const CLASS_ALIASES = Object.freeze({ ranger: 'archer', warlock: 'necromancer', druid: 'bard' });

function normalizeClassKey(classKey) {
  const key = String(classKey || '').toLowerCase();
  return CLASS_ALIASES[key] || key;
}
function isValidClass(classKey) { return Boolean(HERO_CLASSES[normalizeClassKey(classKey)]); }
function classXpForNextLevel(level) { return 80 + Math.max(0, Number(level || 1) - 1) * 35; }
function ensureClassProgress(userId, classKey) {
  const key = normalizeClassKey(classKey);
  if (!isValidClass(key)) return null;
  db.prepare(`INSERT OR IGNORE INTO hero_class_progress(user_id,class_key,level,xp) VALUES(?,?,1,0)`).run(userId,key);
  return getClassProgress(userId,key);
}
function getClassProgress(userId, classKey) {
  const key=normalizeClassKey(classKey);
  return db.prepare('SELECT * FROM hero_class_progress WHERE user_id=? AND class_key=?').get(userId,key) || null;
}
function getAllClassProgress(userId) {
  const rows=db.prepare('SELECT * FROM hero_class_progress WHERE user_id=?').all(userId);
  const byKey=Object.fromEntries(rows.map(r=>[normalizeClassKey(r.class_key),{...r,class_key:normalizeClassKey(r.class_key)}]));
  return Object.keys(HERO_CLASSES).map(key=>byKey[key] || {user_id:userId,class_key:key,level:1,xp:0,expeditions_completed:0});
}
function grantClassXp(userId,classKey,amount,{completed=true}={}) {
  const key=normalizeClassKey(classKey); let row=ensureClassProgress(userId,key);
  if (!row) return null;
  let level=Number(row.level||1), xp=Number(row.xp||0)+Math.max(0,Math.round(Number(amount)||0)), gained=0;
  while(level<MAX_CLASS_LEVEL && xp>=classXpForNextLevel(level)) { xp-=classXpForNextLevel(level); level++; gained++; }
  if(level>=MAX_CLASS_LEVEL) xp=Math.min(xp,classXpForNextLevel(MAX_CLASS_LEVEL)-1);
  db.prepare(`UPDATE hero_class_progress SET level=?,xp=?,expeditions_completed=expeditions_completed+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND class_key=?`)
    .run(level,xp,completed?1:0,userId,key);
  return {...getClassProgress(userId,key),levelsGained:gained};
}
function classWorldBossBonuses(level) {
  const progress=Math.max(0,Math.min(MAX_CLASS_LEVEL,Number(level||1))-1)/(MAX_CLASS_LEVEL-1);
  return {
    damagePercent: Math.round(progress*8*10)/10,
    hpPercent: Math.round(progress*6*10)/10,
    resistancePercent: Math.round(progress*4*10)/10,
  };
}
function serializeClassProgress(userId) {
  const out={}; for(const row of getAllClassProgress(userId)) out[row.class_key]={level:Number(row.level||1),xp:Number(row.xp||0)}; return out;
}
module.exports={MAX_CLASS_LEVEL,normalizeClassKey,isValidClass,classXpForNextLevel,ensureClassProgress,getClassProgress,getAllClassProgress,grantClassXp,classWorldBossBonuses,serializeClassProgress};
