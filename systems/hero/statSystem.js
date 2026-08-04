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
function round1(value){ return Math.round(num(value)*10)/10; }
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
  return {strength:num(hero?.strength),dexterity:num(hero?.dexterity),intelligence:num(hero?.intelligence),wisdom:num(hero?.wisdom),vitality:num(hero?.vitality),luck:num(hero?.luck),defense:num(hero?.defense),hp:0};
}
function totalStats(hero,bonuses={}){ return addStats(baseStatsFromHero(hero),bonuses); }
function initiativeMinRoll(dexterity){ return clamp(1+Math.floor(Math.max(0,num(dexterity))/10),1,6); }
function rollInitiative(dexterity,random=Math.random){
  const min=initiativeMinRoll(dexterity),max=20;
  return Math.floor(random()*(max-min+1))+min;
}
function deriveStats(stats,classKey=''){
  const s=addStats(stats),key=String(classKey||'').toLowerCase();
  const strengthDamagePercent=clamp(s.strength*0.5,0,50);
  const dexterityDamagePercent=DEX_DAMAGE_CLASSES.has(key)?clamp(s.dexterity*0.35,0,35):0;
  const magicDamagePercent=MAGIC_DAMAGE_CLASSES.has(key)?clamp(s.intelligence*1.0,0,60):0;
  return {
    flatPhysicalDamage:Math.max(0,Math.round(s.strength)),
    physicalDamagePercent:round1(strengthDamagePercent),
    dexterityDamagePercent:round1(dexterityDamagePercent),
    flatMagicDamage:Math.max(0,Math.round(s.intelligence)),
    magicDamagePercent:round1(magicDamagePercent),
    spellPowerPercent:round1(clamp(s.intelligence*1.0,0,60)),
    primaryDamagePercent:round1(clamp(strengthDamagePercent+dexterityDamagePercent+magicDamagePercent,0,60)),
    critChance:round1(clamp(s.dexterity*0.5+s.luck*0.2,0,35)),
    dodgeChance:round1(clamp(s.dexterity*0.3,0,20)),
    initiativeMin:initiativeMinRoll(s.dexterity),
    initiativeMax:20,
    healingPercent:round1(clamp(s.wisdom*1.0,0,60)),
    supportPercent:round1(clamp(s.wisdom*1.0,0,60)),
    resourceRegen:Math.max(0,Math.round(s.wisdom)),
    bonusHp:Math.max(0,Math.round(s.vitality*10+num(s.hp))),
    physicalDefensePercent:round1(clamp(s.vitality*0.5+s.defense*0.2,0,50)),
    magicDefensePercent:round1(clamp(s.vitality*0.5+s.defense*0.2,0,50)),
    resistancePercent:round1(clamp(s.vitality*0.5+s.defense*0.2,0,50)),
    rareFindPercent:round1(clamp(s.luck*0.5+num(s.rare_find),0,40)),
    rewardPercent:round1(clamp(s.luck*1.0,0,50)),
    maxManaBonus:Math.max(0,Math.round(s.intelligence*2)),
    aggroPercent:round1(clamp(s.strength*0.5,0,50)),
  };
}
function formatDerived(d){
  return [
    `⚔️ Физический урон: +${d.flatPhysicalDamage} и +${d.physicalDamagePercent}%`,
    `🎯 Крит: +${d.critChance}%`,
    `💨 Уклонение: +${d.dodgeChance}%`,
    `🎲 Инициатива: ${d.initiativeMin}–${d.initiativeMax}`,
    `🔮 Магический урон: +${d.flatMagicDamage} и +${d.magicDamagePercent}%`,
    `💚 Лечение: +${d.healingPercent}%`,
    `❤️ Запас HP: +${d.bonusHp}`,
    `🛡️ Физ./маг. защита: +${d.physicalDefensePercent}%`,
    `✨ Редкая добыча: +${d.rareFindPercent}%`,
    `🎁 PvE-награды: +${d.rewardPercent}%`,
  ];
}
module.exports={CORE_STAT_KEYS,ALL_EFFECT_KEYS,DEX_DAMAGE_CLASSES,MAGIC_DAMAGE_CLASSES,blankStats,addStats,baseStatsFromHero,totalStats,deriveStats,formatDerived,initiativeMinRoll,rollInitiative,clamp};
