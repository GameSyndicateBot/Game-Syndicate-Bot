const path = require('path');
const { AuditLogEvent, AttachmentBuilder } = require('discord.js');
const { sendLog, formatUser } = require('../utils/sendLog');
const { getAuditExecutor } = require('../utils/getAuditExecutor');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member) {
        await new Promise(resolve => setTimeout(resolve, 800));

        const audit = await getAuditExecutor(
            member.guild,
            AuditLogEvent.MemberKick,
            member.id,
        );
        const kicked = Boolean(audit?.executor);

        const farewellPath = path.join(
            __dirname,
            '..',
            'assets',
            'leave',
            'gs-farewell.png',
        );

        await sendLog(member.guild, {
            section: kicked ? 'Модерация' : 'Участники',
            title: kicked ? 'Участник исключён' : 'Участник вышел',
            description: kicked
                ? undefined
                : `🚪 ${member.user.bot ? 'Бот' : 'Участник'} покинул Game Syndicate.\n\n**Твой выбор — твои потери. Игра продолжается.**`,
            color: kicked ? 0xEF4444 : 0x8B5CF6,
            thumbnail: member.user.displayAvatarURL({ size: 256 }),
            image: kicked ? undefined : 'attachment://gs-farewell.png',
            files: kicked
                ? []
                : [new AttachmentBuilder(farewellPath, { name: 'gs-farewell.png' })],
            fields: [
                {
                    name: member.user.bot ? 'Бот' : 'Участник',
                    value: formatUser(member.user),
                    inline: false,
                }
                {
                    name: 'На сервере с',
                    value: member.joinedTimestamp
                        ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
                        : 'Неизвестно',
                    inline: true,
                }
                {
                    name: 'Ролей',
                    value: String(Math.max(0, member.roles.cache.size - 1)),
                    inline: true,
                }
                ...(kicked
                    ? [
                        {
                            name: 'Модератор',
                            value: formatUser(audit.executor),
                            inline: false,
                        }
                        {
                            name: 'Причина',
                            value: audit.reason || 'Не указана',
                            inline: false,
                        }
                    ]
                    : []),
            ],
        });
    }
};
