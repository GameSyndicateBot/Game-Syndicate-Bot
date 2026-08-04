'use strict';

const { grantClassXp, normalizeClassKey } = require('../../systems/hero/classProgressService');

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, AttachmentBuilder,
  StringSelectMenuBuilder, PermissionsBitField,
} = require('discord.js');
const { db, getOrCreatePlayer, addCardDust } = require('../../database/db');
const { addPack } = require('../../utils/packInventory');
const { CLASSES, MINIONS, BOSSES } = require('./config');
const { createWorldBossBattleCard, cardFile } = require('../../images/worldBoss/createWorldBossBattleCard');
const { buildHeroSnapshot, parseSnapshot, heroName, damageMultiplier, hpMultiplier, resistancePercent, healingMultiplier, heroSummary, selectedClassBonuses } = require('./heroIntegration');
const { consumeContextBuffs, describeBuffKeys } = require('../../systems/hero/alchemyService');
const { getInventory } = require('../../systems/hero/itemService');
const { ITEMS } = require('../../systems/hero/itemData');
const GAME_CHANNELS = require('../../config/gameChannels');
const { checkAchievementsForUsers } = require('../../utils/checkAchievementsForUser');

const CHANNEL_ID = GAME_CHANNELS.worldBoss;
const AUTO_SCHEDULE_ENABLED = String(process.env.WORLD_BOSS_AUTO_SCHEDULE ?? 'true').toLowerCase() !== 'false';
const REGISTRATION_MS = 5 * 60 * 1000;
const ROLL_MS = 30 * 1000;
const CHOICE_MS = 30 * 1000;
const TURN_MS = 30 * 1000;
const SLOTS = [13, 20];
const SKILL_CD = 2;
const ULT_CD = 5;
const SECOND_SKILL_CD = 3;
const SECOND_SKILL_COST = 50;
const CRIT_CHANCE = 10;
const CRIT_MULTIPLIER = 1.75;
const BOSS_CRIT_CHANCE = 10;
const BOSS_CRIT_MULTIPLIER = 1.75;
const SELF_HEAL_CD = 1;

let clientRef = null;
let scheduler = null;
const timers = new Map();
let busy = false;

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const shuffle = a => [...a].sort(() => Math.random() - 0.5);

function init() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS world_boss_battles(
   id INTEGER PRIMARY KEY AUTOINCREMENT, quick_round_id INTEGER, channel_id TEXT NOT NULL, message_id TEXT,
   boss_card_id INTEGER NOT NULL, boss_name TEXT NOT NULL, boss_hp INTEGER NOT NULL, boss_max_hp INTEGER NOT NULL,
   status TEXT NOT NULL DEFAULT 'registration', round_no INTEGER NOT NULL DEFAULT 0, turn_index INTEGER NOT NULL DEFAULT 0,
   turn_deadline INTEGER, registration_ends_at INTEGER, state_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, ended_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS world_boss_players(
   battle_id INTEGER NOT NULL,user_id TEXT NOT NULL,hero_name TEXT,hero_level INTEGER DEFAULT 1,hero_snapshot_json TEXT DEFAULT '{}',class_key TEXT,initiative INTEGER DEFAULT 0,hp INTEGER DEFAULT 0,max_hp INTEGER DEFAULT 0,
   energy INTEGER DEFAULT 0,mana INTEGER DEFAULT 0,ult_charge INTEGER DEFAULT 0,damage_done INTEGER DEFAULT 0,healing_done INTEGER DEFAULT 0,damage_taken INTEGER DEFAULT 0,
   contribution INTEGER DEFAULT 0,status TEXT DEFAULT 'alive',effects_json TEXT DEFAULT '{}',summons_json TEXT DEFAULT '[]',joined_at INTEGER NOT NULL,
   PRIMARY KEY(battle_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS world_boss_schedule(date_key TEXT NOT NULL,slot_hour INTEGER NOT NULL,battle_id INTEGER,created_at INTEGER NOT NULL,PRIMARY KEY(date_key,slot_hour));
  CREATE TABLE IF NOT EXISTS world_boss_player_stats(
   battle_id INTEGER NOT NULL,user_id TEXT NOT NULL,shield_given INTEGER DEFAULT 0,damage_prevented INTEGER DEFAULT 0,aggro_hits INTEGER DEFAULT 0,
   support_points INTEGER DEFAULT 0,rage_reduced INTEGER DEFAULT 0,summon_damage INTEGER DEFAULT 0,summon_healing INTEGER DEFAULT 0,dot_damage INTEGER DEFAULT 0,
   crits INTEGER DEFAULT 0,misses INTEGER DEFAULT 0,executions INTEGER DEFAULT 0,PRIMARY KEY(battle_id,user_id)
  );
  `);
  const cols = new Set(db.prepare('PRAGMA table_info(world_boss_players)').all().map(x => x.name));
  if (!cols.has('mana')) db.exec('ALTER TABLE world_boss_players ADD COLUMN mana INTEGER DEFAULT 0');
  if (!cols.has('ult_charge')) db.exec('ALTER TABLE world_boss_players ADD COLUMN ult_charge INTEGER DEFAULT 0');
  if (!cols.has('hero_name')) db.exec('ALTER TABLE world_boss_players ADD COLUMN hero_name TEXT');
  if (!cols.has('hero_level')) db.exec('ALTER TABLE world_boss_players ADD COLUMN hero_level INTEGER DEFAULT 1');
  if (!cols.has('hero_snapshot_json')) db.exec("ALTER TABLE world_boss_players ADD COLUMN hero_snapshot_json TEXT DEFAULT '{}'");
}

function activeBattle() { init(); return db.prepare("SELECT * FROM world_boss_battles WHERE status IN ('registration','class_roll','class_select','initiative_roll','active') ORDER BY id DESC LIMIT 1").get(); }
function battlePlayers(id) { return db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? ORDER BY initiative DESC,joined_at ASC').all(id); }
function parse(v, fallback) { try { return JSON.parse(v || ''); } catch { return fallback; } }
function stateOf(b) { return parse(b.state_json, { log: [], minions: [], summons: [] }); }
function pushCombatEvent(battleId, text, counterKey = null) {
  const battle = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(battleId);
  if (!battle) return;
  const state = stateOf(battle);
  state.log = state.log || [];
  state.log.push(text);
  state.deathStats = state.deathStats || { players: 0, bossMinions: 0, playerSummons: 0 };
  if (counterKey) state.deathStats[counterKey] = Number(state.deathStats[counterKey] || 0) + 1;
  state.log = state.log.slice(-20);
  saveState(battle, state);
}
function saveState(b, state) { db.prepare('UPDATE world_boss_battles SET state_json=? WHERE id=?').run(JSON.stringify(state), b.id); }
function effects(p) { return parse(p.effects_json, {}); }
function updateEffects(id, user, e) { db.prepare('UPDATE world_boss_players SET effects_json=? WHERE battle_id=? AND user_id=?').run(JSON.stringify(e), id, user); }
function moscowParts(ts = Date.now()) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts)); return Object.fromEntries(p.map(x => [x.type, x.value])); }
function dateKey(ts = Date.now()) { const p = moscowParts(ts); return `${p.year}-${p.month}-${p.day}`; }
function playerLabel(p) { return `**${heroName(p)}** · <@${p.user_id}>`; }
function roleIcon(role) { return role === 'tank' ? '🛡️' : role === 'healer' ? '💚' : role === 'dps' ? '🔥' : '⚙️'; }
function resourceType(classKey) { return CLASSES[classKey]?.resourceType || 'energy'; }
function resourceMeta(classKey) { const t = resourceType(classKey); return t === 'rage' ? { key:'energy', label:'Ярость', icon:'🔥' } : t === 'holiness' ? { key:'energy', label:'Святость', icon:'✨' } : t === 'bloodlust' ? { key:'energy', label:'Кровожадность', icon:'🩸' } : t === 'mana' ? { key:'mana', label:'Мана', icon:'🔷' } : { key:'energy', label:'Энергия', icon:'⚡' }; }
function skillResourceValue(p) { const m = resourceMeta(p.class_key); return Number(p[m.key] || 0); }
function ultResourceValue(p) { return Number(p.ult_charge || 0); }
function hpBar(hp, max, size = 16) { const q = max ? Math.round(clamp(hp / max, 0, 1) * size) : 0; return '█'.repeat(q) + '░'.repeat(size - q); }
function clearTimer(id) { const t = timers.get(Number(id)); if (t) clearTimeout(t); timers.delete(Number(id)); }
function setTimer(id, fn, ms) { clearTimer(id); const t = setTimeout(fn, Math.max(500, ms)); t.unref?.(); timers.set(Number(id), t); }
function addLog(b, text) { const s = stateOf(b); s.log = [...(s.log || []), text].slice(-40); saveState(b, s); return s; }

const STAT_COLUMNS = new Set(['shield_given','damage_prevented','aggro_hits','support_points','rage_reduced','summon_damage','summon_healing','dot_damage','crits','misses','executions']);
function addBattleStat(battleId,userId,key,amount=0){
  if(!STAT_COLUMNS.has(key)||!userId||!Number.isFinite(Number(amount))||Number(amount)===0)return;
  db.prepare('INSERT OR IGNORE INTO world_boss_player_stats(battle_id,user_id) VALUES(?,?)').run(battleId,String(userId));
  db.prepare(`UPDATE world_boss_player_stats SET ${key}=${key}+? WHERE battle_id=? AND user_id=?`).run(Math.round(Number(amount)),battleId,String(userId));
}
function battleExtraStats(battleId){
  const rows=db.prepare('SELECT * FROM world_boss_player_stats WHERE battle_id=?').all(battleId);
  return Object.fromEntries(rows.map(r=>[String(r.user_id),r]));
}
function awardSupportAction(battleId,userId,classKey,action){
  const points={
    paladin:{skill:45,skill2:65,ult:120}, guardian:{skill:45,skill2:70,ult:130}, warrior:{skill2:55,ult:80},
    cleric:{skill:45,skill2:25,ult:80}, priest:{skill:50,skill2:75,ult:110}, bard:{skill:75,skill2:70,ult:150},
    engineer:{skill:35,skill2:70,ult:75}, necromancer:{skill2:35,ult:70}, mindlord:{skill2:85,ult:120},
    druid:{skill:65,skill2:80,ult:150}, shaman:{skill:70,skill2:75,ult:160}, chronomancer:{skill:85,skill2:100,ult:180},
    illusionist:{skill:70,skill2:95,ult:170}, mage:{skill2:70}
  };
  addBattleStat(battleId,userId,'support_points',Number(points[classKey]?.[action]||0));
}
function weightedPick(items,weightFn){
  if(!items.length)return null; const weights=items.map(x=>Math.max(0.01,Number(weightFn(x)||0))); let roll=Math.random()*weights.reduce((a,b)=>a+b,0);
  for(let i=0;i<items.length;i++){roll-=weights[i];if(roll<=0)return items[i];} return items[items.length-1];
}

function rolePlan(n) {
  const count = Math.max(1, Number(n || 1));
  if (count <= 5) return { tankMin: 1, tankMax: 1, healerMin: 1, healerMax: 1 };
  if (count <= 9) return { tankMin: 1, tankMax: 1, healerMin: 2, healerMax: 2 };
  return { tankMin: 2, tankMax: 2, healerMin: 2, healerMax: 3 };
}
function selectedRoleCounts(battleId) {
  const rows = db.prepare('SELECT class_key FROM world_boss_players WHERE battle_id=? AND class_key IS NOT NULL').all(battleId);
  return rows.reduce((out, row) => {
    const role = CLASSES[row.class_key]?.role;
    if (role) out[role] = Number(out[role] || 0) + 1;
    return out;
  }, { tank: 0, healer: 0, dps: 0, support: 0 });
}
function allowedClassSlots(battleId, state) {
  const available = state.availableClasses || [];
  const total = (state.classOrder || []).length;
  const remaining = Math.max(0, total - Number(state.classChoiceIndex || 0));
  const plan = rolePlan(total);
  const counts = selectedRoleCounts(battleId);
  const tankNeed = Math.max(0, plan.tankMin - counts.tank);
  const healerNeed = Math.max(0, plan.healerMin - counts.healer);
  const totalNeed = tankNeed + healerNeed;
  const forcedRoles = remaining <= totalNeed
    ? new Set([...(tankNeed ? ['tank'] : []), ...(healerNeed ? ['healer'] : [])])
    : null;
  return available.map((key, index) => ({ key, index })).filter(({ key }) => {
    const role = CLASSES[key]?.role;
    if (!role) return false;
    if (forcedRoles) return forcedRoles.has(role);
    if (role === 'tank' && counts.tank >= plan.tankMax) return false;
    if (role === 'healer' && counts.healer >= plan.healerMax) return false;
    return true;
  });
}
function roleRequirementText(battleId, state) {
  const total = (state.classOrder || []).length;
  const plan = rolePlan(total);
  const counts = selectedRoleCounts(battleId);
  return `Танки: **${counts.tank}/${plan.tankMin}** • Хилы: **${counts.healer}/${plan.healerMin}${plan.healerMax > plan.healerMin ? `–${plan.healerMax}` : ''}**`;
}
function buildClassPool(n) {
  // В меню всегда присутствуют все 12 классов хотя бы по одному разу.
  // При группе больше 12 человек добавляются повторные слоты, но базовый набор не теряется.
  const all = shuffle(Object.keys(CLASSES));
  const target = Math.max(12, Number(n || 0) + 1);
  const out = [...all];
  while (out.length < target) {
    const leastUsed = Object.keys(CLASSES).sort((a,b) =>
      out.filter(x => x === a).length - out.filter(x => x === b).length
    );
    out.push(pick(leastUsed.slice(0, Math.min(4, leastUsed.length))));
  }
  return shuffle(out);
}

function chooseUniqueBoss() {
  const recent = db.prepare(`SELECT boss_card_id FROM world_boss_battles ORDER BY id DESC LIMIT ?`).all(Math.max(1, BOSSES.length - 1));
  const blocked = new Set(recent.map(row => Number(row.boss_card_id)));
  const available = BOSSES.filter(boss => !blocked.has(Number(boss.cardId)));
  return pick(available.length ? available : BOSSES);
}

function raidSizeMultiplier(n) {
  const players = clamp(Math.round(Number(n || 6)), 4, 20);
  // Базовые параметры конфигурации рассчитаны на 6 участников.
  // До 6 человек масштаб мягко снижается, после 6 — растёт почти линейно.
  if (players <= 6) return 0.72 + (players - 4) * 0.14; // 4=0.72, 5=0.86, 6=1.00
  return Math.min(2.20, 1 + (players - 6) * 0.15);      // 12=1.90
}
function scaledHp(base, n) {
  return Math.round(Number(base || 1) * raidSizeMultiplier(n));
}
function bossMinionHpMultiplier(n) {
  const players = clamp(Math.round(Number(n || 6)), 4, 20);
  return Math.min(1.75, players <= 6 ? 0.90 + (players - 4) * 0.05 : 1 + (players - 6) * 0.10);
}
function bossMinionDamageMultiplier(n) {
  const players = clamp(Math.round(Number(n || 6)), 4, 20);
  return Math.min(1.30, players <= 6 ? 0.94 + (players - 4) * 0.03 : 1 + (players - 6) * 0.04);
}

function buttons(b) {
  if (b.status === 'registration') return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wb_join_${b.id}`).setLabel('Вступить').setEmoji('⚔️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wb_leave_${b.id}`).setLabel('Покинуть').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wb_force_start_${b.id}`).setLabel('Начать сейчас').setEmoji('▶️').setStyle(ButtonStyle.Danger),
  )];
  if (b.status === 'class_roll') return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wb_classroll_${b.id}`).setLabel('Бросить d20 за класс').setEmoji('🎲').setStyle(ButtonStyle.Primary),
  )];
  if (b.status === 'class_select') return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wb_choose_${b.id}`).setLabel('Выбрать класс').setEmoji('🧙').setStyle(ButtonStyle.Success),
  )];
  if (b.status === 'initiative_roll') return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wb_initroll_${b.id}`).setLabel('Бросить d20 на ход').setEmoji('🎲').setStyle(ButtonStyle.Primary),
  )];
  if (b.status !== 'active') return [];
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wb_attack_${b.id}`).setLabel('Атака').setEmoji('🗡️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`wb_skill_${b.id}`).setLabel('Способность I').setEmoji('✨').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wb_skill2_${b.id}`).setLabel('Способность II').setEmoji('🌟').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wb_ult_${b.id}`).setLabel('Ульта').setEmoji('💥').setStyle(ButtonStyle.Danger),
  )];
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wb_status_${b.id}`).setLabel('Моя карта').setEmoji('🎴').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wb_log_${b.id}`).setLabel('Журнал').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wb_summons_${b.id}`).setLabel('Мои призывы').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wb_enemies_${b.id}`).setLabel('Враги').setEmoji('👾').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wb_bag_${b.id}`).setLabel('Сумка').setEmoji('🎒').setStyle(ButtonStyle.Primary),
  ));
  return rows;
}

function summonsText(state) {
  const list = state.summons || [];
  if (!list.length) return null;
  const groups = new Map();
  for (const s of list) { if (!groups.has(s.owner)) groups.set(s.owner, []); groups.get(s.owner).push(s); }
  const lines = [];
  for (const [owner, arr] of groups) {
    lines.push(`**<@${owner}>**`);
    arr.forEach((s, i) => lines.push(`${s.icon || '▫️'} ${s.name}${arr.filter(x => x.type === s.type).length > 1 ? ` #${i + 1}` : ''}: ❤️ ${s.hp}/${s.maxHp} • ⏳ ${s.rounds} р.`));
  }
  return lines.join('\n').slice(0, 1024);
}
function splitFieldLines(lines,max=1024){const out=[];let current='';for(const raw of lines){const line=String(raw||'—');const next=current?`${current}\n${line}`:line;if(next.length>max){if(current)out.push(current);current=line.slice(0,max);}else current=next;}if(current)out.push(current);return out.length?out:['—'];}

function buildEmbed(b, players) {
  const state = stateOf(b), alive = players.filter(p => p.status === 'alive');
  const current = b.status === 'active' ? alive[b.turn_index % Math.max(1, alive.length)] : null;
  const e = new EmbedBuilder().setColor(['registration','class_roll','class_select','initiative_roll'].includes(b.status) ? 0x8b5cf6 : b.status === 'active' ? 0xdc2626 : 0x22c55e)
    .setTitle(`👹 Мировой босс — ${b.boss_name}`)
    .setDescription(`❤️ **${b.boss_hp}/${b.boss_max_hp} HP**\n${hpBar(b.boss_hp, b.boss_max_hp, 20)}${b.status === 'active' ? `\n🔥 **Ярость: ${Number(state.rage || 0)}/100**\n🛡️ Физ. резист: **${BOSSES.find(x => x.cardId === b.boss_card_id)?.physicalResist || 0}%** • Маг. резист: **${BOSSES.find(x => x.cardId === b.boss_card_id)?.magicResist || 0}%**` : ''}`);
  if (b.status === 'registration') e.addFields({ name: 'Регистрация', value: `До <t:${Math.floor(b.registration_ends_at / 1000)}:R>\nМинимум: **4** • Участников: **${players.length}**` });
  if (b.status === 'class_roll') { const rolled = Object.keys(state.classRolls || {}).length; e.addFields({ name: '🎲 Бросок за выбор класса', value: `Бросили: **${rolled}/${players.length}**\nДо завершения: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}\nНе бросившие выберут классы **последними**.` }); }
  if (b.status === 'class_select') {
    const order = state.classOrder || [], idx = state.classChoiceIndex || 0, who = order[idx];
    e.addFields({ name: '🧙 Выбор классов', value: `Сейчас выбирает: ${who ? playerLabel(players.find(p => p.user_id === who) || { user_id: who }) : '—'}\nДо автовыбора: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}\nОсталось классов: **${(state.availableClasses || []).length}**` });
  }
  if (b.status === 'initiative_roll') e.addFields({ name: '🎲 Инициатива боя', value: `Бросили: **${Object.keys(state.initiativeRolls || {}).length}/${players.length}**\nДо автоброска: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}` });
  if (b.status === 'active') { const turnNo = alive.length ? (b.turn_index % alive.length) + 1 : 0; e.addFields({ name: '▶️ Сейчас ходит', value: `${current ? `<@${current.user_id}> • ${roleIcon(CLASSES[current.class_key]?.role)} **${CLASSES[current.class_key]?.name}**` : '—'}\n**Ход ${turnNo} из ${alive.length}** • Раунд **${b.round_no}**\nДо автоатаки: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}` }); const cfg=BOSSES.find(x=>x.cardId===b.boss_card_id)||{}; const mech={shadow_dome:'🛡️ Теневой купол',void_absorption:'🕳️ Поглощение Пустоты',chaos_rift:'🌀 Разлом Хаоса',overheat:`🔥 Перегрев: ${Number(state.ironHeat||0)}%`,storm_charge:`⚡ Накопление грозы: ${Number(state.stormCharge||0)}%`,decay_curse:'☠️ Проклятие Разложения',ice_shackles:'❄️ Ледяные оковы',dragon_eggs:'🥚 Драконьи яйца',abyss_gaze:'👁️ Взгляд Бездны',chain_mastery:'⛓️ Власть Цепей',mirror_reflection:'🪞 Зеркальная Рефлексия',dragon_birth:'🐉 Рождение Драконов',time_loop:'⏳ Петля Времени'}[cfg.mechanic]; if(mech)e.addFields({name:'⚙️ Уникальная механика',value:mech}); }
  if (state.minions?.length) e.addFields({ name: '👾 Миньоны босса', value: state.minions.map(m => `${m.provoking ? '🛑' : '👾'} ${m.name}: ❤️ **${m.hp}/${m.maxHp}**${m.provoking ? ' • ПРОВОКАЦИЯ' : ''}`).join('\n').slice(0, 1024) });
  const sum = summonsText(state); if (sum) e.addFields({ name: '🧙 Тотемы, духи и призывы', value: sum });
  if (['class_select','initiative_roll','active'].includes(b.status)) {
    const teamLines=players.slice(0,25).map((p,index)=>{
      const c=CLASSES[p.class_key],ef=effects(p),sh=Number(ef.shield||0);
      const aliveIndex=alive.findIndex(x=>x.user_id===p.user_id);
      const currentIndex=alive.length?b.turn_index%alive.length:-1;
      const marker=p.status==='dead'?'☠️':b.status==='active'?(aliveIndex<currentIndex?'✅':aliveIndex===currentIndex?'▶️':'⏳'):roleIcon(c?.role);
      const ult=Math.max(0,Math.min(100,ultResourceValue(p))),ultIcon=ult>=100?'🟣':'⚫';
      return `${marker} **${index+1}.** ${playerLabel(p)} • ${c?`${roleIcon(c.role)} ${c.name}`:'❔ класс не выбран'}${b.status==='active'?` • ❤️${p.hp}/${p.max_hp}${sh?` • 🛡️${sh}`:''} • ${resourceMeta(p.class_key).icon}${skillResourceValue(p)}\n　　${ultIcon} **Ульта: ${ult}/100**`:''}`;
    });
    splitFieldLines(teamLines).forEach((value,i)=>e.addFields({name:i===0?(b.status==='active'?'⚔️ Порядок ходов':'Команда'):`⚔️ Порядок ходов • продолжение ${i+1}`,value}));
  }
  if (state.finalStats) {
    const fs = state.finalStats;
    const fmt = arr => arr.slice(0, 6).map((p, i) => `${i + 1}. <@${p.user_id}> — ${p.damage_done ?? p.healing_done ?? p.damage_taken}`).join('\n') || '—';
    e.addFields(
      { name: '🏆 Итоги и награды', value: `Общий фонд: **${fs.pool} GS Dust**\nПолучили все участники: **${fs.each}–${fs.each + (fs.remainder > 0 ? 1 : 0)} GS Dust**\nMVP: <@${fs.mvpId}> • **${String(fs.pack).toUpperCase()} Pack**` },
      { name: '💠 Распределение Dust', value: (fs.dustRewards || []).map(r => `<@${r.user_id}> — **+${r.amount}** → ${r.balanceAfter}`).join('\n').slice(0,1024) || '—' },
      { name: '⚔️ Урон', value: fs.damageTop.slice(0,6).map((p,i)=>`${i+1}. <@${p.user_id}> — **${p.damage_done}**`).join('\n').slice(0,1024), inline: true },
      { name: '💚 Лечение', value: fs.healTop.slice(0,6).map((p,i)=>`${i+1}. <@${p.user_id}> — **${p.healing_done}**`).join('\n').slice(0,1024), inline: true },
      { name: '🛡️ Танкование', value: fs.tankTop.slice(0,6).map((p,i)=>`${i+1}. <@${p.user_id}> — **${p.tankScore}**`).join('\n').slice(0,1024), inline: true },
      { name: '✨ Поддержка', value: (fs.supportTop || []).slice(0,6).map((p,i)=>`${i+1}. <@${p.user_id}> — **${p.supportScore}**${p.rage_reduced?` • 💢 -${p.rage_reduced} ярости`:''}`).join('\n').slice(0,1024) || '—', inline: true },
      { name: '🤖 Вклад призывов', value: (fs.summonDetails || []).map(st => {
        const reason = Number(st.damage || 0) > 0 ? ''
          : st.support ? ' • поддержка/лечение'
          : Number(st.attacks || 0) === 0
            ? (Number(st.destroyed || 0) > 0 ? ' • уничтожен до атаки' : Number(st.expired || 0) > 0 ? ' • исчез до атаки' : ' • не успел атаковать')
            : Number(st.misses || 0) >= Number(st.attacks || 0) ? ' • все атаки мимо' : ' • урон не прошёл';
        return `${st.icon || '•'} **${st.name}** игрока <@${st.owner}> — ⚔️ **${st.damage || 0}**${st.healing ? ` • 💚 **${st.healing}**` : ''}${st.absorbed ? ` • 🛡️ **${st.absorbed}**` : ''}${reason}`;
      }).join('\n').slice(0,1024) || 'Призывы не участвовали.' },
      { name: '🎖️ Дополнительные MVP', value: (fs.categoryAwards || []).map(a => `${a.type === 'damage' ? '⚔️ Разрушитель' : a.type === 'healing' ? '💚 Спаситель' : a.type === 'tank' ? '🛡️ Непоколебимый' : a.type === 'support' ? '✨ Опора команды' : '👹 Призыватель'}: <@${a.user_id}> — **${a.value}** • ${String(a.pack).toUpperCase()} Pack`).join('\n').slice(0,1024) || '—' },
    );
  }
  if (state.log?.length) e.addFields({ name: 'Последние действия', value: state.log.slice(state.finalStats ? -5 : -7).join('\n').slice(0, 1024) });
  return e.setFooter({ text: 'Game Syndicate • World Boss' });
}
async function refresh(id) {
  try {
    const b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); if (!b || !clientRef) return false;
    const ch = await clientRef.channels.fetch(b.channel_id).catch(() => null);
    const msg = ch && b.message_id ? await ch.messages.fetch(b.message_id).catch(() => null) : null; if (!msg) return false;
    const players = battlePlayers(id), state = stateOf(b), alive = players.filter(p => p.status === 'alive');
    const current = b.status === 'active' && alive.length ? alive[b.turn_index % alive.length] : null;
    for (const player of players) {
      const member = await ch.guild?.members.fetch(player.user_id).catch(() => null);
      player.discordDisplayName = member?.displayName || member?.user?.globalName || member?.user?.username || `Игрок ${player.user_id.slice(-4)}`;
      player.displayName = heroName(player);
    }

    // Одно редактирование на обновление: изображение не исчезает и не «прыгает» вверх/вниз.
    try {
      const buffer = await createWorldBossBattleCard({ battle: b, players, state, effectsByUser: Object.fromEntries(players.map(player => [player.user_id, effects(player)])), currentUserId: current?.user_id || null });
      const attachment = new AttachmentBuilder(buffer, { name: `world-boss-${id}.png` });
      const embed = buildEmbed(b, players).setImage(`attachment://world-boss-${id}.png`);
      await msg.edit({ content: '## 🌍 GS WORLD BOSS', embeds: [embed], components: buttons(b), files: [attachment], attachments: [] });
      return true;
    } catch (error) {
      if (error?.code === 50013) console.error('[WorldBoss] Нет права обновлять вложение/сообщение в канале босса.');
      else console.error('[WorldBoss] Battle card render failed:', error);
      await msg.edit({ content: '## 🌍 GS WORLD BOSS', embeds: [buildEmbed(b, players)], components: buttons(b) }).catch(() => null);
      return false;
    }
  } catch (error) {
    console.error(`[WorldBoss] refresh battle=${id} failed without stopping the game:`, error);
    return false;
  }
}

async function startRegistration(client, { manual = false } = {}) {
  init();
  clientRef = client || clientRef;
  if (busy) return { ok: false, reason: 'busy' };

  const stale = activeBattle();
  if (stale) {
    const deadline = Number(stale.turn_deadline || stale.registration_ends_at || 0);
    const tooOld = Date.now() - Number(stale.created_at || 0) > 3 * 60 * 60 * 1000;
    let messageExists = false;
    if (stale.channel_id && stale.message_id && clientRef) {
      const channel = await clientRef.channels.fetch(stale.channel_id).catch(() => null);
      messageExists = Boolean(channel && await channel.messages.fetch(stale.message_id).catch(() => null));
    }
    if (!messageExists || tooOld || (deadline > 0 && deadline < Date.now() - 5 * 60 * 1000)) {
      clearTimer(stale.id);
      db.prepare("UPDATE world_boss_battles SET status='cancelled',turn_deadline=NULL,registration_ends_at=NULL,ended_at=? WHERE id=?").run(Date.now(), stale.id);
      console.warn(`[WorldBoss] Автоматически очищено зависшее состояние battle=${stale.id}, status=${stale.status}.`);
    } else return { ok: false, reason: 'active' };
  }
  busy = true;
  let createdBattleId = null;
  try {
    db.prepare("UPDATE quick_event_rounds SET status='expired' WHERE status IN ('active','pending')").run();
    const ch = await clientRef.channels.fetch(CHANNEL_ID).catch(() => null); if (!ch?.isTextBased()) return { ok: false, reason: 'channel' }; const me = ch.guild?.members?.me; const perms = me ? ch.permissionsFor(me) : null; if (perms && !perms.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) return { ok: false, reason: 'permissions' }; if (perms && !perms.has(PermissionsBitField.Flags.AttachFiles)) console.warn('[WorldBoss] В канале нет права «Прикреплять файлы»: визуальная карточка будет недоступна, но бой продолжит работать.');
    const boss = chooseUniqueBoss(), now = Date.now();
    const st = { bossCardId: boss.cardId, allowedMinions: [...boss.minions], minions: [], summons: [], rage: 0, lastDestroyRound: -99, lastGroupCurseRound: -99, lastSummonRound: -99, lastCurseRound: -99, bossActionStats: {}, stormCharge: 0, ironHeat: 0, shadowDomeActive: false, chaosRiftRound: null, deathStats: { players: 0, bossMinions: 0, playerSummons: 0 }, log: [manual ? '🛠️ Босс вызван вручную.' : '⏰ Босс появился по расписанию.'] };
    const info = db.prepare(`INSERT INTO world_boss_battles(channel_id,boss_card_id,boss_name,boss_hp,boss_max_hp,status,registration_ends_at,state_json,created_at) VALUES(?,?,?,?,?,'registration',?,?,?)`).run(CHANNEL_ID, boss.cardId, boss.name, boss.baseHp, boss.baseHp, now + REGISTRATION_MS, JSON.stringify(st), now);
    const id = Number(info.lastInsertRowid); createdBattleId = id;
    const b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
    const msg = await ch.send({ content: '@everyone\n## 🌍 GS WORLD BOSS\n⏳ Регистрация открыта на **5 минут**.', allowedMentions: { parse: ['everyone'] }, embeds: [buildEmbed(b, [])], components: buttons(b) });
    db.prepare('UPDATE world_boss_battles SET message_id=? WHERE id=?').run(msg.id, id);
    await refresh(id);
    setTimer(id, () => beginBattle(id).catch(console.error), REGISTRATION_MS); return { ok: true, id };
  } catch (error) {
    if (createdBattleId) {
      clearTimer(createdBattleId);
      db.prepare("UPDATE world_boss_battles SET status='cancelled',ended_at=? WHERE id=?").run(Date.now(), createdBattleId);
    }
    console.error('[WorldBoss] Не удалось запустить регистрацию:', error);
    return { ok: false, reason: error?.code === 50013 ? 'permissions' : 'send', error };
  } finally { busy = false; }
}

async function resetWorldBoss(client = null) {
  init();
  clientRef = client || clientRef;
  busy = false;

  for (const [battleId] of [...timers]) clearTimer(battleId);

  const activeRows = db.prepare("SELECT * FROM world_boss_battles WHERE status IN ('registration','class_roll','class_select','initiative_roll','active') ORDER BY id DESC").all();
  if (!activeRows.length) return { ok: true, reset: false, resetCount: 0 };

  const now = Date.now();
  db.prepare("UPDATE world_boss_battles SET status='cancelled',turn_deadline=NULL,registration_ends_at=NULL,ended_at=? WHERE status IN ('registration','class_roll','class_select','initiative_roll','active')").run(now);

  for (const row of activeRows) {
    if (!clientRef || !row.channel_id || !row.message_id) continue;
    try {
      const channel = await clientRef.channels.fetch(row.channel_id);
      const message = await channel?.messages?.fetch(row.message_id);
      await message?.delete();
    } catch (error) {
      if (![10008, 10003].includes(error?.code)) console.warn('[WorldBoss] Не удалось удалить старое сообщение при сбросе:', error?.message || error);
    }
  }

  return { ok: true, reset: true, resetCount: activeRows.length, battleId: activeRows[0].id, previousStatus: activeRows[0].status };
}

async function beginBattle(id) {
  const b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='registration'").get(id); if (!b) return;
  const players = battlePlayers(id);
  if (players.length < 4) { db.prepare("UPDATE world_boss_battles SET status='cancelled',ended_at=? WHERE id=?").run(Date.now(), id); addLog(b, '❌ Недостаточно участников. Нужно минимум 4.'); await refresh(id); return scheduleRegular(); }
  const state = stateOf(b); state.classRolls = {}; state.classPool = buildClassPool(players.length); state.availableClasses = [...state.classPool];
  state.alchemy = {};
  for (const player of players) {
    const consumed = consumeContextBuffs(player.user_id, 'world_boss');
    if (!consumed.consumed.length) continue;
    const snapshot = parseSnapshot(player);
    snapshot.alchemy = { ...(consumed.bonuses || {}), effects: describeBuffKeys(consumed.consumed) };
    db.prepare('UPDATE world_boss_players SET hero_snapshot_json=? WHERE battle_id=? AND user_id=?').run(JSON.stringify(snapshot), id, player.user_id);
    state.alchemy[player.user_id] = snapshot.alchemy;
    state.log.push(`🧪 <@${player.user_id}> активирует: **${snapshot.alchemy.effects.map(e => `${e.icon} ${e.name}`).join(', ')}**.`);
  }
  state.log.push('🎲 Бросьте d20 за право выбора класса. Через 15 секунд не бросившие попадут в конец очереди.'); saveState(b, state);
  db.prepare("UPDATE world_boss_battles SET status='class_roll',turn_deadline=? WHERE id=?").run(Date.now() + ROLL_MS, id); await refresh(id);
  setTimer(id, () => autoFinishClassRoll(id).catch(console.error), ROLL_MS);
}
function allHave(map, players) { return players.every(p => Object.prototype.hasOwnProperty.call(map || {}, p.user_id)); }

async function autoFinishClassRoll(id) {
  const b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='class_roll'").get(id);
  if (!b) return;
  const state = stateOf(b);
  state.classRolls ||= {};
  const missing = battlePlayers(id).filter(p => state.classRolls[p.user_id] == null);
  state.classRollMissing = missing.map(p => p.user_id);
  if (missing.length) state.log.push(`⏱️ Не бросили d20: **${missing.length}**. Они выберут классы последними.`);
  saveState(b, state);
  await refresh(id);
  await finishClassRoll(id);
}

async function autoFinishInitiative(id) {
  const b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='initiative_roll'").get(id);
  if (!b) return;
  const state = stateOf(b);
  state.initiativeRolls ||= {};
  const missing = battlePlayers(id).filter(p => state.initiativeRolls[p.user_id] == null);
  for (const p of missing) {
    state.initiativeRolls[p.user_id] = rand(1, 20);
    state.log.push(`⏱️ Автобросок инициативы: <@${p.user_id}> — **${state.initiativeRolls[p.user_id]}**.`);
  }
  saveState(b, state);
  await refresh(id);
  await startCombat(id);
}

async function finishClassRoll(id) {
  clearTimer(id);
  let b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id), state = stateOf(b), ps = battlePlayers(id);
  state.classOrder = [...ps].sort((a, z) => { const ar = state.classRolls?.[a.user_id], zr = state.classRolls?.[z.user_id]; const aRolled = Number.isFinite(ar), zRolled = Number.isFinite(zr); if (aRolled !== zRolled) return aRolled ? -1 : 1; if (aRolled && zRolled && zr !== ar) return zr - ar; return a.joined_at - z.joined_at; }).map(p => p.user_id);
  state.classChoiceIndex = 0; state.log.push(`🏆 Первым выбирает <@${state.classOrder[0]}>.`); saveState(b, state);
  db.prepare("UPDATE world_boss_battles SET status='class_select',turn_deadline=? WHERE id=?").run(Date.now() + CHOICE_MS, id); await refresh(id); armStageTimer(id);
}
function armStageTimer(id) {
  const b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); if (!b) return;
  if (b.status === 'class_select') setTimer(id, () => autoChooseClass(id).catch(console.error), Number(b.turn_deadline) - Date.now());
  else if (b.status === 'active') armTurn(id);
}
async function autoChooseClass(id) {
  const b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='class_select'").get(id); if (!b) return;
  const remaining = Number(b.turn_deadline || 0) - Date.now();
  // Защита от старого/раннего таймера: автовыбор не имеет права срабатывать до фактического дедлайна текущего игрока.
  if (remaining > 250) { setTimer(id, () => autoChooseClass(id).catch(console.error), remaining); return; }
  const s = stateOf(b), user = s.classOrder?.[s.classChoiceIndex];
  const slots = allowedClassSlots(id, s);
  if (!user || !slots.length) return;
  const picked = pick(slots);
  await assignChosenClass(id, user, `${picked.index}:${picked.key}`, true);
}
async function assignChosenClass(id, user, key, auto = false) {
  let b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='class_select'").get(id); if (!b) return { ok: false };
  const s = stateOf(b), expected = s.classOrder?.[s.classChoiceIndex];
  if (String(user) !== String(expected)) return { ok: false, reason: 'turn' };
  const token = String(key || ''); const splitAt = token.indexOf(':');
  let pos = splitAt > 0 ? Number(token.slice(0, splitAt)) : -1;
  let classKey = splitAt > 0 ? token.slice(splitAt + 1) : token;
  if (!Number.isInteger(pos) || pos < 0 || s.availableClasses?.[pos] !== classKey) pos = (s.availableClasses || []).indexOf(classKey);
  if (pos < 0) return { ok: false, reason: 'taken' };
  classKey = s.availableClasses[pos]; const c = CLASSES[classKey]; if (!c) return { ok: false, reason: 'class' };
  const allowed = allowedClassSlots(id, s);
  if (!allowed.some(slot => slot.index === pos && slot.key === classKey)) return { ok: false, reason: 'role_required' };
  s.availableClasses.splice(pos, 1); s.classChoiceIndex += 1; s.log.push(`${auto ? '⏱️ Автовыбор:' : '✅'} <@${user}> — ${roleIcon(c.role)} **${c.name}**.`); saveState(b, s);
  const joinedPlayer = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id, user);
  const playerWithClass = {...joinedPlayer,class_key:classKey};
  const classBonus = selectedClassBonuses(playerWithClass);
  const heroMaxHp = Math.max(1, Math.round(c.maxHp * hpMultiplier(playerWithClass) + Number(classBonus.equipment.flatHp || 0)));
  s.log.push(`📚 ${c.name} **Lv.${classBonus.level}** • ${classBonus.mastery.title}: ⚔️ +${classBonus.mastery.damagePercent}% ❤️ +${classBonus.mastery.hpPercent}% 🛡️ +${classBonus.mastery.resistancePercent}% • экипировка: ⚔️ +${classBonus.equipment.damagePercent}% ❤️ +${classBonus.equipment.hpPercent}% 🛡️ +${classBonus.equipment.resistancePercent}%.`);
  saveState(b,s);
  db.prepare("UPDATE world_boss_players SET class_key=?,hp=?,max_hp=?,energy=0,mana=?,ult_charge=0,status='alive',effects_json='{}' WHERE battle_id=? AND user_id=?").run(classKey, heroMaxHp, heroMaxHp, c.resourceType === 'mana' ? 100 : 0, id, user);
  if (s.classChoiceIndex >= s.classOrder.length) {
    b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); const ns = stateOf(b); ns.initiativeRolls = {}; ns.log.push('🎲 Классы выбраны. Теперь бросьте d20 на инициативу боя.'); saveState(b, ns);
    db.prepare("UPDATE world_boss_battles SET status='initiative_roll',turn_deadline=? WHERE id=?").run(Date.now() + ROLL_MS, id); clearTimer(id); await refresh(id); setTimer(id, () => autoFinishInitiative(id).catch(console.error), ROLL_MS); return { ok: true, done: true };
  }
  db.prepare('UPDATE world_boss_battles SET turn_deadline=? WHERE id=?').run(Date.now() + CHOICE_MS, id); await refresh(id); armStageTimer(id); return { ok: true };
}
async function startCombat(id) {
  clearTimer(id);
  let b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id), s = stateOf(b), ps = battlePlayers(id);
  for (const p of ps) db.prepare('UPDATE world_boss_players SET initiative=? WHERE battle_id=? AND user_id=?').run(s.initiativeRolls[p.user_id], id, p.user_id);
  const boss = BOSSES.find(x => x.cardId === b.boss_card_id), hp = scaledHp(boss.baseHp, ps.length);
  let bombTotal = 0;
  for (const p of ps) {
    const snap = parseSnapshot(p);
    const flat = Math.max(0, Number(snap?.alchemy?.boss_flat_damage || 0));
    if (!flat) continue;
    bombTotal += flat;
    db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(flat, flat, id, p.user_id);
    s.log.push(`💣 <@${p.user_id}> наносит боссу **${flat}** алхимического урона.`);
  }
  const startHp = Math.max(0, hp - bombTotal);
  if (boss?.mechanic === 'dragon_eggs') { const egg=MINIONS[2058]; const eggHp=Math.round(egg.maxHp*bossMinionHpMultiplier(ps.length)); s.minions=s.minions||[]; for(let i=0;i<2;i++) s.minions.push({cardId:2058,instanceId:`2058-start-${Date.now()}-${i}`,provoking:false,ownerBossCardId:boss.cardId,name:egg.name,hp:eggHp,maxHp:eggHp,damage:[0,0],miss:0,damageType:'magic',isDragonEgg:true}); s.log.push(`🥚 Багровый Дракон начинает бой с двумя Драконьими яйцами по **${eggHp} HP**.`); }
  s.log.push(`⚔️ Инициатива определена. Бой начался!${bombTotal ? ` Бомбы наносят суммарно **${bombTotal}** урона.` : ''}`); saveState(b, s);
  db.prepare("UPDATE world_boss_battles SET status='active',boss_hp=?,boss_max_hp=?,round_no=1,turn_index=0,turn_deadline=? WHERE id=?").run(startHp, hp, Date.now() + TURN_MS, id); await refresh(id); if (startHp <= 0) return finish(id, true); armTurn(id);
}

function currentPlayer(b) { const alive = battlePlayers(b.id).filter(p => p.status === 'alive'); return { alive, p: alive.length ? alive[b.turn_index % alive.length] : null }; }
function armTurn(id) { const b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id); if (!b) return; setTimer(id, () => autoTurn(id).catch(console.error), Number(b.turn_deadline) - Date.now()); }
async function autoTurn(id) { const b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id); if (!b) return; const { p } = currentPlayer(b); if (p) await perform(id, p.user_id, 'attack', true); }
function playerResistanceMultiplier(target, damageType) {
  const cls = CLASSES[target.class_key] || {};
  const key = damageType === 'magic' ? 'magicResist' : 'physicalResist';
  const resist = clamp(Number(cls[key] || 0) + resistancePercent(target), -35, 60);
  return 1 - resist / 100;
}
function damageTypeLabel(type) { return type === 'magic' ? 'магический' : 'физический'; }
function pickDamageType(profile, fallback = 'physical') {
  if (!Array.isArray(profile) || !profile.length) return fallback;
  let roll = Math.random() * profile.reduce((sum, x) => sum + Number(x[1] || 0), 0);
  for (const [type, weight] of profile) { roll -= Number(weight || 0); if (roll < 0) return type; }
  return profile[profile.length - 1][0] || fallback;
}
function damageTarget(id, target, amount, damageType = 'physical', options = {}) {
  const e = effects(target); let d = Math.max(0, Math.round(amount * playerResistanceMultiplier(target, damageType))); const mitigatedBase=d;
  if (e.guardianUltRounds > 0) d = Math.round(d * 0.6); else if (e.guardRounds > 0) d = Math.round(d * 0.5); if (e.combatResistanceTurns > 0) d = Math.round(d * (1 - Number(e.combatResistance || 0))); if (e.guildFeastActive) d = Math.round(d * 0.90); if (e.rageTurns > 0 || e.bloodRageTurns > 0) d = Math.round(d * 1.25); if (e.partyGuardRounds > 0) d = Math.round(d * Number(e.partyGuardMultiplier || 0.8));
  let shield = Number(e.shield || 0), absorbed = 0; const hadShield = shield > 0;
  if (shield) { absorbed = Math.min(shield, d); shield -= absorbed; d -= absorbed; e.shield = shield; const sources=e.shieldSources&&typeof e.shieldSources==='object'?e.shieldSources:{}; let remain=absorbed; for(const owner of Object.keys(sources)){if(remain<=0)break;const used=Math.min(Number(sources[owner]||0),remain);sources[owner]=Math.max(0,Number(sources[owner]||0)-used);remain-=used;if(used>0){addBattleStat(id,owner,'shield_given',used);addBattleStat(id,owner,'support_points',Math.round(used*0.9));}if(sources[owner]<=0)delete sources[owner];} e.shieldSources=sources; if(shield<=0){delete e.shieldOwner;delete e.shieldSources;} updateEffects(id, target.user_id, e); }
  const prevented=Math.max(0,mitigatedBase-d); if(prevented>0)addBattleStat(id,target.user_id,'damage_prevented',prevented);
  const battleState=stateOf(db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id)); if(String(battleState.latestTankAggroUserId||'')===String(target.user_id)&&d>0)addBattleStat(id,target.user_id,'aggro_hits',1);
  const hp = Math.max(0, target.hp - d), diedNow = target.status === 'alive' && target.hp > 0 && hp <= 0;
  if (diedNow) {
    e.deathResourceSnapshot = { energy:Number(target.energy||0), mana:Number(target.mana||0), ultCharge:Number(target.ult_charge||0) };
    updateEffects(id, target.user_id, e);
  }
  db.prepare("UPDATE world_boss_players SET hp=?,damage_taken=damage_taken+?,status=CASE WHEN ?<=0 THEN 'dead' ELSE status END WHERE battle_id=? AND user_id=?").run(hp, d, hp, id, target.user_id);
  if (hadShield && shield <= 0 && absorbed > 0) pushCombatEvent(id, `🛡️ Щит <@${target.user_id}> разрушен!`);
  if (diedNow) pushCombatEvent(id, `☠️ <@${target.user_id}> (${CLASSES[target.class_key]?.name || 'Игрок'}) пал!`, 'players');
  if (['rage','holiness','bloodlust'].includes(resourceType(target.class_key)) && d > 0) {
    const gained = Math.min(25, Math.max(5, Math.ceil(d / 3)));
    db.prepare('UPDATE world_boss_players SET energy=MIN(100,energy+?) WHERE battle_id=? AND user_id=?').run(gained, id, target.user_id);
  }

  // Повелитель Цепей: при получении реального HP-урона цепь перепрыгивает
  // на другого живого игрока и наносит ему часть полученного урона.
  if (!options.skipChainTransfer && d > 0 && !diedNow && Number(e.chainBound || 0) > 0) {
    const battle = db.prepare('SELECT boss_card_id FROM world_boss_battles WHERE id=?').get(id);
    const bossCfg = BOSSES.find(x => Number(x.cardId) === Number(battle?.boss_card_id));
    if (bossCfg?.mechanic === 'chain_mastery') {
      const candidates = battlePlayers(id).filter(p => p.status === 'alive' && p.user_id !== target.user_id);
      if (candidates.length) {
        const next = pick(candidates);
        delete e.chainBound;
        delete e.chainSourceRound;
        updateEffects(id, target.user_id, e);

        const nextEffects = effects(next);
        nextEffects.chainBound = 1;
        nextEffects.chainSourceRound = Number(nextEffects.chainSourceRound || 0);
        updateEffects(id, next.user_id, nextEffects);

        const echoDamage = clamp(Math.round(d * 0.35), 8, 30);
        const echo = damageTarget(id, next, echoDamage, 'magic', { skipChainTransfer: true });
        if (echo.diedNow) {
          const deadEffects = effects(db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id, next.user_id));
          delete deadEffects.chainBound;
          delete deadEffects.chainSourceRound;
          updateEffects(id, next.user_id, deadEffects);
          pushCombatEvent(id, `⛓️ Цепь переходит с <@${target.user_id}> на <@${next.user_id}>, наносит **${echo.hpDamage} HP** и обрывается после гибели цели.`, 'players');
        } else {
          pushCombatEvent(id, `⛓️ Цепь переходит с <@${target.user_id}> на <@${next.user_id}> и наносит **${echo.hpDamage} HP**.`, 'players');
        }
      }
    }
  }
  if (d > 0 && !diedNow && target.class_key === 'duelist' && e.counterAttack && !options.skipCounterAttack) {
    e.counterAttack = false;
    updateEffects(id, target.user_id, e);
    const battle = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
    if (battle && Number(battle.boss_hp || 0) > 0) {
      const st = stateOf(battle);
      const counter = hurtEnemy(battle, st, rand(55, 72), 'physical', 'duelist');
      db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(counter.dealt,counter.dealt,id,target.user_id);
      pushCombatEvent(id, `⚔️ <@${target.user_id}> отвечает контратакой и наносит **${counter.dealt}** → ${counter.target}.`);
    }
  }
  return { hpDamage: d, absorbed, damageType, diedNow, shieldBroken: hadShield && shield <= 0 && absorbed > 0 };
}

function resistanceMultiplier(bossOrMinion, damageType, pierce = 0) {
  const key = damageType === 'magic' || damageType === 'holy' ? 'magicResist' : 'physicalResist';
  const raw = clamp(Number(bossOrMinion?.[key] || 0), -50, 75);
  const effective = raw * (1 - clamp(Number(pierce || 0), 0, 1));
  return 1 - effective / 100;
}
function holyBonus(target, sourceClass) {
  if (sourceClass !== 'priest') return 1;
  return target?.undead || target?.dark ? 1.35 : 1;
}
function activateShadowDome(b, state, cfg) {
  if (state.shadowDomeTriggered) return;
  state.shadowDomeTriggered = true;
  state.shadowDomeActive = true;
  const raidSize = battlePlayers(b.id).filter(x => x.status === 'alive').length || battlePlayers(b.id).length || 6;
  const shadowIds = [2045, 2046];
  // Купол всегда получает собственных защитников. Старые тени заменяются,
  // чтобы механика не зависела от случайного состояния призывов перед 35% HP.
  state.minions = (state.minions || []).filter(m => !shadowIds.includes(Number(m.cardId)));
  for (const minionId of shadowIds) {
    const mc = MINIONS[minionId];
    const hp = Math.round(mc.maxHp * bossMinionHpMultiplier(raidSize));
    const dmgScale = bossMinionDamageMultiplier(raidSize);
    state.minions.push({
      cardId:minionId,
      instanceId:`dome-${minionId}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      provoking:Boolean(mc.provoking),
      ownerBossCardId:cfg.cardId,
      name:mc.name,
      hp,
      maxHp:hp,
      damage:[Math.round(mc.damage[0]*dmgScale),Math.round(mc.damage[1]*dmgScale)],
      miss:mc.miss,
      damageType:mc.damageType || 'magic',
      physicalResist:mc.physicalResist || 0,
      magicResist:mc.magicResist || 0,
      dark:Boolean(mc.dark),
      isDomeShadow:true,
    });
  }
  state.log.push('🛡️ Теневой купол активирован: призваны две тени, а входящий урон по боссу снижен на 70% до их уничтожения.');
}
function hurtEnemy(b, state, amount, damageType = 'physical', sourceClass = null, pierce = 0) {
  const cfg = BOSSES.find(x => x.cardId === b.boss_card_id) || {};
  const minions = (state.minions || []).filter(x => Number(x.hp || 0) > 0);
  const provoking = minions.filter(x => x.provoking);
  const selected = String(state._selectedEnemyTarget || '');
  let targetMinion = null;
  let hitBoss = false;
  if (provoking.length) targetMinion = provoking.find(m => selected === `minion:${m.instanceId}`) || pick(provoking);
  else if (selected === 'boss') hitBoss = true;
  else if (selected.startsWith('minion:')) targetMinion = minions.find(m => selected === `minion:${m.instanceId}`) || null;
  else { const randomPool = ['boss', ...minions]; const chosen = pick(randomPool); if (chosen === 'boss') hitBoss = true; else targetMinion = chosen; }

  if (targetMinion && !hitBoss) {
    const adjusted = Math.max(1, Math.round(amount * resistanceMultiplier(targetMinion, damageType, pierce) * holyBonus(targetMinion, sourceClass)));
    const dealt = Math.min(adjusted, targetMinion.hp);
    const died = targetMinion.hp > 0 && targetMinion.hp - adjusted <= 0;
    targetMinion.hp -= adjusted;
    if (died) {
      state.log = state.log || [];
      state.log.push(`💀 Миньон босса **${targetMinion.name}** уничтожен!`);
      state.deathStats = state.deathStats || { players:0, bossMinions:0, playerSummons:0 };
      state.deathStats.bossMinions = Number(state.deathStats.bossMinions || 0) + 1;
      if (Number(targetMinion.cardId) === 2058 || targetMinion.isDragonEgg) {
        state.minions.push({cardId:2059,instanceId:`2059-hatch-${Date.now()}`,provoking:false,ownerBossCardId:cfg.cardId,name:'Дракончик',hp:140,maxHp:140,damage:[14,18],miss:15,damageType:'physical'});
        state.log.push('🐲 Из разрушенного яйца вылупляется **Дракончик**!');
      }
    }
    state.minions = state.minions.filter(x => x.hp > 0);
    if (cfg.mechanic === 'shadow_dome' && state.shadowDomeActive && !(state.minions||[]).some(x=>x.hp>0 && x.isDomeShadow)) { state.shadowDomeActive=false; state.log.push('✨ Все тени уничтожены — Теневой купол исчезает.'); }
    saveState(b,state);
    return {dealt,target:targetMinion.name,minion:true,died};
  }

  const hpRatio = Number(b.boss_hp||0)/Math.max(1,Number(b.boss_max_hp||1));
  if (cfg.mechanic === 'shadow_dome' && !state.shadowDomeTriggered && hpRatio <= 0.35) activateShadowDome(b, state, cfg);
  if (cfg.mechanic === 'shadow_dome' && state.shadowDomeActive && (state.minions||[]).some(x=>x.hp>0 && x.isDomeShadow)) amount *= 0.30;
  if (cfg.mechanic === 'shadow_dome' && state.shadowDomeActive && !(state.minions||[]).some(x=>x.hp>0 && x.isDomeShadow)) state.shadowDomeActive=false;

  const overheatMul = cfg.mechanic === 'overheat' && Number(state.overheatVulnerableRounds||0)>0 ? 1.25 : 1;
  const vulnerability = (Number(state.bossVulnerabilityOwnerTurns||0)>0 ? 1+Number(state.bossVulnerability||0) : 1) * overheatMul;
  const adjusted = Math.max(1, Math.round(amount * resistanceMultiplier(cfg,damageType,pierce) * holyBonus(cfg,sourceClass) * vulnerability));
  const dealt = Math.min(adjusted,b.boss_hp);
  db.prepare('UPDATE world_boss_battles SET boss_hp=MAX(0,boss_hp-?) WHERE id=?').run(adjusted,b.id);
  const rageGain = cfg.mechanic === 'dragon_birth'
    ? Math.min(3, Math.max(1, Math.ceil(dealt / 140)))
    : Math.min(5, Math.max(1, Math.ceil(dealt / 85)));
  state.rage = clamp(Number(state.rage||0) + rageGain, 0, 100);
  if (cfg.mechanic === 'overheat') {
    const last = Number(state.lastOverheatRound || -99);
    const gain = Math.min(8, Math.max(1, Math.ceil(dealt / 55)));
    state.ironHeat = clamp(Number(state.ironHeat || 0) + gain, 0, 100);
    if (state.ironHeat >= 100 && Number(b.round_no || 0) - last >= 4) {
      state.ironHeat = 0; state.skipNextBossTurn = true; state.lastOverheatRound = Number(b.round_no || 0);
      state.overheatVulnerableRounds = 1;
      state.log.push('🔥 **Перегрев 100%!** Колосс пропустит один ход и получает +25% входящего урона.');
    }
  }
  const freshHp=Math.max(0,Number(b.boss_hp||0)-dealt);
  if (cfg.mechanic === 'shadow_dome' && !state.shadowDomeTriggered && freshHp/Math.max(1,Number(b.boss_max_hp||1))<=0.35) activateShadowDome(b, state, cfg);
  saveState(b,state);
  return {dealt,target:b.boss_name,minion:false};
}
function applyDamageBuff(p, base) { const e = effects(p); let d = base * damageMultiplier(p); if (p.class_key === 'berserker') { const missing = 1 - (p.hp / Math.max(1, p.max_hp)); d *= 1 + Math.min(0.5, missing * 0.6); } if (e.bloodRageTurns > 0) d *= 2; if (e.rageTurns > 0) d *= 1.4; if (e.damageBuffTurns > 0) d *= 1 + Number(e.damageBuff || 0); if (e.combatDamageTurns > 0) d *= 1 + Number(e.combatDamage || 0); if (e.guildFeastActive) d *= 1.10; if (e.groupDamageRounds > 0) d *= 1 + Number(e.groupDamage || 0); if (e.doubleNext) { d *= 2; e.doubleNext = false; updateEffects(p.battle_id, p.user_id, e); } return Math.round(d); }
function healPlayer(id, healerId, target, amount) { const te = effects(target); const penalty = Number(te.healingPenaltyTurns || 0) > 0 ? clamp(Number(te.healingPenalty || 0.30), 0, 0.8) : 0; const healer=db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id,healerId); const adjusted = Math.max(0, Math.round(Number(amount || 0) * healingMultiplier(healer||{}) * (1 - penalty))); const nh = Math.min(target.max_hp, target.hp + adjusted), actual = nh - target.hp; db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(nh, id, target.user_id); if (actual > 0) db.prepare('UPDATE world_boss_players SET healing_done=healing_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(actual, actual, id, healerId); return actual; }
function validTargets(id, kind) { const ps = battlePlayers(id); return kind === 'dead' ? ps.filter(x => x.status === 'dead') : ps.filter(x => x.status === 'alive'); }
function actionTargets(id, player, action, kind) { let list = validTargets(id, kind); if (player.class_key === 'cleric' && action === 'skill') list = list.filter(x => x.user_id !== player.user_id); return list; }
function targetKind(classKey, action) {
  if (action === 'skill' && ['cleric','bard','chronomancer'].includes(classKey)) return 'alive';
  if (action === 'skill2' && classKey === 'chronomancer') return 'alive';
  if (action === 'ult' && ['cleric'].includes(classKey)) return 'alive';
  if (action === 'ult' && classKey === 'priest') return 'dead';
  return null;
}
function enemyTargets(b, state) {
  const minions = (state.minions || []).filter(m => Number(m.hp || 0) > 0);
  const provoking = minions.filter(m => m.provoking);
  const pool = provoking.length ? provoking.map(m => ({ type: 'minion', token: `minion:${m.instanceId}`, name: m.name, hp: m.hp, maxHp: m.maxHp, provoking: true }))
    : [{ type: 'boss', token: 'boss', name: b.boss_name, hp: b.boss_hp, maxHp: b.boss_max_hp }, ...minions.map(m => ({ type: 'minion', token: `minion:${m.instanceId}`, name: m.name, hp: m.hp, maxHp: m.maxHp, provoking: false }))];
  return pool;
}
function enemyTargetMenu(id, action, targets) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`wb_enemy_target_${action}_${id}`)
    .setPlaceholder(targets.some(t => t.provoking) ? 'Выберите провоцирующего миньона' : 'Выберите босса или миньона')
    .addOptions(targets.slice(0, 25).map(t => ({ label: `${t.provoking ? '🛑 ' : t.type === 'boss' ? '👹 ' : '👾 '}${t.name}`.slice(0,100), value: t.token, description: `${t.hp}/${t.maxHp} HP${t.provoking ? ' • заставляет атаковать себя' : ''}`.slice(0,100) }))));
}
function needsEnemyTarget(classKey, action) {
  if (action === 'attack') return true;
  const byAction = {
    skill: new Set(['assassin','archer','mage','berserker','necromancer','pyromancer','duelist','reaper','mindlord','druid']),
    skill2: new Set(['bard','assassin','archer','mage','pyromancer','mindlord']),
    ult: new Set(['assassin','mage','pyromancer','duelist','reaper','mindlord']),
  };
  return Boolean(byAction[action]?.has(classKey));
}

function druidSpiritMenu(id){return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`wb_druid_spirit_${id}`).setPlaceholder('Выберите дух животного').addOptions({label:'Медведь',value:'bear',emoji:'🐻',description:'+25% защиты группе'},{label:'Волк',value:'wolf',emoji:'🐺',description:'+25% урона группе'},{label:'Сова',value:'owl',emoji:'🦉',description:'+25% точности группе'}));}
function targetMenu(id, action, targets) { return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`wb_target_${action}_${id}`).setPlaceholder('Выберите цель').addOptions(targets.slice(0, 25).map(t => ({ label: `${CLASSES[t.class_key]?.name || 'Игрок'} • ${t.hp}/${t.max_hp} HP`, value: t.user_id, description: t.status === 'dead' ? 'Погиб' : `${resourceMeta(t.class_key).label}: ${skillResourceValue(t)}` })))); }
function tickCooldowns(e, used) { if (used !== 'skill' && e.skillCd > 0) e.skillCd--; if (used !== 'skill2' && e.skill2Cd > 0) e.skill2Cd--; if (used !== 'ult' && e.ultCd > 0) e.ultCd--; if (e.skillSilencedTurns > 0) e.skillSilencedTurns--; if (e.ultSilencedTurns > 0) e.ultSilencedTurns--; }


function applyMidRoundDamageCurse(b, state, alivePlayers) {
  state.playerActionsThisRound = Number(state.playerActionsThisRound || 0) + 1;
  const midpoint = Math.max(1, Math.ceil(alivePlayers.length / 2));
  if (state.playerActionsThisRound !== midpoint || Number(state.lastDamageCurseRound || -1) === Number(b.round_no)) return null;

  const candidates = alivePlayers.filter(p => p.status === 'alive');
  if (!candidates.length) return null;
  const count = candidates.length >= 8 ? 2 : 1;
  const chosen = shuffle(candidates).slice(0, count);
  for (const target of chosen) {
    const e = effects(target);
    e.damageCurseTurns = 2;
    e.damageCurseAmount = rand(16, 24);
    updateEffects(b.id, target.user_id, e);
  }
  state.lastDamageCurseRound = Number(b.round_no);
  return `🩸 **Проклятие боли!** ${chosen.map(p => `<@${p.user_id}>`).join(', ')} будут получать урон в начале своих следующих 2 ходов.`;
}

function triggerDamageCurseTick(id, player) {
  const e = effects(player);
  if (Number(e.damageCurseTurns || 0) <= 0) return { damage: 0, dead: false };
  const damage = Math.min(Number(player.hp || 0), Math.max(1, Number(e.damageCurseAmount || 18)));
  const hp = Math.max(0, Number(player.hp || 0) - damage);
  e.damageCurseTurns = Math.max(0, Number(e.damageCurseTurns || 0) - 1);
  updateEffects(id, player.user_id, e);
  db.prepare("UPDATE world_boss_players SET hp=?,damage_taken=damage_taken+?,status=? WHERE battle_id=? AND user_id=?")
    .run(hp, damage, hp <= 0 ? 'dead' : 'alive', id, player.user_id);
  return { damage, dead: hp <= 0 };
}

function triggerDecayCurseTick(id, player) {
  const e=effects(player), stacks=Number(e.decayCurseStacks||0);
  if(stacks<=0)return {damage:0,explosion:0,dead:false};
  const damage=8+stacks*4; let hp=Math.max(0,Number(player.hp||0)-damage), explosion=0;
  if(stacks>=3&&hp>0){explosion=Math.min(hp,45);hp=Math.max(0,hp-explosion);e.decayCurseStacks=0;e.healingPenaltyTurns=0;e.healingPenalty=0;}
  db.prepare("UPDATE world_boss_players SET hp=?,damage_taken=damage_taken+?,status=? WHERE battle_id=? AND user_id=?").run(hp,damage+explosion,hp<=0?'dead':'alive',id,player.user_id);
  updateEffects(id,player.user_id,e); return {damage,explosion,dead:hp<=0};
}

async function triggerImmediateBossRage(id) {
  let b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id);
  if (!b) return false;
  const state = stateOf(b);
  if (Number(state.rage || 0) < 100) return false;
  const boss = BOSSES.find(x => x.cardId === b.boss_card_id);
  const players = battlePlayers(id).filter(x => x.status === 'alive');
  if (!boss || !players.length) return false;

  let total = 0;
  const rageType = pickDamageType(boss.attackTypes, 'physical');
  for (const p of players) {
    const r = damageTarget(id, p, rand(Math.round(boss.damage[0] * 1.08), Math.round(boss.damage[1] * 1.24)), rageType);
    total += r.hpDamage;
  }
  const summonDamage = damagePlayerSummons(state, 1);
  state.rage = 0;
  state.bossActionStats = state.bossActionStats || {};
  state.bossActionStats.RAGE_ULT = Number(state.bossActionStats.RAGE_ULT || 0) + 1;
  saveState(b, state);
  b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
  addLog(b, `🔥 **${boss.name} мгновенно высвобождает накопленную ярость!** Группа получает **${total} HP** урона${summonDamage ? `, призывы — ${summonDamage}` : ''}.`);
  return true;
}

async function perform(id, userId, action, auto = false, targetId = null) {
  if (busy) return { ok: false, reason: 'busy' }; busy = true;
  try {
    let b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id); if (!b) return { ok: false, reason: 'ended' };
    const { alive, p } = currentPlayer(b); if (!p || p.user_id !== String(userId)) return { ok: false, reason: 'turn' };
    const bossCfgForTurn=BOSSES.find(x=>x.cardId===b.boss_card_id);
    if(bossCfgForTurn?.mechanic==='decay_curse'){const decay=triggerDecayCurseTick(id,p);if(decay.damage>0){b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);addLog(b,`☠️ Проклятие Разложения наносит <@${userId}> **${decay.damage} HP**${decay.explosion?` и взрывается ещё на **${decay.explosion} HP**`:''}.`);if(decay.dead){await nextTurn(id,alive);return {ok:true,text:'☠️ Герой погиб от Проклятия Разложения до действия.'};}}}
    const curseTick = triggerDamageCurseTick(id, p);
    if (curseTick.damage > 0) {
      b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
      addLog(b, `🩸 Проклятие боли наносит <@${userId}> **${curseTick.damage} HP**.`);
      if (curseTick.dead) {
        await nextTurn(id, alive);
        return { ok: true, text: `🩸 Проклятие нанесло **${curseTick.damage} HP** и герой погиб до действия.` };
      }
    }
    const freshPlayer = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id, userId);
    const c = CLASSES[freshPlayer.class_key], e = effects(freshPlayer), state = stateOf(b); state._selectedEnemyTarget = targetId; let text = '';
    const pNow = freshPlayer;
    const rType = resourceType(p.class_key); let energy = Number(p.energy || 0), mana = Number(p.mana || 0), ultCharge = Number(p.ult_charge || 0);
    if (action === 'attack') {
      const miss = auto ? 50 : c.miss; let hit = false;
      if (Math.random() * 100 < miss) { addBattleStat(id,userId,'misses',1); text = `💨 <@${userId}> (${c.name}) ${auto ? 'автоатакой ' : ''}промахивается.`; }
      else { hit = true; let dmg = applyDamageBuff(p, rand(...c.damage)); if(p.class_key==='duelist'){const combo=Math.max(0,Number(e.combo||0));dmg=Math.round(dmg*(1+combo*0.08));if(Math.random()<0.45){e.combo=Math.min(5,combo+1);text+=` ⚔️ Стак Комбо: ${e.combo}/5.`;}} const crit = Math.random() * 100 < Number(c.critChance || CRIT_CHANCE); if (crit) { dmg = Math.round(dmg * Number(c.critMultiplier || CRIT_MULTIPLIER)); addBattleStat(id,userId,'crits',1); } const r = hurtEnemy(b, state, dmg, c.damageType || 'physical', p.class_key); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, userId); text = `🗡️ <@${userId}> наносит **${r.dealt}** → ${r.target}${crit ? ' • 💥 КРИТ!' : ''}.`;
        if (p.class_key === 'cleric') { const fresh = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id,userId); const healed = healPlayer(id,userId,fresh,20); text += ` ✨ Свет удара восстанавливает **${healed} HP**.`; }
      }
      if (rType === 'mana') mana = clamp(mana + 15, 0, 100);
      else if (rType === 'rage') energy = clamp(energy + (hit ? 15 : 8), 0, 100);
      else energy = clamp(energy + (hit ? 20 : 15), 0, 100);
      ultCharge = clamp(ultCharge + (hit ? 20 : 12), 0, 100);
    } else if (action === 'skill') {
      if (Number(e.skillSilencedTurns || 0) > 0) return { ok: false, reason: 'silenced_skill', cd: e.skillSilencedTurns };
      if (Number(e.skillCd || 0) > 0) return { ok: false, reason: 'cooldown', cd: e.skillCd };
      const skillPool = rType === 'mana' ? mana : energy; if (skillPool < 40) return { ok: false, reason: rType };
      const kind = targetKind(p.class_key, action); if (kind && !targetId) return { ok: false, reason: 'target', kind };
      if (rType === 'mana') mana -= 40; else energy -= 40; ultCharge = clamp(ultCharge + 15, 0, 100);
      text = useSkill(b, p, c, e, state, targetId); e.skillCd = SKILL_CD;
    } else if (action === 'skill2') {
      if (Number(e.skillSilencedTurns || 0) > 0) return { ok: false, reason: 'silenced_skill', cd: e.skillSilencedTurns };
      if (Number(e.skill2Cd || 0) > 0) return { ok: false, reason: 'cooldown', cd: e.skill2Cd };
      const skillPool = rType === 'mana' ? mana : energy;
      if (skillPool < SECOND_SKILL_COST) return { ok: false, reason: rType };
      if (rType === 'mana') mana -= SECOND_SKILL_COST; else energy -= SECOND_SKILL_COST; ultCharge = clamp(ultCharge + 12, 0, 100);
      text = useSecondSkill(b, p, c, e, state, targetId);
      e.skill2Cd = SECOND_SKILL_CD;
    } else if (action === 'ult') {
      if (Number(e.ultSilencedTurns || 0) > 0) return { ok: false, reason: 'silenced_ult', cd: e.ultSilencedTurns };
      if (Number(e.ultCd || 0) > 0) return { ok: false, reason: 'cooldown', cd: e.ultCd };
      const ultPool = ultCharge; if (ultPool < 100) return { ok: false, reason: 'burst' };
      const kind = targetKind(p.class_key, action); if (kind && !targetId) return { ok: false, reason: 'target', kind };
      ultCharge = 0;
      text = useUlt(b, p, c, e, state, targetId); e.ultCd = ULT_CD;
    }
    awardSupportAction(id,userId,p.class_key,action);
    if (e.rageTurns > 0) e.rageTurns--; if (e.bloodRageTurns > 0 && !(p.class_key === 'berserker' && action === 'ult')) e.bloodRageTurns--; if (e.damageBuffTurns > 0) e.damageBuffTurns--; tickCooldowns(e, action); updateEffects(id, userId, e);
    if (String(state.bossVulnerabilityOwner || '') === String(userId) && action !== 'skill2' && Number(state.bossVulnerabilityOwnerTurns || 0) > 0) {
      state.bossVulnerabilityOwnerTurns--;
      if (state.bossVulnerabilityOwnerTurns <= 0) {
        state.bossVulnerabilityOwner = null;
        state.bossVulnerability = 0;
      }
      saveState(b, state);
    }
    db.prepare('UPDATE world_boss_players SET energy=?,mana=?,ult_charge=? WHERE battle_id=? AND user_id=?').run(energy,mana,ultCharge,id,userId);
    b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
    addLog(b, (auto ? '⏱️ ' : '') + text);
    b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
    if (b.boss_hp <= 0) return finish(id, true);

    const postState = stateOf(b);
    const curseText = applyMidRoundDamageCurse(b, postState, battlePlayers(id).filter(x => x.status === 'alive'));
    if (curseText) {
      saveState(b, postState);
      b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
      addLog(b, curseText);
    }
    b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); const uniqueBoss=BOSSES.find(x=>x.cardId===b.boss_card_id);
    if(uniqueBoss?.mechanic === 'storm_charge'){const ss=stateOf(b);ss.stormCharge=clamp(Number(ss.stormCharge||0)+20,0,100);ss.log.push(`⚡ Накопление грозы: **${ss.stormCharge}%**.`);if(ss.stormCharge>=100){const victims=shuffle(battlePlayers(id).filter(x=>x.status==='alive')).slice(0,3);let total=0;for(const v of victims)total+=damageTarget(id,v,rand(45,62),'magic').hpDamage;ss.stormCharge=0;ss.log.push(`⚡ **Цепная молния!** ${victims.map(v=>`<@${v.user_id}>`).join(', ')} получают суммарно **${total} HP**.`);}saveState(b,ss);}
    await triggerImmediateBossRage(id);
    if (!battlePlayers(id).some(x => x.status === 'alive')) return finish(id, false);

    const keepsTurn = p.class_key === 'berserker' && action === 'ult'; if (keepsTurn) { db.prepare('UPDATE world_boss_battles SET turn_deadline=? WHERE id=?').run(Date.now() + TURN_MS,id); await refresh(id); armTurn(id); } else await nextTurn(id, battlePlayers(id).filter(x => x.status === 'alive')); return { ok: true, text };
  } finally { busy = false; }
}
function targetById(id, targetId, status = 'alive') { return battlePlayers(id).find(x => x.user_id === String(targetId) && x.status === status); }

function addTrackedShield(effect, amount, ownerId, mode = 'add') {
  const value = Math.max(0, Math.round(Number(amount || 0)));
  const previous = Math.max(0, Number(effect.shield || 0));
  const next = mode === 'max' ? Math.max(previous, value) : previous + value;
  const added = Math.max(0, next - previous);
  effect.shield = next;
  effect.shieldSources = effect.shieldSources && typeof effect.shieldSources === 'object' ? effect.shieldSources : {};
  if (added > 0) effect.shieldSources[String(ownerId)] = Number(effect.shieldSources[String(ownerId)] || 0) + added;
  return added;
}
function shieldBreakdown(player, effect) {
  const total = Math.max(0, Number(effect.shield || 0));
  if (!total) return '';
  const sources = effect.shieldSources && typeof effect.shieldSources === 'object' ? effect.shieldSources : {};
  const own = Math.min(total, Math.max(0, Number(sources[String(player.user_id)] || 0)));
  const foreign = Math.max(0, total - own);
  if (!foreign) return `🛡️ ${total} (свой)`;
  if (!own) return `🛡️ ${total} (чужой)`;
  return `🛡️ ${total} (свой ${own} • чужой ${foreign})`;
}
function markLatestTankAggro(state, userId) {
  state.latestTankAggroUserId = String(userId);
  state.latestTankAggroRounds = 3;
}
function useSkill(b, p, c, e, state, targetId) {
  const id = b.id, u = p.user_id;
  switch (p.class_key) {
    case 'warrior': { const r = hurtEnemy(b, state, rand(55,70), 'physical', 'warrior'); for (const m of state.minions || []) { if (m.hp > 0) { const splash = Math.min(m.hp, rand(20,30)); m.hp -= splash; } } state.minions = (state.minions || []).filter(m => m.hp > 0); e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2); e.warriorAggroRounds = 2; e.warriorAggroBonus = 0.15; markLatestTankAggro(state,u); saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `⚔️ <@${u}> использует Рассекающий удар: **${r.dealt}** урона → ${r.target}, задевает миньонов и получает +15% агро на 2 раунда.`; }
    case 'paladin': { const t = targetById(id, targetId) || p; if (t.user_id === u) { addTrackedShield(e, 70, u, 'add'); } else { const te = effects(t); addTrackedShield(te, 55, u, 'add'); updateEffects(id, t.user_id, te); addTrackedShield(e, 30, u, 'add'); } e.guardRounds = Math.max(Number(e.guardRounds || 0), 1); e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 3); markLatestTankAggro(state,u); saveState(b,state); return t.user_id === u ? `✨ <@${u}> не выбирает цель и накладывает **щит 70 HP на себя**, снижает входящий урон на 1 ход и повышает агро.` : `✨ <@${u}> накладывает на <@${t.user_id}> щит **55 HP**, себе — **30 HP**, снижает входящий урон на 1 ход и повышает агро.`; }
    case 'guardian': e.guardRounds = 2; e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2); markLatestTankAggro(state,u); saveState(b,state); e.interceptRounds = Math.max(Number(e.interceptRounds || 0), 2); e.interceptChance = 0.35; return `🛡️ <@${u}> снижает входящий урон на 50%, провоцирует босса на 2 атаки и получает 35% шанс перехватить одиночный удар по союзнику.`;
    case 'cleric': { const t = targetById(id, targetId) || p, sacrifice = Math.min(rand(20, 30), Math.max(0, p.hp - 1)); if (sacrifice <= 0) return `💔 <@${u}> не хватает HP для жертвы.`; db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(p.hp - sacrifice, id, u); const healed = healPlayer(id, u, t, rand(68, 88)); const te = effects(t); const shield = Math.max(1, Math.round(healed * 0.20)); te.shield = Number(te.shield || 0) + shield; updateEffects(id, t.user_id, te); return `💚 <@${u}> жертвует **${sacrifice} HP**, лечит <@${t.user_id}> на **${healed} HP** и даёт щит **${shield} HP**.`; }
    case 'priest': { state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'angel'); state.summons.push({ owner: u, type: 'angel', icon: '👼', name: 'Ангел-хранитель', hp: 100, maxHp: 100, heal: [15, 21], rounds: 5, support: true }); saveState(b, state); return `👼 <@${u}> призывает усиленного Ангела-хранителя на 5 ходов. В конце каждого раунда ангел лечит всю живую группу.`; }
    case 'bard': { const t = targetById(id, targetId) || p, te = effects(t); te.damageBuffTurns = 3; te.damageBuff = 0.20; updateEffects(id, t.user_id, te); return `🎵 <@${u}> усиливает <@${t.user_id}> на 20% на 3 хода.`; }
    case 'assassin': { const r = hurtEnemy(b, state, rand(75, 95), 'physical', 'assassin', 0.5); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `🗡️ <@${u}> наносит **${r.dealt}** теневого урона.`; }
    case 'archer': { let total = 0; const shots = []; for (let i = 0; i < 3; i++) { if (Math.random() * 100 < c.miss) { shots.push(`Стрела ${i + 1}: ❌ промах`); continue; } const r = hurtEnemy(b, state, rand(30, 38), 'physical', 'archer'); total += r.dealt; shots.push(`Стрела ${i + 1}: 💥 ${r.dealt} → ${r.target}`); } db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total, total, id, u); return `🏹 <@${u}> использует **Три выстрела**:\n${shots.join('\n')}\n**Всего: ${total} урона**.`; }
    case 'mage': { const r = hurtEnemy(b, state, rand(68, 88), 'magic', 'mage'); let splash=0; for(const m of state.minions||[]){const d=Math.min(m.hp,rand(35,50));m.hp-=d;splash+=d;} state.minions=(state.minions||[]).filter(m=>m.hp>0); saveState(b,state); const total=r.dealt+splash; db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `🔥 <@${u}> бросает массовый Огненный шар: **${r.dealt}** → ${r.target}${splash?` и **${splash}** урона всем миньонам`:''}.`; }
    case 'berserker': { let total = 0, hits = 0; for (let i = 0; i < 3; i++) { if (Math.random() * 100 < c.miss) continue; const r = hurtEnemy(b, state, Math.round(applyDamageBuff(p, rand(...c.damage)) * 0.62), 'physical', 'berserker'); total += r.dealt; hits++; } db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `🪓 <@${u}> проводит тройной удар: **${hits}/3** попаданий, **${total}** урона.`; }
    case 'engineer': state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'turret'); state.summons.push({ owner: u, type: 'turret', icon: '🔫', name: 'Турель', hp: 105, maxHp: 105, damage: [28, 38], miss: 8, permanent: true, damageType: 'physical' }); saveState(b, state); return `🔧 <@${u}> устанавливает турель. Она остаётся в бою, пока не будет уничтожена или заменена новой.`;
    case 'necromancer': { const r=hurtEnemy(b,state,rand(55,70),'magic','necromancer'); let curse=''; if(Math.random()<0.30){state.necromancerCurseRounds=2;state.necromancerCurseDamage=18;curse=' и накладывает Порчу на 2 хода';} saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🌑 <@${u}> наносит **${r.dealt} магического урона**${curse}.`; }

    case 'pyromancer': { const stacks=Math.max(0,Number(e.pyroBurnStacks||0)); const r=hurtEnemy(b,state,rand(65,85)+stacks*8,'magic','pyromancer'); e.pyroBurnStacks=Math.min(5,stacks+1); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🔥 <@${u}> использует Огненное копьё: **${r.dealt}** урона. Горение босса: **${e.pyroBurnStacks}/5**.`; }
    case 'duelist': { const combo=Number(e.combo||0); const r=hurtEnemy(b,state,Math.round(rand(65,82)*(1+combo*0.10)),'physical','duelist'); e.combo=Math.min(5,combo+1); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `⚔️ <@${u}> делает выпад на **${r.dealt}** урона. Комбо: ${e.combo}/5.`; }
    case 'reaper': { const r=hurtEnemy(b,state,rand(70,90),'physical','reaper'); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `☠️ <@${u}> применяет Жатву: **${r.dealt}** урона.`; }
    case 'mindlord': { const r=hurtEnemy(b,state,rand(60,80),'magic','mindlord'); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🧠 <@${u}> наносит **${r.dealt}** психического урона.`; }
    case 'druid': { const r=hurtEnemy(b,state,rand(45,60),'magic','druid'); state.bossWeakenRounds=2; state.bossWeaken=0.15; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🌿 <@${u}> опутывает босса: **${r.dealt}** урона и -15% урона босса на 3 раунда и сам атакует врагов.`; }
    case 'shaman': state.teamDamageTotemRounds=3; state.teamDamageTotem=0.15; state.summons=(state.summons||[]).filter(x=>x.owner!==u||x.type!=='strength_totem'); state.summons.push({owner:u,type:'strength_totem',icon:'🔥',name:'Тотем силы',hp:60,maxHp:60,rounds:3,support:true}); saveState(b,state); return `🪬 <@${u}> устанавливает Тотем силы на 3 раунда: +15% урона союзников.`;
    case 'chronomancer': { const targets=validTargets(id,'alive').filter(x=>x.user_id!==u); const t=targetById(id,targetId)||targets[0]||p; if(resourceType(t.class_key)==='mana') db.prepare('UPDATE world_boss_players SET mana=MIN(100,mana+30) WHERE battle_id=? AND user_id=?').run(id,t.user_id); else db.prepare('UPDATE world_boss_players SET energy=MIN(100,energy+30) WHERE battle_id=? AND user_id=?').run(id,t.user_id); return `⏳ <@${u}> ускоряет <@${t.user_id}> и восстанавливает 30 ресурса.`; }
    case 'illusionist': state.summons=(state.summons||[]).filter(x=>x.owner!==u||x.type!=='illusion'); state.summons.push({owner:u,type:'illusion',icon:'🎭',name:'Иллюзия',hp:40,maxHp:40,damage:[0,0],miss:100,rounds:4,support:true}); saveState(b,state); return `🎭 <@${u}> создаёт иллюзию с 40 HP, способную принять атаку.`;
    default: return 'Способность использована.';
  }
}

function useSecondSkill(b, p, c, e, state, targetId) {
  const id = b.id, u = p.user_id;
  switch (p.class_key) {
    case 'warrior': {
      e.shield = Math.max(Number(e.shield || 0), 50);
      e.guardRounds = Math.max(Number(e.guardRounds || 0), 2);
      e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2);
      e.warriorAggroRounds = 2;
      e.warriorAggroBonus = 0.30;
      return `📣 <@${u}> использует Боевой клич: щит **50 HP**, +25% физической и +15% магической защиты на 2 хода, провокация врагов на 2 раунда.`;
    }
    case 'paladin': {
      let total = 0;
      for (const t of validTargets(id, 'alive')) total += healPlayer(id, u, t, Math.max(1, Math.round(t.max_hp * 0.15)));
      e.shield = Math.max(Number(e.shield || 0), 35);
      e.guardRounds = Math.max(Number(e.guardRounds || 0), 1);
      e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2);
      return `☀️ <@${u}> освящает поле боя, восстанавливает группе **${total} HP**, получает щит **35 HP** и провоцирует врагов на 2 раунда.`;
    }
    case 'guardian': {
      e.shield = Math.max(Number(e.shield || 0), 70);
      e.guardRounds = Math.max(Number(e.guardRounds || 0), 2);
      return `🪨 <@${u}> принимает Каменную стойку: **щит 70 HP** и -50% входящего урона на 2 хода.`;
    }
    case 'cleric': {
      const r = hurtEnemy(b, state, rand(55, 75), 'holy', 'cleric');
      let healed = 0;
      for (const t of validTargets(id, 'alive')) healed += healPlayer(id, u, t, 20);
      db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt + healed, id, u);
      return `🌤️ <@${u}> применяет Карающий свет: **${r.dealt} урона** и **${healed} HP** лечения группе.`;
    }
    case 'priest': {
      let total = 0;
      for (const t of validTargets(id, 'alive')) total += healPlayer(id, u, t, rand(16, 22));
      return `🙏 <@${u}> читает Массовую молитву и восстанавливает группе **${total} HP**.`;
    }
    case 'bard': {
      const r = hurtEnemy(b, state, rand(70, 90), 'magic', 'bard');
      state.bossWeakenRounds = 2;
      state.bossWeaken = 0.18;
      saveState(b, state);
      db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u);
      return `🎻 <@${u}> создаёт Диссонанс: **${r.dealt} магического урона**, урон босса ослаблен на 18% на 2 раунда.`;
    }
    case 'assassin': {
      const r = hurtEnemy(b, state, rand(100, 120), 'physical', 'assassin', 0.45);
      db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u);
      return `☠️ <@${u}> применяет Ядовитый клинок и наносит **${r.dealt} урона**, частично игнорируя защиту.`;
    }
    case 'archer': {
      state.bossVulnerabilityOwner = u;
      state.bossVulnerabilityOwnerTurns = 2;
      state.bossVulnerability = 0.15;
      let attackText = '';
      if (Math.random() * 100 < c.miss) {
        attackText = ' После установки метки обычный выстрел промахивается.';
      } else {
        let dmg = applyDamageBuff(p, rand(...c.damage));
        const crit = Math.random() * 100 < CRIT_CHANCE;
        if (crit) dmg = Math.round(dmg * CRIT_MULTIPLIER);
        const r = hurtEnemy(b, state, dmg, c.damageType || 'physical', 'archer');
        db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?')
          .run(r.dealt, r.dealt, id, u);
        attackText = ` Затем Лучник делает обычный выстрел и наносит **${r.dealt} урона** → ${r.target}${crit ? ' • 💥 КРИТ!' : ''}.`;
      }
      saveState(b, state);
      return `🎯 <@${u}> ставит Метку охотника: босс получает **+15% урона в течение следующих 2 ходов Лучника**.${attackText}`;
    }
    case 'mage': {
      const r = hurtEnemy(b, state, rand(65, 85), 'magic', 'mage');
      { const beforeRage=Number(state.rage||0); state.rage=Math.max(0,beforeRage-25); addBattleStat(id,u,'rage_reduced',beforeRage-state.rage); }
      saveState(b, state);
      db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u);
      return `❄️ <@${u}> применяет Ледяные оковы: **${r.dealt} урона** и снижает ярость босса на **25**.`;
    }
    case 'berserker': {
      const sacrifice = 20;
      const hp = Math.max(1, Number(p.hp || 1) - sacrifice);
      db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(hp, id, u);
      e.doubleNext = true;
      return `🩸 <@${u}> использует Кровавый рёв: теряет **${sacrifice} HP**, следующая атака удвоена.`;
    }
    case 'engineer': {
      let repaired = 0;
      for (const summon of state.summons || []) {
        if (summon.owner !== u) continue;
        const before = summon.hp;
        summon.hp = Math.min(summon.maxHp, summon.hp + 50);
        repaired += summon.hp - before;
      }
      for (const t of validTargets(id, 'alive')) {
        const te = effects(t);
        te.shield = Number(te.shield || 0) + 10;
        updateEffects(id, t.user_id, te);
      }
      saveState(b, state);
      return `🛠️ <@${u}> запускает Ремонтного дрона: призывы восстановили **${repaired} HP**, союзники получили щиты по **10 HP**.`;
    }
    case 'necromancer': {
      state.summons=state.summons||[];
      const hp=rand(105,130);
      state.summons=state.summons.filter(x=>x.owner!==u||x.type!=='skeleton');
      state.summons.push({owner:u,type:'skeleton',icon:'💀',name:'Скелет',hp,maxHp:hp,damage:[30,40],miss:10,permanent:true,damageType:'physical'});
      saveState(b,state);
      return `💀 <@${u}> призывает скелета с **${hp} HP**. Скелет атакует одного врага и остаётся в бою, пока не будет уничтожен или заменён.`;
    }

    case 'pyromancer': { const stacks=Math.max(0,Number(e.pyroBurnStacks||0)); const r=hurtEnemy(b,state,rand(85,110)+stacks*10,'magic','pyromancer'); e.pyroBurnStacks=Math.min(5,stacks+2); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🔥 <@${u}> применяет Пламя: **${r.dealt}** урона и накладывает 2 стака. Горение босса: **${e.pyroBurnStacks}/5**.`; }
    case 'duelist': { e.counterAttack=true; let dmg=applyDamageBuff(p,rand(...c.damage)); const r=hurtEnemy(b,state,dmg,'physical','duelist'); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `⚔️ <@${u}> делает автоматическую атаку по ${r.target} на **${r.dealt} урона** и готовит Ответный удар на первую полученную атаку.`; }
    case 'reaper': { const hp=Math.max(1,p.hp-20); db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(hp,id,u); e.doubleNext=true; return `🩸 <@${u}> платит 20 HP. Следующая атака наносит двойной урон.`; }
    case 'mindlord': { const r=hurtEnemy(b,state,rand(65,75),'magic','mindlord'); state.magicVulnerabilityRounds=2; state.magicVulnerability=0.20; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🧠 <@${u}> наносит **${r.dealt}** урона и повышает получаемый магический урон цели на 20% на 2 раунда.`; }
    case 'druid': { const spirit=String(targetId||'wolf'); for(const t of validTargets(id,'alive')){const te=effects(t);if(spirit==='bear'){te.protectionBuffRounds=2;te.protectionBuff=Math.max(Number(te.protectionBuff||0),0.25);}else if(spirit==='owl'){te.accuracyBuffRounds=2;te.accuracyBuff=Math.max(Number(te.accuracyBuff||0),0.25);}else{te.groupDamageRounds=2;te.groupDamage=Math.max(Number(te.groupDamage||0),0.25);}updateEffects(id,t.user_id,te);} const meta=spirit==='bear'?{icon:'🐻',name:'Медведя',bonus:'+25% защиты'}:spirit==='owl'?{icon:'🦉',name:'Совы',bonus:'+25% точности'}:{icon:'🐺',name:'Волка',bonus:'+25% урона'};state.summons=(state.summons||[]).filter(x=>x.owner!==u||x.type!=='beast_spirit');state.summons.push({owner:u,type:'beast_spirit',icon:meta.icon,name:`Дух ${meta.name}`,hp:75,maxHp:75,damage:[20,28],miss:8,rounds:3,support:false,damageType:'magic'});saveState(b,state);return `${meta.icon} <@${u}> призывает Дух ${meta.name}: группа получает **${meta.bonus}** на 3 раунда и сам атакует врагов.`; }
    case 'shaman': state.teamDefenseTotemRounds=3; state.teamDefenseTotem=0.15; state.summons=(state.summons||[]).filter(x=>x.owner!==u||x.type!=='defense_totem'); state.summons.push({owner:u,type:'defense_totem',icon:'🛡️',name:'Тотем защиты',hp:80,maxHp:80,rounds:3,support:true}); saveState(b,state); return `🛡️ <@${u}> устанавливает Тотем защиты на 3 раунда: -15% входящего урона.`;
    case 'chronomancer': { const targets=validTargets(id,'alive').filter(x=>x.user_id!==u); const t=targetById(id,targetId)||targets[0]||p,te=effects(t); te.skillCd=Math.max(0,Number(te.skillCd||0)-1); te.skill2Cd=Math.max(0,Number(te.skill2Cd||0)-1); updateEffects(id,t.user_id,te); return `⏪ <@${u}> уменьшает КД способности <@${t.user_id}> на 1 ход.`; }
    case 'illusionist': state.bossAccuracyDownRounds=2; state.bossAccuracyDown=0.20; saveState(b,state); return `🌫️ <@${u}> создаёт Мираж: точность босса снижена на 20% на 2 раунда.`;
    default:
      return 'Вторая способность использована.';
  }
}

function useUlt(b, p, c, e, state, targetId) {
  const id = b.id, u = p.user_id;
  switch (p.class_key) {
    case 'warrior': { markLatestTankAggro(state,u); saveState(b,state); const r=hurtEnemy(b,state,rand(110,140),'physical','warrior'); e.shield=Math.max(Number(e.shield||0),60); e.guardRounds=Math.max(Number(e.guardRounds||0),2); e.tauntRounds=Math.max(Number(e.tauntRounds||0),2); e.damageBuffTurns=Math.max(Number(e.damageBuffTurns||0),1); e.damageBuff=Math.max(Number(e.damageBuff||0),0.30); db.prepare('UPDATE world_boss_players SET energy=MIN(100,energy+20),damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `💥 <@${u}> совершает Неудержимый натиск: **${r.dealt}** урона → ${r.target}, щит **60 HP**, +30% урона на следующий ход и провокация на 2 раунда.`; }
    case 'paladin': markLatestTankAggro(state,u); saveState(b,state); for (const t of validTargets(id, 'alive')) { const te = effects(t); addTrackedShield(te, t.user_id === u ? 60 : 40, u, 'add'); updateEffects(id, t.user_id, te); } e.guardRounds = Math.max(Number(e.guardRounds || 0), 2); e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 3); return `✨ <@${u}> накладывает союзникам щиты по **40 HP**, себе **60 HP**, получает -50% входящего урона на 2 хода и провоцирует босса с миньонами на 3 раунда.`;
    case 'guardian': { markLatestTankAggro(state,u); saveState(b,state); e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2); e.guardianUltRounds = Math.max(Number(e.guardianUltRounds || 0), 2); e.interceptRounds = Math.max(Number(e.interceptRounds || 0), 2); for (const t of validTargets(id, 'alive')) { if (t.user_id === u) continue; const te = effects(t); te.partyGuardRounds = Math.max(Number(te.partyGuardRounds || 0), 2); te.partyGuardMultiplier = 0.8; updateEffects(id, t.user_id, te); } return `🛡️ <@${u}> применяет абсолютную провокацию: следующие 2 одиночные атаки направлены в Стража, он получает -40% урона, союзники — -20% урона.`; }
    case 'cleric': { const t = targetById(id, targetId) || p, healed = healPlayer(id, u, t, t.max_hp); return `🌟 <@${u}> полностью исцеляет <@${t.user_id}> на **${healed} HP**.`; }
    case 'priest': { const dead = targetById(id, targetId, 'dead'); if (!dead) return `✨ Нет выбранной погибшей цели.`; const de=effects(dead),snap=de.deathResourceSnapshot||{}; const restoredEnergy=Number(snap.energy ?? dead.energy ?? 0),restoredMana=Number(snap.mana ?? dead.mana ?? 0),restoredUlt=Number(snap.ultCharge ?? dead.ult_charge ?? 0); db.prepare("UPDATE world_boss_players SET status='alive',hp=ROUND(max_hp*0.5),energy=?,mana=?,ult_charge=? WHERE battle_id=? AND user_id=?").run(restoredEnergy,restoredMana,restoredUlt,id,dead.user_id); delete de.deathResourceSnapshot; updateEffects(id,dead.user_id,de); return `✨ <@${u}> воскрешает <@${dead.user_id}>! Игрок возвращается с **${Math.round(dead.max_hp * 0.5)} HP**, а ресурс и заряд ульты восстановлены до значений перед смертью.`; }
    case 'bard': {
      let totalHealed = 0;
      const healedTargets = [];
      for (const t of validTargets(id, 'alive')) {
        const te = effects(t);
        te.groupDamageRounds = 2;
        te.groupDamage = 0.25;
        updateEffects(id, t.user_id, te);
        const amount = Math.max(1, Math.round(Number(t.max_hp || 0) * 0.25));
        const healed = healPlayer(id, u, t, amount);
        totalHealed += healed;
        if (healed > 0) healedTargets.push(`<@${t.user_id}> +${healed}`);
      }
      return `🎼 <@${u}> исполняет Гимн героев: вся группа получает **+25% урона на 2 раунда** и восстанавливает **25% максимального HP**${totalHealed ? ` — всего **${totalHealed} HP** (${healedTargets.join(', ')})` : ''}.`;
    }
    case 'assassin': { const r = hurtEnemy(b, state, rand(170, 210), 'physical', 'assassin', 1); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `☠️ <@${u}> наносит **${r.dealt}** смертельного урона.`; }
    case 'archer': { const enemies = 1 + (state.minions || []).length; const pool = 240; const share = Math.floor(pool / Math.max(1, enemies)); let total = 0; for (const m of state.minions || []) { const d = Math.min(m.hp, share); const died = m.hp > 0 && m.hp - d <= 0; m.hp -= d; total += d; if (died) { state.log.push(`💀 Миньон босса **${m.name}** уничтожен градом стрел!`); state.deathStats = state.deathStats || { players: 0, bossMinions: 0, playerSummons: 0 }; state.deathStats.bossMinions = Number(state.deathStats.bossMinions || 0) + 1; } } state.minions = (state.minions || []).filter(x => x.hp > 0); const bossDamage = Math.min(b.boss_hp, pool - share * (enemies - 1)); db.prepare('UPDATE world_boss_battles SET boss_hp=MAX(0,boss_hp-?) WHERE id=?').run(bossDamage,id); total += bossDamage; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `🏹 <@${u}> обрушивает град стрел: **${total}** общего урона, распределённого между ${enemies} противниками.`; }
    case 'mage': { const r = hurtEnemy(b, state, rand(175, 225), 'magic', 'mage'); let splash=0; for(const m of state.minions||[]){const d=Math.min(m.hp,rand(75,105));m.hp-=d;splash+=d;} state.minions=(state.minions||[]).filter(m=>m.hp>0); saveState(b,state); const total=r.dealt+splash; db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `☄️ <@${u}> вызывает Метеор: **${r.dealt}** по основной цели${splash?` и **${splash}** по всем миньонам`:''}. Общий урон: **${total}**.`; }
    case 'berserker': e.bloodRageTurns = 6; return `🔥 <@${u}> входит в Кровавую ярость на 6 своих ходов: двойной исходящий урон и +25% входящего урона.`;
    case 'engineer': state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'golem'); state.summons.push({ owner: u, type: 'golem', icon: '🤖', name: 'Голем', hp: 260, maxHp: 260, damage: [46, 62], miss: 5, permanent: true, damageType: 'physical' }); saveState(b, state); return `🤖 <@${u}> призывает голема. Он остаётся в бою, пока не будет уничтожен или заменён новым.`;
    case 'necromancer': state.summons=(state.summons||[]).filter(x=>x.owner!==u||x.type!=='army'); for(let i=0;i<3;i++){const hp=rand(125,150);state.summons.push({owner:u,type:'army',icon:'🦴',name:`Скелет армии ${i+1}`,hp,maxHp:hp,damage:[34,44],miss:8,rounds:3,attackAll:true,damageType:'physical'});} saveState(b,state); return `💀 <@${u}> поднимает **3 скелетов** с 100–120 HP. В течение 3 раундов они атакуют всех врагов.`;

    case 'pyromancer': { const stacks=Math.max(0,Number(e.pyroBurnStacks||0)); const r=hurtEnemy(b,state,rand(180,220)+stacks*55,'magic','pyromancer'); e.pyroBurnStacks=0; db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🔥 <@${u}> выпускает Адское пламя: **${r.dealt}** урона и взрывает **${stacks}** стаков Горения.`; }
    case 'duelist': { const combo=Number(e.combo||0); let total=0; for(let i=0;i<5;i++) total+=hurtEnemy(b,state,Math.round(rand(48,60)*(1+combo*0.10)),'physical','duelist').dealt; e.combo=0; db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `⚔️ <@${u}> проводит Идеальную серию: **${total}** урона.`; }
    case 'reaper': { const fresh=db.prepare('SELECT boss_hp,boss_max_hp FROM world_boss_battles WHERE id=?').get(id); const bonus=fresh.boss_hp/fresh.boss_max_hp<0.3?80:0,r=hurtEnemy(b,state,160+bonus,'physical','reaper'); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `☠️ <@${u}> выносит Приговор: **${r.dealt}** урона${bonus?' с бонусом добивания':''}.`; }
    case 'mindlord': { const r=hurtEnemy(b,state,rand(150,180),'magic','mindlord'); { const beforeRage=Number(state.rage||0); state.rage=Math.max(0,beforeRage-50); addBattleStat(id,u,'rage_reduced',beforeRage-state.rage); } state.bossAccuracyDownRounds=2; state.bossAccuracyDown=0.20; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🧠 <@${u}> контролирует сознание: **${r.dealt}** урона, -50 ярости и -20% точности босса на 2 раунда.`; }
    case 'druid': { for(const t of validTargets(id,'alive')){const te=effects(t);te.groupDamageRounds=2;te.groupDamage=Math.max(Number(te.groupDamage||0),0.15);te.accuracyBuffRounds=2;te.accuracyBuff=0.15;te.protectionBuffRounds=2;te.protectionBuff=0.15;updateEffects(id,t.user_id,te);} return `🌳 <@${u}> активирует Силу природы: Медведь, Волк и Сова усиливают всю группу на 3 раунда и сам атакует врагов.`; }
    case 'shaman': state.teamDamageTotemRounds=3;state.teamDamageTotem=0.15;state.teamDefenseTotemRounds=3;state.teamDefenseTotem=0.15;state.healTotemRounds=3;state.summons=(state.summons||[]).filter(x=>x.owner!==u||!['strength_totem','defense_totem','healing_spirit'].includes(x.type));state.summons.push({owner:u,type:'strength_totem',icon:'🔥',name:'Тотем силы',hp:60,maxHp:60,rounds:3,support:true},{owner:u,type:'defense_totem',icon:'🛡️',name:'Тотем защиты',hp:80,maxHp:80,rounds:3,support:true},{owner:u,type:'healing_spirit',icon:'👻',name:'Дух исцеления',hp:70,maxHp:70,rounds:3,support:true});saveState(b,state);return `🪬 <@${u}> созывает Совет духов: Тотем силы, Тотем защиты и Дух исцеления действуют 3 раунда.`;
    case 'chronomancer': state.extraActionRound=true; saveState(b,state); return `⏳ <@${u}> открывает Временной разлом: все союзники получают дополнительное действие в следующем раунде.`;
    case 'illusionist': for(let i=0;i<2;i++)state.summons.push({owner:u,type:'illusion',icon:'🎭',name:'Зеркальная копия',hp:60,maxHp:60,damage:[0,0],miss:100,rounds:3,support:true});state.bossAccuracyDownRounds=3;state.bossAccuracyDown=0.35;saveState(b,state);return `🪞 <@${u}> создаёт две копии по 60 HP и снижает точность всех врагов на 35% на 3 раунда.`;
    default: return 'Ульта использована.';
  }
}


function summonDetailKey(summon) {
  return `${String(summon.owner)}:${String(summon.type || 'summon')}:${String(summon.name || 'Призыв')}`;
}
function ensureSummonDetail(state, summon) {
  state.summonDetails = state.summonDetails || {};
  const key = summonDetailKey(summon);
  if (!state.summonDetails[key]) state.summonDetails[key] = {
    owner: String(summon.owner), type: String(summon.type || 'summon'),
    name: String(summon.name || 'Призыв'), icon: String(summon.icon || '•'),
    damage: 0, healing: 0, absorbed: 0, attacks: 0, misses: 0,
    destroyed: 0, expired: 0, support: Boolean(summon.support),
  };
  return state.summonDetails[key];
}
function summonDetailsForFinal(state) {
  for (const summon of state.summons || []) ensureSummonDetail(state, summon);
  return Object.values(state.summonDetails || {});
}

async function summonsAct(b) {
  const state = stateOf(b);
  const damageEntries = new Map();
  const healingEntries = new Map();
  const ownerDamage = {};
  state.summonStats = state.summonStats || {};

  for (const summon of state.summons || []) {
    if ((!summon.permanent && Number(summon.rounds || 0) <= 0) || summon.hp <= 0) continue;

    const owner = String(summon.owner);
    const key = `${owner}:${summon.type}:${summon.name}`;
    const detail = ensureSummonDetail(state, summon);
    const ownerPlayer = battlePlayers(b.id).find(p => p.user_id === owner);

    if (summon.support) {
      // Поддерживающие тотемы не имеют массива damage и не должны пытаться атаковать.
      // Ранее rand(...summon.damage) падал на Тотеме защиты в конце хода последнего игрока,
      // из-за чего раунд зависал и автоатака больше не запускалась.
      if (summon.type === 'angel' || summon.type === 'healing_spirit') {
        let healed = 0;
        const healRange = Array.isArray(summon.heal)
          ? summon.heal
          : summon.type === 'healing_spirit' ? [10, 16] : [12, 20];
        for (const target of battlePlayers(b.id).filter(p => p.status === 'alive')) {
          healed += healPlayer(b.id, owner, target, rand(...healRange));
        }
        const current = healingEntries.get(key) || { owner, name: summon.name, icon: summon.icon || '👼', healing: 0, count: 0 };
        current.healing += healed;
        current.count += 1;
        detail.healing += healed;
        detail.attacks += 1;
        healingEntries.set(key, current);

        state.summonStats[owner] = state.summonStats[owner] || { damage: 0, absorbed: 0, healing: 0 };
        state.summonStats[owner].healing += healed; addBattleStat(b.id,owner,'summon_healing',healed);
      }
      // Тотем силы и Тотем защиты дают постоянный эффект через state и не атакуют.
      continue;
    }

    let dealt = 0;
    let missed = false;
    if (Math.random() * 100 >= Number(summon.miss || 0)) {
      const r = hurtEnemy(b, state, rand(...summon.damage), summon.damageType || 'physical', ownerPlayer?.class_key || null);
      dealt = r.dealt;
      ownerDamage[owner] = (ownerDamage[owner] || 0) + dealt; addBattleStat(b.id,owner,'summon_damage',dealt);

      state.summonStats[owner] = state.summonStats[owner] || { damage: 0, absorbed: 0, healing: 0 };
      state.summonStats[owner].damage += dealt;
    } else {
      missed = true;
    }

    const current = damageEntries.get(key) || {
      owner,
      name: summon.name,
      icon: summon.icon || '⚙️',
      damage: 0,
      hits: 0,
      misses: 0,
      count: 0
    };
    current.damage += dealt;
    current.hits += dealt > 0 ? 1 : 0;
    current.misses += missed ? 1 : 0;
    current.count += 1;
    detail.damage += dealt;
    detail.attacks += 1;
    detail.misses += missed ? 1 : 0;
    damageEntries.set(key, current);
  }

  state.summons = (state.summons || []).filter(summon => summon.hp > 0 && (summon.permanent || Number(summon.rounds || 0) > 0));
  saveState(b, state);

  for (const [owner, damage] of Object.entries(ownerDamage)) {
    db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?')
      .run(damage, damage, b.id, owner);
  }

  // Каждая турель, группа скелетов, голем и ангел теперь записываются в журнал отдельно.
  for (const entry of damageEntries.values()) {
    const countText = entry.count > 1 ? ` ×${entry.count}` : '';
    if (entry.damage > 0) {
      addLog(b, `${entry.icon} **${entry.name}${countText}** игрока <@${entry.owner}> наносит **${entry.damage} урона**${entry.misses ? ` • промахов: ${entry.misses}` : ''}.`);
    } else {
      addLog(b, `${entry.icon} **${entry.name}${countText}** игрока <@${entry.owner}> не попадает по врагу.`);
    }
  }
  for (const entry of healingEntries.values()) {
    const countText = entry.count > 1 ? ` ×${entry.count}` : '';
    addLog(b, `${entry.icon} **${entry.name}${countText}** игрока <@${entry.owner}> восстанавливает группе **${entry.healing} HP**.`);
  }
}
function tickOwnerSummons(battleId, ownerId) {
  const b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(battleId); if (!b) return;
  const state = stateOf(b); let changed = false;
  for (const summon of state.summons || []) {
    if (summon.owner !== String(ownerId) || summon.permanent || Number(summon.rounds || 0) <= 0) continue;
    summon.rounds--; changed = true;
    const detail = ensureSummonDetail(state, summon);
    if (summon.rounds <= 0) { detail.expired += 1; state.log.push(`⌛ Призыв **${summon.name}** игрока <@${summon.owner}> завершает срок службы и исчезает.`); state.deathStats = state.deathStats || { players: 0, bossMinions: 0, playerSummons: 0 }; state.deathStats.playerSummons = Number(state.deathStats.playerSummons || 0) + 1; }
  }
  if (changed) { state.summons = (state.summons || []).filter(x => x.hp > 0 && (x.permanent || Number(x.rounds || 0) > 0)); state.log = state.log.slice(-12); saveState(b, state); }
}

function applyPyromancerBurnRound(id){
  let b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); if(!b||Number(b.boss_hp||0)<=0)return 0;
  const state=stateOf(b); let total=0;
  for(const p of battlePlayers(id).filter(x=>x.status==='alive'&&x.class_key==='pyromancer')){
    const e=effects(p),stacks=Math.max(0,Number(e.pyroBurnStacks||0)); if(!stacks)continue;
    const r=hurtEnemy(b,state,rand(8,10)*stacks,'magic','pyromancer'); if(r.dealt<=0)continue;
    total+=r.dealt; db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,p.user_id);
    addBattleStat(id,p.user_id,'dot_damage',r.dealt); state.log.push(`🔥 Горение <@${p.user_id}> наносит **${r.dealt}** урона (${stacks} стак${stacks===1?'':'а'}).`);
  }
  state.log=state.log.slice(-40); saveState(b,state); return total;
}

async function nextTurn(id, previousAlive = null) {
  const before = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
  const previous = before ? currentPlayer(before).p : null;
  if (previous) tickOwnerSummons(id, previous.user_id);
  let b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
  const aliveBeforeAdvance = battlePlayers(id).filter(x => x.status === 'alive');
  let alive = aliveBeforeAdvance;

  // Босс отвечает после каждых четырёх полностью завершённых ходов игроков.
  // Счётчик не зависит от длины группы и не занимает место в очереди игроков.
  let cadenceState = stateOf(b);
  cadenceState.playerTurnsSinceBossAttack = Number(cadenceState.playerTurnsSinceBossAttack || 0) + 1;
  const bossAttackDue = cadenceState.playerTurnsSinceBossAttack >= 4;
  if (bossAttackDue) cadenceState.playerTurnsSinceBossAttack = 0;
  saveState(b, cadenceState);
  // Переход строится по ID только что сходившего игрока, а не по старому индексу.
  // Поэтому смерть/воскрешение или изменение списка участников не может «съесть» чужой ход.
  const previousIndexNow = previous ? alive.findIndex(x => x.user_id === previous.user_id) : Number(b.turn_index || 0);
  let ni = previousIndexNow >= 0 ? previousIndexNow + 1 : Math.min(Number(b.turn_index || 0), alive.length);
  if (ni >= alive.length) {
    let roundState = stateOf(b);
    roundState.playerActionsThisRound = 0;
    saveState(b, roundState);

    applyPyromancerBurnRound(id);
    b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
    if (b.boss_hp <= 0) return finish(id, true);

    // Ошибка отдельного призыва или действия босса больше не должна навсегда стопорить бой.
    try {
      await summonsAct(b);
    } catch (error) {
      console.error(`[WorldBoss] summonsAct battle=${id} failed; round will continue:`, error);
      const failedBattle = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
      if (failedBattle) addLog(failedBattle, '⚠️ Один из призывов не смог выполнить действие. Бой автоматически продолжен.');
    }

    b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
    if (b.boss_hp <= 0) return finish(id, true);

    b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
    alive = battlePlayers(id).filter(x => x.status === 'alive');
    if (!alive.length) return finish(id, false);
    ni = 0;
    db.prepare('UPDATE world_boss_battles SET round_no=round_no+1 WHERE id=?').run(id);
  }

  // Ответная атака выполняется между ходами игроков. Она не изменяет turn_index.
  if (bossAttackDue) {
    // Запоминаем реальную очередь до удара босса: если он убьёт кого-то перед
    // следующим игроком, очередь пересоберётся по user_id и никого не пропустит.
    const orderBeforeBoss = alive.map(x => x.user_id);
    const searchStart = Math.min(ni, Math.max(0, orderBeforeBoss.length - 1));
    try {
      b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
      const turnBeforeBoss = Number(b.turn_index || 0);
      await bossTurn(id);
      const afterBoss = db.prepare('SELECT turn_index FROM world_boss_battles WHERE id=?').get(id);
      if (afterBoss && Number(afterBoss.turn_index) !== turnBeforeBoss) {
        console.error(`[WorldBoss] boss action changed player turn index ${turnBeforeBoss} -> ${afterBoss.turn_index}; restoring`);
        db.prepare('UPDATE world_boss_battles SET turn_index=? WHERE id=?').run(turnBeforeBoss,id);
      }
    } catch (error) {
      console.error(`[WorldBoss] bossTurn battle=${id} failed; player queue will continue:`, error);
      const failedBattle = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
      if (failedBattle) addLog(failedBattle, '⚠️ Ответная атака босса завершилась технической ошибкой. Очередь игроков автоматически продолжена.');
    }

    b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
    alive = battlePlayers(id).filter(x => x.status === 'alive');
    if (!alive.length) return finish(id, false);

    const aliveIds = new Set(alive.map(x => x.user_id));
    let intendedNextId = null;
    for (let offset = 0; offset < orderBeforeBoss.length; offset++) {
      const candidateId = orderBeforeBoss[(searchStart + offset) % orderBeforeBoss.length];
      if (aliveIds.has(candidateId)) { intendedNextId = candidateId; break; }
    }
    ni = intendedNextId ? alive.findIndex(x => x.user_id === intendedNextId) : 0;
    if (ni < 0) ni = 0;
  }

  db.prepare('UPDATE world_boss_battles SET turn_index=?,turn_deadline=? WHERE id=?').run(ni, Date.now() + TURN_MS, id); await refresh(id); armTurn(id);
}
function damagePlayerSummons(state, ratio = 0.55) {
  let total = 0;
  state.deathStats = state.deathStats || { players: 0, bossMinions: 0, playerSummons: 0 };
  state.summonStats = state.summonStats || {};
  for (const summon of state.summons || []) {
    const hit = Math.min(summon.hp, Math.max(1, Math.round(rand(24, 40) * ratio)));
    const died = summon.hp > 0 && summon.hp - hit <= 0;
    summon.hp = Math.max(0, summon.hp - hit); total += hit;
    const detail = ensureSummonDetail(state, summon);
    detail.absorbed += hit;
    if (died) detail.destroyed += 1;
    state.summonStats[summon.owner] = state.summonStats[summon.owner] || { damage: 0, absorbed: 0, healing: 0 };
    state.summonStats[summon.owner].absorbed += hit;
    if (died) { state.log.push(`💥 Призыв **${summon.name}** игрока <@${summon.owner}> уничтожен!`); state.deathStats.playerSummons = Number(state.deathStats.playerSummons || 0) + 1; }
  }
  state.summons = (state.summons || []).filter(s => s.hp > 0 && (s.permanent || Number(s.rounds || 0) > 0));
  return total;
}

function applyBossCurse(id, state, players, type, rounds = 1) {
  const eligible = players.filter(p => Number(effects(p).bossControlImmunityTurns || 0) <= 0);
  if (!eligible.length) return null;
  const target = pick(eligible), e = effects(target);
  if (type === 'skill') { e.skillSilencedTurns = Math.max(Number(e.skillSilencedTurns || 0), rounds); e.bossControlImmunityTurns = Math.max(Number(e.bossControlImmunityTurns || 0), 2); updateEffects(id, target.user_id, e); return `🔒 <@${target.user_id}> не может использовать способности **${rounds} хода**.`; }
  if (type === 'ult') { e.ultSilencedTurns = Math.max(Number(e.ultSilencedTurns || 0), rounds); e.bossControlImmunityTurns = Math.max(Number(e.bossControlImmunityTurns || 0), 2); updateEffects(id, target.user_id, e); return `⛓️ <@${target.user_id}> не может использовать ульту **${rounds} хода**.`; }
  return null;
}
function destroyRandomSummon(state) {
  const list = state.summons || []; if (!list.length) return null;
  const chosen = pick(list);
  if (chosen.type === 'golem' && Math.random() < 0.5) return `🛡️ ${chosen.name} выдерживает попытку уничтожения.`;
  const detail = ensureSummonDetail(state, chosen);
  detail.destroyed += 1;
  const idx = list.indexOf(chosen); if (idx >= 0) list.splice(idx, 1);
  state.deathStats = state.deathStats || { players: 0, bossMinions: 0, playerSummons: 0 }; state.deathStats.playerSummons = Number(state.deathStats.playerSummons || 0) + 1;
  return `💀 Босс уничтожает призыв **${chosen.name}** игрока <@${chosen.owner}>.`;
}
async function bossTurn(id) {
  let b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
  const boss = BOSSES.find(x => x.cardId === b.boss_card_id);
  const players = battlePlayers(id).filter(x => x.status === 'alive');
  if (!boss || !players.length) return;

  const state = stateOf(b);
  state.minions = state.minions || [];
  state.bossActionStats = state.bossActionStats || {};
  state.bossTurnNo = Number(state.bossTurnNo || 0) + 1;
  const bossActionNo = state.bossTurnNo;
  const empoweredBossAttack = bossActionNo % 4 === 0;
  const scheduledSpecial = bossActionNo % 3 === 0; // каждые 12 ходов игроков
  state.rage = clamp(Number(state.rage || 0) + Number(boss.rageGain || 10), 0, 100);

  if (boss.mechanic === 'overheat' && state.skipNextBossTurn) { state.skipNextBossTurn=false; state.log.push('🔥 Железный Колосс перегрет и **пропускает ход**.'); if(Number(state.overheatVulnerableRounds||0)>0)state.overheatVulnerableRounds--; saveState(b,state); return; }
  if (boss.mechanic === 'void_absorption' && bossActionNo%4===0) { const victim=pick(players),meta=resourceMeta(victim.class_key),key=meta.key,current=Number(victim[key]||0),drained=Math.min(40,current); db.prepare(`UPDATE world_boss_players SET ${key}=MAX(0,${key}-?) WHERE battle_id=? AND user_id=?`).run(drained,id,victim.user_id); state.log.push(`🕳️ **Поглощение Пустоты:** <@${victim.user_id}> теряет **${drained} ${meta.label.toLowerCase()}**.`); }
  if (boss.mechanic === 'chaos_rift') { const rift=state.minions.find(m=>m.isChaosRift); if(rift){rift.riftAge=Number(rift.riftAge||0)+1;if(rift.riftAge>=2){const eliteId=pick([2049,2050]),ec=MINIONS[eliteId];state.minions=state.minions.filter(m=>m!==rift);state.minions.push({cardId:eliteId,instanceId:`elite-${Date.now()}`,provoking:Boolean(ec.provoking),ownerBossCardId:boss.cardId,name:ec.name,hp:ec.maxHp,maxHp:ec.maxHp,damage:ec.damage,miss:ec.miss,damageType:ec.damageType||'magic'});state.log.push(`🌀 Разлом не уничтожен — выходит элитный **${ec.name}**!`);}} if(bossActionNo%3===0&&!state.minions.some(m=>m.isChaosRift)){state.minions.push({cardId:9039,instanceId:`rift-${Date.now()}`,name:'Разлом Хаоса',hp:Math.round(180*bossMinionHpMultiplier(players.length)),maxHp:Math.round(180*bossMinionHpMultiplier(players.length)),damage:[0,0],miss:100,damageType:'magic',isChaosRift:true,riftAge:0,provoking:false});state.log.push('🌀 Архонт открывает **Разлом Хаоса**. Уничтожьте его за 2 раунда!');} }
  if (boss.mechanic === 'decay_curse' && bossActionNo%2===0) { const victim=pick(players),e=effects(victim);e.decayCurseStacks=Math.min(3,Number(e.decayCurseStacks||0)+1);e.healingPenaltyTurns=Math.max(Number(e.healingPenaltyTurns||0),3);e.healingPenalty=0.50;updateEffects(id,victim.user_id,e);state.log.push(`☠️ <@${victim.user_id}> получает **Проклятие Разложения** (${e.decayCurseStacks}/3).`); }
  if (boss.mechanic === 'ice_shackles' && bossActionNo%3===0) { const victim=pick(players),e=effects(victim);e.skillSilencedTurns=Math.max(Number(e.skillSilencedTurns||0),1);e.ultSilencedTurns=Math.max(Number(e.ultSilencedTurns||0),1);updateEffects(id,victim.user_id,e);state.log.push(`❄️ **Ледяные оковы:** на следующем ходу <@${victim.user_id}> доступна только обычная атака.`); }
  if (boss.mechanic === 'chain_mastery' && (bossActionNo === 1 || bossActionNo % 2 === 0)) {
    const alreadyChained = players.filter(p => Number(effects(p).chainBound || 0) > 0);
    const pool = players.filter(p => !alreadyChained.some(x => x.user_id === p.user_id));
    const victim = pick(pool.length ? pool : players);
    if (victim) {
      // На поле одновременно остаётся только одна активная цепь.
      for (const p of players) {
        const pe = effects(p);
        if (p.user_id !== victim.user_id && Number(pe.chainBound || 0) > 0) {
          delete pe.chainBound;
          delete pe.chainSourceRound;
          updateEffects(id, p.user_id, pe);
        }
      }
      const e = effects(victim);
      e.chainBound = 1;
      e.chainSourceRound = bossActionNo;
      updateEffects(id, victim.user_id, e);
      state.log.push(`⛓️ **Клеймо Цепей:** <@${victim.user_id}> скован. При следующем полученном HP-уроне цепь перепрыгнет на другого игрока и передаст ему 35% урона.`);
    }
  }

  const hpRatio = b.boss_max_hp ? b.boss_hp / b.boss_max_hp : 1;
  const phase = hpRatio <= 0.25 ? 3 : hpRatio <= 0.5 ? 2 : 1;
  const interceptingTank = players.find(x => x.class_key === 'guardian' && effects(x).interceptRounds > 0);
  const tanks = players.filter(x => CLASSES[x.class_key]?.role === 'tank');
  const latestTank = players.find(x => x.user_id === String(state.latestTankAggroUserId || '') && CLASSES[x.class_key]?.role === 'tank');
  const otherTanks = tanks.filter(x => !latestTank || x.user_id !== latestTank.user_id);
  const nonTanks = players.filter(x => CLASSES[x.class_key]?.role !== 'tank');
  const chooseSingleTarget = () => {
    if (interceptingTank && Math.random() < Number(effects(interceptingTank).interceptChance || 0.35)) return interceptingTank;
    const extras=battleExtraStats(id); const maxDamage=Math.max(1,...players.map(x=>Number(x.damage_done||0))); const maxHeal=Math.max(1,...players.map(x=>Number(x.healing_done||0)));
    return weightedPick(players,x=>{
      const role=CLASSES[x.class_key]?.role; const lowHp=1-clamp(Number(x.hp||0)/Math.max(1,Number(x.max_hp||1)),0,1); const ex=extras[x.user_id]||{};
      let w=1+4*(Number(x.damage_done||0)/maxDamage)+3.5*(Number(x.healing_done||0)/maxHeal)+2.5*(Number(ex.support_points||0)/Math.max(1,...Object.values(extras).map(v=>Number(v.support_points||0))));
      if(lowHp>0.65)w+=phase>=2?4:2; if(role==='healer')w+=phase>=2?2.2:1; if(role==='support')w+=phase>=3?2:0.7;
      if(latestTank&&x.user_id===latestTank.user_id)w+=7; else if(role==='tank')w+=2.5; return w;
    }) || pick(players);
  };
  const target = chooseSingleTarget();
  const attackDamageType = pickDamageType(boss.attackTypes, 'physical');
  const phaseDamageMultiplier = phase === 3 ? 1.15 : phase === 2 ? 1.08 : 1;
  const bossDamageMultiplier = (Number(state.bossWeakenRounds || 0) > 0 ? 1 - Number(state.bossWeaken || 0) : 1) * phaseDamageMultiplier * (empoweredBossAttack ? 1.30 : 1);
  const effectiveBossMiss = Math.max(0, Number(boss.miss || 0) - (phase === 3 ? 5 : 0));

  const recordAction = action => {
    state.bossActionStats[action] = Number(state.bossActionStats[action] || 0) + 1;
    console.log(`[WorldBoss AI] battle=${id} bossTurn=${bossActionNo} phase=${phase} action=${action} empowered=${empoweredBossAttack} minions=${state.minions.length} rage=${state.rage}`);
  };

  const summon = () => {
    const freeSlots = Math.max(0, 3 - state.minions.length);
    if (!freeSlots) return null;

    const allowed = (boss.minions || []).filter(mid => MINIONS[mid]);
    if (!allowed.length) return null;

    // Каждый призыв вызывает случайно от 1 до 3 миньонов,
    // но общее число живых миньонов босса никогда не превышает 3.
    const summonCount = Math.min(freeSlots, rand(1, 3));
    const summoned = [];

    for (let i = 0; i < summonCount; i++) {
      const minionId = pick(allowed);
      const cfg = MINIONS[minionId];
      const hpScale = bossMinionHpMultiplier(players.length);
      const damageScale = bossMinionDamageMultiplier(players.length);
      const scaledMinionHp = Math.max(1, Math.round(cfg.maxHp * hpScale));
      const scaledMinionDamage = [
        Math.max(0, Math.round(Number(cfg.damage?.[0] || 0) * damageScale)),
        Math.max(0, Math.round(Number(cfg.damage?.[1] || 0) * damageScale)),
      ];
      state.minions.push({
        cardId: minionId,
        instanceId: `${minionId}-${Date.now()}-${i}-${Math.random().toString(36).slice(2,7)}`,
        provoking: Boolean(cfg.provoking),
        ownerBossCardId: boss.cardId,
        name: cfg.name,
        hp: scaledMinionHp,
        maxHp: scaledMinionHp,
        damage: scaledMinionDamage,
        miss: cfg.miss,
        damageType: cfg.damageType || 'physical',
        physicalResist: cfg.physicalResist || 0,
        magicResist: cfg.magicResist || 0,
        undead: Boolean(cfg.undead),
        dark: Boolean(cfg.dark),
      });
      summoned.push(`**${cfg.name}** — ❤️ ${scaledMinionHp}`);
    }

    state.lastSummonRound = bossActionNo;
    return `👾 **${boss.name}** призывает ${summonCount} ${summonCount === 1 ? 'миньона' : 'миньонов'}: ${summoned.join(', ')}.`;
  };

  let action = '';
  let text = '';

  if (!scheduledSpecial && state.rage >= 100 && bossActionNo - Number(state.lastRageUltRound || -99) >= 4) {
    action = 'RAGE_ULT';
    let total = 0;
    const rageType = pickDamageType(boss.attackTypes, attackDamageType);
    const totalBudget = Math.max(120, Number(boss.ultimateTotal || Math.round(((boss.damage[0] + boss.damage[1]) / 2) * 3.2)));
    // Для рейдов 6–12 человек ульта должна оставаться опасной для каждого,
    // а не становиться слабее из-за деления фиксированного бюджета на большую группу.
    const perTargetBase = Math.max(12, Number(boss.ultimatePerTarget || Math.round(totalBudget / Math.max(1, players.length))));
    for (const p of players) {
      const r = damageTarget(id, p, Math.round(perTargetBase * bossDamageMultiplier), rageType);
      total += r.hpDamage;
    }
    state.lastRageUltRound = bossActionNo;
    const summonDamage = damagePlayerSummons(state, 1);
    for (const p of battlePlayers(id).filter(x => x.status === 'alive')) { const pe = effects(p); pe.healingPenaltyTurns = Math.max(Number(pe.healingPenaltyTurns || 0), 2); pe.healingPenalty = 0.30; updateEffects(id, p.user_id, pe); }
    state.rage = 0;
    text = `🔥 **${boss.name} впадает в ярость!** Ультимативная массовая атака (${damageTypeLabel(rageType)} урон) наносит группе **${total} HP**${summonDamage ? ` и ${summonDamage} урона призывам` : ''}. 🩸 Лечение снижено на 30% на 2 хода.`;
  } else {
    // Гарантии: в нормальном бою ключевые механики не могут не появиться из-за неудачного RNG.
    const neverSummoned = Number(state.bossActionStats.SUMMON || 0) === 0;
    const neverCursed = Number(state.bossActionStats.SKILL_CURSE || 0) + Number(state.bossActionStats.ULT_CURSE || 0) + Number(state.bossActionStats.GROUP_CURSE || 0) === 0;
    const canSummon = state.minions.length < 3 && (boss.minions || []).length > 0;
    const canGroupCurse = bossActionNo - Number(state.lastGroupCurseRound || -99) >= 5;
    const forcedAoeCadence = phase === 3 ? 3 : 4;
    const forceAoe = bossActionNo - Number(state.lastForcedAoeRound || -99) >= forcedAoeCadence;

    if (scheduledSpecial) action = 'SPECIAL';
    else if (forceAoe) { action = 'AOE'; state.lastForcedAoeRound = bossActionNo; }
    else if (canSummon && bossActionNo - Number(state.lastSummonRound || -99) >= 3) action = 'SUMMON';
    else if (bossActionNo - Number(state.lastCurseRound || -99) >= 3) action = 'SKILL_CURSE';
    else if (neverSummoned && canSummon && bossActionNo >= 2) action = 'SUMMON';
    else if (neverCursed && bossActionNo >= 3) action = 'SKILL_CURSE';
    else {
      // Фаза 1: больше призывов. Фаза 2/3: больше АоЕ и проклятий.
      const weights = phase === 1
        ? [['ATTACK',24],['AOE',16],['SPECIAL',8],['SUMMON',24],['SKILL_CURSE',13],['ULT_CURSE',8],['DESTROY_SUMMON',3],['GROUP_CURSE',4]]
        : phase === 2
          ? [['ATTACK',20],['AOE',22],['SPECIAL',8],['SUMMON',18],['SKILL_CURSE',14],['ULT_CURSE',9],['DESTROY_SUMMON',4],['GROUP_CURSE',5]]
          : [['ATTACK',18],['AOE',25],['SPECIAL',8],['SUMMON',16],['SKILL_CURSE',14],['ULT_CURSE',10],['DESTROY_SUMMON',4],['GROUP_CURSE',5]];
      let roll = Math.random() * weights.reduce((sum, [,w]) => sum + w, 0);
      for (const [name, weight] of weights) { roll -= weight; if (roll < 0) { action = name; break; } }
    }

    // Если выбранное действие сейчас недоступно, используем осмысленную замену.
    if (action === 'SUMMON' && !canSummon) action = 'AOE';
    if (action === 'DESTROY_SUMMON' && (!(state.summons || []).length || bossActionNo - Number(state.lastDestroyRound || -99) < 2)) action = 'SPECIAL';
    if (action === 'GROUP_CURSE' && !canGroupCurse) action = 'SKILL_CURSE';

    if (action === 'ATTACK') {
      if (Math.random() * 100 < effectiveBossMiss) text = `💨 ${boss.name} промахивается.`;
      else {
        let damage = Math.round(rand(boss.damage[0], boss.damage[1]) * bossDamageMultiplier);
        const crit = Math.random() * 100 < BOSS_CRIT_CHANCE;
        if (crit) damage = Math.round(damage * BOSS_CRIT_MULTIPLIER);
        const r = damageTarget(id, target, damage, attackDamageType);
        text = `👹 ${boss.name} атакует <@${target.user_id}>: **${r.hpDamage} HP** (${damageTypeLabel(attackDamageType)})${r.absorbed ? `, щит поглотил ${r.absorbed}` : ''}${crit ? ' • 💥 КРИТ!' : ''}.`;
      }
    } else if (action === 'AOE') {
      let total = 0;
      const aoeType = pickDamageType(boss.attackTypes, attackDamageType);
      for (const p of players) {
        const r = damageTarget(id, p, Math.round(rand(Math.round(boss.damage[0] * 0.42), Math.round(boss.damage[1] * 0.55)) * bossDamageMultiplier), aoeType);
        total += r.hpDamage;
      }
      const summonDamage = damagePlayerSummons(state, 0.65);
      let healDebuffText = '';
      if (phase === 3) {
        for (const p of battlePlayers(id).filter(x => x.status === 'alive')) { const pe = effects(p); pe.healingPenaltyTurns = Math.max(Number(pe.healingPenaltyTurns || 0), 2); pe.healingPenalty = 0.30; updateEffects(id, p.user_id, pe); }
        healDebuffText = ' • 🩸 лечение группы снижено на 30% на 2 хода';
      }
      text = `💥 ${boss.name} применяет массовую атаку (${damageTypeLabel(aoeType)} урон): группе нанесено **${total} HP**${summonDamage ? `, призывам — ${summonDamage}` : ''}${healDebuffText}.`;
    } else if (action === 'SPECIAL') {
      let damage = Math.round(Number(boss.specialDamage || Math.round(boss.damage[1] * 1.35)) * bossDamageMultiplier);
      const crit = Math.random() * 100 < BOSS_CRIT_CHANCE;
      if (crit) damage = Math.round(damage * BOSS_CRIT_MULTIPLIER);
      const specialType = pickDamageType(boss.attackTypes, attackDamageType);
      const r = damageTarget(id, target, damage, specialType);
      text = `⚡ ${boss.name} применяет особую атаку против <@${target.user_id}>: **${r.hpDamage} HP** (${damageTypeLabel(specialType)})${crit ? ' • 💥 КРИТ!' : ''}.`;
    } else if (action === 'SKILL_CURSE') {
      text = applyBossCurse(id, state, players, 'skill', 2) || `👹 ${boss.name} готовит новую атаку.`;
      state.lastCurseRound = bossActionNo;
    } else if (action === 'ULT_CURSE') {
      const candidates = players.filter(p => ultResourceValue(p) >= 70);
      text = applyBossCurse(id, state, candidates.length ? candidates : players, 'ult', 2) || `👹 ${boss.name} готовит новую атаку.`;
      state.lastCurseRound = bossActionNo;
    } else if (action === 'GROUP_CURSE') {
      for (const p of players) {
        const e = effects(p);
        e.skillSilencedTurns = Math.max(Number(e.skillSilencedTurns || 0), 1);
        updateEffects(id, p.user_id, e);
      }
      state.lastGroupCurseRound = bossActionNo;
      state.lastCurseRound = bossActionNo;
      text = `🌑 **Великое молчание!** Вся группа лишена способностей на 1 ход.`;
    } else if (action === 'DESTROY_SUMMON') {
      text = destroyRandomSummon(state) || `👹 ${boss.name} не смог разрушить призыв.`;
      state.lastDestroyRound = bossActionNo;
    } else if (action === 'SUMMON') {
      const summonText = summon() || `👹 ${boss.name} не смог призвать миньона.`;
      const handTarget = chooseSingleTarget();
      let handText = '';
      if (handTarget && Math.random() * 100 >= effectiveBossMiss) {
        const handType = pickDamageType(boss.attackTypes, attackDamageType);
        const r = damageTarget(id, handTarget, Math.round(rand(Math.round(boss.damage[0] * 0.55), Math.round(boss.damage[1] * 0.70)) * bossDamageMultiplier), handType);
        handText = ` Затем босс бьёт <@${handTarget.user_id}> с руки на **${r.hpDamage} HP** (${damageTypeLabel(handType)}).`;
      } else handText = ' Затем босс атакует с руки, но промахивается.';
      text = summonText + handText;
    }
  }

  recordAction(action || 'UNKNOWN');
  if (empoweredBossAttack) text = `🔴 **УСИЛЕННАЯ 4-Я АТАКА БОССА (+30% урона)!**\n${text}`;
  if (scheduledSpecial && action === 'SPECIAL') text = `⚠️ **12 ходов игроков — особая способность босса!**\n${text}`;
  state.log.push(text);

  for (const m of state.minions) {
    if (m.isChaosRift || Number(m.damage?.[1] || 0) <= 0) continue;
    const aliveNow = battlePlayers(id).filter(x => x.status === 'alive');
    if (!aliveNow.length) break;
    const liveTanks = aliveNow.filter(x => CLASSES[x.class_key]?.role === 'tank');
    const latestTank = aliveNow.find(x => x.user_id === String(state.latestTankAggroUserId || '') && CLASSES[x.class_key]?.role === 'tank'); const others=liveTanks.filter(x=>!latestTank||x.user_id!==latestTank.user_id); const nonTanks=aliveNow.filter(x=>CLASSES[x.class_key]?.role!=='tank'); const roll=Math.random(); const t = latestTank&&roll<0.55?latestTank:others.length&&roll<0.75?pick(others):nonTanks.length?pick(nonTanks):pick(aliveNow);
    if (Math.random() * 100 >= m.miss) {
      const minionType = m.damageType || 'physical';
      const r = damageTarget(id, t, rand(...m.damage), minionType);
      state.log.push(`👾 ${m.name} → <@${t.user_id}>: **${r.hpDamage} HP** (${damageTypeLabel(minionType)}).`);
    } else state.log.push(`💨 ${m.name} промахивается.`);
  }

  if ((state.summons || []).length && Math.random() < 0.65) {
    const summonDamage = damagePlayerSummons(state, 0.9);
    if (summonDamage) state.log.push(`🎯 Босс и его миньоны дополнительно атакуют призывы игроков: **${summonDamage} урона**.`);
  }

  if(Number(state.latestTankAggroRounds||0)>0){state.latestTankAggroRounds--;if(state.latestTankAggroRounds<=0)state.latestTankAggroUserId=null;} state.log = state.log.slice(-12);
  saveState(b, state);
  for (const p of battlePlayers(id)) {
    const e = effects(p);
    for (const k of ['guardRounds','guardianUltRounds','tauntRounds','interceptRounds','groupDamageRounds','partyGuardRounds','healingPenaltyTurns','bossControlImmunityTurns','combatDamageTurns','combatResistanceTurns']) if (e[k] > 0) e[k]--;
    updateEffects(id, p.user_id, e);
  }
}

function mvpPack() { const r = Math.random() * 100; if (r < 40) return 'base'; if (r < 60) return 'premium'; if (r < 75) return 'elite'; return 'boss'; }
function specialistPack() { const r = Math.random() * 100; if (r < 70) return 'base'; if (r < 90) return 'premium'; if (r < 98) return 'elite'; return 'boss'; }
async function finish(id, win) {
  clearTimer(id); let b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); if (!b || !['active','registration','class_roll','class_select','initiative_roll'].includes(b.status)) return;
  const ps = battlePlayers(id); db.prepare('UPDATE world_boss_battles SET status=?,ended_at=?,turn_deadline=NULL WHERE id=?').run(win ? 'won' : 'lost', Date.now(), id);
  let lines = [], finalStats = null;
  if (win && ps.length) {
    const boss = BOSSES.find(x => x.cardId === b.boss_card_id) || BOSSES[0];
    const difficulty = clamp((boss.baseHp - 1100) / 1000, 0, 1);
    const pool = clamp(Math.round(400 + difficulty * 350 + Math.max(0, ps.length - 4) * 30), 400, 1000);
    const each = Math.floor(pool / ps.length), remainder = pool - each * ps.length;
    const dustRewards = [];

    const distributeDust = db.transaction(() => {
      ps.forEach((p, i) => {
        const reward = each + (i < remainder ? 1 : 0);

        // У части участников могла отсутствовать строка в players.
        // Обычный UPDATE тогда менял 0 строк, и Dust фактически не начислялся.
        const existing = db.prepare('SELECT user_id FROM players WHERE user_id=?').get(p.user_id);
        if (!existing) {
          db.prepare(`
            INSERT INTO players (user_id, username, card_dust)
            VALUES (?, ?, 0)
          `).run(
            p.user_id,
            p.hero_name || `Игрок ${String(p.user_id).slice(-4)}`
          );
        }

        const before = Number(db.prepare('SELECT card_dust FROM players WHERE user_id=?').get(p.user_id)?.card_dust || 0);
        const after = Number(addCardDust(p.user_id, reward) || 0);

        if (after < before + reward) {
          throw new Error(`Dust reward verification failed for ${p.user_id}: before=${before}, reward=${reward}, after=${after}`);
        }

        dustRewards.push({
          user_id: p.user_id,
          amount: reward,
          balanceBefore: before,
          balanceAfter: after
        });
      });
    });

    distributeDust();
    const classXpLines=[];
    for (const p of ps) {
      const classKey=normalizeClassKey(p.class_key);
      const contribution=Math.max(0,Number(p.damage_done||0)+Number(p.healing_done||0)+Math.round(Number(p.damage_taken||0)*0.6));
      const classXp=Math.max(40,Math.min(350,Math.round(70+contribution/18)));
      const progress=grantClassXp(p.user_id,classKey,classXp,{completed:false});
      classXpLines.push(`<@${p.user_id}>: **+${classXp} XP класса** → Lv.${progress?.level||1}`);
    }
    const extraStats=battleExtraStats(id);
    const enriched=ps.map(p=>{const x=extraStats[p.user_id]||{};const tankScore=Math.round(Number(p.damage_taken||0)*0.30+Number(x.damage_prevented||0)+Number(x.aggro_hits||0)*25);const supportScore=Math.round(Number(x.support_points||0)+Number(x.rage_reduced||0)*5+Number(x.summon_healing||0)*1.1);const mvpScore=Math.round(Number(p.damage_done||0)+Number(p.healing_done||0)*1.2+tankScore+supportScore);return {...p,...x,tankScore,supportScore,mvpScore};});
    const ranked=[...enriched].sort((a,b)=>b.mvpScore-a.mvpScore);
    const mvp = ranked[0], pack = mvpPack();
    addPack(mvp.user_id, pack, 1);

    const damageTop = [...enriched].sort((a,b) => b.damage_done - a.damage_done);
    const healTop = [...enriched].sort((a,b) => b.healing_done - a.healing_done);
    const tankTop = [...enriched].sort((a,b) => b.tankScore - a.tankScore);
    const supportTop = [...enriched].sort((a,b) => b.supportScore - a.supportScore);
    const summonTop = [...enriched].sort((a,b) => (Number(b.summon_damage||0)+Number(b.summon_healing||0))-(Number(a.summon_damage||0)+Number(a.summon_healing||0)));
    const categoryAwards = [];

    const awardCategory = (type, player, value) => {
      if (!player || Number(value || 0) <= 0) return;
      const rewardPack = specialistPack();
      addPack(player.user_id, rewardPack, 1);
      categoryAwards.push({ type, user_id: player.user_id, value: Number(value || 0), pack: rewardPack });
    };

    awardCategory('damage', damageTop[0], damageTop[0]?.damage_done);
    awardCategory('healing', healTop[0], healTop[0]?.healing_done);
    awardCategory('tank', tankTop[0], tankTop[0]?.tankScore);
    awardCategory('support', supportTop[0], supportTop[0]?.supportScore);
    awardCategory('summon', summonTop[0], Number(summonTop[0]?.summon_damage||0)+Number(summonTop[0]?.summon_healing||0));

    const finalState = stateOf(b);
    const summonStats = finalState.summonStats || {};
    const summonDetails = summonDetailsForFinal(finalState);
    finalStats = {
      pool, each, remainder,
      mvpId: mvp.user_id,
      mvpScore: Math.round(mvp.mvpScore),
      pack,
      damageTop: damageTop.slice(0,10),
      healTop: healTop.slice(0,10),
      tankTop: tankTop.slice(0,10),
      supportTop: supportTop.slice(0,10),
      summonTop: summonTop.slice(0,10),
      playerStats: enriched,
      summonStats,
      summonDetails,
      categoryAwards,
      dustRewards
    };

    const categoryLines = categoryAwards.map(a => {
      const label = a.type === 'damage' ? '⚔️ Разрушитель' : a.type === 'healing' ? '💚 Спаситель' : a.type === 'tank' ? '🛡️ Непоколебимый' : a.type === 'support' ? '✨ Опора команды' : '👹 Лучший призыватель';
      return `${label}: <@${a.user_id}> — **${a.value}** • 🎁 **${a.pack.toUpperCase()} Pack**`;
    });

    lines = [
      `🏆 Победа! Общая награда: **${pool} GS Dust** — поделена между всей группой.`,
      `💠 Каждый участник получил **${each}–${each + (remainder > 0 ? 1 : 0)} GS Dust**.`,
      `⭐ Общий MVP: <@${mvp.user_id}> • рейтинг вклада **${Math.round(mvp.mvpScore)}**.`,
      `📊 MVP учитывает урон, эффективное лечение, предотвращённый урон, щиты, агро, баффы, дебаффы, контроль, призывы и снятую ярость босса.`,
      `🎁 Общий MVP получает **${pack.toUpperCase()} Pack**.`,
      ...categoryLines,
      `📚 **Опыт классов:**\n${classXpLines.join('\n')}`
    ];
  } else {
    const classXpLines=[];
    for (const p of ps) {
      const classKey=normalizeClassKey(p.class_key), classXp=35;
      const progress=grantClassXp(p.user_id,classKey,classXp,{completed:false});
      classXpLines.push(`<@${p.user_id}>: **+${classXp} XP класса** → Lv.${progress?.level||1}`);
      try { db.prepare("UPDATE heroes SET status='wounded',hp=MAX(1,ROUND(max_hp*0.35)),recovery_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(p.user_id); } catch (_) {}
    }
    const damageTop=[...ps].sort((a,b)=>b.damage_done-a.damage_done), healTop=[...ps].sort((a,b)=>b.healing_done-a.healing_done), tankTop=[...ps].sort((a,b)=>b.damage_taken-a.damage_taken);
    const finalState=stateOf(b), summonStats=finalState.summonStats||{}, summonDetails=summonDetailsForFinal(finalState);
    finalStats={win:false,damageTop:damageTop.slice(0,10),healTop:healTop.slice(0,10),tankTop:tankTop.slice(0,10),summonStats,summonDetails,categoryAwards:[],dustRewards:[]};
    lines=['💀 Группа потерпела поражение.','🏥 Все участвовавшие герои ранены. Перед следующей экспедицией или World Boss их обязательно нужно вылечить в Лечебнице.', `📚 **Опыт за участие:**\n${classXpLines.join('\n')}`]
  }
  b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); const st = stateOf(b); st.finalStats = finalStats;
  const deaths = st.deathStats || { players: ps.filter(p => p.status === 'dead').length, bossMinions: 0, playerSummons: 0 };
  const summary = [`⚔️ **Потери боя:** игроков — **${deaths.players || 0}**, миньонов босса — **${deaths.bossMinions || 0}**, призывов игроков — **${deaths.playerSummons || 0}**.`];
  const banner = win ? [`🏆 **${String(b.boss_name || 'МИРОВОЙ БОСС').toUpperCase()} ПОВЕРЖЕН!**`] : [`💀 **Отряд пал. ${b.boss_name} одерживает победу.**`];
  st.log = [...banner, ...lines, ...summary, ...(st.log || [])].slice(-20); saveState(b, st); await refresh(id);
  const guildId = clientRef?.channels?.cache?.get(String(b.channel_id))?.guildId;
  if (guildId) await checkAchievementsForUsers(clientRef, guildId, ps.map(p => p.user_id));
  scheduleRegular();
}

function scheduleRegular() { setTimeout(() => { try { require('../../systems/quickEventSystem').postQuickEvent(clientRef).catch(console.error); } catch (e) { console.error(e); } }, 5000).unref?.(); }


const COMBAT_BAG = Object.freeze({
  food: {
    travel_stew:{icon:'🍲',name:'Походное рагу',text:'восстанавливает 35 HP'},
    hunters_meal:{icon:'🍖',name:'Ужин охотника',text:'+15% урона на 2 хода'},
    guild_feast:{icon:'🥧',name:'Гильдейский пирог',text:'+20% Max HP, +10% урона, -10% входящего урона и +10% лечения до конца боя'},
  },
  potion: {
    healing_potion_small:{icon:'❤️',name:'Малое зелье лечения',text:'восстанавливает 30 HP'},
    healing_potion_large:{icon:'💖',name:'Большое зелье лечения',text:'восстанавливает 75 HP'},
    healing_potion_supreme:{icon:'🌟',name:'Зелье полного восстановления',text:'восстанавливает 140 HP'},
    war_elixir:{icon:'⚔️',name:'Эликсир боевого транса',text:'+20% урона на 3 хода'},
    stone_skin_elixir:{icon:'🪨',name:'Эликсир каменной кожи',text:'-20% входящего урона на 3 хода'},
  },
  scroll: {
    rage_scroll:{icon:'🔥',name:'Свиток ярости',text:'+20% урона на 3 хода'},
    defense_scroll:{icon:'🛡️',name:'Свиток защиты',text:'-20% входящего урона на 3 хода'},
    fire_scroll:{icon:'🔥',name:'Свиток Огня',text:'90 магического урона'},
    ice_scroll:{icon:'❄️',name:'Свиток Льда',text:'55 урона и -20 ярости босса'},
    lightning_scroll:{icon:'⚡',name:'Свиток Молнии',text:'130 магического урона'},
    barrier_scroll:{icon:'🛡️',name:'Свиток Барьера',text:'щит 70 HP'},
    blessing_scroll:{icon:'✨',name:'Свиток Благословения',text:'+15% урона и -10% входящего урона на 3 хода'},
    weakening_scroll:{icon:'☠️',name:'Свиток Ослабления',text:'следующая атака босса -20% урона'},
    cleanse_scroll:{icon:'🌀',name:'Свиток Очищения',text:'снимает проклятия и блокировки'},
  },
});
function combatBagCategory(itemKey){for(const [category,items] of Object.entries(COMBAT_BAG))if(items[itemKey])return category;return null;}
function consumeHeroInventoryItem(userId,itemKey){
  const tx=db.transaction(()=>{const row=db.prepare('SELECT id,quantity FROM hero_inventory WHERE user_id=? AND item_key=?').get(String(userId),itemKey);if(!row||Number(row.quantity)<1)throw new Error('missing');if(Number(row.quantity)===1)db.prepare('DELETE FROM hero_inventory WHERE id=?').run(row.id);else db.prepare('UPDATE hero_inventory SET quantity=quantity-1 WHERE id=?').run(row.id);});
  try{tx();return true;}catch(_){return false;}
}
function bagMenu(id,userId,category){
  const owned=getInventory(userId,{type:'consumable',limit:100}).filter(x=>combatBagCategory(x.item_key)===category&&Number(x.quantity)>0);
  if(!owned.length)return null;
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`wb_baguse_${category}_${id}`).setPlaceholder(category==='food'?'Выберите еду':category==='potion'?'Выберите зелье':'Выберите боевой свиток').addOptions(owned.slice(0,25).map(x=>{const m=COMBAT_BAG[category][x.item_key];return {label:`${m.name} ×${x.quantity}`,value:x.item_key,emoji:m.icon,description:m.text.slice(0,100)};})));
}
function battleTurnToken(b){return `${b.round_no}:${b.turn_index}`;}
function activeConsumableText(e){const rows=[];if(e.guildFeastActive)rows.push('🥧 Гильдейский пирог — до конца боя');if(e.combatDamageTurns>0)rows.push(`⚔️ Усиление урона — ${e.combatDamageTurns} ход.`);if(e.combatResistanceTurns>0)rows.push(`🛡️ Снижение урона — ${e.combatResistanceTurns} ход.`);if(e.shield>0)rows.push(`🛡️ Щит — ${e.shield} HP`);return rows.length?rows.join('\n'):'Нет активных эффектов от расходников.';}
function useCombatBagItem(b,p,itemKey,category){
  const meta=COMBAT_BAG[category]?.[itemKey];if(!meta)return {ok:false,reason:'invalid'};
  const e=effects(p), token=battleTurnToken(b);
  // Еда имеет собственный лимит. Зелья и свитки делят одно дополнительное
  // действие: за ход разрешено либо одно зелье, либо один свиток.
  const limitKey = category === 'food' ? 'bag_food_token' : 'bag_combat_item_token';
  if(e[limitKey]===token)return {ok:false,reason:category === 'food' ? 'food_limit' : 'combat_item_limit'};
  if(!consumeHeroInventoryItem(p.user_id,itemKey))return {ok:false,reason:'missing'};
  const st=stateOf(b);let text='';
  if(itemKey==='travel_stew'){const heal=Math.min(35,p.max_hp-p.hp);db.prepare('UPDATE world_boss_players SET hp=MIN(max_hp,hp+35),healing_done=healing_done+? WHERE battle_id=? AND user_id=?').run(heal,b.id,p.user_id);text=`восстанавливает **${heal} HP**`;}
  else if(itemKey==='hunters_meal'){e.combatDamage=Math.max(Number(e.combatDamage||0),.15);e.combatDamageTurns=Math.max(Number(e.combatDamageTurns||0),2);text='даёт **+15% урона на 2 хода**';}
  else if(itemKey==='guild_feast'){if(!e.guildFeastActive){const bonus=Math.max(1,Math.round(p.max_hp*.20));db.prepare('UPDATE world_boss_players SET max_hp=max_hp+?,hp=hp+? WHERE battle_id=? AND user_id=?').run(bonus,bonus,b.id,p.user_id);e.guildFeastActive=true;e.healingBonus=Math.max(Number(e.healingBonus||0),.10);}text='даёт **+20% Max HP, +10% урона, -10% входящего урона и +10% лечения до конца боя**';}
  else if(['healing_potion_small','healing_potion_large','healing_potion_supreme'].includes(itemKey)){const amount={healing_potion_small:30,healing_potion_large:75,healing_potion_supreme:140}[itemKey],heal=Math.min(amount,p.max_hp-p.hp);db.prepare('UPDATE world_boss_players SET hp=MIN(max_hp,hp+?),healing_done=healing_done+? WHERE battle_id=? AND user_id=?').run(amount,heal,b.id,p.user_id);text=`восстанавливает **${heal} HP**`;}
  else if(itemKey==='war_elixir'||itemKey==='rage_scroll'){e.combatDamage=Math.max(Number(e.combatDamage||0),.20);e.combatDamageTurns=Math.max(Number(e.combatDamageTurns||0),3);text='даёт **+20% урона на 3 хода**';}
  else if(itemKey==='stone_skin_elixir'||itemKey==='defense_scroll'){e.combatResistance=Math.max(Number(e.combatResistance||0),.20);e.combatResistanceTurns=Math.max(Number(e.combatResistanceTurns||0),3);text='даёт **-20% входящего урона на 3 хода**';}
  else if(itemKey==='fire_scroll'||itemKey==='ice_scroll'||itemKey==='lightning_scroll'){const amount={fire_scroll:90,ice_scroll:55,lightning_scroll:130}[itemKey];const r=hurtEnemy(b,st,amount,'magic',p.class_key);db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,b.id,p.user_id);if(itemKey==='ice_scroll')st.rage=Math.max(0,Number(st.rage||0)-20);saveState(b,st);text=`наносит **${r.dealt} магического урона**${itemKey==='ice_scroll'?' и снижает ярость босса на **20**':''}`;}
  else if(itemKey==='barrier_scroll'){e.shield=Number(e.shield||0)+70;text='создаёт **щит 70 HP**';}
  else if(itemKey==='blessing_scroll'){e.combatDamage=Math.max(Number(e.combatDamage||0),.15);e.combatDamageTurns=Math.max(Number(e.combatDamageTurns||0),3);e.combatResistance=Math.max(Number(e.combatResistance||0),.10);e.combatResistanceTurns=Math.max(Number(e.combatResistanceTurns||0),3);text='даёт **+15% урона и -10% входящего урона на 3 хода**';}
  else if(itemKey==='weakening_scroll'){st.bossWeaken=Math.max(Number(st.bossWeaken||0),.20);st.bossWeakenRounds=Math.max(Number(st.bossWeakenRounds||0),1);saveState(b,st);text='ослабляет следующую атаку босса на **20%**';}
  else if(itemKey==='cleanse_scroll'){for(const k of ['skillSilencedTurns','ultSilencedTurns','damageCurseTurns','decayCurseTurns','healingPenaltyTurns'])delete e[k];text='снимает **боевые проклятия и блокировки**';}
  e[limitKey]=token;updateEffects(b.id,p.user_id,e);addLog(b,`${meta.icon} <@${p.user_id}> использует **${meta.name}**: ${text}.`);return {ok:true,text:`${meta.icon} **${meta.name}** ${text}.\n\nОсновное действие хода по-прежнему доступно.`};
}

async function handle(interaction) {
  if ((!interaction.isButton() && !interaction.isStringSelectMenu()) || !interaction.customId.startsWith('wb_')) return false;
  init(); const idMatch = interaction.customId.match(/_(\d+)$/), id = idMatch ? Number(idMatch[1]) : 0, b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
  if (!b) { await interaction.reply({ content: 'Событие не найдено.', flags: MessageFlags.Ephemeral }); return true; }
  const uid = interaction.user.id;
  if (interaction.customId === `wb_force_start_${id}`) {
    const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) || interaction.guild?.ownerId === uid;
    if (!isAdmin) { await interaction.reply({ content: 'Только администратор может начать бой досрочно.', flags: MessageFlags.Ephemeral }); return true; }
    if (b.status !== 'registration') { await interaction.reply({ content: 'Сбор уже завершён.', flags: MessageFlags.Ephemeral }); return true; }
    if (battlePlayers(id).length < 4) { await interaction.reply({ content: 'Нужно минимум 4 участника.', flags: MessageFlags.Ephemeral }); return true; }
    clearTimer(id); await interaction.reply({ content: '▶️ Администратор принудительно начал бой.', flags: MessageFlags.Ephemeral }); await beginBattle(id); return true;
  }
  if (interaction.customId === `wb_join_${id}` || interaction.customId === `wb_leave_${id}`) {
    if (b.status !== 'registration') { await interaction.reply({ content: 'Регистрация уже завершена.', flags: MessageFlags.Ephemeral }); return true; }
    if (interaction.customId.includes('join')) {
      try {
        const expedition = db.prepare("SELECT returns_at FROM hero_expeditions WHERE user_id=? AND status='active' AND datetime(returns_at) > datetime('now') ORDER BY id DESC LIMIT 1").get(uid);
        if (expedition) {
          await interaction.reply({ content: `❌ Твой герой сейчас в экспедиции и вернётся <t:${Math.floor(new Date(expedition.returns_at).getTime()/1000)}:R>. Пока он в походе, участвовать в World Boss нельзя.`, flags: MessageFlags.Ephemeral });
          return true;
        }
      } catch (_) {}
      const snapshot = buildHeroSnapshot(uid);
      if (!snapshot) {
        await interaction.reply({ content: '❌ Сначала создай героя в системе экспедиций через `/hero create`. В World Boss участвует именно твой постоянный персонаж.', flags: MessageFlags.Ephemeral });
        return true;
      }
      getOrCreatePlayer(interaction.user);
      db.prepare(`INSERT INTO world_boss_players(battle_id,user_id,hero_name,hero_level,hero_snapshot_json,joined_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(battle_id,user_id) DO UPDATE SET hero_name=excluded.hero_name,hero_level=excluded.hero_level,hero_snapshot_json=excluded.hero_snapshot_json`).run(id, uid, snapshot.name, snapshot.level, JSON.stringify(snapshot), Date.now());
      const companionText = snapshot.companion ? `\n🐾 Компаньон: **${snapshot.companion.name}**` : '';
      await interaction.reply({ content: `✅ **${snapshot.name}** вступает в бой!\nУровень: **${snapshot.level}**${companionText}\n\nКласс для этого рейда по-прежнему определяется броском d20 и выбором по очереди.`, flags: MessageFlags.Ephemeral });
    }
    else { db.prepare('DELETE FROM world_boss_players WHERE battle_id=? AND user_id=?').run(id, uid); await interaction.reply({ content: '🚪 Ты покинул регистрацию.', flags: MessageFlags.Ephemeral }); }
    await refresh(id); return true;
  }
  const p = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id, uid); if (!p) { await interaction.reply({ content: 'Ты не участвуешь в этом бою.', flags: MessageFlags.Ephemeral }); return true; }
  if (interaction.customId === `wb_classroll_${id}`) {
    if (b.status !== 'class_roll') return interaction.reply({ content: 'Сейчас не этап этого броска.', flags: MessageFlags.Ephemeral }); const s = stateOf(b); if (s.classRolls?.[uid] != null) return interaction.reply({ content: `Ты уже выбросил **${s.classRolls[uid]}**.`, flags: MessageFlags.Ephemeral }); s.classRolls[uid] = rand(1, 20); s.log.push(`🎲 **${heroName(p)}** · <@${uid}> выбрасывает **${s.classRolls[uid]}** за выбор класса.`); saveState(b, s); await interaction.reply({ content: `🎲 Твой результат: **${s.classRolls[uid]}**`, flags: MessageFlags.Ephemeral }); await refresh(id); if (allHave(s.classRolls, battlePlayers(id))) await finishClassRoll(id); return true;
  }
  if (interaction.customId === `wb_choose_${id}`) {
    const s = stateOf(b); if (b.status !== 'class_select' || s.classOrder?.[s.classChoiceIndex] !== uid) return interaction.reply({ content: 'Сейчас класс выбирает другой игрок.', flags: MessageFlags.Ephemeral });
    const slots = allowedClassSlots(id, s).slice(0, 25);
    const totals = slots.reduce((m, slot) => (m[slot.key] = (m[slot.key] || 0) + 1, m), {}); const seen = {};
    const options = slots.map(({ key: k, index }) => {
      seen[k] = (seen[k] || 0) + 1;
      const suffix = totals[k] > 1 ? ` #${seen[k]}` : '';
      return {
        label: `${CLASSES[k].name}${suffix}`,
        value: `${index}:${k}`,
        description: (() => { const preview = selectedClassBonuses({...p,class_key:k}); return `${roleIcon(CLASSES[k].role)} Lv.${preview.level} • экип. ⚔️+${preview.equipment.damagePercent}% ❤️+${preview.equipment.hpPercent}%`; })(),
      };
    });
    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`wb_classpick_${id}`).setPlaceholder('Выберите класс').addOptions(options),
    );
    return interaction.reply({ content: `Выбери класс.\n${roleRequirementText(id, s)}${slots.length < (s.availableClasses || []).length ? '\n⚠️ Сейчас доступны только роли, необходимые для состава группы.' : ''}`, components: [menu], flags: MessageFlags.Ephemeral });
  }
  if (interaction.isStringSelectMenu() && interaction.customId === `wb_classpick_${id}`) { const token = interaction.values[0]; const classKey = token.includes(':') ? token.slice(token.indexOf(':') + 1) : token; const r = await assignChosenClass(id, uid, token); if (!r.ok) return interaction.reply({ content: r.reason === 'role_required' ? '⚠️ Сейчас ты обязан выбрать недостающую роль: танка или хилера.' : 'Этот класс уже недоступен или сейчас не твоя очередь.', flags: MessageFlags.Ephemeral }); const chosen = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id, uid); const bonus = selectedClassBonuses(chosen); return interaction.reply({ content: `✅ Выбран класс **${CLASSES[classKey]?.name || classKey}** — Lv.${bonus.level}.\n📚 ${bonus.mastery.title}: ⚔️ +${bonus.mastery.damagePercent}% • ❤️ +${bonus.mastery.hpPercent}% • 🛡️ +${bonus.mastery.resistancePercent}%\n🎒 Экипировка: ⚔️ +${bonus.equipment.damagePercent}% • ❤️ +${bonus.equipment.hpPercent}% • 🛡️ +${bonus.equipment.resistancePercent}%`, flags: MessageFlags.Ephemeral }); }
  if (interaction.customId === `wb_initroll_${id}`) {
    if (b.status !== 'initiative_roll') return interaction.reply({ content: 'Сейчас не этап инициативы.', flags: MessageFlags.Ephemeral }); const s = stateOf(b); if (s.initiativeRolls?.[uid] != null) return interaction.reply({ content: `Ты уже выбросил **${s.initiativeRolls[uid]}**.`, flags: MessageFlags.Ephemeral }); let roll = rand(1,20); s.initiativeRolls[uid] = roll; s.log.push(`⚔️ **${heroName(p)}** · <@${uid}> выбрасывает инициативу **${roll}**.`); saveState(b,s); await interaction.reply({ content:`🎲 Инициатива: **${roll}**`, flags:MessageFlags.Ephemeral }); await refresh(id); if(allHave(s.initiativeRolls,battlePlayers(id))) await startCombat(id); return true;
  }
  if (interaction.customId === `wb_status_${id}`) {
    const c = CLASSES[p.class_key], e = effects(p), file = cardFile(c.cardId, 'class');
    const content = `⚔️ ${heroSummary(p)}\n${roleIcon(c.role)} **${c.name}**
❤️ ${p.hp}/${p.max_hp}${e.shield ? ` • ${shieldBreakdown(p,e)}` : ''}
${resourceMeta(p.class_key).icon} ${resourceMeta(p.class_key).label}: ${skillResourceValue(p)}/100
💥 Заряд ульты: ${p.ult_charge || 0}/100
🗡️ Урон ${c.damage[0]}–${c.damage[1]} • тип: ${c.damageType === 'magic' ? 'магический' : c.damageType === 'holy' ? 'святой' : 'физический'} • промах ${c.miss}% • крит ${CRIT_CHANCE}% ×${CRIT_MULTIPLIER}
🛡️ Защита: физ. ${Number(c.physicalResist || 0) >= 0 ? '+' : ''}${c.physicalResist || 0}% • маг. ${Number(c.magicResist || 0) >= 0 ? '+' : ''}${c.magicResist || 0}%

✨ **${c.skill.name}** — ${c.skill.cost} ${resourceMeta(p.class_key).label.toLowerCase()} • КД ${e.skillCd || 0}
🌟 **${c.secondSkill?.name || 'Дополнительная способность'}** — ${SECOND_SKILL_COST} ${resourceMeta(p.class_key).label.toLowerCase()} • КД ${e.skill2Cd || 0}
✨ **Индикатор ульты:** ${ultResourceValue(p) >= 100 ? '🟣 ГОТОВА — 100/100' : `${ultResourceValue(p)}/100`}
${p.class_key === 'cleric' ? `✨ Пассивно: каждый успешный удар лечит Клирика на 20 HP.
` : ''}💥 **${c.ultimate.name}** — ${resourceType(p.class_key) === 'mana' ? '100 заряда ульты' : `${c.ultimate.cost} ${resourceMeta(p.class_key).label.toLowerCase()}`} • КД ${e.ultCd || 0}${e.skillSilencedTurns ? `
🔒 Способность заблокирована: ${e.skillSilencedTurns}` : ''}${e.ultSilencedTurns ? `
⛓️ Ульта заблокирована: ${e.ultSilencedTurns}` : ''}

📊 Нанесено: ${p.damage_done} • Вылечено: ${p.healing_done}`;
    const payload = { content, flags: MessageFlags.Ephemeral };
    if (require('fs').existsSync(file)) payload.files = [new AttachmentBuilder(file, { name: `class-${c.cardId}.jpg` })];
    return interaction.reply(payload);
  }
  if (interaction.customId === `wb_log_${id}`) {
    const lines = (stateOf(b).log || []).slice(-20);
    return interaction.reply({ content: `## 📖 Журнал боя
${lines.length ? lines.map((x, i) => `**${i + 1}.** ${x}`).join('\n\n') : 'Журнал пока пуст.'}`, flags: MessageFlags.Ephemeral });
  }
  if (interaction.customId === `wb_summons_${id}`) {
    const own = (stateOf(b).summons || []).filter(x => x.owner === uid);
    return interaction.reply({ content: own.length ? `## 🤖 Мои призывы
${own.map((x, i) => `**${x.icon || '▫️'} ${x.name}${own.length > 1 ? ` #${i + 1}` : ''}**
❤️ ${x.hp}/${x.maxHp} • ⏳ ${x.rounds} раунд(а)`).join('\n\n')}` : 'У тебя сейчас нет активных призывов.', flags: MessageFlags.Ephemeral });
  }
  if (interaction.customId === `wb_enemies_${id}`) {
    const st = stateOf(b), boss = BOSSES.find(x => x.cardId === b.boss_card_id), file = cardFile(b.boss_card_id, 'boss'), files = [];
    if (require('fs').existsSync(file)) files.push(new AttachmentBuilder(file, { name: `boss-${b.boss_card_id}.jpg` }));
    const enemyText = (st.minions || []).length ? st.minions.map(m => `${m.provoking ? '🛑' : '👾'} **${m.name}** — ❤️ ${m.hp}/${m.maxHp}${m.provoking ? ' • провоцирует' : ''}`).join('\n') : 'Миньоны босса пока не призваны.';
    return interaction.reply({ content: `## 👹 ${b.boss_name}
❤️ ${b.boss_hp}/${b.boss_max_hp}
🔥 Ярость ${Number(st.rage || 0)}/100

${enemyText}

Может призывать: ${(boss?.minions || []).map(mid => MINIONS[mid]?.name).filter(Boolean).join(', ') || '—'}`, files, flags: MessageFlags.Ephemeral });
  }
  if (interaction.customId === `wb_bag_${id}`) {
    if (b.status !== 'active') return interaction.reply({content:'🎒 Боевая сумка доступна только во время боя.',flags:MessageFlags.Ephemeral});
    const current=currentPlayer(b).p;if(!current||current.user_id!==uid)return interaction.reply({content:'⏳ Использовать боевые расходники можно только во время своего хода.',flags:MessageFlags.Ephemeral});
    const rows=[];for(const cat of ['food','potion','scroll']){const menu=bagMenu(id,uid,cat);if(menu)rows.push(menu);}
    const ef=effects(p);return interaction.reply({content:`## 🎒 Боевая сумка\nЗа ход: **1 еда** и **либо 1 зелье, либо 1 свиток**. Расходники не тратят атаку, способность или ульту.\n\n### Активные эффекты\n${activeConsumableText(ef)}${rows.length?'':'\n\nПодходящих расходников в инвентаре нет.'}`,components:rows,flags:MessageFlags.Ephemeral});
  }
  const bagUse=interaction.customId.match(/^wb_baguse_(food|potion|scroll)_\d+$/);
  if(interaction.isStringSelectMenu()&&bagUse){
    const freshBattle=db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id);const freshPlayer=db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id,uid);if(!freshBattle||!freshPlayer)return interaction.reply({content:'Бой уже завершён.',flags:MessageFlags.Ephemeral});
    const current=currentPlayer(freshBattle).p;if(!current||current.user_id!==uid)return interaction.reply({content:'⏳ Сейчас не твой ход.',flags:MessageFlags.Ephemeral});
    const r=useCombatBagItem(freshBattle,freshPlayer,interaction.values[0],bagUse[1]);if(!r.ok)return interaction.reply({content:r.reason==='food_limit'?'🚫 В этот ход уже была использована еда.':r.reason==='combat_item_limit'?'🚫 В этот ход уже использовано зелье или свиток. Второй боевой расходник будет доступен на следующем ходу.':'❌ Предмет отсутствует или больше недоступен.',flags:MessageFlags.Ephemeral});await refresh(id);return interaction.reply({content:`✅ ${r.text}`,flags:MessageFlags.Ephemeral});
  }
  const enemyTargetSelect = interaction.customId.match(/^wb_enemy_target_(attack|skill2|skill|ult)_\d+$/);
  if (interaction.isStringSelectMenu() && enemyTargetSelect) {
    const r = await perform(id, uid, enemyTargetSelect[1], false, interaction.values[0]);
    return interaction.reply({ content: resultText(r), flags: MessageFlags.Ephemeral });
  }
  if(interaction.isStringSelectMenu()&&interaction.customId===`wb_druid_spirit_${id}`){const r=await perform(id,uid,'skill2',false,interaction.values[0]);return interaction.reply({content:resultText(r),flags:MessageFlags.Ephemeral});}
  const targetSelect = interaction.customId.match(/^wb_target_(skill|skill2|ult)_\d+$/); if (interaction.isStringSelectMenu() && targetSelect) { const r = await perform(id, uid, targetSelect[1], false, interaction.values[0]); return interaction.reply({ content: resultText(r), flags: MessageFlags.Ephemeral }); }
  const actMatch = interaction.customId.match(/^wb_(attack|skill2|skill|ult)_\d+$/); if (actMatch) {
    const action = actMatch[1], kind = targetKind(p.class_key, action);
    if(p.class_key==='druid'&&action==='skill2')return interaction.reply({content:'Выбери дух животного:',components:[druidSpiritMenu(id)],flags:MessageFlags.Ephemeral});
    if (kind) { const targets = actionTargets(id, p, action, kind); if (!targets.length) return interaction.reply({ content: kind === 'dead' ? 'Нет погибших союзников.' : 'Нет доступных целей.', flags: MessageFlags.Ephemeral }); return interaction.reply({ content: 'Выбери цель:', components: [targetMenu(id, action, targets)], flags: MessageFlags.Ephemeral }); }
    if (needsEnemyTarget(p.class_key, action)) {
      const st = stateOf(b), targets = enemyTargets(b, st);
      if (targets.length > 1) return interaction.reply({ content: targets.some(t => t.provoking) ? '🛑 Провоцирующий миньон заставляет атаковать его. Выбери цель:' : '🎯 Выбери, кого атаковать:', components: [enemyTargetMenu(id, action, targets)], flags: MessageFlags.Ephemeral });
      const r = await perform(id, uid, action, false, targets[0]?.token || null); return interaction.reply({ content: resultText(r), flags: MessageFlags.Ephemeral });
    }
    const r = await perform(id, uid, action); return interaction.reply({ content: resultText(r), flags: MessageFlags.Ephemeral });
  }
  return false;
}
function resultText(r) { if (r?.ok) return `✅ ${r.text}`; if (r?.reason === 'turn') return '⏳ Сейчас не твой ход.'; if (r?.reason === 'energy') return '⚡ Недостаточно энергии.'; if (r?.reason === 'rage') return '🔥 Недостаточно ярости.'; if (r?.reason === 'mana') return '🔷 Недостаточно маны.'; if (r?.reason === 'burst') return '💥 Ульта ещё не заряжена.'; if (r?.reason === 'cooldown') return `🔁 Действие на перезарядке: ещё ${r.cd} ход(а).`; if (r?.reason === 'silenced_skill') return `🔒 Босс запретил способности ещё на ${r.cd} ход(а).`; if (r?.reason === 'silenced_ult') return `⛓️ Босс запретил ульту ещё на ${r.cd} ход(а).`; return 'Событие уже завершено или действие недоступно.'; }
function nextSlotDelay() { const now = Date.now(); for (let d = 0; d < 2; d++) for (const h of SLOTS) { const base = new Date(now + d * 86400000), parts = moscowParts(base), utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), h - 3, 0, 0); if (utc > now + 1000) return utc - now; } return 6 * 3600000; }
function schedulerTick() { const p = moscowParts(), h = Number(p.hour), min = Number(p.minute), key = dateKey(); if (SLOTS.includes(h) && min < 2) { const done = db.prepare('SELECT 1 FROM world_boss_schedule WHERE date_key=? AND slot_hour=?').get(key, h); if (!done) { db.prepare('INSERT INTO world_boss_schedule(date_key,slot_hour,created_at) VALUES(?,?,?)').run(key, h, Date.now()); startRegistration(clientRef).then(r => { if (r.ok) db.prepare('UPDATE world_boss_schedule SET battle_id=? WHERE date_key=? AND slot_hour=?').run(r.id, key, h); }).catch(console.error); } } scheduler = setTimeout(schedulerTick, Math.min(nextSlotDelay(), 60000)); scheduler.unref?.(); }
function startScheduler(client) { init(); clientRef = client; if (scheduler) clearTimeout(scheduler); const a = activeBattle(); if (a) { if (a.status === 'registration') setTimer(a.id, () => beginBattle(a.id).catch(console.error), a.registration_ends_at - Date.now()); else if (a.status === 'class_select') armStageTimer(a.id); else if (a.status === 'active') armTurn(a.id); refresh(a.id).catch(() => {}); } if (AUTO_SCHEDULE_ENABLED) { schedulerTick(); console.log('[WorldBoss] Автозапуск включён: 13:00, 20:00 МСК'); } else console.log('[WorldBoss] Тестовый режим: автозапуск отключён, доступен только ручной запуск'); }

module.exports = { startScheduler, startRegistration, resetWorldBoss, handle, isActive: () => Boolean(activeBattle()), beginBattle };
