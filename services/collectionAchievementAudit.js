const achievements = require('../data/achievements.json');
const { db } = require('../database/db');
const { getRequiredXP } = require('../utils/levelSystem');
const { calculateAchievementDust } = require('../utils/achievementDustEconomy');
const { isCardCollectionAchievementCompleted } = require('../utils/cardCollectionProgress');

const COLLECTION_TYPES = new Set([
    'card_rarity_complete',
    'boss_pack_type_complete',
    'boss_pack_complete',
    'all_cards_complete',
]);

const collectionAchievementMap = new Map(
    achievements
        .filter(achievement => COLLECTION_TYPES.has(achievement.type))
        .map(achievement => [String(achievement.id), achievement])
);

function totalXpFromPlayer(levelValue, xpValue) {
    const level = Math.max(1, Number(levelValue) || 1);
    let total = Math.max(0, Number(xpValue) || 0);

    for (let current = 1; current < level; current++) {
        total += getRequiredXP(current);
    }

    return total;
}

function playerFromTotalXp(totalValue) {
    let remaining = Math.max(0, Number(totalValue) || 0);
    let level = 1;

    while (remaining >= getRequiredXP(level)) {
        remaining -= getRequiredXP(level);
        level++;
    }

    return { level, xp: remaining };
}

function ensureAuditTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS collection_achievement_revocations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            achievement_id TEXT NOT NULL,
            xp_removed INTEGER NOT NULL DEFAULT 0,
            points_removed INTEGER NOT NULL DEFAULT 0,
            dust_removed INTEGER NOT NULL DEFAULT 0,
            dust_unrecovered INTEGER NOT NULL DEFAULT 0,
            revoked_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

/**
 * Удаляет только ошибочно выданные достижения за карточные коллекции и
 * откатывает соответствующие XP, AP и Dust. Проверка безопасна для повторного
 * запуска: уже удалённые записи больше не попадают в выборку.
 */
function auditCollectionAchievements() {
    ensureAuditTable();

    const rows = db.prepare(`
        SELECT pa.user_id, pa.achievement_id
        FROM player_achievements pa
        WHERE pa.achievement_id IN (${[...collectionAchievementMap.keys()].map(() => '?').join(',')})
        ORDER BY pa.user_id, pa.achievement_id
    `).all(...collectionAchievementMap.keys());

    const invalid = rows.filter(row => {
        const achievement = collectionAchievementMap.get(String(row.achievement_id));
        return achievement && !isCardCollectionAchievementCompleted(row.user_id, achievement);
    });

    if (!invalid.length) {
        return { checked: rows.length, revoked: 0, users: 0, dustRemoved: 0 };
    }

    const byUser = new Map();
    for (const row of invalid) {
        const achievement = collectionAchievementMap.get(String(row.achievement_id));
        if (!byUser.has(String(row.user_id))) byUser.set(String(row.user_id), []);
        byUser.get(String(row.user_id)).push(achievement);
    }

    let dustRemovedTotal = 0;

    const transaction = db.transaction(() => {
        const deleteAchievement = db.prepare(`
            DELETE FROM player_achievements
            WHERE user_id = ? AND achievement_id = ?
        `);
        const findDustReward = db.prepare(`
            SELECT dust FROM achievement_dust_rewards
            WHERE user_id = ? AND achievement_id = ?
        `);
        const deleteDustReward = db.prepare(`
            DELETE FROM achievement_dust_rewards
            WHERE user_id = ? AND achievement_id = ?
        `);
        const insertAudit = db.prepare(`
            INSERT INTO collection_achievement_revocations (
                user_id, achievement_id, xp_removed, points_removed,
                dust_removed, dust_unrecovered
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const [userId, invalidAchievements] of byUser) {
            const player = db.prepare(`
                SELECT level, xp, achievement_points, card_dust
                FROM players WHERE user_id = ?
            `).get(userId);
            if (!player) continue;

            let xpToRemove = 0;
            let pointsToRemove = 0;
            let dustToRemove = 0;
            const perAchievement = [];

            for (const achievement of invalidAchievements) {
                const rewardRow = findDustReward.get(userId, String(achievement.id));
                const dustReward = rewardRow == null
                    ? calculateAchievementDust(achievement)
                    : Math.max(0, Number(rewardRow.dust) || 0);

                xpToRemove += Math.max(0, Number(achievement.xp) || 0);
                pointsToRemove += Math.max(0, Number(achievement.points) || 0);
                dustToRemove += dustReward;
                perAchievement.push({ achievement, dustReward });

                deleteAchievement.run(userId, String(achievement.id));
                deleteDustReward.run(userId, String(achievement.id));
            }

            const currentTotalXp = totalXpFromPlayer(player.level, player.xp);
            const corrected = playerFromTotalXp(currentTotalXp - xpToRemove);
            const currentDust = Math.max(0, Number(player.card_dust) || 0);
            const dustRemoved = Math.min(currentDust, dustToRemove);
            const dustUnrecovered = Math.max(0, dustToRemove - dustRemoved);
            dustRemovedTotal += dustRemoved;

            db.prepare(`
                UPDATE players
                SET level = ?,
                    xp = ?,
                    achievement_points = MAX(0, COALESCE(achievement_points, 0) - ?),
                    card_dust = MAX(0, COALESCE(card_dust, 0) - ?),
                    achievements = (
                        SELECT COUNT(*) FROM player_achievements WHERE user_id = ?
                    )
                WHERE user_id = ?
            `).run(
                corrected.level,
                corrected.xp,
                pointsToRemove,
                dustRemoved,
                userId,
                userId
            );

            // Аудит делим пропорционально записям, чтобы было видно, какие
            // достижения были сняты. Невозвращённый Dust фиксируется на
            // последней записи пользователя.
            perAchievement.forEach(({ achievement, dustReward }, index) => {
                const actualForThis = Math.min(dustReward, Math.max(0,
                    dustRemoved - perAchievement
                        .slice(0, index)
                        .reduce((sum, item) => sum + Math.min(item.dustReward, dustRemoved), 0)
                ));
                insertAudit.run(
                    userId,
                    String(achievement.id),
                    Math.max(0, Number(achievement.xp) || 0),
                    Math.max(0, Number(achievement.points) || 0),
                    actualForThis,
                    index === perAchievement.length - 1 ? dustUnrecovered : 0
                );
            });
        }
    });

    transaction();

    return {
        checked: rows.length,
        revoked: invalid.length,
        users: byUser.size,
        dustRemoved: dustRemovedTotal,
    };
}

module.exports = { auditCollectionAchievements };
