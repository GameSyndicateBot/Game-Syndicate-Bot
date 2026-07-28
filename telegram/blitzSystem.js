const { db, getSetting, setSetting } = require('./ecosystemDb');
const { QUESTIONS, CATEGORY_MAP } = require('./blitzQuestions');

const MIN_PLAYERS = 2;
const LOBBY_SECONDS = 10;
const QUESTION_SECONDS = 7;
const BETWEEN_MS = 2200;
const MAX_ROUNDS = 25;
const API_RETRIES = 3;
const RECOVERY_DELAY_MS = 3000;

let api = null;
const games = new Map();
const timers = new Map();

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

function clearTimer(gameKey) {
    const timer = timers.get(gameKey);
    if (timer) clearTimeout(timer);
    timers.delete(gameKey);
}

function later(game, fn, ms, label = 'transition') {
    const gameKey = key(game.chatId, game.threadId);
    clearTimer(gameKey);
    const generation = game.generation;

    timers.set(gameKey, setTimeout(async () => {
        timers.delete(gameKey);
        const active = games.get(gameKey);
        if (!active || active !== game || active.generation !== generation) return;

        try {
            await fn();
        } catch (error) {
            console.error(`❌ Blitz ${label}:`, error?.stack || error?.message || error);
            await recoverGame(game, label, error);
        }
    }, ms));
}

async function callApi(method, payload, options = {}) {
    const retries = Number.isInteger(options.retries) ? options.retries : API_RETRIES;
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            return await api(method, payload);
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
            rating INTEGER NOT NULL DEFAULT 1000,
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
    `);
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
        category: null,
        lobbyMessageId: null,
        questionMessageId: null,
        matchId: null,
        current: null,
        resolving: false,
        finishing: false,
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
    game.resolving = false;
    game.finishing = false;

    const categories = [...new Set(QUESTIONS.map((question) => question.category))];
    game.category = sample(categories);

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

function nextQuestion(game) {
    let pool = QUESTIONS.filter((question) => question.category === game.category && !game.used.has(question.id));
    if (!pool.length) {
        game.used.clear();
        pool = QUESTIONS.filter((question) => question.category === game.category);
    }
    const question = sample(pool);
    if (!question) throw new Error(`Нет вопросов для категории ${game.category}`);
    game.used.add(question.id);
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
        `❓ ${esc(game.current.text)}`,
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
    later(game, () => resolveRound(game), QUESTION_SECONDS * 1000, `round-${game.round}`);
}

async function resolveRound(game) {
    if (game.status !== 'playing' || game.resolving) return;
    game.resolving = true;
    clearTimer(key(game.chatId, game.threadId));

    try {
        const correct = [];
        const eliminated = [];

        for (const id of game.alive) {
            const answer = game.answers.get(id);
            if (answer !== undefined) {
                db.prepare(`
                    UPDATE telegram_blitz_players
                    SET total_answers = total_answers + 1
                    WHERE user_id = ?
                `).run(id);
            }

            if (answer === game.current.correctIndex) {
                correct.push(id);
                changeRating(id, 2);
                db.prepare(`
                    UPDATE telegram_blitz_players
                    SET correct_answers = correct_answers + 1
                    WHERE user_id = ?
                `).run(id);
            } else {
                eliminated.push(id);
            }
        }

        const nobodyCorrect = correct.length === 0;
        if (!nobodyCorrect) {
            for (const id of eliminated) game.alive.delete(id);
        }

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

        if (game.current.explanation) lines.push('', esc(game.current.explanation));

        await callApi('sendMessage', {
            chat_id: game.chatId,
            ...(game.threadId ? { message_thread_id: game.threadId } : {}),
            text: lines.join('\n'),
            parse_mode: 'HTML',
        });

        if (game.alive.size <= 1) {
            await finishMatch(game);
            return;
        }

        game.resolving = false;
        later(game, () => askQuestion(game), BETWEEN_MS, `between-round-${game.round}`);
    } catch (error) {
        game.resolving = false;
        throw error;
    }
}

async function finishMatch(game) {
    if (game.finishing || game.status === 'finished') return;
    game.finishing = true;
    clearTimer(key(game.chatId, game.threadId));

    let winnerId = game.alive.size === 1 ? [...game.alive][0] : null;
    if (!winnerId && game.alive.size > 1) winnerId = [...game.alive][0] || null;

    try {
        if (winnerId) {
            const player = game.players.get(winnerId);
            const bonus = 20 + Math.max(0, (game.players.size - 1) * 2);
            changeRating(winnerId, bonus);

            db.prepare(`
                UPDATE telegram_blitz_players
                SET wins = wins + 1,
                    win_streak = win_streak + 1,
                    best_streak = MAX(best_streak, win_streak + 1)
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
                    `⭐ +${bonus} рейтинга за победу`,
                    `📈 Рейтинг: <b>${row.rating}</b>`,
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
        later(game, () => createLobby(game.chatId, game.threadId), 4000, 'new-lobby');
    }
}

async function recoverGame(game, stage, error) {
    const active = games.get(key(game.chatId, game.threadId));
    if (!active || active !== game) return;

    console.error(`🔄 Blitz recovery at ${stage}:`, error?.message || error);

    if (game.status === 'playing') {
        game.resolving = false;
        await callApi('sendMessage', {
            chat_id: game.chatId,
            ...(game.threadId ? { message_thread_id: game.threadId } : {}),
            text: '⚠️ Telegram временно задержал игру. GS Blitz автоматически продолжит через несколько секунд.',
        }, { optional: true, retries: 1 });

        later(game, async () => {
            if (game.status !== 'playing') return;
            if (game.alive.size <= 1) await finishMatch(game);
            else await askQuestion(game);
        }, RECOVERY_DELAY_MS, 'auto-recovery');
        return;
    }

    if (game.status === 'countdown') {
        later(game, () => beginMatch(game), RECOVERY_DELAY_MS, 'countdown-recovery');
        return;
    }

    if (game.status === 'finished') {
        later(game, () => createLobby(game.chatId, game.threadId), RECOVERY_DELAY_MS, 'lobby-recovery');
    }
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
            ? rows.map((row, index) => `${index + 1}. ${esc(row.display_name)} — <b>${row.rating}</b> ⭐ | побед: ${row.wins}`)
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
            `⭐ Рейтинг: <b>${row.rating}</b>`,
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

async function init(telegramApi) {
    api = telegramApi;
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
