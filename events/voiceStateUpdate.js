const { sendLog } = require('../utils/sendLog');

const {
    db,
    getOrCreatePlayer,
    updatePlayer,
    updateDailyProgress,
    updateStreak,
} = require('../database/db');

const { addXP } = require('../utils/levelSystem');
const { checkAchievements } = require('../utils/checkAchievements');

const voiceTracker = require('../systems/voiceTrackingSystem');

// AFK-канал «Сигарная»: время в нём не идёт в голосовую статистику.
function isExcludedVoiceChannel(channelId) {
    return voiceTracker.isExcludedVoiceChannel(channelId);
}


function getActiveGameEvent() {
    return db.prepare(`
        SELECT *
        FROM game_events
        WHERE status = 'started'
        ORDER BY id DESC
        LIMIT 1
    `).get();
}

function startVoiceSession(member, channelId) {
    return voiceTracker.startVoiceSession(member, channelId);
}

function getVoiceSession(userId) {
    return voiceTracker.getVoiceSession(userId);
}

function deleteVoiceSession(userId) {
    return voiceTracker.deleteVoiceSession(userId);
}

async function finishVoiceSession(member, guild) {
    return voiceTracker.settleVoiceSession(member, guild, { close: true });
}

function startEventParticipantSession(event, member) {
    db.prepare(`
        INSERT OR IGNORE INTO game_event_participants
        (event_id, user_id, username, joined_at)
        VALUES (?, ?, ?, ?)
    `).run(
        event.id,
        member.user.id,
        member.user.username,
        Date.now()
    );

    db.prepare(`
        UPDATE game_event_participants
        SET username = ?,
            joined_at = ?
        WHERE event_id = ?
        AND user_id = ?
        AND joined_at IS NULL
    `).run(
        member.user.username,
        Date.now(),
        event.id,
        member.user.id
    );
}

function finishEventParticipantSession(event, member) {
    const participant = db.prepare(`
        SELECT *
        FROM game_event_participants
        WHERE event_id = ?
        AND user_id = ?
    `).get(event.id, member.user.id);

    if (!participant || !participant.joined_at) return;

    const seconds = Math.floor((Date.now() - participant.joined_at) / 1000);

    if (seconds <= 0) return;

    db.prepare(`
        UPDATE game_event_participants
        SET total_seconds = total_seconds + ?,
            joined_at = NULL,
            username = ?
        WHERE event_id = ?
        AND user_id = ?
    `).run(
        seconds,
        member.user.username,
        event.id,
        member.user.id
    );
}

async function logVoiceJoin(state, user) {
    await sendLog(state.guild, {
        title: '🎙️ Участник подключился к голосовому каналу',
        color: 0x22C55E,
        thumbnail: user.displayAvatarURL(),
        fields: [
            {
                name: '👤 Пользователь',
                value: `${user}\n\`${user.tag}\``,
                inline: true,
            },
            {
                name: '🔊 Канал',
                value: `${state.channel}`,
                inline: true,
            },
        ],
    });
}

async function logVoiceLeave(state, user) {
    await sendLog(state.guild, {
        title: '🔇 Участник отключился от голосового канала',
        color: 0xEF4444,
        thumbnail: user.displayAvatarURL(),
        fields: [
            {
                name: '👤 Пользователь',
                value: `${user}\n\`${user.tag}\``,
                inline: true,
            },
            {
                name: '🔊 Канал',
                value: `${state.channel}`,
                inline: true,
            },
        ],
    });
}

async function logVoiceMove(oldState, newState, user) {
    await sendLog(newState.guild, {
        title: '🔁 Участник сменил голосовой канал',
        color: 0x3B82F6,
        thumbnail: user.displayAvatarURL(),
        fields: [
            {
                name: '👤 Пользователь',
                value: `${user}\n\`${user.tag}\``,
                inline: true,
            },
            {
                name: 'Было',
                value: `${oldState.channel}`,
                inline: true,
            },
            {
                name: 'Стало',
                value: `${newState.channel}`,
                inline: true,
            },
        ],
    });
}

module.exports = {
    name: 'voiceStateUpdate',

    async execute(oldState, newState) {
        const member = newState.member || oldState.member;
        const user = member?.user;

        if (!member || !user || user.bot) return;

        const wasInVoice = Boolean(oldState.channelId);
        const isInVoice = Boolean(newState.channelId);
        const wasCountedVoice = wasInVoice && !isExcludedVoiceChannel(oldState.channelId);
        const isCountedVoice = isInVoice && !isExcludedVoiceChannel(newState.channelId);
        const activeEvent = getActiveGameEvent();

        if (!wasInVoice && isInVoice) {
            if (isCountedVoice) {
                startVoiceSession(member, newState.channelId);
            } else {
                // На случай старой незакрытой сессии не позволяем AFK-каналу
                // продолжать начислять голосовое время.
                deleteVoiceSession(member.user.id);
            }

            if (
                activeEvent &&
                newState.channelId === activeEvent.voice_channel_id
            ) {
                startEventParticipantSession(activeEvent, member);
            }

            await logVoiceJoin(newState, user);
            return;
        }

        if (wasInVoice && !isInVoice) {
            if (
                activeEvent &&
                oldState.channelId === activeEvent.voice_channel_id
            ) {
                finishEventParticipantSession(activeEvent, member);
            }

            if (wasCountedVoice) {
                await finishVoiceSession(member, oldState.guild);
            } else {
                deleteVoiceSession(member.user.id);
            }

            await logVoiceLeave(oldState, user);
            return;
        }

        if (
            wasInVoice &&
            isInVoice &&
            oldState.channelId !== newState.channelId
        ) {
            // Обычный канал -> «Сигарная»: закрываем учитываемую сессию.
            // «Сигарная» -> обычный канал: начинаем новую сессию с нуля.
            // Между обычными каналами: закрываем старую и начинаем новую.
            if (wasCountedVoice) {
                await finishVoiceSession(member, oldState.guild);
            } else {
                deleteVoiceSession(member.user.id);
            }

            if (isCountedVoice) {
                startVoiceSession(member, newState.channelId);
            }

            if (
                activeEvent &&
                oldState.channelId === activeEvent.voice_channel_id
            ) {
                finishEventParticipantSession(activeEvent, member);
            }

            if (
                activeEvent &&
                newState.channelId === activeEvent.voice_channel_id
            ) {
                startEventParticipantSession(activeEvent, member);
            }

            await logVoiceMove(oldState, newState, user);
        }
    },
};