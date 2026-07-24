const crypto = require('crypto');
const { db, addCardDust, removeCardDust } = require('../../database/db');
const { getHero, addHistory, grantXp } = require('./heroService');
const { HERO_CLASSES, ORIGINS } = require('./heroData');
const { LOCATIONS, EVENTS } = require('./expeditionData');
const { EXPEDITION_LOOT, RARITY_ORDER } = require('./itemData');
const { grantItem, getEffectiveHero, getEquipmentBonuses } = require('./itemService');
const { expeditionMaterialRewards } = require('./materialService');
const { consumeContextBuffs, describeBuffKeys } = require('./alchemyService');

function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function hashNumber(text) { return parseInt(crypto.createHash('sha256').update(text).digest('hex').slice(0, 12), 16); }
function rngFromSeed(seed) { let s = hashNumber(seed) % 2147483647; return () => ((s = s * 48271 % 2147483647) - 1) / 2147483646; }
function randomInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }

function getDailyLocations(guildId = 'global', dateKey = todayKey()) {
  const entries = Object.entries(LOCATIONS);
  const rng = rngFromSeed(`gs-expeditions:${guildId}:${dateKey}`);
  const shuffled = [...entries].sort(() => rng() - 0.5);
  // Не выдаём все самые сложные локации одновременно.
  const selected = shuffled.slice(0, 5);
  if (!selected.some(([, l]) => l.difficulty <= 2)) {
    const easy = entries.find(([, l]) => l.difficulty <= 2);
    selected[4] = easy;
  }
  return selected.map(([key, data]) => ({ key, ...data }));
}

function getActiveExpedition(userId) {
  return db.prepare("SELECT * FROM hero_expeditions WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(userId) || null;
}
function getLatestExpeditions(userId, limit = 5) {
  return db.prepare('SELECT * FROM hero_expeditions WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, limit);
}
function hasStartedToday(userId) {
  const row = db.prepare("SELECT 1 FROM hero_expeditions WHERE user_id=? AND date(started_at)=date('now') LIMIT 1").get(userId);
  return Boolean(row);
}
function startExpedition(userId, locationKey, guildId = 'global') {
  const hero = getHero(userId);
  if (!hero) return { ok: false, reason: 'no_hero' };
  if (hero.status !== 'ready') return { ok: false, reason: 'busy' };
  if (getActiveExpedition(userId)) return { ok: false, reason: 'active' };
  if (hasStartedToday(userId)) return { ok: false, reason: 'daily_used' };
  const offered = getDailyLocations(guildId);
  const location = offered.find(l => l.key === locationKey);
  if (!location) return { ok: false, reason: 'not_offered' };
  const testMode = String(process.env.EXPEDITION_TEST_MODE || '').toLowerCase() === 'true';
  const durationMs = testMode ? 60 * 1000 : location.durationHours * 60 * 60 * 1000;
  const returnsAt = new Date(Date.now() + durationMs).toISOString();
  const alchemy = consumeContextBuffs(userId, 'expedition');
  const buffPayload = { bonuses: alchemy.bonuses || {}, consumed: alchemy.consumed || [], effects: describeBuffKeys(alchemy.consumed || []) };
  const info = db.prepare(`INSERT INTO hero_expeditions (user_id,location_key,status,returns_at,buffs_json) VALUES (?,?,'active',?,?)`).run(userId, locationKey, returnsAt, JSON.stringify(buffPayload));
  db.prepare("UPDATE heroes SET status='expedition', updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(userId);
  const buffText = buffPayload.effects.length ? ` Активировано: ${buffPayload.effects.map(e => `${e.icon} ${e.name}`).join(', ')}.` : '';
  addHistory(userId, 'expedition_started', `${location.icon} Герой отправился в локацию «${location.name}».${buffText}`, { expeditionId: Number(info.lastInsertRowid), locationKey, alchemy: buffPayload });
  return { ok: true, expedition: db.prepare('SELECT * FROM hero_expeditions WHERE id=?').get(info.lastInsertRowid), location };
}

function originBonus(originKey, location) {
  if (originKey === 'hunter' && location.tags.includes('nature')) return 3;
  if (originKey === 'mercenary' && (location.tags.includes('combat') || location.difficulty >= 3)) return 3;
  if (originKey === 'apprentice' && location.tags.includes('magic')) return 3;
  if (originKey === 'thief' && location.tags.includes('ruins')) return 4;
  if (originKey === 'forestborn' && location.tags.includes('nature')) return 3;
  if (originKey === 'highlander' && location.tags.includes('mountain')) return 4;
  if (originKey === 'sailor' && (location.tags.includes('water') || location.tags.includes('ruins'))) return 3;
  return 0;
}
function computeSuccessChance(hero, location, extraBonuses = {}) {
  const relevant = Number(hero[location.stat] || 0);
  const levelPower = (hero.level - 1) * 2.2;
  const classPower = Math.max(0, relevant - 7) * 1.15;
  const luckPower = hero.luck * 0.55;
  const origin = originBonus(hero.origin_key, location);
  const difficultyPenalty = location.difficulty * 11;
  const equipment = getEquipmentBonuses(hero.user_id);
  return Math.max(28, Math.min(97, 72 + levelPower + classPower + luckPower + origin + (equipment.expedition_success || 0) + (Number(extraBonuses.expedition_success) || 0) - difficultyPenalty));
}
function ensurePlayer(userId) {
  db.prepare(`INSERT OR IGNORE INTO players (user_id, username) VALUES (?, ?)`).run(userId, `Hero ${String(userId).slice(-4)}`);
}
function addReputation(userId, locationKey, amount) {
  db.prepare(`INSERT INTO hero_reputation (user_id,location_key,reputation) VALUES (?,?,?)
    ON CONFLICT(user_id,location_key) DO UPDATE SET reputation=reputation+excluded.reputation, rank=1+((reputation+excluded.reputation)/100), updated_at=CURRENT_TIMESTAMP`).run(userId, locationKey, amount);
}

function resolveExpedition(userId, { force = false } = {}) {
  const expedition = getActiveExpedition(userId);
  if (!expedition) return { ok: false, reason: 'none' };
  if (!force && Date.now() < new Date(expedition.returns_at).getTime()) return { ok: false, reason: 'not_ready', expedition };
  const baseHero = getHero(userId);
  const hero = getEffectiveHero(baseHero);
  const equipmentBonuses = getEquipmentBonuses(userId);
  let expeditionBuffs = {};
  try { expeditionBuffs = JSON.parse(expedition.buffs_json || '{}') || {}; } catch { expeditionBuffs = {}; }
  const alchemyBonuses = expeditionBuffs.bonuses || {};
  const location = LOCATIONS[expedition.location_key];
  const rng = rngFromSeed(`resolve:${expedition.id}:${expedition.user_id}:${expedition.started_at}`);
  const chance = computeSuccessChance(hero, location, alchemyBonuses);
  const roll = rng() * 100;
  let outcome = 'fail';
  if (roll <= chance * 0.25) outcome = 'great';
  else if (roll <= chance) outcome = 'success';
  else if (roll <= Math.min(97, chance + 18)) outcome = 'partial';

  let dust = 0, xp = 0, reputation = 0, item = null, injuryHours = 0, dustLost = 0;
  if (outcome === 'great') {
    dust = Math.round(randomInt(rng, ...location.dust) * 1.45); xp = Math.round(randomInt(rng, ...location.baseXp) * 1.35); reputation = 18;
    const maxTier = Math.min(5, Math.max(1, location.difficulty + (rng() < 0.28 ? 1 : 0)));
    const itemPool = [...(EXPEDITION_LOOT[maxTier] || []), ...(EXPEDITION_LOOT[Math.max(1,maxTier-1)] || [])];
    item = grantItem(userId, pick(rng, itemPool), 1, `expedition:${expedition.id}`);
  } else if (outcome === 'success') {
    dust = randomInt(rng, ...location.dust); xp = randomInt(rng, ...location.baseXp); reputation = 10;
    const findChance = Math.min(0.90, 0.34 + ((equipmentBonuses.rare_find || 0) + (Number(alchemyBonuses.rare_find) || 0)) / 100);
    if (rng() < findChance) {
      const tier = Math.max(1, Math.min(4, location.difficulty + (rng() < 0.12 ? 1 : -1)));
      item = grantItem(userId, pick(rng, EXPEDITION_LOOT[tier]), 1, `expedition:${expedition.id}`);
    }
  } else if (outcome === 'partial') {
    dust = Math.round(randomInt(rng, ...location.dust) * 0.45); xp = Math.round(randomInt(rng, ...location.baseXp) * 0.65); reputation = 4;
  } else {
    xp = Math.max(5, Math.round(randomInt(rng, ...location.baseXp) * 0.35));
    injuryHours = location.difficulty >= 4 ? 8 : 4;
    ensurePlayer(userId);
    const wantedLoss = randomInt(rng, 10, 25) * location.difficulty;
    const removal = removeCardDust(userId, wantedLoss);
    if (removal.ok) dustLost = wantedLoss;
  }
  ensurePlayer(userId);
  if (dust > 0) addCardDust(userId, dust);
  const leveledHero = grantXp(userId, xp);
  addReputation(userId, expedition.location_key, reputation);
  const recoveryUntil = injuryHours ? new Date(Date.now() + injuryHours * 3600000).toISOString() : null;
  db.prepare("UPDATE heroes SET status=?, recovery_until=?, hp=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
    .run(injuryHours ? 'wounded' : 'ready', recoveryUntil, injuryHours ? Math.max(1, Math.round(baseHero.max_hp * 0.35)) : baseHero.max_hp, userId);
  const resourceRewards = expeditionMaterialRewards(userId, expedition.location_key, location.difficulty, outcome, expedition.id);
  const result = { outcome, chance: Math.round(chance), alchemy: expeditionBuffs.effects || [], alchemyBonuses, roll: Math.round(roll), dust, dustLost, xp, reputation, item: item ? { name: item.name, rarity: item.rarity } : null, materials: resourceRewards.materials.map(m => ({ key: m.key, name: m.name, icon: m.icon, quantity: m.quantity })), chest: resourceRewards.chest ? { key: resourceRewards.chest.key, name: resourceRewards.chest.name, icon: resourceRewards.chest.icon } : null, injuryHours, event: pick(rng, EVENTS[outcome]), levelsGained: leveledHero?.levelsGained || 0 };
  db.prepare("UPDATE hero_expeditions SET status='resolved', resolved_at=CURRENT_TIMESTAMP, result_json=? WHERE id=?").run(JSON.stringify(result), expedition.id);
  const alchemyText = result.alchemy.length ? ` Использовано: ${result.alchemy.map(e => `${e.icon} ${e.name}`).join(', ')}.` : '';
  const rewardText = [dust ? `+${dust} Dust` : null, dustLost ? `−${dustLost} Dust` : null, `+${xp} XP`, item ? `предмет «${item.name}»` : null, result.materials.length ? `материалы ×${result.materials.reduce((sum,m)=>sum+m.quantity,0)}` : null, result.chest ? `сундук «${result.chest.name}»` : null].filter(Boolean).join(', ');
  addHistory(userId, 'expedition_resolved', `${location.icon} ${location.name}: ${result.event} Награда: ${rewardText}.${alchemyText}`, { expeditionId: expedition.id, ...result });
  return { ok: true, expedition: { ...expedition, status: 'resolved' }, location: { key: expedition.location_key, ...location }, result };
}

function recoverHero(userId) {
  const hero = getHero(userId);
  if (!hero || hero.status !== 'wounded') return false;
  if (hero.recovery_until && Date.now() < new Date(hero.recovery_until).getTime()) return false;
  db.prepare("UPDATE heroes SET status='ready', recovery_until=NULL, hp=max_hp, updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(userId);
  addHistory(userId, 'hero_recovered', 'Герой полностью восстановился после ранения.');
  return true;
}

module.exports = { todayKey, getDailyLocations, getActiveExpedition, getLatestExpeditions, startExpedition, resolveExpedition, recoverHero, computeSuccessChance };
