const { db } = require('../database/db');

function ensureEconomyLogTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS economy_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      asset_key TEXT NOT NULL,
      asset_name TEXT,
      delta INTEGER NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'system',
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_economy_log_user_created
      ON economy_log(user_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_economy_log_asset
      ON economy_log(asset_type, asset_key, created_at DESC);
  `);
}

function logEconomyChange({ userId, assetType, assetKey, assetName, delta, before, after, reason = 'system', metadata = null }) {
  ensureEconomyLogTable();
  db.prepare(`
    INSERT INTO economy_log(user_id,asset_type,asset_key,asset_name,delta,balance_before,balance_after,reason,metadata_json)
    VALUES(?,?,?,?,?,?,?,?,?)
  `).run(
    String(userId), String(assetType), String(assetKey), assetName ? String(assetName) : null,
    Math.trunc(Number(delta) || 0), Math.trunc(Number(before) || 0), Math.trunc(Number(after) || 0),
    String(reason || 'system'), metadata == null ? null : JSON.stringify(metadata)
  );
}

function getEconomyLog(userId, { limit = 20, offset = 0 } = {}) {
  ensureEconomyLogTable();
  return db.prepare(`
    SELECT * FROM economy_log WHERE user_id=?
    ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(String(userId), Math.max(1, Math.min(100, Number(limit) || 20)), Math.max(0, Number(offset) || 0));
}

ensureEconomyLogTable();
module.exports = { ensureEconomyLogTable, logEconomyChange, getEconomyLog };
