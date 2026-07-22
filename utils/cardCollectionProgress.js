const cards = require('../data/cards.json');
const { db } = require('../database/db');

function normalizeRarity(value) {
    const rarity = String(value || '').trim().toLowerCase();
    return rarity === 'mithic' ? 'mythic' : rarity;
}

function normalizeCardId(value) {
    return String(value).trim();
}

function requiredVariants(filterFn) {
    const result = new Set();
    for (const card of cards) {
        if (!filterFn(card)) continue;
        const rarities = Array.isArray(card.drop_rarities) && card.drop_rarities.length
            ? card.drop_rarities
            : [card.base_rarity];
        for (const rarity of rarities) {
            if (rarity) result.add(`${normalizeCardId(card.id)}:${normalizeRarity(rarity)}`);
        }
    }
    return result;
}

function ownedVariants(userId) {
    const rows = db.prepare(`
        SELECT DISTINCT card_id, rarity
        FROM player_cards
        WHERE user_id = ?
    `).all(userId);
    return new Set(rows.map(row => `${normalizeCardId(row.card_id)}:${normalizeRarity(row.rarity)}`));
}

function hasCompleteSet(userId, required) {
    if (!required.size) return false;
    const owned = ownedVariants(userId);
    for (const key of required) if (!owned.has(key)) return false;
    return true;
}

function getCardCollectionProgress(userId) {
    const owned = ownedVariants(userId);
    const calculate = required => {
        let count = 0;
        for (const key of required) if (owned.has(key)) count++;
        return { owned: count, total: required.size, complete: required.size > 0 && count === required.size };
    };

    const byRarity = {};
    for (const rarity of ['common', 'rare', 'epic', 'legendary', 'mythic', 'exclusive', 'holographic']) {
        byRarity[rarity] = calculate(requiredVariants(card =>
            (card.drop_rarities || [card.base_rarity]).map(String).map(normalizeRarity).includes(rarity)
        ));
    }

    const boss = calculate(requiredVariants(card => card.collection === 'boss_pack' && card.type === 'boss'));
    const minion = calculate(requiredVariants(card => card.collection === 'boss_pack' && card.type === 'minion'));
    const classCards = calculate(requiredVariants(card => card.collection === 'boss_pack' && card.type === 'class'));
    const bossPack = calculate(requiredVariants(card => card.collection === 'boss_pack'));
    const all = calculate(requiredVariants(() => true));

    return { byRarity, boss, minion, class: classCards, bossPack, all };
}

function isCardCollectionAchievementCompleted(userId, achievement) {
    const progress = getCardCollectionProgress(userId);
    switch (achievement.type) {
        case 'card_rarity_complete':
            return Boolean(progress.byRarity[String(achievement.card_rarity || '').toLowerCase()]?.complete);
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
    getCardCollectionProgress,
    isCardCollectionAchievementCompleted,
    requiredVariants,
    hasCompleteSet,
    normalizeRarity,
    normalizeCardId,
};
