const { sendLog, cutText } = require('../utils/sendLog');

module.exports = {
    name: 'messageUpdate',

    async execute(oldMessage, newMessage) {
        if (!oldMessage.guild) return;

        const author = oldMessage.author ?? newMessage.author;
        if (!author || author.bot) return;

        const oldContent = oldMessage.content ?? '';
        const newContent = newMessage.content ?? '';

        if (!oldContent && !newContent) return;
        if (oldContent === newContent) return;

        await sendLog(oldMessage.guild, {
            title: '✏️ Сообщение изменено',
            color: 0xF59E0B,
            thumbnail: author.displayAvatarURL(),
            fields: [
                {
                    name: '👤 Автор',
                    value: `${author}\n\`${author.tag}\``,
                    inline: true,
                },
                {
                    name: '📍 Канал',
                    value: `${oldMessage.channel ?? newMessage.channel}`,
                    inline: true,
                },
                {
                    name: '📌 Ссылка',
                    value: newMessage.url
                        ? `[Перейти к сообщению](${newMessage.url})`
                        : 'Ссылка недоступна',
                    inline: false,
                },
                {
                    name: 'До',
                    value: `\`\`\`\n${cutText(oldContent || 'Пусто', 800)}\n\`\`\``,
                    inline: false,
                },
                {
                    name: 'После',
                    value: `\`\`\`\n${cutText(newContent || 'Пусто', 800)}\n\`\`\``,
                    inline: false,
                },
            ],
        });
    },
};