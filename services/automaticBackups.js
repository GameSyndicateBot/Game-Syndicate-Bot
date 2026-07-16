const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { databasePath } = require('../database/db');
const { backupDatabase } = require('../utils/backupDatabase');

const DEFAULT_INTERVAL_MINUTES = 360;
const DEFAULT_DISCORD_RETENTION = 30;

let intervalHandle = null;
let backupInProgress = false;

function readPositiveInteger(name, fallback, minimum = 1) {
    const value = Number(process.env[name]);

    return Number.isInteger(value) && value >= minimum
        ? value
        : fallback;
}

function getIntervalMs() {
    return readPositiveInteger(
        'BACKUP_INTERVAL_MINUTES',
        DEFAULT_INTERVAL_MINUTES,
        15
    ) * 60 * 1000;
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

        const backupMessages = [...messages.values()]
            .filter(message => {
                if (message.author.id !== channel.client.user.id) {
                    return false;
                }

                return [...message.attachments.values()].some(attachment =>
                    /^database-backup-.*\.sqlite$/i.test(
                        attachment.name || ''
                    )
                );
            })
            .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

        const obsolete = backupMessages.slice(keep);

        for (const message of obsolete) {
            await message.delete().catch(error => {
                console.warn(
                    `⚠️ Не удалось удалить старый Discord-бэкап ${message.id}:`,
                    error.message
                );
            });
        }

        if (obsolete.length > 0) {
            console.log(
                `🧹 Удалено старых Discord-бэкапов: ${obsolete.length}. ` +
                `Оставлено последних: ${keep}.`
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
        process.env.BACKUP_CHANNEL_ID ?? ''
    ).trim();

    if (!channelId) {
        console.warn(
            '⚠️ BACKUP_CHANNEL_ID не настроен; ' +
            'бэкап сохранён только локально.'
        );
        return false;
    }

    const channel = await client.channels
        .fetch(channelId)
        .catch(() => null);

    if (!channel?.isTextBased?.()) {
        throw new Error(
            `Backup channel ${channelId} was not found or is not text-based.`
        );
    }

    const fileName = path.basename(backupPath);
    const attachment = new AttachmentBuilder(
        backupPath,
        { name: fileName }
    );

    await channel.send({
        content: [
            '🛡️ **Автоматический бэкап Game Syndicate**',
            `Причина: **${reason}**`,
            `Источник: \`${databasePath}\``,
            `Время: <t:${Math.floor(Date.now() / 1000)}:F>`,
        ].join('\n'),
        files: [attachment],
    });

    console.log(
        `✅ Backup uploaded to Discord channel ${channelId}`
    );

    await cleanupDiscordBackups(channel);
    return true;
}

async function runAutomaticBackup(
    client,
    reason = 'scheduled'
) {
    if (backupInProgress) {
        console.log(
            'ℹ️ Бэкап уже выполняется, повторный запуск пропущен.'
        );
        return null;
    }

    backupInProgress = true;

    try {
        const backupPath = await backupDatabase({ reason });

        await uploadBackupToDiscord(
            client,
            backupPath,
            reason
        );

        return backupPath;
    } catch (error) {
        console.error('❌ Automatic backup failed:', error);
        return null;
    } finally {
        backupInProgress = false;
    }
}

async function backupCriticalChange() {
    // Сохранено ради совместимости с командами,
    // которые вызывают эту функцию.
    // Мгновенный бэкап больше не создаётся:
    // изменения уже сохраняются в /app/shared/database.sqlite,
    // а резервные копии делаются по расписанию.
    return null;
}

function startAutomaticBackups(client) {
    if (intervalHandle) {
        clearInterval(intervalHandle);
    }

    const intervalMs = getIntervalMs();
    const intervalMinutes = Math.round(
        intervalMs / 60_000
    );

    console.log(
        `🛡️ Automatic backups enabled every ` +
        `${intervalMinutes} minutes.`
    );
    console.log(
        `🧹 Retention: ` +
        `${process.env.BACKUP_RETENTION || 10} local, ` +
        `${getDiscordRetention()} Discord backups.`
    );
    console.log(
        'ℹ️ Критические изменения не создают отдельные ' +
        'бэкапы и сохраняются в постоянной базе.'
    );

    // Один бэкап после запуска.
    const startupTimer = setTimeout(() => {
        runAutomaticBackup(
            client,
            'startup'
        ).catch(console.error);
    }, 30_000);

    startupTimer.unref?.();

    intervalHandle = setInterval(() => {
        runAutomaticBackup(
            client,
            'scheduled'
        ).catch(console.error);
    }, intervalMs);

    intervalHandle.unref?.();
}

module.exports = {
    startAutomaticBackups,
    runAutomaticBackup,
    backupCriticalChange,
};
