const { AuditLogEvent } = require('discord.js');
const { sendLog, formatUser } = require('../utils/sendLog');
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
            section: 'Модерация',
            title: 'Пользователь заблокирован',
            thumbnail: ban.user.displayAvatarURL({ size: 256 }),
            color: 0xEF4444,
                        fields: [
                {
                    name: '👤 Пользователь',
                    value: formatUser(ban.user),
                    inline: true,
                },
                {
                    name: '🛡️ Модератор',
                    value: audit?.executor
                        ? formatUser(audit.executor)
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