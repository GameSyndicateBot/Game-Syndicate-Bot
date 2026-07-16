const {
    db,
    getOrCreatePlayer,
    updatePlayer,
    incrementPlayerStat,
    updateDailyProgress,
    getOrCreateDailyProgress,
    updateStreak,
} = require('../database/db');

const { addXP } = require('../utils/levelSystem');
const { checkAchievements } = require('../utils/checkAchievements');

const EXCLUDED_VOICE_CHANNEL_IDS = new Set([
    '1522551995444105267', // «Сигарная» / AFK
]);

const TICK_INTERVAL_MS = 60_000;
let ticker = null;
const processingUsers = new Set();

db.prepare(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
        user_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        username TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        xp_remainder_seconds INTEGER DEFAULT 0
    )
`).run();

try {
    db.prepare(`ALTER TABLE voice_sessions ADD COLUMN xp_remainder_seconds INTEGER DEFAULT 0`).run();
} catch (_) {}

function isExcludedVoiceChannel(channelId) {
    return Boolean(channelId && EXCLUDED_VOICE_CHANNEL_IDS.has(channelId));
}

function getVoiceSession(userId) {
    return db.prepare(`SELECT * FROM voice_sessions WHERE user_id = ?`).get(userId);
}

function deleteVoiceSession(userId) {
    db.prepare(`DELETE FROM voice_sessions WHERE user_id = ?`).run(userId);
}

function startVoiceSession(member, channelId, startedAt = Date.now()) {
    if (!member || member.user?.bot || !channelId || isExcludedVoiceChannel(channelId)) {
        if (member?.id) deleteVoiceSession(member.id);
        return;
    }

    getOrCreatePlayer(member.user);

    db.prepare(`
        INSERT OR REPLACE INTO voice_sessions
        (user_id, guild_id, channel_id, username, started_at, xp_remainder_seconds)
        VALUES (?, ?, ?, ?, ?, 0)
    `).run(
        member.id,
        member.guild.id,
        channelId,
        member.displayName || member.user.username,
        startedAt
    );
}

async function settleVoiceSession(member, guild, { close = false } = {}) {
    if (!member?.id || processingUsers.has(member.id)) return 0;

    processingUsers.add(member.id);

    try {
        const session = getVoiceSession(member.id);
        if (!session) return 0;

        const now = Date.now();
        const seconds = Math.max(0, Math.floor((now - Number(session.started_at)) / 1000));

        if (close) {
            deleteVoiceSession(member.id);
        } else if (seconds > 0) {
            // Сохраняем миллисекундный остаток, чтобы секунды не терялись при каждом тике.
            const nextStartedAt = Number(session.started_at) + seconds * 1000;
            db.prepare(`
                UPDATE voice_sessions
                SET started_at = ?, channel_id = ?, username = ?
                WHERE user_id = ?
            `).run(
                nextStartedAt,
                member.voice?.channelId || session.channel_id,
                member.displayName || member.user.username,
                member.id
            );
        }

        if (seconds <= 0) return 0;

        // И ежедневный прогресс, и общий голосовой счётчик увеличиваются
        // атомарно в SQLite. Так параллельный тик, команда /daily или открытие
        // профиля не смогут перезаписать голосовое время старым значением.
        updateDailyProgress(member.id, 'voice_seconds', seconds);

        getOrCreatePlayer(member.user);
        let player = incrementPlayerStat(
            member.id,
            'voice_seconds',
            seconds
        );

        const accumulatedForXp = Number(session.xp_remainder_seconds || 0) + seconds;
        const fullMinutes = Math.floor(accumulatedForXp / 60);
        const xpRemainder = accumulatedForXp % 60;
        const xpReward = fullMinutes * 2;

        if (!close) {
            db.prepare(`
                UPDATE voice_sessions
                SET xp_remainder_seconds = ?
                WHERE user_id = ?
            `).run(xpRemainder, member.id);
        }

        if (xpReward > 0) {
            player = addXP(player, xpReward);
        }

        const progress = getOrCreateDailyProgress(member.id);
        if ((progress.voice_seconds ?? 0) >= 60) {
            updateStreak(member.id, 'voice');
        }

        const result = await checkAchievements({
            message: {
                author: member.user,
                guild,
            },
            player,
            member,
        });

        updatePlayer(result.player);
        return seconds;
    } finally {
        processingUsers.delete(member.id);
    }
}

async function checkpointCurrentMemberVoice(member) {
    if (!member || member.user?.bot) return 0;

    const channelId = member.voice?.channelId;
    if (!channelId || isExcludedVoiceChannel(channelId)) {
        deleteVoiceSession(member.id);
        return 0;
    }

    const session = getVoiceSession(member.id);
    if (!session) {
        startVoiceSession(member, channelId);
        return 0;
    }

    if (session.channel_id !== channelId) {
        await settleVoiceSession(member, member.guild, { close: true });
        startVoiceSession(member, channelId);
        return 0;
    }

    return settleVoiceSession(member, member.guild, { close: false });
}

async function flushActiveVoiceSessions(client) {
    const sessions = db.prepare(`SELECT * FROM voice_sessions`).all();

    for (const session of sessions) {
        const guild = client.guilds.cache.get(session.guild_id);
        if (!guild) {
            deleteVoiceSession(session.user_id);
            continue;
        }

        const member = await guild.members.fetch(session.user_id).catch(() => null);
        const channelId = member?.voice?.channelId;

        if (!member || member.user.bot || !channelId || isExcludedVoiceChannel(channelId)) {
            // Если участник действительно вышел, фиксируем накопленный остаток до удаления.
            if (member && !isExcludedVoiceChannel(session.channel_id)) {
                await settleVoiceSession(member, guild, { close: true }).catch(console.error);
            } else {
                deleteVoiceSession(session.user_id);
            }
            continue;
        }

        if (channelId !== session.channel_id) {
            await settleVoiceSession(member, guild, { close: true }).catch(console.error);
            startVoiceSession(member, channelId);
            continue;
        }

        await settleVoiceSession(member, guild, { close: false }).catch(console.error);
    }
}

function startVoiceTrackingTicker(client) {
    if (ticker) clearInterval(ticker);

    ticker = setInterval(() => {
        flushActiveVoiceSessions(client).catch(error => {
            console.error('❌ Ошибка периодического начисления голосового времени:', error);
        });
    }, TICK_INTERVAL_MS);

    ticker.unref?.();
    console.log('✅ Голосовое время начисляется непрерывно раз в минуту');
}

module.exports = {
    EXCLUDED_VOICE_CHANNEL_IDS,
    isExcludedVoiceChannel,
    getVoiceSession,
    deleteVoiceSession,
    startVoiceSession,
    settleVoiceSession,
    checkpointCurrentMemberVoice,
    flushActiveVoiceSessions,
    startVoiceTrackingTicker,
};
