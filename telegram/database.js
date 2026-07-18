const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const legacyDataDir = path.join(__dirname, 'data');
const legacyDatabasePath = path.join(legacyDataDir, 'telegram-gatherings.sqlite');

const persistentDataDir = process.env.DATA_DIR
    || (fs.existsSync('/app/shared') ? '/app/shared' : legacyDataDir);
const databasePath = process.env.TELEGRAM_DATABASE_PATH
    || path.join(persistentDataDir, 'telegram-gatherings.sqlite');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

// Однократная миграция старой Telegram-БД из папки приложения в постоянное хранилище.
// В Bothost папка приложения заменяется при обновлении, а /app/shared сохраняется.
if (
    databasePath !== legacyDatabasePath
    && !fs.existsSync(databasePath)
    && fs.existsSync(legacyDatabasePath)
) {
    try {
        const legacyDb = new Database(legacyDatabasePath);
        legacyDb.pragma('wal_checkpoint(TRUNCATE)');
        legacyDb.close();
        fs.copyFileSync(legacyDatabasePath, databasePath);
        console.log(`✅ Telegram database migrated to persistent storage: ${databasePath}`);
    } catch (error) {
        console.warn(`⚠️ Не удалось перенести старую Telegram-БД: ${error.message}`);
    }
}

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
console.log(`📱 Telegram database path: ${databasePath}`);

db.exec(`
CREATE TABLE IF NOT EXISTS telegram_gatherings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    message_id INTEGER,
    creator_id TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    game TEXT NOT NULL,
    starts_at_text TEXT NOT NULL,
    max_players INTEGER NOT NULL,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_gathering_members (
    gathering_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (gathering_id, user_id),
    FOREIGN KEY (gathering_id) REFERENCES telegram_gatherings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_gs_members (
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    is_bot INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'member',
    emoji TEXT,
    registered INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_id),
    UNIQUE (chat_id, emoji)
);
`);

// Миграция БД, созданной до появления явной регистрации.
const gsColumns = db.prepare(`PRAGMA table_info(telegram_gs_members)`).all();
if (!gsColumns.some(column => column.name === 'registered')) {
    db.exec(`ALTER TABLE telegram_gs_members ADD COLUMN registered INTEGER NOT NULL DEFAULT 0`);
    // Старый код автоматически раздавал эмодзи незарегистрированным участникам.
    // Обнуляем эти назначения один раз, чтобы они не считались занятыми.
    db.exec(`UPDATE telegram_gs_members SET emoji = NULL, registered = 0`);
    console.log('✅ Telegram GS registration schema migrated; old automatic emoji assignments cleared');
}

const statements = {
    createGathering: db.prepare(`
        INSERT INTO telegram_gatherings (
            chat_id, creator_id, creator_name, game,
            starts_at_text, max_players, comment
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    setMessageId: db.prepare(`UPDATE telegram_gatherings SET message_id = ? WHERE id = ?`),
    getGathering: db.prepare(`SELECT * FROM telegram_gatherings WHERE id = ?`),
    listMembers: db.prepare(`
        SELECT user_id, display_name, joined_at
        FROM telegram_gathering_members
        WHERE gathering_id = ?
        ORDER BY joined_at ASC
    `),
    addMember: db.prepare(`
        INSERT OR IGNORE INTO telegram_gathering_members (gathering_id, user_id, display_name)
        VALUES (?, ?, ?)
    `),
    removeMember: db.prepare(`
        DELETE FROM telegram_gathering_members WHERE gathering_id = ? AND user_id = ?
    `),
    closeGathering: db.prepare(`UPDATE telegram_gatherings SET status = 'cancelled' WHERE id = ?`),
};

module.exports = { db, statements, databasePath };
