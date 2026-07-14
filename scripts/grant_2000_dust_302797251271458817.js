'use strict';

const { db } = require('../database/db');

const USER_ID = '302797251271458817';
const DUST = 2000;

const player = db.prepare(`
SELECT username, COALESCE(card_dust,0) AS dust
FROM players
WHERE user_id = ?
`).get(USER_ID);

if (!player) {
    console.error('Игрок не найден:', USER_ID);
    process.exit(1);
}

db.prepare(`
UPDATE players
SET card_dust = COALESCE(card_dust,0) + ?
WHERE user_id = ?
`).run(DUST, USER_ID);

const updated = db.prepare(`
SELECT COALESCE(card_dust,0) AS dust
FROM players
WHERE user_id = ?
`).get(USER_ID);

console.log(`✅ ${player.username}: ${player.dust} -> ${updated.dust} GS Dust`);
