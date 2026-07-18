const { handleQuickEventAnswer } = require('../systems/quickEventSystem');
const { getGuildSetting } = require('../utils/guildSettings');
const {
    AttachmentBuilder,
} = require('discord.js');

const {
    getOrCreatePlayer,
    updatePlayer,
    incrementPlayerStat,
    updateDailyProgress,
    updateStreak,
} = require('../database/db');

const { addXP } = require('../utils/levelSystem');
const { checkAchievements } = require('../utils/checkAchievements');
const { createLevelCard } = require('../images/level/createLevelCard');

async function sendLevelUpMessage(message, player, level) {
    // Защита от повторной отправки одного и того же апа уровня
    const { db } = require('../database/db');

    db.exec(`
        CREATE TABLE IF NOT EXISTS level_up_notifications (
            user_id TEXT NOT NULL,
            level INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY(user_id, level)
        )
    `);

    const exists = db.prepare(`
        SELECT 1 FROM level_up_notifications
        WHERE user_id = ? AND level = ?
    `).get(message.author.id, level);

    if (exists) {
        console.log(`ℹ️ Повторный level up пропущен: ${message.author.id} lvl ${level}`);
        return;
    }

    db.prepare(`
        INSERT INTO level_up_notifications(user_id, level, created_at)
        VALUES (?, ?, ?)
    `).run(message.author.id, level, Date.now());

    const channelId = getGuildSetting(message.guild.id, 'achievements_channel_id', process.env.ACHIEVEMENTS_CHANNEL_ID);

    const channel = channelId
        ? await message.guild.channels.fetch(channelId).catch(() => null)
        : null;

    const targetChannel =
        channel && typeof channel.send === 'function'
            ? channel
            : message.channel;

    const card = await createLevelCard(message.author, player, level);

    const attachment = new AttachmentBuilder(card, {
        name: 'level-up.png',
    });

    await targetChannel.send({
        content:
`# ⭐ Новый уровень!

Поздравляем ${message.author}!
Получен **${level} уровень**! 🎉`,
        files: [attachment],
    });
}

module.exports = {
    name: 'messageCreate',

    async execute(message) {
        if (!message.guild) return;
        if (message.author.bot) return;

        await handleQuickEventAnswer(message);

        getOrCreatePlayer(message.author);
        incrementPlayerStat(message.author.id, 'messages', 1);

        const member = await message.guild.members
            .fetch(message.author.id)
            .catch(() => message.member);

        let player = getOrCreatePlayer(message.author);

        updateDailyProgress(message.author.id, 'messages', 1);
        updateStreak(message.author.id, 'chat');

        const levelBefore = player.level;

        player = addXP(player, 10);

        const result = await checkAchievements({
            message,
            player,
            member,
        });

        player = result.player;

        updatePlayer(player);

        if (player.level > levelBefore) {
            updateStreak(message.author.id, 'level_up');
            await sendLevelUpMessage(message, player, player.level);
        }
    },
};