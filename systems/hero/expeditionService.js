const crypto = require('crypto');
const { db, addCardDust, removeCardDust } = require('../../database/db');
const { getHero, addHistory, grantXp } = require('./heroService');
const { HERO_CLASSES, ORIGINS } = require('./heroData');
const { LOCATIONS, LOCATION_RARITIES, EVENTS } = require('./expeditionData');
const { EXPEDITION_LOOT, RARITY_ORDER } = require('./itemData');
const { grantItem, getEffectiveHero, getEquipmentBonuses } = require('./itemService');
const { grantCompanion } = require('./companionService');
const { expeditionMaterialRewards } = require('./materialService');
const { consumeContextBuffs, describeBuffKeys, getBuffBonuses } = require('./alchemyService');
const { normalizeClassKey, isValidClass, ensureClassProgress, grantClassXp, getClassProgress } = require('./classProgressService');
const { applyExpeditionResult, getRegionEffects } = require('../world/worldService');
const { rollMinibossEncounter } = require('../world/minibossService');
const { grantResource, resourceMeta } = require('./resourceService');


function ensureTreasureMapState() {
  db.exec(`CREATE TABLE IF NOT EXISTS hero_expedition_utilities(
    user_id TEXT PRIMARY KEY,
    treasure_map_active INTEGER NOT NULL DEFAULT 0,
    activated_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}
function getTreasureMapState(userId) {
  ensureTreasureMapState();
  return Boolean(db.prepare('SELECT treasure_map_active FROM hero_expedition_utilities WHERE user_id=?').get(String(userId))?.treasure_map_active);
}
function activateTreasureMap(userId) {
  ensureTreasureMapState();
  if (getTreasureMapState(userId)) return {ok:false,reason:'already_active'};
  const row=db.prepare(`SELECT id,quantity FROM hero_inventory WHERE user_id=? AND item_key='treasure_map' AND quantity>0 ORDER BY id LIMIT 1`).get(String(userId));
  if(!row)return {ok:false,reason:'none'};
  db.transaction(()=>{
    if(Number(row.quantity)>1)db.prepare('UPDATE hero_inventory SET quantity=quantity-1 WHERE id=?').run(row.id);
    else db.prepare('DELETE FROM hero_inventory WHERE id=?').run(row.id);
    db.prepare(`INSERT INTO hero_expedition_utilities(user_id,treasure_map_active,activated_at,updated_at)
      VALUES(?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET treasure_map_active=1,activated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).run(String(userId));
  })();
  return {ok:true};
}
function consumeTreasureMapState(userId) {
  ensureTreasureMapState();
  const changed=db.prepare(`UPDATE hero_expedition_utilities SET treasure_map_active=0,updated_at=CURRENT_TIMESTAMP
    WHERE user_id=? AND treasure_map_active=1`).run(String(userId));
  return changed.changes===1;
}

const EXPEDITION_TACTICS = {
  balanced: { key:'balanced', icon:'⚖️', name:'Сбалансированно', description:'Ровный риск и награда.', success:0, xp:1, dust:1, rare:0, injury:1 },
  cautious: { key:'cautious', icon:'🛡️', name:'Осторожно', description:'Герой избегает лишнего риска, но засады и неудачи всё равно возможны.', success:8, xp:0.82, dust:0.82, rare:-8, injury:0.72 },
  aggressive: { key:'aggressive', icon:'⚔️', name:'Агрессивно', description:'Больше боёв, опыта и риска получить серьёзные ранения.', success:-6, xp:1.28, dust:1.08, rare:6, injury:1.38 },
  treasure: { key:'treasure', icon:'💰', name:'Искать сокровища', description:'Выше шанс предметов и сундуков, но чаще встречаются ловушки.', success:-4, xp:0.92, dust:1.18, rare:14, injury:1.18 },
  experience: { key:'experience', icon:'📚', name:'Искать опыт', description:'Герой чаще вступает в бой ради прокачки класса.', success:-5, xp:1.42, dust:0.82, rare:2, injury:1.25 },
  resources: { key:'resources', icon:'🌿', name:'Собирать ресурсы', description:'Больше материалов, меньше Dust и редких предметов.', success:3, xp:0.88, dust:0.72, rare:-5, injury:0.9, materials:1.45 },
};
function normalizeTacticKey(value) { return EXPEDITION_TACTICS[value] ? value : 'balanced'; }
function getExpeditionTactic(value) { return EXPEDITION_TACTICS[normalizeTacticKey(value)]; }

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
  for (const hour of [13, 20]) {
    const candidate = new Date(Date.UTC(y, m, d, hour, 0, 0) - MSK);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return new Date(Date.UTC(y, m, d + 1, 13, 0, 0) - MSK);
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
function availableExpeditionDurations(now = new Date()) {
  if (activeWorldBoss()) return [];
  return [2, 4, 8].filter(hours => expeditionWindow(now, hours).fits);
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

function hasActiveDungeon(userId) {
  try {
    return Boolean(db.prepare(`SELECT 1 FROM dungeon_members m JOIN dungeon_groups g ON g.id=m.group_id WHERE m.user_id=? AND g.status='active' LIMIT 1`).get(String(userId)));
  } catch (_) { return false; }
}


function getExpeditionStartPreview(userId, locationKey, guildId = 'global', tacticKey = 'balanced', durationHours = 4) {
  const hero = getHero(userId);
  if (!hero) return { ok:false, reason:'no_hero' };
  const location = getDailyLocations(guildId).find(l => l.key === locationKey);
  if (!location) return { ok:false, reason:'not_offered' };
  const effectiveHero = getEffectiveHero(hero);
  const alchemyBonuses = getBuffBonuses(userId, 'expedition') || {};
  const worldEffects = getRegionEffects(guildId || 'global', location.region);
  const bonuses = {
    ...alchemyBonuses,
    expedition_success: (Number(alchemyBonuses.expedition_success) || 0) + Number(worldEffects.success || 0),
  };
  const chance = Math.round(computeSuccessChance(effectiveHero, location, bonuses, tacticKey, durationHours));
  return { ok:true, hero:effectiveHero, location, bonuses, worldEffects, chance };
}

function startExpedition(userId, locationKey, guildId = 'global', classKey = null, tacticKey = 'balanced', durationHours = 4) {
  const hero = getHero(userId);
  if (!hero) return { ok: false, reason: 'no_hero' };
  if (hasActiveDungeon(userId)) return { ok: false, reason: 'dungeon_active' };
  if (hero.status !== 'ready') return { ok: false, reason: 'busy' };
  classKey = normalizeClassKey(classKey || hero.class_key);
  if (!isValidClass(classKey)) return { ok: false, reason: 'invalid_class' };
  ensureClassProgress(userId, classKey);
  tacticKey = normalizeTacticKey(tacticKey);
  durationHours = [2,4,8].includes(Number(durationHours)) ? Number(durationHours) : 4;
  if (getActiveExpedition(userId)) return { ok: false, reason: 'active' };
  const cooldown = getExpeditionCooldown(userId);
  if (cooldown) return { ok:false, reason:'cooldown', cooldownUntil:cooldown.cooldown_until };
  if (activeWorldBoss()) return { ok: false, reason: 'boss_active' };
  const offered = getDailyLocations(guildId);
  const location = offered.find(l => l.key === locationKey);
  if (!location) return { ok: false, reason: 'not_offered' };
  const testMode = String(process.env.EXPEDITION_TEST_MODE || '').toLowerCase() === 'true';
  const durationMs = testMode ? 60 * 1000 : durationHours * 60 * 60 * 1000;
  const window = expeditionWindow(new Date(), testMode ? 1/60 : durationHours);
  if (!testMode && !window.fits) return { ok: false, reason: 'boss_window', nextBossAt: window.nextBoss.toISOString() };
  const returnsAt = new Date(Date.now() + durationMs).toISOString();
  // Calculate the exact chance from the same daily-location snapshot and the same active bonuses
  // that were shown in the confirmation menu. Only after that do we consume the buffs.
  const preview = getExpeditionStartPreview(userId, locationKey, guildId, tacticKey, durationHours);
  if (!preview.ok) return preview;
  const alchemy = consumeContextBuffs(userId, 'expedition');
  const treasureMap = consumeTreasureMapState(userId);
  const worldEffectsAtStart = preview.worldEffects;
  const effectiveHero = preview.hero;
  const startChance = preview.chance;
  const buffPayload = {
    bonuses: {
      ...(alchemy.bonuses || {}),
      rare_find: Number(alchemy.bonuses?.rare_find || 0) + (treasureMap ? 20 : 0),
    },
    consumed: alchemy.consumed || [],
    effects: [...describeBuffKeys(alchemy.consumed || []), ...(treasureMap ? [{icon:'🗺️',name:'Карта сокровищ'}] : [])],
    treasureMap,
    successChance:startChance,
    worldEffects:{ success:Number(worldEffectsAtStart.success||0), eventKey:worldEffectsAtStart.event?.key||null }
  };
  const heroSnapshot = {
    name: effectiveHero.name, level: effectiveHero.level, hp: effectiveHero.hp, max_hp: effectiveHero.max_hp,
    class_key: hero.class_key, origin_key: hero.origin_key,
    strength: effectiveHero.strength, defense: effectiveHero.defense, dexterity: effectiveHero.dexterity,
    intelligence: effectiveHero.intelligence, luck: effectiveHero.luck,
  };
  const info = db.prepare(`INSERT INTO hero_expeditions
    (user_id,location_key,status,returns_at,buffs_json,guild_id,location_snapshot_json,hero_snapshot_json,hp_before,class_key,tactic_key,duration_hours)
    VALUES (?,?,'active',?,?,?,?,?,?,?,?,?)`).run(
      userId, locationKey, returnsAt, JSON.stringify(buffPayload), guildId,
      JSON.stringify(location), JSON.stringify(heroSnapshot), Number(hero.hp || hero.max_hp || 0), classKey, tacticKey, durationHours
    );
  db.prepare("UPDATE heroes SET status='expedition', updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(userId);
  const buffText = buffPayload.effects.length ? ` Активировано: ${buffPayload.effects.map(e => `${e.icon} ${e.name}`).join(', ')}.` : '';
  recordActivity(guildId,userId,location,'started',`${location.icon} ${playerName(userId)} отправился в «${location.name}»`,location.rarity,0);
  const tactic = getExpeditionTactic(tacticKey);
  addHistory(userId, 'expedition_started', `${location.icon} Герой отправился в локацию «${location.name}». Тактика: ${tactic.icon} ${tactic.name}.${buffText}`, { expeditionId: Number(info.lastInsertRowid), locationKey, classKey, tacticKey, durationHours, alchemy: buffPayload });
  return { ok: true, expedition: db.prepare('SELECT * FROM hero_expeditions WHERE id=?').get(info.lastInsertRowid), location, chance:startChance };
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
function durationModifiers(durationHours = 4) {
  const hours = [2,4,8].includes(Number(durationHours)) ? Number(durationHours) : 4;
  if (hours === 2) return { hours, reward:0.62, xp:0.68, materials:0.65, rare:-5, injury:-2 };
  if (hours === 8) return { hours, reward:1.85, xp:1.75, materials:1.8, rare:10, injury:4 };
  return { hours:4, reward:1, xp:1, materials:1, rare:0, injury:0 };
}
function rewardPreview(location, tacticKey='balanced', durationHours=4) {
  const tactic=getExpeditionTactic(tacticKey), dm=durationModifiers(durationHours);
  const xpMin=Math.max(5,Math.round(location.baseXp[0]*0.65*Number(tactic.xp||1)*dm.xp));
  const xpMax=Math.max(xpMin,Math.round(location.baseXp[1]*1.35*Number(tactic.xp||1)*dm.xp));
  const dustMin=Math.max(0,Math.round(location.dust[0]*0.45*Number(tactic.dust||1)*dm.reward));
  const dustMax=Math.max(dustMin,Math.round(location.dust[1]*1.45*Number(tactic.dust||1)*dm.reward));
  return { durationHours:dm.hours, heroXp:[xpMin,xpMax], classXp:[Math.max(10,Math.round(xpMin*0.75)),Math.max(10,Math.round(xpMax*0.75))], dust:[dustMin,dustMax], rareBonus:dm.rare+Number(tactic.rare||0), materialMultiplier:Math.round(Number(tactic.materials||1)*dm.materials*100)/100 };
}
function computeSuccessChance(hero, location, extraBonuses = {}, tacticKey = 'balanced', durationHours = 4) {
  // Базовый риск зависит прежде всего от опасности локации. Развитие героя
  // помогает, но больше не разгоняет экспедиции до почти гарантированных 90–96%.
  const baseByDifficulty = { 1:50, 2:45, 3:40, 4:30, 5:20, 6:10 };
  const difficulty = Math.max(1, Math.min(6, Number(location.difficulty || 1)));
  const baseChance = baseByDifficulty[difficulty];

  const relevantKey=location.stat==='defense'?'vitality':location.stat;
  const relevant = Number(hero[relevantKey] || hero[location.stat] || 0);
  const levelBonus = Math.min(8, Math.max(0, (Number(hero.level || 1) - 1) * 0.8));
  const statBonus = Math.min(8, Math.max(0, (relevant - 7) * 0.8));
  const luckBonus = Math.min(4, Math.max(0, Number(hero.luck || 0) * 0.35));
  const origin = Math.max(-4, Math.min(4, Number(originBonus(hero.origin_key, location) || 0)));

  const equipment = getEquipmentBonuses(hero.user_id);
  const itemAndBuffBonus = Math.max(-8, Math.min(8,
    Number(equipment.expedition_success || 0) + Number(extraBonuses.expedition_success || 0)
  ));
  const environmentBonus = Math.max(-8, Math.min(8,
    Number(location.dailyTheme?.success || 0) + Number(location.weather?.success || 0)
  ));
  const tacticBonus = Number(getExpeditionTactic(tacticKey).success || 0);
  const hours = Number(durationHours || 4);
  const durationBonus = hours === 2 ? 6 : hours === 8 ? -8 : 0;

  const raw = baseChance + levelBonus + statBonus + luckBonus + origin
    + itemAndBuffBonus + environmentBonus + tacticBonus + durationBonus;
  return Math.max(10, Math.min(75, raw));
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
    success: ['Путь оказался трудным, но осторожность помогла избежать главных ловушек.', 'После короткой схватки герой продолжил поиски и собрал найденные по пути ресурсы.'],
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
  const tactic = getExpeditionTactic(expedition.tactic_key);
  const duration = durationModifiers(expedition.duration_hours || 4);
  const worldEffects = getRegionEffects(expedition.guild_id || 'global', location.region);
  const chance = Number(expeditionBuffs.successChance || 0) || computeSuccessChance(hero, location, { ...alchemyBonuses, expedition_success:(Number(alchemyBonuses.expedition_success)||0)+Number(worldEffects.success||0) }, tactic.key, expedition.duration_hours || 4);
  const roll = rng() * 100;
  let outcome = 'fail';
  if (roll <= chance * 0.25) outcome = 'great';
  else if (roll <= chance) outcome = 'success';
  else if (roll <= Math.min(97, chance + 18)) outcome = 'partial';
  console.log(`[Expedition] #${expedition.id} user=${userId} chance=${Number(chance).toFixed(2)} roll=${roll.toFixed(4)} outcome=${outcome}`);

  let dust = 0, xp = 0, reputation = 0, item = null, companion = null, injuryHours = 0, dustLost = 0;
  const theme = location.dailyTheme || {};
  const weather = location.weather || {};
  const dustMultiplier = Number(theme.dust || 1) * Number(weather.dust || 1) * Number(worldEffects.dust || 1);
  const themeRare = Number(theme.rare || 0) + Number(weather.rare || 0) + Number(tactic.rare || 0) + Number(worldEffects.rare || 0);
  const xpMultiplier = Number(tactic.xp || 1) * Number(worldEffects.xp || 1) * duration.xp * (1 + (Number(alchemyBonuses.class_xp_bonus) || 0) / 100);
  const tacticDustMultiplier = Number(tactic.dust || 1) * duration.reward;
  if (outcome === 'great') {
    dust = Math.round(randomInt(rng, ...location.dust) * 1.45 * dustMultiplier * tacticDustMultiplier); xp = Math.round(randomInt(rng, ...location.baseXp) * 1.35 * xpMultiplier); reputation = 18;
    const maxTier = Math.min(5, Math.max(1, location.difficulty + (rng() < 0.28 ? 1 : 0)));
    const itemPool = [...(EXPEDITION_LOOT[maxTier] || []), ...(EXPEDITION_LOOT[Math.max(1,maxTier-1)] || [])];
    item = grantItem(userId, pick(rng, itemPool), 1, `expedition:${expedition.id}`);
  } else if (outcome === 'success') {
    dust = Math.round(randomInt(rng, ...location.dust) * dustMultiplier * tacticDustMultiplier); xp = Math.round(randomInt(rng, ...location.baseXp) * xpMultiplier); reputation = 10;
    const findChance = Math.min(0.94, 0.34 + ((equipmentBonuses.rare_find || 0) + (Number(alchemyBonuses.rare_find) || 0) + themeRare) / 100);
    if (rng() < findChance) {
      const tier = Math.max(1, Math.min(4, location.difficulty + (rng() < 0.12 ? 1 : -1)));
      item = grantItem(userId, pick(rng, EXPEDITION_LOOT[tier]), 1, `expedition:${expedition.id}`);
    }
  } else if (outcome === 'partial') {
    dust = Math.round(randomInt(rng, ...location.dust) * 0.45 * dustMultiplier * tacticDustMultiplier); xp = Math.round(randomInt(rng, ...location.baseXp) * 0.65 * xpMultiplier); reputation = 4;
  } else {
    xp = Math.max(5, Math.round(randomInt(rng, ...location.baseXp) * 0.35 * xpMultiplier));
    injuryHours = location.difficulty >= 4 || tactic.key === 'aggressive' ? 3 : 2;
    if ((Number(alchemyBonuses.injury_resistance) || 0) > 0 && rng() * 100 < Number(alchemyBonuses.injury_resistance)) injuryHours = Math.max(0, injuryHours - 1);
    ensurePlayer(userId);
    const wantedLoss = randomInt(rng, 10, 25) * location.difficulty;
    const removal = removeCardDust(userId, wantedLoss);
    if (removal.ok) dustLost = wantedLoss;
  }
  const expeditionClassKey = normalizeClassKey(expedition.class_key || baseHero.class_key);
  const miniboss = rollMinibossEncounter({
    guildId: expedition.guild_id || 'global', userId, expeditionId: expedition.id,
    location, hero, classKey: expeditionClassKey, tactic, worldEffects,
  });
  if (miniboss) {
    xp += Number(miniboss.xp || 0);
    if (miniboss.outcome === 'defeat') {
      dust = Math.round(dust * 0.40);
      injuryHours = 3;
      outcome = 'fail';
    } else if (miniboss.outcome === 'escape') {
      dust = Math.round(dust * 0.75);
      injuryHours = Math.max(injuryHours, 2);
    } else if (miniboss.outcome === 'victory' && miniboss.remainingHp <= Math.round(Number(hero.max_hp || 100) * 0.20)) {
      injuryHours = 3;
    }
  }

  if (outcome === 'partial' && injuryHours === 0 && rng() < Math.max(0.05, 0.22 - (Number(alchemyBonuses.injury_resistance) || 0) / 100)) injuryHours = 1;
  injuryHours = Math.max(0, Math.min(3, Number(injuryHours)||0));

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
  if (dust > 0) addCardDust(userId, dust, `Награда экспедиции #${expedition.id}`);
  const leveledHero = grantXp(userId, xp);
  const classXp = Math.max(10, Math.round(xp * 0.75));
  const classProgress = grantClassXp(userId, expeditionClassKey, classXp, { completed:true });
  addReputation(userId, expedition.location_key, reputation);
  const recoveryUntil = injuryHours ? new Date(Date.now() + injuryHours * 3600000).toISOString() : null;
  const hpAfter = miniboss ? Math.max(1, Math.min(baseHero.max_hp, Number(miniboss.remainingHp || 1))) : (injuryHours ? Math.max(1, Math.round(baseHero.max_hp * 0.35)) : baseHero.max_hp);
  const forceReadyAfterClaim = Boolean(expeditionBuffs?.patchCompensation?.forceReadyAfterClaim);
  db.prepare("UPDATE heroes SET status=?, recovery_until=?, hp=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?")
    .run(forceReadyAfterClaim ? 'ready' : (injuryHours ? 'wounded' : 'ready'), forceReadyAfterClaim ? null : recoveryUntil, forceReadyAfterClaim ? Number(baseHero.max_hp || hpAfter) : hpAfter, userId);
  if (forceReadyAfterClaim) injuryHours = 0;
  const resourceRewards = expeditionMaterialRewards(userId, expedition.location_key, location.difficulty, outcome, expedition.id);
  let treasureMapReward = null;
  if (expeditionBuffs.treasureMap) {
    const mapRoll = rng();
    if (mapRoll < 0.08) {
      const tier = Math.max(2, Math.min(5, Number(location.difficulty || 1) + 1));
      const pool = EXPEDITION_LOOT[tier] || EXPEDITION_LOOT[2] || [];
      if (pool.length) {
        const mapItem = grantItem(userId, pick(rng, pool), 1, `expedition:${expedition.id}:treasure_map`);
        if (mapItem) treasureMapReward = {type:'item',name:mapItem.name,rarity:mapItem.rarity};
      }
    } else if (mapRoll < 0.32) {
      const bonusDust = randomInt(rng, 70, 150) * Math.max(1, Number(location.difficulty || 1));
      addCardDust(userId, bonusDust, `Карта сокровищ: экспедиция #${expedition.id}`);
      treasureMapReward = {type:'dust',dust:bonusDust};
    } else {
      const candidates = ['gemstone','ancient_wood','pearl','crystal','essence'];
      const key = pick(rng, candidates);
      const quantity = Math.max(1, Math.min(4, Math.ceil(Number(location.difficulty || 1) / 2)));
      grantResource(userId,key,quantity,`expedition:${expedition.id}:treasure_map`);
      const meta=resourceMeta(key);
      treasureMapReward = {type:'material',key,name:meta.name,icon:meta.icon,quantity};
    }
  }
  const materialMultiplier = Number(tactic.materials || 1) * Number(worldEffects.materials || 1) * duration.materials;
  if (materialMultiplier > 1 && Array.isArray(resourceRewards.materials)) {
    for (const material of resourceRewards.materials) {
      const extra = Math.max(0, Math.round(material.quantity * (materialMultiplier - 1)));
      if (extra > 0) {
        grantResource(userId, material.key, extra, `expedition:${expedition.id}:multiplier`);
        material.quantity += extra;
      }
    }
  }
  const incidents = [];
  const dangerChance = Math.max(0.05, Math.min(0.94, 0.16 + location.difficulty * 0.09 + Number(worldEffects.incident || 0) + (tactic.key === 'cautious' ? -0.08 : tactic.key === 'aggressive' || tactic.key === 'experience' ? 0.16 : 0)));
  if (rng() < dangerChance) {
    const threats = ['засада бандитов','стая хищников','ловушка на старой дороге','бродячие наёмники','опасное чудовище'];
    const threat = pick(rng, threats);
    const escaped = rng() < Math.max(0.18, Math.min(0.72, chance / 140 + (tactic.key === 'cautious' ? 0.14 : -0.04)));
    incidents.push(escaped ? `⚠️ Герой заметил ${threat} и сумел избежать худшего.` : `💥 Герой попал в неприятность: ${threat}. Избежать столкновения не удалось.`);
  }
  if (tactic.key === 'treasure' && rng() < 0.42) incidents.push(rng() < 0.35 ? '🪤 Подозрительный тайник оказался ловушкой.' : '📦 Поиск сокровищ вывел героя к скрытому тайнику.');
  if (tactic.key === 'resources' && rng() < 0.5) incidents.push('🌿 Герой нашёл особенно богатое место для сбора ресурсов.');
  if (miniboss) {
    const b=miniboss.boss;
    if (miniboss.outcome === 'victory') incidents.push(`👑 ${b.icon} **${b.name} побеждён!** Герой потерял ${miniboss.damageTaken} HP.${miniboss.loot.length ? ` Трофеи: ${miniboss.loot.map(x=>`${x.icon} ${x.name} ×${x.quantity}`).join(', ')}.` : ''}`);
    else if (miniboss.outcome === 'escape') incidents.push(`⚠️ ${b.icon} Встречен **${b.name}**. Герой получил ${miniboss.damageTaken} урона, но сумел уйти.`);
    else incidents.push(`💀 ${b.icon} **${b.name} оказался сильнее.** Герой получил тяжёлые ранения, и экспедиция завершилась поражением.`);
  }
  const event = [buildExpeditionStory(rng, location, outcome, { item, companion, injuryHours, dustLost, chest: resourceRewards.chest }), ...incidents].join(' ');
  const result = { outcome, miniboss: miniboss ? { key:miniboss.boss.key, name:miniboss.boss.name, icon:miniboss.boss.icon, outcome:miniboss.outcome, damageTaken:miniboss.damageTaken, remainingHp:miniboss.remainingHp, xp:miniboss.xp, dust:miniboss.dust, loot:miniboss.loot.map(x=>({key:x.key,name:x.name,icon:x.icon,quantity:x.quantity,rarity:x.rarity})), aftermath:miniboss.aftermath, firstKill:miniboss.firstKill } : null, worldEffects: { eventKey:worldEffects.event.key, eventName:worldEffects.event.name, eventIcon:worldEffects.event.icon, success:worldEffects.success, xp:worldEffects.xp, dust:worldEffects.dust, materials:worldEffects.materials, rare:worldEffects.rare, specialNpc:worldEffects.specialNpc }, tactic: { key:tactic.key, name:tactic.name, icon:tactic.icon }, incidents, chance: Math.round(chance), alchemy: expeditionBuffs.effects || [], alchemyBonuses, roll: Math.round(roll), dust, dustLost, xp, reputation, item: item ? { name: item.name, rarity: item.rarity } : null, companion, dailyTheme: theme, weather, durationHours: duration.hours, materials: resourceRewards.materials.map(m => ({ key: m.key, name: m.name, icon: m.icon, quantity: m.quantity })), treasureMapReward, chest: resourceRewards.chest ? { key: resourceRewards.chest.key, name: resourceRewards.chest.name, icon: resourceRewards.chest.icon } : null, injuryHours, event, hpBefore: Number(expedition.hp_before || baseHero.hp || baseHero.max_hp), hpAfter, levelsGained: leveledHero?.levelsGained || 0, classKey: expeditionClassKey, classXp, classLevel: classProgress?.level || 1, classLevelsGained: classProgress?.levelsGained || 0 };
  db.prepare("UPDATE hero_expeditions SET status='resolved', resolved_at=CURRENT_TIMESTAMP, result_json=?, hp_after=? WHERE id=?").run(JSON.stringify(result), hpAfter, expedition.id);
  const alchemyText = result.alchemy.length ? ` Использовано: ${result.alchemy.map(e => `${e.icon} ${e.name}`).join(', ')}.` : '';
  const rewardText = [dust ? `+${dust} Dust` : null, miniboss?.dust ? `+${miniboss.dust} Dust за мини-босса` : null, dustLost ? `−${dustLost} Dust` : null, `+${xp} XP`, item ? `предмет «${item.name}»` : null, companion ? `питомец «${companion.name}»` : null, result.materials.length ? `материалы ×${result.materials.reduce((sum,m)=>sum+m.quantity,0)}` : null, result.chest ? `сундук «${result.chest.name}»` : null].filter(Boolean).join(', ');
  recordActivity(expedition.guild_id||'global',userId,location,'resolved',`${location.icon} ${playerName(userId)} вернулся из «${location.name}»: ${outcome === 'great' ? 'редкая находка' : outcome === 'fail' ? 'неудача' : `+${dust} Dust`}`,location.rarity,dust);
  try { db.prepare(`INSERT INTO expedition_discoveries(guild_id,location_key,discovered_by,visits) VALUES(?,?,?,1) ON CONFLICT(guild_id,location_key) DO UPDATE SET visits=visits+1`).run(expedition.guild_id||'global',expedition.location_key,userId); } catch (_) {}
  let worldProgress = null;
  try { worldProgress = applyExpeditionResult(expedition.guild_id || 'global', location, result); } catch (error) { console.error('[World] expedition progress:', error.message); }
  if (worldProgress) {
    result.world = worldProgress;
    db.prepare("UPDATE hero_expeditions SET result_json=? WHERE id=?").run(JSON.stringify(result), expedition.id);
  }
  addHistory(userId, 'expedition_resolved', `${location.icon} ${location.name}: ${result.event} Награда: ${rewardText}.${alchemyText}`, { expeditionId: expedition.id, ...result });
  return { ok: true, expedition: { ...expedition, status: 'resolved' }, location: { key: expedition.location_key, ...location }, result };
}

function getExpeditionCooldown(userId) {
  try {
    const row=db.prepare('SELECT * FROM hero_expedition_cooldowns WHERE user_id=?').get(userId);
    if(!row) return null;
    if(Date.now() >= new Date(row.cooldown_until).getTime()) { db.prepare('DELETE FROM hero_expedition_cooldowns WHERE user_id=?').run(userId); return null; }
    return row;
  } catch (_) { return null; }
}

function cancelExpedition(userId) {
  const expedition=getActiveExpedition(userId);
  if(!expedition) return {ok:false,reason:'none'};
  const cooldownUntil=new Date(Date.now()+1*60*60*1000).toISOString();
  db.prepare("UPDATE hero_expeditions SET status='cancelled', resolved_at=CURRENT_TIMESTAMP, result_json=? WHERE id=?")
    .run(JSON.stringify({outcome:'cancelled',reason:'player_cancelled',rewards:false}),expedition.id);
  db.prepare("UPDATE heroes SET status='ready', updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(userId);
  db.prepare(`INSERT INTO hero_expedition_cooldowns(user_id,cooldown_until,reason) VALUES(?,?,'cancelled') ON CONFLICT(user_id) DO UPDATE SET cooldown_until=excluded.cooldown_until,reason=excluded.reason,created_at=CURRENT_TIMESTAMP`).run(userId,cooldownUntil);
  addHistory(userId,'expedition_cancelled','Экспедиция отменена игроком. Награды потеряны, следующая экспедиция доступна через 1 час.',{expeditionId:expedition.id,cooldownUntil});
  return {ok:true,expedition,cooldownUntil};
}

function recoverHero(userId) {
  const hero = getHero(userId);
  if (!hero || hero.status !== 'wounded') return false;
  if (hero.recovery_until && Date.now() < new Date(hero.recovery_until).getTime()) return false;
  db.prepare("UPDATE heroes SET status='ready', recovery_until=NULL, hp=max_hp, updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(userId);
  addHistory(userId, 'hero_recovered', 'Герой полностью восстановился после ранения.');
  return true;
}


function applyTargetedExpeditionRepairs() {
  try {
    // V18.3.19: previous builds contained a dangerous hard-coded startup repair
    // that cancelled this player's active expedition on every bot restart.
    // Restore exactly one affected expedition as a claimable result instead.
    const affectedUserId = '308557208147329025';
    db.exec(`CREATE TABLE IF NOT EXISTS expedition_patch_repairs (
      repair_key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      details_json TEXT NOT NULL DEFAULT '{}'
    )`);
    const repairKey='v18.3.19:restore-cancelled-expedition:308557208147329025';
    const already=db.prepare('SELECT 1 FROM expedition_patch_repairs WHERE repair_key=?').get(repairKey);
    if(!already){
      const cancelledRows=db.prepare(`SELECT * FROM hero_expeditions WHERE user_id=? AND status='cancelled' ORDER BY id DESC LIMIT 20`).all(affectedUserId);
      const cancelled=cancelledRows.find(row=>{try{return JSON.parse(row.result_json||'{}').reason==='admin_recovery_20260726';}catch(_){return false;}}) || null;
      if(cancelled){
        let buffs={};
        try{buffs=JSON.parse(cancelled.buffs_json||'{}')||{};}catch(_){buffs={};}
        buffs.patchCompensation={key:repairKey,forceReadyAfterClaim:true,restoredAt:new Date().toISOString()};
        db.prepare(`UPDATE hero_expeditions
          SET status='active', returns_at=datetime('now','-1 minute'), resolved_at=NULL,
              result_json=NULL, buffs_json=?
          WHERE id=?`).run(JSON.stringify(buffs),cancelled.id);
        db.prepare("UPDATE heroes SET status='expedition', recovery_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(affectedUserId);
        db.prepare('INSERT INTO expedition_patch_repairs(repair_key,details_json) VALUES(?,?)')
          .run(repairKey,JSON.stringify({userId:affectedUserId,expeditionId:cancelled.id,action:'restored_for_one_time_claim'}));
        console.log(`[Expedition Repair] Экспедиция #${cancelled.id} игрока ${affectedUserId} восстановлена для разового получения результата.`);
      }else{
        db.prepare('INSERT INTO expedition_patch_repairs(repair_key,details_json) VALUES(?,?)')
          .run(repairKey,JSON.stringify({userId:affectedUserId,action:'no_cancelled_expedition_found'}));
      }
    }

    // Preserve the old Druid/Bard migration, but make it idempotent and data-only.
    const levelUserId = '302797251271458817';
    const druid = db.prepare("SELECT level,xp,expeditions_completed FROM hero_class_progress WHERE user_id=? AND class_key='druid'").get(levelUserId);
    const bard = db.prepare("SELECT level,xp,expeditions_completed FROM hero_class_progress WHERE user_id=? AND class_key='bard'").get(levelUserId);
    if (bard && (!druid || Number(bard.level || 1) > Number(druid.level || 1))) {
      db.prepare(`INSERT INTO hero_class_progress(user_id,class_key,level,xp,expeditions_completed)
        VALUES(?,?,?,?,?)
        ON CONFLICT(user_id,class_key) DO UPDATE SET
          level=MAX(hero_class_progress.level,excluded.level),
          xp=CASE WHEN excluded.level>=hero_class_progress.level THEN excluded.xp ELSE hero_class_progress.xp END,
          expeditions_completed=MAX(hero_class_progress.expeditions_completed,excluded.expeditions_completed),
          updated_at=CURRENT_TIMESTAMP`)
        .run(levelUserId,'druid',Number(bard.level||1),Number(bard.xp||0),Number(bard.expeditions_completed||0));
    }
  } catch (error) {
    console.error('[Expedition Repair] Ошибка безопасного восстановления:', error.message);
  }
}
applyTargetedExpeditionRepairs();

ensureTreasureMapState();
module.exports = { getExpeditionStartPreview, EXPEDITION_TACTICS, getExpeditionTactic, getTreasureMapState, activateTreasureMap, durationModifiers, rewardPreview, todayKey, getWorldStats, getWorldActivity, getDailyWorld, getDailyLocations, getActiveExpedition, getLatestExpeditions, getExpeditionCooldown, cancelExpedition, startExpedition, resolveExpedition, recoverHero, computeSuccessChance, nextBossAt, expeditionWindow, availableExpeditionDurations, activeWorldBoss};
