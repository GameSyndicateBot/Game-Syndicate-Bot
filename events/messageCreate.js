const { handleQuickEventAnswer } = require('../systems/quickEventSystem');
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
    const channelId = process.env.ACHIEVEMENTS_CHANNEL_ID;

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