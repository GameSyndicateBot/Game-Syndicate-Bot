const crypto = require('crypto');
const { db, addCardDust, removeCardDust } = require('../../database/db');
const { getHero, addHistory, grantXp } = require('./heroService');
const { HERO_CLASSES, ORIGINS } = require('./heroData');
const { LOCATIONS, LOCATION_RARITIES, EVENTS } = require('./expeditionData');
const { EXPEDITION_LOOT, RARITY_ORDER } = require('./itemData');
const { grantItem, getEffectiveHero, getEquipmentBonuses } = require('./itemService');
const { grantCompanion } = require('./companionService');
const { expeditionMaterialRewards } = require('./materialService');
const { consumeContextBuffs, describeBuffKeys } = require('./alchemyService');

function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function hashNumber(text) { return parseInt(crypto.createHash('sha256').update(text).digest('hex').slice(0, 12), 16); }
function rngFromSeed(seed) { let s = hashNumber(seed) % 2147483647; return () => ((s = s * 48271 % 2147483647) - 1) / 2147483646; }
function randomInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }

function moscowHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Moscow', hour:'2-digit', hour12:false }).format(now));
}
function specialWorldFlags(guildId='global', dateKey=todayKey(), weatherKey='clear') {
  let afterBoss = false;
  try {
    const row = db.prepare("SELECT 1 FROM world_boss_battles WHERE status IN ('victory','defeated','completed') AND date(created_at)=date('now') LIMIT 1").get();
    afterBoss = Boolean(row);
  } catch (_) {}
  return { after_boss: afterBoss, full_moon: (hashNumber(`moon:${dateKey}`) % 29) === 14, blood_moon: (hashNumber(`blood:${dateKey}`) % 45) === 0, storm: ['storm','snow'].includes(weatherKey) };
}
function isLocationEligible(location, hour, flags) {
  if (location.time === 'night' && !(hour >= 19 || hour < 6)) return false;
  if (location.time === 'day' && !(hour >= 6 && hour < 19)) return false;
  if (location.condition && !flags[location.condition]) return false;
  return true;
}
function weightedPickUnique(rng, pool, count) {
  const remaining=[...pool], out=[];
  while (remaining.length && out.length<count) {
    const total=remaining.reduce((sum,[,l])=>sum+(LOCATION_RARITIES[l.rarity]?.weight||1),0);
    let roll=rng()*total, index=0;
    for (; index<remaining.length; index++) { roll -= LOCATION_RARITIES[remaining[index][1].rarity]?.weight||1; if (roll<=0) break; }
    out.push(remaining.splice(Math.min(index,remaining.length-1),1)[0]);
  }
  return out;
}
function buildDailyWorld(guildId = 'global', dateKey = todayKey()) {
  const rng = rngFromSeed(`gs-expeditions-v162:${guildId}:${dateKey}`);
  const weatherPool = [
    { key:'clear', icon:'☀️', name:'Ясное небо', description:'Дороги открыты. Шанс успеха немного выше.', success:3, rare:0, dust:1 },
    { key:'rain', icon:'🌧️', name:'Ливень', description:'Больше трав и алхимических материалов.', success:-3, rare:4, dust:1.05 },
    { key:'fog', icon:'🌫️', name:'Густой туман', description:'Тайники встречаются чаще, но путь опаснее.', success:-4, rare:8, dust:1.05 },
    { key:'moon', icon:'🌕', name:'Полная луна', description:'Ночные и мистические маршруты становятся вероятнее.', success:0, rare:12, dust:1 },
    { key:'wind', icon:'🌬️', name:'Сильный ветер', description:'Караваны оставляют больше добычи.', success:-2, rare:2, dust:1.12 },
    { key:'storm', icon:'⛈️', name:'Гроза', description:'Открываются штормовые мировые маршруты.', success:-6, rare:16, dust:1.25 },
    { key:'snow', icon:'❄️', name:'Метель', description:'Ледяные локации получают повышенную награду.', success:-5, rare:10, dust:1.20 },
  ];
  const weather = pick(rng, weatherPool);
  const flags = specialWorldFlags(guildId,dateKey,weather.key);
  if (weather.key==='moon') flags.full_moon=true;
  const hour = moscowHour();
  let pool=Object.entries(LOCATIONS).filter(([,l])=>isLocationEligible(l,hour,flags));
  // Keep daily rotation diverse: one accessible route and no duplicate region when possible.
  let selected=weightedPickUnique(rng,pool,3);
  if (!selected.some(([,l])=>l.difficulty<=2)) {
    const easy=pool.filter(([,l])=>l.difficulty<=2).find(([k])=>!selected.some(([x])=>x===k));
    if (easy) selected[2]=easy;
  }
  const dailyThemes=[
    { key:'treasure', icon:'💰', name:'Богатая добыча', description:'Больше Dust, материалов и редких находок.', success:2, rare:12, dust:1.30 },
    { key:'danger', icon:'☠️', name:'Высокий риск', description:'Опасность выше, но награды ценнее.', success:-8, rare:18, dust:1.55 },
    { key:'mystery', icon:'🔮', name:'Неизведанный путь', description:'Повышен шанс питомца или артефакта.', success:-2, rare:8, dust:1.15 },
  ];
  const locations=selected.map(([key,data],index)=>({key,...data,durationHours:4,dailyTheme:dailyThemes[index],weather,rarityInfo:LOCATION_RARITIES[data.rarity]}));
  return {guildId,dateKey,weather,locations,flags,hour,totalCatalog:Object.keys(LOCATIONS).length};
}

function getDailyWorld(guildId = 'global', dateKey = todayKey()) {
  const row = db.prepare('SELECT * FROM expedition_daily_worlds WHERE guild_id=? AND date_key=?').get(guildId, dateKey);
  if (row) {
    try {
      const locations = JSON.parse(row.locations_json || '[]');
      const weather = JSON.parse(row.weather_json || '{}');
      if (Array.isArray(locations) && locations.length === 3) return { guildId, dateKey, weather, locations };
    } catch (_) {}
  }
  const world = buildDailyWorld(guildId, dateKey);
  db.prepare(`INSERT INTO expedition_daily_worlds(guild_id,date_key,locations_json,weather_json)
    VALUES(?,?,?,?) ON CONFLICT(guild_id,date_key) DO UPDATE SET locations_json=excluded.locations_json,weather_json=excluded.weather_json`)
    .run(guildId, dateKey, JSON.stringify(world.locations), JSON.stringify(world.weather));
  return world;
}

function getDailyLocations(guildId = 'global', dateKey = todayKey()) {
  return getDailyWorld(guildId, dateKey).locations;
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
function nextBossAt(now = new Date()) {
  const MSK = 3 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + MSK);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  for (const hour of [15, 21]) {
    const candidate = new Date(Date.UTC(y, m, d, hour, 0, 0) - MSK);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return new Date(Date.UTC(y, m, d + 1, 15, 0, 0) - MSK);
}
function activeWorldBoss() {
  try {
    return db.prepare("SELECT id,status FROM world_boss_battles WHERE status IN ('registration','class_roll','class_select','initiative_roll','active') ORDER BY id DESC LIMIT 1").get() || null;
  } catch (_) { return null; }
}
function expeditionWindow(now = new Date(), durationHours = 4) {
  const nextBoss = nextBossAt(now);
  const returnsAt = new Date(now.getTime() + durationHours * 3600000);
  return { nextBoss, returnsAt, fits: returnsAt.getTime() <= nextBoss.getTime() };
}

function playerName(userId) {
  try { return db.prepare('SELECT username FROM players WHERE user_id=?').get(userId)?.username || `Герой ${String(userId).slice(-4)}`; } catch (_) { return `Герой ${String(userId).slice(-4)}`; }
}
function recordActivity(guildId,userId,location,eventType,summary,rarity='common',dust=0) {
  const username=playerName(userId);
  db.prepare('INSERT INTO expedition_activity(guild_id,user_id,username,location_key,event_type,summary,rarity,dust) VALUES(?,?,?,?,?,?,?,?)')
    .run(guildId||'global',userId,username,location.key||location.location_key,eventType,summary,rarity,dust||0);
  db.prepare('DELETE FROM expedition_activity WHERE id NOT IN (SELECT id FROM expedition_activity ORDER BY id DESC LIMIT 500)').run();
}
function getWorldActivity(guildId='global',limit=5) {
  try { return db.prepare('SELECT * FROM expedition_activity WHERE guild_id=? ORDER BY id DESC LIMIT ?').all(guildId,limit); } catch (_) { return []; }
}
function getWorldStats(guildId='global') {
  try {
    const active=db.prepare("SELECT COUNT(*) n FROM hero_expeditions WHERE guild_id=? AND status='active'").get(guildId)?.n||0;
    const completed=db.prepare("SELECT COUNT(*) n FROM hero_expeditions WHERE guild_id=? AND status='resolved' AND date(resolved_at)=date('now')").get(guildId)?.n||0;
    const failed=db.prepare("SELECT result_json FROM hero_expeditions WHERE guild_id=? AND status='resolved' AND date(resolved_at)=date('now')").all(guildId).filter(r=>{try{return JSON.parse(r.result_json||'{}').outcome==='fail'}catch{return false}}).length;
    const totalHeroes=db.prepare('SELECT COUNT(*) n FROM heroes').get()?.n||0;
    const dustToday=db.prepare("SELECT result_json FROM hero_expeditions WHERE guild_id=? AND status='resolved' AND date(resolved_at)=date('now')").all(guildId).reduce((sum,r)=>{try{return sum+(JSON.parse(r.result_json||'{}').dust||0)}catch{return sum}},0);
    return {active,free:Math.max(0,totalHeroes-active),completed,failed,dustToday};
  } catch (_) { return {active:0,free:0,completed:0,failed:0,dustToday:0}; }
}

function startExpedition(userId, locationKey, guildId = 'global') {
  const hero = getHero(userId);
  if (!hero) return { ok: false, reason: 'no_hero' };
  if (hero.status !== 'ready') return { ok: false, reason: 'busy' };
  if (getActiveExpedition(userId)) return { ok: false, reason: 'active' };
  if (activeWorldBoss()) return { ok: false, reason: 'boss_active' };
  const offered = getDailyLocations(guildId);
  const location = offered.find(l => l.key === locationKey);
  if (!location) return { ok: false, reason: 'not_offered' };
  const testMode = String(process.env.EXPEDITION_TEST_MODE || '').toLowerCase() === 'true';
  const durationMs = testMode ? 60 * 1000 : 4 * 60 * 60 * 1000;
  const window = expeditionWindow(new Date(), testMode ? 1/60 : 4);
  if (!testMode && !window.fits) return { ok: false, reason: 'boss_window', nextBossAt: window.nextBoss.toISOString() };
  const returnsAt = new Date(Date.now() + durationMs).toISOString();
  const alchemy = consumeContextBuffs(userId, 'expedition');
  const buffPayload = { bonuses: alchemy.bonuses || {}, consumed: alchemy.consumed || [], effects: describeBuffKeys(alchemy.consumed || []) };
  const heroSnapshot = {
    name: hero.name, level: hero.level, hp: hero.hp, max_hp: hero.max_hp,
    class_key: hero.class_key, origin_key: hero.origin_key,
    strength: hero.strength, defense: hero.defense, dexterity: hero.dexterity,
    intelligence: hero.intelligence, luck: hero.luck,
  };
  const info = db.prepare(`INSERT INTO hero_expeditions
    (user_id,location_key,status,returns_at,buffs_json,guild_id,location_snapshot_json,hero_snapshot_json,hp_before)
    VALUES (?,?,'active',?,?,?,?,?,?)`).run(
      userId, locationKey, returnsAt, JSON.stringify(buffPayload), guildId,
      JSON.stringify(location), JSON.stringify(heroSnapshot), Number(hero.hp || hero.max_hp || 0)
    );
  db.prepare("UPDATE heroes SET status='expedition', updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(userId);
  const buffText = buffPayload.effects.length ? ` Активировано: ${buffPayload.effects.map(e => `${e.icon} ${e.name}`).join(', ')}.` : '';
  recordActivity(guildId,userId,location,'started',`${location.icon} ${playerName(userId)} отправился в «${location.name}»`,location.rarity,0);
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
  const dailyThemeBonus = Number(location.dailyTheme?.success || 0);
  const weatherBonus = Number(location.weather?.success || 0);
  return Math.max(28, Math.min(97, 72 + dailyThemeBonus + weatherBonus + levelPower + classPower + luckPower + origin + (equipment.expedition_success || 0) + (Number(extraBonuses.expedition_success) || 0) - difficultyPenalty));
}
function ensurePlayer(userId) {
  db.prepare(`INSERT OR IGNORE INTO players (user_id, username) VALUES (?, ?)`).run(userId, `Hero ${String(userId).slice(-4)}`);
}
function addReputation(userId, locationKey, amount) {
  db.prepare(`INSERT INTO hero_reputation (user_id,location_key,reputation) VALUES (?,?,?)
    ON CONFLICT(user_id,location_key) DO UPDATE SET reputation=reputation+excluded.reputation, rank=1+((reputation+excluded.reputation)/100), updated_at=CURRENT_TIMESTAMP`).run(userId, locationKey, amount);
}

function buildExpeditionStory(rng, location, outcome, rewards = {}) {
  const openings = {
    whispering_forest: ['Под шорох древних ветвей герой углубился в Шепчущий лес.', 'Следуя по звериной тропе, герой обнаружил заброшенный охотничий лагерь.'],
    misty_marsh: ['Сквозь ядовитый туман герой пробирался по зыбким мосткам.', 'Болотные огни увели героя к затонувшему святилищу.'],
    sunken_ruins: ['Вода отступила и открыла вход в древний храм.', 'Среди затопленных колонн герой заметил следы прежней экспедиции.'],
    iron_mountains: ['На перевале разыгралась буря, скрывшая старую шахту.', 'Звон металла привёл героя к заброшенным штольням.'],
    ash_desert: ['Пепельный ветер заметал следы каравана.', 'Под раскалённым песком показались руины древней дороги.'],
    moon_catacombs: ['Лунный свет проник сквозь трещины катакомб.', 'За некромантской печатью послышался шёпот давно погибших стражей.'],
    crimson_citadel: ['Ворота Багровой цитадели открылись с тяжёлым скрипом.', 'Проклятые стражи заметили героя на внутреннем дворе крепости.'],
    void_rift: ['Пространство вокруг Разлома дрожало и искажало каждый шаг.', 'Из Пустоты донёсся зов, обещавший силу и сокровища.'],
  };
  const middle = {
    great: ['Герой разгадал скрытый механизм и добрался до нетронутого тайника.', 'Опасный противник был побеждён без единой ошибки, открыв путь к редкой добыче.'],
    success: ['Путь оказался трудным, но осторожность помогла избежать главных ловушек.', 'После короткой схватки герой продолжил поиски и собрал достойную добычу.'],
    partial: ['Непогода и ловушки заставили повернуть назад раньше времени.', 'Часть припасов была потеряна, однако герой сумел сохранить найденное.'],
    fail: ['Засада оказалась слишком хорошо подготовленной, и герою пришлось отступить.', 'Сработавшая ловушка уничтожила припасы и едва не стоила герою жизни.'],
  };
  const extras = [];
  if (rewards.companion) extras.push(`На обратном пути за героем последовал новый спутник — ${rewards.companion.name}.`);
  if (rewards.item) extras.push(`Среди находок оказался предмет «${rewards.item.name}».`);
  if (rewards.chest) extras.push(`В укрытии был найден сундук «${rewards.chest.name}».`);
  if (rewards.injuryHours) extras.push('Герой вернулся раненым и теперь нуждается в восстановлении.');
  if (rewards.dustLost) extras.push('Во время отступления часть Dust была потеряна.');
  return [pick(rng, openings[location.key] || EVENTS[outcome]), pick(rng, middle[outcome] || EVENTS[outcome]), ...extras].join(' ');
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
  let location = LOCATIONS[expedition.location_key];
  try { location = { ...location, ...(JSON.parse(expedition.location_snapshot_json || '{}') || {}) }; } catch (_) {}
  const rng = rngFromSeed(`resolve:${expedition.id}:${expedition.user_id}:${expedition.started_at}`);
  const chance = computeSuccessChance(hero, location, alchemyBonuses);
  const roll = rng() * 100;
  let outcome = 'fail';
  if (roll <= chance * 0.25) outcome = 'great';
  else if (roll <= chance) outcome = 'success';
  else if (roll <= Math.min(97, chance + 18)) outcome = 'partial';

  let dust = 0, xp = 0, reputation = 0, item = null, companion = null, injuryHours = 0, dustLost = 0;
  const theme = location.dailyTheme || {};
  const weather = location.weather || {};
  const dustMultiplier = Number(theme.dust || 1) * Number(weather.dust || 1);
  const themeRare = Number(theme.rare || 0) + Number(weather.rare || 0);
  if (outcome === 'great') {
    dust = Math.round(randomInt(rng, ...location.dust) * 1.45 * dustMultiplier); xp = Math.round(randomInt(rng, ...location.baseXp) * 1.35); reputation = 18;
    const maxTier = Math.min(5, Math.max(1, location.difficulty + (rng() < 0.28 ? 1 : 0)));
    const itemPool = [...(EXPEDITION_LOOT[maxTier] || []), ...(EXPEDITION_LOOT[Math.max(1,maxTier-1)] || [])];
    item = grantItem(userId, pick(rng, itemPool), 1, `expedition:${expedition.id}`);
  } else if (outcome === 'success') {
    dust = Math.round(randomInt(rng, ...location.dust) * dustMultiplier); xp = randomInt(rng, ...location.baseXp); reputation = 10;
    const findChance = Math.min(0.94, 0.34 + ((equipmentBonuses.rare_find || 0) + (Number(alchemyBonuses.rare_find) || 0) + themeRare) / 100);
    if (rng() < findChance) {
      const tier = Math.max(1, Math.min(4, location.difficulty + (rng() < 0.12 ? 1 : -1)));
      item = grantItem(userId, pick(rng, EXPEDITION_LOOT[tier]), 1, `expedition:${expedition.id}`);
    }
  } else if (outcome === 'partial') {
    dust = Math.round(randomInt(rng, ...location.dust) * 0.45 * dustMultiplier); xp = Math.round(randomInt(rng, ...location.baseXp) * 0.65); reputation = 4;
  } else {
    xp = Math.max(5, Math.round(randomInt(rng, ...location.baseXp) * 0.35));
    injuryHours = location.difficulty >= 4 ? 8 : 4;
    ensurePlayer(userId);
    const wantedLoss = randomInt(rng, 10, 25) * location.difficulty;
    const removal = removeCardDust(userId, wantedLoss);
    if (removal.ok) dustLost = wantedLoss;
  }
  if ((outcome === 'great' || outcome === 'success') && theme.key === 'mystery') {
    const specialRoll = rng();
    if (specialRoll < 0.06) {
      const companionKey = pick(rng, ['gray_wolf','white_eagle','shadow_fox']);
      const gained = grantCompanion(userId, companionKey, `expedition:${expedition.id}`);
      if (gained) companion = { key: companionKey, name: gained.name, rarity: gained.rarity };
    } else if (specialRoll < 0.13 && !item) {
      const artifactPool = ['dragon_fang','angel_wing'];
      item = grantItem(userId, pick(rng, artifactPool), 1, `expedition:${expedition.id}:artifact`);
    }
  }
  ensurePlayer(userId);
  if (dust > 0) addCardDust(userId, dust);
  const leveledHero = grantXp(userId, xp);
  addReputation(userId, expedition.location_key, reputation);
  const recoveryUntil = injuryHours ? new Date(Date.now() + injuryHours * 3600000).toISOString() : null;
  const hpAfter = injuryHours ? Math.max(1, Math.round(baseHero.max_hp * 0.35)) : baseHero.max_hp;
  db.prepare("UPDATE heroes SET status=?, recovery_until=?, hp=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
    .run(injuryHours ? 'wounded' : 'ready', recoveryUntil, hpAfter, userId);
  const resourceRewards = expeditionMaterialRewards(userId, expedition.location_key, location.difficulty, outcome, expedition.id);
  const event = buildExpeditionStory(rng, location, outcome, { item, companion, injuryHours, dustLost, chest: resourceRewards.chest });
  const result = { outcome, chance: Math.round(chance), alchemy: expeditionBuffs.effects || [], alchemyBonuses, roll: Math.round(roll), dust, dustLost, xp, reputation, item: item ? { name: item.name, rarity: item.rarity } : null, companion, dailyTheme: theme, weather, materials: resourceRewards.materials.map(m => ({ key: m.key, name: m.name, icon: m.icon, quantity: m.quantity })), chest: resourceRewards.chest ? { key: resourceRewards.chest.key, name: resourceRewards.chest.name, icon: resourceRewards.chest.icon } : null, injuryHours, event, hpBefore: Number(expedition.hp_before || baseHero.hp || baseHero.max_hp), hpAfter, levelsGained: leveledHero?.levelsGained || 0 };
  db.prepare("UPDATE hero_expeditions SET status='resolved', resolved_at=CURRENT_TIMESTAMP, result_json=?, hp_after=? WHERE id=?").run(JSON.stringify(result), hpAfter, expedition.id);
  const alchemyText = result.alchemy.length ? ` Использовано: ${result.alchemy.map(e => `${e.icon} ${e.name}`).join(', ')}.` : '';
  const rewardText = [dust ? `+${dust} Dust` : null, dustLost ? `−${dustLost} Dust` : null, `+${xp} XP`, item ? `предмет «${item.name}»` : null, companion ? `питомец «${companion.name}»` : null, result.materials.length ? `материалы ×${result.materials.reduce((sum,m)=>sum+m.quantity,0)}` : null, result.chest ? `сундук «${result.chest.name}»` : null].filter(Boolean).join(', ');
  recordActivity(expedition.guild_id||'global',userId,location,'resolved',`${location.icon} ${playerName(userId)} вернулся из «${location.name}»: ${outcome === 'great' ? 'редкая находка' : outcome === 'fail' ? 'неудача' : `+${dust} Dust`}`,location.rarity,dust);
  try { db.prepare(`INSERT INTO expedition_discoveries(guild_id,location_key,discovered_by,visits) VALUES(?,?,?,1) ON CONFLICT(guild_id,location_key) DO UPDATE SET visits=visits+1`).run(expedition.guild_id||'global',expedition.location_key,userId); } catch (_) {}
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

module.exports = { todayKey, getWorldStats, getWorldActivity, getDailyWorld, getDailyLocations, getActiveExpedition, getLatestExpeditions, startExpedition, resolveExpedition, recoverHero, computeSuccessChance, nextBossAt, expeditionWindow };
