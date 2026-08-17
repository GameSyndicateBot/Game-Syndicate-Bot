'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { db, databasePath, getCardDust, addCardDust } = require('../database/db');

const MIGRATION_KEY = 'v20.3.4:rollback-recovery-2026-08-17';
const TARGETS = Object.freeze({
  '308557208147329025': {
    classFloors: { bard: 20, archer: 8 },
    dustFloor: 20000,
    restoreCaravanSince: '2026-08-14 00:00:00',
    recoverReportedGloves: true,
  },
  '506371696878551041': {
    classFloors: {},
    dustFloor: 0,
    restoreCaravanSince: '2026-08-14 00:00:00',
    preferredCaravanNames: ['Рунная Сумка Тихой тени', 'Рунный Сумка Тихой тени'],
  },
});

function ensureMigrationTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_correction_migrations(
      key TEXT PRIMARY KEY,
      details_json TEXT,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS economy_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,asset_type TEXT NOT NULL,asset_key TEXT NOT NULL,
      asset_name TEXT,delta INTEGER NOT NULL,balance_before INTEGER NOT NULL,balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'system',metadata_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_economy_log_user_created ON economy_log(user_id,created_at DESC,id DESC);
  `);
}

function tableExists(source, name) {
  try { return Boolean(source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
  catch (_) { return false; }
}

function backupDirectory() {
  return path.join(path.dirname(databasePath), 'backups');
}

function listCandidateBackups() {
  const dir = backupDirectory();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => /^database-backup-.*\.sqlite$/i.test(name))
    .map(name => ({ path: path.join(dir, name), stat: fs.statSync(path.join(dir, name)) }))
    .filter(x => x.stat.isFile())
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .slice(0, 30)
    .map(x => x.path);
}

function safeOpenBackup(filePath) {
  try {
    const source = new Database(filePath, { readonly: true, fileMustExist: true });
    try { source.pragma('query_only = ON'); } catch (_) {}
    return source;
  } catch (error) {
    console.warn(`[Rollback Recovery] Не удалось открыть ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

function getBackupDust(source, userId) {
  if (!tableExists(source, 'players')) return null;
  try {
    const row = source.prepare('SELECT card_dust FROM players WHERE user_id=?').get(String(userId));
    return row ? Number(row.card_dust || 0) : null;
  } catch (_) { return null; }
}

function getBackupClass(source, userId, classKey) {
  if (!tableExists(source, 'hero_class_progress')) return null;
  try {
    const row = source.prepare('SELECT level,xp,expeditions_completed FROM hero_class_progress WHERE user_id=? AND class_key=?').get(String(userId), String(classKey));
    return row ? {
      level: Math.max(1, Number(row.level || 1)),
      xp: Math.max(0, Number(row.xp || 0)),
      expeditions_completed: Math.max(0, Number(row.expeditions_completed || 0)),
    } : null;
  } catch (_) { return null; }
}

function mergeEconomyHistory(source, userId) {
  if (!tableExists(source, 'economy_log')) return 0;
  let inserted = 0;
  try {
    const rows = source.prepare(`SELECT asset_type,asset_key,asset_name,delta,balance_before,balance_after,reason,metadata_json,created_at
      FROM economy_log WHERE user_id=? AND created_at >= '2026-08-14 00:00:00' ORDER BY id ASC`).all(String(userId));
    const exists = db.prepare(`SELECT 1 FROM economy_log WHERE user_id=? AND asset_type=? AND asset_key=? AND delta=?
      AND balance_before=? AND balance_after=? AND reason=? AND created_at=? LIMIT 1`);
    const add = db.prepare(`INSERT INTO economy_log(user_id,asset_type,asset_key,asset_name,delta,balance_before,balance_after,reason,metadata_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`);
    for (const row of rows) {
      if (exists.get(String(userId), row.asset_type, row.asset_key, row.delta, row.balance_before, row.balance_after, row.reason, row.created_at)) continue;
      add.run(String(userId), row.asset_type, row.asset_key, row.asset_name, row.delta, row.balance_before, row.balance_after, row.reason, row.metadata_json, row.created_at);
      inserted += 1;
    }
  } catch (error) {
    console.warn(`[Rollback Recovery] economy_log ${userId}: ${error.message}`);
  }
  return inserted;
}

function mergeHeroHistory(source, userId) {
  if (!tableExists(source, 'hero_history')) return 0;
  let inserted = 0;
  try {
    const rows = source.prepare(`SELECT event_type,description,metadata_json,created_at FROM hero_history
      WHERE user_id=? AND created_at >= '2026-08-14 00:00:00' ORDER BY id ASC`).all(String(userId));
    const exists = db.prepare(`SELECT 1 FROM hero_history WHERE user_id=? AND event_type=? AND description=? AND created_at=? LIMIT 1`);
    const add = db.prepare(`INSERT INTO hero_history(user_id,event_type,description,metadata_json,created_at) VALUES(?,?,?,?,?)`);
    for (const row of rows) {
      if (exists.get(String(userId), row.event_type, row.description, row.created_at)) continue;
      add.run(String(userId), row.event_type, row.description, row.metadata_json, row.created_at);
      inserted += 1;
    }
  } catch (error) {
    console.warn(`[Rollback Recovery] hero_history ${userId}: ${error.message}`);
  }
  return inserted;
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch (_) { return fallback; }
}

function normalizeOfferItem(row) {
  const item = parseJson(row.item_json, {});
  return {
    key: String(row.item_key || item.key || ''),
    name: String(item.name || row.item_name || '').trim(),
    type: String(item.type || item.item_type || 'equipment'),
    rarity: String(row.rarity || item.rarity || 'common'),
    description: String(item.description || ''),
    slot: item.slot || null,
    bonuses: item.bonuses || {},
    lore: String(item.lore || ''),
    icon: item.icon || '🎁',
  };
}

function currentOwnsItem(userId, item) {
  try {
    const inv = db.prepare('SELECT quantity FROM hero_inventory WHERE user_id=? AND item_key=?').get(String(userId), item.key);
    if (Number(inv?.quantity || 0) > 0) return true;
    if (item.name) {
      const byName = db.prepare(`SELECT hi.quantity FROM hero_inventory hi JOIN hero_items h ON h.item_key=hi.item_key
        WHERE hi.user_id=? AND lower(h.name)=lower(?) LIMIT 1`).get(String(userId), item.name);
      if (Number(byName?.quantity || 0) > 0) return true;
    }
  } catch (_) {}
  return false;
}

function grantRecoveredCaravanItem(userId, item, source = 'rollback_recovery_v20.3.4') {
  if (!item?.key || currentOwnsItem(userId, item)) return false;
  db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
    VALUES(?,?,?,?,?,?,?,?,0)
    ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,rarity=excluded.rarity,
      description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore`)
    .run(item.key, item.name || item.key, item.type, item.rarity, item.description, item.slot, JSON.stringify(item.bonuses || {}), item.lore);
  db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,?)
    ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=MAX(quantity,1),acquired_from=excluded.acquired_from`)
    .run(String(userId), item.key, source);
  db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,?)`)
    .run(String(userId), item.key, source);
  return true;
}

function recoverCaravanPurchases(source, userId, since, preferredNames = [], recoverReportedGloves = false) {
  if (!tableExists(source, 'caravan_history') || !tableExists(source, 'caravan_offers')) return [];
  const restored = [];
  try {
    const purchases = source.prepare(`SELECT h.item_key,h.created_at,o.item_json,o.rarity,o.current_price
      FROM caravan_history h
      LEFT JOIN caravan_offers o ON o.user_id=h.user_id AND o.item_key=h.item_key AND o.day_key=h.day_key
      WHERE h.user_id=? AND h.action='purchased' AND h.created_at>=?
      ORDER BY h.created_at DESC`).all(String(userId), since || '2026-08-14 00:00:00');

    for (const row of purchases) {
      if (!row.item_json) continue;
      const item = normalizeOfferItem(row);
      if (grantRecoveredCaravanItem(userId, item)) restored.push(item.name || item.key);
    }

    // If the purchase marker itself was lost in the rollback, recover a specifically
    // reported item from historical offers by its visible name.
    const historicalOffers = source.prepare(`SELECT item_key,item_json,rarity,current_price,created_at FROM caravan_offers
      WHERE user_id=? AND created_at>=? ORDER BY id DESC`).all(String(userId), since || '2026-08-14 00:00:00');

    for (const wanted of preferredNames || []) {
      if (restored.some(name => String(name).toLowerCase() === String(wanted).toLowerCase())) continue;
      const found = historicalOffers.map(normalizeOfferItem).find(item => String(item.name).toLowerCase() === String(wanted).toLowerCase());
      if (found && grantRecoveredCaravanItem(userId, found, 'rollback_recovery_reported_v20.3.4')) restored.push(found.name || found.key);
    }

    // Player 308557208147329025 explicitly reported caravan gloves bought on 17.08,
    // but did not remember the exact name. If the rollback erased the purchase marker,
    // recover the newest missing glove/gauntlet offer from that day's snapshots.
    if (recoverReportedGloves) {
      const glove = historicalOffers
        .filter(row => String(row.created_at || '').startsWith('2026-08-17'))
        .map(normalizeOfferItem)
        .find(item => {
          const name = String(item.name || '').toLowerCase();
          const slot = String(item.slot || '').toLowerCase();
          return !currentOwnsItem(userId, item) && (/перчат|рукавиц|glove|gauntlet/.test(name) || /glove|hands|hand/.test(slot));
        });
      if (glove && grantRecoveredCaravanItem(userId, glove, 'rollback_recovery_reported_gloves_v20.3.4')) restored.push(glove.name || glove.key);
    }
  } catch (error) {
    console.warn(`[Rollback Recovery] caravan ${userId}: ${error.message}`);
  }
  return restored;
}

function upsertClassFloor(userId, classKey, historical, floor) {
  const existing = db.prepare('SELECT level,xp,expeditions_completed FROM hero_class_progress WHERE user_id=? AND class_key=?').get(String(userId), classKey);
  const candidates = [
    { level: Math.max(1, Number(existing?.level || 1)), xp: Math.max(0, Number(existing?.xp || 0)), expeditions_completed: Math.max(0, Number(existing?.expeditions_completed || 0)) },
    historical || null,
    { level: Math.max(1, Number(floor || 1)), xp: 0, expeditions_completed: 0 },
  ].filter(Boolean);
  candidates.sort((a, b) => (b.level - a.level) || (b.xp - a.xp));
  const best = candidates[0];
  db.prepare(`INSERT INTO hero_class_progress(user_id,class_key,level,xp,expeditions_completed) VALUES(?,?,?,?,?)
    ON CONFLICT(user_id,class_key) DO UPDATE SET level=excluded.level,xp=excluded.xp,
      expeditions_completed=MAX(hero_class_progress.expeditions_completed,excluded.expeditions_completed),updated_at=CURRENT_TIMESTAMP`)
    .run(String(userId), classKey, best.level, best.xp, best.expeditions_completed);
  const hero = db.prepare('SELECT class_key FROM heroes WHERE user_id=?').get(String(userId));
  if (String(hero?.class_key || '').toLowerCase() === classKey) {
    db.prepare('UPDATE heroes SET level=?,xp=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(best.level, best.xp, String(userId));
  }
  return best;
}

function applyRollbackRecoveryV2034() {
  ensureMigrationTable();
  if (db.prepare('SELECT 1 FROM player_correction_migrations WHERE key=?').get(MIGRATION_KEY)) {
    return { applied: false, reason: 'already_applied' };
  }

  const backupPaths = listCandidateBackups();
  const snapshots = [];
  for (const filePath of backupPaths) {
    const source = safeOpenBackup(filePath);
    if (source) snapshots.push({ filePath, source });
  }

  const report = { applied: true, backupsScanned: snapshots.length, users: {} };
  try {
    db.transaction(() => {
      for (const [userId, config] of Object.entries(TARGETS)) {
        const userReport = { dustBefore: getCardDust(userId), dustAfter: null, classes: {}, economyRows: 0, heroHistoryRows: 0, caravanItems: [] };

        let maxHistoricalDust = 0;
        const bestClasses = {};
        for (const { source } of snapshots) {
          const dust = getBackupDust(source, userId);
          if (dust != null) maxHistoricalDust = Math.max(maxHistoricalDust, dust);
          for (const [classKey, floor] of Object.entries(config.classFloors || {})) {
            const row = getBackupClass(source, userId, classKey);
            const currentBest = bestClasses[classKey];
            if (row && (!currentBest || row.level > currentBest.level || (row.level === currentBest.level && row.xp > currentBest.xp))) bestClasses[classKey] = row;
            if (!bestClasses[classKey]) bestClasses[classKey] = { level: floor, xp: 0, expeditions_completed: 0 };
          }
        }

        const desiredDust = Math.max(userReport.dustBefore, maxHistoricalDust, Number(config.dustFloor || 0));
        if (desiredDust > userReport.dustBefore) {
          addCardDust(userId, desiredDust - userReport.dustBefore, 'Восстановление прогресса после отката 17.08.2026');
        }
        userReport.dustAfter = getCardDust(userId);

        for (const [classKey, floor] of Object.entries(config.classFloors || {})) {
          userReport.classes[classKey] = upsertClassFloor(userId, classKey, bestClasses[classKey], floor);
        }

        // Merge missing journal/history rows from every available backup. Duplicate guards
        // keep this idempotent even when the same logical row exists in multiple snapshots.
        for (const { source } of [...snapshots].reverse()) {
          userReport.economyRows += mergeEconomyHistory(source, userId);
          userReport.heroHistoryRows += mergeHeroHistory(source, userId);
        }

        // Newest snapshots first: recover only missing caravan purchases/reported goods.
        for (const { source } of snapshots) {
          const restored = recoverCaravanPurchases(source, userId, config.restoreCaravanSince, config.preferredCaravanNames || [], Boolean(config.recoverReportedGloves));
          for (const name of restored) if (!userReport.caravanItems.includes(name)) userReport.caravanItems.push(name);
        }

        report.users[userId] = userReport;
      }

      db.prepare('INSERT INTO player_correction_migrations(key,details_json) VALUES(?,?)').run(MIGRATION_KEY, JSON.stringify(report));
    })();
  } finally {
    for (const { source } of snapshots) {
      try { source.close(); } catch (_) {}
    }
  }

  console.log('[Rollback Recovery V20.3.4]', JSON.stringify(report));
  return report;
}

module.exports = { applyRollbackRecoveryV2034 };
