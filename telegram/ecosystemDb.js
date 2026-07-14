const { db } = require('../database/db');

db.exec(`
CREATE TABLE IF NOT EXISTS gs_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cross_gatherings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_platform TEXT NOT NULL,
    creator_platform_id TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    game TEXT NOT NULL,
    starts_at_text TEXT NOT NULL,
    max_players INTEGER NOT NULL,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    telegram_chat_id TEXT,
    telegram_message_id INTEGER,
    discord_channel_id TEXT,
    discord_message_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cross_gathering_members (
    gathering_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    platform_user_id TEXT NOT NULL,
    discord_user_id TEXT,
    display_name TEXT NOT NULL,
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (gathering_id, platform, platform_user_id),
    FOREIGN KEY (gathering_id) REFERENCES cross_gatherings(id) ON DELETE CASCADE
);
`);

function ensureColumn(table, column, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(item => item.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

ensureColumn('cross_gatherings', 'starts_at_ts', 'INTEGER');
ensureColumn('cross_gatherings', 'reminder_30_sent', 'INTEGER DEFAULT 0');
ensureColumn('cross_gatherings', 'reminder_10_sent', 'INTEGER DEFAULT 0');
ensureColumn('cross_gatherings', 'start_notice_sent', 'INTEGER DEFAULT 0');
ensureColumn('cross_gatherings', 'started_at', 'INTEGER');

function getSetting(key) {
    return db.prepare('SELECT value FROM gs_settings WHERE key = ?').get(key)?.value ?? null;
}

function setSetting(key, value) {
    db.prepare(`
        INSERT INTO gs_settings(key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
    `).run(key, String(value));
}

module.exports = { db, getSetting, setSetting };
