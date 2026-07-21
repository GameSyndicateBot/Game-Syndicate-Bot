const { AuditLogEvent } = require('discord.js');
const { sendLog, formatUser } = require('../utils/sendLog');
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
            section: 'Модерация',
            title: 'Пользователь разблокирован',
            thumbnail: ban.user.displayAvatarURL({ size: 256 }),
            color: 0x22C55E,
                        fields: [
                {
                    name: '👤 Пользователь',
                    value: formatUser(ban.user),
                    inline: true,
                }
                {
                    name: '🛡️ Модератор',
                    value: audit?.executor
                        ? formatUser(audit.executor)
                        : 'Неизвестно',
                    inline: true,
                }
            ],
        });
    }
};