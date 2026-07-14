const { sendLog, cutText } = require('../utils/sendLog');

module.exports = {
    name: 'messageDelete',

    async execute(message) {
        if (!message.guild) return;

        const author = message.author;

        if (author?.bot) return;

        await sendLog(message.guild, {
            title: '🗑️ Сообщение удалено',
            color: 0xEF4444,
            thumbnail: author ? author.displayAvatarURL() : null,
            fields: [
                {
                    name: '👤 Автор',
                    value: author
                        ? `${author}\n\`${author.tag}\``
                        : 'Неизвестно',
                    inline: true,
                },
                {
                    name: '📍 Канал',
                    value: `${message.channel}`,
                    inline: true,
                },
                {
                    name: '📝 Содержимое',
                    value: `\`\`\`\n${cutText(message.content, 900)}\n\`\`\``,
                    inline: false,
                },
            ],
        });
    },
};