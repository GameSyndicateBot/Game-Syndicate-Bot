'use strict';

const { db, addCardDust, getCardDust } = require('../database/db');

const KEY = 'v20.4.3-manual-dust-grant-308557208147329025-1000-2026-08-18';
const USER_ID = '308557208147329025';

function ensureMigrationTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations(
    migration_key TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

function applyManualDustGrantV2043() {
  ensureMigrationTable();
  if (db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(KEY)) {
    return { applied: false, reason: 'already_applied', balance: getCardDust(USER_ID) };
  }

  const result = db.transaction(() => {
    const before = getCardDust(USER_ID);
    addCardDust(USER_ID, 1000, 'Ручное начисление +1000 GS Dust • V20.4.3');
    const after = getCardDust(USER_ID);
    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(KEY);
    return { before, added: 1000, after };
  })();

  console.log('[V20.4.3 Manual Dust Grant]', JSON.stringify({ userId: USER_ID, ...result }));
  return { applied: true, ...result };
}

module.exports = { applyManualDustGrantV2043 };
