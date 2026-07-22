const { db, getOrCreatePlayer } = require('../database/db');
const { checkAchievements } = require('../utils/checkAchievements');

function consecutiveStats(dates) {
    const sorted = [...new Set(dates)].sort();
    if (!sorted.length) return { current: 0, best: 0, lastDate: null };
    let best = 1;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(`${sorted[i - 1]}T00:00:00Z`);
        const next = new Date(`${sorted[i]}T00:00:00Z`);
        const diff = Math.round((next - prev) / 86400000);
        run = diff === 1 ? run + 1 : 1;
        best = Math.max(best, run);
    }
    return { current: run, best, lastDate: sorted[sorted.length - 1] };
}

function rebuildReactionStreaks() {
    const users = db.prepare(`SELECT user_id FROM players`).all();
    const upsert = db.prepare(`
        INSERT INTO streaks(user_id, type, current, best, last_date, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, type) DO UPDATE SET
            current = excluded.current,
            best = MAX(streaks.best, excluded.best),
            last_date = CASE
                WHEN streaks.last_date IS NULL OR excluded.last_date > streaks.last_date
                THEN excluded.last_date ELSE streaks.last_date END,
            updated_at = CURRENT_TIMESTAMP
    `);

    let rebuilt = 0;
    const tx = db.transaction(() => {
        for (const { user_id } of users) {
            for (const [type, column] of [
                ['given_reactions', 'given_reactions'],
                ['received_reactions', 'received_reactions'],
            ]) {
                const rows = db.prepare(`
                    SELECT date FROM daily_progress
                    WHERE user_id = ? AND COALESCE(${column}, 0) > 0
                    ORDER BY date ASC
                `).all(user_id);
                const stats = consecutiveStats(rows.map(row => row.date));
                if (!stats.lastDate) continue;
                upsert.run(user_id, type, stats.current, stats.best, stats.lastDate);
                rebuilt++;
            }
        }
    });
    tx();
    return rebuilt;
}

async function backfillAchievements(client) {
    const rebuilt = rebuildReactionStreaks();
    let checked = 0;
    let unlocked = 0;

    for (const guild of client.guilds.cache.values()) {
        const rows = db.prepare(`SELECT user_id FROM players`).all();
        for (const { user_id } of rows) {
            const member = await guild.members.fetch(user_id).catch(() => null);
            if (!member || member.user.bot) continue;
            let player = getOrCreatePlayer(member.user);
            const result = await checkAchievements({
                message: { author: member.user, guild },
                player,
                member,
            }).catch(error => {
                console.error(`[Achievements Backfill] ${user_id}:`, error);
                return null;
            });
            checked++;
            unlocked += result?.unlockedAchievements?.length || 0;
        }
    }

    console.log(`[Achievements Backfill] reaction streaks=${rebuilt}, checked=${checked}, unlocked=${unlocked}`);
    return { rebuilt, checked, unlocked };
}

module.exports = { rebuildReactionStreaks, backfillAchievements };
