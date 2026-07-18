const { db } = require('../database/db');

db.prepare(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT,
    updated_by TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, setting_key)
  )
`).run();

function getGuildSetting(guildId, key, fallback = null) {
  if (!guildId || !key) return fallback;
  const row = db.prepare(`SELECT setting_value FROM guild_settings WHERE guild_id=? AND setting_key=?`).get(String(guildId), String(key));
  return row?.setting_value ?? fallback;
}

function setGuildSetting(guildId, key, value, updatedBy = null) {
  if (!guildId || !key) throw new Error('guildId and key are required');
  db.prepare(`
    INSERT INTO guild_settings(guild_id, setting_key, setting_value, updated_by, updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(guild_id, setting_key) DO UPDATE SET
      setting_value=excluded.setting_value,
      updated_by=excluded.updated_by,
      updated_at=CURRENT_TIMESTAMP
  `).run(String(guildId), String(key), value == null ? null : String(value), updatedBy ? String(updatedBy) : null);
  return value;
}

function deleteGuildSetting(guildId, key) {
  return db.prepare(`DELETE FROM guild_settings WHERE guild_id=? AND setting_key=?`).run(String(guildId), String(key));
}

function getGuildSettings(guildId) {
  const rows = db.prepare(`SELECT setting_key, setting_value, updated_at FROM guild_settings WHERE guild_id=? ORDER BY setting_key`).all(String(guildId));
  return Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
}

module.exports = { getGuildSetting, setGuildSetting, deleteGuildSetting, getGuildSettings };
