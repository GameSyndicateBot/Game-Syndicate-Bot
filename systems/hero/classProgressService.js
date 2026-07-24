'use strict';

const { db } = require('../../database/db');
const { HERO_CLASSES } = require('./heroData');

const MAX_CLASS_LEVEL = 50;
const CLASS_ALIASES = Object.freeze({ ranger: 'archer', warlock: 'necromancer', druid: 'bard' });

const CLASS_BONUS_PROFILES = Object.freeze({
  warrior:      { damage: 3.5, hp: 8.0, resistance: 6.0, title: 'Стойкость авангарда' },
  paladin:      { damage: 3.0, hp: 7.0, resistance: 7.0, title: 'Священный оплот' },
  guardian:     { damage: 2.5, hp: 9.0, resistance: 7.0, title: 'Несокрушимая стена' },
  berserker:    { damage: 7.0, hp: 4.0, resistance: 2.5, title: 'Боевая ярость' },
  assassin:     { damage: 9.0, hp: 2.0, resistance: 2.0, title: 'Смертельная точность' },
  archer:       { damage: 8.5, hp: 2.5, resistance: 2.0, title: 'Безошибочный выстрел' },
  engineer:     { damage: 6.5, hp: 4.0, resistance: 3.5, title: 'Тактическое превосходство' },
  mage:         { damage: 9.0, hp: 2.0, resistance: 2.0, title: 'Магический натиск' },
  necromancer:  { damage: 6.5, hp: 4.0, resistance: 4.0, title: 'Власть над тьмой' },
  cleric:       { damage: 3.5, hp: 5.0, resistance: 5.0, title: 'Благословение жизни' },
  priest:       { damage: 3.0, hp: 5.0, resistance: 5.5, title: 'Свет веры' },
  bard:         { damage: 4.5, hp: 4.0, resistance: 4.0, title: 'Песнь поддержки' },
});


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
function classWorldBossBonuses(level, classKey = null) {
  const progress=Math.max(0,Math.min(MAX_CLASS_LEVEL,Number(level||1))-1)/(MAX_CLASS_LEVEL-1);
  const key=normalizeClassKey(classKey);
  const profile=CLASS_BONUS_PROFILES[key] || { damage: 8, hp: 6, resistance: 4, title: 'Мастерство класса' };
  return {
    damagePercent: Math.round(progress*profile.damage*10)/10,
    hpPercent: Math.round(progress*profile.hp*10)/10,
    resistancePercent: Math.round(progress*profile.resistance*10)/10,
    title: profile.title,
  };
}
const MASTERY_RANKS = Object.freeze([
  { level: 1, name: 'Новичок', icon: '◽' },
  { level: 5, name: 'Ученик', icon: '▫️' },
  { level: 10, name: 'Адепт', icon: '🔹' },
  { level: 20, name: 'Ветеран', icon: '🔷' },
  { level: 30, name: 'Эксперт', icon: '💠' },
  { level: 40, name: 'Мастер', icon: '⭐' },
  { level: 50, name: 'Легенда класса', icon: '🌟' },
]);

function getMasteryRank(level) {
  const value = Math.max(1, Math.min(MAX_CLASS_LEVEL, Number(level || 1)));
  return [...MASTERY_RANKS].reverse().find(rank => value >= rank.level) || MASTERY_RANKS[0];
}
function getNextMilestone(level) {
  const value = Math.max(1, Number(level || 1));
  return MASTERY_RANKS.find(rank => rank.level > value) || null;
}
function classProgressPercent(level, xp) {
  const value = Math.max(1, Math.min(MAX_CLASS_LEVEL, Number(level || 1)));
  if (value >= MAX_CLASS_LEVEL) return 100;
  return Math.max(0, Math.min(100, Math.floor((Number(xp || 0) / classXpForNextLevel(value)) * 100)));
}
function serializeClassProgress(userId) {
  const out={}; for(const row of getAllClassProgress(userId)) out[row.class_key]={level:Number(row.level||1),xp:Number(row.xp||0)}; return out;
}
module.exports={MAX_CLASS_LEVEL,MASTERY_RANKS,CLASS_BONUS_PROFILES,normalizeClassKey,isValidClass,classXpForNextLevel,ensureClassProgress,getClassProgress,getAllClassProgress,grantClassXp,classWorldBossBonuses,getMasteryRank,getNextMilestone,classProgressPercent,serializeClassProgress};
