'use strict';

const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { db, addCardDust, getCardDust } = require('../database/db');
const { openRandomCard, PACK_TYPES } = require('../utils/cardSystem');
const { getServerDisplayName } = require('../utils/displayName');
const { createLuckyDayCard } = require('../images/lucky/createLuckyDayCard');

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;

const REWARDS = [
    { type: 'dust', amount: 150, weight: 55, label: '150 GS Dust' },
    { type: 'dust', amount: 300, weight: 25, label: '300 GS Dust' },
    { type: 'base_pack', amount: 1, weight: 12, label: 'Base Pack' },
    { type: 'dust', amount: 600, weight: 6, label: '600 GS Dust' },
    { type: 'premium_pack', amount: 1, weight: 2, label: 'Premium Pack' },
];

function ensureLuckyDayTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS lucky_day_settings (
            guild_id TEXT PRIMARY KEY,
            channel_id TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS lucky_day_draws (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            draw_date TEXT NOT NULL,
            source_date TEXT NOT NULL,
            status TEXT NOT NULL,
            winner_id TEXT,
            winner_name TEXT,
            reward_type TEXT,
            reward_amount INTEGER DEFAULT 0,
            reward_label TEXT,
            reward_details TEXT,
            participants_count INTEGER DEFAULT 0,
            participants_json TEXT NOT NULL DEFAULT '[]',
            excluded_previous_winner_id TEXT,
            channel_id TEXT,
            message_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(guild_id, draw_date)
        );

        CREATE TABLE IF NOT EXISTS lucky_day_entries (
            guild_id TEXT NOT NULL,
            draw_date TEXT NOT NULL,
            user_id TEXT NOT NULL,
            completed_all INTEGER NOT NULL DEFAULT 1,
            excluded_previous INTEGER NOT NULL DEFAULT 0,
            winner INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(guild_id, draw_date, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_lucky_day_draws_guild_date
        ON lucky_day_draws(guild_id, draw_date DESC);

        CREATE INDEX IF NOT EXISTS idx_lucky_day_entries_user
        ON lucky_day_entries(guild_id, user_id, draw_date DESC);
    `);
}

function moscowDateKey(date = new Date()) {
    return new Date(date.getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

function moscowHour(date = new Date()) {
    return new Date(date.getTime() + MOSCOW_OFFSET_MS).getUTCHours();
}

function previousDateKey(dateKey) {
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
}

function weightedChoice(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of items) {
        roll -= item.weight;
        if (roll <= 0) return item;
    }
    return items.at(-1);
}

function getConfiguredChannelId(guildId) {
    const stored = db.prepare('SELECT channel_id FROM lucky_day_settings WHERE guild_id = ? AND enabled = 1').get(guildId);
    return stored?.channel_id || process.env.LUCKY_DAY_CHANNEL_ID || null;
}

function setConfiguredChannel(guildId, channelId) {
    ensureLuckyDayTables();
    db.prepare(`
        INSERT INTO lucky_day_settings(guild_id, channel_id, enabled, updated_at)
        VALUES(?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id) DO UPDATE SET
            channel_id = excluded.channel_id,
            enabled = 1,
            updated_at = CURRENT_TIMESTAMP
    `).run(guildId, channelId);
}

function getPreviousWinnerId(guildId, beforeDate) {
    const row = db.prepare(`
        SELECT winner_id
        FROM lucky_day_draws
        WHERE guild_id = ?
          AND draw_date < ?
          AND winner_id IS NOT NULL
          AND status = 'completed'
        ORDER BY draw_date DESC, id DESC
        LIMIT 1
    `).get(guildId, beforeDate);
    return row?.winner_id || null;
}

function getCompletedDailyUserIds(sourceDate) {
    return db.prepare(`
        SELECT user_id
        FROM daily_history
        WHERE date = ?
          AND bonus_claimed = 1
          AND total_quests > 0
          AND completed_quests >= total_quests
          AND claimed_quests >= total_quests
        ORDER BY user_id
    `).all(sourceDate).map(row => String(row.user_id));
}

async function resolveParticipants(guild, userIds) {
    const participants = [];
    for (const userId of userIds) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member || member.user.bot) continue;
        participants.push({
            id: member.id,
            name: getServerDisplayName(member, member.user),
            avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }),
        });
    }
    return participants;
}

function grantReward(userId, reward) {
    if (reward.type === 'dust') {
        const balance = addCardDust(userId, reward.amount);
        return { label: reward.label, balance, details: null, drop: null };
    }

    const packId = reward.type === 'premium_pack' ? 'premium' : 'base';
    const pack = PACK_TYPES[packId];
    const drop = openRandomCard(userId, {
        source: `lucky_day_${packId}`,
        allowTreasure: true,
        rarityChances: pack.chances,
    });
    return {
        label: reward.label,
        balance: getCardDust(userId),
        details: `${drop.rarityName} ${drop.card.name} #${String(drop.copyNumber).padStart(6, '0')}`,
        drop,
    };
}

async function publishDraw(guild, draw) {
    const channelId = getConfiguredChannelId(guild.id);
    if (!channelId) {
        console.warn(`[Lucky Day] Канал не настроен для сервера ${guild.name} (${guild.id}). Розыгрыш сохранён без публикации.`);
        return null;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
        console.warn(`[Lucky Day] Канал ${channelId} не найден или не текстовый.`);
        return null;
    }

    const image = await createLuckyDayCard(draw);
    const attachment = new AttachmentBuilder(image, { name: `lucky-day-${draw.drawDate}.png` });
    const content = draw.winner
        ? `🍀 **Lucky Day:** поздравляем <@${draw.winner.id}>!`
        : '🍀 **Lucky Day:** сегодня победителя нет.';
    const message = await channel.send({ content, files: [attachment] });
    return message;
}

async function runLuckyDayForGuild(guild, options = {}) {
    ensureLuckyDayTables();
    const drawDate = options.drawDate || moscowDateKey();
    const sourceDate = options.sourceDate || previousDateKey(drawDate);

    const existing = db.prepare('SELECT * FROM lucky_day_draws WHERE guild_id = ? AND draw_date = ?').get(guild.id, drawDate);
    if (existing && !options.force) return { skipped: true, reason: 'already_run', draw: existing };
    if (existing && options.force) {
        throw new Error('Повторный принудительный запуск за уже разыгранную дату запрещён, чтобы не выдать награду дважды.');
    }

    const completedIds = getCompletedDailyUserIds(sourceDate);
    const allParticipants = await resolveParticipants(guild, completedIds);
    const previousWinnerId = getPreviousWinnerId(guild.id, drawDate);
    const eligible = allParticipants.filter(item => item.id !== previousWinnerId);
    const excluded = previousWinnerId && allParticipants.some(item => item.id === previousWinnerId)
        ? previousWinnerId
        : null;

    const winner = eligible.length
        ? eligible[Math.floor(Math.random() * eligible.length)]
        : null;

    let reward = null;
    let rewardResult = null;
    if (winner) {
        reward = weightedChoice(REWARDS);
        rewardResult = grantReward(winner.id, reward);
    }

    const draw = {
        guildId: guild.id,
        drawDate,
        sourceDate,
        status: winner ? 'completed' : 'no_winner',
        winner,
        reward: winner ? { ...reward, ...rewardResult } : null,
        participants: eligible,
        allCompletedParticipants: allParticipants,
        excludedPreviousWinnerId: excluded,
    };

    const save = db.transaction(() => {
        db.prepare(`
            INSERT INTO lucky_day_draws(
                guild_id, draw_date, source_date, status,
                winner_id, winner_name, reward_type, reward_amount,
                reward_label, reward_details, participants_count,
                participants_json, excluded_previous_winner_id, channel_id
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
            guild.id,
            drawDate,
            sourceDate,
            draw.status,
            winner?.id || null,
            winner?.name || null,
            reward?.type || null,
            reward?.amount || 0,
            rewardResult?.label || null,
            rewardResult?.details || null,
            eligible.length,
            JSON.stringify(eligible),
            excluded,
            getConfiguredChannelId(guild.id)
        );

        const insertEntry = db.prepare(`
            INSERT OR REPLACE INTO lucky_day_entries(
                guild_id, draw_date, user_id, completed_all, excluded_previous, winner
            ) VALUES(?,?,?,?,?,?)
        `);
        for (const participant of allParticipants) {
            insertEntry.run(
                guild.id,
                drawDate,
                participant.id,
                1,
                participant.id === excluded ? 1 : 0,
                participant.id === winner?.id ? 1 : 0
            );
        }
    });
    save();

    const message = await publishDraw(guild, draw).catch(error => {
        console.error('[Lucky Day] Ошибка публикации:', error);
        return null;
    });
    if (message) {
        db.prepare('UPDATE lucky_day_draws SET channel_id = ?, message_id = ? WHERE guild_id = ? AND draw_date = ?')
            .run(message.channelId, message.id, guild.id, drawDate);
    }

    return { skipped: false, draw, message };
}

function getLuckyStats(guildId, userId) {
    ensureLuckyDayTables();
    const latest = db.prepare(`
        SELECT * FROM lucky_day_draws
        WHERE guild_id = ?
        ORDER BY draw_date DESC, id DESC
        LIMIT 1
    `).get(guildId) || null;

    const totals = db.prepare(`
        SELECT
            COUNT(*) AS draws,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_draws,
            SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN winner_id = ? AND reward_type = 'dust' THEN reward_amount ELSE 0 END) AS dust_won,
            SUM(CASE WHEN winner_id = ? AND reward_type LIKE '%pack' THEN 1 ELSE 0 END) AS packs_won
        FROM lucky_day_draws
        WHERE guild_id = ?
    `).get(userId, userId, userId, guildId);

    const participation = db.prepare(`
        SELECT COUNT(*) AS count
        FROM lucky_day_entries
        WHERE guild_id = ? AND user_id = ? AND excluded_previous = 0
    `).get(guildId, userId)?.count || 0;

    const recent = db.prepare(`
        SELECT draw_date, winner_id, winner_name, reward_label, reward_details, participants_count, status
        FROM lucky_day_draws
        WHERE guild_id = ?
        ORDER BY draw_date DESC, id DESC
        LIMIT 8
    `).all(guildId);

    return {
        latest,
        draws: totals?.draws || 0,
        completedDraws: totals?.completed_draws || 0,
        wins: totals?.wins || 0,
        dustWon: totals?.dust_won || 0,
        packsWon: totals?.packs_won || 0,
        participation,
        winRate: participation > 0 ? (Number(totals?.wins || 0) / participation) * 100 : 0,
        recent,
        channelId: getConfiguredChannelId(guildId),
    };
}

function startLuckyDayScheduler(client) {
    ensureLuckyDayTables();
    let running = false;

    const tick = async () => {
        if (running || moscowHour() < 12) return;
        running = true;
        try {
            for (const guild of client.guilds.cache.values()) {
                await runLuckyDayForGuild(guild).catch(error => {
                    console.error(`[Lucky Day] Ошибка розыгрыша для ${guild.name}:`, error);
                });
            }
        } finally {
            running = false;
        }
    };

    tick().catch(console.error);
    const timer = setInterval(() => tick().catch(console.error), CHECK_INTERVAL_MS);
    timer.unref?.();
    console.log('✅ Lucky Day: планировщик запущен, розыгрыш ежедневно в 12:00 МСК');
    return timer;
}

module.exports = {
    REWARDS,
    ensureLuckyDayTables,
    moscowDateKey,
    previousDateKey,
    getConfiguredChannelId,
    setConfiguredChannel,
    runLuckyDayForGuild,
    getLuckyStats,
    startLuckyDayScheduler,
};
