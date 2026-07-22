const achievements = require('../data/achievements.json');
const { db } = require('../database/db');

const LEGACY_ACHIEVEMENT_ALIASES = Object.freeze({
    cards_full_common: 'cards_common_complete',
    cards_full_rare: 'cards_rare_complete',
});

function migrateLegacyAchievementIds() {
    const tableExists = db.prepare(`
        SELECT 1 FROM sqlite_master
        WHERE type = 'table' AND name = 'player_achievements'
    `).get();
    if (!tableExists) return { migrated: 0, removedDuplicates: 0 };

    let migrated = 0;
    let removedDuplicates = 0;

    const readLegacy = db.prepare(`
        SELECT user_id, achievement_id, unlocked_at
        FROM player_achievements
        WHERE achievement_id = ?
    `);
    const hasCanonical = db.prepare(`
        SELECT 1 FROM player_achievements
        WHERE user_id = ? AND achievement_id = ?
    `);
    const insertCanonical = db.prepare(`
        INSERT OR IGNORE INTO player_achievements(user_id, achievement_id, unlocked_at)
        VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `);
    const deleteLegacy = db.prepare(`
        DELETE FROM player_achievements
        WHERE user_id = ? AND achievement_id = ?
    `);

    const transaction = db.transaction(() => {
        for (const [legacyId, canonicalId] of Object.entries(LEGACY_ACHIEVEMENT_ALIASES)) {
            for (const row of readLegacy.all(legacyId)) {
                const existed = Boolean(hasCanonical.get(row.user_id, canonicalId));
                if (!existed) {
                    migrated += insertCanonical.run(
                        row.user_id,
                        canonicalId,
                        row.unlocked_at
                    ).changes;
                } else {
                    removedDuplicates++;
                }
                deleteLegacy.run(row.user_id, legacyId);
            }
        }
    });

    transaction();
    return { migrated, removedDuplicates };
}

function removeUnknownAchievementIds() {
    const validIds = new Set(achievements.map(item => item.id));
    const rows = db.prepare(`
        SELECT user_id, achievement_id
        FROM player_achievements
    `).all();

    const remove = db.prepare(`
        DELETE FROM player_achievements
        WHERE user_id = ? AND achievement_id = ?
    `);

    let removed = 0;
    const transaction = db.transaction(() => {
        for (const row of rows) {
            if (validIds.has(row.achievement_id)) continue;
            removed += remove.run(row.user_id, row.achievement_id).changes;
        }
    });
    transaction();
    return removed;
}

function reconcileAchievementCounters() {
    const result = db.prepare(`
        UPDATE players
        SET achievements = (
            SELECT COUNT(*)
            FROM player_achievements pa
            WHERE pa.user_id = players.user_id
        )
        WHERE COALESCE(achievements, -1) != (
            SELECT COUNT(*)
            FROM player_achievements pa
            WHERE pa.user_id = players.user_id
        )
    `).run();
    return result.changes;
}

function repairAchievementData() {
    const legacy = migrateLegacyAchievementIds();
    const unknownRemoved = removeUnknownAchievementIds();
    const countersUpdated = reconcileAchievementCounters();

    console.log(
        `[Achievements Repair] legacy migrated=${legacy.migrated}, ` +
        `duplicate legacy removed=${legacy.removedDuplicates}, ` +
        `unknown removed=${unknownRemoved}, counters updated=${countersUpdated}`
    );

    return { ...legacy, unknownRemoved, countersUpdated };
}

module.exports = {
    LEGACY_ACHIEVEMENT_ALIASES,
    migrateLegacyAchievementIds,
    reconcileAchievementCounters,
    repairAchievementData,
};
