const { AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/sendLog');
const { getAuditExecutor } = require('../utils/getAuditExecutor');

module.exports = {
    name: 'guildBanRemove',

    async execute(ban) {
        const audit = await getAuditExecutor(
            ban.guild,
            AuditLogEvent.MemberBanRemove,
            ban.user.id
        );

        await sendLog(ban.guild, {
            title: '✅ Пользователь разбанен',
            color: 0x22C55E,
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
            ],
        });
    },
};