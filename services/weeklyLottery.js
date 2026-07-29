const { db, getCardDust, removeCardDust, addCardDust } = require('../database/db');

const BASE_POOL = 3000;
const TICKET_PRICE = 100;
const CHECK_MS = 60_000;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS weekly_lottery_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      base_pool INTEGER NOT NULL DEFAULT 3000,
      prize_pool INTEGER NOT NULL DEFAULT 3000,
      draw_at INTEGER NOT NULL,
      winner_user_id TEXT,
      winner_display_name TEXT,
      winning_ticket INTEGER,
      participant_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_lottery_open_guild
      ON weekly_lottery_rounds(guild_id) WHERE status='open';
    CREATE TABLE IF NOT EXISTS weekly_lottery_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      ticket_number INTEGER NOT NULL,
      purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(round_id, user_id),
      UNIQUE(round_id, ticket_number)
    );
    CREATE INDEX IF NOT EXISTS idx_weekly_lottery_tickets_round ON weekly_lottery_tickets(round_id, ticket_number);
  `);
}

function nextSaturday21Msk(now = Date.now()) {
  const msk = new Date(now + MSK_OFFSET_MS);
  const day = msk.getUTCDay();
  let add = (6 - day + 7) % 7;
  const todayTarget = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate(), 21, 0, 0, 0);
  const currentMskEpoch = now + MSK_OFFSET_MS;
  if (add === 0 && currentMskEpoch >= todayTarget) add = 7;
  const targetMskEpoch = todayTarget + add * 86400000;
  return targetMskEpoch - MSK_OFFSET_MS;
}

function getOpenRound(guildId) {
  ensureTables();
  let round = db.prepare("SELECT * FROM weekly_lottery_rounds WHERE guild_id=? AND status='open' ORDER BY id DESC LIMIT 1").get(String(guildId));
  if (!round) {
    const info = db.prepare(`INSERT INTO weekly_lottery_rounds(guild_id,status,base_pool,prize_pool,draw_at) VALUES(?,'open',?,?,?)`)
      .run(String(guildId), BASE_POOL, BASE_POOL, nextSaturday21Msk());
    round = db.prepare('SELECT * FROM weekly_lottery_rounds WHERE id=?').get(info.lastInsertRowid);
  }
  return round;
}

function getRoundView(guildId, userId) {
  const round = getOpenRound(guildId);
  const tickets = db.prepare('SELECT * FROM weekly_lottery_tickets WHERE round_id=? ORDER BY ticket_number ASC').all(round.id);
  const own = tickets.find(t => String(t.user_id) === String(userId)) || null;
  return { round, tickets, own, balance: getCardDust(String(userId)) };
}

function buyTicket({ guildId, userId, displayName }) {
  ensureTables();
  return db.transaction(() => {
    const round = getOpenRound(guildId);
    if (Date.now() >= Number(round.draw_at)) return { ok:false, reason:'drawing' };
    const existing = db.prepare('SELECT * FROM weekly_lottery_tickets WHERE round_id=? AND user_id=?').get(round.id, String(userId));
    if (existing) return { ok:false, reason:'already', ticket:existing };
    const paid = removeCardDust(String(userId), TICKET_PRICE, 'Покупка билета еженедельной лотереи');
    if (!paid.ok) return { ok:false, reason:'dust', balance:paid.balance };
    const ticketNumber = Number(db.prepare('SELECT COALESCE(MAX(ticket_number),0)+1 AS n FROM weekly_lottery_tickets WHERE round_id=?').get(round.id).n);
    db.prepare('INSERT INTO weekly_lottery_tickets(round_id,guild_id,user_id,display_name,ticket_number) VALUES(?,?,?,?,?)')
      .run(round.id, String(guildId), String(userId), String(displayName || 'Участник').slice(0,80), ticketNumber);
    db.prepare('UPDATE weekly_lottery_rounds SET prize_pool=prize_pool+?, participant_count=participant_count+1 WHERE id=?').run(TICKET_PRICE, round.id);
    const updated = db.prepare('SELECT * FROM weekly_lottery_rounds WHERE id=?').get(round.id);
    return { ok:true, round:updated, ticketNumber, balance:paid.balance };
  })();
}

function history(guildId, limit=10) {
  ensureTables();
  return db.prepare(`SELECT * FROM weekly_lottery_rounds WHERE guild_id=? AND status='closed' AND winner_user_id IS NOT NULL ORDER BY closed_at DESC,id DESC LIMIT ?`).all(String(guildId), Number(limit));
}

async function announceResult(client, guild, result) {
  const channelId = (() => { try { return require('./luckyDay').getConfiguredChannelId(guild.id); } catch { return null; } })();
  const channel = (channelId && guild.channels.cache.get(channelId)) || guild.systemChannel || guild.channels.cache.find(c => c.isTextBased?.() && c.viewable);
  if (!channel?.isTextBased?.()) return;
  if (!result.winner) {
    await channel.send('🎟️ **Еженедельная лотерея:** на этой неделе никто не приобрёл билет. Открыта новая лотерея с фондом **3000 Пыли**.').catch(()=>{});
    return;
  }
  await channel.send({content:[
    '🎰 **РОЗЫГРЫШ ЕЖЕНЕДЕЛЬНОЙ ЛОТЕРЕИ GAME SYNDICATE**',
    '',
    `🏆 Победный билет: **№${result.winner.ticket_number}**`,
    `👑 Победитель: <@${result.winner.user_id}>`,
    `💎 Выигрыш: **${result.prizePool} Пыли**`,
    '',
    'Приз уже зачислен. Новая лотерея открыта — следующий розыгрыш в субботу в **21:00 МСК**.'
  ].join('\n')}).catch(()=>{});
}

async function drawGuild(client, guild) {
  const round = getOpenRound(guild.id);
  if (Date.now() < Number(round.draw_at)) return null;
  const result = db.transaction(() => {
    const current = db.prepare("SELECT * FROM weekly_lottery_rounds WHERE id=? AND status='open'").get(round.id);
    if (!current) return null;
    const tickets = db.prepare('SELECT * FROM weekly_lottery_tickets WHERE round_id=? ORDER BY ticket_number').all(current.id);
    const winner = tickets.length ? tickets[Math.floor(Math.random()*tickets.length)] : null;
    if (winner) addCardDust(winner.user_id, current.prize_pool, 'Выигрыш в еженедельной лотерее');
    db.prepare(`UPDATE weekly_lottery_rounds SET status='closed',winner_user_id=?,winner_display_name=?,winning_ticket=?,participant_count=?,closed_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(winner?.user_id || null, winner?.display_name || null, winner?.ticket_number || null, tickets.length, current.id);
    db.prepare(`INSERT INTO weekly_lottery_rounds(guild_id,status,base_pool,prize_pool,draw_at) VALUES(?,'open',?,?,?)`)
      .run(String(guild.id), BASE_POOL, BASE_POOL, nextSaturday21Msk(Date.now()+1000));
    return { winner, prizePool:Number(current.prize_pool), participants:tickets.length };
  })();
  if (result) await announceResult(client, guild, result);
  return result;
}

function startScheduler(client) {
  ensureTables();
  let busy=false;
  const tick=async()=>{ if(busy)return; busy=true; try { for(const guild of client.guilds.cache.values()) await drawGuild(client,guild).catch(e=>console.error('[Lottery draw]',e)); } finally { busy=false; } };
  setTimeout(()=>tick().catch(console.error),5000);
  const timer=setInterval(()=>tick().catch(console.error),CHECK_MS); timer.unref?.();
  console.log('🎟️ Weekly Lottery scheduler started: Saturday 21:00 MSK');
  return timer;
}

module.exports={BASE_POOL,TICKET_PRICE,ensureTables,getOpenRound,getRoundView,buyTicket,history,drawGuild,startScheduler,nextSaturday21Msk};
