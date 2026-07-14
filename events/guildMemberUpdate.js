const { AuditLogEvent } = require('discord.js');
const { sendLog } = require('../utils/sendLog');
const { getAuditExecutor } = require('../utils/getAuditExecutor');

function formatModerator(audit) {
    return audit?.executor
        ? `${audit.executor}\n\`${audit.executor.tag}\``
        : 'Неизвестно';
}

module.exports = {
    name: 'guildMemberUpdate',

    async execute(oldMember, newMember) {
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;

        const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
        const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

        for (const role of addedRoles.values()) {
            const audit = await getAuditExecutor(
                newMember.guild,
                AuditLogEvent.MemberRoleUpdate,
                newMember.user.id
            );

            await sendLog(newMember.guild, {
                title: '➕ Роль выдана',
                color: 0x22C55E,
                thumbnail: newMember.user.displayAvatarURL(),
                fields: [
                    { name: '👤 Пользователь', value: `${newMember.user}\n\`${newMember.user.tag}\``, inline: true },
                    { name: '🎭 Роль', value: `${role}`, inline: true },
                    { name: '🛡️ Модератор', value: formatModerator(audit), inline: true },
                ],
            });
        }

        for (const role of removedRoles.values()) {
            const audit = await getAuditExecutor(
                newMember.guild,
                AuditLogEvent.MemberRoleUpdate,
                newMember.user.id
            );

            await sendLog(newMember.guild, {
                title: '➖ Роль снята',
                color: 0xEF4444,
                thumbnail: newMember.user.displayAvatarURL(),
                fields: [
                    { name: '👤 Пользователь', value: `${newMember.user}\n\`${newMember.user.tag}\``, inline: true },
                    { name: '🎭 Роль', value: `${role}`, inline: true },
                    { name: '🛡️ Модератор', value: formatModerator(audit), inline: true },
                ],
            });
        }

        const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
        const newTimeout = newMember.communicationDisabledUntilTimestamp;

        if (!oldTimeout && newTimeout) {
            const audit = await getAuditExecutor(
                newMember.guild,
                AuditLogEvent.MemberUpdate,
                newMember.user.id
            );

            await sendLog(newMember.guild, {
                title: '🔇 Пользователю выдан таймаут',
                color: 0xF59E0B,
                thumbnail: newMember.user.displayAvatarURL(),
                fields: [
                    { name: '👤 Пользователь', value: `${newMember.user}\n\`${newMember.user.tag}\``, inline: true },
                    { name: '🛡️ Модератор', value: formatModerator(audit), inline: true },
                    { name: '⏳ До', value: `<t:${Math.floor(newTimeout / 1000)}:F>`, inline: false },
                    { name: '📌 Причина', value: audit?.reason || 'Причина не указана', inline: false },
                ],
            });
        }

        if (oldTimeout && !newTimeout) {
            const audit = await getAuditExecutor(
                newMember.guild,
                AuditLogEvent.MemberUpdate,
                newMember.user.id
            );

            await sendLog(newMember.guild, {
                title: '🔊 Таймаут снят',
                color: 0x22C55E,
                thumbnail: newMember.user.displayAvatarURL(),
                fields: [
                    { name: '👤 Пользователь', value: `${newMember.user}\n\`${newMember.user.tag}\``, inline: true },
                    { name: '🛡️ Модератор', value: formatModerator(audit), inline: true },
                ],
            });
        }

        if (oldTimeout && newTimeout && oldTimeout !== newTimeout) {
            const audit = await getAuditExecutor(
                newMember.guild,
                AuditLogEvent.MemberUpdate,
                newMember.user.id
            );

            await sendLog(newMember.guild, {
                title: '⏱️ Изменён таймаут',
                color: 0x3B82F6,
                thumbnail: newMember.user.displayAvatarURL(),
                fields: [
                    { name: '👤 Пользователь', value: `${newMember.user}\n\`${newMember.user.tag}\``, inline: true },
                    { name: '🛡️ Модератор', value: formatModerator(audit), inline: true },
                    { name: '⏳ Новое окончание', value: `<t:${Math.floor(newTimeout / 1000)}:F>`, inline: false },
                    { name: '📌 Причина', value: audit?.reason || 'Причина не указана', inline: false },
                ],
            });
        }
    },
};