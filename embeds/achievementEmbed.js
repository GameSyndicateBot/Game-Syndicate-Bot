const { EmbedBuilder } = require('discord.js');

function createAchievementEmbed(user, achievement) {
    return new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setAuthor({
            name: '🏆 Новое достижение!',
        })
        .setThumbnail(user.displayAvatarURL())
        .setTitle(`🥇 ${achievement.title}`)
        .setDescription(achievement.description)
        .addFields(
            { name: '⭐ Награда', value: `+${achievement.xp} XP`, inline: true }
            { name: '👤 Игрок', value: `${user}`, inline: true }
            { name: '💎 Редкость', value: 'Обычная', inline: true }
        )
        .setFooter({
            text: 'Game Syndicate • Система достижений',
        })
        .setTimestamp();
}

module.exports = {
    createAchievementEmbed,
};