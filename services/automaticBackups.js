const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { databasePath } = require('../database/db');
const { backupDatabase } = require('../utils/backupDatabase');

const DEFAULT_INTERVAL_MINUTES = 360;
const DEFAULT_CRITICAL_DEBOUNCE_MINUTES = 10;
const DEFAULT_DISCORD_RETENTION = 30;

let intervalHandle = null;
let startupTimer = null;
let criticalTimer = null;
let backupInProgress = false;
let activeClient = null;
let pendingCriticalReason = null;

console.log('✅ SMART_BACKUP_SYSTEM_V4 loaded');

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

function getCriticalDebounceMs() {
    return readPositiveInteger(
        'CRITICAL_BACKUP_DEBOUNCE_MINUTES',
        DEFAULT_CRITICAL_DEBOUNCE_MINUTES,
        1
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
        console.warn('⚠️ Очистка Discord-бэкапов не выполнена:', error.message);
    }
}

async function uploadBackupToDiscord(client, backupPath, reason) {
    const channelId = String(process.env.BACKUP_CHANNEL_ID || '').trim();

    if (!channelId) {
        console.warn('⚠️ BACKUP_CHANNEL_ID не настроен; бэкап оставлен локально.');
        return false;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
        throw new Error(
            `Backup channel ${channelId} was not found or is not text-based.`
        );
    }

    await channel.send({
        content: [
            '🛡️ **Автоматический бэкап Game Syndicate**',
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

    console.log(`✅ Backup uploaded to Discord channel ${channelId}`);
    await cleanupDiscordBackups(channel);
    return true;
}

async function runAutomaticBackup(client = activeClient, reason = 'scheduled') {
    if (!client) {
        console.warn('⚠️ Бэкап пропущен: Discord client ещё не готов.');
        return null;
    }

    if (backupInProgress) {
        pendingCriticalReason = pendingCriticalReason || reason;
        return null;
    }

    backupInProgress = true;

    try {
        const backupPath = await backupDatabase({ reason });
        await uploadBackupToDiscord(client, backupPath, reason);
        return backupPath;
    } catch (error) {
        console.error('❌ Automatic backup failed:', error);
        return null;
    } finally {
        backupInProgress = false;

        if (pendingCriticalReason && !criticalTimer) {
            const queuedReason = pendingCriticalReason;
            pendingCriticalReason = null;
            scheduleCriticalBackup(queuedReason);
        }
    }
}

function scheduleCriticalBackup(reason = 'critical-change') {
    pendingCriticalReason = reason;
    if (criticalTimer) return;

    criticalTimer = setTimeout(async () => {
        criticalTimer = null;
        const finalReason = pendingCriticalReason || reason;
        pendingCriticalReason = null;
        await runAutomaticBackup(activeClient, `critical:${finalReason}`);
    }, getCriticalDebounceMs());

    criticalTimer.unref?.();
}

async function backupCriticalChange(_client, reason = 'critical-change') {
    scheduleCriticalBackup(reason);
    return null;
}

function startAutomaticBackups(client) {
    activeClient = client;

    if (intervalHandle) clearInterval(intervalHandle);
    if (startupTimer) clearTimeout(startupTimer);
    if (criticalTimer) clearTimeout(criticalTimer);

    const intervalMinutes = Math.round(getIntervalMs() / 60_000);
    const criticalMinutes = Math.round(getCriticalDebounceMs() / 60_000);

    console.log(`🛡️ Плановый бэкап: каждые ${intervalMinutes} минут.`);
    console.log(
        `🛡️ Важные операции группируются: максимум один бэкап ` +
        `каждые ${criticalMinutes} минут.`
    );
    console.log(
        `🧹 Retention: ${process.env.BACKUP_RETENTION || 10} local, ` +
        `${getDiscordRetention()} Discord backups.`
    );
    console.log('ℹ️ Обычные сообщения, реакции и голос не запускают бэкап.');

    startupTimer = setTimeout(() => {
        runAutomaticBackup(client, 'startup').catch(console.error);
    }, 30_000);
    startupTimer.unref?.();

    intervalHandle = setInterval(() => {
        runAutomaticBackup(client, 'scheduled').catch(console.error);
    }, getIntervalMs());
    intervalHandle.unref?.();
}

module.exports = {
    startAutomaticBackups,
    runAutomaticBackup,
    backupCriticalChange,
};
