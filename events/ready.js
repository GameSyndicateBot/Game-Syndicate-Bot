const { startQuickEventScheduler } = require('../systems/quickEventSystem');
const { startLuckyDayScheduler } = require('../services/luckyDay');
const { startAutomaticBackups } = require('../services/automaticBackups');
const { db, getOrCreatePlayer } = require('../database/db');
const {
    isExcludedVoiceChannel,
    startVoiceSession,
    startVoiceTrackingTicker,
} = require('../systems/voiceTrackingSystem');

module.exports = {
    name: 'clientReady',

    async execute(client) {
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

        startVoiceTrackingTicker(client);
        startQuickEventScheduler(client);
        startLuckyDayScheduler(client);
        startAutomaticBackups(client);

        console.log('✅ Участники синхронизированы, голосовые сессии восстановлены');
    },
};
