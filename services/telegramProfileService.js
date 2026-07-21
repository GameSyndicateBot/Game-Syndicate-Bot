'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../database/db');
const { getRequiredXP } = require('../utils/levelSystem');
const { getLinkByTelegramId } = require('./telegramLink');

const achievementsPath = path.join(__dirname, '..', 'data', 'achievements.json');
let achievementDefinitions = [];

try {
    achievementDefinitions = JSON.parse(fs.readFileSync(achievementsPath, 'utf8'));
} catch (error) {
    console.error('Не удалось загрузить достижения для Telegram:', error.message);
}

const achievementById = new Map(
    achievementDefinitions.map(item => [String(item.id), item]),
);

function tableExists(name) {
    return Boolean(db.prepare(`
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
    `).get(name));
}

function getRank(level) {
    if (level >= 50) return 'Легенда';
    if (level >= 40) return 'Грандмастер';
    if (level >= 30) return 'Чемпион';
    if (level >= 20) return 'Ветеран';
    if (level >= 10) return 'Опытный';
    if (level >= 5) return 'Участник';
    return 'Новичок';
}

function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) return `${hours} ч ${minutes} мин`;
    return `${minutes} мин`;
}

function getLinkedDiscordId(telegramUserId) {
    return getLinkByTelegramId(telegramUserId)?.discord_user_id || null;
}

function getPlayerByTelegramId(telegramUserId) {
    const discordUserId = getLinkedDiscordId(telegramUserId);
    if (!discordUserId) return null;

    const player = db.prepare(`
        SELECT *
        FROM players
        WHERE user_id = ?
    `).get(String(discordUserId));

    return {
        discordUserId: String(discordUserId),
        player: player || null,
    };
}

function getProfile(telegramUserId) {
    const linked = getPlayerByTelegramId(telegramUserId);
    if (!linked) return null;

    const player = linked.player;
    if (!player) {
        return {
            discordUserId: linked.discordUserId,
            player: null,
            uniqueCards: 0,
            totalCopies: 0,
            totalCards: 0,
            achievementsCount: 0,
        };
    }

    const cardStats = tableExists('player_cards')
        ? db.prepare(`
            SELECT
                COUNT(*) AS total_copies,
                COUNT(DISTINCT card_id) AS unique_cards
            FROM player_cards
            WHERE user_id = ?
        `).get(linked.discordUserId)
        : { total_copies: 0, unique_cards: 0 };

    const totalCards = tableExists('cards')
        ? Number(db.prepare('SELECT COUNT(*) AS count FROM cards').get()?.count || 0)
        : 0;

    const achievementsCount = tableExists('player_achievements')
        ? Number(db.prepare(`
            SELECT COUNT(*) AS count
            FROM player_achievements
            WHERE user_id = ?
        `).get(linked.discordUserId)?.count || 0)
        : Number(player.achievements || 0);

    return {
        discordUserId: linked.discordUserId,
        player,
        uniqueCards: Number(cardStats.unique_cards || 0),
        totalCopies: Number(cardStats.total_copies || 0),
        totalCards,
        achievementsCount,
        requiredXp: getRequiredXP(Number(player.level || 1)),
        rank: getRank(Number(player.level || 1)),
    };
}

function getCardStats(telegramUserId) {
    const linked = getPlayerByTelegramId(telegramUserId);
    if (!linked) return null;

    const discordUserId = linked.discordUserId;
    const rows = tableExists('player_cards')
        ? db.prepare(`
            SELECT LOWER(rarity) AS rarity, COUNT(*) AS copies,
                   COUNT(DISTINCT card_id) AS unique_cards
            FROM player_cards
            WHERE user_id = ?
            GROUP BY LOWER(rarity)
        `).all(discordUserId)
        : [];

    const result = {
        common: { copies: 0, unique: 0 },
        rare: { copies: 0, unique: 0 },
        epic: { copies: 0, unique: 0 },
        legendary: { copies: 0, unique: 0 },
        mythic: { copies: 0, unique: 0 },
        exclusive: { copies: 0, unique: 0 },
        holographic: { copies: 0, unique: 0 },
        treasure: { copies: 0, unique: 0 },
    };

    for (const row of rows) {
        if (!result[row.rarity]) {
            result[row.rarity] = { copies: 0, unique: 0 };
        }
        result[row.rarity] = {
            copies: Number(row.copies || 0),
            unique: Number(row.unique_cards || 0),
        };
    }

    const totalUnique = Object.values(result)
        .reduce((sum, item) => sum + item.unique, 0);
    const totalCopies = Object.values(result)
        .reduce((sum, item) => sum + item.copies, 0);
    const totalCards = tableExists('cards')
        ? Number(db.prepare('SELECT COUNT(*) AS count FROM cards').get()?.count || 0)
        : 0;

    return { discordUserId, rarities: result, totalUnique, totalCopies, totalCards };
}

function getAchievements(telegramUserId, limit = 12) {
    const linked = getPlayerByTelegramId(telegramUserId);
    if (!linked) return null;

    const rows = tableExists('player_achievements')
        ? db.prepare(`
            SELECT achievement_id, unlocked_at
            FROM player_achievements
            WHERE user_id = ?
            ORDER BY datetime(unlocked_at) DESC
            LIMIT ?
        `).all(linked.discordUserId, Number(limit))
        : [];

    const unlockedCount = tableExists('player_achievements')
        ? Number(db.prepare(`
            SELECT COUNT(*) AS count
            FROM player_achievements
            WHERE user_id = ?
        `).get(linked.discordUserId)?.count || 0)
        : 0;

    const items = rows.map(row => {
        const definition = achievementById.get(String(row.achievement_id));
        return {
            id: row.achievement_id,
            title: definition?.title || row.achievement_id,
            rarity: definition?.rarity || 'common',
            unlockedAt: row.unlocked_at,
        };
    });

    return {
        discordUserId: linked.discordUserId,
        unlockedCount,
        totalCount: achievementDefinitions.length,
        items,
    };
}

function getDust(telegramUserId) {
    const linked = getPlayerByTelegramId(telegramUserId);
    if (!linked) return null;

    return {
        discordUserId: linked.discordUserId,
        balance: Number(linked.player?.card_dust || 0),
    };
}

module.exports = {
    getProfile,
    getCardStats,
    getAchievements,
    getDust,
    formatDuration,
};
