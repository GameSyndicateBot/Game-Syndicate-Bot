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
const { buildHeroSnapshot, parseSnapshot, heroName, damageMultiplier, hpMultiplier, resistancePercent, heroSummary, selectedClassBonuses } = require('./heroIntegration');
const { consumeContextBuffs, describeBuffKeys } = require('../../systems/hero/alchemyService');
const GAME_CHANNELS = require('../../config/gameChannels');

const CHANNEL_ID = GAME_CHANNELS.worldBoss;
const AUTO_SCHEDULE_ENABLED = String(process.env.WORLD_BOSS_AUTO_SCHEDULE ?? 'true').toLowerCase() !== 'false';
const REGISTRATION_MS = 10 * 60 * 1000;
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
function resourceMeta(classKey) { const t = resourceType(classKey); return t === 'rage' ? { key:'energy', label:'Ярость', icon:'🔥' } : t === 'mana' ? { key:'mana', label:'Мана', icon:'🔷' } : { key:'energy', label:'Энергия', icon:'⚡' }; }
function skillResourceValue(p) { const m = resourceMeta(p.class_key); return Number(p[m.key] || 0); }
function ultResourceValue(p) { return resourceType(p.class_key) === 'mana' ? Number(p.ult_charge || 0) : Number(p.energy || 0); }
function hpBar(hp, max, size = 16) { const q = max ? Math.round(clamp(hp / max, 0, 1) * size) : 0; return '█'.repeat(q) + '░'.repeat(size - q); }
function clearTimer(id) { const t = timers.get(Number(id)); if (t) clearTimeout(t); timers.delete(Number(id)); }
function setTimer(id, fn, ms) { clearTimer(id); const t = setTimeout(fn, Math.max(500, ms)); t.unref?.(); timers.set(Number(id), t); }
function addLog(b, text) { const s = stateOf(b); s.log = [...(s.log || []), text].slice(-40); saveState(b, s); return s; }

function rolePlan(n) {
  if (n <= 4) return { tank: 1, healer: 1, dps: 2, support: 0 };
  if (n <= 7) { const dps = Math.max(2, Math.ceil(n / 3)); return { tank: 1, healer: 1, dps, support: n - 2 - dps }; }
  const tank = 2, healer = 2, dps = Math.max(3, Math.ceil(n * 0.4));
  return { tank, healer, dps, support: Math.max(0, n - tank - healer - dps) };
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

function scaledHp(base, n) {
  const players = Math.max(4, Number(n || 4));
  const multiplier = Math.min(3.5, 1 + 0.22 * Math.pow(players - 4, 0.85));
  // V17.0.3: небольшой общий запас прочности, чтобы бой не заканчивался слишком быстро.
  return Math.round(base * multiplier * 1.08);
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
    .setDescription(`❤️ **${b.boss_hp}/${b.boss_max_hp} HP**\n${hpBar(b.boss_hp, b.boss_max_hp, 20)}${b.status === 'active' ? `\n🔥 **Ярость: ${Number(state.rage || 0)}/100**\n🛡️ Физ. резист: **${BOSSES.find(x => x.cardId === b.boss_card_id)?.physicalResist || 0}%** • Маг. резист: **${BOSSES.find(x => x.cardId === b.boss_card_id)?.magicResist || 0}%**` : ''}`);
  if (b.status === 'registration') e.addFields({ name: 'Регистрация', value: `До <t:${Math.floor(b.registration_ends_at / 1000)}:R>\nМинимум: **4** • Участников: **${players.length}**` });
  if (b.status === 'class_roll') { const rolled = Object.keys(state.classRolls || {}).length; e.addFields({ name: '🎲 Бросок за выбор класса', value: `Бросили: **${rolled}/${players.length}**\nДо завершения: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}\nНе бросившие выберут классы **последними**.` }); }
  if (b.status === 'class_select') {
    const order = state.classOrder || [], idx = state.classChoiceIndex || 0, who = order[idx];
    e.addFields({ name: '🧙 Выбор классов', value: `Сейчас выбирает: ${who ? playerLabel(players.find(p => p.user_id === who) || { user_id: who }) : '—'}\nДо автовыбора: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}\nОсталось классов: **${(state.availableClasses || []).length}**` });
  }
  if (b.status === 'initiative_roll') e.addFields({ name: '🎲 Инициатива боя', value: `Бросили: **${Object.keys(state.initiativeRolls || {}).length}/${players.length}**\nДо автоброска: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}` });
  if (b.status === 'active') { const turnNo = alive.length ? (b.turn_index % alive.length) + 1 : 0; e.addFields({ name: '▶️ Сейчас ходит', value: `${current ? `<@${current.user_id}> • **${CLASSES[current.class_key]?.name}**` : '—'}\n**Ход ${turnNo} из ${alive.length}** • Раунд **${b.round_no}**\nДо автоатаки: ${b.turn_deadline ? `<t:${Math.floor(b.turn_deadline / 1000)}:R>` : '—'}` }); }
  if (state.minions?.length) e.addFields({ name: '👾 Миньоны босса', value: state.minions.map(m => `${m.name}: ❤️ **${m.hp}/${m.maxHp}**`).join('\n').slice(0, 1024) });
  const sum = summonsText(state); if (sum) e.addFields({ name: '🧙 Тотемы, духи и призывы', value: sum });
  if (['class_select','initiative_roll','active'].includes(b.status)) e.addFields({ name: b.status === 'active' ? '⚔️ Порядок ходов' : 'Команда', value: players.slice(0, 18).map((p, index) => {
    const c = CLASSES[p.class_key], ef = effects(p), sh = Number(ef.shield || 0);
    const aliveIndex = alive.findIndex(x => x.user_id === p.user_id);
    const currentIndex = alive.length ? b.turn_index % alive.length : -1;
    const marker = p.status === 'dead' ? '☠️' : b.status === 'active' ? (aliveIndex < currentIndex ? '✅' : aliveIndex === currentIndex ? '▶️' : '⏳') : roleIcon(c?.role);
    const ult = Math.max(0, Math.min(100, ultResourceValue(p)));
    const ultIcon = ult >= 100 ? '🟣✨' : ult >= 75 ? '🟠✨' : ult >= 25 ? '🟡✨' : '⚫✨';
    return `${marker} **${index + 1}.** ${playerLabel(p)} • ${c?.name || 'класс не выбран'}${b.status === 'active' ? ` • ❤️${p.hp}/${p.max_hp}${sh ? ` • 🛡️${sh}` : ''} • ${resourceMeta(p.class_key).icon}${skillResourceValue(p)} • ${ultIcon}${ult}/100` : ''}`;
  }).join('\n').slice(0, 1024) });
  if (state.finalStats) {
    const fs = state.finalStats;
    const fmt = arr => arr.slice(0, 6).map((p, i) => `${i + 1}. <@${p.user_id}> — ${p.damage_done ?? p.healing_done ?? p.damage_taken}`).join('\n') || '—';
    e.addFields(
      { name: '🏆 Итоги и награды', value: `Общий фонд: **${fs.pool} GS Dust**\nПолучили все участники: **${fs.each}–${fs.each + (fs.remainder > 0 ? 1 : 0)} GS Dust**\nMVP: <@${fs.mvpId}> • **${String(fs.pack).toUpperCase()} Pack**` },
      { name: '💠 Распределение Dust', value: (fs.dustRewards || []).map(r => `<@${r.user_id}> — **+${r.amount}** → ${r.balanceAfter}`).join('\n').slice(0,1024) || '—' },
      { name: '⚔️ Урон', value: fs.damageTop.slice(0,6).map((p,i)=>`${i+1}. <@${p.user_id}> — **${p.damage_done}**`).join('\n').slice(0,1024), inline: true },
      { name: '💚 Лечение', value: fs.healTop.slice(0,6).map((p,i)=>`${i+1}. <@${p.user_id}> — **${p.healing_done}**`).join('\n').slice(0,1024), inline: true },
      { name: '🛡️ Принято урона', value: fs.tankTop.slice(0,6).map((p,i)=>`${i+1}. <@${p.user_id}> — **${p.damage_taken}**`).join('\n').slice(0,1024), inline: true },
      { name: '🤖 Вклад призывов', value: (fs.summonDetails || []).map(st => {
        const reason = Number(st.damage || 0) > 0 ? ''
          : st.support ? ' • поддержка/лечение'
          : Number(st.attacks || 0) === 0
            ? (Number(st.destroyed || 0) > 0 ? ' • уничтожен до атаки' : Number(st.expired || 0) > 0 ? ' • исчез до атаки' : ' • не успел атаковать')
            : Number(st.misses || 0) >= Number(st.attacks || 0) ? ' • все атаки мимо' : ' • урон не прошёл';
        return `${st.icon || '•'} **${st.name}** игрока <@${st.owner}> — ⚔️ **${st.damage || 0}**${st.healing ? ` • 💚 **${st.healing}**` : ''}${st.absorbed ? ` • 🛡️ **${st.absorbed}**` : ''}${reason}`;
      }).join('\n').slice(0,1024) || 'Призывы не участвовали.' },
      { name: '🎖️ Дополнительные MVP', value: (fs.categoryAwards || []).map(a => `${a.type === 'damage' ? '⚔️ Урон' : a.type === 'healing' ? '💚 Лечение' : '🛡️ Защита'}: <@${a.user_id}> — **${a.value}** • ${String(a.pack).toUpperCase()} Pack`).join('\n').slice(0,1024) || '—' },
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
    const boss = pick(BOSSES), now = Date.now();
    const st = { bossCardId: boss.cardId, allowedMinions: [...boss.minions], minions: [], summons: [], rage: 0, lastDestroyRound: -99, lastGroupCurseRound: -99, lastSummonRound: -99, lastCurseRound: -99, bossActionStats: {}, deathStats: { players: 0, bossMinions: 0, playerSummons: 0 }, log: [manual ? '🛠️ Босс вызван вручную.' : '⏰ Босс появился по расписанию.'] };
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
  const s = stateOf(b), user = s.classOrder?.[s.classChoiceIndex], available = s.availableClasses || []; if (!user || !available.length) return; const slotIndex = rand(0, available.length - 1);
  await assignChosenClass(id, user, `${slotIndex}:${available[slotIndex]}`, true);
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
  s.availableClasses.splice(pos, 1); s.classChoiceIndex += 1; s.log.push(`${auto ? '⏱️ Автовыбор:' : '✅'} <@${user}> — ${roleIcon(c.role)} **${c.name}**.`); saveState(b, s);
  const joinedPlayer = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id, user);
  const playerWithClass = {...joinedPlayer,class_key:classKey};
  const classBonus = selectedClassBonuses(playerWithClass);
  const heroMaxHp = Math.round(c.maxHp * hpMultiplier(playerWithClass));
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
function damageTarget(id, target, amount, damageType = 'physical') {
  const e = effects(target); let d = Math.max(0, Math.round(amount * playerResistanceMultiplier(target, damageType)));
  if (e.guardianUltRounds > 0) d = Math.round(d * 0.6); else if (e.guardRounds > 0) d = Math.round(d * 0.5); if (e.rageTurns > 0 || e.bloodRageTurns > 0) d = Math.round(d * 1.25); if (e.partyGuardRounds > 0) d = Math.round(d * Number(e.partyGuardMultiplier || 0.8));
  let shield = Number(e.shield || 0), absorbed = 0; const hadShield = shield > 0;
  if (shield) { absorbed = Math.min(shield, d); shield -= absorbed; d -= absorbed; e.shield = shield; updateEffects(id, target.user_id, e); }
  const hp = Math.max(0, target.hp - d), diedNow = target.status === 'alive' && target.hp > 0 && hp <= 0;
  db.prepare("UPDATE world_boss_players SET hp=?,damage_taken=damage_taken+?,status=CASE WHEN ?<=0 THEN 'dead' ELSE status END WHERE battle_id=? AND user_id=?").run(hp, d, hp, id, target.user_id);
  if (hadShield && shield <= 0 && absorbed > 0) pushCombatEvent(id, `🛡️ Щит <@${target.user_id}> разрушен!`);
  if (diedNow) pushCombatEvent(id, `☠️ <@${target.user_id}> (${CLASSES[target.class_key]?.name || 'Игрок'}) пал!`, 'players');
  if (resourceType(target.class_key) === 'rage' && d > 0) {
    const gained = Math.min(25, Math.max(5, Math.ceil(d / 3)));
    db.prepare('UPDATE world_boss_players SET energy=MIN(100,energy+?) WHERE battle_id=? AND user_id=?').run(gained, id, target.user_id);
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
function hurtEnemy(b, state, amount, damageType = 'physical', sourceClass = null, pierce = 0) {
  if (state.minions?.length) {
    const m = state.minions.find(x => x.hp > 0);
    if (m) {
      const adjusted = Math.max(1, Math.round(amount * resistanceMultiplier(m, damageType, pierce) * holyBonus(m, sourceClass)));
      const dealt = Math.min(adjusted, m.hp); const died = m.hp > 0 && m.hp - adjusted <= 0; m.hp -= adjusted;
      if (died) { state.log = state.log || []; state.log.push(`💀 Миньон босса **${m.name}** уничтожен!`); state.deathStats = state.deathStats || { players: 0, bossMinions: 0, playerSummons: 0 }; state.deathStats.bossMinions = Number(state.deathStats.bossMinions || 0) + 1; }
      state.minions = state.minions.filter(x => x.hp > 0); saveState(b, state);
      return { dealt, target: m.name, minion: true, died };
    }
  }
  const cfg = BOSSES.find(x => x.cardId === b.boss_card_id) || {};
  const vulnerability = Number(state.bossVulnerabilityOwnerTurns || 0) > 0 ? 1 + Number(state.bossVulnerability || 0) : 1;
  const adjusted = Math.max(1, Math.round(amount * resistanceMultiplier(cfg, damageType, pierce) * holyBonus(cfg, sourceClass) * vulnerability));
  const dealt = Math.min(adjusted, b.boss_hp); db.prepare('UPDATE world_boss_battles SET boss_hp=MAX(0,boss_hp-?) WHERE id=?').run(adjusted, b.id);
  state.rage = clamp(Number(state.rage || 0) + Math.min(14, Math.max(2, Math.ceil(dealt / 30))), 0, 100); saveState(b, state);
  return { dealt, target: b.boss_name, minion: false };
}
function applyDamageBuff(p, base) { const e = effects(p); let d = base * damageMultiplier(p); if (p.class_key === 'berserker') { const missing = 1 - (p.hp / Math.max(1, p.max_hp)); d *= 1 + Math.min(0.5, missing * 0.6); } if (e.bloodRageTurns > 0) d *= 2; if (e.rageTurns > 0) d *= 1.4; if (e.damageBuffTurns > 0) d *= 1 + Number(e.damageBuff || 0); if (e.groupDamageRounds > 0) d *= 1 + Number(e.groupDamage || 0); if (e.doubleNext) { d *= 2; e.doubleNext = false; updateEffects(p.battle_id, p.user_id, e); } return Math.round(d); }
function healPlayer(id, healerId, target, amount) { const te = effects(target); const penalty = Number(te.healingPenaltyTurns || 0) > 0 ? clamp(Number(te.healingPenalty || 0.30), 0, 0.8) : 0; const adjusted = Math.max(0, Math.round(Number(amount || 0) * (1 - penalty))); const nh = Math.min(target.max_hp, target.hp + adjusted), actual = nh - target.hp; db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(nh, id, target.user_id); if (actual > 0) db.prepare('UPDATE world_boss_players SET healing_done=healing_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(actual, actual, id, healerId); return actual; }
function validTargets(id, kind) { const ps = battlePlayers(id); return kind === 'dead' ? ps.filter(x => x.status === 'dead') : ps.filter(x => x.status === 'alive'); }
function actionTargets(id, player, action, kind) { let list = validTargets(id, kind); if (player.class_key === 'cleric' && action === 'skill') list = list.filter(x => x.user_id !== player.user_id); return list; }
function targetKind(classKey, action) { if (action === 'skill' && ['paladin','cleric','bard'].includes(classKey)) return 'alive'; if (action === 'ult' && ['cleric'].includes(classKey)) return 'alive'; if (action === 'ult' && classKey === 'priest') return 'dead'; return null; }
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
    const c = CLASSES[freshPlayer.class_key], e = effects(freshPlayer), state = stateOf(b); let text = '';
    const pNow = freshPlayer;
    const rType = resourceType(p.class_key); let energy = Number(p.energy || 0), mana = Number(p.mana || 0), ultCharge = Number(p.ult_charge || 0);
    if (action === 'attack') {
      const miss = auto ? 50 : c.miss; let hit = false;
      if (Math.random() * 100 < miss) text = `💨 <@${userId}> (${c.name}) ${auto ? 'автоатакой ' : ''}промахивается.`;
      else { hit = true; let dmg = applyDamageBuff(p, rand(...c.damage)); const crit = Math.random() * 100 < CRIT_CHANCE; if (crit) dmg = Math.round(dmg * CRIT_MULTIPLIER); const r = hurtEnemy(b, state, dmg, c.damageType || 'physical', p.class_key); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, userId); text = `🗡️ <@${userId}> наносит **${r.dealt}** → ${r.target}${crit ? ' • 💥 КРИТ!' : ''}.`;
        if (p.class_key === 'cleric') { const fresh = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id,userId); const healed = healPlayer(id,userId,fresh,20); text += ` ✨ Свет удара восстанавливает **${healed} HP**.`; }
      }
      if (rType === 'mana') { mana = clamp(mana + 15, 0, 100); ultCharge = clamp(ultCharge + (hit ? 20 : 12), 0, 100); }
      else if (rType === 'rage') energy = clamp(energy + (hit ? 15 : 8), 0, 100);
      else energy = clamp(energy + (hit ? 20 : 15), 0, 100);
    } else if (action === 'skill') {
      if (Number(e.skillSilencedTurns || 0) > 0) return { ok: false, reason: 'silenced_skill', cd: e.skillSilencedTurns };
      if (Number(e.skillCd || 0) > 0) return { ok: false, reason: 'cooldown', cd: e.skillCd };
      const skillPool = rType === 'mana' ? mana : energy; if (skillPool < 40) return { ok: false, reason: rType };
      const kind = targetKind(p.class_key, action); if (kind && !targetId) return { ok: false, reason: 'target', kind };
      if (rType === 'mana') { mana -= 40; ultCharge = clamp(ultCharge + 15, 0, 100); } else energy -= 40;
      text = useSkill(b, p, c, e, state, targetId); e.skillCd = SKILL_CD;
    } else if (action === 'skill2') {
      if (Number(e.skillSilencedTurns || 0) > 0) return { ok: false, reason: 'silenced_skill', cd: e.skillSilencedTurns };
      if (Number(e.skill2Cd || 0) > 0) return { ok: false, reason: 'cooldown', cd: e.skill2Cd };
      const skillPool = rType === 'mana' ? mana : energy;
      if (skillPool < SECOND_SKILL_COST) return { ok: false, reason: rType };
      if (rType === 'mana') { mana -= SECOND_SKILL_COST; ultCharge = clamp(ultCharge + 12, 0, 100); } else energy -= SECOND_SKILL_COST;
      text = useSecondSkill(b, p, c, e, state);
      e.skill2Cd = SECOND_SKILL_CD;
    } else if (action === 'ult') {
      if (Number(e.ultSilencedTurns || 0) > 0) return { ok: false, reason: 'silenced_ult', cd: e.ultSilencedTurns };
      if (Number(e.ultCd || 0) > 0) return { ok: false, reason: 'cooldown', cd: e.ultCd };
      const ultPool = rType === 'mana' ? ultCharge : energy; if (ultPool < 100) return { ok: false, reason: rType === 'mana' ? 'burst' : rType };
      const kind = targetKind(p.class_key, action); if (kind && !targetId) return { ok: false, reason: 'target', kind };
      if (rType === 'mana') ultCharge = 0; else energy = 0;
      text = useUlt(b, p, c, e, state, targetId); e.ultCd = ULT_CD;
    }
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
    await triggerImmediateBossRage(id);
    if (!battlePlayers(id).some(x => x.status === 'alive')) return finish(id, false);

    const keepsTurn = p.class_key === 'berserker' && action === 'ult'; if (keepsTurn) { db.prepare('UPDATE world_boss_battles SET turn_deadline=? WHERE id=?').run(Date.now() + TURN_MS,id); await refresh(id); armTurn(id); } else await nextTurn(id, alive); return { ok: true, text };
  } finally { busy = false; }
}
function targetById(id, targetId, status = 'alive') { return battlePlayers(id).find(x => x.user_id === String(targetId) && x.status === status); }
function useSkill(b, p, c, e, state, targetId) {
  const id = b.id, u = p.user_id;
  switch (p.class_key) {
    case 'warrior': e.interceptRounds = 2; e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2); return `🛡️ <@${u}> перехватывает 70% одиночного урона и провоцирует босса с миньонами на 2 раунда.`;
    case 'paladin': { const t = targetById(id, targetId) || p, te = effects(t); te.shield = Math.max(Number(te.shield || 0), 50); updateEffects(id, t.user_id, te); e.shield = Math.max(Number(e.shield || 0), 25); e.guardRounds = Math.max(Number(e.guardRounds || 0), 1); e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 3); return `✨ <@${u}> накладывает на <@${t.user_id}> щит **50 HP**, сам получает щит **25 HP**, снижает входящий урон на 1 ход и провоцирует босса с миньонами на 3 раунда.`; }
    case 'guardian': e.guardRounds = 2; e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2); e.interceptRounds = Math.max(Number(e.interceptRounds || 0), 2); e.interceptChance = 0.35; return `🛡️ <@${u}> снижает входящий урон на 50%, провоцирует босса на 2 атаки и получает 35% шанс перехватить одиночный удар по союзнику.`;
    case 'cleric': { const t = targetById(id, targetId) || p, sacrifice = Math.min(rand(24, 34), Math.max(0, p.hp - 1)); if (sacrifice <= 0) return `💔 <@${u}> не хватает HP для жертвы.`; db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(p.hp - sacrifice, id, u); const healed = healPlayer(id, u, t, rand(58, 76)); const te = effects(t); const shield = Math.max(1, Math.round(healed * 0.15)); te.shield = Number(te.shield || 0) + shield; updateEffects(id, t.user_id, te); return `💚 <@${u}> жертвует **${sacrifice} HP**, лечит <@${t.user_id}> на **${healed} HP** и даёт щит **${shield} HP**.`; }
    case 'priest': { state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'angel'); state.summons.push({ owner: u, type: 'angel', icon: '👼', name: 'Ангел-хранитель', hp: 75, maxHp: 75, heal: [10, 16], rounds: 4, support: true }); saveState(b, state); return `👼 <@${u}> призывает Ангела-хранителя на 4 хода. В конце каждого раунда ангел лечит всю живую группу.`; }
    case 'bard': { const t = targetById(id, targetId) || p, te = effects(t); te.damageBuffTurns = 3; te.damageBuff = 0.15; updateEffects(id, t.user_id, te); return `🎵 <@${u}> усиливает <@${t.user_id}> на 15% на 3 хода.`; }
    case 'assassin': { const r = hurtEnemy(b, state, rand(75, 95), 'physical', 'assassin', 0.5); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `🗡️ <@${u}> наносит **${r.dealt}** теневого урона.`; }
    case 'archer': { let total = 0; const shots = []; for (let i = 0; i < 3; i++) { if (Math.random() * 100 < c.miss) { shots.push(`Стрела ${i + 1}: ❌ промах`); continue; } const r = hurtEnemy(b, state, rand(30, 38), 'physical', 'archer'); total += r.dealt; shots.push(`Стрела ${i + 1}: 💥 ${r.dealt} → ${r.target}`); } db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total, total, id, u); return `🏹 <@${u}> использует **Три выстрела**:\n${shots.join('\n')}\n**Всего: ${total} урона**.`; }
    case 'mage': { const r = hurtEnemy(b, state, rand(60, 80), 'magic', 'mage'); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `🔥 <@${u}> наносит **${r.dealt}** магического урона.`; }
    case 'berserker': { let total = 0, hits = 0; for (let i = 0; i < 3; i++) { if (Math.random() * 100 < c.miss) continue; const r = hurtEnemy(b, state, Math.round(applyDamageBuff(p, rand(...c.damage)) * 0.62), 'physical', 'berserker'); total += r.dealt; hits++; } db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `🪓 <@${u}> проводит тройной удар: **${hits}/3** попаданий, **${total}** урона.`; }
    case 'engineer': state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'turret'); state.summons.push({ owner: u, type: 'turret', icon: '🔫', name: 'Турель', hp: 80, maxHp: 80, damage: [22, 30], miss: 8, permanent: true, damageType: 'physical' }); saveState(b, state); return `🔧 <@${u}> устанавливает турель. Она остаётся в бою, пока не будет уничтожена или заменена новой.`;
    case 'necromancer': { state.summons = state.summons || []; const own = state.summons.filter(x => x.owner === u && x.type === 'skeleton'); if (own.length >= 2) state.summons.splice(state.summons.indexOf(own[0]), 1); state.summons.push({ owner: u, type: 'skeleton', icon: '💀', name: 'Скелет', hp: 55, maxHp: 55, damage: [18, 25], miss: 12, permanent: true, damageType: 'physical' }); saveState(b, state); return `💀 <@${u}> призывает **1 скелета**. Он остаётся в бою, пока не будет уничтожен или заменён из-за лимита.`; }

    case 'pyromancer': { const r=hurtEnemy(b,state,rand(50,70),'magic','pyromancer'); state.burnStacks=Math.min(5,Number(state.burnStacks||0)+1); saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🔥 <@${u}> наносит **${r.dealt}** урона и накладывает Горение (${state.burnStacks}/5).`; }
    case 'duelist': { const r=hurtEnemy(b,state,rand(55,70),'physical','duelist'); e.combo=Math.min(5,Number(e.combo||0)+1); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `⚔️ <@${u}> делает выпад на **${r.dealt}** урона. Комбо: ${e.combo}/5.`; }
    case 'reaper': { const r=hurtEnemy(b,state,rand(70,90),'physical','reaper'); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `☠️ <@${u}> применяет Жатву: **${r.dealt}** урона.`; }
    case 'mindlord': { const r=hurtEnemy(b,state,rand(60,80),'magic','mindlord'); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🧠 <@${u}> наносит **${r.dealt}** психического урона.`; }
    case 'druid': { const r=hurtEnemy(b,state,rand(45,60),'magic','druid'); state.bossWeakenRounds=2; state.bossWeaken=0.15; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🌿 <@${u}> опутывает босса: **${r.dealt}** урона и -15% урона босса на 2 раунда.`; }
    case 'shaman': state.teamDamageTotemRounds=3; state.teamDamageTotem=0.15; state.summons=(state.summons||[]).filter(x=>x.owner!==u||x.type!=='strength_totem'); state.summons.push({owner:u,type:'strength_totem',icon:'🔥',name:'Тотем силы',hp:60,maxHp:60,rounds:3,support:true}); saveState(b,state); return `🪬 <@${u}> устанавливает Тотем силы на 3 раунда: +15% урона союзников.`;
    case 'chronomancer': { const targets=validTargets(id,'alive').filter(x=>x.user_id!==u); const t=targets[0]||p; if(resourceType(t.class_key)==='mana') db.prepare('UPDATE world_boss_players SET mana=MIN(100,mana+30) WHERE battle_id=? AND user_id=?').run(id,t.user_id); else db.prepare('UPDATE world_boss_players SET energy=MIN(100,energy+30) WHERE battle_id=? AND user_id=?').run(id,t.user_id); return `⏳ <@${u}> ускоряет <@${t.user_id}> и восстанавливает 30 ресурса.`; }
    case 'illusionist': state.summons=(state.summons||[]).filter(x=>x.owner!==u||x.type!=='illusion'); state.summons.push({owner:u,type:'illusion',icon:'🎭',name:'Иллюзия',hp:40,maxHp:40,damage:[0,0],miss:100,rounds:4,support:true}); saveState(b,state); return `🎭 <@${u}> создаёт иллюзию с 40 HP, способную принять атаку.`;
    default: return 'Способность использована.';
  }
}

function useSecondSkill(b, p, c, e, state) {
  const id = b.id, u = p.user_id;
  switch (p.class_key) {
    case 'warrior': {
      for (const t of validTargets(id, 'alive')) {
        const te = effects(t);
        te.groupDamageRounds = Math.max(Number(te.groupDamageRounds || 0), 2);
        te.groupDamage = Math.max(Number(te.groupDamage || 0), 0.10);
        updateEffects(id, t.user_id, te);
      }
      e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 1);
      return `📣 <@${u}> использует Боевой клич: вся группа получает **+10% урона на 2 раунда**, Воин провоцирует врагов.`;
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
      const r = hurtEnemy(b, state, rand(48, 68), 'holy', 'cleric');
      let healed = 0;
      for (const t of validTargets(id, 'alive')) healed += healPlayer(id, u, t, 16);
      db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt + healed, id, u);
      return `🌤️ <@${u}> применяет Карающий свет: **${r.dealt} урона** и **${healed} HP** лечения группе.`;
    }
    case 'priest': {
      let total = 0;
      for (const t of validTargets(id, 'alive')) total += healPlayer(id, u, t, rand(15, 22));
      return `🙏 <@${u}> читает Массовую молитву и восстанавливает группе **${total} HP**.`;
    }
    case 'bard': {
      const r = hurtEnemy(b, state, rand(55, 75), 'magic', 'bard');
      state.bossWeakenRounds = 1;
      state.bossWeaken = 0.12;
      saveState(b, state);
      db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u);
      return `🎻 <@${u}> создаёт Диссонанс: **${r.dealt} магического урона**, следующая атака босса ослаблена на 12%.`;
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
      state.rage = Math.max(0, Number(state.rage || 0) - 25);
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
      const r = hurtEnemy(b, state, rand(58, 82), 'magic', 'necromancer');
      const fresh = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id, u);
      const healed = healPlayer(id, u, fresh, Math.round(r.dealt * 0.5));
      db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt + healed, id, u);
      return `🕯️ <@${u}> применяет Похищение жизни: **${r.dealt} урона** и восстанавливает **${healed} HP**.`;
    }

    case 'pyromancer': { const r=hurtEnemy(b,state,rand(65,85),'magic','pyromancer'); state.burnStacks=Math.min(5,Number(state.burnStacks||0)+1); saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🔥 <@${u}> применяет Пламя: **${r.dealt}** урона, Горение ${state.burnStacks}/5.`; }
    case 'duelist': e.counterAttack=true; return `⚔️ <@${u}> готовит Ответный удар и контратакует первую атаку босса до своего следующего хода.`;
    case 'reaper': { const hp=Math.max(1,p.hp-20); db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(hp,id,u); e.doubleNext=true; return `🩸 <@${u}> платит 20 HP. Следующая атака наносит двойной урон.`; }
    case 'mindlord': { const r=hurtEnemy(b,state,rand(65,75),'magic','mindlord'); state.magicVulnerabilityRounds=2; state.magicVulnerability=0.20; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🧠 <@${u}> наносит **${r.dealt}** урона и повышает получаемый магический урон цели на 20% на 2 раунда.`; }
    case 'druid': { for(const t of validTargets(id,'alive')){const te=effects(t);te.groupDamageRounds=2;te.groupDamage=Math.max(Number(te.groupDamage||0),0.15);te.accuracyBuffRounds=2;te.accuracyBuff=0.15;te.protectionBuffRounds=2;te.protectionBuff=0.15;updateEffects(id,t.user_id,te);} state.summons=(state.summons||[]).filter(x=>x.owner!==u||x.type!=='beast_spirit'); state.summons.push({owner:u,type:'beast_spirit',icon:'🐺',name:'Дух зверя',hp:1,maxHp:1,rounds:2,support:true}); saveState(b,state); return `🐻🐺🦉 <@${u}> призывает Дух зверя на 2 раунда: команда получает усиление урона, точности и защиты.`; }
    case 'shaman': state.teamDefenseTotemRounds=3; state.teamDefenseTotem=0.15; state.summons=(state.summons||[]).filter(x=>x.owner!==u||x.type!=='defense_totem'); state.summons.push({owner:u,type:'defense_totem',icon:'🛡️',name:'Тотем защиты',hp:80,maxHp:80,rounds:3,support:true}); saveState(b,state); return `🛡️ <@${u}> устанавливает Тотем защиты на 3 раунда: -15% входящего урона.`;
    case 'chronomancer': { const targets=validTargets(id,'alive').filter(x=>x.user_id!==u); const t=targets[0]||p,te=effects(t); te.skillCd=Math.max(0,Number(te.skillCd||0)-1); te.skill2Cd=Math.max(0,Number(te.skill2Cd||0)-1); updateEffects(id,t.user_id,te); return `⏪ <@${u}> уменьшает КД способности <@${t.user_id}> на 1 ход.`; }
    case 'illusionist': state.bossAccuracyDownRounds=2; state.bossAccuracyDown=0.20; saveState(b,state); return `🌫️ <@${u}> создаёт Мираж: точность босса снижена на 20% на 2 раунда.`;
    default:
      return 'Вторая способность использована.';
  }
}

function useUlt(b, p, c, e, state, targetId) {
  const id = b.id, u = p.user_id;
  switch (p.class_key) {
    case 'warrior': for (const t of validTargets(id, 'alive')) { const te = effects(t); te.partyGuardRounds = Math.max(Number(te.partyGuardRounds || 0), 2); updateEffects(id, t.user_id, te); } e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2); return `🛡️ <@${u}> поднимает Последний рубеж: вся группа получает -40% урона на 2 хода, одиночные атаки направлены в Воина.`;
    case 'paladin': for (const t of validTargets(id, 'alive')) { const te = effects(t); te.shield = Math.max(Number(te.shield || 0), t.user_id === u ? 60 : 40); updateEffects(id, t.user_id, te); } e.guardRounds = Math.max(Number(e.guardRounds || 0), 2); e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 3); return `✨ <@${u}> накладывает союзникам щиты по **40 HP**, себе **60 HP**, получает -50% входящего урона на 2 хода и провоцирует босса с миньонами на 3 раунда.`;
    case 'guardian': { e.tauntRounds = Math.max(Number(e.tauntRounds || 0), 2); e.guardianUltRounds = Math.max(Number(e.guardianUltRounds || 0), 2); e.interceptRounds = Math.max(Number(e.interceptRounds || 0), 2); for (const t of validTargets(id, 'alive')) { if (t.user_id === u) continue; const te = effects(t); te.partyGuardRounds = Math.max(Number(te.partyGuardRounds || 0), 2); te.partyGuardMultiplier = 0.8; updateEffects(id, t.user_id, te); } return `🛡️ <@${u}> применяет абсолютную провокацию: следующие 2 одиночные атаки направлены в Стража, он получает -40% урона, союзники — -20% урона.`; }
    case 'cleric': { const t = targetById(id, targetId) || p, healed = healPlayer(id, u, t, t.max_hp); return `🌟 <@${u}> полностью исцеляет <@${t.user_id}> на **${healed} HP**.`; }
    case 'priest': { const dead = targetById(id, targetId, 'dead'); if (!dead) return `✨ Нет выбранной погибшей цели.`; db.prepare("UPDATE world_boss_players SET status='alive',hp=ROUND(max_hp*0.5),energy=0,mana=50,ult_charge=0 WHERE battle_id=? AND user_id=?").run(id, dead.user_id); return `✨ <@${u}> воскрешает <@${dead.user_id}>! Игрок возвращается в бой с **${Math.round(dead.max_hp * 0.5)} HP**.`; }
    case 'bard': {
      let totalHealed = 0;
      const healedTargets = [];
      for (const t of validTargets(id, 'alive')) {
        const te = effects(t);
        te.groupDamageRounds = 2;
        te.groupDamage = 0.2;
        updateEffects(id, t.user_id, te);
        const amount = Math.max(1, Math.round(Number(t.max_hp || 0) * 0.20));
        const healed = healPlayer(id, u, t, amount);
        totalHealed += healed;
        if (healed > 0) healedTargets.push(`<@${t.user_id}> +${healed}`);
      }
      return `🎼 <@${u}> исполняет Гимн героев: вся группа получает **+20% урона на 2 раунда** и восстанавливает **20% максимального HP**${totalHealed ? ` — всего **${totalHealed} HP** (${healedTargets.join(', ')})` : ''}.`;
    }
    case 'assassin': { const r = hurtEnemy(b, state, rand(170, 210), 'physical', 'assassin', 1); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `☠️ <@${u}> наносит **${r.dealt}** смертельного урона.`; }
    case 'archer': { const enemies = 1 + (state.minions || []).length; const pool = 240; const share = Math.floor(pool / Math.max(1, enemies)); let total = 0; for (const m of state.minions || []) { const d = Math.min(m.hp, share); const died = m.hp > 0 && m.hp - d <= 0; m.hp -= d; total += d; if (died) { state.log.push(`💀 Миньон босса **${m.name}** уничтожен градом стрел!`); state.deathStats = state.deathStats || { players: 0, bossMinions: 0, playerSummons: 0 }; state.deathStats.bossMinions = Number(state.deathStats.bossMinions || 0) + 1; } } state.minions = (state.minions || []).filter(x => x.hp > 0); const bossDamage = Math.min(b.boss_hp, pool - share * (enemies - 1)); db.prepare('UPDATE world_boss_battles SET boss_hp=MAX(0,boss_hp-?) WHERE id=?').run(bossDamage,id); total += bossDamage; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `🏹 <@${u}> обрушивает град стрел: **${total}** общего урона, распределённого между ${enemies} противниками.`; }
    case 'mage': { const r = hurtEnemy(b, state, rand(160, 210), 'magic', 'mage'); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt, r.dealt, id, u); return `☄️ <@${u}> вызывает метеор: **${r.dealt}** урона.`; }
    case 'berserker': e.bloodRageTurns = 6; return `🔥 <@${u}> входит в Кровавую ярость на 6 своих ходов: двойной исходящий урон и +25% входящего урона.`;
    case 'engineer': state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'golem'); state.summons.push({ owner: u, type: 'golem', icon: '🤖', name: 'Голем', hp: 220, maxHp: 220, damage: [38, 52], miss: 5, permanent: true, damageType: 'physical' }); saveState(b, state); return `🤖 <@${u}> призывает голема. Он остаётся в бою, пока не будет уничтожен или заменён новым.`;
    case 'necromancer': state.summons = (state.summons || []).filter(x => x.owner !== u || x.type !== 'army'); for (let i = 0; i < 4; i++) state.summons.push({ owner: u, type: 'army', icon: '🦴', name: 'Скелет армии', hp: 110, maxHp: 110, damage: [22, 30], miss: 10, rounds: 5, damageType: 'physical' }); saveState(b, state); return `💀 <@${u}> поднимает **4 усиленных скелетов армии** на 5 раундов (по 110 HP).`;

    case 'pyromancer': { const stacks=Number(state.burnStacks||0),r=hurtEnemy(b,state,rand(120,150)+stacks*35,'magic','pyromancer'); state.burnStacks=0; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🔥 <@${u}> выпускает Адское пламя: **${r.dealt}** урона и взрывает ${stacks} стаков Горения.`; }
    case 'duelist': { let total=0; for(let i=0;i<5;i++) total+=hurtEnemy(b,state,rand(40,50),'physical','duelist').dealt; db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u); return `⚔️ <@${u}> проводит Идеальную серию: **${total}** урона.`; }
    case 'reaper': { const fresh=db.prepare('SELECT boss_hp,boss_max_hp FROM world_boss_battles WHERE id=?').get(id); const bonus=fresh.boss_hp/fresh.boss_max_hp<0.3?80:0,r=hurtEnemy(b,state,160+bonus,'physical','reaper'); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `☠️ <@${u}> выносит Приговор: **${r.dealt}** урона${bonus?' с бонусом добивания':''}.`; }
    case 'mindlord': { const r=hurtEnemy(b,state,rand(150,180),'magic','mindlord'); state.rage=Math.max(0,Number(state.rage||0)-50); state.bossAccuracyDownRounds=2; state.bossAccuracyDown=0.20; saveState(b,state); db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u); return `🧠 <@${u}> контролирует сознание: **${r.dealt}** урона, -50 ярости и -20% точности босса на 2 раунда.`; }
    case 'druid': { for(const t of validTargets(id,'alive')){const te=effects(t);te.groupDamageRounds=2;te.groupDamage=Math.max(Number(te.groupDamage||0),0.15);te.accuracyBuffRounds=2;te.accuracyBuff=0.15;te.protectionBuffRounds=2;te.protectionBuff=0.15;updateEffects(id,t.user_id,te);} return `🌳 <@${u}> активирует Силу природы: Медведь, Волк и Сова усиливают всю группу на 2 раунда.`; }
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

    if (summon.support && summon.type === 'angel') {
      let healed = 0;
      for (const target of battlePlayers(b.id).filter(p => p.status === 'alive')) {
        healed += healPlayer(b.id, owner, target, rand(...(summon.heal || [12, 20])));
      }
      const current = healingEntries.get(key) || { owner, name: summon.name, icon: summon.icon || '👼', healing: 0, count: 0 };
      current.healing += healed;
      current.count += 1;
      detail.healing += healed;
      detail.attacks += 1;
      healingEntries.set(key, current);

      state.summonStats[owner] = state.summonStats[owner] || { damage: 0, absorbed: 0, healing: 0 };
      state.summonStats[owner].healing += healed;
      continue;
    }

    let dealt = 0;
    let missed = false;
    if (Math.random() * 100 >= Number(summon.miss || 0)) {
      const r = hurtEnemy(b, state, rand(...summon.damage), summon.damageType || 'physical', ownerPlayer?.class_key || null);
      dealt = r.dealt;
      ownerDamage[owner] = (ownerDamage[owner] || 0) + dealt;

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

async function nextTurn(id, previousAlive = null) {
  const before = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);
  const previous = before ? currentPlayer(before).p : null;
  if (previous) tickOwnerSummons(id, previous.user_id);
  let b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id), alive = battlePlayers(id).filter(x => x.status === 'alive'), ni = b.turn_index + 1;
  if (ni >= alive.length) {
    let roundState = stateOf(b);
    roundState.playerActionsThisRound = 0;
    saveState(b, roundState);
    await summonsAct(b); b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); if (b.boss_hp <= 0) return finish(id, true); await bossTurn(id); b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); alive = battlePlayers(id).filter(x => x.status === 'alive'); if (!alive.length) return finish(id, false); ni = 0; db.prepare('UPDATE world_boss_battles SET round_no=round_no+1 WHERE id=?').run(id); }
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
  state.rage = clamp(Number(state.rage || 0) + 32, 0, 100);

  const hpRatio = b.boss_max_hp ? b.boss_hp / b.boss_max_hp : 1;
  const phase = hpRatio <= 0.25 ? 3 : hpRatio <= 0.5 ? 2 : 1;
  const tauntingTank = players.find(x => CLASSES[x.class_key]?.role === 'tank' && effects(x).tauntRounds > 0);
  const interceptingTank = players.find(x => x.class_key === 'guardian' && effects(x).interceptRounds > 0);
  const tanks = players.filter(x => CLASSES[x.class_key]?.role === 'tank');
  const wounded = players.filter(x => x.hp / Math.max(1, x.max_hp) <= 0.25);
  const chooseSingleTarget = () => {
    if (tauntingTank) return tauntingTank;
    if (interceptingTank && Math.random() < Number(effects(interceptingTank).interceptChance || 0.35)) return interceptingTank;
    if (wounded.length && Math.random() < 0.65) return pick(wounded);
    if (tanks.length && Math.random() < 0.70) return pick(tanks);
    return pick(players);
  };
  const target = chooseSingleTarget();
  const attackDamageType = pickDamageType(boss.attackTypes, 'physical');
  const phaseDamageMultiplier = phase === 3 ? 1.40 : phase === 2 ? 1.20 : 1;
  const bossDamageMultiplier = (Number(state.bossWeakenRounds || 0) > 0 ? 1 - Number(state.bossWeaken || 0) : 1) * phaseDamageMultiplier;
  const effectiveBossMiss = Math.max(0, Number(boss.miss || 0) - (phase === 3 ? 5 : 0));

  const recordAction = action => {
    state.bossActionStats[action] = Number(state.bossActionStats[action] || 0) + 1;
    console.log(`[WorldBoss AI] battle=${id} round=${b.round_no} phase=${phase} action=${action} minions=${state.minions.length} rage=${state.rage}`);
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
      state.minions.push({
        cardId: minionId,
        ownerBossCardId: boss.cardId,
        name: cfg.name,
        hp: cfg.maxHp,
        maxHp: cfg.maxHp,
        damage: cfg.damage,
        miss: cfg.miss,
        damageType: cfg.damageType || 'physical',
        physicalResist: cfg.physicalResist || 0,
        magicResist: cfg.magicResist || 0,
        undead: Boolean(cfg.undead),
        dark: Boolean(cfg.dark),
      });
      summoned.push(`**${cfg.name}** — ❤️ ${cfg.maxHp}`);
    }

    state.lastSummonRound = b.round_no;
    return `👾 **${boss.name}** призывает ${summonCount} ${summonCount === 1 ? 'миньона' : 'миньонов'}: ${summoned.join(', ')}.`;
  };

  let action = '';
  let text = '';

  if (state.rage >= 100) {
    action = 'RAGE_ULT';
    let total = 0;
    const rageType = pickDamageType(boss.attackTypes, attackDamageType);
    for (const p of players) {
      const r = damageTarget(id, p, Math.round(rand(Math.round(boss.damage[0] * 0.99), Math.round(boss.damage[1] * 1.16)) * bossDamageMultiplier), rageType);
      total += r.hpDamage;
    }
    const summonDamage = damagePlayerSummons(state, 1);
    for (const p of battlePlayers(id).filter(x => x.status === 'alive')) { const pe = effects(p); pe.healingPenaltyTurns = Math.max(Number(pe.healingPenaltyTurns || 0), 2); pe.healingPenalty = 0.30; updateEffects(id, p.user_id, pe); }
    state.rage = 0;
    text = `🔥 **${boss.name} впадает в ярость!** Ультимативная массовая атака (${damageTypeLabel(rageType)} урон) наносит группе **${total} HP**${summonDamage ? ` и ${summonDamage} урона призывам` : ''}. 🩸 Лечение снижено на 30% на 2 хода.`;
  } else {
    // Гарантии: в нормальном бою ключевые механики не могут не появиться из-за неудачного RNG.
    const neverSummoned = Number(state.bossActionStats.SUMMON || 0) === 0;
    const neverCursed = Number(state.bossActionStats.SKILL_CURSE || 0) + Number(state.bossActionStats.ULT_CURSE || 0) + Number(state.bossActionStats.GROUP_CURSE || 0) === 0;
    const canSummon = state.minions.length < 3 && (boss.minions || []).length > 0;
    const canGroupCurse = b.round_no - Number(state.lastGroupCurseRound || -99) >= 5;
    const forcedAoeCadence = phase === 3 ? 2 : 3;
    const forceAoe = b.round_no - Number(state.lastForcedAoeRound || -99) >= forcedAoeCadence;

    if (forceAoe) { action = 'AOE'; state.lastForcedAoeRound = b.round_no; }
    else if (canSummon && b.round_no - Number(state.lastSummonRound || -99) >= 3) action = 'SUMMON';
    else if (b.round_no - Number(state.lastCurseRound || -99) >= 3) action = 'SKILL_CURSE';
    else if (neverSummoned && canSummon && b.round_no >= 2) action = 'SUMMON';
    else if (neverCursed && b.round_no >= 3) action = 'SKILL_CURSE';
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
    if (action === 'DESTROY_SUMMON' && (!(state.summons || []).length || b.round_no - Number(state.lastDestroyRound || -99) < 2)) action = 'SPECIAL';
    if (action === 'GROUP_CURSE' && !canGroupCurse) action = 'SKILL_CURSE';

    if (action === 'ATTACK') {
      if (Math.random() * 100 < effectiveBossMiss) text = `💨 ${boss.name} промахивается.`;
      else {
        let damage = Math.round(rand(Math.round(boss.damage[0] * 1.1), Math.round(boss.damage[1] * 1.1)) * bossDamageMultiplier);
        const crit = Math.random() * 100 < BOSS_CRIT_CHANCE;
        if (crit) damage = Math.round(damage * BOSS_CRIT_MULTIPLIER);
        const r = damageTarget(id, target, damage, attackDamageType);
        text = `👹 ${boss.name} атакует <@${target.user_id}>: **${r.hpDamage} HP** (${damageTypeLabel(attackDamageType)})${r.absorbed ? `, щит поглотил ${r.absorbed}` : ''}${crit ? ' • 💥 КРИТ!' : ''}.`;
      }
    } else if (action === 'AOE') {
      let total = 0;
      const aoeType = pickDamageType(boss.attackTypes, attackDamageType);
      for (const p of players) {
        const r = damageTarget(id, p, Math.round(rand(Math.round(boss.damage[0] * 0.66), Math.round(boss.damage[1] * 0.77)) * bossDamageMultiplier), aoeType);
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
      let damage = Math.round(rand(Math.round(boss.damage[1] * 1.25), Math.round(boss.damage[1] * 1.55)) * bossDamageMultiplier);
      const crit = Math.random() * 100 < BOSS_CRIT_CHANCE;
      if (crit) damage = Math.round(damage * BOSS_CRIT_MULTIPLIER);
      const specialType = pickDamageType(boss.attackTypes, attackDamageType);
      const r = damageTarget(id, target, damage, specialType);
      text = `⚡ ${boss.name} применяет особую атаку против <@${target.user_id}>: **${r.hpDamage} HP** (${damageTypeLabel(specialType)})${crit ? ' • 💥 КРИТ!' : ''}.`;
    } else if (action === 'SKILL_CURSE') {
      text = applyBossCurse(id, state, players, 'skill', 2) || `👹 ${boss.name} готовит новую атаку.`;
      state.lastCurseRound = b.round_no;
    } else if (action === 'ULT_CURSE') {
      const candidates = players.filter(p => ultResourceValue(p) >= 70);
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
      const summonText = summon() || `👹 ${boss.name} не смог призвать миньона.`;
      const handTarget = chooseSingleTarget();
      let handText = '';
      if (handTarget && Math.random() * 100 >= effectiveBossMiss) {
        const handType = pickDamageType(boss.attackTypes, attackDamageType);
        const r = damageTarget(id, handTarget, rand(Math.round(boss.damage[0] * 0.85), Math.round(boss.damage[1] * 0.95)), handType);
        handText = ` Затем босс бьёт <@${handTarget.user_id}> с руки на **${r.hpDamage} HP** (${damageTypeLabel(handType)}).`;
      } else handText = ' Затем босс атакует с руки, но промахивается.';
      text = summonText + handText;
    }
  }

  recordAction(action || 'UNKNOWN');
  state.log.push(text);

  for (const m of state.minions) {
    const aliveNow = battlePlayers(id).filter(x => x.status === 'alive');
    if (!aliveNow.length) break;
    const liveTanks = aliveNow.filter(x => CLASSES[x.class_key]?.role === 'tank');
    const forcedTank = aliveNow.find(x => CLASSES[x.class_key]?.role === 'tank' && effects(x).tauntRounds > 0);
    const t = forcedTank || (liveTanks.length && Math.random() < 0.72 ? pick(liveTanks) : pick(aliveNow));
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

  state.log = state.log.slice(-12);
  saveState(b, state);
  for (const p of battlePlayers(id)) {
    const e = effects(p);
    for (const k of ['guardRounds','guardianUltRounds','tauntRounds','interceptRounds','groupDamageRounds','partyGuardRounds','healingPenaltyTurns']) if (e[k] > 0) e[k]--;
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
    const maxDamage = Math.max(1, ...ps.map(p => p.damage_done));
    const maxHeal = Math.max(1, ...ps.map(p => p.healing_done));
    const maxTank = Math.max(1, ...ps.map(p => p.damage_taken));
    const ranked = ps.map(p => ({ ...p, mvpScore: (p.damage_done / maxDamage) * 45 + (p.healing_done / maxHeal) * 30 + (p.damage_taken / maxTank) * 25 })).sort((a,b) => b.mvpScore - a.mvpScore);
    const mvp = ranked[0], pack = mvpPack();
    addPack(mvp.user_id, pack, 1);

    const damageTop = [...ps].sort((a,b) => b.damage_done - a.damage_done);
    const healTop = [...ps].sort((a,b) => b.healing_done - a.healing_done);
    const tankTop = [...ps].sort((a,b) => b.damage_taken - a.damage_taken);
    const categoryAwards = [];

    const awardCategory = (type, player, value) => {
      if (!player || Number(value || 0) <= 0) return;
      const rewardPack = specialistPack();
      addPack(player.user_id, rewardPack, 1);
      categoryAwards.push({ type, user_id: player.user_id, value: Number(value || 0), pack: rewardPack });
    };

    awardCategory('damage', damageTop[0], damageTop[0]?.damage_done);
    awardCategory('healing', healTop[0], healTop[0]?.healing_done);
    awardCategory('tank', tankTop[0], tankTop[0]?.damage_taken);

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
      summonStats,
      summonDetails,
      categoryAwards,
      dustRewards
    };

    const categoryLines = categoryAwards.map(a => {
      const label = a.type === 'damage' ? '⚔️ MVP урона' : a.type === 'healing' ? '💚 MVP лечения' : '🛡️ MVP защиты';
      return `${label}: <@${a.user_id}> — **${a.value}** • 🎁 **${a.pack.toUpperCase()} Pack**`;
    });

    lines = [
      `🏆 Победа! Общая награда: **${pool} GS Dust** — поделена между всей группой.`,
      `💠 Каждый участник получил **${each}–${each + (remainder > 0 ? 1 : 0)} GS Dust**.`,
      `⭐ Общий MVP: <@${mvp.user_id}> • рейтинг **${Math.round(mvp.mvpScore)}**.`,
      `🎁 Общий MVP получает **${pack.toUpperCase()} Pack**.`,
      ...categoryLines,
      `📚 **Опыт классов:**\n${classXpLines.join('\n')}`
    ];
  } else {
    const classXpLines=[];
    for (const p of ps) { const classKey=normalizeClassKey(p.class_key); const classXp=35; const progress=grantClassXp(p.user_id,classKey,classXp,{completed:false}); classXpLines.push(`<@${p.user_id}>: **+${classXp} XP класса** → Lv.${progress?.level||1}`); }
    lines=['💀 Группа потерпела поражение.', `📚 **Опыт за участие:**\n${classXpLines.join('\n')}`];
  }
  b = db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id); const st = stateOf(b); st.finalStats = finalStats;
  const deaths = st.deathStats || { players: ps.filter(p => p.status === 'dead').length, bossMinions: 0, playerSummons: 0 };
  const summary = [`⚔️ **Потери боя:** игроков — **${deaths.players || 0}**, миньонов босса — **${deaths.bossMinions || 0}**, призывов игроков — **${deaths.playerSummons || 0}**.`];
  const banner = win ? [`🏆 **${String(b.boss_name || 'МИРОВОЙ БОСС').toUpperCase()} ПОВЕРЖЕН!**`] : [`💀 **Отряд пал. ${b.boss_name} одерживает победу.**`];
  st.log = [...banner, ...lines, ...summary, ...(st.log || [])].slice(-20); saveState(b, st); await refresh(id); scheduleRegular();
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
    if (interaction.customId.includes('join')) {
      try {
        const expedition = db.prepare("SELECT returns_at FROM hero_expeditions WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(uid);
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
    const available = (s.availableClasses || []).slice(0, 25); const totals = available.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {}); const seen = {};
    const options = available.map((k, index) => {
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
    return interaction.reply({ content: 'Выбери один из оставшихся классов:', components: [menu], flags: MessageFlags.Ephemeral });
  }
  if (interaction.isStringSelectMenu() && interaction.customId === `wb_classpick_${id}`) { const token = interaction.values[0]; const classKey = token.includes(':') ? token.slice(token.indexOf(':') + 1) : token; const r = await assignChosenClass(id, uid, token); if (!r.ok) return interaction.reply({ content: 'Этот класс уже недоступен или сейчас не твоя очередь.', flags: MessageFlags.Ephemeral }); const chosen = db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id, uid); const bonus = selectedClassBonuses(chosen); return interaction.reply({ content: `✅ Выбран класс **${CLASSES[classKey]?.name || classKey}** — Lv.${bonus.level}.\n📚 ${bonus.mastery.title}: ⚔️ +${bonus.mastery.damagePercent}% • ❤️ +${bonus.mastery.hpPercent}% • 🛡️ +${bonus.mastery.resistancePercent}%\n🎒 Экипировка: ⚔️ +${bonus.equipment.damagePercent}% • ❤️ +${bonus.equipment.hpPercent}% • 🛡️ +${bonus.equipment.resistancePercent}%`, flags: MessageFlags.Ephemeral }); }
  if (interaction.customId === `wb_initroll_${id}`) {
    if (b.status !== 'initiative_roll') return interaction.reply({ content: 'Сейчас не этап инициативы.', flags: MessageFlags.Ephemeral }); const s = stateOf(b); if (s.initiativeRolls?.[uid] != null) return interaction.reply({ content: `Ты уже выбросил **${s.initiativeRolls[uid]}**.`, flags: MessageFlags.Ephemeral }); let roll = rand(1,20); s.initiativeRolls[uid] = roll; s.log.push(`⚔️ **${heroName(p)}** · <@${uid}> выбрасывает инициативу **${roll}**.`); saveState(b,s); await interaction.reply({ content:`🎲 Инициатива: **${roll}**`, flags:MessageFlags.Ephemeral }); await refresh(id); if(allHave(s.initiativeRolls,battlePlayers(id))) await startCombat(id); return true;
  }
  if (interaction.customId === `wb_status_${id}`) {
    const c = CLASSES[p.class_key], e = effects(p), file = cardFile(c.cardId, 'class');
    const content = `⚔️ ${heroSummary(p)}\n${roleIcon(c.role)} **${c.name}**
❤️ ${p.hp}/${p.max_hp}${e.shield ? ` • 🛡️ ${e.shield}` : ''}
${resourceMeta(p.class_key).icon} ${resourceMeta(p.class_key).label}: ${skillResourceValue(p)}/100${resourceType(p.class_key) === 'mana' ? `
💥 Заряд ульты: ${p.ult_charge || 0}/100` : ''}
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
    const enemyText = (st.minions || []).length ? st.minions.map(m => `👾 **${m.name}** — ❤️ ${m.hp}/${m.maxHp}`).join('\n') : 'Миньоны босса пока не призваны.';
    return interaction.reply({ content: `## 👹 ${b.boss_name}
❤️ ${b.boss_hp}/${b.boss_max_hp}
🔥 Ярость ${Number(st.rage || 0)}/100

${enemyText}

Может призывать: ${(boss?.minions || []).map(mid => MINIONS[mid]?.name).filter(Boolean).join(', ') || '—'}`, files, flags: MessageFlags.Ephemeral });
  }
  const targetSelect = interaction.customId.match(/^wb_target_(skill|ult)_\d+$/); if (interaction.isStringSelectMenu() && targetSelect) { const r = await perform(id, uid, targetSelect[1], false, interaction.values[0]); return interaction.reply({ content: resultText(r), flags: MessageFlags.Ephemeral }); }
  const actMatch = interaction.customId.match(/^wb_(attack|skill2|skill|ult)_\d+$/); if (actMatch) {
    const action = actMatch[1], kind = targetKind(p.class_key, action);
    if (kind) { const targets = actionTargets(id, p, action, kind); if (!targets.length) return interaction.reply({ content: kind === 'dead' ? 'Нет погибших союзников.' : 'Нет доступных целей.', flags: MessageFlags.Ephemeral }); return interaction.reply({ content: 'Выбери цель:', components: [targetMenu(id, action, targets)], flags: MessageFlags.Ephemeral }); }
    const r = await perform(id, uid, action); return interaction.reply({ content: resultText(r), flags: MessageFlags.Ephemeral });
  }
  return false;
}
function resultText(r) { if (r?.ok) return `✅ ${r.text}`; if (r?.reason === 'turn') return '⏳ Сейчас не твой ход.'; if (r?.reason === 'energy') return '⚡ Недостаточно энергии.'; if (r?.reason === 'rage') return '🔥 Недостаточно ярости.'; if (r?.reason === 'mana') return '🔷 Недостаточно маны.'; if (r?.reason === 'burst') return '💥 Ульта ещё не заряжена.'; if (r?.reason === 'cooldown') return `🔁 Действие на перезарядке: ещё ${r.cd} ход(а).`; if (r?.reason === 'silenced_skill') return `🔒 Босс запретил способности ещё на ${r.cd} ход(а).`; if (r?.reason === 'silenced_ult') return `⛓️ Босс запретил ульту ещё на ${r.cd} ход(а).`; return 'Событие уже завершено или действие недоступно.'; }
function nextSlotDelay() { const now = Date.now(); for (let d = 0; d < 2; d++) for (const h of SLOTS) { const base = new Date(now + d * 86400000), parts = moscowParts(base), utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), h - 3, 0, 0); if (utc > now + 1000) return utc - now; } return 6 * 3600000; }
function schedulerTick() { const p = moscowParts(), h = Number(p.hour), min = Number(p.minute), key = dateKey(); if (SLOTS.includes(h) && min < 2) { const done = db.prepare('SELECT 1 FROM world_boss_schedule WHERE date_key=? AND slot_hour=?').get(key, h); if (!done) { db.prepare('INSERT INTO world_boss_schedule(date_key,slot_hour,created_at) VALUES(?,?,?)').run(key, h, Date.now()); startRegistration(clientRef).then(r => { if (r.ok) db.prepare('UPDATE world_boss_schedule SET battle_id=? WHERE date_key=? AND slot_hour=?').run(r.id, key, h); }).catch(console.error); } } scheduler = setTimeout(schedulerTick, Math.min(nextSlotDelay(), 60000)); scheduler.unref?.(); }
function startScheduler(client) { init(); clientRef = client; if (scheduler) clearTimeout(scheduler); const a = activeBattle(); if (a) { if (a.status === 'registration') setTimer(a.id, () => beginBattle(a.id).catch(console.error), a.registration_ends_at - Date.now()); else if (a.status === 'class_select') armStageTimer(a.id); else if (a.status === 'active') armTurn(a.id); refresh(a.id).catch(() => {}); } if (AUTO_SCHEDULE_ENABLED) { schedulerTick(); console.log('[WorldBoss] Автозапуск включён: 13:00, 20:00 МСК'); } else console.log('[WorldBoss] Тестовый режим: автозапуск отключён, доступен только ручной запуск'); }

module.exports = { startScheduler, startRegistration, resetWorldBoss, handle, isActive: () => Boolean(activeBattle()), beginBattle };
