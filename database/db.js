const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const bundledDatabasePath = path.join(__dirname, 'database.sqlite');
const configuredDatabasePath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : bundledDatabasePath;

fs.mkdirSync(path.dirname(configuredDatabasePath), { recursive: true });

// При первом запуске с постоянным диском переносим текущую базу проекта,
// чтобы не потерять уже накопленный прогресс.
if (configuredDatabasePath !== bundledDatabasePath && !fs.existsSync(configuredDatabasePath)) {
    if (fs.existsSync(bundledDatabasePath)) {
        fs.copyFileSync(bundledDatabasePath, configuredDatabasePath);
        console.log(`✅ База данных скопирована на постоянный диск: ${configuredDatabasePath}`);
    }
}

const db = new Database(configuredDatabasePath);

// WAL уменьшает взаимные блокировки между параллельными обработчиками Discord,
// Telegram, планировщиками и системой резервного копирования. Бэкапы создаются
// через better-sqlite3 backup(), поэтому получают согласованный снимок базы.
try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('busy_timeout = 10000');
    db.pragma('wal_autocheckpoint = 1000');
} catch (error) {
    console.error('❌ Ошибка настройки SQLite:', error);
    throw error;
}

const databasePath = configuredDatabasePath;

let databaseClosed = false;

function checkpointDatabase(mode = 'PASSIVE') {
    if (databaseClosed || !db.open) return;
    const normalizedMode = String(mode).toUpperCase();
    const allowedModes = new Set(['PASSIVE', 'FULL', 'RESTART', 'TRUNCATE']);
    const checkpointMode = allowedModes.has(normalizedMode) ? normalizedMode : 'PASSIVE';
    db.pragma(`wal_checkpoint(${checkpointMode})`);
}

function closeDatabase() {
    if (databaseClosed || !db.open) return;
    try {
        checkpointDatabase('TRUNCATE');
    } catch (error) {
        console.warn('⚠️ SQLite checkpoint при остановке не выполнен:', error.message);
    }
    db.close();
    databaseClosed = true;
}

console.log('📁 Database path:', configuredDatabasePath);
console.log('🧾 SQLite journal mode:', db.pragma('journal_mode', { simple: true }));
console.log(
    '📦 DB exists:',
    fs.existsSync(configuredDatabasePath),
    'size:',
    fs.existsSync(configuredDatabasePath)
        ? fs.statSync(configuredDatabasePath).size
        : 0
);


// GS EXPEDITIONS V15.1 — независимый RPG-модуль.
// Таблицы создаются безопасно и не меняют существующий прогресс игроков.
db.exec(`
    CREATE TABLE IF NOT EXISTS heroes (
        hero_number INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        gender TEXT NOT NULL CHECK(gender IN ('male','female')),
        class_key TEXT NOT NULL,
        origin_key TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        hp INTEGER NOT NULL,
        max_hp INTEGER NOT NULL,
        strength INTEGER NOT NULL,
        defense INTEGER NOT NULL,
        dexterity INTEGER NOT NULL,
        intelligence INTEGER NOT NULL,
        luck INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ready',
        recovery_until TEXT,
        card_background TEXT NOT NULL DEFAULT 'default',
        card_border TEXT NOT NULL DEFAULT 'default',
        title TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hero_items (
        item_key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        item_type TEXT NOT NULL,
        rarity TEXT NOT NULL DEFAULT 'common',
        description TEXT NOT NULL DEFAULT '',
        slot TEXT,
        bonuses_json TEXT NOT NULL DEFAULT '{}',
        lore TEXT NOT NULL DEFAULT '',
        is_consumable INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hero_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        item_key TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        durability INTEGER,
        acquired_from TEXT,
        acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, item_key)
    );

    CREATE TABLE IF NOT EXISTS hero_equipment (
        user_id TEXT NOT NULL,
        slot TEXT NOT NULL,
        inventory_id INTEGER,
        equipped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, slot)
    );

    CREATE TABLE IF NOT EXISTS hero_companions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        companion_key TEXT NOT NULL,
        name TEXT NOT NULL,
        rarity TEXT NOT NULL DEFAULT 'common',
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 0,
        acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hero_artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        artifact_key TEXT NOT NULL,
        equipped INTEGER NOT NULL DEFAULT 0,
        acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, artifact_key)
    );

    CREATE TABLE IF NOT EXISTS hero_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        description TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hero_reputation (
        user_id TEXT NOT NULL,
        location_key TEXT NOT NULL,
        reputation INTEGER NOT NULL DEFAULT 0,
        rank INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, location_key)
    );

    CREATE TABLE IF NOT EXISTS hero_expeditions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        location_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        returns_at TEXT NOT NULL,
        resolved_at TEXT,
        result_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_hero_history_user ON hero_history(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_hero_inventory_user ON hero_inventory(user_id);
    CREATE INDEX IF NOT EXISTS idx_hero_expeditions_user_status ON hero_expeditions(user_id, status);
`);

db.prepare(`
    CREATE TABLE IF NOT EXISTS players (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        messages INTEGER DEFAULT 0,
        achievements INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
`).run();

const migrations = [
    `ALTER TABLE players ADD COLUMN voice_seconds INTEGER DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN given_reactions INTEGER DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN received_reactions INTEGER DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN events_count INTEGER DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN achievement_points INTEGER DEFAULT 0`,
    `ALTER TABLE players ADD COLUMN card_dust INTEGER DEFAULT 0`,
    `ALTER TABLE daily_player_quests ADD COLUMN reward_dust INTEGER DEFAULT 0`,
    `ALTER TABLE daily_history ADD COLUMN dust_earned INTEGER DEFAULT 0`,
];

for (const migration of migrations) {
    try {
        db.prepare(migration).run();
    } catch (_) {}
}

db.prepare(`
    CREATE TABLE IF NOT EXISTS player_achievements (
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        unlocked_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, achievement_id)
    )
`).run();


db.prepare(`
    CREATE TABLE IF NOT EXISTS player_level_notifications (
        user_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, level)
    )
`).run();

db.exec(`
    CREATE TABLE IF NOT EXISTS game_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_name TEXT NOT NULL,
        voice_channel_id TEXT NOT NULL,
        min_minutes INTEGER DEFAULT 30,
        status TEXT DEFAULT 'created',
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        started_at TEXT,
        finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS game_event_participants (
        event_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        total_seconds INTEGER DEFAULT 0,
        joined_at INTEGER,
        counted INTEGER DEFAULT 0,
        PRIMARY KEY(event_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS daily_progress (
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        messages INTEGER DEFAULT 0,
        voice_seconds INTEGER DEFAULT 0,
        given_reactions INTEGER DEFAULT 0,
        received_reactions INTEGER DEFAULT 0,
        claimed INTEGER DEFAULT 0,
        PRIMARY KEY(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS daily_player_quests (
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        slot INTEGER NOT NULL,
        quest_key TEXT NOT NULL,
        title TEXT NOT NULL,
        icon TEXT NOT NULL,
        field TEXT NOT NULL,
        target INTEGER NOT NULL,
        unit TEXT DEFAULT 'count',
        reward_xp INTEGER DEFAULT 0,
        claimed INTEGER DEFAULT 0,
        PRIMARY KEY(user_id, date, slot)
    );

    CREATE TABLE IF NOT EXISTS daily_history (
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        total_quests INTEGER DEFAULT 0,
        completed_quests INTEGER DEFAULT 0,
        claimed_quests INTEGER DEFAULT 0,
        bonus_claimed INTEGER DEFAULT 0,
        xp_earned INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS streaks (
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        current INTEGER DEFAULT 0,
        best INTEGER DEFAULT 0,
        last_date TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, type)
    );

    CREATE TABLE IF NOT EXISTS streak_dust_rewards (
        user_id TEXT NOT NULL,
        streak_type TEXT NOT NULL,
        milestone INTEGER NOT NULL,
        dust INTEGER NOT NULL,
        claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, streak_type, milestone)
    );

    CREATE TABLE IF NOT EXISTS achievement_dust_rewards (
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        dust INTEGER NOT NULL,
        claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS category_dust_rewards (
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        role_id TEXT NOT NULL,
        dust INTEGER NOT NULL,
        claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, category, role_id)
    );

    CREATE TABLE IF NOT EXISTS weekly_activity_rewards (
        user_id TEXT NOT NULL,
        week_key TEXT NOT NULL,
        dust INTEGER NOT NULL DEFAULT 300,
        inventory_id INTEGER,
        claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, week_key)
    );

    CREATE TABLE IF NOT EXISTS daily_forecasts (
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        rarity TEXT NOT NULL,
        day_type TEXT NOT NULL,
        prediction_title TEXT NOT NULL,
        prediction_text TEXT NOT NULL,
        prediction_icon TEXT NOT NULL,
        luck INTEGER DEFAULT 0,
        energy INTEGER DEFAULT 0,
        social INTEGER DEFAULT 0,
        gaming INTEGER DEFAULT 0,
        focus INTEGER DEFAULT 0,
        achievement_chance TEXT DEFAULT 'Средний',
        blessing_id TEXT DEFAULT 'none',
        blessing_title TEXT DEFAULT 'Без благословения',
        blessing_text TEXT DEFAULT 'Сегодня звёзды наблюдают без вмешательства.',
        lucky_number INTEGER DEFAULT 1,
        color TEXT DEFAULT 'Фиолетовый',
        best_time TEXT DEFAULT '20:00 — 22:00',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        series TEXT NOT NULL,
        base_rarity TEXT NOT NULL,
        image TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS player_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        card_id INTEGER NOT NULL,
        rarity TEXT NOT NULL,
        edition TEXT NOT NULL,
        copy_number INTEGER NOT NULL,
        obtained_from TEXT NOT NULL,
        obtained_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

for (const migration of [
    `ALTER TABLE daily_player_quests ADD COLUMN reward_dust INTEGER DEFAULT 0`,
    `ALTER TABLE daily_history ADD COLUMN dust_earned INTEGER DEFAULT 0`,
]) {
    try { db.prepare(migration).run(); } catch (_) {}
}

console.log('✅ Таблицы базы проверены/созданы');

db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_player_cards_user
    ON player_cards(user_id)
`).run();

db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_player_cards_card
    ON player_cards(card_id)
`).run();

db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_player_cards_unique_variant
    ON player_cards(user_id, card_id, rarity, edition)
`).run();

// Индексы для наиболее частых выборок игровых событий и ежедневной истории.
// PRIMARY KEY покрывает точечные запросы, а эти индексы ускоряют фильтрацию
// по статусу/дате и массовое завершение игровых сессий.
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_events_status_id
    ON game_events(status, id DESC);

    CREATE INDEX IF NOT EXISTS idx_game_event_participants_active
    ON game_event_participants(event_id, joined_at);

    CREATE INDEX IF NOT EXISTS idx_daily_history_user_date
    ON daily_history(user_id, date DESC);
`);

function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
}

function getYesterdayDate() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
}

function updateDailyHistory(userId, data = {}) {
    const date = data.date ?? getTodayDate();

    db.prepare(`
        INSERT INTO daily_history (
            user_id,
            date,
            total_quests,
            completed_quests,
            claimed_quests,
            bonus_claimed,
            xp_earned,
            dust_earned
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
            total_quests = excluded.total_quests,
            completed_quests = excluded.completed_quests,
            claimed_quests = excluded.claimed_quests,
            bonus_claimed = excluded.bonus_claimed,
            xp_earned = daily_history.xp_earned + excluded.xp_earned,
            dust_earned = daily_history.dust_earned + excluded.dust_earned,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        userId,
        date,
        data.total_quests ?? 0,
        data.completed_quests ?? 0,
        data.claimed_quests ?? 0,
        data.bonus_claimed ? 1 : 0,
        data.xp_earned ?? 0,
        data.dust_earned ?? 0
    );
}

function getDailyHistory(userId, limit = 30) {
    return db.prepare(`
        SELECT *
        FROM daily_history
        WHERE user_id = ?
        ORDER BY date DESC
        LIMIT ?
    `).all(userId, limit);
}

const DAILY_STREAK_DUST = new Map([
    [3, 40], [7, 100], [14, 250], [30, 600], [60, 1500], [100, 3500],
]);

function grantStreakMilestoneDust(userId, type, current) {
    if (type !== 'daily_claim') return 0;
    const dust = DAILY_STREAK_DUST.get(Number(current)) ?? 0;
    if (!dust) return 0;
    const result = db.prepare(`
        INSERT OR IGNORE INTO streak_dust_rewards(user_id, streak_type, milestone, dust)
        VALUES (?, ?, ?, ?)
    `).run(userId, type, current, dust);
    if (!result.changes) return 0;
    addCardDust(userId, dust);
    return dust;
}

function updateStreak(userId, type) {
    const today = getTodayDate();
    const yesterday = getYesterdayDate();

    let streak = db.prepare(`
        SELECT *
        FROM streaks
        WHERE user_id = ? AND type = ?
    `).get(userId, type);

    if (!streak) {
        db.prepare(`
            INSERT INTO streaks (user_id, type, current, best, last_date)
            VALUES (?, ?, 1, 1, ?)
        `).run(userId, type, today);

        return {
            user_id: userId, type, current: 1, best: 1, last_date: today,
            increased: true, dustReward: grantStreakMilestoneDust(userId, type, 1),
        };
    }

    if (streak.last_date === today) {
        return {
            ...streak,
            increased: false,
        };
    }

    const nextCurrent = streak.last_date === yesterday
        ? streak.current + 1
        : 1;

    const nextBest = Math.max(streak.best ?? 0, nextCurrent);

    db.prepare(`
        UPDATE streaks
        SET current = ?,
            best = ?,
            last_date = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND type = ?
    `).run(nextCurrent, nextBest, today, userId, type);

    return {
        user_id: userId, type, current: nextCurrent, best: nextBest, last_date: today,
        increased: true, dustReward: grantStreakMilestoneDust(userId, type, nextCurrent),
    };
}

function getUserStreaks(userId) {
    return db.prepare(`
        SELECT *
        FROM streaks
        WHERE user_id = ?
        ORDER BY type ASC
    `).all(userId);
}

function getUserStreak(userId, type) {
    return db.prepare(`
        SELECT *
        FROM streaks
        WHERE user_id = ? AND type = ?
    `).get(userId, type);
}

function getOrCreateDailyProgress(userId) {
    const date = getTodayDate();

    db.prepare(`
        INSERT OR IGNORE INTO daily_progress (user_id, date)
        VALUES (?, ?)
    `).run(userId, date);

    return db.prepare(`
        SELECT *
        FROM daily_progress
        WHERE user_id = ? AND date = ?
    `).get(userId, date);
}

function updateDailyProgress(userId, field, amount) {
    const allowedFields = [
        'messages',
        'voice_seconds',
        'given_reactions',
        'received_reactions',
    ];

    if (!allowedFields.includes(field)) return;

    const date = getTodayDate();

    db.prepare(`
        INSERT OR IGNORE INTO daily_progress (user_id, date)
        VALUES (?, ?)
    `).run(userId, date);

    db.prepare(`
        UPDATE daily_progress
        SET ${field} = ${field} + ?
        WHERE user_id = ? AND date = ?
    `).run(amount, userId, date);
}

function markDailyClaimed(userId) {
    const date = getTodayDate();

    db.prepare(`
        UPDATE daily_progress
        SET claimed = 1
        WHERE user_id = ? AND date = ?
    `).run(userId, date);

    return updateStreak(userId, 'daily_claim');
}

function getAchievementCount(userId) {
    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM player_achievements
        WHERE user_id = ?
    `).get(userId);

    return row?.count ?? 0;
}

function getPlayerAchievementIds(userId) {
    return db.prepare(`
        SELECT achievement_id
        FROM player_achievements
        WHERE user_id = ?
    `).all(userId).map(row => row.achievement_id);
}

function getOrCreatePlayer(user) {
    const { getDisplayName } = require('../utils/displayName');
    const displayName = getDisplayName(user);

    let player = db.prepare(
        'SELECT * FROM players WHERE user_id = ?'
    ).get(user.id);

    if (!player) {
        db.prepare(`
            INSERT INTO players (user_id, username)
            VALUES (?, ?)
        `).run(user.id, displayName);

        player = db.prepare(
            'SELECT * FROM players WHERE user_id = ?'
        ).get(user.id);
    } else if (player.username !== displayName) {
        db.prepare('UPDATE players SET username = ? WHERE user_id = ?')
            .run(displayName, user.id);
        player.username = displayName;
    }

    player.achievements = getAchievementCount(user.id);

    return player;
}


function incrementPlayerStat(userId, field, amount = 1) {
    const allowedFields = [
        'messages',
        'voice_seconds',
        'given_reactions',
        'received_reactions',
        'events_count',
    ];

    if (!allowedFields.includes(field)) {
        throw new Error(`Unsupported player stat: ${field}`);
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
        throw new Error(`Invalid stat amount for ${field}: ${amount}`);
    }

    db.prepare(`
        UPDATE players
        SET ${field} = COALESCE(${field}, 0) + ?
        WHERE user_id = ?
    `).run(numericAmount, userId);

    return db.prepare(`
        SELECT *
        FROM players
        WHERE user_id = ?
    `).get(userId);
}

function updatePlayer(player) {
    const realAchievementCount = getAchievementCount(player.user_id);

    db.prepare(`
        UPDATE players
        SET
            username = ?,
            xp = ?,
            level = ?,
            messages = MAX(COALESCE(messages, 0), ?),
            achievements = ?,
            voice_seconds = MAX(COALESCE(voice_seconds, 0), ?),
            given_reactions = MAX(COALESCE(given_reactions, 0), ?),
            received_reactions = MAX(COALESCE(received_reactions, 0), ?),
            events_count = MAX(COALESCE(events_count, 0), ?),
            achievement_points = MAX(COALESCE(achievement_points, 0), ?),
            card_dust = MAX(COALESCE(card_dust, 0), ?)
        WHERE user_id = ?
    `).run(
        player.username,
        player.xp,
        player.level,
        player.messages,
        realAchievementCount,
        player.voice_seconds ?? 0,
        player.given_reactions ?? 0,
        player.received_reactions ?? 0,
        player.events_count ?? 0,
        player.achievement_points ?? 0,
        player.card_dust ?? 0,
        player.user_id
    );

    player.achievements = realAchievementCount;

    return player;
}

function hasAchievement(userId, achievementId) {
    return !!db.prepare(`
        SELECT 1
        FROM player_achievements
        WHERE user_id = ?
        AND achievement_id = ?
    `).get(userId, achievementId);
}

function unlockAchievement(userId, achievementId) {
    const result = db.prepare(`
        INSERT OR IGNORE INTO player_achievements
        (user_id, achievement_id)
        VALUES (?, ?)
    `).run(userId, achievementId);

    const unlocked = result.changes > 0;

    if (unlocked) {
        db.prepare(`
            UPDATE players
            SET achievements = (
                SELECT COUNT(*)
                FROM player_achievements
                WHERE user_id = ?
            )
            WHERE user_id = ?
        `).run(userId, userId);

        updateStreak(userId, 'achievement');
    }

    return unlocked;
}


function claimLevelNotification(userId, level) {
    const safeLevel = Math.max(1, Number(level) || 1);
    const result = db.prepare(`
        INSERT OR IGNORE INTO player_level_notifications (user_id, level)
        VALUES (?, ?)
    `).run(String(userId), safeLevel);

    return result.changes > 0;
}

function getCardDust(userId) {
    const row = db.prepare(`
        SELECT card_dust
        FROM players
        WHERE user_id = ?
    `).get(userId);

    return row?.card_dust ?? 0;
}

function addCardDust(userId, amount) {
    const safeAmount = Math.max(0, Number(amount) || 0);

    db.prepare(`
        UPDATE players
        SET card_dust = COALESCE(card_dust, 0) + ?
        WHERE user_id = ?
    `).run(safeAmount, userId);

    return getCardDust(userId);
}

function removeCardDust(userId, amount) {
    const safeAmount = Math.max(0, Number(amount) || 0);
    const currentDust = getCardDust(userId);

    if (currentDust < safeAmount) {
        return {
            ok: false,
            balance: currentDust,
        };
    }

    db.prepare(`
        UPDATE players
        SET card_dust = COALESCE(card_dust, 0) - ?
        WHERE user_id = ?
    `).run(safeAmount, userId);

    return {
        ok: true,
        balance: currentDust - safeAmount,
    };
}


function resetPlayer(userId) {
    // Полный сброс профиля также очищает RPG-героя и связанные записи.
    db.prepare(`DELETE FROM hero_history WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM hero_reputation WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM hero_expeditions WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM hero_equipment WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM hero_inventory WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM hero_companions WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM hero_artifacts WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM heroes WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM player_achievements WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM player_level_notifications WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM daily_progress WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM daily_player_quests WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM daily_history WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM daily_forecasts WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM player_cards WHERE user_id = ?`).run(userId);
    try {
        db.prepare(`DELETE FROM daily_card_packs WHERE user_id = ?`).run(userId);
    } catch (_) {}
    db.prepare(`DELETE FROM streaks WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM players WHERE user_id = ?`).run(userId);
}

module.exports = {
    db,
    getOrCreatePlayer,
    hasAchievement,
    unlockAchievement,
    claimLevelNotification,
    resetPlayer,
    updatePlayer,
    incrementPlayerStat,
    getAchievementCount,
    getPlayerAchievementIds,
    getTodayDate,
    getYesterdayDate,
    getOrCreateDailyProgress,
    updateDailyProgress,
    markDailyClaimed,
    updateDailyHistory,
    getDailyHistory,
    getCardDust,
    addCardDust,
    removeCardDust,
    updateStreak,
    getUserStreak,
    getUserStreaks,
    databasePath,
    checkpointDatabase,
    closeDatabase,
};