'use strict';

const fs = require('fs');
const path = require('path');

const sharedDir = path.resolve(process.env.SHARED_DIR || '/app/shared');
const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(sharedDir, 'database.sqlite'));
const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(sharedDir, 'backups'));
const minFreeMb = Math.max(32, Number(process.env.MIN_FREE_STORAGE_MB) || 96);

function freeBytes(target = sharedDir) {
    try {
        const stats = fs.statfsSync(target);
        return Number(stats.bavail) * Number(stats.bsize);
    } catch (_) {
        return Number.POSITIVE_INFINITY;
    }
}

function formatMb(bytes) {
    return Number.isFinite(bytes) ? Math.round(bytes / 1024 / 1024) : 'unknown';
}

function safeUnlink(filePath, reason) {
    try {
        if (!fs.existsSync(filePath)) return false;
        fs.unlinkSync(filePath);
        console.log(`[Prestart Storage] Удалён ${reason}: ${filePath}`);
        return true;
    } catch (error) {
        console.warn(`[Prestart Storage] Не удалось удалить ${filePath}: ${error.message}`);
        return false;
    }
}

function listBackupFiles() {
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => {
            const fullPath = path.join(backupDir, entry.name);
            const stat = fs.statSync(fullPath);
            return { fullPath, name: entry.name, mtimeMs: stat.mtimeMs, size: stat.size };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function removeTemporaryFiles() {
    const candidates = [
        `${databasePath}-shm`,
        path.join(sharedDir, 'database.sqlite-shm'),
    ];
    for (const filePath of new Set(candidates)) safeUnlink(filePath, 'SQLite SHM');

    if (!fs.existsSync(sharedDir)) return;
    for (const entry of fs.readdirSync(sharedDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (/\.(tmp|temp|partial)$/i.test(entry.name)) {
            safeUnlink(path.join(sharedDir, entry.name), 'временный файл');
        }
    }
}

function pruneBackups() {
    const backups = listBackupFiles();
    const normalKeep = Math.max(1, Number(process.env.PRESTART_BACKUP_KEEP) || 2);

    for (const file of backups.slice(normalKeep)) {
        safeUnlink(file.fullPath, 'старый локальный бэкап');
    }

    let remaining = listBackupFiles();
    while (freeBytes() < minFreeMb * 1024 * 1024 && remaining.length > 1) {
        const oldest = remaining[remaining.length - 1];
        safeUnlink(oldest.fullPath, 'аварийный старый бэкап');
        remaining = listBackupFiles();
    }
}

function checkpointDatabase() {
    if (!fs.existsSync(databasePath)) return;
    try {
        const Database = require('better-sqlite3');
        const db = new Database(databasePath, { timeout: 10_000 });
        db.pragma('busy_timeout = 10000');
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
        console.log('[Prestart Storage] SQLite WAL checkpoint TRUNCATE выполнен.');
    } catch (error) {
        console.warn(`[Prestart Storage] WAL checkpoint пропущен: ${error.message}`);
    }
}

fs.mkdirSync(sharedDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

console.log(`[Prestart Storage] Свободно до очистки: ${formatMb(freeBytes())} MB.`);
removeTemporaryFiles();
pruneBackups();
checkpointDatabase();
console.log(`[Prestart Storage] Свободно после очистки: ${formatMb(freeBytes())} MB.`);

// Не завершаем контейнер ошибкой: даже при жёсткой квоте бот должен запуститься
// и перейти в режим пропуска необязательных записей.
if (freeBytes() < 8 * 1024 * 1024) {
    console.warn('[Prestart Storage] Критически мало места (<8 MB). Голосовые записи будут временно пропускаться.');
}
