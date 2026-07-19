const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const databasePath = path.resolve(process.env.DATABASE_PATH || '/app/shared/database.sqlite');
const sharedDir = path.dirname(databasePath);
const markerPath = path.join(sharedDir, '.gs-storage-marker');
const statusPath = path.join(sharedDir, '.gs-storage-status.json');

fs.mkdirSync(sharedDir, { recursive: true });

let environment = 'EXISTING';
let marker;

if (fs.existsSync(markerPath)) {
    marker = fs.readFileSync(markerPath, 'utf8').trim() || 'present';
} else {
    environment = 'NEW';
    marker = `${new Date().toISOString()}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(markerPath, marker, { mode: 0o666 });
}

const databasePresent = fs.existsSync(databasePath);
const databaseSize = databasePresent ? fs.statSync(databasePath).size : 0;

const status = {
    checkedAt: new Date().toISOString(),
    environment,
    marker,
    databasePath,
    databasePresent,
    databaseSize,
    mode: databasePresent ? 'LOCAL' : 'PENDING',
};

fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o666 });

console.log('🔄 Проверка постоянного хранилища...');
console.log(`📦 Окружение: ${environment === 'NEW' ? 'NEW (первый запуск или новый контейнер)' : 'EXISTING'}`);
console.log(`🗄️ Локальная база: ${databasePresent ? `найдена (${databaseSize} bytes)` : 'не найдена — проверяется облачная копия'}`);
