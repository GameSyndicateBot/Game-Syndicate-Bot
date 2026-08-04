'use strict';

const CORE_STAT_KEYS = Object.freeze(['strength','dexterity','intelligence','wisdom','vitality','luck']);
const ALL_EFFECT_KEYS = Object.freeze([
  'hp','defense','expedition_success','rare_find','world_boss_damage','world_boss_resistance',
  'boss_flat_damage','injury_resistance','class_xp_bonus','heal'
]);

const DEX_DAMAGE_CLASSES = new Set(['assassin','archer','duelist','engineer','reaper']);
const MAGIC_DAMAGE_CLASSES = new Set(['mage','pyromancer','mindlord','necromancer','druid','shaman','chronomancer','illusionist','priest','cleric','bard']);

function num(value){ const n=Number(value); return Number.isFinite(n)?n:0; }
function clamp(value,min,max){ return Math.max(min,Math.min(max,num(value))); }
function blankStats(){ return Object.fromEntries([...CORE_STAT_KEYS,...ALL_EFFECT_KEYS].map(k=>[k,0])); }
function addStats(...sources){
  const out=blankStats();
  for(const source of sources){
    if(!source) continue;
    for(const [key,value] of Object.entries(source)){
      if(!(key in out)) out[key]=0;
      out[key]+=num(value);
    }
  }
  return out;
}
function baseStatsFromHero(hero){
  return {
    strength:num(hero?.strength), dexterity:num(hero?.dexterity), intelligence:num(hero?.intelligence),
    wisdom:num(hero?.wisdom), vitality:num(hero?.vitality), luck:num(hero?.luck),
    defense:num(hero?.defense), hp:0,
  };
}
function totalStats(hero, bonuses={}){ return addStats(baseStatsFromHero(hero),bonuses); }
function deriveStats(stats,classKey=''){
  const s=addStats(stats);
  const key=String(classKey||'').toLowerCase();
  const physicalFromStrength=s.strength*0.45;
  const dexDamage=DEX_DAMAGE_CLASSES.has(key)?s.dexterity*0.40:0;
  const magicDamage=MAGIC_DAMAGE_CLASSES.has(key)?s.intelligence*0.45:0;
  const primaryDamagePercent=physicalFromStrength+dexDamage+magicDamage;
  return {
    physicalDamagePercent: Math.round(physicalFromStrength*10)/10,
    dexterityDamagePercent: Math.round(dexDamage*10)/10,
    magicDamagePercent: Math.round(magicDamage*10)/10,
    primaryDamagePercent: Math.round(primaryDamagePercent*10)/10,
    critChance: Math.round(clamp(s.dexterity*0.35+s.luck*0.15,0,30)*10)/10,
    dodgeChance: Math.round(clamp(s.dexterity*0.20,0,18)*10)/10,
    initiativeBonus: Math.round(clamp(s.dexterity*0.20,0,15)*10)/10,
    healingPercent: Math.round(clamp(s.wisdom*0.50,0,35)*10)/10,
    supportPercent: Math.round(clamp(s.wisdom*0.40,0,30)*10)/10,
    bonusHp: Math.max(0,Math.round(s.vitality*6+num(s.hp))),
    resistancePercent: Math.round(clamp(s.vitality*0.25+s.wisdom*0.10+s.defense*0.20,0,30)*10)/10,
    rareFindPercent: Math.round(clamp(s.luck*0.25+num(s.rare_find),0,30)*10)/10,
    rewardPercent: Math.round(clamp(s.luck*0.15,0,15)*10)/10,
    maxManaBonus: Math.max(0,Math.round(s.intelligence)),
    aggroPercent: Math.round(clamp(s.strength*0.25+s.vitality*0.20,0,30)*10)/10,
  };
}
function formatDerived(d){
  return [
    `⚔️ Урон силы: +${d.physicalDamagePercent}%`,
    `🎯 Крит: +${d.critChance}%`,
    `🌀 Уклонение: +${d.dodgeChance}%`,
    `⚡ Инициатива: +${d.initiativeBonus}%`,
    `🔮 Магический урон: +${d.magicDamagePercent}%`,
    `💚 Лечение: +${d.healingPercent}%`,
    `❤️ Запас HP: +${d.bonusHp}`,
    `🛡️ Сопротивление: +${d.resistancePercent}%`,
    `✨ Редкая добыча: +${d.rareFindPercent}%`,
  ];
}

module.exports={CORE_STAT_KEYS,ALL_EFFECT_KEYS,DEX_DAMAGE_CLASSES,MAGIC_DAMAGE_CLASSES,blankStats,addStats,baseStatsFromHero,totalStats,deriveStats,formatDerived,clamp};
