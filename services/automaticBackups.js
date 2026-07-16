const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { databasePath } = require('../database/db');
const { backupDatabase } = require('../utils/backupDatabase');

const DEFAULT_INTERVAL_MINUTES = 360;
const DEFAULT_DISCORD_RETENTION = 30;

let intervalHandle = null;
let backupInProgress = false;
let activeClient = null;

console.log('✅ SCHEDULED_BACKUP_SYSTEM_V5 loaded');

function readPositiveInteger(name, fallback, minimum = 1) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= minimum ? value : fallback;
}

function getIntervalMs() {
    return readPositiveInteger(
        'BACKUP_INTERVAL_MINUTES',
        DEFAULT_INTERVAL_MINUTES,
        15
    ) * 60_000;
}

function getDiscordRetention() {
    return readPositiveInteger(
        'DISCORD_BACKUP_RETENTION',
        DEFAULT_DISCORD_RETENTION,
        1
    );
}

async function cleanupDiscordBackups(channel) {
    const keep = getDiscordRetention();

    try {
        const messages = await channel.messages.fetch({ limit: 100 });

        const backups = [...messages.values()]
            .filter(message => {
                if (message.author.id !== channel.client.user.id) return false;

                return [...message.attachments.values()].some(attachment =>
                    /^database-backup-.*\.sqlite$/i.test(attachment.name || '')
                );
            })
            .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

        const obsolete = backups.slice(keep);

        for (const message of obsolete) {
            await message.delete().catch(error => {
                console.warn(
                    `⚠️ Не удалось удалить Discord-бэкап ${message.id}:`,
                    error.message
                );
            });
        }

        if (obsolete.length > 0) {
            console.log(
                `🧹 Удалено старых Discord-бэкапов: ${obsolete.length}. ` +
                `Оставлено: ${keep}.`
            );
        }
    } catch (error) {
        console.warn(
            '⚠️ Очистка Discord-бэкапов не выполнена:',
            error.message
        );
    }
}

async function uploadBackupToDiscord(client, backupPath, reason) {
    const channelId = String(
        process.env.BACKUP_CHANNEL_ID || ''
    ).trim();

    if (!channelId) {
        throw new Error(
            'BACKUP_CHANNEL_ID не настроен. ' +
            'Бэкап создан локально, но не отправлен в Discord.'
        );
    }

    const channel = await client.channels
        .fetch(channelId)
        .catch(() => null);

    if (!channel?.isTextBased?.()) {
        throw new Error(
            `Канал бэкапов ${channelId} не найден ` +
            'или не является текстовым.'
        );
    }

    await channel.send({
        content: [
            '🛡️ **Бэкап Game Syndicate**',
            `Причина: **${reason}**`,
            `Источник: \`${databasePath}\``,
            `Время: <t:${Math.floor(Date.now() / 1000)}:F>`,
        ].join('\n'),
        files: [
            new AttachmentBuilder(backupPath, {
                name: path.basename(backupPath),
            }),
        ],
    });

    console.log(
        `✅ Backup uploaded to Discord channel ${channelId}`
    );

    await cleanupDiscordBackups(channel);
}

async function runAutomaticBackup(
    client = activeClient,
    reason = 'scheduled'
) {
    if (!client) {
        throw new Error(
            'Discord client ещё не готов для отправки бэкапа.'
        );
    }

    if (backupInProgress) {
        return {
            created: false,
            busy: true,
            backupPath: null,
        };
    }

    backupInProgress = true;

    try {
        const backupPath = await backupDatabase({ reason });

        await uploadBackupToDiscord(
            client,
            backupPath,
            reason
        );

        return {
            created: true,
            busy: false,
            backupPath,
        };
    } finally {
        backupInProgress = false;
    }
}

async function backupCriticalChange() {
    // Оставлено для совместимости со старыми командами.
    // Важные действия больше не запускают отдельные бэкапы.
    // Перед обновлением владелец вручную использует /backup.
    return null;
}

function startAutomaticBackups(client) {
    activeClient = client;

    if (intervalHandle) {
        clearInterval(intervalHandle);
    }

    const intervalMs = getIntervalMs();
    const intervalMinutes = Math.round(intervalMs / 60_000);

    console.log(
        `🛡️ Автоматический бэкап: каждые ` +
        `${intervalMinutes} минут.`
    );
    console.log(
        `🧹 Retention: ` +
        `${process.env.BACKUP_RETENTION || 10} local, ` +
        `${getDiscordRetention()} Discord backups.`
    );
    console.log(
        'ℹ️ Бэкап при запуске и бэкапы после игровых операций отключены.'
    );
    console.log(
        'ℹ️ Перед обновлением используй /backup и дождись подтверждения.'
    );

    intervalHandle = setInterval(() => {
        runAutomaticBackup(client, 'scheduled').catch(error => {
            console.error('❌ Scheduled backup failed:', error);
        });
    }, intervalMs);

    intervalHandle.unref?.();
}

module.exports = {
    startAutomaticBackups,
    runAutomaticBackup,
    backupCriticalChange,
};
