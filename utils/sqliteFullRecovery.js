const fs = require('fs');
const path = require('path');

let recoveryInProgress = false;
let lastRecoveryAt = 0;

function isSqliteFull(error) {
    return error?.code === 'SQLITE_FULL' || /database or disk is full/i.test(String(error?.message || ''));
}

function getBackupDir() {
    return path.resolve(process.env.BACKUP_DIR || '/app/shared/backups');
}

function pruneLocalBackups(keep = 3) {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) return 0;

    const files = fs.readdirSync(backupDir)
        .filter(name => /^database-backup-.*\.sqlite$/i.test(name))
        .map(name => {
            const fullPath = path.join(backupDir, name);
            return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    let removed = 0;
    for (const file of files.slice(Math.max(0, keep))) {
        try {
            fs.unlinkSync(file.fullPath);
            removed += 1;
        } catch (error) {
            console.warn(`[SQLite Recovery] Не удалось удалить ${file.fullPath}: ${error.message}`);
        }
    }
    return removed;
}

function logDiskSpace(targetPath = '/app/shared') {
    try {
        if (typeof fs.statfsSync !== 'function') return;
        const stats = fs.statfsSync(targetPath);
        const freeBytes = Number(stats.bavail) * Number(stats.bsize);
        const totalBytes = Number(stats.blocks) * Number(stats.bsize);
        console.warn(
            `[SQLite Recovery] Свободно ${Math.round(freeBytes / 1024 / 1024)} MB ` +
            `из ${Math.round(totalBytes / 1024 / 1024)} MB в ${targetPath}.`
        );
    } catch (error) {
        console.warn(`[SQLite Recovery] Не удалось проверить место: ${error.message}`);
    }
}


function hasMinimumFreeSpace(targetPath = '/app/shared', minimumMb = 16) {
    try {
        if (typeof fs.statfsSync !== 'function') return true;
        const stats = fs.statfsSync(targetPath);
        const freeBytes = Number(stats.bavail) * Number(stats.bsize);
        return freeBytes >= Number(minimumMb) * 1024 * 1024;
    } catch (_) {
        return true;
    }
}

function recoverFromSqliteFull(db, context = 'unknown') {
    const now = Date.now();
    if (recoveryInProgress || now - lastRecoveryAt < 30_000) return false;

    recoveryInProgress = true;
    lastRecoveryAt = now;

    try {
        console.error(`[SQLite Recovery] SQLITE_FULL в ${context}. Запускаю безопасную очистку.`);
        logDiskSpace();
        const removed = pruneLocalBackups(3);
        if (removed > 0) {
            console.warn(`[SQLite Recovery] Удалено старых локальных бэкапов: ${removed}.`);
        }

        try {
            db.pragma('wal_checkpoint(TRUNCATE)');
            console.warn('[SQLite Recovery] WAL checkpoint TRUNCATE выполнен.');
        } catch (error) {
            console.warn(`[SQLite Recovery] WAL checkpoint пока невозможен: ${error.message}`);
        }

        logDiskSpace();
        return true;
    } finally {
        recoveryInProgress = false;
    }
}

function startupStorageMaintenance(db) {
    try {
        const removed = pruneLocalBackups(Number(process.env.BACKUP_RETENTION) || 10);
        if (removed > 0) {
            console.log(`[Storage] При запуске удалено старых локальных бэкапов: ${removed}.`);
        }
        try {
            db.pragma('wal_checkpoint(PASSIVE)');
        } catch (error) {
            if (!isSqliteFull(error)) {
                console.warn(`[Storage] WAL checkpoint пропущен: ${error.message}`);
            } else {
                recoverFromSqliteFull(db, 'startupStorageMaintenance');
            }
        }
        logDiskSpace();
    } catch (error) {
        console.warn(`[Storage] Стартовое обслуживание не выполнено: ${error.message}`);
    }
}

module.exports = {
    isSqliteFull,
    recoverFromSqliteFull,
    startupStorageMaintenance,
    hasMinimumFreeSpace,
};
