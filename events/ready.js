const { startQuickEventScheduler } = require('../systems/quickEventSystem');
const { startScheduler: startWorldBossScheduler } = require('../services/worldBoss/worldBossSystem');
const { startLuckyDayScheduler } = require('../services/luckyDay');
const { startAutomaticBackups } = require('../services/automaticBackups');
const { db, getOrCreatePlayer, updatePlayer } = require('../database/db');
const { checkAchievements } = require('../utils/checkAchievements');
const { getJoinDateOverrideEntries } = require('../utils/memberJoinOverrides');
const {
    isExcludedVoiceChannel,
    startVoiceSession,
    startVoiceTrackingTicker,
} = require('../systems/voiceTrackingSystem');

const READY_STATE_KEY = Symbol.for('game-syndicate.client-ready-state');
const readyState = globalThis[READY_STATE_KEY] || (globalThis[READY_STATE_KEY] = {
    running: false,
    completed: false,
});

module.exports = {
    name: 'clientReady',

    async execute(client) {
        if (readyState.running || readyState.completed) {
            console.warn('⚠️ Повторная инициализация clientReady пропущена.');
            return;
        }

        readyState.running = true;

        try {
        // Старые активные сессии нельзя продолжать после перезапуска бота:
        // иначе в топ попадёт всё время, пока бот был выключен.
        db.prepare('DELETE FROM voice_sessions').run();

        for (const guild of client.guilds.cache.values()) {
            const members = await guild.members.fetch().catch(() => guild.members.cache);

            for (const member of members.values()) {
                if (member.user.bot) continue;

                // Добавляем в таблицу players всех реальных участников сервера,
                // даже если они ещё не писали сообщений и не использовали команды.
                getOrCreatePlayer(member.user);

                if (!member.voice?.channelId) continue;
                if (isExcludedVoiceChannel(member.voice.channelId)) continue;

                startVoiceSession(member, member.voice.channelId);
            }
        }

        // Пересчитываем стаж и связанные достижения для участников,
        // которых временно кикали во время тестов. Их реальная дата вступления
        // хранится в memberJoinOverrides.js и не зависит от текущего joinedAt Discord.
        for (const [userId] of getJoinDateOverrideEntries()) {
            for (const guild of client.guilds.cache.values()) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member || member.user.bot) continue;

                let player = getOrCreatePlayer(member.user);
                const result = await checkAchievements({
                    message: {
                        author: member.user,
                        guild,
                    },
                    player,
                    member,
                });

                player = result.player;
                updatePlayer(player);

                if (result.unlockedAchievements.length > 0) {
                    console.log(
                        `[Join date restore] ${member.user.tag} (${userId}): ` +
                        `${result.unlockedAchievements.length} достижений пересчитано.`
                    );
                }
                break;
            }
        }

        startVoiceTrackingTicker(client);
        startQuickEventScheduler(client);
        startWorldBossScheduler(client);
        startLuckyDayScheduler(client);
        startAutomaticBackups(client);

        const { setGameLobbyRuntime } = require('../systems/gameLobbySystem');
        setGameLobbyRuntime(null, client);

        console.log('✅ Участники синхронизированы, голосовые сессии восстановлены');
        readyState.completed = true;
        } finally {
            readyState.running = false;
        }
    },
};
