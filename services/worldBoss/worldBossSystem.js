'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, AttachmentBuilder,
  StringSelectMenuBuilder, PermissionsBitField,
} = require('discord.js');
const { db, getOrCreatePlayer, addCardDust } = require('../../database/db');
const { addPack } = require('../../utils/packInventory');
const { CLASSES, MINIONS, BOSSES } = require('./config');
const { createWorldBossBattleCard, cardFile } = require('../../images/worldBoss/createWorldBossBattleCard');

const CHANNEL_ID = process.env.WORLD_BOSS_CHANNEL_ID || '1529226831797158130';
const AUTO_SCHEDULE_ENABLED = String(process.env.WORLD_BOSS_AUTO_SCHEDULE || 'false').toLowerCase() === 'true';
const REGISTRATION_MS = 10 * 60 * 1000;
const ROLL_MS = 15 * 1000;
const CHOICE_MS = 60 * 1000;
const TURN_MS = 60 * 1000;
const SLOTS = [9, 15, 21];
const SKILL_CD = 2;
const ULT_CD = 5;
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
   battle_id INTEGER NOT NULL,user_id TEXT NOT NULL,class_key TEXT,initiative INTEGER DEFAULT 0,hp INTEGER DEFAULT 0,max_hp INTEGER DEFAULT 0,
   energy INTEGER DEFAULT 0,damage_done INTEGER DEFAULT 0,healing_done INTEGER DEFAULT 0,damage_taken INTEGER DEFAULT 0,
   contribution INTEGER DEFAULT 0,status TEXT DEFAULT 'alive',effects_json TEXT DEFAULT '{}',summons_json TEXT DEFAULT '[]',joined_at INTEGER NOT NULL,
   PRIMARY KEY(battle_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS world_boss_schedule(date_key TEXT NOT NULL,slot_hour INTEGER NOT NULL,battle_id INTEGER,created_at INTEGER NOT NULL,PRIMARY KEY(date_key,slot_hour));
  `);
}

function activeBattle() { init(); return db.prepare("SELECT * FROM world_boss_battles WHERE status IN ('registration','class_roll','class_select','initiative_roll','active') ORDER BY id DESC LIMIT 1").get(); }
function battlePlayers(id) { return db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? ORDER BY initiative DESC,joined_at ASC').all(id); }
function parse(v, fallback) { try { return JSON.parse(v || ''); } catch { return fallback; } }
function stateOf(b) { return parse(b.state_json, { log: [], minions: [], summons: [] }); }
function saveState(b, state) { db.prepare('UPDATE world_boss_battles SET state_json=? WHERE id=?').run(JSON.stringify(state), b.id); }
function effects(p) { return parse(p.effects_json, {}); }
function updateEffects(id, user, e) { db.prepare('UPDATE world_boss_players SET effects_json=? WHERE battle_id=? AND user_id=?').run(JSON.stringify(e), id, user); }
function moscowParts(ts = Date.now()) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts)); return Object.fromEntries(p.map(x => [x.type, x.value])); }
function dateKey(ts = Date.now()) { const p = moscowParts(ts); return `${p.year}-${p.month}-${p.day}`; }
function roleIcon(role) { return role === 'tank' ? '🛡️' : role === 'healer' ? '💚' : role === 'dps' ? '🔥' : '⚙️'; }
function hpBar(hp, max, size = 16) { const q = max ? Math.round(clamp(hp / max, 0, 1) * size) : 0; return '█'.repeat(q) + '░'.repeat(size - q); }
function clearTimer(id) { const t = timers.get(Number(id)); if (t) clearTimeout(t); timers.delete(Number(id)); }
function setTimer(id, fn, ms) { clearTimer(id); const t = setTimeout(fn, Math.max(500, ms)); t.unref?.(); timers.set(Number(id), t); }
function addLog(b, text) { const s = stateOf(b); s.log = [...(s.log || []), text].slice(-12); saveState(b, s); return s; }

function rolePlan(n) {
  if (n <= 4) return { tank: 1, healer: 1, dps: 2, support: 0 };
  if (n <= 7) { const dps = Math.max(2, Math.ceil(n / 3)); return { tank: 1, healer: 1, dps, support: n - 2 - dps }; }
  const tank = 2, healer = 2, dps = Math.max(3, Math.ceil(n * 0.4));
  return { tank, healer, dps, support: Math.max(0, n - tank - healer - dps) };
}
function buildClassPool(n) {
  const plan = rolePlan(n), out = [];
  for (const [role, count] of Object.entries(plan)) {
    const keys = shuffle(Object.keys(CLASSES).filter(k => CLASSES[k].role === role));
    for (let i = 0; i < count; i++) out.push(keys[i % keys.length]);
  }
  while (out.length < n + 1) { const candidates = Object.keys(CLASSES).filter(k => ['dps','support'].includes(CLASSES[k].role) && !out.includes(k)); out.push(pick(candidates.length ? candidates : Object.keys(CLASSES).filter(k => !out.includes(k)))); }
  return shuffle(out);
}
function scaledHp(base, n) { return Math.round(base * (0.72 + 0.28 * n) * 1.15); }

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
    new ButtonBuilder().setCustomId(`wb_skill_${b.id}`).setLabel('Способность').setEmoji('✨').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`wb_ult_${b.id}`).setLabel('Ульта').setEmoji('💥').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`wb_status_${b.id}`).setLabel('Моя карта').setEmoji('🎴').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wb_log_${b.id}`).setLabel('Журнал').setEmoji('📖').setStyle(ButtonStyle.Secondary),
  )];
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wb_summons_${b.id}`).setLabel('Мои призывы').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wb_enemies_${b.id}`).setLabel('Враги').setEmoji('👾').setStyle(ButtonStyle.Secondary),
  ));
  if (battlePlayers(b.id).some(p => p.status === 'alive' && p.class_key === 'cleric')) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wb_selfheal_${b.id}`).setLabel('Самохил Клирика · 20⚡').setEmoji('✨').setStyle(ButtonStyle.Success),
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
function buildEmbed(b, players) {
  const state = stateOf(b), alive = players.filter(p => p.status === 'alive');
  const current = b.status === 'active' ? alive[b.turn_index % Math.max(1, alive.length)] : null;
  const e = new EmbedBuilder().setColor(['registration','class_roll','class_select','initiative_roll'].includes(b.status) ? 0x8b5cf6 : b.status === 'active' ? 0xdc2626 : 0x22c55e)
    .setTitle(`👹 Мировой босс — ${b.boss_name}`)
    .setDescription(`❤️ **${b.boss_hp}/${b.boss_max_hp} HP**\n${hpBar(b.boss_hp, b.boss_max_hp, 20)}${b.status === 'active' ? `\n🔥 **Ярость: ${Number(state.rage || 0)}/100**` : ''}`);
  if (b.status === 'registration') e.addFields({ name: 'Регистрация', value: `До <t:${Math.floor(b.registration_ends_at / 1000)}:R>\nМинимум: **4** • Участников: **${players.length}**` });
  if (b.status === 'class_roll') e.addFields({ name: '🎲 Бросок за выбор класса', value: `Бросили: **${Object.keys(state.classRolls || {}).length}/${players.length}**\nДо автоброска: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}` });
  if (b.status === 'class_select') {
    const order = state.classOrder || [], idx = state.classChoiceIndex || 0, who = order[idx];
    e.addFields({ name: '🧙 Выбор классов', value: `Сейчас выбирает: ${who ? `<@${who}>` : '—'}\nДо автовыбора: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}\nОсталось классов: **${(state.availableClasses || []).length}**` });
  }
  if (b.status === 'initiative_roll') e.addFields({ name: '🎲 Инициатива боя', value: `Бросили: **${Object.keys(state.initiativeRolls || {}).length}/${players.length}**\nДо автоброска: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}` });
  if (b.status === 'active') e.addFields({ name: 'Состояние боя', value: `Раунд **${b.round_no}** • Живы **${alive.length}/${players.length}**\nХод: ${current ? `<@${current.user_id}> — **${CLASSES[current.class_key]?.name}**` : '—'}\nДо автоатаки: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}` });
  if (state.minions?.length) e.addFields({ name: '👾 Миньоны босса', value: state.minions.map(m => `${m.name}: ❤️ **${m.hp}/${m.maxHp}**`).join('\n').slice(0, 1024) });
  const sum = summonsText(state); if (sum) e.addFields({ name: '⚙️ Призывы игроков', value: sum });
  if (['class_select','initiative_roll','active'].includes(b.status)) e.addFields({ name: 'Команда', value: players.slice(0, 18).map(p => {
    const c = CLASSES[p.class_key], ef = effects(p), sh = Number(ef.shield || 0);
    return `${c ? roleIcon(c.role) : '❔'} <@${p.user_id}> • ${c?.name || 'класс не выбран'}${b.status === 'active' ? ` • ❤️ ${p.hp}/${p.max_hp}${sh ? ` • 🛡️ ${sh}` : ''} • 🔋 ${p.energy}` : ''}`;
  }).join('\n').slice(0, 1024) });
  if (state.log?.length) e.addFields({ name: 'Последние действия', value: state.log.slice(-7).join('\n').slice(0, 1024) });
  return e.setFooter({ text: 'Game Syndicate • World Boss' });
}
async function refresh(id) {
  const b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); if (!b || !clientRef) return;
  const ch = await clientRef.channels.fetch(b.channel_id).catch(() => null);
  const msg = ch && b.message_id ? await ch.messages.fetch(b.message_id).catch(() => null) : null; if (!msg) return;
  const players = battlePlayers(id), state = stateOf(b), alive = players.filter(p => p.status === 'alive');
  const current = b.status === 'active' && alive.length ? alive[b.turn_index % alive.length] : null;
  for (const player of players) {
    const member = await ch.guild?.members.fetch(player.user_id).catch(() => null);
    player.displayName = member?.displayName || member?.user?.globalName || member?.user?.username || `Игрок ${player.user_id.slice(-4)}`;
  }
  try {
    const buffer = await createWorldBossBattleCard({ battle: b, players, state, effectsByUser: Object.fromEntries(players.map(player => [player.user_id, effects(player)])), currentUserId: current?.user_id || null });
    const attachment = new AttachmentBuilder(buffer, { name: `world-boss-${id}.png` });
    const embed = buildEmbed(b, players).setImage(`attachment://world-boss-${id}.png`);
    await msg.edit({ content: '## 🌍 GS WORLD BOSS', embeds: [embed], components: buttons(b), files: [attachment], attachments: [] });
  } catch (error) {
    console.error('[WorldBoss] Battle card render failed:', error);
    await msg.edit({ embeds: [buildEmbed(b, players)], components: buttons(b) }).catch(() => {});
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
    const ch = await clientRef.channels.fetch(CHANNEL_ID).catch(() => null); if (!ch?.isTextBased()) return { ok: false, reason: 'channel' };
    const boss = pick(BOSSES), now = Date.now();
    const st = { bossCardId: boss.cardId, allowedMinions: [...boss.minions], minions: [], summons: [], rage: 0, lastDestroyRound: -99, lastGroupCurseRound: -99, lastSummonRound: -99, lastCurseRound: -99, bossActionStats: {}, log: [manual ? '🛠️ Босс вызван вручную.' : '⏰ Босс появился по расписанию.'] };
    const info = db.prepare(`INSERT INTO world_boss_battles(channel_id,boss_card_id,boss_name,boss_hp,boss_max_hp,status,registration_ends_at,state_json,created_at) VALUES(?,?,?,?,?,'registration',?,?,?)`).run(CHANNEL_ID, boss.cardId, boss.name, boss.baseHp, boss.baseHp, now + REGISTRATION_MS, JSON.stringify(st), now);
    const id = Number(info.lastInsertRowid); createdBattleId = id;
    const b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
    const msg = await ch.send({ content: '## 🌍 GS WORLD BOSS', embeds: [buildEmbed(b, [])], components: buttons(b) });
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
  const state = stateOf(b); state.classRolls = {}; state.classPool = buildClassPool(players.length); state.availableClasses = [...state.classPool]; state.log.push('🎲 Бросьте d20 за право первым выбрать класс.'); saveState(b, state);
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
  for (const p of missing) {
    state.classRolls[p.user_id] = rand(1, 20);
    state.log.push(`⏱️ Автобросок класса: <@${p.user_id}> — **${state.classRolls[p.user_id]}**.`);
  }
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
  state.classOrder = [...ps].sort((a, z) => (state.classRolls[z.user_id] - state.classRolls[a.user_id]) || (a.joined_at - z.joined_at)).map(p => p.user_id);
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
  const s = stateOf(b), user = s.classOrder?.[s.classChoiceIndex], key = pick(s.availableClasses || []); if (!user || !key) return;
  await assignChosenClass(id, user, key, true);
}
async function assignChosenClass(id, user, key, auto = false) {
  let b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='class_select'").get(id); if (!b) return { ok: false };
  const s = stateOf(b), expected = s.classOrder?.[s.classChoiceIndex];
  if (String(user) !== String(expected)) return { ok: false, reason: 'turn' };
  const pos = (s.availableClasses || []).indexOf(key); if (pos < 0) return { ok: false, reason: 'taken' };
  const c = CLASSES[key]; s.availableClasses.splice(pos, 1); s.classChoiceIndex += 1; s.log.push(`${auto ? '⏱️ Автовыбор:' : '✅'} <@${user}> — ${roleIcon(c.role)} **${c.name}**.`); saveState(b, s);
  db.prepare("UPDATE world_boss_players SET class_key=?,hp=?,max_hp=?,energy=0,status='alive',effects_json='{}' WHERE battle_id=? AND user_id=?").run(key, c.maxHp, c.maxHp, id, user);
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
  const boss = BOSSES.find(x => x.cardId === b.boss_card_id), hp = boss.baseHp; s.log.push('⚔️ Инициатива определена. Бой начался!'); saveState(b, s);
  db.prepare("UPDATE world_boss_battles SET status='active',boss_hp=?,boss_max_hp=?,round_no=1,turn_index=0,turn_deadline=? WHERE id=?").run(hp, hp, Date.now() + TURN_MS, id); await refresh(id); armTurn(id);
}

function currentPlayer(b) { const alive = battlePlayers(b.id).filter(p => p.status === 'alive'); return { alive, p: alive.length ? alive[b.turn_index % alive.length] : null }; }
function armTurn(id) { const b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id); if (!b) return; setTimer(id, () => autoTurn(id).catch(console.error), Number(b.turn_deadline) - Date.now()); }
async function autoTurn(id) { const b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id); if (!b) return; const { p } = currentPlayer(b); if (p) await perform(id, p.user_id, 'attack', true); }
function damageTarget(id, target, amount) {
  const e = effects(target); let d = amount;
  if (e.guardRounds > 0) d = Math.round(d * 0.5); if (e.tauntRounds > 0) d = Math.round(d * 0.7); if (e.rageTurns > 0 || e.bloodRageTurns > 0) d = Math.round(d * 1.25); if (e.partyGuardRounds > 0) d = Math.round(d * 0.6);
  let shield = Number(e.shield || 0), absorbed = 0; if (shield) { absorbed = Math.min(shield, d); shield -= absorbed; d -= absorbed; e.shield = shield; updateEffects(id, target.user_id, e); }
  const hp = Math.max(0, target.hp - d); db.prepare("UPDATE world_boss_players SET hp=?,damage_taken=damage_taken+?,status=CASE WHEN ?<=0 THEN 'dead' ELSE status END WHERE battle_id=? AND user_id=?").run(hp, d, hp, id, target.user_id);
  return { hpDamage: d, absorbed };
}
function hurtEnemy(b, state, amount) {
  if (state.minions?.length) { const m = state.minions.find(x => x.hp > 0); if (m) { const dealt = Math.min(amount, m.hp); m.hp -= amount; state.minions = state.minions.filter(x => x.hp > 0); saveState(b, state); return { dealt, target: m.name, minion: true }; } }
  const dealt = Math.min(amount, b.boss_hp); db.prepare('UPDATE world_boss_battles SET boss_hp=MAX(0,boss_hp-?) WHERE id=?').run(amount, b.id);
  state.rage = clamp(Number(state.rage || 0) + Math.min(8, Math.max(1, Math.ceil(dealt / 50))), 0, 100); saveState(b, state);
  return { dealt, target: b.boss_name, minion: false };
}
function applyDamageBuff(p, base) { const e = effects(p); let d = base; if (p.class_key === 'berserker') { const missing = 1 - (p.hp / Math.max(1, p.max_hp)); d *= 1 + Math.min(0.5, missing * 0.6); } if (e.bloodRageTurns > 0) d *= 2; if (e.rageTurns > 0) d *= 1.4; if (e.damageBuffTurns > 0) d *= 1 + Number(e.damageBuff || 0); if (e.groupDamageRounds > 0) d *= 1 + Number(e.groupDamage || 0); if (e.doubleNext) { d *= 2; e.doubleNext = false; updateEffects(p.battle_id, p.user_id, e); } return Math.round(d); }
function healPlayer(id, healerId, target, amount) { const nh = Math.min(target.max_hp, target.hp + amount), actual = nh - target.hp; db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(nh, id, target.user_id); if (actual > 0) db.prepare('UPDATE world_boss_players SET healing_done=healing_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(actual, actual, id, healerId); return actual; }
function validTargets(id, kind) { const ps = battlePlayers(id); return kind === 'dead' ? ps.filter(x => x.status === 'dead') : ps.filter(x => x.status === 'alive'); }
function actionTargets(id, player, action, kind) { let list = validTargets(id, kind); if (player.class_key === 'cleric' && action === 'skill') list = list.filter(x => x.user_id !== player.user_id); return list; }
function targetKind(classKey, action) { if (action === 'skill' && ['paladin','cleric','bard'].includes(classKey)) return 'alive'; if (action === 'ult' && ['cleric'].includes(classKey)) return 'alive'; if (action === 'ult' && classKey === 'priest') return 'dead'; return null; }
function targetMenu(id, action, targets) { return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`wb_target_${action}_${id}`).setPlaceholder('Выберите цель').addOptions(targets.slice(0, 25).map(t => ({ label: `${CLASSES[t.class_key]?.name || 'Игрок'} • ${t.hp}/${t.max_hp} HP`, value: t.user_id, description: t.status === 'dead' ? 'Погиб' : `Энергия: ${t.energy}` })))); }
function tickCooldowns(e, used) { if (used !== 'skill' && e.skillCd > 0) e.skillCd--; if (used !== 'selfheal' && e.selfHealCd > 0) e.selfHealCd--; if (used !== 'ult' && e.ultCd > 0) e.ultCd--; if (e.skillSilencedTurns > 0) e.skillSilencedTurns--; if (e.ultSilencedTurns > 0) e.ultSilencedTurns--; }

async function perform(id, userId, action, auto = false, targetId = null) {
  if (busy) return { ok: false, reason: 'busy' }; busy = true;
  try {
    let b = db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id); if (!b) return { ok: false, reason: 'ended' };
    const { alive, p } = currentPlayer(b); if (!p || p.user_id !== String(userId)) return { ok: false, reason: 'turn' };
    const c = CLASSES[p.class_key], e = effects(p), state = stateOf(b); let text = '', energy = p.energy;
    if (action === 'attack') {
      const miss = auto ? 50 : c.miss;
      if (Math.random() * 100 < miss) text = `💨 <@${userId}> (${c.name}) ${auto ? 'автоатакой ' : ''}промахивается.`;
      else { let dmg = applyDamageBuff(p, rand(...c.damage)); const crit = Math.random() * 100 < CRIT_CHANCE; if (crit) dmg = Math.round(dmg * CRIT_MULTIPLIER); const r = hurtEnemy(b, state, dmg); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, userId); text = `🗡️ <@${userId}> наносит **${r.dealt}** → ${r.target}${crit ? ' • 💥 КРИТ!' : ''}.`; }
      energy = clamp(energy + (text.includes('промах') ? 15 : 20), 0, 100);
    } else if (action === 'selfheal') {
      if (p.class_key !== 'cleric') return { ok: false, reason: 'class' };
      if (Number(e.selfHealCd || 0) > 0) return { ok: false, reason: 'cooldown', cd: e.selfHealCd };
      if (energy < 20) return { ok: false, reason: 'energy' };
      energy -= 20; const healed = healPlayer(id, userId, p, c.selfSkill?.heal || 25); text = `✨ <@${userId}> восстанавливает себе **${healed} HP**.`; e.selfHealCd = SELF_HEAL_CD;
    } else if (action === 'skill') {
      if (Number(e.skillSilencedTurns || 0) > 0) return { ok: false, reason: 'silenced_skill', cd: e.skillSilencedTurns };
      if (Number(e.skillCd || 0) > 0) return { ok: false, reason: 'cooldown', cd: e.skillCd }; if (energy < 40) return { ok: false, reason: 'energy' };
      const kind = targetKind(p.class_key, action); if (kind && !targetId) return { ok: false, reason: 'target', kind };
      energy -= 40; text = useSkill(b, p, c, e, state, targetId); e.skillCd = SKILL_CD;
    } else if (action === 'ult') {
      if (Number(e.ultSilencedTurns || 0) > 0) return { ok: false, reason: 'silenced_ult', cd: e.ultSilencedTurns };
      if (Number(e.ultCd || 0) > 0) return { ok: false, reason: 'cooldown', cd: e.ultCd }; if (energy < 100) return { ok: false, reason: 'energy' };
      const kind = targetKind(p.class_key, action); if (kind && !targetId) return { ok: false, reason: 'target', kind };
      energy = 0; text = useUlt(b, p, c, e, state, targetId); e.ultCd = ULT_CD;
    }
    if (e.rageTurns > 0) e.rageTurns--; if (e.bloodRageTurns > 0 && !(p.class_key === 'berserker' && action === 'ult')) e.bloodRageTurns--; if (e.damageBuffTurns > 0) e.damageBuffTurns--; tickCooldowns(e, action); updateEffects(id, userId, e);
    db.prepare('UPDATE world_boss_players SET energy=? WHERE battle_id=? AND user_id=?').run(energy, id, userId);
    b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); addLog(b, (auto ? '⏱️ ' : '') + text); b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); if (b.boss_hp <= 0) return finish(id, true);
    const keepsTurn = p.class_key === 'berserker' && action === 'ult'; if (keepsTurn) { db.prepare('UPDATE world_boss_battles SET turn_deadline=? WHERE id=?').run(Date.now() + TURN_MS,id); await refresh(id); armTurn(id); } else await nextTurn(id, alive); return { ok: true, text };
  } finally { busy = false; }
}
function targetById(id, targetId, status = 'alive') { return battlePlayers(id).find(x => x.user_id === String(targetId) && x.status === status); }
function useSkill(b, p, c, e, state, targetId) {
  const id = b.id, u = p.user_id;
  switch (p.class_key) {
    case 'warrior': e.interceptRounds = 2; return `🛡️ <@${u}> перехватывает 70% одиночного урона на 2 раунда.`;
    case 'paladin': { const t = targetById(id, targetId) || p, te = effects(t); te.shield = Math.max(Number(te.shield || 0), 180); updateEffects(id, t.user_id, te); return `✨ <@${u}> накладывает на <@${t.user_id}> щит **180 HP**.`; }
    case 'guardian': e.guardRounds = 2; return `🛡️ <@${u}> снижает входящий урон на 50% на 2 раунда.`;
    case 'cleric': { const t = targetById(id, targetId) || p, sacrifice = Math.min(rand(30, 45), Math.max(0, p.hp - 1)); if (sacrifice <= 0) return `💔 <@${u}> не хватает HP для жертвы.`; db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(p.hp - sacrifice, id, u); const healed = healPlayer(id, u, t, sacrifice); return `💚 <@${u}> жертвует **${sacrifice} HP** и лечит <@${t.user_id}> на **${healed} HP**.`; }
    case 'priest': { let total = 0; for (const t of validTargets(id, 'alive')) total += healPlayer(id, u, t, rand(18, 28)); return `💚 <@${u}> исцеляет всю группу суммарно на **${total} HP**.`; }
    case 'bard': { const t = targetById(id, targetId) || p, te = effects(t); te.damageBuffTurns = 3; te.damageBuff = 0.15; updateEffects(id, t.user_id, te); return `🎵 <@${u}> усиливает <@${t.user_id}> на 15% на 3 хода.`; }
    case 'assassin': { const r = hurtEnemy(b, state, rand(60, 80)); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `🗡️ <@${u}> наносит **${r.dealt}** теневого урона.`; }
    case 'archer': { let total = 0; for (let i = 0; i < 3; i++) if (Math.random() * 100 >= c.miss) total += hurtEnemy(b, state, rand(25, 40)).dealt; db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total, total, id, u); return `🏹 <@${u}> выпускает 3 стрелы: **${total}** урона.`; }
    case 'mage': { const r = hurtEnemy(b, state, rand(45, 65)); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `🔥 <@${u}> наносит **${r.dealt}** магического урона.`; }
    case 'berserker': { let total = 0, hits = 0; for (let i = 0; i < 3; i++) { if (Math.random() * 100 < c.miss) continue; const r = hurtEnemy(b, state, Math.round(applyDamageBuff(p, rand(...c.damage)) * 0.62)); total += r.dealt; hits++; } db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `🪓 <@${u}> проводит тройной удар: **${hits}/3** попаданий, **${total}** урона.`; }
    case 'engineer': state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'turret'); state.summons.push({ owner: u, type: 'turret', icon: '🔫', name: 'Турель', hp: 80, maxHp: 80, damage: [16, 22], miss: 8, rounds: 4 }); saveState(b, state); return `🔧 <@${u}> устанавливает турель на 4 раунда.`;
    case 'necromancer': { state.summons = state.summons || []; const own = state.summons.filter(x => x.owner === u && x.type === 'skeleton'); if (own.length >= 2) state.summons.splice(state.summons.indexOf(own[0]), 1); state.summons.push({ owner: u, type: 'skeleton', icon: '💀', name: 'Скелет', hp: 55, maxHp: 55, damage: [13, 19], miss: 12, rounds: 4 }); saveState(b, state); return `💀 <@${u}> призывает **1 скелета** на 4 раунда.`; }
    default: return 'Способность использована.';
  }
}
function useUlt(b, p, c, e, state, targetId) {
  const id = b.id, u = p.user_id;
  switch (p.class_key) {
    case 'warrior': for (const t of validTargets(id, 'alive')) { const te = effects(t); te.partyGuardRounds = Math.max(Number(te.partyGuardRounds || 0), 2); updateEffects(id, t.user_id, te); } e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2); return `🛡️ <@${u}> поднимает Последний рубеж: вся группа получает -40% урона на 2 хода, одиночные атаки направлены в Воина.`;
    case 'paladin': for (const t of validTargets(id, 'alive')) { const te = effects(t); te.shield = Math.max(Number(te.shield || 0), t.user_id === u ? 80 : 60); updateEffects(id, t.user_id, te); } return `✨ <@${u}> накладывает щиты на всю группу.`;
    case 'guardian': e.tauntRounds = 2; return `🛡️ <@${u}> провоцирует босса и миньонов на 2 раунда.`;
    case 'cleric': { const t = targetById(id, targetId) || p, healed = healPlayer(id, u, t, t.max_hp); return `🌟 <@${u}> полностью исцеляет <@${t.user_id}> на **${healed} HP**.`; }
    case 'priest': { const dead = targetById(id, targetId, 'dead'); if (!dead) return `✨ Нет выбранной погибшей цели.`; db.prepare("UPDATE world_boss_players SET status='alive',hp=ROUND(max_hp*0.5),energy=0 WHERE battle_id=? AND user_id=?").run(id, dead.user_id); return `✨ <@${u}> воскрешает <@${dead.user_id}> с 50% HP.`; }
    case 'bard': for (const t of validTargets(id, 'alive')) { const te = effects(t); te.groupDamageRounds = 2; te.groupDamage = 0.2; updateEffects(id, t.user_id, te); } return `🎼 <@${u}> усиливает всю группу на 20% на 2 раунда.`;
    case 'assassin': { const r = hurtEnemy(b, state, rand(120, 160)); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `☠️ <@${u}> наносит **${r.dealt}** смертельного урона.`; }
    case 'archer': { const enemies = 1 + (state.minions || []).length; const pool = 240; const share = Math.floor(pool / Math.max(1, enemies)); let total = 0; for (const m of state.minions || []) { const d = Math.min(m.hp, share); m.hp -= d; total += d; } state.minions = (state.minions || []).filter(x => x.hp > 0); const bossDamage = Math.min(b.boss_hp, pool - share * (enemies - 1)); db.prepare('UPDATE world_boss_battles SET boss_hp=MAX(0,boss_hp-?) WHERE id=?').run(bossDamage,id); total += bossDamage; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `🏹 <@${u}> обрушивает град стрел: **${total}** общего урона, распределённого между ${enemies} противниками.`; }
    case 'mage': { const r = hurtEnemy(b, state, rand(140, 180)); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `☄️ <@${u}> вызывает метеор: **${r.dealt}** урона.`; }
    case 'berserker': e.bloodRageTurns = 6; return `🔥 <@${u}> входит в Кровавую ярость на 6 своих ходов: двойной исходящий урон и +25% входящего урона.`;
    case 'engineer': state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'golem'); state.summons.push({ owner: u, type: 'golem', icon: '🤖', name: 'Голем', hp: 220, maxHp: 220, damage: [30, 42], miss: 5, rounds: 5 }); saveState(b, state); return `🤖 <@${u}> призывает голема на 5 раундов.`;
    case 'necromancer': state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'army'); for (let i = 0; i < 4; i++) state.summons.push({ owner: u, type: 'army', icon: '🦴', name: 'Скелет армии', hp: 65, maxHp: 65, damage: [15, 21], miss: 10, rounds: 3 }); saveState(b, state); return `💀 <@${u}> поднимает **4 скелетов армии** на 3 раунда.`;
    default: return 'Ульта использована.';
  }
}

async function summonsAct(b) {
  const state = stateOf(b), totalByOwner = {};
  for (const summon of state.summons || []) { if (summon.rounds <= 0 || summon.hp <= 0) continue; if (Math.random() * 100 >= Number(summon.miss || 0)) { const r = hurtEnemy(b, state, rand(...summon.damage)); totalByOwner[summon.owner] = (totalByOwner[summon.owner] || 0) + r.dealt; } summon.rounds--; if (summon.rounds <= 0) state.log.push(`⌛ Призыв **${summon.name}** игрока <@${summon.owner}> исчезает.`); }
  state.summons = (state.summons || []).filter(summon => summon.rounds > 0 && summon.hp > 0); saveState(b, state);
  for (const [u, d] of Object.entries(totalByOwner)) db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(d, d, b.id, u);
  if (Object.keys(totalByOwner).length) addLog(b, `⚙️ Призывы наносят **${Object.values(totalByOwner).reduce((a, z) => a + z, 0)}** суммарного урона.`);
}
async function nextTurn(id) {
  let b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id), alive = battlePlayers(id).filter(x => x.status === 'alive'), ni = b.turn_index + 1;
  if (ni >= alive.length) { await summonsAct(b); b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); if (b.boss_hp <= 0) return finish(id, true); await bossTurn(id); b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); alive = battlePlayers(id).filter(x => x.status === 'alive'); if (!alive.length) return finish(id, false); ni = 0; db.prepare('UPDATE world_boss_battles SET round_no=round_no+1 WHERE id=?').run(id); }
  db.prepare('UPDATE world_boss_battles SET turn_index=?,turn_deadline=? WHERE id=?').run(ni, Date.now() + TURN_MS, id); await refresh(id); armTurn(id);
}
function damagePlayerSummons(state, ratio = 0.55) {
  let total = 0;
  for (const summon of state.summons || []) {
    const hit = Math.max(1, Math.round(rand(14, 24) * ratio));
    summon.hp = Math.max(0, summon.hp - hit); total += hit;
  }
  state.summons = (state.summons || []).filter(s => s.hp > 0 && s.rounds > 0);
  return total;
}
function applyBossCurse(id, state, players, type, rounds = 2) {
  if (!players.length) return null;
  const target = pick(players), e = effects(target);
  if (type === 'skill') { e.skillSilencedTurns = Math.max(Number(e.skillSilencedTurns || 0), rounds); updateEffects(id, target.user_id, e); return `🔒 <@${target.user_id}> не может использовать способности **${rounds} хода**.`; }
  if (type === 'ult') { e.ultSilencedTurns = Math.max(Number(e.ultSilencedTurns || 0), rounds); updateEffects(id, target.user_id, e); return `⛓️ <@${target.user_id}> не может использовать ульту **${rounds} хода**.`; }
  return null;
}
function destroyRandomSummon(state) {
  const list = state.summons || []; if (!list.length) return null;
  const chosen = pick(list);
  if (chosen.type === 'golem' && Math.random() < 0.5) return `🛡️ ${chosen.name} выдерживает попытку уничтожения.`;
  const idx = list.indexOf(chosen); if (idx >= 0) list.splice(idx, 1);
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
  state.rage = clamp(Number(state.rage || 0) + 18, 0, 100);

  const hpRatio = b.boss_max_hp ? b.boss_hp / b.boss_max_hp : 1;
  const phase = hpRatio <= 0.25 ? 3 : hpRatio <= 0.5 ? 2 : 1;
  const target = players.find(x => effects(x).tauntRounds > 0)
    || players.find(x => effects(x).interceptRounds > 0)
    || pick(players);

  const recordAction = action => {
    state.bossActionStats[action] = Number(state.bossActionStats[action] || 0) + 1;
    console.log(`[WorldBoss AI] battle=${id} round=${b.round_no} phase=${phase} action=${action} minions=${state.minions.length} rage=${state.rage}`);
  };

  const summon = () => {
    if (state.minions.length >= 3) return null;
    const allowed = (boss.minions || []).filter(mid => MINIONS[mid]);
    if (!allowed.length) return null;
    const existingIds = new Set(state.minions.map(m => Number(m.cardId)));
    const candidates = allowed.filter(mid => !existingIds.has(Number(mid)));
    const minionId = pick(candidates.length ? candidates : allowed);
    const cfg = MINIONS[minionId];
    state.minions.push({ cardId: minionId, ownerBossCardId: boss.cardId, name: cfg.name, hp: cfg.maxHp, maxHp: cfg.maxHp, damage: cfg.damage, miss: cfg.miss });
    state.lastSummonRound = b.round_no;
    return `👾 **${boss.name}** призывает своего миньона: **${cfg.name}** — ❤️ ${cfg.maxHp}.`;
  };

  let action = '';
  let text = '';

  if (state.rage >= 100) {
    action = 'RAGE_ULT';
    let total = 0;
    for (const p of players) {
      const r = damageTarget(id, p, rand(Math.round(boss.damage[0] * 0.99), Math.round(boss.damage[1] * 1.16)));
      total += r.hpDamage;
    }
    const summonDamage = damagePlayerSummons(state, 1);
    state.rage = 0;
    text = `🔥 **${boss.name} впадает в ярость!** Ультимативная массовая атака наносит группе **${total} HP**${summonDamage ? ` и ${summonDamage} урона призывам` : ''}.`;
  } else {
    // Гарантии: в нормальном бою ключевые механики не могут не появиться из-за неудачного RNG.
    const neverSummoned = Number(state.bossActionStats.SUMMON || 0) === 0;
    const neverCursed = Number(state.bossActionStats.SKILL_CURSE || 0) + Number(state.bossActionStats.ULT_CURSE || 0) + Number(state.bossActionStats.GROUP_CURSE || 0) === 0;
    const canSummon = state.minions.length < 3 && (boss.minions || []).length > 0;
    const canGroupCurse = b.round_no - Number(state.lastGroupCurseRound || -99) >= 5;

    if (neverSummoned && canSummon && b.round_no >= 2) action = 'SUMMON';
    else if (neverCursed && b.round_no >= 3) action = 'SKILL_CURSE';
    else {
      // Фаза 1: больше призывов. Фаза 2/3: больше АоЕ и проклятий.
      const weights = phase === 1
        ? [['ATTACK',32],['AOE',18],['SPECIAL',10],['SUMMON',18],['SKILL_CURSE',10],['ULT_CURSE',6],['DESTROY_SUMMON',4],['GROUP_CURSE',2]]
        : phase === 2
          ? [['ATTACK',27],['AOE',23],['SPECIAL',10],['SUMMON',13],['SKILL_CURSE',11],['ULT_CURSE',7],['DESTROY_SUMMON',5],['GROUP_CURSE',4]]
          : [['ATTACK',22],['AOE',28],['SPECIAL',11],['SUMMON',10],['SKILL_CURSE',12],['ULT_CURSE',8],['DESTROY_SUMMON',5],['GROUP_CURSE',4]];
      let roll = Math.random() * weights.reduce((sum, [,w]) => sum + w, 0);
      for (const [name, weight] of weights) { roll -= weight; if (roll < 0) { action = name; break; } }
    }

    // Если выбранное действие сейчас недоступно, используем осмысленную замену.
    if (action === 'SUMMON' && !canSummon) action = 'AOE';
    if (action === 'DESTROY_SUMMON' && (!(state.summons || []).length || b.round_no - Number(state.lastDestroyRound || -99) < 2)) action = 'SPECIAL';
    if (action === 'GROUP_CURSE' && !canGroupCurse) action = 'SKILL_CURSE';

    if (action === 'ATTACK') {
      if (Math.random() * 100 < boss.miss) text = `💨 ${boss.name} промахивается.`;
      else {
        let damage = rand(Math.round(boss.damage[0] * 1.1), Math.round(boss.damage[1] * 1.1));
        const crit = Math.random() * 100 < BOSS_CRIT_CHANCE;
        if (crit) damage = Math.round(damage * BOSS_CRIT_MULTIPLIER);
        const r = damageTarget(id, target, damage);
        text = `👹 ${boss.name} атакует <@${target.user_id}>: **${r.hpDamage} HP**${r.absorbed ? `, щит поглотил ${r.absorbed}` : ''}${crit ? ' • 💥 КРИТ!' : ''}.`;
      }
    } else if (action === 'AOE') {
      let total = 0;
      for (const p of players) {
        const r = damageTarget(id, p, rand(Math.round(boss.damage[0] * 0.66), Math.round(boss.damage[1] * 0.77)));
        total += r.hpDamage;
      }
      const summonDamage = damagePlayerSummons(state, 0.65);
      text = `💥 ${boss.name} применяет массовую атаку: группе нанесено **${total} HP**${summonDamage ? `, призывам — ${summonDamage}` : ''}.`;
    } else if (action === 'SPECIAL') {
      let damage = rand(Math.round(boss.damage[1] * 1.25), Math.round(boss.damage[1] * 1.55));
      const crit = Math.random() * 100 < BOSS_CRIT_CHANCE;
      if (crit) damage = Math.round(damage * BOSS_CRIT_MULTIPLIER);
      const r = damageTarget(id, target, damage);
      text = `⚡ ${boss.name} применяет особую атаку против <@${target.user_id}>: **${r.hpDamage} HP**${crit ? ' • 💥 КРИТ!' : ''}.`;
    } else if (action === 'SKILL_CURSE') {
      text = applyBossCurse(id, state, players, 'skill', 2) || `👹 ${boss.name} готовит новую атаку.`;
      state.lastCurseRound = b.round_no;
    } else if (action === 'ULT_CURSE') {
      const candidates = players.filter(p => p.energy >= 70);
      text = applyBossCurse(id, state, candidates.length ? candidates : players, 'ult', 2) || `👹 ${boss.name} готовит новую атаку.`;
      state.lastCurseRound = b.round_no;
    } else if (action === 'GROUP_CURSE') {
      for (const p of players) {
        const e = effects(p);
        e.skillSilencedTurns = Math.max(Number(e.skillSilencedTurns || 0), 1);
        updateEffects(id, p.user_id, e);
      }
      state.lastGroupCurseRound = b.round_no;
      state.lastCurseRound = b.round_no;
      text = `🌑 **Великое молчание!** Вся группа лишена способностей на 1 ход.`;
    } else if (action === 'DESTROY_SUMMON') {
      text = destroyRandomSummon(state) || `👹 ${boss.name} не смог разрушить призыв.`;
      state.lastDestroyRound = b.round_no;
    } else if (action === 'SUMMON') {
      text = summon() || `👹 ${boss.name} не смог призвать миньона.`;
    }
  }

  recordAction(action || 'UNKNOWN');
  state.log.push(text);

  for (const m of state.minions) {
    const aliveNow = battlePlayers(id).filter(x => x.status === 'alive');
    if (!aliveNow.length) break;
    const t = pick(aliveNow);
    if (Math.random() * 100 >= m.miss) {
      const r = damageTarget(id, t, rand(...m.damage));
      state.log.push(`👾 ${m.name} → <@${t.user_id}>: **${r.hpDamage} HP**.`);
    } else state.log.push(`💨 ${m.name} промахивается.`);
  }

  state.log = state.log.slice(-12);
  saveState(b, state);
  for (const p of battlePlayers(id)) {
    const e = effects(p);
    for (const k of ['guardRounds','tauntRounds','interceptRounds','groupDamageRounds','partyGuardRounds']) if (e[k] > 0) e[k]--;
    updateEffects(id, p.user_id, e);
  }
}

function mvpPack() { const r = Math.random() * 100; if (r < 5) return 'boss'; if (r < 18) return 'elite'; if (r < 45) return 'premium'; return 'base'; }
async function finish(id, win) {
  clearTimer(id); let b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); if (!b || !['active','registration','class_roll','class_select','initiative_roll'].includes(b.status)) return;
  const ps = battlePlayers(id); db.prepare('UPDATE world_boss_battles SET status=?,ended_at=?,turn_deadline=NULL WHERE id=?').run(win ? 'won' : 'lost', Date.now(), id); let lines;
  if (win && ps.length) { const pool = rand(600, 1000) + ps.length * 80, each = Math.max(40, Math.floor(pool / ps.length)); for (const p of ps) addCardDust(p.user_id, each); const mvp = [...ps].sort((a, z) => (z.damage_done + z.healing_done) - (a.damage_done + a.healing_done))[0], pack = mvpPack(); addPack(mvp.user_id, pack, 1); lines = [`🏆 Победа! Каждый получает **${each} GS Dust**.`, `⭐ MVP: <@${mvp.user_id}> — ${mvp.damage_done} урона, ${mvp.healing_done} лечения.`, `🎁 MVP получает **${pack.toUpperCase()} Pack**.`]; } else lines = ['💀 Группа потерпела поражение.'];
  b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); const s = stateOf(b); s.log = [...lines, ...ps.sort((a, z) => z.damage_done - a.damage_done).slice(0, 8).map((p, i) => `${i + 1}. <@${p.user_id}> — ${p.damage_done} урона`)].slice(-12); saveState(b, s); await refresh(id); scheduleRegular();
}
function scheduleRegular() { setTimeout(() => { try { require('../../systems/quickEventSystem').postQuickEvent(clientRef).catch(console.error); } catch (e) { console.error(e); } }, 5000).unref?.(); }

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
    if (interaction.customId.includes('join')) { getOrCreatePlayer(interaction.user); db.prepare('INSERT OR IGNORE INTO world_boss_players(battle_id,user_id,joined_at) VALUES(?,?,?)').run(id, uid, Date.now()); await interaction.reply({ content: '✅ Ты вступил в бой.', flags: MessageFlags.Ephemeral }); }
    else { db.prepare('DELETE FROM world_boss_players WHERE battle_id=? AND user_id=?').run(id, uid); await interaction.reply({ content: '🚪 Ты покинул регистрацию.', flags: MessageFlags.Ephemeral }); }
    await refresh(id); return true;
  }
  const p = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id, uid); if (!p) { await interaction.reply({ content: 'Ты не участвуешь в этом бою.', flags: MessageFlags.Ephemeral }); return true; }
  if (interaction.customId === `wb_classroll_${id}`) {
    if (b.status !== 'class_roll') return interaction.reply({ content: 'Сейчас не этап этого броска.', flags: MessageFlags.Ephemeral }); const s = stateOf(b); if (s.classRolls?.[uid] != null) return interaction.reply({ content: `Ты уже выбросил **${s.classRolls[uid]}**.`, flags: MessageFlags.Ephemeral }); s.classRolls[uid] = rand(1, 20); s.log.push(`🎲 <@${uid}> выбрасывает **${s.classRolls[uid]}** за выбор класса.`); saveState(b, s); await interaction.reply({ content: `🎲 Твой результат: **${s.classRolls[uid]}**`, flags: MessageFlags.Ephemeral }); await refresh(id); if (allHave(s.classRolls, battlePlayers(id))) await finishClassRoll(id); return true;
  }
  if (interaction.customId === `wb_choose_${id}`) {
    const s = stateOf(b); if (b.status !== 'class_select' || s.classOrder?.[s.classChoiceIndex] !== uid) return interaction.reply({ content: 'Сейчас класс выбирает другой игрок.', flags: MessageFlags.Ephemeral });
    const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`wb_classpick_${id}`).setPlaceholder('Выберите класс').addOptions((s.availableClasses || []).slice(0,25).map(k => ({ label: CLASSES[k].name, value: k, description: `${roleIcon(CLASSES[k].role)} HP ${CLASSES[k].maxHp} • Урон ${CLASSES[k].damage[0]}–${CLASSES[k].damage[1]}` })))); return interaction.reply({ content: 'Выбери один из оставшихся классов:', components: [menu], flags: MessageFlags.Ephemeral });
  }
  if (interaction.isStringSelectMenu() && interaction.customId === `wb_classpick_${id}`) { const r = await assignChosenClass(id, uid, interaction.values[0]); return interaction.reply({ content: r.ok ? `✅ Выбран класс **${CLASSES[interaction.values[0]].name}**.` : 'Этот класс уже недоступен или сейчас не твоя очередь.', flags: MessageFlags.Ephemeral }); }
  if (interaction.customId === `wb_initroll_${id}`) {
    if (b.status !== 'initiative_roll') return interaction.reply({ content: 'Сейчас не этап инициативы.', flags: MessageFlags.Ephemeral }); const s = stateOf(b); if (s.initiativeRolls?.[uid] != null) return interaction.reply({ content: `Ты уже выбросил **${s.initiativeRolls[uid]}**.`, flags: MessageFlags.Ephemeral }); let roll = rand(1,20); s.initiativeRolls[uid] = roll; s.log.push(`⚔️ <@${uid}> выбрасывает инициативу **${roll}**.`); saveState(b,s); await interaction.reply({ content:`🎲 Инициатива: **${roll}**`, flags:MessageFlags.Ephemeral }); await refresh(id); if(allHave(s.initiativeRolls,battlePlayers(id))) await startCombat(id); return true;
  }
  if (interaction.customId === `wb_status_${id}`) {
    const c = CLASSES[p.class_key], e = effects(p), file = cardFile(c.cardId, 'class');
    const content = `${roleIcon(c.role)} **${c.name}**
❤️ ${p.hp}/${p.max_hp}${e.shield ? ` • 🛡️ ${e.shield}` : ''}
⚡ ${p.energy}/100
🗡️ Урон ${c.damage[0]}–${c.damage[1]} • промах ${c.miss}% • крит ${CRIT_CHANCE}% ×${CRIT_MULTIPLIER}

✨ **${c.skill.name}** — ${c.skill.cost} энергии • КД ${e.skillCd || 0}
${p.class_key === 'cleric' ? `💚 **${c.selfSkill.name}** — ${c.selfSkill.cost} энергии, +${c.selfSkill.heal} HP • КД ${e.selfHealCd || 0}
` : ''}💥 **${c.ultimate.name}** — ${c.ultimate.cost} энергии • КД ${e.ultCd || 0}${e.skillSilencedTurns ? `
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
${lines.length ? lines.map((x, i) => `**${i + 1}.** ${x}`).join('\n') : 'Журнал пока пуст.'}`, flags: MessageFlags.Ephemeral });
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
    const enemyText = (st.minions || []).length ? st.minions.map(m => `👾 **${m.name}** — ❤️ ${m.hp}/${m.maxHp}`).join('\n') : 'Миньоны босса пока не призваны.';
    return interaction.reply({ content: `## 👹 ${b.boss_name}
❤️ ${b.boss_hp}/${b.boss_max_hp}
🔥 Ярость ${Number(st.rage || 0)}/100

${enemyText}

Может призывать: ${(boss?.minions || []).map(mid => MINIONS[mid]?.name).filter(Boolean).join(', ') || '—'}`, files, flags: MessageFlags.Ephemeral });
  }
  const targetSelect = interaction.customId.match(/^wb_target_(skill|ult)_\d+$/); if (interaction.isStringSelectMenu() && targetSelect) { const r = await perform(id, uid, targetSelect[1], false, interaction.values[0]); return interaction.reply({ content: resultText(r), flags: MessageFlags.Ephemeral }); }
  const actMatch = interaction.customId.match(/^wb_(attack|skill|selfheal|ult)_\d+$/); if (actMatch) {
    const action = actMatch[1], kind = targetKind(p.class_key, action);
    if (kind) { const targets = actionTargets(id, p, action, kind); if (!targets.length) return interaction.reply({ content: kind === 'dead' ? 'Нет погибших союзников.' : 'Нет доступных целей.', flags: MessageFlags.Ephemeral }); return interaction.reply({ content: 'Выбери цель:', components: [targetMenu(id, action, targets)], flags: MessageFlags.Ephemeral }); }
    const r = await perform(id, uid, action); return interaction.reply({ content: resultText(r), flags: MessageFlags.Ephemeral });
  }
  return false;
}
function resultText(r) { if (r?.ok) return `✅ ${r.text}`; if (r?.reason === 'turn') return '⏳ Сейчас не твой ход.'; if (r?.reason === 'energy') return '🔋 Недостаточно энергии.'; if (r?.reason === 'cooldown') return `🔁 Действие на перезарядке: ещё ${r.cd} ход(а).`; if (r?.reason === 'silenced_skill') return `🔒 Босс запретил способности ещё на ${r.cd} ход(а).`; if (r?.reason === 'silenced_ult') return `⛓️ Босс запретил ульту ещё на ${r.cd} ход(а).`; if (r?.reason === 'class') return 'Эта кнопка доступна только Клирику.'; return 'Событие уже завершено или действие недоступно.'; }
function nextSlotDelay() { const now = Date.now(); for (let d = 0; d < 2; d++) for (const h of SLOTS) { const base = new Date(now + d * 86400000), parts = moscowParts(base), utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), h - 3, 0, 0); if (utc > now + 1000) return utc - now; } return 6 * 3600000; }
function schedulerTick() { const p = moscowParts(), h = Number(p.hour), min = Number(p.minute), key = dateKey(); if (SLOTS.includes(h) && min < 2) { const done = db.prepare('SELECT 1 FROM world_boss_schedule WHERE date_key=? AND slot_hour=?').get(key, h); if (!done) { db.prepare('INSERT INTO world_boss_schedule(date_key,slot_hour,created_at) VALUES(?,?,?)').run(key, h, Date.now()); startRegistration(clientRef).then(r => { if (r.ok) db.prepare('UPDATE world_boss_schedule SET battle_id=? WHERE date_key=? AND slot_hour=?').run(r.id, key, h); }).catch(console.error); } } scheduler = setTimeout(schedulerTick, Math.min(nextSlotDelay(), 60000)); scheduler.unref?.(); }
function startScheduler(client) { init(); clientRef = client; if (scheduler) clearTimeout(scheduler); const a = activeBattle(); if (a) { if (a.status === 'registration') setTimer(a.id, () => beginBattle(a.id).catch(console.error), a.registration_ends_at - Date.now()); else if (a.status === 'class_select') armStageTimer(a.id); else if (a.status === 'active') armTurn(a.id); refresh(a.id).catch(() => {}); } if (AUTO_SCHEDULE_ENABLED) { schedulerTick(); console.log('[WorldBoss] Автозапуск включён: 09:00, 15:00, 21:00 МСК'); } else console.log('[WorldBoss] Тестовый режим: автозапуск отключён, доступен только ручной запуск'); }

module.exports = { startScheduler, startRegistration, resetWorldBoss, handle, isActive: () => Boolean(activeBattle()), beginBattle };
