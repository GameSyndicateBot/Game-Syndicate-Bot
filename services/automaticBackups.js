const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { db, databasePath } = require('../database/db');
const { backupDatabase } = require('../utils/backupDatabase');

const DEFAULT_INTERVAL_MINUTES = 360;
const CRITICAL_POLL_MS = 10_000;

let intervalHandle = null;
let criticalPollHandle = null;
let backupInProgress = false;
let pendingCriticalReason = null;

function getIntervalMs() {
    const minutes = Number(process.env.BACKUP_INTERVAL_MINUTES);
    const safeMinutes = Number.isFinite(minutes) && minutes >= 15
        ? minutes
        : DEFAULT_INTERVAL_MINUTES;

    return safeMinutes * 60 * 1000;
}

function installCriticalBackupTracking() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS persistence_backup_state (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            dirty INTEGER NOT NULL DEFAULT 0,
            reason TEXT,
            updated_at INTEGER NOT NULL DEFAULT 0
        );

        INSERT OR IGNORE INTO persistence_backup_state(id, dirty, reason, updated_at)
        VALUES(1, 0, NULL, 0);

        CREATE TRIGGER IF NOT EXISTS trg_backup_player_cards_insert
        AFTER INSERT ON player_cards
        BEGIN
            UPDATE persistence_backup_state
            SET dirty = 1, reason = 'player_cards_insert', updated_at = unixepoch('now')
            WHERE id = 1;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_backup_player_cards_delete
        AFTER DELETE ON player_cards
        BEGIN
            UPDATE persistence_backup_state
            SET dirty = 1, reason = 'player_cards_delete', updated_at = unixepoch('now')
            WHERE id = 1;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_backup_player_cards_update
        AFTER UPDATE ON player_cards
        BEGIN
            UPDATE persistence_backup_state
            SET dirty = 1, reason = 'player_cards_update', updated_at = unixepoch('now')
            WHERE id = 1;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_backup_dust_update
        AFTER UPDATE OF card_dust ON players
        WHEN COALESCE(OLD.card_dust, 0) <> COALESCE(NEW.card_dust, 0)
        BEGIN
            UPDATE persistence_backup_state
            SET dirty = 1, reason = 'card_dust_update', updated_at = unixepoch('now')
            WHERE id = 1;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_backup_achievements_insert
        AFTER INSERT ON player_achievements
        BEGIN
            UPDATE persistence_backup_state
            SET dirty = 1, reason = 'achievement_insert', updated_at = unixepoch('now')
            WHERE id = 1;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_backup_achievements_delete
        AFTER DELETE ON player_achievements
        BEGIN
            UPDATE persistence_backup_state
            SET dirty = 1, reason = 'achievement_delete', updated_at = unixepoch('now')
            WHERE id = 1;
        END;
    `);

    // Таблица паков появляется лениво. Если она уже существует — добавляем триггеры.
    const packTableExists = db.prepare(`
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = 'player_pack_inventory'
    `).get();

    if (packTableExists) {
        db.exec(`
            CREATE TRIGGER IF NOT EXISTS trg_backup_packs_insert
            AFTER INSERT ON player_pack_inventory
            BEGIN
                UPDATE persistence_backup_state
                SET dirty = 1, reason = 'pack_inventory_insert', updated_at = unixepoch('now')
                WHERE id = 1;
            END;

            CREATE TRIGGER IF NOT EXISTS trg_backup_packs_update
            AFTER UPDATE ON player_pack_inventory
            BEGIN
                UPDATE persistence_backup_state
                SET dirty = 1, reason = 'pack_inventory_update', updated_at = unixepoch('now')
                WHERE id = 1;
            END;

            CREATE TRIGGER IF NOT EXISTS trg_backup_packs_delete
            AFTER DELETE ON player_pack_inventory
            BEGIN
                UPDATE persistence_backup_state
                SET dirty = 1, reason = 'pack_inventory_delete', updated_at = unixepoch('now')
                WHERE id = 1;
            END;
        `);
    }
}

function getCriticalState() {
    return db.prepare(`
        SELECT dirty, reason, updated_at
        FROM persistence_backup_state
        WHERE id = 1
    `).get();
}

function clearCriticalState() {
    db.prepare(`
        UPDATE persistence_backup_state
        SET dirty = 0, reason = NULL
        WHERE id = 1
    `).run();
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
            `Источник: \`${databasePath}\``,
            `Время: <t:${Math.floor(Date.now() / 1000)}:F>`,
            'Этот файл используется для автоматического восстановления после перезапуска Bothost.',
        ].join('\n'),
        files: [attachment],
    });

    console.log(`✅ Backup uploaded to Discord channel ${channelId}`);
    return true;
}

async function runAutomaticBackup(client, reason = 'scheduled') {
    if (backupInProgress) {
        pendingCriticalReason = pendingCriticalReason || reason;
        console.log('ℹ️ Backup queued because another backup is already running.');
        return null;
    }

    backupInProgress = true;

    try {
        const backupPath = await backupDatabase({ reason });
        const uploaded = await uploadBackupToDiscord(client, backupPath, reason);

        // Dirty-флаг очищаем только после успешной отправки во внешнее хранилище.
        if (uploaded) clearCriticalState();

        return backupPath;
    } catch (error) {
        console.error('❌ Automatic backup failed:', error);
        return null;
    } finally {
        backupInProgress = false;

        if (pendingCriticalReason) {
            const queuedReason = pendingCriticalReason;
            pendingCriticalReason = null;
            setTimeout(() => {
                runAutomaticBackup(client, queuedReason).catch(console.error);
            }, 1000).unref?.();
        }
    }
}

async function backupCriticalChange(client, reason = 'critical-change') {
    db.prepare(`
        UPDATE persistence_backup_state
        SET dirty = 1, reason = ?, updated_at = unixepoch('now')
        WHERE id = 1
    `).run(reason);

    return runAutomaticBackup(client, reason);
}

function startAutomaticBackups(client) {
    if (intervalHandle) clearInterval(intervalHandle);
    if (criticalPollHandle) clearInterval(criticalPollHandle);

    installCriticalBackupTracking();

    const intervalMs = getIntervalMs();
    console.log(`🛡️ Automatic backups enabled every ${Math.round(intervalMs / 60000)} minutes.`);
    console.log(`🛡️ Critical economy backup monitor enabled every ${CRITICAL_POLL_MS / 1000} seconds.`);

    // Бэкап после запуска. К этому моменту prestart-скрипт уже восстановил последнюю базу из Discord.
    setTimeout(() => {
        runAutomaticBackup(client, 'startup').catch(console.error);
    }, 30_000).unref?.();

    intervalHandle = setInterval(() => {
        runAutomaticBackup(client, 'scheduled').catch(console.error);
    }, intervalMs);
    intervalHandle.unref?.();

    criticalPollHandle = setInterval(() => {
        try {
            // Если таблица паков появилась после запуска — установим её триггеры.
            installCriticalBackupTracking();
            const state = getCriticalState();
            if (!state?.dirty) return;

            const reason = state.reason || 'critical-database-change';
            runAutomaticBackup(client, reason).catch(console.error);
        } catch (error) {
            console.error('❌ Critical backup monitor failed:', error);
        }
    }, CRITICAL_POLL_MS);
    criticalPollHandle.unref?.();
}

module.exports = {
    startAutomaticBackups,
    runAutomaticBackup,
    backupCriticalChange,
};
