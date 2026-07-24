'use strict';

const { getHero } = require('../../systems/hero/heroService');
const { getEffectiveHero, getEquipment, getEquipmentBonuses } = require('../../systems/hero/itemService');
const { getActiveCompanion } = require('../../systems/hero/companionService');

function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }

function buildHeroSnapshot(userId) {
  const base = getHero(userId);
  if (!base) return null;
  const hero = getEffectiveHero(base) || base;
  const bonuses = getEquipmentBonuses(userId) || {};
  const equipment = getEquipment(userId).map(item => ({
    slot: item.slot,
    itemKey: item.item_key,
    name: item.name,
    rarity: item.rarity,
  }));
  const companion = getActiveCompanion(userId);

  // The combat class remains the main source of power. Hero progression is capped
  // so it contributes roughly 20–30% at the very top end.
  const levelDamage = clamp((Number(hero.level || 1) - 1) * 0.35, 0, 8);
  const statDamage = clamp((Number(hero.strength || 0) + Number(hero.intelligence || 0) + Number(hero.dexterity || 0)) / 18, 0, 9);
  const explicitDamage = clamp(bonuses.world_boss_damage, 0, 12);
  const damagePercent = clamp(levelDamage + statDamage + explicitDamage, 0, 25);

  const hpPercent = clamp((Number(hero.level || 1) - 1) * 0.25 + Number(hero.max_hp || 0) / 80, 0, 20);
  const resistancePercent = clamp(Number(hero.defense || 0) / 10 + Number(bonuses.world_boss_resistance || 0), 0, 15);

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
function damageMultiplier(player) { const s = parseSnapshot(player); return 1 + clamp(Number(s?.combat?.damagePercent || 0) + Number(s?.alchemy?.world_boss_damage || 0), 0, 40) / 100; }
function hpMultiplier(player) { return 1 + clamp(parseSnapshot(player)?.combat?.hpPercent, 0, 20) / 100; }
function resistancePercent(player) { const s = parseSnapshot(player); return clamp(Number(s?.combat?.resistancePercent || 0) + Number(s?.alchemy?.world_boss_resistance || 0), 0, 30); }
function heroSummary(player) {
  const s = parseSnapshot(player);
  const parts = [`**${heroName(player)}**`, `ур. ${Number(player?.hero_level || s.level || 1)}`];
  if (s.companion?.name) parts.push(`🐾 ${s.companion.name}`);
  return parts.join(' • ');
}

module.exports = { buildHeroSnapshot, parseSnapshot, heroName, damageMultiplier, hpMultiplier, resistancePercent, heroSummary };
