const crypto = require('crypto');
const { db, addCardDust } = require('../../database/db');
const { grantMaterial } = require('../hero/materialService');
const { getClassProgress, normalizeClassKey } = require('../hero/classProgressService');
const { getClassEquipmentOnlyBonuses } = require('../hero/itemService');
const { HERO_CLASSES } = require('../hero/heroData');
const { REGION_MINIBOSSES } = require('./minibossData');

function seeded(seed) {
  let s = parseInt(crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 12), 16) % 2147483647;
  return () => ((s = s * 48271 % 2147483647) - 1) / 2147483646;
}
function int(rng,min,max){ return Math.floor(rng()*(max-min+1))+min; }
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function getRegionMiniboss(regionKey){ return REGION_MINIBOSSES[regionKey] || null; }

function encounterChance(boss, location, tactic, worldEffects={}) {
  let chance = Number(boss.encounterChance || 0.02);
  chance += Math.max(0, Number(location?.difficulty || 1) - 2) * 0.0025;
  if (tactic?.key === 'aggressive' || tactic?.key === 'experience') chance += 0.012;
  if (tactic?.key === 'cautious') chance -= 0.007;
  if (worldEffects?.event?.key === 'invasion') chance += 0.018;
  if (worldEffects?.event?.key === 'bandits') chance += 0.006;
  return clamp(chance, 0.005, 0.09);
}

function heroCombatPower(userId, hero, classKey) {
  const key = normalizeClassKey(classKey || hero.class_key);
  const progress = getClassProgress(userId, key) || { level:1 };
  const gear = getClassEquipmentOnlyBonuses(userId, key, { fallback:true }) || {};
  const classData = HERO_CLASSES[key] || {};
  const role = String(classData.role || '').toLowerCase();
  const offense = Number(hero.strength||0)*1.3 + Number(hero.dexterity||0)*1.15 + Number(hero.intelligence||0)*1.2;
  const defense = Number(hero.defense||0)*1.1 + Number(hero.max_hp||100)*0.08;
  const gearPower = Number(gear.strength||0)*1.5 + Number(gear.dexterity||0)*1.35 + Number(gear.intelligence||0)*1.4 + Number(gear.defense||0)*1.25 + Number(gear.hp||0)*0.10;
  const roleBonus = role.includes('tank') ? 10 : role.includes('heal') ? 6 : role.includes('damage') ? 9 : 7;
  return Math.round(28 + offense + defense + gearPower + Number(progress.level||1)*3.1 + roleBonus);
}

function recordResult({ guildId,userId,boss,outcome,damageTaken,remainingHp,loot,dust,xp,durationScore }) {
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO miniboss_kills(guild_id,user_id,region_key,boss_key,outcome,damage_taken,remaining_hp,loot_json,dust,xp,duration_score)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(guildId,userId,boss.region,boss.key,outcome,damageTaken,remainingHp,JSON.stringify(loot||[]),dust||0,xp||0,durationScore||0);
    db.prepare(`INSERT INTO player_miniboss_stats(guild_id,user_id,boss_key,wins,losses,escapes,best_score,last_fought_at)
      VALUES(?,?,?, ?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(guild_id,user_id,boss_key) DO UPDATE SET
      wins=wins+excluded.wins, losses=losses+excluded.losses, escapes=escapes+excluded.escapes,
      best_score=CASE WHEN excluded.best_score>best_score THEN excluded.best_score ELSE best_score END,
      last_fought_at=CURRENT_TIMESTAMP`).run(guildId,userId,boss.key,outcome==='victory'?1:0,outcome==='defeat'?1:0,outcome==='escape'?1:0,durationScore||0);
    if (outcome === 'victory') {
      db.prepare(`INSERT OR IGNORE INTO miniboss_first_kills(guild_id,boss_key,user_id,killed_at) VALUES(?,?,?,CURRENT_TIMESTAMP)`).run(guildId,boss.key,userId);
    }
  });
  tx();
}

function activateRegionAftermath(guildId,boss) {
  if (!boss.regionBuff) return null;
  const expiresAt = new Date(Date.now() + Number(boss.regionBuff.hours||6)*3600000).toISOString();
  db.prepare(`INSERT INTO world_region_buffs(guild_id,region_key,buff_key,source_key,value,description,expires_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild_id,region_key,buff_key,source_key)
    DO UPDATE SET value=excluded.value,description=excluded.description,expires_at=excluded.expires_at`)
    .run(guildId,boss.region,boss.regionBuff.key,`miniboss:${boss.key}`,boss.regionBuff.value,boss.regionBuff.description,expiresAt);
  return { ...boss.regionBuff, expiresAt };
}

function rollMinibossEncounter({ guildId='global', userId, expeditionId, location, hero, classKey, tactic, worldEffects }) {
  const boss = getRegionMiniboss(location?.region);
  if (!boss) return null;
  const rng = seeded(`miniboss:${guildId}:${userId}:${expeditionId}:${boss.key}`);
  const chance = encounterChance(boss,location,tactic,worldEffects);
  if (rng() >= chance) return null;

  const power = heroCombatPower(userId,hero,classKey);
  const difficulty = Number(boss.power||100) * (0.92 + rng()*0.18);
  const winChance = clamp(0.18 + power/(power+difficulty)*0.72,0.12,0.88);
  const winRoll = rng();
  let outcome = 'defeat';
  if (winRoll <= winChance) outcome='victory';
  else {
    const escapeChance = clamp(0.18 + Number(hero.dexterity||0)/120 + (tactic?.key==='cautious'?0.20:0),0.18,0.68);
    if (rng() <= escapeChance) outcome='escape';
  }

  const maxHp = Math.max(1,Number(hero.max_hp||100));
  let damageTaken, remainingHp, xp=0, dust=0, loot=[], aftermath=null;
  if (outcome==='victory') {
    damageTaken = Math.round(maxHp*clamp(0.18 + difficulty/(power+difficulty)*0.48 + rng()*0.12,0.16,0.72));
    remainingHp = Math.max(1,maxHp-damageTaken);
    xp = Math.round(85 + Number(boss.power)*0.9 + rng()*55);
    dust = Math.round(45 + Number(boss.power)*0.55 + rng()*50);
    addCardDust(userId,dust);
    for (const drop of boss.loot) {
      if (rng() <= drop.chance) {
        const granted=grantMaterial(userId,drop.key,int(rng,drop.min||1,drop.max||1));
        if (granted) loot.push(granted);
      }
    }
    aftermath=activateRegionAftermath(guildId,boss);
  } else if (outcome==='escape') {
    damageTaken=Math.round(maxHp*(0.16+rng()*0.22));
    remainingHp=Math.max(1,maxHp-damageTaken);
    xp=Math.round(20+boss.power*0.18);
  } else {
    damageTaken=Math.round(maxHp*(0.72+rng()*0.24));
    remainingHp=Math.max(1,maxHp-damageTaken);
    xp=Math.round(15+boss.power*0.12);
  }
  const score = outcome==='victory' ? Math.max(1,Math.round(10000/(1+damageTaken)+power)) : 0;
  recordResult({guildId,userId,boss,outcome,damageTaken,remainingHp,loot,dust,xp,durationScore:score});
  const firstKill=db.prepare('SELECT user_id,killed_at FROM miniboss_first_kills WHERE guild_id=? AND boss_key=?').get(guildId,boss.key);
  return { boss,chance,winChance,power,outcome,damageTaken,remainingHp,xp,dust,loot,aftermath,score,firstKill };
}

function getMinibossOverview(guildId='global', userId=null) {
  return Object.values(REGION_MINIBOSSES).map(boss => {
    const first=db.prepare('SELECT user_id,killed_at FROM miniboss_first_kills WHERE guild_id=? AND boss_key=?').get(guildId,boss.key)||null;
    const total=db.prepare("SELECT COUNT(*) count FROM miniboss_kills WHERE guild_id=? AND boss_key=? AND outcome='victory'").get(guildId,boss.key)?.count||0;
    const mine=userId?db.prepare('SELECT * FROM player_miniboss_stats WHERE guild_id=? AND user_id=? AND boss_key=?').get(guildId,userId,boss.key):null;
    const leader=db.prepare(`SELECT user_id,wins,best_score FROM player_miniboss_stats WHERE guild_id=? AND boss_key=? ORDER BY wins DESC,best_score DESC LIMIT 1`).get(guildId,boss.key)||null;
    return {boss,first,total,mine,leader};
  });
}

module.exports={ getRegionMiniboss,encounterChance,rollMinibossEncounter,getMinibossOverview,heroCombatPower };
