const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { db, databasePath } = require('../database/db');
const { backupDatabase } = require('../utils/backupDatabase');

const DEFAULT_INTERVAL_MINUTES = 360;
const DEFAULT_CRITICAL_DEBOUNCE_MINUTES = 10;
const DEFAULT_DISCORD_RETENTION = 30;
const CRITICAL_POLL_MS = 30_000;

let intervalHandle = null;
let criticalPollHandle = null;
let backupInProgress = false;
let pendingCriticalReason = null;

function readPositiveInteger(name, fallback, minimum = 1) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= minimum ? value : fallback;
}

function getIntervalMs() {
    return readPositiveInteger(
        'BACKUP_INTERVAL_MINUTES',
        DEFAULT_INTERVAL_MINUTES,
        15
    ) * 60 * 1000;
}

function getCriticalDebounceSeconds() {
    return readPositiveInteger(
        'CRITICAL_BACKUP_DEBOUNCE_MINUTES',
        DEFAULT_CRITICAL_DEBOUNCE_MINUTES,
        1
    ) * 60;
}

function getDiscordRetention() {
    return readPositiveInteger(
        'DISCORD_BACKUP_RETENTION',
        DEFAULT_DISCORD_RETENTION,
        1
    );
}

function installCriticalBackupTracking() {
    // Эта таблица хранит только служебное состояние бэкапов.
    // Безопасно пересоздаём её при запуске, чтобы старые версии схемы
    // не могли уронить бота из-за отсутствующей колонки last_backup_at.
    db.exec(`
        DROP TABLE IF EXISTS persistence_backup_state;

        CREATE TABLE persistence_backup_state (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            dirty INTEGER NOT NULL DEFAULT 0,
            reason TEXT,
            updated_at INTEGER NOT NULL DEFAULT 0,
            last_backup_at INTEGER NOT NULL DEFAULT 0
        );

        INSERT INTO persistence_backup_state (
            id, dirty, reason, updated_at, last_backup_at
        )
        VALUES (1, 0, NULL, 0, 0);
    `);

    db.exec(`
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
        SELECT dirty, reason, updated_at, last_backup_at
        FROM persistence_backup_state
        WHERE id = 1
    `).get();
}

function markCriticalState(reason) {
    db.prepare(`
        UPDATE persistence_backup_state
        SET dirty = 1,
            reason = ?,
            updated_at = unixepoch('now')
        WHERE id = 1
    `).run(reason);
}

function clearCriticalState() {
    db.prepare(`
        UPDATE persistence_backup_state
        SET dirty = 0,
            reason = NULL,
            last_backup_at = unixepoch('now')
        WHERE id = 1
    `).run();
}

async function cleanupDiscordBackups(channel) {
    const keep = getDiscordRetention();

    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const backupMessages = [...messages.values()]
            .filter(message => {
                if (message.author.id !== channel.client.user.id) return false;

                return [...message.attachments.values()].some(attachment =>
                    /^database-backup-.*\.sqlite$/i.test(attachment.name || '')
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
        console.warn('⚠️ Очистка Discord-бэкапов не выполнена:', error.message);
    }
}

async function uploadBackupToDiscord(client, backupPath, reason) {
    const channelId = String(process.env.BACKUP_CHANNEL_ID ?? '').trim();
    if (!channelId) {
        console.warn('⚠️ BACKUP_CHANNEL_ID не настроен; бэкап сохранён только локально.');
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
            'Файл используется для автоматического восстановления после перезапуска Bothost.',
        ].join('\n'),
        files: [attachment],
    });

    console.log(`✅ Backup uploaded to Discord channel ${channelId}`);
    await cleanupDiscordBackups(channel);
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

        // Локальный бэкап уже создан, поэтому dirty можно очистить даже при
        // временной ошибке Discord. Следующий плановый бэкап всё равно повторит загрузку.
        clearCriticalState();

        if (!uploaded) {
            console.warn('⚠️ Бэкап не отправлен в Discord, но сохранён локально.');
        }

        return backupPath;
    } catch (error) {
        console.error('❌ Automatic backup failed:', error);
        return null;
    } finally {
        backupInProgress = false;

        if (pendingCriticalReason) {
            const queuedReason = pendingCriticalReason;
            pendingCriticalReason = null;

            // Не запускаем второй бэкап сразу. Просто оставляем dirty-флаг,
            // и монитор обработает его после debounce-интервала.
            markCriticalState(queuedReason);
        }
    }
}

async function backupCriticalChange(_client, reason = 'critical-change') {
    // Раньше здесь создавался отдельный бэкап после каждой покупки/карты.
    // Теперь только отмечаем базу изменённой. Монитор объединит все изменения
    // и создаст максимум один бэкап за debounce-интервал.
    markCriticalState(reason);
    return null;
}

function startAutomaticBackups(client) {
    if (intervalHandle) clearInterval(intervalHandle);
    if (criticalPollHandle) clearInterval(criticalPollHandle);

    installCriticalBackupTracking();

    const intervalMs = getIntervalMs();
    const debounceSeconds = getCriticalDebounceSeconds();

    console.log(
        `🛡️ Automatic backups enabled every ${Math.round(intervalMs / 60000)} minutes.`
    );
    console.log(
        `🛡️ Critical changes are grouped into one backup every ` +
        `${Math.round(debounceSeconds / 60)} minutes.`
    );
    console.log(
        `🧹 Retention: ${process.env.BACKUP_RETENTION || 10} local, ` +
        `${getDiscordRetention()} Discord backups.`
    );

    // Один стартовый бэкап через 30 секунд.
    setTimeout(() => {
        runAutomaticBackup(client, 'startup').catch(console.error);
    }, 30_000).unref?.();

    intervalHandle = setInterval(() => {
        runAutomaticBackup(client, 'scheduled').catch(console.error);
    }, intervalMs);
    intervalHandle.unref?.();

    criticalPollHandle = setInterval(() => {
        try {
            installCriticalBackupTracking();

            const state = getCriticalState();
            if (!state?.dirty) return;

            const nowSeconds = Math.floor(Date.now() / 1000);
            const lastBackupAt = Number(state.last_backup_at || 0);

            if (nowSeconds - lastBackupAt < debounceSeconds) {
                return;
            }

            const reason = state.reason || 'critical-database-change';
            runAutomaticBackup(client, `grouped:${reason}`).catch(console.error);
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
