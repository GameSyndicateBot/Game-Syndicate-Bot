const { EmbedBuilder } = require('discord.js');

function cutText(text, max = 1000) {
    if (!text) return 'Без текста';
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function sendLog(guild, options) {
    try {
        const channel = await guild.channels.fetch(process.env.LOG_CHANNEL_ID);

        if (!channel || typeof channel.send !== 'function') {
            console.log('❌ Канал логов не найден или в него нельзя отправлять сообщения.');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(options.color ?? 0x8B5CF6)
            .setTitle(options.title)
            .setDescription(options.description ?? null)
            .setTimestamp()
            .setFooter({ text: 'Game Syndicate • Логи сервера' });

        if (options.thumbnail) {
            embed.setThumbnail(options.thumbnail);
        }

        if (options.fields?.length) {
            embed.addFields(options.fields);
        }

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Ошибка отправки лога:', error);
    }
}

module.exports = {
    sendLog,
    cutText,
};