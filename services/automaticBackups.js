const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { AttachmentBuilder } = require('discord.js');
const { databasePath } = require('../database/db');
const { backupDatabase } = require('../utils/backupDatabase');
const { getGuildSetting } = require('../utils/guildSettings');

const DEFAULT_INTERVAL_MINUTES = 360;
const DEFAULT_DISCORD_RETENTION = 30;
const DEFAULT_DISCORD_PART_SIZE_MB = 7;

let intervalHandle = null;
let backupInProgress = false;
let activeClient = null;

console.log('✅ SCHEDULED_BACKUP_SYSTEM_V7 loaded');

function readPositiveInteger(name, fallback, minimum = 1) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= minimum ? value : fallback;
}

function getIntervalMs() {
    return readPositiveInteger('BACKUP_INTERVAL_MINUTES', DEFAULT_INTERVAL_MINUTES, 15) * 60_000;
}

function getDiscordRetention() {
    return readPositiveInteger('DISCORD_BACKUP_RETENTION', DEFAULT_DISCORD_RETENTION, 1);
}

function getPartSizeBytes() {
    return readPositiveInteger('DISCORD_BACKUP_PART_MB', DEFAULT_DISCORD_PART_SIZE_MB, 5) * 1024 * 1024;
}

function backupSetKeyFromAttachmentName(name = '') {
    const value = String(name);
    const direct = value.match(/^(database-backup-.*?\.sqlite)(?:\.gz)?$/i);
    if (direct) return direct[1].toLowerCase();

    const chunk = value.match(/^(database-backup-.*?\.sqlite\.gz)\.part\d+$/i);
    if (chunk) return chunk[1].replace(/\.gz$/i, '').toLowerCase();

    return null;
}

async function cleanupDiscordBackups(channel) {
    const keep = getDiscordRetention();

    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const grouped = new Map();

        for (const message of messages.values()) {
            if (message.author.id !== channel.client.user.id) continue;

            const keys = [...message.attachments.values()]
                .map(attachment => backupSetKeyFromAttachmentName(attachment.name || ''))
                .filter(Boolean);

            if (!keys.length) continue;

            for (const key of new Set(keys)) {
                const entry = grouped.get(key) || { createdTimestamp: 0, messages: [] };
                entry.createdTimestamp = Math.max(entry.createdTimestamp, message.createdTimestamp);
                entry.messages.push(message);
                grouped.set(key, entry);
            }
        }

        const backupSets = [...grouped.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
        const obsolete = backupSets.slice(keep);
        const deletedIds = new Set();

        for (const set of obsolete) {
            for (const message of set.messages) {
                if (deletedIds.has(message.id)) continue;
                deletedIds.add(message.id);
                await message.delete().catch(error => {
                    console.warn(`⚠️ Не удалось удалить Discord-бэкап ${message.id}:`, error.message);
                });
            }
        }

        if (obsolete.length > 0) {
            console.log(`🧹 Удалено старых наборов Discord-бэкапов: ${obsolete.length}. Оставлено: ${keep}.`);
        }
    } catch (error) {
        console.warn('⚠️ Очистка Discord-бэкапов не выполнена:', error.message);
    }
}

async function gzipBackup(backupPath) {
    const gzipPath = `${backupPath}.gz`;
    await pipeline(
        fs.createReadStream(backupPath),
        zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION }),
        fs.createWriteStream(gzipPath)
    );
    return gzipPath;
}

async function splitFile(filePath, partSizeBytes) {
    const stat = await fs.promises.stat(filePath);
    if (stat.size <= partSizeBytes) return [filePath];

    const parts = [];
    const input = await fs.promises.open(filePath, 'r');
    try {
        let offset = 0;
        let partIndex = 1;
        while (offset < stat.size) {
            const length = Math.min(partSizeBytes, stat.size - offset);
            const partPath = `${filePath}.part${String(partIndex).padStart(2, '0')}`;
            const output = await fs.promises.open(partPath, 'w');
            try {
                const buffer = Buffer.allocUnsafe(Math.min(length, 1024 * 1024));
                let remaining = length;
                let readOffset = offset;
                while (remaining > 0) {
                    const toRead = Math.min(buffer.length, remaining);
                    const { bytesRead } = await input.read(buffer, 0, toRead, readOffset);
                    if (!bytesRead) break;
                    await output.write(buffer, 0, bytesRead);
                    readOffset += bytesRead;
                    remaining -= bytesRead;
                }
            } finally {
                await output.close();
            }
            parts.push(partPath);
            offset += length;
            partIndex += 1;
        }
    } finally {
        await input.close();
    }
    return parts;
}

async function removeTempFiles(paths) {
    for (const filePath of paths) {
        await fs.promises.unlink(filePath).catch(() => {});
    }
}

async function uploadBackupToDiscord(client, backupPath, reason) {
    let configuredChannelId = process.env.BACKUP_CHANNEL_ID || '';
    for (const guild of client.guilds.cache.values()) {
        const saved = getGuildSetting(guild.id, 'backup_channel_id');
        if (saved) { configuredChannelId = saved; break; }
    }
    const channelId = String(configuredChannelId).trim();

    if (!channelId) {
        throw new Error('BACKUP_CHANNEL_ID не настроен. Бэкап создан локально, но не отправлен в Discord.');
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
        throw new Error(`Канал бэкапов ${channelId} не найден или не является текстовым.`);
    }

    const tempFiles = [];
    try {
        const gzipPath = await gzipBackup(backupPath);
        tempFiles.push(gzipPath);

        const parts = await splitFile(gzipPath, getPartSizeBytes());
        for (const part of parts) {
            if (part !== gzipPath) tempFiles.push(part);
        }

        async function sendParts(partPaths) {
            const totalParts = partPaths.length;
            for (let i = 0; i < partPaths.length; i += 1) {
                const partPath = partPaths[i];
                const isMultipart = totalParts > 1;
                const partLabel = isMultipart ? `\nЧасть: **${i + 1}/${totalParts}**` : '';
                const restoreHint = isMultipart
                    ? '\nДля восстановления склей части по порядку в один `.sqlite.gz`, затем распакуй gzip.'
                    : '\nФайл сжат gzip; для восстановления распакуй его до `.sqlite`.';

                await channel.send({
                    content: [
                        '🛡️ **Бэкап Game Syndicate**',
                        `Причина: **${reason}**`,
                        `Источник: \`${databasePath}\``,
                        `Время: <t:${Math.floor(Date.now() / 1000)}:F>${partLabel}`,
                        restoreHint,
                    ].join('\n'),
                    files: [new AttachmentBuilder(partPath, { name: path.basename(partPath) })],
                });
            }
            return totalParts;
        }

        let totalParts;
        try {
            totalParts = await sendParts(parts);
        } catch (error) {
            const tooLarge = error?.code === 40005 || error?.status === 413;
            if (!tooLarge) throw error;

            console.warn('⚠️ Discord отклонил размер части бэкапа. Повторяю с частями по 4 MB.');
            const firstPassParts = parts.filter(p => p !== gzipPath);
            await removeTempFiles(firstPassParts);
            for (const p of firstPassParts) {
                const idx = tempFiles.indexOf(p);
                if (idx >= 0) tempFiles.splice(idx, 1);
            }

            const retryParts = await splitFile(gzipPath, 4 * 1024 * 1024);
            for (const part of retryParts) {
                if (part !== gzipPath) tempFiles.push(part);
            }
            totalParts = await sendParts(retryParts);
        }

        console.log(`✅ Backup uploaded to Discord channel ${channelId}${totalParts > 1 ? ` (${totalParts} parts)` : ''}`);
        await cleanupDiscordBackups(channel);

        return { uploaded: true, parts: totalParts };
    } finally {
        await removeTempFiles(tempFiles);
    }
}

async function runAutomaticBackup(client = activeClient, reason = 'scheduled') {
    if (!client) throw new Error('Discord client ещё не готов для отправки бэкапа.');

    if (backupInProgress) {
        return { created: false, busy: true, backupPath: null, discordParts: 0 };
    }

    backupInProgress = true;
    try {
        const backupPath = await backupDatabase({ reason });
        const upload = await uploadBackupToDiscord(client, backupPath, reason);
        return {
            created: true,
            busy: false,
            backupPath,
            discordParts: upload.parts,
        };
    } finally {
        backupInProgress = false;
    }
}

async function backupCriticalChange() {
    return null;
}

function startAutomaticBackups(client) {
    activeClient = client;
    if (intervalHandle) clearInterval(intervalHandle);

    const intervalMs = getIntervalMs();
    const intervalMinutes = Math.round(intervalMs / 60_000);

    console.log(`🛡️ Автоматический бэкап: каждые ${intervalMinutes} минут.`);
    console.log(`🧹 Retention: ${process.env.BACKUP_RETENTION || 10} local, ${getDiscordRetention()} Discord backups.`);
    console.log(`📦 Discord backup transport: gzip + parts up to ${Math.round(getPartSizeBytes() / 1024 / 1024)} MB.`);
    console.log('ℹ️ Бэкап при запуске и бэкапы после игровых операций отключены.');
    console.log('ℹ️ Перед обновлением используй /backup и дождись подтверждения.');

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
