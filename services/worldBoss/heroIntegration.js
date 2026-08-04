'use strict';

const { getHero } = require('../../systems/hero/heroService');
const { getEquipment, getEquipmentOnlyBonuses, getClassEquipment, getClassEquipmentOnlyBonuses, getEffectiveHero } = require('../../systems/hero/itemService');
const { getActiveCompanion, getActiveCompanions, getActiveMount, getCompanionBonuses } = require('../../systems/hero/companionService');
const { deriveStats } = require('../../systems/hero/statSystem');
const { serializeClassProgress, normalizeClassKey, classWorldBossBonuses } = require('../../systems/hero/classProgressService');

function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }


const DPS_CLASS_KEYS = new Set([
  'assassin', 'archer', 'mage', 'berserker',
  'pyromancer', 'duelist', 'reaper', 'mindlord',
]);

const CLASS_EQUIPMENT_PROFILES = Object.freeze({
  warrior: { primary: ['strength', 'defense'], hpWeight: 1.0, resistanceWeight: 1.0 },
  paladin: { primary: ['defense', 'intelligence'], hpWeight: 1.15, resistanceWeight: 1.15 },
  guardian: { primary: ['defense', 'strength'], hpWeight: 1.25, resistanceWeight: 1.25 },
  berserker: { primary: ['strength', 'dexterity'], hpWeight: 0.8, resistanceWeight: 0.7 },
  assassin: { primary: ['dexterity', 'strength'], hpWeight: 0.55, resistanceWeight: 0.55 },
  archer: { primary: ['dexterity', 'luck'], hpWeight: 0.6, resistanceWeight: 0.55 },
  engineer: { primary: ['intelligence', 'dexterity'], hpWeight: 0.75, resistanceWeight: 0.8 },
  mage: { primary: ['intelligence', 'luck'], hpWeight: 0.55, resistanceWeight: 0.65 },
  necromancer: { primary: ['intelligence', 'defense'], hpWeight: 0.7, resistanceWeight: 0.8 },
  cleric: { primary: ['intelligence', 'defense'], hpWeight: 0.9, resistanceWeight: 0.95 },
  priest: { primary: ['intelligence', 'luck'], hpWeight: 0.85, resistanceWeight: 0.9 },
  bard: { primary: ['intelligence', 'dexterity'], hpWeight: 0.75, resistanceWeight: 0.75 },
});

function equipmentBonusesForClass(snapshot, classKey) {
  const key = normalizeClassKey(classKey);
  const classStats = snapshot?.classEquipmentBonuses?.[key] || snapshot?.equipmentBonuses || {};
  const companionStats = snapshot?.companionBonuses || {};
  const stats = { ...classStats };
  for (const [stat, value] of Object.entries(companionStats)) stats[stat] = Number(stats[stat] || 0) + Number(value || 0);
  const derived = deriveStats(stats, key);
  const damagePercent = clamp(Number(derived.primaryDamagePercent || 0) + Number(stats.world_boss_damage || 0), 0, 40);
  const resistancePercent = clamp(Number(derived.resistancePercent || 0) + Number(stats.world_boss_resistance || 0), 0, 28);
  return {
    damagePercent: Math.round(damagePercent * 10) / 10,
    hpPercent: 0,
    resistancePercent: Math.round(resistancePercent * 10) / 10,
    healingPercent: Math.round(clamp(Number(derived.healingPercent || 0),0,35)*10)/10,
    flatHp: Math.max(0, Math.round(Number(derived.bonusHp || 0))),
    expeditionSuccess: Number(stats.expedition_success || 0),
  };
}

function buildHeroSnapshot(userId) {
  const hero = getHero(userId);
  if (!hero) return null;
  const effectiveHero = getEffectiveHero(hero,{classKey:hero.class_key});
  const equipmentBonuses = effectiveHero?.equipmentBonuses || getEquipmentOnlyBonuses(userId) || {};
  const equipment = getEquipment(userId).map(item => ({
    slot: item.slot, itemKey: item.item_key, name: item.name, rarity: item.rarity,
    upgradeLevel: Number(item.upgrade_level || 0),
  }));
  const classEquipmentBonuses = {};
  const classEquipment = {};
  for (const classKey of Object.keys(serializeClassProgress(userId))) {
    classEquipmentBonuses[classKey] = getClassEquipmentOnlyBonuses(userId, classKey, { fallback: true }) || {};
    classEquipment[classKey] = getClassEquipment(userId, classKey, { fallback: true }).map(item => ({
      slot: item.slot, itemKey: item.item_key, name: item.name, rarity: item.rarity,
      upgradeLevel: Number(item.upgrade_level || 0),
    }));
  }
  const companion = getActiveCompanion(userId);
  const activePets = getActiveCompanions(userId);
  const activeMount = getActiveMount(userId);
  const companionBonuses = getCompanionBonuses(userId) || {};

  // Базовый герой даёт небольшой общий бонус. Экипировка считается отдельно
  // и адаптируется под выбранный в World Boss класс, чтобы не было двойного учёта.
  const levelDamage = 0; // отдельный уровень героя больше не влияет на World Boss
  const baseDerived = deriveStats(hero,hero.class_key);
  const damagePercent = clamp(levelDamage + Number(baseDerived.primaryDamagePercent||0), 0, 20);
  const hpPercent = clamp(Number(baseDerived.bonusHp||0) / 12, 0, 18);
  const resistancePercent = clamp(Number(baseDerived.resistancePercent||0), 0, 20);

  return {
    name: String(hero.name || 'Герой').slice(0, 24),
    level: Number(hero.level || 1),
    classKey: hero.class_key,
    originKey: hero.origin_key,
    stats: {
      hp: Number(effectiveHero?.max_hp || hero.max_hp || hero.hp || 0),
      strength: Number(effectiveHero?.strength || 0),
      defense: Number(effectiveHero?.defense || 0),
      dexterity: Number(effectiveHero?.dexterity || 0),
      intelligence: Number(effectiveHero?.intelligence || 0),
      wisdom: Number(effectiveHero?.wisdom || 0),
      vitality: Number(effectiveHero?.vitality || 0),
      luck: Number(effectiveHero?.luck || 0),
    },
    combat: { damagePercent, hpPercent, resistancePercent, healingPercent:Number(baseDerived.healingPercent||0), critChance:Number(baseDerived.critChance||0), dodgeChance:Number(baseDerived.dodgeChance||0) },
    equipmentBonuses,
    companionBonuses,
    classEquipmentBonuses,
    classEquipment,
    classProgress: serializeClassProgress(userId),
    equipment,
    activePets: activePets.map(x => ({ key:x.companion_key, name:x.name, rarity:x.rarity, level:Number(x.level||1) })),
    activeMount: activeMount ? { key:activeMount.companion_key, name:activeMount.name, rarity:activeMount.rarity, level:Number(activeMount.level||1) } : null,
    companion: companion ? {
      key: companion.companion_key,
      name: companion.name,
      rarity: companion.rarity,
      level: Number(companion.level || 1),
    } : null,
  };
}

function parseSnapshot(player) {
  try { return JSON.parse(player?.hero_snapshot_json || '{}') || {}; } catch { return {}; }
}
function heroName(player) { return player?.hero_name || parseSnapshot(player).name || `Игрок ${String(player?.user_id || '').slice(-4)}`; }
function selectedClassBonuses(player) {
  const s = parseSnapshot(player);
  const key = normalizeClassKey(player?.class_key);
  const level = Number(s?.classProgress?.[key]?.level || 1);
  const mastery = classWorldBossBonuses(level, key);
  const equipment = equipmentBonusesForClass(s, key);
  return { level, ...mastery, mastery, equipment };
}
function equipmentDexterityDamagePercent(player) { return 0; }
function damageMultiplier(player) {
  const s = parseSnapshot(player), cb = selectedClassBonuses(player);
  const dexterityDamage = equipmentDexterityDamagePercent(player);
  return 1 + clamp(
    Number(s?.combat?.damagePercent || 0)
      + cb.mastery.damagePercent
      + cb.equipment.damagePercent
      + dexterityDamage
      + Number(s?.alchemy?.world_boss_damage || 0),
    0,
    85
  ) / 100;
}
function hpMultiplier(player) {
  const s = parseSnapshot(player), cb = selectedClassBonuses(player);
  return 1 + clamp(Number(s?.combat?.hpPercent || 0) + cb.mastery.hpPercent + cb.equipment.hpPercent, 0, 42) / 100;
}
function resistancePercent(player) {
  const s = parseSnapshot(player), cb = selectedClassBonuses(player);
  return clamp(Number(s?.combat?.resistancePercent || 0) + cb.mastery.resistancePercent + cb.equipment.resistancePercent + Number(s?.alchemy?.world_boss_resistance || 0), 0, 32);
}
function healingMultiplier(player){ const s=parseSnapshot(player),cb=selectedClassBonuses(player); return 1+clamp(Number(s?.combat?.healingPercent||0)+Number(cb?.equipment?.healingPercent||0),0,45)/100; }
function heroSummary(player) {
  const s = parseSnapshot(player);
  const parts = [`**${heroName(player)}**`, `ур. ${Number(player?.hero_level || s.level || 1)}`];
  if (s.companion?.name) parts.push(`🐾 ${s.companion.name}`);
  return parts.join(' • ');
}

module.exports = { buildHeroSnapshot, parseSnapshot, heroName, damageMultiplier, equipmentDexterityDamagePercent, hpMultiplier, resistancePercent, healingMultiplier, heroSummary, selectedClassBonuses, equipmentBonusesForClass };
