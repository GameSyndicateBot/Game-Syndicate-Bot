const { db, getSetting, setSetting } = require('./telegram/ecosystemDb');

const ROUND_MS = 60 * 60 * 1000;
const WINNER_PRIORITY_MS = 5 * 1000;
const CLAIMED_HOST_START_MS = 2 * 60 * 1000;
const RECENT_WORD_LIMIT = 500;
const timers = new Map();
const claimedHostTimers = new Map();
let apiRef = null;

// Большой словарь хранится отдельным JSON-файлом.
// Проверяем два пути, чтобы обновление не падало при особенностях упаковки хостинга.
const fs = require('fs');
const path = require('path');

function loadCrocodileWords() {
    const candidates = [
        path.join(__dirname, 'data', 'crocodileWords.json'),
        path.join(__dirname, 'crocodileWords.json'),
    ];

    for (const filename of candidates) {
        if (!fs.existsSync(filename)) continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
            if (Array.isArray(parsed.single) && parsed.single.length > 0) {
                return parsed;
            }
        } catch (error) {
            console.error(`⚠️ Не удалось прочитать словарь Крокодила ${filename}:`, error.message);
        }
    }

    // Аварийный набор не даёт всему Discord/Telegram-боту упасть,
    // даже если хостинг по ошибке не распаковал большой словарь.
    console.error('⚠️ Большой словарь Крокодила не найден. Используется аварийный набор.');
    return {
        single: [
            'кот', 'собака', 'самолёт', 'телефон', 'компьютер', 'пингвин',
            'дракон', 'вулкан', 'пианино', 'рыцарь', 'космонавт', 'телескоп',
        ],
        double: ['день рождения', 'новый год', 'белый медведь', 'машина времени'],
    };
}

const CROCODILE_WORDS = loadCrocodileWords();
const SINGLE_WORDS = [...new Set(CROCODILE_WORDS.single || [])];
const DOUBLE_WORDS = [...new Set(CROCODILE_WORDS.double || [])];
const WORDS = [...SINGLE_WORDS, ...DOUBLE_WORDS];
const DOUBLE_WORD_CHANCE = 0.20;

db.exec(`
CREATE TABLE IF NOT EXISTS crocodile_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    thread_id INTEGER,
    message_id INTEGER,
    host_id TEXT NOT NULL,
    host_name TEXT NOT NULL,
    word TEXT NOT NULL,
    previous_word TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    winner_id TEXT,
    winner_name TEXT,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    claim_open_at INTEGER,
    result_message_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_croc_round_active ON crocodile_rounds(chat_id, thread_id, status);
CREATE TABLE IF NOT EXISTS crocodile_stats (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    username TEXT,
    guessed INTEGER NOT NULL DEFAULT 0,
    explained INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crocodile_ratings (
    round_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 3),
    created_at INTEGER NOT NULL,
    PRIMARY KEY(round_id, user_id)
);
CREATE TABLE IF NOT EXISTS crocodile_participants (
    round_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(round_id, user_id)
);
CREATE TABLE IF NOT EXISTS crocodile_achievements (
    user_id TEXT NOT NULL,
    achievement_key TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY(user_id, achievement_key)
);
CREATE TABLE IF NOT EXISTS crocodile_word_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    thread_id INTEGER,
    word TEXT NOT NULL,
    used_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_croc_word_history ON crocodile_word_history(chat_id, thread_id, id DESC);
`);

function ensureColumn(table, column, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(item => item.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}
ensureColumn('crocodile_stats', 'three_heart_ratings', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('crocodile_stats', 'successful_explains', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('crocodile_rounds', 'successful_awarded', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('crocodile_rounds', 'host_ready', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('crocodile_rounds', 'host_ready_expires_at', 'INTEGER');
ensureColumn('crocodile_rounds', 'source_round_id', 'INTEGER');
ensureColumn('crocodile_rounds', 'claim_message_id', 'INTEGER');
ensureColumn('crocodile_participants', 'attempts', 'INTEGER NOT NULL DEFAULT 0');

function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}
function nameOf(user) {
    return [user?.first_name, user?.last_name].filter(Boolean).join(' ')
        || user?.username
        || `ID ${user?.id}`;
}
function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^a-zа-я0-9-]+/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}
function sameTopic(message) {
    return String(message.chat.id) === String(getSetting('telegram_crocodile_chat_id'))
        && String(message.message_thread_id || '') === String(getSetting('telegram_crocodile_thread_id') || '');
}
function activeRound(chatId, threadId) {
    return db.prepare(`
        SELECT * FROM crocodile_rounds
        WHERE chat_id=? AND COALESCE(thread_id,0)=? AND status='active'
        ORDER BY id DESC LIMIT 1
    `).get(String(chatId), Number(threadId || 0));
}
function ensureStats(user) {
    if (!user?.id) return;
    db.prepare(`
        INSERT INTO crocodile_stats(user_id,display_name,username,updated_at)
        VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET
            display_name=excluded.display_name,
            username=excluded.username,
            updated_at=excluded.updated_at
    `).run(String(user.id), nameOf(user), user.username || null, Date.now());
}
function likeCount(roundId) {
    return Number(db.prepare(`
        SELECT COUNT(*) AS count FROM crocodile_ratings WHERE round_id=?
    `).get(roundId)?.count || 0);
}
function recentWords(chatId, threadId) {
    return db.prepare(`
        SELECT word FROM crocodile_word_history
        WHERE chat_id=? AND COALESCE(thread_id,0)=?
        ORDER BY id DESC LIMIT ?
    `).all(String(chatId), Number(threadId || 0), RECENT_WORD_LIMIT).map(row => row.word);
}
function chooseWord(chatId, threadId, exclude = []) {
    const blocked = new Set([...recentWords(chatId, threadId), ...exclude.filter(Boolean)]);
    const preferDouble = DOUBLE_WORDS.length > 0 && Math.random() < DOUBLE_WORD_CHANCE;
    const primary = preferDouble ? DOUBLE_WORDS : SINGLE_WORDS;
    const secondary = preferDouble ? SINGLE_WORDS : DOUBLE_WORDS;
    let available = primary.filter(word => !blocked.has(word));
    if (!available.length) available = secondary.filter(word => !blocked.has(word));
    if (!available.length) {
        db.prepare(`DELETE FROM crocodile_word_history WHERE chat_id=? AND COALESCE(thread_id,0)=?`)
            .run(String(chatId), Number(threadId || 0));
        available = primary.filter(word => !exclude.includes(word));
        if (!available.length) available = secondary.filter(word => !exclude.includes(word));
    }
    return available[Math.floor(Math.random() * available.length)] || WORDS[0];
}
function rememberWord(chatId, threadId, word) {
    db.prepare(`
        INSERT INTO crocodile_word_history(chat_id,thread_id,word,used_at)
        VALUES(?,?,?,?)
    `).run(String(chatId), threadId || null, word, Date.now());
    db.prepare(`
        DELETE FROM crocodile_word_history
        WHERE chat_id=? AND COALESCE(thread_id,0)=?
          AND id NOT IN (
              SELECT id FROM crocodile_word_history
              WHERE chat_id=? AND COALESCE(thread_id,0)=?
              ORDER BY id DESC LIMIT ?
          )
    `).run(String(chatId), Number(threadId || 0), String(chatId), Number(threadId || 0), RECENT_WORD_LIMIT);
}
function keyboard(round) {
    if (round.status === 'active') {
        return {
            inline_keyboard: [
                [{ text: '👁 Посмотреть задание', callback_data: `croc_show:${round.id}` }],
                [
                    { text: '↩ Предыдущее', callback_data: `croc_prev:${round.id}` },
                    { text: '🔄 Новое', callback_data: `croc_new:${round.id}` },
                ],
            ],
        };
    }

    const rows = [];
    // Лайки остаются доступными и после того, как следующий ведущий уже выбран.
    if (round.status === 'guessed' || round.status === 'claimed') {
        const likes = likeCount(round.id);
        rows.push([{ text: `💜 Лайк ${likes}`, callback_data: `croc_like:${round.id}` }]);
    }
    // Кнопка выбора ведущего нужна только до выбора нового ведущего.
    if (round.status === 'guessed' || round.status === 'timeout') {
        rows.push([{ text: '✋ Хочу быть ведущим!', callback_data: `croc_claim:${round.id}` }]);
    }
    return { inline_keyboard: rows };
}
function roundText(round) {
    return [
        '🐊 <b>КРОКОДИЛ • GAME SYNDICATE</b>',
        '━━━━━━━━━━━━━━━━━━',
        '',
        `🎭 <b>Ведущий:</b> ${esc(round.host_name)}`,
        `💬 Объясняет ${round.word.includes(' ') ? 'два связанных слова' : 'одно слово'}`,
        '',
        '⏳ На объяснение даётся 1 час.',
        'Слово видит только ведущий.',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '💜 <i>GS Crocodile</i>',
    ].join('\n');
}
async function send(api, chatId, text, options = {}) {
    return api('sendMessage', { chat_id: chatId, text, ...options });
}
async function edit(api, chatId, messageId, text, options = {}) {
    return api('editMessageText', { chat_id: chatId, message_id: messageId, text, ...options });
}
async function answer(api, id, text, alert = false) {
    return api('answerCallbackQuery', {
        callback_query_id: id,
        text,
        show_alert: alert,
    }).catch(() => null);
}
function achievementDefs(stats) {
    return [
        ['first_round', '🐊 Первый раунд', stats.explained >= 1],
        ['first_guess', '🎯 Первый ответ', stats.guessed >= 1],
        ['guess_10', '🧠 10 угаданных слов', stats.guessed >= 10],
        ['guess_50', '🏆 50 угаданных слов', stats.guessed >= 50],
        ['guess_100', '👑 100 угаданных слов', stats.guessed >= 100],
        ['guess_500', '🌟 500 угаданных слов', stats.guessed >= 500],
        ['explain_10', '🎭 10 проведённых раундов', stats.explained >= 10],
        ['explain_50', '🎙 50 проведённых раундов', stats.explained >= 50],
        ['success_10', '💜 10 отличных объяснений', stats.successful_explains >= 10],
        ['success_50', '💜 50 отличных объяснений', stats.successful_explains >= 50],
        ['success_100', '💜 100 отличных объяснений', stats.successful_explains >= 100],
        ['streak_5', '🔥 Серия ×5', stats.best_streak >= 5],
        ['streak_10', '⚡ Серия ×10', stats.best_streak >= 10],
        [
            'croc_legend',
            '👑 Легенда Крокодила',
            stats.guessed >= 100 && stats.successful_explains >= 50 && stats.best_streak >= 10,
        ],
    ];
}
async function unlockAchievements(api, userId, chatId, threadId) {
    const stats = db.prepare('SELECT * FROM crocodile_stats WHERE user_id=?').get(String(userId));
    if (!stats) return;
    const fresh = [];
    for (const [key, title, unlocked] of achievementDefs(stats)) {
        if (!unlocked) continue;
        const result = db.prepare(`
            INSERT OR IGNORE INTO crocodile_achievements(user_id,achievement_key,unlocked_at)
            VALUES(?,?,?)
        `).run(String(userId), key, Date.now());
        if (result.changes) fresh.push(title);
    }
    if (!fresh.length) return;
    await send(api, chatId, [
        '✨ <b>ДОСТИЖЕНИЕ • GAME SYNDICATE</b>',
        '',
        `👤 ${esc(stats.display_name)}`,
        ...fresh.map(title => `🏅 ${title}`),
    ].join('\n'), {
        parse_mode: 'HTML',
        ...(threadId ? { message_thread_id: threadId } : {}),
    });
}
async function startRound(api, chatId, threadId, user, options = {}) {
    if (!user?.id || activeRound(chatId, threadId)) return null;
    ensureStats(user);
    const now = Date.now();
    const claimedHost = Boolean(options.claimedHost);
    const word = chooseWord(chatId, threadId);
    rememberWord(chatId, threadId, word);
    const info = db.prepare(`
        INSERT INTO crocodile_rounds(
            chat_id,thread_id,host_id,host_name,word,started_at,ends_at,
            host_ready,host_ready_expires_at,source_round_id
        ) VALUES(?,?,?,?,?,?,?,?,?,?)
    `).run(
        String(chatId),
        threadId || null,
        String(user.id),
        nameOf(user),
        word,
        now,
        now + ROUND_MS,
        claimedHost ? 0 : 1,
        claimedHost ? now + CLAIMED_HOST_START_MS : null,
        options.sourceRoundId || null,
    );
    const round = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(info.lastInsertRowid);
    const message = await send(api, chatId, roundText(round), {
        parse_mode: 'HTML',
        reply_markup: keyboard(round),
        ...(threadId ? { message_thread_id: threadId } : {}),
    });
    db.prepare('UPDATE crocodile_rounds SET message_id=? WHERE id=?').run(message.message_id, round.id);
    scheduleTimeout(round.id);
    if (claimedHost) scheduleClaimedHostTimeout(round.id);
    return db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.id);
}

async function updateClaimMarkup(api, sourceRound) {
    const fresh = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(sourceRound.id);
    const messageIds = new Set([
        fresh.result_message_id,
        fresh.claim_message_id,
        fresh.status === 'timeout' ? fresh.message_id : null,
    ].filter(Boolean));
    for (const messageId of messageIds) {
        await api('editMessageReplyMarkup', {
            chat_id: fresh.chat_id,
            message_id: messageId,
            reply_markup: keyboard(fresh),
        }).catch(() => null);
    }
}

async function expireClaimedHost(roundId) {
    const round = db.prepare(`
        SELECT * FROM crocodile_rounds
        WHERE id=? AND status='active' AND host_ready=0
    `).get(roundId);
    if (!round || !apiRef) return;

    const changed = db.prepare(`
        UPDATE crocodile_rounds
        SET status='leader_expired'
        WHERE id=? AND status='active' AND host_ready=0
    `).run(round.id);
    if (!changed.changes) return;

    clearTimeout(timers.get(round.id));
    timers.delete(round.id);
    claimedHostTimers.delete(round.id);

    if (round.message_id) {
        await apiRef('editMessageReplyMarkup', {
            chat_id: round.chat_id,
            message_id: round.message_id,
            reply_markup: { inline_keyboard: [] },
        }).catch(() => null);
    }

    let source = null;
    if (round.source_round_id) {
        db.prepare(`
            UPDATE crocodile_rounds
            SET status=CASE WHEN winner_id IS NULL THEN 'timeout' ELSE 'guessed' END
            WHERE id=? AND status='claimed'
        `).run(round.source_round_id);
        source = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.source_round_id);
    }

    const notification = await send(apiRef, round.chat_id, [
        '⏰ <b>Ведущий не начал раунд в течение 2 минут.</b>',
        '',
        'Право стать ведущим снова открыто для участников.',
    ].join('\n'), {
        parse_mode: 'HTML',
        ...(source ? { reply_markup: keyboard(source) } : {}),
        ...(round.thread_id ? { message_thread_id: round.thread_id } : {}),
    }).catch(() => null);

    if (source && notification?.message_id) {
        db.prepare('UPDATE crocodile_rounds SET claim_message_id=? WHERE id=?')
            .run(notification.message_id, source.id);
        await updateClaimMarkup(apiRef, source);
    }
}

function scheduleClaimedHostTimeout(roundId) {
    const round = db.prepare(`
        SELECT * FROM crocodile_rounds
        WHERE id=? AND status='active' AND host_ready=0
    `).get(roundId);
    if (!round) return;
    clearTimeout(claimedHostTimers.get(roundId));
    const timer = setTimeout(
        () => expireClaimedHost(roundId),
        Math.max(1000, Number(round.host_ready_expires_at) - Date.now()),
    );
    claimedHostTimers.set(roundId, timer);
}
async function finishTimeout(roundId) {
    const round = db.prepare(`
        SELECT * FROM crocodile_rounds WHERE id=? AND status='active'
    `).get(roundId);
    if (!round || !apiRef) return;
    db.prepare(`UPDATE crocodile_rounds SET status='timeout',claim_open_at=? WHERE id=?`)
        .run(Date.now(), round.id);
    const finished = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.id);
    await edit(apiRef, round.chat_id, round.message_id, [
        '🐊 <b>КРОКОДИЛ • GAME SYNDICATE</b>',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '⌛ <b>Время вышло!</b>',
        `📝 Правильный ответ: <b>${esc(round.word)}</b>`,
        '',
        'Никто не угадал слово. Теперь любой участник может стать ведущим.',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '💜 <i>GS Crocodile</i>',
    ].join('\n'), {
        parse_mode: 'HTML',
        reply_markup: keyboard(finished),
    }).catch(() => null);
}
function scheduleTimeout(roundId) {
    const round = db.prepare(`
        SELECT * FROM crocodile_rounds WHERE id=? AND status='active'
    `).get(roundId);
    if (!round) return;
    clearTimeout(timers.get(roundId));
    const timer = setTimeout(
        () => finishTimeout(roundId),
        Math.max(1000, round.ends_at - Date.now()),
    );
    timers.set(roundId, timer);
}
async function checkAdminSafely(checkAdmin, chatId, userId) {
    if (typeof checkAdmin !== 'function' || !userId) return false;
    try {
        return Boolean(await checkAdmin(chatId, userId));
    } catch {
        return false;
    }
}
async function handleCommand(api, message, command, checkAdmin) {
    if (command === '/setcrocodile') {
        if (message.chat.type === 'private') {
            await send(api, message.chat.id, 'Эту команду нужно выполнить в теме Telegram-группы.');
            return true;
        }
        const sentAsChat = message.sender_chat
            && String(message.sender_chat.id) === String(message.chat.id);
        const userIsAdmin = sentAsChat
            || await checkAdminSafely(checkAdmin, message.chat.id, message.from?.id);
        if (!userIsAdmin) {
            await send(
                api,
                message.chat.id,
                '⛔ Настроить тему «Крокодил» может только администратор группы.',
                message.message_thread_id
                    ? { message_thread_id: message.message_thread_id }
                    : {},
            );
            return true;
        }
        setSetting('telegram_crocodile_chat_id', String(message.chat.id));
        setSetting(
            'telegram_crocodile_thread_id',
            message.message_thread_id ? String(message.message_thread_id) : '',
        );
        await send(api, message.chat.id, [
            '✅ <b>Тема «Крокодил» настроена.</b>',
            '',
            'Запуск игры: /crocodile',
        ].join('\n'), {
            parse_mode: 'HTML',
            ...(message.message_thread_id
                ? { message_thread_id: message.message_thread_id }
                : {}),
        });
        return true;
    }

    if (!sameTopic(message)) return false;

    if (command === '/crocodile' || command === '/croc' || command === '/startgame') {
        const current = activeRound(message.chat.id, message.message_thread_id);
        if (current) {
            const broken = !current.message_id || Number(current.ends_at) <= Date.now();
            if (!broken) {
                await send(
                    api,
                    message.chat.id,
                    '🐊 Раунд уже идёт.',
                    message.message_thread_id
                        ? { message_thread_id: message.message_thread_id }
                        : {},
                );
                return true;
            }

            db.prepare(`UPDATE crocodile_rounds SET status='stopped' WHERE id=? AND status='active'`)
                .run(current.id);
            clearTimeout(timers.get(current.id));
            timers.delete(current.id);
            clearTimeout(claimedHostTimers.get(current.id));
            claimedHostTimers.delete(current.id);
            if (current.message_id) {
                await api('editMessageReplyMarkup', {
                    chat_id: current.chat_id,
                    message_id: current.message_id,
                    reply_markup: { inline_keyboard: [] },
                }).catch(() => null);
            }
        }
        await startRound(api, message.chat.id, message.message_thread_id, message.from);
        return true;
    }
    if (command === '/croctop') {
        await showTop(api, message.chat.id, message.message_thread_id);
        return true;
    }
    if (command === '/crocstats') {
        await showStats(api, message);
        return true;
    }
    if (command === '/crocstop' || command === '/crocreset') {
        const sentAsChat = message.sender_chat
            && String(message.sender_chat.id) === String(message.chat.id);
        const userIsAdmin = sentAsChat
            || await checkAdminSafely(checkAdmin, message.chat.id, message.from?.id);
        if (!userIsAdmin) {
            await send(api, message.chat.id, '⛔ Эта команда доступна только администратору.', {
                ...(message.message_thread_id
                    ? { message_thread_id: message.message_thread_id }
                    : {}),
            });
            return true;
        }

        const chatId = String(message.chat.id);
        const threadId = message.message_thread_id || null;
        const rounds = command === '/crocreset'
            ? db.prepare(`
                SELECT * FROM crocodile_rounds
                WHERE chat_id=? AND COALESCE(thread_id,0)=COALESCE(?,0)
                  AND status IN ('active','guessed','timeout','claimed','leader_expired')
            `).all(chatId, threadId)
            : (() => {
                const round = activeRound(chatId, threadId);
                return round ? [round] : [];
            })();

        for (const round of rounds) {
            db.prepare(`UPDATE crocodile_rounds SET status='stopped' WHERE id=?`).run(round.id);
            clearTimeout(timers.get(round.id));
            timers.delete(round.id);
            clearTimeout(claimedHostTimers.get(round.id));
            claimedHostTimers.delete(round.id);
            if (round.message_id) {
                await api('editMessageReplyMarkup', {
                    chat_id: round.chat_id,
                    message_id: round.message_id,
                    reply_markup: { inline_keyboard: [] },
                }).catch(() => null);
            }
            if (round.result_message_id) {
                await api('editMessageReplyMarkup', {
                    chat_id: round.chat_id,
                    message_id: round.result_message_id,
                    reply_markup: { inline_keyboard: [] },
                }).catch(() => null);
            }
        }

        await send(api, message.chat.id, command === '/crocreset'
            ? '♻️ <b>Состояние Крокодила сброшено.</b>\n\nВсе зависшие раунды закрыты. Можно запускать новый: /crocodile'
            : (rounds.length
                ? '🛑 <b>Раунд Крокодила остановлен.</b>\n\nМожно запускать новый: /crocodile'
                : 'ℹ️ Активного раунда сейчас нет.'), {
            parse_mode: 'HTML',
            ...(message.message_thread_id
                ? { message_thread_id: message.message_thread_id }
                : {}),
        });
        return true;
    }
    return false;
}
async function showTop(api, chatId, threadId) {
    const guesses = db.prepare(`
        SELECT * FROM crocodile_stats
        ORDER BY guessed DESC, updated_at ASC LIMIT 15
    `).all();
    const explainers = db.prepare(`
        SELECT * FROM crocodile_stats
        ORDER BY successful_explains DESC, explained DESC, updated_at ASC LIMIT 15
    `).all();
    const format = (rows, key, suffix = '') => {
        const nonZero = rows.filter(row => Number(row[key]) > 0);
        return nonZero.length
            ? nonZero.map((row, index) => (
                `${index + 1}. ${esc(row.display_name)} — <b>${row[key]}</b>${suffix}`
            )).join('\n')
            : 'Пока нет данных.';
    };
    await send(api, chatId, [
        '🏆 <b>КРОКОДИЛ • ТОП-15</b>',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '🧠 <b>Лучшие угадывающие</b>',
        format(guesses, 'guessed'),
        '',
        '🎭 <b>Лучшие ведущие</b>',
        format(explainers, 'successful_explains', ' ⭐'),
    ].join('\n'), {
        parse_mode: 'HTML',
        ...(threadId ? { message_thread_id: threadId } : {}),
    });
}
async function showStats(api, message) {
    ensureStats(message.from);
    const stats = db.prepare(`SELECT * FROM crocodile_stats WHERE user_id=?`)
        .get(String(message.from.id));
    await send(api, message.chat.id, [
        '🐊 <b>ПРОФИЛЬ КРОКОДИЛА</b>',
        '',
        `👤 ${esc(stats.display_name)}`,
        `🧠 Угадано: <b>${stats.guessed}</b>`,
        `🎭 Проведено раундов: <b>${stats.explained}</b>`,
        `⭐ Успешных объяснений: <b>${stats.successful_explains}</b>`,
        `🔥 Текущая серия: <b>${stats.current_streak}</b>`,
        `⚡ Лучшая серия: <b>${stats.best_streak}</b>`,
    ].join('\n'), {
        parse_mode: 'HTML',
        ...(message.message_thread_id
            ? { message_thread_id: message.message_thread_id }
            : {}),
    });
}
async function handleMessage(api, message) {
    if (!sameTopic(message) || !message.text || message.text.startsWith('/')) return false;
    const round = activeRound(message.chat.id, message.message_thread_id);
    if (!round || !message.from?.id || String(message.from.id) === String(round.host_id)) return false;

    // Участником считается тот, кто отправил хотя бы одну попытку во время раунда.
    ensureStats(message.from);
    const userId = String(message.from.id);
    const isCorrect = normalize(message.text) === normalize(round.word);

    db.prepare(`
        INSERT OR IGNORE INTO crocodile_participants(round_id,user_id,created_at,attempts)
        VALUES(?,?,?,0)
    `).run(round.id, userId, Date.now());

    if (!isCorrect) {
        const attempt = db.prepare(`
            UPDATE crocodile_participants
            SET attempts=attempts+1
            WHERE round_id=? AND user_id=?
            RETURNING attempts
        `).get(round.id, userId);

        // Серия сохраняется при первой и второй ошибке, но сгорает на третьей.
        if (Number(attempt?.attempts || 0) === 3) {
            db.prepare(`
                UPDATE crocodile_stats
                SET current_streak=0,updated_at=?
                WHERE user_id=? AND current_streak>0
            `).run(Date.now(), userId);
        }
        return false;
    }

    const now = Date.now();
    db.transaction(() => {
        db.prepare(`
            UPDATE crocodile_rounds
            SET status='guessed',winner_id=?,winner_name=?,claim_open_at=?
            WHERE id=? AND status='active'
        `).run(
            String(message.from.id),
            nameOf(message.from),
            now + WINNER_PRIORITY_MS,
            round.id,
        );
        db.prepare(`
            UPDATE crocodile_stats
            SET guessed=guessed+1,
                current_streak=current_streak+1,
                best_streak=MAX(best_streak,current_streak+1),
                updated_at=?
            WHERE user_id=?
        `).run(now, String(message.from.id));
        db.prepare(`
            UPDATE crocodile_stats
            SET explained=explained+1,updated_at=?
            WHERE user_id=?
        `).run(now, String(round.host_id));
    })();

    clearTimeout(timers.get(round.id));
    const finished = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.id);

    // Старое сообщение раунда остаётся в истории, но его кнопки отключаются.
    await api('editMessageReplyMarkup', {
        chat_id: round.chat_id,
        message_id: round.message_id,
        reply_markup: { inline_keyboard: [] },
    }).catch(() => null);

    // Результат раунда публикуется отдельным сообщением.
    const resultMessage = await send(api, round.chat_id, [
        '🐊 <b>КРОКОДИЛ • GAME SYNDICATE</b>',
        '━━━━━━━━━━━━━━━━━━',
        '',
        `🎉 <b>${esc(finished.winner_name)}</b> отгадал(а) слово <b>${esc(finished.word)}</b>!`,
        '',
        `🎭 Ведущий: <b>${esc(finished.host_name)}</b>`,
        'Если объяснение понравилось — поставьте 💜.',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '💜 <i>GS Crocodile</i>',
    ].join('\n'), {
        parse_mode: 'HTML',
        reply_markup: keyboard(finished),
        ...(finished.thread_id ? { message_thread_id: finished.thread_id } : {}),
    });
    db.prepare('UPDATE crocodile_rounds SET result_message_id=? WHERE id=?')
        .run(resultMessage.message_id, finished.id);
    await unlockAchievements(api, finished.winner_id, finished.chat_id, finished.thread_id);
    await unlockAchievements(api, finished.host_id, finished.chat_id, finished.thread_id);
    return true;
}
async function handleLike(api, callback, round) {
    const userId = String(callback.from.id);
    if (!['guessed', 'claimed'].includes(round.status)) {
        await answer(api, callback.id, 'Лайк уже недоступен.');
        return true;
    }
    if (userId === String(round.host_id)) {
        await answer(api, callback.id, 'Ведущий не может лайкнуть себя.', true);
        return true;
    }
    const old = db.prepare(`
        SELECT 1 FROM crocodile_ratings WHERE round_id=? AND user_id=?
    `).get(round.id, userId);
    if (old) {
        await answer(api, callback.id, 'Ты уже поставил(а) лайк.');
        return true;
    }

    let awarded = false;
    db.transaction(() => {
        db.prepare(`
            INSERT INTO crocodile_ratings(round_id,user_id,score,created_at)
            VALUES(?,?,1,?)
        `).run(round.id, userId, Date.now());
        const likes = likeCount(round.id);
        const changed = db.prepare(`
            UPDATE crocodile_rounds
            SET successful_awarded=1
            WHERE id=? AND successful_awarded=0 AND ? >= 2
        `).run(round.id, likes);
        if (changed.changes) {
            db.prepare(`
                UPDATE crocodile_stats
                SET successful_explains=successful_explains+1,
                    updated_at=?
                WHERE user_id=?
            `).run(Date.now(), String(round.host_id));
            awarded = true;
        }
    })();

    const fresh = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.id);
    await api('editMessageReplyMarkup', {
        chat_id: callback.message.chat.id,
        message_id: callback.message.message_id,
        reply_markup: keyboard(fresh),
    }).catch(() => null);
    const likes = likeCount(round.id);
    await answer(
        api,
        callback.id,
        awarded
            ? '🏆 Второй лайк! Ведущему начислено успешное объяснение.'
            : `💜 Лайк принят. Всего: ${likes}`,
    );
    if (awarded) {
        await send(api, round.chat_id, [
            '🏆 <b>Отличное объяснение!</b>',
            '',
            `Ведущий <b>${esc(round.host_name)}</b> получил +1 к рейтингу.`,
        ].join('\n'), {
            parse_mode: 'HTML',
            ...(round.thread_id ? { message_thread_id: round.thread_id } : {}),
        }).catch(() => null);
        await unlockAchievements(api, round.host_id, round.chat_id, round.thread_id);
    }
    return true;
}
async function handleCallback(api, callback) {
    const data = callback.data || '';
    if (!data.startsWith('croc_')) return false;
    const [action, idRaw] = data.split(':');
    const roundId = Number(idRaw);
    const round = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(roundId);
    if (!round) {
        await answer(api, callback.id, 'Раунд не найден.');
        return true;
    }
    const userId = String(callback.from.id);

    if (action === 'croc_show') {
        if (round.status === 'leader_expired') {
            await answer(api, callback.id, '⏰ Ваше право быть ведущим уже истекло.', true);
            return true;
        }
        if (round.status !== 'active') {
            await answer(api, callback.id, 'Этот раунд уже завершён.', true);
            return true;
        }
        if (userId !== String(round.host_id)) {
            await answer(api, callback.id, 'Слово видит только ведущий.', true);
            return true;
        }
        if (!Number(round.host_ready)) {
            db.prepare(`
                UPDATE crocodile_rounds
                SET host_ready=1,host_ready_expires_at=NULL
                WHERE id=? AND status='active' AND host_ready=0
            `).run(round.id);
            clearTimeout(claimedHostTimers.get(round.id));
            claimedHostTimers.delete(round.id);
        }
        await answer(api, callback.id, `Твоё задание: ${round.word}`, true);
        return true;
    }

    if (action === 'croc_new' || action === 'croc_prev') {
        if (round.status === 'leader_expired') {
            await answer(api, callback.id, '⏰ Ваше право быть ведущим уже истекло.', true);
            return true;
        }
        if (userId !== String(round.host_id) || round.status !== 'active') {
            await answer(api, callback.id, 'Только ведущий активного раунда.', true);
            return true;
        }
        const next = action === 'croc_prev' && round.previous_word
            ? round.previous_word
            : chooseWord(round.chat_id, round.thread_id, [round.word, round.previous_word]);
        rememberWord(round.chat_id, round.thread_id, next);
        db.prepare(`
            UPDATE crocodile_rounds SET previous_word=?,word=? WHERE id=?
        `).run(round.word, next, round.id);
        await answer(api, callback.id, `Новое слово: ${next}`, true);
        return true;
    }

    if (action === 'croc_like' || action === 'croc_rate1' || action === 'croc_rate2' || action === 'croc_rate3') {
        return handleLike(api, callback, round);
    }

    if (action === 'croc_claim') {
        if (!['guessed', 'timeout'].includes(round.status)) {
            await answer(api, callback.id, 'Ведущий уже выбран.');
            return true;
        }
        if (
            round.status === 'guessed'
            && Date.now() < Number(round.claim_open_at)
            && userId !== String(round.winner_id)
        ) {
            await answer(api, callback.id, 'Первые 5 секунд право у угадавшего.', true);
            return true;
        }
        const changed = db.prepare(`
            UPDATE crocodile_rounds SET status='claimed'
            WHERE id=? AND status IN ('guessed','timeout')
        `).run(round.id);
        if (!changed.changes) {
            await answer(api, callback.id, 'Кто-то уже стал ведущим.');
            return true;
        }
        await answer(api, callback.id, 'Ты новый ведущий!');

        // После выбора нового ведущего убираем только кнопку выбора ведущего.
        // Лайки за завершённое объяснение остаются доступными без ограничения по времени.
        const claimedRound = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.id);
        await updateClaimMarkup(api, claimedRound);

        const started = await startRound(api, round.chat_id, round.thread_id, callback.from, {
            claimedHost: true,
            sourceRoundId: round.id,
        });
        if (!started) {
            db.prepare(`
                UPDATE crocodile_rounds
                SET status=CASE WHEN winner_id IS NULL THEN 'timeout' ELSE 'guessed' END
                WHERE id=? AND status='claimed'
            `).run(round.id);
            const reverted = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.id);
            await updateClaimMarkup(api, reverted);
            await send(api, round.chat_id, '⚠️ Не удалось создать новый раунд. Попробуйте нажать кнопку ещё раз.', {
                ...(round.thread_id ? { message_thread_id: round.thread_id } : {}),
            }).catch(() => null);
        }
        return true;
    }
    return true;
}
function init(api) {
    apiRef = api;

    // Старые активные раунды после долгого простоя не должны блокировать игру.
    const staleBefore = Date.now() - (2 * 60 * 60 * 1000);
    const recovered = db.prepare(`
        UPDATE crocodile_rounds
        SET status='stopped'
        WHERE status='active' AND host_ready=1 AND started_at<?
    `).run(staleBefore).changes;
    if (recovered) {
        console.log(`♻️ Crocodile: recovered ${recovered} stale round(s).`);
    }

    for (const round of db.prepare(`
        SELECT id,host_ready,host_ready_expires_at
        FROM crocodile_rounds WHERE status='active'
    `).all()) {
        scheduleTimeout(round.id);
        if (!Number(round.host_ready)) {
            if (Number(round.host_ready_expires_at) <= Date.now()) {
                setTimeout(() => expireClaimedHost(round.id), 0);
            } else {
                scheduleClaimedHostTimeout(round.id);
            }
        }
    }
}

module.exports = {
    init,
    handleCommand,
    handleMessage,
    handleCallback,
    showTop,
};
