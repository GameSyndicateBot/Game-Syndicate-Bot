'use strict';

const { db } = require('../database/db');

const MIGRATION_KEY = 'v20.3.0-base-cards-091-097-grant-561961056197672991';
const TARGET_USER_ID = '561961056197672991';
const CARD_IDS = Object.freeze([91, 92, 93, 94, 95, 96, 97]);
const RARITIES = Object.freeze(['common', 'rare', 'epic', 'legendary', 'mythic']);

function applyBaseCards9197Grant() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS gs_one_time_migrations (
            migration_key TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    if (db.prepare(`
        SELECT 1 FROM gs_one_time_migrations WHERE migration_key = ?
    `).get(MIGRATION_KEY)) {
        return { applied: false, granted: 0, alreadyOwned: 35 };
    }

    const hasVariant = db.prepare(`
        SELECT 1
        FROM player_cards
        WHERE user_id = ? AND card_id = ? AND rarity = ?
        LIMIT 1
    `);

    const nextCopy = db.prepare(`
        SELECT COALESCE(MAX(copy_number), 0) + 1 AS value
        FROM player_cards
        WHERE card_id = ? AND rarity = ? AND edition = 'standard'
    `);

    const insertCard = db.prepare(`
        INSERT INTO player_cards (
            user_id, card_id, rarity, edition, copy_number, obtained_from
        ) VALUES (?, ?, ?, 'standard', ?, 'base_091_097_collection_preservation')
    `);

    const result = db.transaction(() => {
        let granted = 0;
        let alreadyOwned = 0;

        for (const cardId of CARD_IDS) {
            for (const rarity of RARITIES) {
                if (hasVariant.get(TARGET_USER_ID, cardId, rarity)) {
                    alreadyOwned++;
                    continue;
                }

                const copyNumber = Number(nextCopy.get(cardId, rarity)?.value || 1);
                insertCard.run(TARGET_USER_ID, cardId, rarity, copyNumber);
                granted++;
            }
        }

        db.prepare(`
            INSERT INTO gs_one_time_migrations(migration_key) VALUES (?)
        `).run(MIGRATION_KEY);

        return { granted, alreadyOwned };
    })();

    console.log(
        `[Base Cards 091-097] user=${TARGET_USER_ID}, ` +
        `granted=${result.granted}, alreadyOwned=${result.alreadyOwned}`
    );

    return { applied: true, ...result };
}

module.exports = { applyBaseCards9197Grant };
