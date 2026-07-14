const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'telegram-gatherings.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
`);

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

module.exports = { db, statements };
