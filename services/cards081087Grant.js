'use strict';

const cards = require('../data/cards.json');
const { db } = require('../database/db');

const TARGET_USER_ID = '561961056197672991';
const CARD_IDS = Object.freeze([81, 82, 83, 84, 85, 86, 87]);
const RARITIES = Object.freeze(['common', 'rare', 'epic', 'legendary', 'mythic']);
const MIGRATION_KEY = 'cards-081-087:grant:561961056197672991:v1';

function applyCards081087Grant() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS card_content_migrations (
            migration_key TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            details_json TEXT NOT NULL DEFAULT '{}'
        )
    `);

    const alreadyApplied = db.prepare(
        'SELECT 1 FROM card_content_migrations WHERE migration_key = ?'
    ).get(MIGRATION_KEY);

    if (alreadyApplied) {
        console.log('[Cards 081-087] Каталог активен; целевая выдача уже применена.');
        return { applied: false, granted: 0, skipped: 35 };
    }

    const catalog = new Map(
        cards
            .filter(card => card.collection === 'base' && CARD_IDS.includes(Number(card.id)))
            .map(card => [Number(card.id), card])
    );

    if (catalog.size !== CARD_IDS.length) {
        throw new Error(
            `Каталог 081-087 неполный: найдено ${catalog.size} из ${CARD_IDS.length} карточек.`
        );
    }

    const insertCatalog = db.prepare(`
        INSERT INTO cards(id, name, type, series, base_rarity, image)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            series = excluded.series,
            base_rarity = excluded.base_rarity,
            image = excluded.image
    `);

    const hasVariant = db.prepare(`
        SELECT 1
        FROM player_cards
        WHERE user_id = ? AND card_id = ? AND rarity = ? AND edition = 'standard'
        LIMIT 1
    `);

    const nextCopy = db.prepare(`
        SELECT COALESCE(MAX(copy_number), 0) + 1 AS next_copy
        FROM player_cards
        WHERE card_id = ? AND rarity = ? AND edition = 'standard'
    `);

    const insertOwned = db.prepare(`
        INSERT INTO player_cards(
            user_id, card_id, rarity, edition, copy_number, obtained_from
        ) VALUES(?, ?, ?, 'standard', ?, ?)
    `);

    let granted = 0;
    let skipped = 0;

    db.transaction(() => {
        for (const cardId of CARD_IDS) {
            const card = catalog.get(cardId);
            insertCatalog.run(
                card.id,
                card.name,
                card.type,
                card.series,
                card.base_rarity,
                card.image || null
            );

            for (const rarity of RARITIES) {
                if (hasVariant.get(TARGET_USER_ID, cardId, rarity)) {
                    skipped++;
                    continue;
                }

                const copyNumber = Number(
                    nextCopy.get(cardId, rarity)?.next_copy || 1
                );

                insertOwned.run(
                    TARGET_USER_ID,
                    cardId,
                    rarity,
                    copyNumber,
                    'cards_081_087_owner_grant'
                );
                granted++;
            }
        }

        db.prepare(`
            INSERT INTO card_content_migrations(
                migration_key, details_json
            ) VALUES(?, ?)
        `).run(
            MIGRATION_KEY,
            JSON.stringify({
                targetUserId: TARGET_USER_ID,
                cardIds: CARD_IDS,
                rarities: RARITIES,
                granted,
                skipped,
            })
        );
    })();

    console.log(
        `[Cards 081-087] Игроку ${TARGET_USER_ID}: ` +
        `выдано=${granted}, уже было=${skipped}. ` +
        `Коллекционные достижения будут пересчитаны штатным backfill.`
    );

    return { applied: true, granted, skipped };
}

module.exports = {
    applyCards081087Grant,
    TARGET_USER_ID,
    CARD_IDS,
    RARITIES,
};
