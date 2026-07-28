const { db, getSetting, setSetting } = require('./ecosystemDb');
const { QUESTIONS, CATEGORY_MAP } = require('./blitzQuestions');

const MIN_PLAYERS = 2;
const LOBBY_SECONDS = 10;
const QUESTION_SECONDS = 10;
const BETWEEN_MS = 900;
const MAX_ROUNDS = 25;
const API_RETRIES = 2;
const RECOVERY_DELAY_MS = 2500;
const WATCHDOG_INTERVAL_MS = 2000;
const WATCHDOG_GRACE_MS = 4000;
const RESOLVING_STUCK_MS = 15000;
const API_CALL_TIMEOUT_MS = 4500;
const RECENT_QUESTION_LIMIT_PER_CATEGORY = 200;
const RECENT_CATEGORY_LIMIT_PER_CHAT = 8;
const NEAR_DUPLICATE_THRESHOLD = 0.72;

let api = null;
const games = new Map();
const timers = new Map();
let watchdog = null;
const recentQuestionCache = new Map();

function threadOf(message) {
    return message.message_thread_id ? Number(message.message_thread_id) : null;
}

function key(chatId, threadId) {
    return `${chatId}:${threadId || 0}`;
}

function displayName(user) {
    return user.username
        ? `@${user.username}`
        : [user.first_name, user.last_name].filter(Boolean).join(' ') || `ID ${user.id}`;
}

function esc(value) {
    return String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function sample(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeQuestionText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/\[вариант\s+\d+\]/gi, '')
        .replace(/[«»“”„'"`]/g, '')
        .replace(/[^a-zа-яё0-9]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function questionSignature(question) {
    return `${question.category}:${normalizeQuestionText(question.text)}`;
}

function tokenSet(text) {
    return new Set(normalizeQuestionText(text).split(' ').filter((token) => token.length > 2));
}

function similarity(left, right) {
    const a = tokenSet(left);
    const b = tokenSet(right);
    if (!a.size || !b.size) return 0;
    let common = 0;
    for (const token of a) if (b.has(token)) common += 1;
    return common / Math.max(a.size, b.size);
}

function getRecentQuestions(category) {
    if (recentQuestionCache.has(category)) return recentQuestionCache.get(category);
    const rows = db.prepare(`
        SELECT signature, question_text
        FROM telegram_blitz_question_history
        WHERE category = ?
        ORDER BY id DESC
        LIMIT ?
    `).all(category, RECENT_QUESTION_LIMIT_PER_CATEGORY);
    recentQuestionCache.set(category, rows);
    return rows;
}

function rememberQuestion(game, question) {
    const signature = questionSignature(question);
    const recent = getRecentQuestions(question.category);
    recent.unshift({ signature, question_text: question.text });
    if (recent.length > RECENT_QUESTION_LIMIT_PER_CATEGORY) recent.length = RECENT_QUESTION_LIMIT_PER_CATEGORY;
    game.pendingQuestionHistory.push({
        category: question.category,
        signature,
        questionText: question.text,
    });
}

function flushQuestionHistory(game) {
    if (!game.pendingQuestionHistory?.length) return;
    const rows = game.pendingQuestionHistory.splice(0);
    const insert = db.prepare(`
        INSERT INTO telegram_blitz_question_history(category, signature, question_text)
        VALUES(?, ?, ?)
    `);
    const trim = db.prepare(`
        DELETE FROM telegram_blitz_question_history
        WHERE category = ? AND id NOT IN (
            SELECT id FROM telegram_blitz_question_history
            WHERE category = ?
            ORDER BY id DESC
            LIMIT ?
        )
    `);
    const commit = db.transaction(() => {
        for (const row of rows) insert.run(row.category, row.signature, row.questionText);
        for (const category of new Set(rows.map((row) => row.category))) {
            trim.run(category, category, RECENT_QUESTION_LIMIT_PER_CATEGORY);
        }
    });
    commit();
}

function isRecentOrSimilar(question, game) {
    const signature = questionSignature(question);
    if (game.usedSignatures.has(signature)) return true;

    for (const usedText of game.usedQuestionTexts) {
        if (similarity(question.text, usedText) >= NEAR_DUPLICATE_THRESHOLD) return true;
    }

    for (const recent of getRecentQuestions(question.category)) {
        if (recent.signature === signature) return true;
        if (similarity(question.text, recent.question_text) >= NEAR_DUPLICATE_THRESHOLD) return true;
    }
    return false;
}

function recentCategories(chatId, threadId) {
    return db.prepare(`
        SELECT category
        FROM telegram_blitz_category_history
        WHERE chat_id = ? AND thread_id = ?
        ORDER BY id DESC
        LIMIT ?
    `).all(String(chatId), Number(threadId || 0), RECENT_CATEGORY_LIMIT_PER_CHAT)
        .map((row) => row.category);
}

function chooseCategory(game) {
    const categories = [...new Set(QUESTIONS.map((question) => question.category))];
    const recent = new Set(recentCategories(game.chatId, game.threadId));
    const fresh = categories.filter((category) => !recent.has(category));
    return sample(fresh.length ? fresh : categories);
}

function rememberCategory(game, category) {
    db.prepare(`
        INSERT INTO telegram_blitz_category_history(chat_id, thread_id, category)
        VALUES(?, ?, ?)
    `).run(String(game.chatId), Number(game.threadId || 0), category);

    db.prepare(`
        DELETE FROM telegram_blitz_category_history
        WHERE chat_id = ? AND thread_id = ? AND id NOT IN (
            SELECT id FROM telegram_blitz_category_history
            WHERE chat_id = ? AND thread_id = ?
            ORDER BY id DESC
            LIMIT ?
        )
    `).run(
        String(game.chatId), Number(game.threadId || 0),
        String(game.chatId), Number(game.threadId || 0),
        RECENT_CATEGORY_LIMIT_PER_CHAT
    );
}

function clearTimer(gameKey, game = null) {
    const timer = timers.get(gameKey);
    if (timer) clearTimeout(timer);
    timers.delete(gameKey);
    if (game) {
        game.transitionDueAt = 0;
        game.transitionLabel = null;
    }
}

function later(game, fn, ms, label = 'transition') {
    const gameKey = key(game.chatId, game.threadId);
    clearTimer(gameKey, game);
    const generation = game.generation;
    const token = `${generation}:${Date.now()}:${Math.random()}`;
    game.transitionToken = token;
    game.transitionDueAt = Date.now() + ms;
    game.transitionLabel = label;

    const handle = setTimeout(async () => {
        const active = games.get(gameKey);
        if (!active || active !== game || active.generation !== generation || game.transitionToken !== token) return;
        timers.delete(gameKey);
        game.transitionDueAt = 0;
        game.transitionLabel = null;

        try {
            await fn();
        } catch (error) {
            console.error(`❌ Blitz ${label}:`, error?.stack || error?.message || error);
            await recoverGame(game, label, error);
        }
    }, ms);
    timers.set(gameKey, handle);
}

async function callApi(method, payload, options = {}) {
    const nonIdempotent = method === 'sendMessage' || method === 'answerCallbackQuery';
    const retries = Number.isInteger(options.retries)
        ? options.retries
        : (options.optional || nonIdempotent ? 1 : API_RETRIES);
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            return await Promise.race([
                api(method, payload),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Telegram API timeout: ${method}`)), API_CALL_TIMEOUT_MS)),
            ]);
        } catch (error) {
            lastError = error;
            const description = String(error?.description || error?.message || '');
            const harmless = options.ignoreNotModified && /message is not modified/i.test(description);
            if (harmless) return null;

            console.warn(`⚠️ Blitz API ${method}, попытка ${attempt}/${retries}: ${description}`);
            if (attempt < retries) await sleep(500 * attempt);
        }
    }

    if (options.optional) return null;
    throw lastError;
}

function initDb() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS telegram_blitz_players(
            user_id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            username TEXT,
            rating INTEGER NOT NULL DEFAULT 0,
            wins INTEGER NOT NULL DEFAULT 0,
            games INTEGER NOT NULL DEFAULT 0,
            correct_answers INTEGER NOT NULL DEFAULT 0,
            total_answers INTEGER NOT NULL DEFAULT 0,
            win_streak INTEGER NOT NULL DEFAULT 0,
            best_streak INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS telegram_blitz_matches(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            thread_id INTEGER,
            category TEXT,
            player_count INTEGER NOT NULL,
            winner_id TEXT,
            rounds INTEGER NOT NULL DEFAULT 0,
            started_at TEXT DEFAULT CURRENT_TIMESTAMP,
            finished_at TEXT
        );

        CREATE TABLE IF NOT EXISTS telegram_blitz_migrations(
            migration_key TEXT PRIMARY KEY,
            applied_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS telegram_blitz_question_history(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            signature TEXT NOT NULL,
            question_text TEXT NOT NULL,
            asked_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS telegram_blitz_category_history(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            thread_id INTEGER NOT NULL DEFAULT 0,
            category TEXT NOT NULL,
            used_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_blitz_question_history_category_id
        ON telegram_blitz_question_history(category, id DESC);

        CREATE INDEX IF NOT EXISTS idx_blitz_category_history_chat_id
        ON telegram_blitz_category_history(chat_id, thread_id, id DESC);
    `);

    // V19.2.6: единоразово начинаем новый сезон рейтинга с нуля.
    // История игр и точность сохраняются, но победы/очки/серии обнуляются,
    // чтобы рейтинг строго соответствовал правилу: 1 победа = 1 очко.
    const resetKey = 'v19_2_6_zero_rating_season';
    const alreadyReset = db.prepare(`
        SELECT 1 FROM telegram_blitz_migrations WHERE migration_key = ?
    `).get(resetKey);
    if (!alreadyReset) {
        const resetSeason = db.transaction(() => {
            db.prepare(`
                UPDATE telegram_blitz_players
                SET rating = 0,
                    wins = 0,
                    win_streak = 0,
                    best_streak = 0,
                    updated_at = CURRENT_TIMESTAMP
            `).run();
            db.prepare(`
                INSERT INTO telegram_blitz_migrations(migration_key) VALUES(?)
            `).run(resetKey);
        });
        resetSeason();
        console.log('✅ GS Blitz: рейтинг и победы всех игроков обнулены для нового сезона');
    }
}
initDb();

function upsertPlayer(user) {
    db.prepare(`
        INSERT INTO telegram_blitz_players(user_id, display_name, username)
        VALUES(?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            display_name = excluded.display_name,
            username = excluded.username,
            updated_at = CURRENT_TIMESTAMP
    `).run(String(user.id), displayName(user), user.username || null);
}

function playerRow(id) {
    return db.prepare('SELECT * FROM telegram_blitz_players WHERE user_id = ?').get(String(id));
}

function changeRating(id, delta) {
    db.prepare(`
        UPDATE telegram_blitz_players
        SET rating = MAX(0, rating + ?), updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
    `).run(delta, String(id));
}

function lobbyText(game) {
    const queued = [...game.queue.values()];
    return [
        '⚡ <b>GS BLITZ</b>',
        '',
        game.status === 'countdown' ? '🟡 Игра скоро начнётся' : '🟢 Ожидание игроков',
        `👥 Записалось: <b>${queued.length}</b>`,
        `Минимум для старта: <b>${MIN_PLAYERS}</b>`,
        '',
        queued.length
            ? queued.map((player, index) => `${index + 1}. ${esc(player.name)}`).join('\n')
            : 'Нажми кнопку ниже, чтобы войти в игру.',
        '',
        'Побеждает последний оставшийся игрок.',
    ].join('\n');
}

function lobbyKeyboard(game) {
    return {
        inline_keyboard: [
            [{
                text: game.status === 'countdown' ? '✅ Я участвую' : '🎮 Играть',
                callback_data: 'blitz_join',
            }],
            [
                { text: '🏆 Топ', callback_data: 'blitz_top' },
                { text: '📊 Моя статистика', callback_data: 'blitz_stats' },
            ],
        ],
    };
}

async function editLobby(game) {
    if (!game.lobbyMessageId) return;
    await callApi('editMessageText', {
        chat_id: game.chatId,
        message_id: game.lobbyMessageId,
        text: lobbyText(game),
        parse_mode: 'HTML',
        reply_markup: lobbyKeyboard(game),
    }, { optional: true, ignoreNotModified: true });
}

function makeGame(chatId, threadId, carryQueue = new Map()) {
    return {
        chatId: String(chatId),
        threadId,
        status: 'lobby',
        queue: carryQueue,
        nextQueue: new Map(),
        players: new Map(),
        alive: new Set(),
        answers: new Map(),
        round: 0,
        used: new Set(),
        usedSignatures: new Set(),
        usedQuestionTexts: [],
        category: null,
        lobbyMessageId: null,
        questionMessageId: null,
        matchId: null,
        current: null,
        preparedQuestions: [],
        pendingQuestionHistory: [],
        playerStatsDelta: new Map(),
        roundResult: null,
        resolving: false,
        resolvingSince: 0,
        finishing: false,
        questionDeadlineAt: 0,
        transitionDueAt: 0,
        transitionLabel: null,
        transitionToken: null,
        watchdogRecovering: false,
        generation: Date.now() + Math.random(),
    };
}

async function createLobby(chatId, threadId) {
    const gameKey = key(chatId, threadId);
    clearTimer(gameKey);

    const old = games.get(gameKey);
    const carryQueue = old?.nextQueue ? new Map(old.nextQueue) : new Map();
    const game = makeGame(chatId, threadId, carryQueue);
    games.set(gameKey, game);

    const message = await callApi('sendMessage', {
        chat_id: chatId,
        ...(threadId ? { message_thread_id: threadId } : {}),
        text: lobbyText(game),
        parse_mode: 'HTML',
        reply_markup: lobbyKeyboard(game),
    });

    game.lobbyMessageId = message.message_id;
    setSetting('telegram_blitz_chat_id', String(chatId));
    setSetting('telegram_blitz_thread_id', threadId ? String(threadId) : '');
    setSetting('telegram_blitz_lobby_message_id', String(message.message_id));

    await callApi('pinChatMessage', {
        chat_id: chatId,
        message_id: message.message_id,
        disable_notification: true,
    }, { optional: true });

    if (game.queue.size >= MIN_PLAYERS) startCountdown(game);
    return game;
}

async function resetLobby(game) {
    const gameKey = key(game.chatId, game.threadId);
    clearTimer(gameKey, game);

    // Все участники завершившегося матча автоматически переходят в реванш.
    // Игроки, нажавшие «Играть» во время текущего матча, также сохраняются.
    const rematchQueue = new Map(game.players || []);
    for (const [id, player] of game.nextQueue || []) rematchQueue.set(id, player);

    const next = makeGame(game.chatId, game.threadId, rematchQueue);
    next.lobbyMessageId = game.lobbyMessageId;
    games.set(gameKey, next);

    let lobbyReady = false;
    if (next.lobbyMessageId) {
        try {
            await callApi('editMessageText', {
                chat_id: next.chatId,
                message_id: next.lobbyMessageId,
                text: lobbyText(next),
                parse_mode: 'HTML',
                reply_markup: lobbyKeyboard(next),
            }, { ignoreNotModified: true, retries: 1 });
            setSetting('telegram_blitz_lobby_message_id', String(next.lobbyMessageId));
            lobbyReady = true;
        } catch (error) {
            console.warn('⚠️ Blitz: старое лобби не обновилось, создаю новое:', error?.message || error);
            next.lobbyMessageId = null;
        }
    }

    if (!lobbyReady) {
        const message = await callApi('sendMessage', {
            chat_id: next.chatId,
            ...(next.threadId ? { message_thread_id: next.threadId } : {}),
            text: lobbyText(next),
            parse_mode: 'HTML',
            reply_markup: lobbyKeyboard(next),
        });
        next.lobbyMessageId = message.message_id;
        setSetting('telegram_blitz_lobby_message_id', String(message.message_id));
        await callApi('pinChatMessage', {
            chat_id: next.chatId,
            message_id: message.message_id,
            disable_notification: true,
        }, { optional: true });
    }

    if (next.queue.size >= MIN_PLAYERS) {
        startCountdown(next);
    } else {
        await editLobby(next);
    }
    return next;
}

async function setup(message, isAdmin) {
    if (!isAdmin) {
        await callApi('sendMessage', {
            chat_id: message.chat.id,
            ...(threadOf(message) ? { message_thread_id: threadOf(message) } : {}),
            text: '❌ Команду /setblitz может использовать только администратор группы.',
        }, { optional: true });
        return true;
    }

    const chatId = message.chat.id;
    const threadId = threadOf(message);
    clearTimer(key(chatId, threadId));
    await createLobby(chatId, threadId);
    await callApi('sendMessage', {
        chat_id: chatId,
        ...(threadId ? { message_thread_id: threadId } : {}),
        text: '✅ Этот чат назначен постоянным каналом GS Blitz.',
    });
    return true;
}

function startCountdown(game) {
    if (game.status !== 'lobby' || game.queue.size < MIN_PLAYERS) return;
    game.status = 'countdown';
    if (!game.category || !game.preparedQuestions.length) {
        game.category = chooseCategory(game);
        buildQuestionQueue(game);
    }
    void editLobby(game);

    void callApi('sendMessage', {
        chat_id: game.chatId,
        ...(game.threadId ? { message_thread_id: game.threadId } : {}),
        text: `⚡ Набралось ${game.queue.size} игроков. Старт через ${LOBBY_SECONDS} секунд!`,
    }, { optional: true });

    later(game, async () => {
        if (game.queue.size < MIN_PLAYERS) {
            game.status = 'lobby';
            await editLobby(game);
            return;
        }
        await beginMatch(game);
    }, LOBBY_SECONDS * 1000, 'countdown');
}

async function beginMatch(game) {
    if (game.status !== 'countdown' && game.status !== 'lobby') return;
    if (game.queue.size < MIN_PLAYERS) {
        game.status = 'lobby';
        await editLobby(game);
        return;
    }

    game.status = 'playing';
    game.players = new Map(game.queue);
    game.queue.clear();
    game.alive = new Set(game.players.keys());
    game.round = 0;
    game.used.clear();
    game.usedSignatures.clear();
    game.usedQuestionTexts.length = 0;
    game.resolving = false;
    game.finishing = false;

    if (!game.category) game.category = chooseCategory(game);
    if (!game.preparedQuestions.length) buildQuestionQueue(game);
    if (!game.preparedQuestions.length) throw new Error(`Не удалось подготовить вопросы для категории ${game.category}`);
    rememberCategory(game, game.category);

    const result = db.prepare(`
        INSERT INTO telegram_blitz_matches(chat_id, thread_id, category, player_count)
        VALUES(?, ?, ?, ?)
    `).run(game.chatId, game.threadId, game.category, game.players.size);
    game.matchId = result.lastInsertRowid;

    for (const player of game.players.values()) {
        upsertPlayer(player.user);
        db.prepare('UPDATE telegram_blitz_players SET games = games + 1 WHERE user_id = ?').run(player.id);
    }

    await callApi('sendMessage', {
        chat_id: game.chatId,
        ...(game.threadId ? { message_thread_id: game.threadId } : {}),
        text: `🎮 <b>GS BLITZ начинается!</b>\n\nКатегория: ${CATEGORY_MAP[game.category]}\nИгроков: <b>${game.players.size}</b>`,
        parse_mode: 'HTML',
    });

    await askQuestion(game);
}

function buildQuestionQueue(game) {
    const selected = [];
    const selectedTexts = [];
    const usedIds = new Set();
    const recent = getRecentQuestions(game.category);

    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
        const desiredDifficulty = round >= 4 ? 3 : 2;
        let pool = QUESTIONS.filter((question) =>
            question.category === game.category &&
            question.difficulty >= desiredDifficulty &&
            !usedIds.has(question.id) &&
            !recent.some((item) => item.signature === questionSignature(question)) &&
            !recent.some((item) => similarity(question.text, item.question_text) >= NEAR_DUPLICATE_THRESHOLD) &&
            !selectedTexts.some((text) => similarity(question.text, text) >= NEAR_DUPLICATE_THRESHOLD)
        );

        if (!pool.length) {
            pool = QUESTIONS.filter((question) =>
                question.category === game.category &&
                question.difficulty >= desiredDifficulty &&
                !usedIds.has(question.id) &&
                !selectedTexts.some((text) => similarity(question.text, text) >= NEAR_DUPLICATE_THRESHOLD)
            );
        }

        if (!pool.length) {
            pool = QUESTIONS.filter((question) =>
                question.category === game.category && !usedIds.has(question.id)
            );
        }

        const question = sample(pool);
        if (!question) break;
        usedIds.add(question.id);
        selectedTexts.push(question.text);
        selected.push(question);
    }

    game.preparedQuestions = selected;
}

function nextQuestion(game) {
    const question = game.preparedQuestions.shift();
    if (!question) throw new Error(`Закончилась подготовленная очередь вопросов для категории ${game.category}`);

    game.used.add(question.id);
    game.usedSignatures.add(questionSignature(question));
    game.usedQuestionTexts.push(question.text);
    rememberQuestion(game, question);
    return question;
}

async function askQuestion(game) {
    if (game.status !== 'playing') return;
    if (game.alive.size <= 1 || game.round >= MAX_ROUNDS) {
        await finishMatch(game);
        return;
    }

    game.round += 1;
    game.answers.clear();
    game.roundResult = null;
    game.resolving = false;
    game.current = nextQuestion(game);

    const rows = game.current.answers.map((answer, index) => [{
        text: `${index + 1}️⃣ ${answer}`,
        callback_data: `blitz_answer:${game.round}:${index}`,
    }]);

    const text = [
        `⚡ <b>Раунд ${game.round}</b>`,
        `Категория: ${CATEGORY_MAP[game.category]}`,
        '',
        `❓ ${esc(String(game.current.text).replace(/\s*\[вариант\s+\d+\]\s*$/i, ''))}`,
        '',
        `⏳ На ответ: ${QUESTION_SECONDS} секунд`,
        `👥 В игре: ${game.alive.size}`,
    ].join('\n');

    const message = await callApi('sendMessage', {
        chat_id: game.chatId,
        ...(game.threadId ? { message_thread_id: game.threadId } : {}),
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows },
    });

    game.questionMessageId = message.message_id;
    game.questionDeadlineAt = Date.now() + QUESTION_SECONDS * 1000;
    later(game, () => resolveRound(game), QUESTION_SECONDS * 1000, `round-${game.round}`);
}

async function resolveRound(game) {
    if (game.status !== 'playing' || game.resolving) return;
    game.resolving = true;
    clearTimer(key(game.chatId, game.threadId), game);
    game.resolvingSince = Date.now();

    try {
        // Результат раунда фиксируется только один раз. Если Telegram даст ошибку
        // уже после обновления БД, повторное восстановление не начислит очки дважды.
        if (!game.roundResult) {
            const correct = [];
            const eliminated = [];

            for (const id of game.alive) {
                const answer = game.answers.get(id);
                const delta = game.playerStatsDelta.get(id) || { total: 0, correct: 0 };
                if (answer !== undefined) delta.total += 1;

                if (answer === game.current.correctIndex) {
                    correct.push(id);
                    delta.correct += 1;
                } else {
                    eliminated.push(id);
                }
                game.playerStatsDelta.set(id, delta);
            }

            const nobodyCorrect = correct.length === 0;
            if (!nobodyCorrect) {
                for (const id of eliminated) game.alive.delete(id);
            }
            game.roundResult = { correct, eliminated, nobodyCorrect };
        }

        const { correct, eliminated, nobodyCorrect } = game.roundResult;

        // Сначала закрываем кнопки и показываем итог раунда, и только затем
        // объявляем победителя. Раньше эти запросы шли параллельно, поэтому
        // сообщение о победителе могло появиться раньше правильного ответа и
        // визуально создавать ощущение зависшей игры.
        await callApi('editMessageReplyMarkup', {
            chat_id: game.chatId,
            message_id: game.questionMessageId,
            reply_markup: { inline_keyboard: [] },
        }, { optional: true });

        const correctText = game.current.answers[game.current.correctIndex];
        const lines = [`✅ Правильный ответ: <b>${esc(correctText)}</b>`, ''];

        if (nobodyCorrect) {
            lines.push('😄 Никто не ответил правильно — все остаются в игре.');
        } else {
            lines.push(`🟢 Прошли дальше: <b>${correct.length}</b>`);
            if (eliminated.length) lines.push(`🔴 Выбыли: <b>${eliminated.length}</b>`);
        }

        if (game.alive.size <= 1) {
            lines.push('', '🏁 Матч завершён: остался один игрок.');
        }

        if (game.current.explanation) lines.push('', esc(game.current.explanation));

        await callApi('sendMessage', {
            chat_id: game.chatId,
            ...(game.threadId ? { message_thread_id: game.threadId } : {}),
            text: lines.join('\n'),
            parse_mode: 'HTML',
        }, { optional: true });

        if (game.alive.size <= 1) {
            game.resolving = false;
            game.resolvingSince = 0;
            game.questionDeadlineAt = 0;
            await finishMatch(game);
            return;
        }

        game.resolving = false;
        game.resolvingSince = 0;
        game.questionDeadlineAt = 0;
        later(game, () => askQuestion(game), BETWEEN_MS, `between-round-${game.round}`);
    } catch (error) {
        game.resolving = false;
        game.resolvingSince = 0;
        throw error;
    }
}

async function finishMatch(game) {
    if (game.finishing || game.status === 'finished') return;
    game.finishing = true;
    clearTimer(key(game.chatId, game.threadId), game);
    game.questionDeadlineAt = 0;

    let winnerId = game.alive.size === 1 ? [...game.alive][0] : null;
    if (!winnerId && game.alive.size > 1) winnerId = [...game.alive][0] || null;

    try {
        const flushStats = db.transaction(() => {
            for (const [id, delta] of game.playerStatsDelta.entries()) {
                db.prepare(`
                    UPDATE telegram_blitz_players
                    SET total_answers = total_answers + ?,
                        correct_answers = correct_answers + ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `).run(delta.total, delta.correct, id);
            }
        });
        flushStats();
        game.playerStatsDelta.clear();
        flushQuestionHistory(game);

        if (winnerId) {
            const player = game.players.get(winnerId);
            const bonus = 1;

            db.prepare(`
                UPDATE telegram_blitz_players
                SET rating = rating + 1,
                    wins = wins + 1,
                    win_streak = win_streak + 1,
                    best_streak = MAX(best_streak, win_streak + 1),
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(winnerId);

            for (const id of game.players.keys()) {
                if (id !== winnerId) {
                    db.prepare('UPDATE telegram_blitz_players SET win_streak = 0 WHERE user_id = ?').run(id);
                }
            }

            const row = playerRow(winnerId);
            await callApi('sendMessage', {
                chat_id: game.chatId,
                ...(game.threadId ? { message_thread_id: game.threadId } : {}),
                text: [
                    '🏆 <b>Победитель GS Blitz</b>',
                    '',
                    `👑 ${esc(player?.name || winnerId)}`,
                    `⭐ +${bonus} очко за победу`,
                    `📈 Очки: <b>${row.rating}</b>`,
                    `🔥 Серия побед: <b>${row.win_streak}</b>`,
                ].join('\n'),
                parse_mode: 'HTML',
            });
        }

        if (game.matchId) {
            db.prepare(`
                UPDATE telegram_blitz_matches
                SET winner_id = ?, rounds = ?, finished_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(winnerId, game.round, game.matchId);
        }
    } catch (error) {
        console.error('❌ Blitz finish:', error?.stack || error?.message || error);
    } finally {
        game.status = 'finished';
        game.finishing = false;
        later(game, () => resetLobby(game), 700, 'reset-lobby');
    }
}

async function recoverGame(game, stage, error) {
    const active = games.get(key(game.chatId, game.threadId));
    if (!active || active !== game || game.watchdogRecovering) return;
    game.watchdogRecovering = true;

    console.error(`🔄 Blitz recovery at ${stage}:`, error?.message || error);

    if (game.status === 'playing') {
        game.resolving = false;
        game.resolvingSince = 0;

        const remaining = game.current && game.questionDeadlineAt
            ? Math.max(0, game.questionDeadlineAt - Date.now())
            : 0;

        if (game.current && remaining > 0) {
            game.watchdogRecovering = false;
            later(game, () => resolveRound(game), remaining, `recovered-round-${game.round}`);
            return;
        }

        later(game, async () => {
            game.watchdogRecovering = false;
            if (game.status !== 'playing') return;
            if (game.alive.size <= 1) await finishMatch(game);
            else if (game.current) await resolveRound(game);
            else await askQuestion(game);
        }, Math.min(RECOVERY_DELAY_MS, 800), 'auto-recovery');
        return;
    }

    if (game.status === 'countdown') {
        later(game, async () => { game.watchdogRecovering = false; await beginMatch(game); }, RECOVERY_DELAY_MS, 'countdown-recovery');
        return;
    }

    if (game.status === 'finished') {
        later(game, async () => { game.watchdogRecovering = false; await resetLobby(game); }, 800, 'lobby-recovery');
        return;
    }

    game.watchdogRecovering = false;
}

async function join(callback) {
    const message = callback.message;
    const from = callback.from;
    const game = games.get(key(message.chat.id, threadOf(message)));

    if (!game) {
        await callApi('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: 'Лобби не найдено. Администратор должен выполнить /setblitz.',
            show_alert: true,
        }, { optional: true });
        return true;
    }

    upsertPlayer(from);
    const player = { id: String(from.id), name: displayName(from), user: from };

    if (game.status === 'playing' || game.status === 'finished') {
        if (game.nextQueue.has(player.id)) {
            game.nextQueue.delete(player.id);
            await callApi('answerCallbackQuery', {
                callback_query_id: callback.id,
                text: 'Ты вышел из очереди следующей игры.',
            }, { optional: true });
        } else {
            game.nextQueue.set(player.id, player);
            await callApi('answerCallbackQuery', {
                callback_query_id: callback.id,
                text: 'Ты записан в следующую игру!',
            }, { optional: true });
        }
        return true;
    }

    if (game.queue.has(player.id)) {
        game.queue.delete(player.id);
        await callApi('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: 'Ты вышел из очереди.',
        }, { optional: true });
    } else {
        game.queue.set(player.id, player);
        await callApi('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: 'Ты в игре!',
        }, { optional: true });
    }

    await editLobby(game);

    if (game.status === 'lobby' && game.queue.size >= MIN_PLAYERS) startCountdown(game);
    if (game.status === 'countdown' && game.queue.size < MIN_PLAYERS) {
        clearTimer(key(game.chatId, game.threadId));
        game.status = 'lobby';
        await editLobby(game);
    }
    return true;
}

async function answer(callback) {
    const message = callback.message;
    const game = games.get(key(message.chat.id, threadOf(message)));

    if (!game || game.status !== 'playing') {
        await callApi('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: 'Этот раунд уже завершён.',
        }, { optional: true });
        return true;
    }

    const [, roundRaw, indexRaw] = callback.data.split(':');
    const id = String(callback.from.id);
    const round = Number(roundRaw);
    const answerIndex = Number(indexRaw);

    if (round !== game.round || game.resolving) {
        await callApi('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: 'Этот вопрос уже завершён.',
        }, { optional: true });
        return true;
    }

    if (!game.alive.has(id)) {
        await callApi('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: 'Ты уже выбыл.',
            show_alert: true,
        }, { optional: true });
        return true;
    }

    if (game.answers.has(id)) {
        await callApi('answerCallbackQuery', {
            callback_query_id: callback.id,
            text: 'Ответ уже принят.',
        }, { optional: true });
        return true;
    }

    game.answers.set(id, answerIndex);
    await callApi('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: 'Ответ принят!',
    }, { optional: true });

    // Не ждём лишние секунды, если все оставшиеся игроки уже ответили.
    if (game.answers.size >= game.alive.size) {
        later(game, () => resolveRound(game), 250, `all-answered-${game.round}`);
    }
    return true;
}

async function top(chatId, threadId) {
    const rows = db.prepare(`
        SELECT * FROM telegram_blitz_players
        ORDER BY rating DESC, wins DESC, correct_answers DESC
        LIMIT 15
    `).all();

    const text = [
        '🏆 <b>Топ GS Blitz</b>',
        '',
        ...(rows.length
            ? rows.map((row, index) => `${index + 1}. ${esc(row.display_name)} — <b>${row.rating}</b> 🏆`)
            : ['Пока никто не сыграл.']),
    ].join('\n');

    return callApi('sendMessage', {
        chat_id: chatId,
        ...(threadId ? { message_thread_id: threadId } : {}),
        text,
        parse_mode: 'HTML',
    });
}

async function stats(chatId, threadId, user) {
    upsertPlayer(user);
    const row = playerRow(user.id);
    const accuracy = row.total_answers
        ? Math.round((row.correct_answers / row.total_answers) * 100)
        : 0;

    return callApi('sendMessage', {
        chat_id: chatId,
        ...(threadId ? { message_thread_id: threadId } : {}),
        text: [
            '📊 <b>Статистика GS Blitz</b>',
            '',
            `Игрок: ${esc(row.display_name)}`,
            `🏆 Очки: <b>${row.rating}</b>`,
            `🏆 Победы: <b>${row.wins}</b>`,
            `🎮 Игры: <b>${row.games}</b>`,
            `✅ Правильные ответы: <b>${row.correct_answers}</b>`,
            `🎯 Точность: <b>${accuracy}%</b>`,
            `🔥 Лучшая серия: <b>${row.best_streak}</b>`,
        ].join('\n'),
        parse_mode: 'HTML',
    });
}

async function handleText(message, isAdmin) {
    const command = (message.text || '').trim().split(/\s+/)[0].split('@')[0].toLowerCase();

    if (command === '/setblitz') return setup(message, isAdmin);
    if (command === '/blitztop') {
        await top(message.chat.id, threadOf(message));
        return true;
    }
    if (command === '/blitzstats') {
        await stats(message.chat.id, threadOf(message), message.from);
        return true;
    }
    if (command === '/blitzreset') {
        if (!isAdmin) {
            await callApi('sendMessage', {
                chat_id: message.chat.id,
                ...(threadOf(message) ? { message_thread_id: threadOf(message) } : {}),
                text: '❌ Команду /blitzreset может использовать только администратор группы.',
            }, { optional: true });
            return true;
        }
        await createLobby(message.chat.id, threadOf(message));
        return true;
    }
    return false;
}

async function handleCallback(callback) {
    const data = callback.data || '';

    if (data === 'blitz_join') return join(callback);
    if (data.startsWith('blitz_answer:')) return answer(callback);

    if (data === 'blitz_top') {
        await callApi('answerCallbackQuery', { callback_query_id: callback.id }, { optional: true });
        await top(callback.message.chat.id, threadOf(callback.message));
        return true;
    }

    if (data === 'blitz_stats') {
        await callApi('answerCallbackQuery', { callback_query_id: callback.id }, { optional: true });
        await stats(callback.message.chat.id, threadOf(callback.message), callback.from);
        return true;
    }

    return false;
}

function startWatchdog() {
    if (watchdog) return;
    watchdog = setInterval(() => {
        const now = Date.now();
        for (const game of games.values()) {
            if (game.watchdogRecovering) continue;
            const gameKey = key(game.chatId, game.threadId);
            const hasTimer = timers.has(gameKey);

            // Потерянный или зависший переход автоматически восстанавливается.
            if (game.transitionDueAt && now > game.transitionDueAt + WATCHDOG_GRACE_MS) {
                console.warn(`🐕 Blitz watchdog: просрочен ${game.transitionLabel || 'transition'} в ${gameKey}`);
                clearTimer(gameKey, game);
                void recoverGame(game, `watchdog-${game.transitionLabel || 'transition'}`, new Error('transition timeout'));
                continue;
            }

            if (game.status === 'playing' && game.resolving && game.resolvingSince && now > game.resolvingSince + RESOLVING_STUCK_MS) {
                console.warn(`🐕 Blitz watchdog: resolveRound завис в ${gameKey}`);
                game.resolving = false;
                game.resolvingSince = 0;
                void recoverGame(game, 'watchdog-resolving', new Error('round resolving timeout'));
                continue;
            }

            if (!hasTimer && !game.transitionDueAt) {
                if (game.status === 'countdown') {
                    void recoverGame(game, 'watchdog-countdown-missing', new Error('countdown timer missing'));
                } else if (game.status === 'playing') {
                    if (game.questionDeadlineAt && now >= game.questionDeadlineAt) {
                        void resolveRound(game).catch((error) => recoverGame(game, 'watchdog-round-missing', error));
                    } else if (!game.resolving) {
                        void recoverGame(game, 'watchdog-playing-missing', new Error('playing timer missing'));
                    }
                } else if (game.status === 'finished') {
                    void recoverGame(game, 'watchdog-lobby-missing', new Error('new lobby timer missing'));
                }
            }
        }
    }, WATCHDOG_INTERVAL_MS);
    watchdog.unref?.();
}

async function init(telegramApi) {
    api = telegramApi;
    startWatchdog();
    const chatId = getSetting('telegram_blitz_chat_id');
    if (!chatId) return;

    const threadRaw = getSetting('telegram_blitz_thread_id');
    const threadId = threadRaw ? Number(threadRaw) : null;

    try {
        await createLobby(chatId, threadId);
        console.log(`✅ GS Blitz restored: ${chatId}:${threadId || 0}`);
    } catch (error) {
        console.error('❌ Blitz restore:', error?.stack || error?.message || error);
        setTimeout(() => {
            createLobby(chatId, threadId).catch((retryError) => {
                console.error('❌ Blitz restore retry:', retryError?.stack || retryError?.message || retryError);
            });
        }, 5000);
    }
}

module.exports = {
    init,
    handleText,
    handleCallback,
    QUESTION_COUNT: QUESTIONS.length,
    CATEGORY_COUNT: Object.keys(CATEGORY_MAP).length,
};
