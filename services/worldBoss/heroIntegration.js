'use strict';

const { getHero } = require('../../systems/hero/heroService');
const { getEquipment, getEquipmentOnlyBonuses, getClassEquipment, getClassEquipmentOnlyBonuses } = require('../../systems/hero/itemService');
const { getActiveCompanion } = require('../../systems/hero/companionService');
const { serializeClassProgress, normalizeClassKey, classWorldBossBonuses } = require('../../systems/hero/classProgressService');

function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }

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
  const stats = snapshot?.classEquipmentBonuses?.[key] || snapshot?.equipmentBonuses || {};
  const profile = CLASS_EQUIPMENT_PROFILES[key] || CLASS_EQUIPMENT_PROFILES.warrior;
  const primaryScore = profile.primary.reduce((sum, stat) => sum + Number(stats[stat] || 0), 0);
  const damagePercent = clamp(primaryScore / 6 + Number(stats.world_boss_damage || 0), 0, 8);
  const hpPercent = clamp((Number(stats.hp || 0) / 15 + Number(stats.defense || 0) / 8) * profile.hpWeight, 0, 6);
  const resistancePercent = clamp((Number(stats.defense || 0) / 5 + Number(stats.world_boss_resistance || 0)) * profile.resistanceWeight, 0, 5);
  return {
    damagePercent: Math.round(damagePercent * 10) / 10,
    hpPercent: Math.round(hpPercent * 10) / 10,
    resistancePercent: Math.round(resistancePercent * 10) / 10,
  };
}

function buildHeroSnapshot(userId) {
  const hero = getHero(userId);
  if (!hero) return null;
  const equipmentBonuses = getEquipmentOnlyBonuses(userId) || {};
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

  // Базовый герой даёт небольшой общий бонус. Экипировка считается отдельно
  // и адаптируется под выбранный в World Boss класс, чтобы не было двойного учёта.
  const levelDamage = clamp((Number(hero.level || 1) - 1) * 0.16, 0, 4);
  const statDamage = clamp((Number(hero.strength || 0) + Number(hero.intelligence || 0) + Number(hero.dexterity || 0)) / 36, 0, 3);
  const damagePercent = clamp(levelDamage + statDamage, 0, 7);
  const hpPercent = clamp((Number(hero.level || 1) - 1) * 0.1 + Number(hero.max_hp || 0) / 180, 0, 6);
  const resistancePercent = clamp(Number(hero.defense || 0) / 22, 0, 4);

  return {
    name: String(hero.name || 'Герой').slice(0, 24),
    level: Number(hero.level || 1),
    classKey: hero.class_key,
    originKey: hero.origin_key,
    stats: {
      hp: Number(hero.max_hp || hero.hp || 0),
      strength: Number(hero.strength || 0),
      defense: Number(hero.defense || 0),
      dexterity: Number(hero.dexterity || 0),
      intelligence: Number(hero.intelligence || 0),
      luck: Number(hero.luck || 0),
    },
    combat: { damagePercent, hpPercent, resistancePercent },
    equipmentBonuses,
    classEquipmentBonuses,
    classEquipment,
    classProgress: serializeClassProgress(userId),
    equipment,
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
function damageMultiplier(player) {
  const s = parseSnapshot(player), cb = selectedClassBonuses(player);
  return 1 + clamp(Number(s?.combat?.damagePercent || 0) + cb.mastery.damagePercent + cb.equipment.damagePercent + Number(s?.alchemy?.world_boss_damage || 0), 0, 22) / 100;
}
function hpMultiplier(player) {
  const s = parseSnapshot(player), cb = selectedClassBonuses(player);
  return 1 + clamp(Number(s?.combat?.hpPercent || 0) + cb.mastery.hpPercent + cb.equipment.hpPercent, 0, 14) / 100;
}
function resistancePercent(player) {
  const s = parseSnapshot(player), cb = selectedClassBonuses(player);
  return clamp(Number(s?.combat?.resistancePercent || 0) + cb.mastery.resistancePercent + cb.equipment.resistancePercent + Number(s?.alchemy?.world_boss_resistance || 0), 0, 16);
}
function heroSummary(player) {
  const s = parseSnapshot(player);
  const parts = [`**${heroName(player)}**`, `ур. ${Number(player?.hero_level || s.level || 1)}`];
  if (s.companion?.name) parts.push(`🐾 ${s.companion.name}`);
  return parts.join(' • ');
}

module.exports = { buildHeroSnapshot, parseSnapshot, heroName, damageMultiplier, hpMultiplier, resistancePercent, heroSummary, selectedClassBonuses, equipmentBonusesForClass };
