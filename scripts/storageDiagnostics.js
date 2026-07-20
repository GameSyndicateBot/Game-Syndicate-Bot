const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const databasePath = path.resolve(process.env.DATABASE_PATH || '/app/shared/database.sqlite');
const sharedDir = path.dirname(databasePath);
const markerPath = path.join(sharedDir, '.gs-storage-marker');

fs.mkdirSync(sharedDir, { recursive: true });

if (fs.existsSync(markerPath)) {
    const marker = fs.readFileSync(markerPath, 'utf8').trim();
    console.log(`✅ Persistent storage marker found: ${marker || 'present'}`);
} else {
    const marker = `${new Date().toISOString()}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(markerPath, marker, { mode: 0o666 });
    console.warn('⚠️ Persistent storage marker отсутствовал. Каталог /app/shared новый или был очищен платформой.');
    console.warn(`🧭 Создан storage marker: ${marker}`);
}

if (fs.existsSync(databasePath)) {
    console.log(`✅ Storage database present before restore: ${databasePath} (${fs.statSync(databasePath).size} bytes)`);
} else {
    console.warn(`⚠️ Storage database missing before restore: ${databasePath}`);
}
