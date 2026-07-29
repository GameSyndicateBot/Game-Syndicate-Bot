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
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS audit_inventory_insert AFTER INSERT ON hero_inventory BEGIN
      INSERT INTO economy_log(user_id,asset_type,asset_key,asset_name,delta,balance_before,balance_after,reason,metadata_json)
      SELECT NEW.user_id,'item',NEW.item_key,COALESCE(hi.name,NEW.item_key),NEW.quantity,0,NEW.quantity,COALESCE(NEW.acquired_from,'inventory_grant'),
        json_object('description',COALESCE(hi.description,''),'rarity',COALESCE(hi.rarity,'common'),'slot',hi.slot,'bonuses',COALESCE(hi.bonuses_json,'{}'),'inventory_id',NEW.id)
      FROM hero_items hi WHERE hi.item_key=NEW.item_key;
    END;
    CREATE TRIGGER IF NOT EXISTS audit_inventory_update AFTER UPDATE OF quantity ON hero_inventory WHEN NEW.quantity<>OLD.quantity BEGIN
      INSERT INTO economy_log(user_id,asset_type,asset_key,asset_name,delta,balance_before,balance_after,reason,metadata_json)
      SELECT NEW.user_id,'item',NEW.item_key,COALESCE(hi.name,NEW.item_key),NEW.quantity-OLD.quantity,OLD.quantity,NEW.quantity,COALESCE(NEW.acquired_from,'inventory_change'),
        json_object('description',COALESCE(hi.description,''),'rarity',COALESCE(hi.rarity,'common'),'slot',hi.slot,'bonuses',COALESCE(hi.bonuses_json,'{}'),'inventory_id',NEW.id)
      FROM hero_items hi WHERE hi.item_key=NEW.item_key;
    END;
    CREATE TRIGGER IF NOT EXISTS audit_companion_insert AFTER INSERT ON hero_companions BEGIN
      INSERT INTO economy_log(user_id,asset_type,asset_key,asset_name,delta,balance_before,balance_after,reason,metadata_json)
      VALUES(NEW.user_id,'companion',NEW.companion_key,NEW.name,1,0,1,'companion_received',
        json_object('rarity',NEW.rarity,'level',NEW.level,'companion_id',NEW.id,'description',COALESCE((SELECT description FROM hero_items WHERE item_key=NEW.companion_key),''),'bonuses',COALESCE((SELECT bonuses_json FROM hero_items WHERE item_key=NEW.companion_key),'{}'),'kind',COALESCE((SELECT item_type FROM hero_items WHERE item_key=NEW.companion_key),'pet')));
    END;
    CREATE TRIGGER IF NOT EXISTS audit_companion_delete AFTER DELETE ON hero_companions BEGIN
      INSERT INTO economy_log(user_id,asset_type,asset_key,asset_name,delta,balance_before,balance_after,reason,metadata_json)
      VALUES(OLD.user_id,'companion',OLD.companion_key,OLD.name,-1,1,0,'companion_removed',
        json_object('rarity',OLD.rarity,'level',OLD.level,'companion_id',OLD.id,'description',COALESCE((SELECT description FROM hero_items WHERE item_key=OLD.companion_key),''),'bonuses',COALESCE((SELECT bonuses_json FROM hero_items WHERE item_key=OLD.companion_key),'{}'),'kind',COALESCE((SELECT item_type FROM hero_items WHERE item_key=OLD.companion_key),'pet')));
    END;
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

function getEconomyLog(userId, { limit = 20, offset = 0, guildWide = false } = {}) {
  ensureEconomyLogTable();
  const safeLimit=Math.max(1,Math.min(100,Number(limit)||20)),safeOffset=Math.max(0,Number(offset)||0);
  if(guildWide)return db.prepare(`SELECT * FROM economy_log ORDER BY id DESC LIMIT ? OFFSET ?`).all(safeLimit,safeOffset);
  return db.prepare(`SELECT * FROM economy_log WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?`).all(String(userId),safeLimit,safeOffset);
}

ensureEconomyLogTable();
module.exports = { ensureEconomyLogTable, logEconomyChange, getEconomyLog };
