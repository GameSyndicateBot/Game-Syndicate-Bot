const cards = require('../data/cards.json');
const { db } = require('../database/db');

const STANDARD_RARITIES = Object.freeze([
    'common',
    'rare',
    'epic',
    'legendary',
    'mythic',
    'exclusive',
    'holographic',
]);

function normalizeRarity(value) {
    const rarity = String(value || '').trim().toLowerCase();
    return rarity === 'mithic' ? 'mythic' : rarity;
}

function normalizeCardId(value) {
    return String(value).trim();
}

function getDropRarities(card) {
    const rarities = Array.isArray(card?.drop_rarities) && card.drop_rarities.length
        ? card.drop_rarities
        : [card?.base_rarity];

    return rarities.map(normalizeRarity).filter(Boolean);
}

function requiredVariants(filterFn) {
    const result = new Set();

    for (const card of cards) {
        if (!filterFn(card)) continue;

        for (const rarity of getDropRarities(card)) {
            result.add(`${normalizeCardId(card.id)}:${rarity}`);
        }
    }

    return result;
}

/**
 * Набор для достижения за конкретную редкость.
 *
 * Common/Rare/Epic/Legendary/Mythic — это варианты всех карточек основной
 * коллекции `base`. Полной Legendary-коллекцией считаются, например, все
 * базовые карточки именно в варианте Legendary, а не одна карточка, у которой
 * поле base_rarity случайно равно legendary.
 *
 * Exclusive/Holographic — отдельные фиксированные коллекции и проверяются по
 * их фактическим вариантам.
 */
function requiredRarityVariants(rarityValue) {
    const rarity = normalizeRarity(rarityValue);
    const result = new Set();

    for (const card of cards) {
        const cardCollection = String(card.collection || '').toLowerCase();
        const drops = getDropRarities(card);

        const belongs = ['common', 'rare', 'epic', 'legendary', 'mythic'].includes(rarity)
            ? cardCollection === 'base' && drops.includes(rarity)
            : cardCollection === rarity && drops.includes(rarity);

        if (belongs) {
            result.add(`${normalizeCardId(card.id)}:${rarity}`);
        }
    }

    return result;
}

function ownedVariants(userId) {
    const rows = db.prepare(`
        SELECT DISTINCT card_id, rarity
        FROM player_cards
        WHERE user_id = ?
    `).all(String(userId));

    return new Set(rows.map(row =>
        `${normalizeCardId(row.card_id)}:${normalizeRarity(row.rarity)}`
    ));
}

function calculateProgress(owned, required) {
    let count = 0;
    for (const key of required) if (owned.has(key)) count++;

    return {
        owned: count,
        total: required.size,
        complete: required.size > 0 && count === required.size,
        missing: [...required].filter(key => !owned.has(key)),
    };
}

function hasCompleteSet(userId, required) {
    return calculateProgress(ownedVariants(userId), required).complete;
}

function getCardCollectionProgress(userId) {
    const owned = ownedVariants(userId);
    const byRarity = {};

    for (const rarity of STANDARD_RARITIES) {
        byRarity[rarity] = calculateProgress(
            owned,
            requiredRarityVariants(rarity)
        );
    }

    const boss = calculateProgress(
        owned,
        requiredVariants(card => card.collection === 'boss_pack' && card.type === 'boss')
    );
    const minion = calculateProgress(
        owned,
        requiredVariants(card => card.collection === 'boss_pack' && card.type === 'minion')
    );
    const classCards = calculateProgress(
        owned,
        requiredVariants(card => card.collection === 'boss_pack' && card.type === 'class')
    );
    const bossPack = calculateProgress(
        owned,
        requiredVariants(card => card.collection === 'boss_pack')
    );
    const all = calculateProgress(owned, requiredVariants(() => true));

    return { byRarity, boss, minion, class: classCards, bossPack, all };
}

function isCardCollectionAchievementCompleted(userId, achievement) {
    const progress = getCardCollectionProgress(userId);

    switch (achievement.type) {
        case 'card_rarity_complete': {
            const rarity = normalizeRarity(achievement.card_rarity);
            return Boolean(progress.byRarity[rarity]?.complete);
        }
        case 'boss_pack_type_complete':
            return Boolean(progress[String(achievement.card_type || '').toLowerCase()]?.complete);
        case 'boss_pack_complete':
            return progress.bossPack.complete;
        case 'all_cards_complete':
            return progress.all.complete;
        default:
            return false;
    }
}

module.exports = {
    STANDARD_RARITIES,
    getCardCollectionProgress,
    isCardCollectionAchievementCompleted,
    requiredVariants,
    requiredRarityVariants,
    hasCompleteSet,
    normalizeRarity,
    normalizeCardId,
};
