const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

const protectedPaths = [
    '.env',
    'database/database.sqlite',
    'telegram/data/telegram-gatherings.sqlite',
    'telegram/data/telegram-gatherings.sqlite-wal',
    'telegram/data/telegram-gatherings.sqlite-shm',
    'database/database.sqlite-wal',
    'database/database.sqlite-shm',
];

const requiredPaths = [
    '.env.example',
    'database/db.js',
    'package.json',
    'index.js',
];

for (const rel of protectedPaths) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) {
        errors.push(
            `${rel} находится внутри update-сборки и может перезаписать рабочие данные при распаковке поверх бота.`
        );
    }
}

for (const rel of requiredPaths) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) errors.push(`Отсутствует обязательный файл: ${rel}`);
}

const backupDirs = ['backups', 'database/backups', 'telegram/backups'];
for (const rel of backupDirs) {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) warnings.push(`В сборке присутствует каталог резервных копий: ${rel}`);
}

console.log('Game Syndicate Bot — проверка безопасного обновления');
console.log('Защищённые файлы не должны входить в update ZIP:');
for (const rel of protectedPaths) console.log(`  - ${rel}`);

for (const warning of warnings) console.log(`[WARN] ${warning}`);
for (const error of errors) console.error(`[ERROR] ${error}`);

if (errors.length) {
    console.error(`\nUpdate audit: FAILED (${errors.length} ошибок)`);
    process.exitCode = 1;
} else {
    console.log('\nUpdate audit: PASSED');
    console.log('Архив можно распаковывать поверх существующей папки с заменой файлов.');
    console.log('Существующие .env и SQLite-базы останутся на месте, потому что их нет в update ZIP.');
}
