const { AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/sendLog');
const { getAuditExecutor } = require('../utils/getAuditExecutor');

module.exports = {
    name: 'guildBanAdd',

    async execute(ban) {
        const audit = await getAuditExecutor(
            ban.guild,
            AuditLogEvent.MemberBanAdd,
            ban.user.id
        );

        await sendLog(ban.guild, {
            title: '🔨 Пользователь забанен',
            color: 0xEF4444,
            thumbnail: ban.user.displayAvatarURL(),
            fields: [
                {
                    name: '👤 Пользователь',
                    value: `${ban.user}\n\`${ban.user.tag}\``,
                    inline: true,
                },
                {
                    name: '🛡️ Модератор',
                    value: audit?.executor
                        ? `${audit.executor}\n\`${audit.executor.tag}\``
                        : 'Неизвестно',
                    inline: true,
                },
                {
                    name: '📌 Причина',
                    value: audit?.reason || 'Причина не указана',
                    inline: false,
                },
            ],
        });
    },
};