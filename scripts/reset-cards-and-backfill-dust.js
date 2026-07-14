'use strict';

/**
 * One-time GS economy migration.
 *
 * What it does:
 *  1. Creates a timestamped backup of database/database.sqlite.
 *  2. Removes every owned collectible card.
 *  3. Cancels active trades and auctions that reference deleted cards.
 *  4. Resets GS Dust to 0 by default and recalculates it from historical:
 *     - claimed daily quests + full-day bonuses;
 *     - unlocked achievements;
 *     - reached daily-claim streak milestones.
 *
 * Preview only:
 *   node scripts/reset-cards-and-backfill-dust.js
 *
 * Apply:
 *   node scripts/reset-cards-and-backfill-dust.js --apply
 *
 * Keep current Dust and add retro rewards instead of rebuilding balance:
 *   node scripts/reset-cards-and-backfill-dust.js --apply --keep-dust
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'database', 'database.sqlite');
const ACHIEVEMENTS_PATH = path.join(ROOT, 'data', 'achievements.json');
const APPLY = process.argv.includes('--apply');
const KEEP_DUST = process.argv.includes('--keep-dust');
const MIGRATION_KEY = 'reset_cards_retro_dust_v1';

const QUEST_DUST_BY_FIELD = {
    messages: 15,
    voice_seconds: 20,
    given_reactions: 10,
    received_reactions: 10,
};
const FULL_DAY_BONUS_DUST = 45;
const ACHIEVEMENT_DUST = {
    common: 5,
    rare: 10,
    epic: 20,
    legendary: 35,
    mythic: 60,
};
const STREAK_DUST = new Map([
    [3, 40],
    [7, 100],
    [14, 250],
    [30, 600],
    [60, 1500],
    [100, 3500],
]);

function tableExists(db, name) {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function columnExists(db, table, column) {
    if (!tableExists(db, table)) return false;
    return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

if (!fs.existsSync(DB_PATH)) {
    throw new Error(`База не найдена: ${DB_PATH}`);
}
if (!fs.existsSync(ACHIEVEMENTS_PATH)) {
    throw new Error(`Файл достижений не найден: ${ACHIEVEMENTS_PATH}`);
}

const achievements = JSON.parse(fs.readFileSync(ACHIEVEMENTS_PATH, 'utf8'));
const rarityByAchievement = new Map(
    achievements.map(item => [String(item.id), String(item.rarity || 'common').toLowerCase()])
);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = OFF');

db.exec(`
    CREATE TABLE IF NOT EXISTS economy_migrations (
        migration_key TEXT PRIMARY KEY,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
        details TEXT
    );
    CREATE TABLE IF NOT EXISTS achievement_dust_rewards (
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        dust INTEGER NOT NULL,
        claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, achievement_id)
    );
`);

const alreadyApplied = db.prepare('SELECT * FROM economy_migrations WHERE migration_key=?').get(MIGRATION_KEY);
if (alreadyApplied) {
    console.error(`\nОШИБКА: миграция ${MIGRATION_KEY} уже была применена ${alreadyApplied.applied_at}.`);
    console.error('Повторный запуск заблокирован, чтобы не начислить Dust дважды.\n');
    process.exit(1);
}

const players = db.prepare('SELECT user_id, username, COALESCE(card_dust,0) AS card_dust FROM players').all();
const totals = new Map(players.map(p => [p.user_id, {
    userId: p.user_id,
    username: p.username,
    oldDust: Number(p.card_dust) || 0,
    dailyDust: 0,
    achievementDust: 0,
    streakDust: 0,
    skippedDailyDates: 0,
}]));

function ensureUser(userId) {
    if (!totals.has(userId)) {
        totals.set(userId, {
            userId,
            username: userId,
            oldDust: 0,
            dailyDust: 0,
            achievementDust: 0,
            streakDust: 0,
            skippedDailyDates: 0,
        });
    }
    return totals.get(userId);
}

// Daily quests: exact calculation when historical quest rows are available.
if (tableExists(db, 'daily_history')) {
    const historyRows = db.prepare(`
        SELECT user_id, date,
               COALESCE(claimed_quests,0) AS claimed_quests,
               COALESCE(bonus_claimed,0) AS bonus_claimed,
               ${columnExists(db, 'daily_history', 'dust_earned') ? 'COALESCE(dust_earned,0)' : '0'} AS dust_earned
        FROM daily_history
    `).all();

    const questRowsByDay = new Map();
    if (tableExists(db, 'daily_player_quests')) {
        const questRows = db.prepare(`
            SELECT user_id, date, field, claimed,
                   ${columnExists(db, 'daily_player_quests', 'reward_dust') ? 'COALESCE(reward_dust,0)' : '0'} AS reward_dust
            FROM daily_player_quests
            WHERE claimed = 1
        `).all();
        for (const row of questRows) {
            const key = `${row.user_id}\u0000${row.date}`;
            if (!questRowsByDay.has(key)) questRowsByDay.set(key, []);
            questRowsByDay.get(key).push(row);
        }
    }

    for (const day of historyRows) {
        const user = ensureUser(day.user_id);
        const key = `${day.user_id}\u0000${day.date}`;
        const claimedRows = questRowsByDay.get(key) || [];
        let expected = 0;

        if (claimedRows.length) {
            for (const quest of claimedRows) {
                expected += Number(quest.reward_dust) > 0
                    ? Number(quest.reward_dust)
                    : (QUEST_DUST_BY_FIELD[quest.field] || 10);
            }
        } else if (Number(day.claimed_quests) > 0) {
            // Old installations may no longer have the original quest rows.
            // A conservative 10 Dust per claimed quest avoids inventing a higher reward.
            expected += Number(day.claimed_quests) * 10;
            user.skippedDailyDates += 1;
        }

        if (Number(day.bonus_claimed) > 0) expected += FULL_DAY_BONUS_DUST;

        // In rebuild mode, count the complete historical value.
        // In keep mode, only add what was not already recorded for that day.
        const outstanding = KEEP_DUST ? Math.max(0, expected - Number(day.dust_earned || 0)) : expected;
        user.dailyDust += outstanding;
    }
}

// Achievements: every already unlocked achievement gets its rarity reward.
if (tableExists(db, 'player_achievements')) {
    const rows = db.prepare('SELECT user_id, achievement_id FROM player_achievements').all();
    for (const row of rows) {
        const user = ensureUser(row.user_id);
        const rarity = rarityByAchievement.get(String(row.achievement_id)) || 'common';
        user.achievementDust += ACHIEVEMENT_DUST[rarity] ?? ACHIEVEMENT_DUST.common;
    }
}

// Streak rewards: all milestones reached by the best full-daily streak.
if (tableExists(db, 'streaks')) {
    const rows = db.prepare(`
        SELECT user_id, COALESCE(best,0) AS best
        FROM streaks
        WHERE type = 'daily_claim'
    `).all();
    for (const row of rows) {
        const user = ensureUser(row.user_id);
        for (const [milestone, dust] of STREAK_DUST) {
            if (Number(row.best) >= milestone) user.streakDust += dust;
        }
    }
}

const report = [...totals.values()]
    .map(item => ({
        ...item,
        retroDust: item.dailyDust + item.achievementDust + item.streakDust,
        finalDust: (KEEP_DUST ? item.oldDust : 0) + item.dailyDust + item.achievementDust + item.streakDust,
    }))
    .sort((a, b) => b.finalDust - a.finalDust);

const cardCount = tableExists(db, 'player_cards')
    ? db.prepare('SELECT COUNT(*) AS count FROM player_cards').get().count
    : 0;
const activeTrades = tableExists(db, 'card_trades')
    ? db.prepare("SELECT COUNT(*) AS count FROM card_trades WHERE status IN ('selecting','pending')").get().count
    : 0;
const activeAuctions = tableExists(db, 'card_auction_listings')
    ? db.prepare("SELECT COUNT(*) AS count FROM card_auction_listings WHERE status='active'").get().count
    : 0;

console.log('\n=== ПРЕДПРОСМОТР МИГРАЦИИ GS ===');
console.log(`Игроков: ${report.length}`);
console.log(`Карточек будет удалено: ${cardCount}`);
console.log(`Активных обменов будет отменено: ${activeTrades}`);
console.log(`Активных аукционов будет отменено: ${activeAuctions}`);
console.log(`Режим Dust: ${KEEP_DUST ? 'добавить к текущему балансу' : 'сбросить и пересчитать заново'}`);
console.log('\nТоп начислений:');
for (const row of report.slice(0, 20)) {
    console.log(
        `${String(row.username).padEnd(24)} daily=${String(row.dailyDust).padStart(5)} ` +
        `ach=${String(row.achievementDust).padStart(4)} streak=${String(row.streakDust).padStart(5)} ` +
        `=> ${row.finalDust} Dust`
    );
}
const fallbackDates = report.reduce((sum, row) => sum + row.skippedDailyDates, 0);
if (fallbackDates) {
    console.log(`\nВнимание: для ${fallbackDates} старых дневных записей не найдены строки заданий; применён безопасный минимум 10 Dust за заявленное задание.`);
}

if (!APPLY) {
    console.log('\nИзменения НЕ применены. Проверь расчёт и запусти:');
    console.log('node scripts/reset-cards-and-backfill-dust.js --apply');
    db.close();
    process.exit(0);
}

const backupDir = path.join(ROOT, 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `database-before-card-reset-${stamp()}.sqlite`);
db.pragma('wal_checkpoint(TRUNCATE)');
fs.copyFileSync(DB_PATH, backupPath);

const applyMigration = db.transaction(() => {
    if (tableExists(db, 'card_trades')) {
        db.prepare(`
            UPDATE card_trades
            SET status='cancelled', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP)
            WHERE status IN ('selecting','pending')
        `).run();
    }
    if (tableExists(db, 'card_auction_listings')) {
        db.prepare(`
            UPDATE card_auction_listings
            SET status='cancelled'
            WHERE status='active'
        `).run();
    }
    if (tableExists(db, 'player_cards')) {
        db.prepare('DELETE FROM player_cards').run();
        if (tableExists(db, 'sqlite_sequence')) {
            db.prepare("DELETE FROM sqlite_sequence WHERE name='player_cards'").run();
        }
    }

    if (!KEEP_DUST) db.prepare('UPDATE players SET card_dust=0').run();

    const updateDust = db.prepare(`
        UPDATE players
        SET card_dust = COALESCE(card_dust,0) + ?
        WHERE user_id = ?
    `);
    for (const row of report) {
        if (row.retroDust > 0) updateDust.run(row.retroDust, row.userId);
    }

    // Rebuild reward ledgers so future checks cannot grant the same historical rewards again.
    db.prepare('DELETE FROM achievement_dust_rewards').run();
    if (tableExists(db, 'player_achievements')) {
        const insertAchievementReward = db.prepare(`
            INSERT OR IGNORE INTO achievement_dust_rewards(user_id,achievement_id,dust)
            VALUES(?,?,?)
        `);
        for (const row of db.prepare('SELECT user_id,achievement_id FROM player_achievements').all()) {
            const rarity = rarityByAchievement.get(String(row.achievement_id)) || 'common';
            insertAchievementReward.run(row.user_id, row.achievement_id, ACHIEVEMENT_DUST[rarity] ?? 5);
        }
    }

    if (tableExists(db, 'streak_dust_rewards')) {
        db.prepare("DELETE FROM streak_dust_rewards WHERE streak_type='daily_claim'").run();
        const insertStreakReward = db.prepare(`
            INSERT OR IGNORE INTO streak_dust_rewards(user_id,streak_type,milestone,dust)
            VALUES(?,'daily_claim',?,?)
        `);
        const streakRows = tableExists(db, 'streaks')
            ? db.prepare("SELECT user_id,COALESCE(best,0) AS best FROM streaks WHERE type='daily_claim'").all()
            : [];
        for (const row of streakRows) {
            for (const [milestone, dust] of STREAK_DUST) {
                if (Number(row.best) >= milestone) insertStreakReward.run(row.user_id, milestone, dust);
            }
        }
    }

    if (columnExists(db, 'daily_history', 'dust_earned')) {
        // Mark the historical amount as accounted for. This also prevents a later keep-mode run.
        const updateHistoryDust = db.prepare('UPDATE daily_history SET dust_earned=? WHERE user_id=? AND date=?');
        const historyRows = db.prepare('SELECT user_id,date,claimed_quests,bonus_claimed FROM daily_history').all();
        const questLookup = db.prepare(`
            SELECT field, ${columnExists(db, 'daily_player_quests', 'reward_dust') ? 'COALESCE(reward_dust,0)' : '0'} AS reward_dust
            FROM daily_player_quests WHERE user_id=? AND date=? AND claimed=1
        `);
        for (const day of historyRows) {
            const quests = tableExists(db, 'daily_player_quests') ? questLookup.all(day.user_id, day.date) : [];
            let expected = quests.length
                ? quests.reduce((sum, q) => sum + (Number(q.reward_dust) > 0 ? Number(q.reward_dust) : (QUEST_DUST_BY_FIELD[q.field] || 10)), 0)
                : Number(day.claimed_quests || 0) * 10;
            if (Number(day.bonus_claimed) > 0) expected += FULL_DAY_BONUS_DUST;
            updateHistoryDust.run(expected, day.user_id, day.date);
        }
    }

    db.prepare(`
        INSERT INTO economy_migrations(migration_key,details)
        VALUES(?,?)
    `).run(MIGRATION_KEY, JSON.stringify({
        players: report.length,
        cardsDeleted: cardCount,
        activeTradesCancelled: activeTrades,
        activeAuctionsCancelled: activeAuctions,
        keepDust: KEEP_DUST,
        totalRetroDust: report.reduce((sum, row) => sum + row.retroDust, 0),
        backup: path.relative(ROOT, backupPath),
    }));
});

applyMigration();

const reportPath = path.join(backupDir, `retro-dust-report-${stamp()}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log('\nГОТОВО.');
console.log(`Резервная копия: ${backupPath}`);
console.log(`Подробный отчёт: ${reportPath}`);
console.log(`Удалено карточек: ${cardCount}`);
console.log(`Всего начислено ретро-Dust: ${report.reduce((sum, row) => sum + row.retroDust, 0)}`);
console.log('Теперь можно запускать бота: node index.js\n');

db.close();
