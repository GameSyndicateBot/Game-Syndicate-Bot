const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { backupDatabase } = require('../utils/backupDatabase');

const DEFAULT_INTERVAL_MINUTES = 360; // 6 hours
let intervalHandle = null;
let backupInProgress = false;

function getIntervalMs() {
    const minutes = Number(process.env.BACKUP_INTERVAL_MINUTES);
    const safeMinutes = Number.isFinite(minutes) && minutes >= 15
        ? minutes
        : DEFAULT_INTERVAL_MINUTES;

    return safeMinutes * 60 * 1000;
}

async function uploadBackupToDiscord(client, backupPath, reason) {
    const channelId = String(process.env.BACKUP_CHANNEL_ID ?? '').trim();
    if (!channelId) {
        console.warn('⚠️ BACKUP_CHANNEL_ID is not configured; backup is stored only on disk.');
        return false;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
        throw new Error(`Backup channel ${channelId} was not found or is not text-based.`);
    }

    const fileName = path.basename(backupPath);
    const attachment = new AttachmentBuilder(backupPath, { name: fileName });

    await channel.send({
        content: [
            '🛡️ **Автоматический бэкап Game Syndicate**',
            `Причина: **${reason}**`,
            `Время: <t:${Math.floor(Date.now() / 1000)}:F>`,
            'Храни этот канал приватным: файл содержит весь прогресс участников.',
        ].join('\n'),
        files: [attachment],
    });

    console.log(`✅ Backup uploaded to Discord channel ${channelId}`);
    return true;
}

async function runAutomaticBackup(client, reason = 'scheduled') {
    if (backupInProgress) {
        console.log('ℹ️ Backup skipped because another backup is already running.');
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
    }
}

function startAutomaticBackups(client) {
    if (intervalHandle) clearInterval(intervalHandle);

    const intervalMs = getIntervalMs();
    console.log(`🛡️ Automatic backups enabled every ${Math.round(intervalMs / 60000)} minutes.`);

    // Create a snapshot shortly after startup, after all migrations are complete.
    setTimeout(() => {
        runAutomaticBackup(client, 'startup').catch(console.error);
    }, 30_000);

    intervalHandle = setInterval(() => {
        runAutomaticBackup(client, 'scheduled').catch(console.error);
    }, intervalMs);

    intervalHandle.unref?.();
}

module.exports = {
    startAutomaticBackups,
    runAutomaticBackup,
};
