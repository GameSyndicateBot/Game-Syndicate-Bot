'use strict';

const { db, unlockAchievement } = require('../database/db');

const KEY = 'v20.3.6-restore-quick-streak-308557208147329025';
const USER_ID = '308557208147329025';

function applyQuickStreakRecoveryV2036() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS gs_one_time_migrations(
            migration_key TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    if (db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(KEY)) {
        return { applied: false };
    }

    const result = db.transaction(() => {
        const row = db.prepare(`
            SELECT total_wins, current_streak, best_streak, types_json, last_win_round_id
            FROM quick_event_player_stats
            WHERE user_id = ?
        `).get(USER_ID);

        if (row) {
            db.prepare(`
                UPDATE quick_event_player_stats
                SET current_streak = CASE WHEN current_streak < 5 THEN 5 ELSE current_streak END,
                    best_streak = CASE WHEN best_streak < 5 THEN 5 ELSE best_streak END,
                    updated_at = ?
                WHERE user_id = ?
            `).run(Date.now(), USER_ID);
        } else {
            db.prepare(`
                INSERT INTO quick_event_player_stats(
                    user_id,total_wins,current_streak,best_streak,types_json,last_win_round_id,updated_at
                ) VALUES(?,?,?,?,?,?,?)
            `).run(USER_ID, 0, 5, 5, '[]', null, Date.now());
        }

        const hasAchievement = db.prepare(`
            SELECT 1 FROM player_achievements
            WHERE user_id = ? AND achievement_id = 'quick_event_streak_5'
        `).get(USER_ID);

        if (!hasAchievement) {
            unlockAchievement(USER_ID, 'quick_event_streak_5');
        }

        db.prepare(`
            UPDATE players
            SET achievements = (
                SELECT COUNT(*)
                FROM player_achievements pa
                WHERE pa.user_id = players.user_id
            )
            WHERE user_id = ?
        `).run(USER_ID);

        db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(KEY);

        const after = db.prepare(`
            SELECT total_wins, current_streak, best_streak
            FROM quick_event_player_stats
            WHERE user_id = ?
        `).get(USER_ID);

        return {
            currentStreak: Number(after?.current_streak || 0),
            bestStreak: Number(after?.best_streak || 0),
            achievementRestored: !hasAchievement,
        };
    })();

    console.log(
        `[V20.3.6 Quick Streak Recovery] user=${USER_ID} ` +
        `current=${result.currentStreak} best=${result.bestStreak} ` +
        `achievementRestored=${result.achievementRestored}`
    );

    return { applied: true, ...result };
}

module.exports = { applyQuickStreakRecoveryV2036 };
