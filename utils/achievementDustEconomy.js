const achievements = require('../data/achievements.json');
const { db, addCardDust } = require('../database/db');

const OLD_DUST_BY_RARITY = Object.freeze({
    common: 5,
    rare: 10,
    epic: 20,
    legendary: 35,
    mythic: 60,
});

const MIN_DUST_BY_RARITY = Object.freeze({
    common: 20,
    rare: 50,
    epic: 100,
    legendary: 200,
    mythic: 350,
});

const POINT_MULTIPLIER = 3;
const ECONOMY_VERSION = 'achievement_dust_v2_2026_07';

const achievementMap = new Map(
    achievements.map(achievement => [achievement.id, achievement])
);

function normalizeRarity(rarity) {
    const value = String(rarity || 'common').toLowerCase();
    return Object.prototype.hasOwnProperty.call(MIN_DUST_BY_RARITY, value)
        ? value
        : 'common';
}

function calculateAchievementDust(achievement) {
    const rarity = normalizeRarity(achievement?.rarity);
    const points = Math.max(0, Number(achievement?.points || 0));
    const minimum = MIN_DUST_BY_RARITY[rarity];

    return Math.max(
        minimum,
        Math.round(points * POINT_MULTIPLIER)
    );
}

function getLegacyAchievementDust(achievement) {
    const rarity = normalizeRarity(achievement?.rarity);
    return OLD_DUST_BY_RARITY[rarity] ?? 5;
}

function ensureAchievementDustTables() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS achievement_dust_rewards (
            user_id TEXT NOT NULL,
            achievement_id TEXT NOT NULL,
            dust INTEGER NOT NULL,
            claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(user_id, achievement_id)
        );

        CREATE TABLE IF NOT EXISTS achievement_dust_migrations (
            version TEXT PRIMARY KEY,
            users_updated INTEGER NOT NULL DEFAULT 0,
            achievements_updated INTEGER NOT NULL DEFAULT 0,
            dust_distributed INTEGER NOT NULL DEFAULT 0,
            applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

function grantAchievementDust(userId, achievement) {
    ensureAchievementDustTables();

    const reward = calculateAchievementDust(achievement);
    const achievementId = String(achievement.id);

    const existing = db.prepare(`
        SELECT dust
        FROM achievement_dust_rewards
        WHERE user_id = ? AND achievement_id = ?
    `).get(String(userId), achievementId);

    if (existing) {
        return {
            granted: 0,
            reward: Number(existing.dust || 0),
            alreadyGranted: true,
        };
    }

    db.transaction(() => {
        db.prepare(`
            INSERT INTO achievement_dust_rewards (
                user_id,
                achievement_id,
                dust
            )
            VALUES (?, ?, ?)
        `).run(String(userId), achievementId, reward);

        addCardDust(String(userId), reward);
    })();

    return {
        granted: reward,
        reward,
        alreadyGranted: false,
    };
}

function rebalancePreviouslyUnlockedAchievements() {
    ensureAchievementDustTables();

    const applied = db.prepare(`
        SELECT 1
        FROM achievement_dust_migrations
        WHERE version = ?
    `).get(ECONOMY_VERSION);

    if (applied) {
        return {
            applied: false,
            reason: 'already_applied',
            version: ECONOMY_VERSION,
        };
    }

    const unlockedRows = db.prepare(`
        SELECT
            pa.user_id,
            pa.achievement_id,
            adr.dust AS recorded_dust
        FROM player_achievements pa
        LEFT JOIN achievement_dust_rewards adr
          ON adr.user_id = pa.user_id
         AND adr.achievement_id = pa.achievement_id
        ORDER BY pa.user_id, pa.achievement_id
    `).all();

    const differencesByUser = new Map();
    const updates = [];

    for (const row of unlockedRows) {
        const achievement = achievementMap.get(row.achievement_id);
        if (!achievement) continue;

        const targetDust = calculateAchievementDust(achievement);

        // Old versions occasionally unlocked an achievement without writing
        // achievement_dust_rewards. In that case the old rarity reward is used
        // as the safest estimate, so the participant receives only the increase.
        const previousDust = row.recorded_dust == null
            ? getLegacyAchievementDust(achievement)
            : Math.max(0, Number(row.recorded_dust));

        const difference = Math.max(0, targetDust - previousDust);

        updates.push({
            userId: String(row.user_id),
            achievementId: String(row.achievement_id),
            targetDust,
            difference,
        });

        if (difference > 0) {
            differencesByUser.set(
                String(row.user_id),
                (differencesByUser.get(String(row.user_id)) || 0) + difference
            );
        }
    }

    const transaction = db.transaction(() => {
        const upsertReward = db.prepare(`
            INSERT INTO achievement_dust_rewards (
                user_id,
                achievement_id,
                dust
            )
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, achievement_id)
            DO UPDATE SET dust = excluded.dust
        `);

        for (const update of updates) {
            upsertReward.run(
                update.userId,
                update.achievementId,
                update.targetDust
            );
        }

        for (const [userId, dust] of differencesByUser) {
            addCardDust(userId, dust);
        }

        const totalDust = [...differencesByUser.values()]
            .reduce((sum, value) => sum + value, 0);

        db.prepare(`
            INSERT INTO achievement_dust_migrations (
                version,
                users_updated,
                achievements_updated,
                dust_distributed
            )
            VALUES (?, ?, ?, ?)
        `).run(
            ECONOMY_VERSION,
            differencesByUser.size,
            updates.filter(update => update.difference > 0).length,
            totalDust
        );
    });

    transaction();

    const totalDust = [...differencesByUser.values()]
        .reduce((sum, value) => sum + value, 0);

    return {
        applied: true,
        version: ECONOMY_VERSION,
        usersUpdated: differencesByUser.size,
        achievementsUpdated: updates.filter(update => update.difference > 0).length,
        dustDistributed: totalDust,
    };
}

module.exports = {
    ECONOMY_VERSION,
    MIN_DUST_BY_RARITY,
    POINT_MULTIPLIER,
    calculateAchievementDust,
    grantAchievementDust,
    rebalancePreviouslyUnlockedAchievements,
};
