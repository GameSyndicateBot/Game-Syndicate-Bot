
if (!global.gs_sent_lobbies) {
    global.gs_sent_lobbies = new Set();
}

async function safeSend(bot, chatId, text, opts = {}) {
    try {
        return await bot.sendMessage(chatId, text, opts);
    } catch (err) {
        if (err.response?.body?.parameters?.retry_after) {
            const wait = err.response.body.parameters.retry_after * 1000;
            await new Promise(r => setTimeout(r, wait));
            return await bot.sendMessage(chatId, text, opts);
        }
    }
}) {
    try {
        return await bot.sendMessage(chatId, text, opts);
    } catch (err) {
        if (err.response?.body?.parameters?.retry_after) {
            const wait = err.response.body.parameters.retry_after * 1000;
            console.log(`⏳ Telegram rate limit, жду ${wait}ms`);
            await new Promise(r => setTimeout(r, wait));
            return await bot.sendMessage(chatId, text, opts);
        }
        console.error('Telegram send error:', err.message);
    }
}) {
    try {
        return await safeSend(bot, chatId, text, opts);
    } catch (err) {
        if (err.response && err.response.body && err.response.body.parameters?.retry_after) {
            const wait = err.response.body.parameters.retry_after * 1000;
            console.log(`⏳ Telegram rate limit, жду ${wait}ms`);
            await new Promise(r => setTimeout(r, wait));
            return await safeSend(bot, chatId, text, opts);
        }
        console.error('Telegram send error:', err.message);
    }
}

const fs = require('fs');
const path = require('path');
const {
    setRuntime,
    createGathering,
    publish,
    handleTelegram: handleCrossGatheringTelegram,
    resolveStartTimestamp,
} = require('./crossGatherings');
const { getSetting, setSetting } = require('./ecosystemDb');
const {
    setGameLobbyRuntime,
    publishGameLobby,
    handleGameLobbyTelegramCallback,
    handleTelegramPinnedServiceMessage,
} = require('../systems/gameLobbySystem');
const crocodile = require('../crocodileSystem');
const gsCall = require('./gsCallSystem');

const drafts = new Map();
let pollingStarted = false;
let updateOffset = 0;

const GAMES = [
    ['Goose Goose Duck', 'game_ggd'],
    ['Бункер', 'game_bunker'],
    ['Fortnite', 'game_fortnite'],
    ['R.E.P.O.', 'game_repo'],
    ['Peak', 'game_peak'],
    ['Другое', 'game_other'],
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function userName(user) {
    return user.username
        ? `@${user.username}`
        : [user.first_name, user.last_name].filter(Boolean).join(' ')
            || `ID ${user.id}`;
}

function draftKey(chatId, userId) {
    return `${chatId}:${userId}`;
}

function gameKeyboard() {
    const rows = [];
    for (let index = 0; index < GAMES.length; index += 2) {
        const row = [{ text: GAMES[index][0], callback_data: GAMES[index][1] }];
        if (GAMES[index + 1]) {
            row.push({ text: GAMES[index + 1][0], callback_data: GAMES[index + 1][1] });
        }
        rows.push(row);
    }
    rows.push([{ text: 'Отмена', callback_data: 'draft_cancel' }]);
    return { inline_keyboard: rows };
}

function forceReply() {
    return { force_reply: true, selective: true };
}

function createTelegramApi(token) {
    const baseUrl = `https://api.telegram.org/bot${token}`;

    return async function telegramApi(method, payload = {}) {
        const fileFields = payload.__fileFields || null;
        const cleanPayload = { ...payload };
        delete cleanPayload.__fileFields;

        let requestOptions;

        if (fileFields && Object.keys(fileFields).length > 0) {
            const form = new FormData();

            for (const [key, value] of Object.entries(cleanPayload)) {
                if (value === undefined || value === null) continue;
                form.append(
                    key,
                    typeof value === 'object' ? JSON.stringify(value) : String(value),
                );
            }

            for (const [field, file] of Object.entries(fileFields)) {
                const filePath = typeof file === 'string' ? file : file.path;
                const filename = typeof file === 'string'
                    ? path.basename(filePath)
                    : (file.filename || path.basename(filePath));
                const contentType = typeof file === 'string'
                    ? 'application/octet-stream'
                    : (file.contentType || 'application/octet-stream');

                const buffer = fs.readFileSync(filePath);
                form.append(field, new Blob([buffer], { type: contentType }), filename);
            }

            requestOptions = {
                method: 'POST',
                body: form,
            };
        } else {
            requestOptions = {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(cleanPayload),
            };
        }

        const response = await fetch(`${baseUrl}/${method}`, requestOptions);

        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
            const description = data?.description || `${response.status} ${response.statusText}`;
            throw new Error(`Telegram API ${method}: ${description}`);
        }
        return data.result;
    };
}

async function sendMessage(api, chatId, text, options = {}) {
    return api('sendMessage', { chat_id: chatId, text, ...options });
}

async function answerCallback(api, callbackQueryId, text, showAlert = false) {
    return api('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
    }).catch(error => console.error('Telegram callback:', error.message));
}


async function isChatAdmin(api, chatId, userId) {
    const admins = await api('getChatAdministrators', {
        chat_id: chatId,
    }).catch(() => []);

    return admins.some(item => String(item.user.id) === String(userId));
}

async function deleteMessageQuietly(api, chatId, messageId) {
    if (!messageId) return;
    await api('deleteMessage', {
        chat_id: chatId,
        message_id: messageId,
    }).catch(() => null);
}

async function beginPrivateGather(api, from) {
    const targetChatId = getSetting('telegram_gatherings_chat_id');
    const targetThreadId = getSetting('telegram_gatherings_thread_id');

    if (!targetChatId) {
        await sendMessage(api, from.id, [
            '⚠️ Канал сборов ещё не настроен.',
            '',
            'Администратор должен открыть Telegram-чат game-lobby и выполнить там:',
            '/setgatherchannel',
        ].join('\n'));
        return;
    }

    const key = draftKey(from.id, from.id);

    drafts.set(key, {
        chatId: String(from.id),
        targetChatId: String(targetChatId),
        targetThreadId: targetThreadId ? Number(targetThreadId) : null,
        creatorId: String(from.id),
        creatorName: userName(from),
        step: 'game',
    });

    await sendMessage(api, from.id, '🎮 Выбери игру для сбора:', {
        reply_markup: gameKeyboard(),
    });
}

async function beginGather(api, message) {
    const { chat, from } = message;

    if (chat.type === 'private') {
        await beginPrivateGather(api, from);
        return;
    }

    await deleteMessageQuietly(api, chat.id, message.message_id);

    try {
        await beginPrivateGather(api, from);
    } catch (error) {
        console.error('Не удалось открыть личный сбор:', error.message);

        const warning = await sendMessage(api, chat.id, [
            `@${from.username || userName(from)}, сначала открой личный чат с ботом и нажми Start.`,
            'После этого снова используй /gather.',
        ].join('\n')).catch(() => null);

        if (warning?.message_id) {
            setTimeout(() => {
                deleteMessageQuietly(api, chat.id, warning.message_id);
            }, 20_000);
        }
    }
}


function telegramFullName(user) {
    return [user?.first_name, user?.last_name]
        .filter(Boolean)
        .join(' ')
        || 'Без имени';
}

function telegramUserLink(user) {
    const name = escapeHtml(telegramFullName(user));

    if (user?.username) {
        return `<a href="https://t.me/${escapeHtml(user.username)}">${name}</a>`;
    }

    if (user?.id) {
        return `<a href="tg://user?id=${user.id}">${name}</a>`;
    }

    return name;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function formatMoscowTime(timestampSeconds) {
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(new Date(Number(timestampSeconds || 0) * 1000));
}

async function sendLeaveLog(api, update) {
    const targetChatId = getSetting('telegram_leave_log_chat_id');
    const targetThreadId = getSetting('telegram_leave_log_thread_id');

    if (!targetChatId) {
        return false;
    }

    const chatMember = update.chat_member;
    if (!chatMember?.new_chat_member?.user) {
        return false;
    }

    const oldStatus = chatMember.old_chat_member?.status;
    const newStatus = chatMember.new_chat_member?.status;
    const member = chatMember.new_chat_member.user;
    const actor = chatMember.from;

    const wasInside = [
        'creator',
        'administrator',
        'member',
        'restricted',
    ].includes(oldStatus);

    const isLeft = newStatus === 'left';
    const isBanned = newStatus === 'kicked';

    if (!wasInside || (!isLeft && !isBanned)) {
        return false;
    }

    const selfLeave = isLeft
        && String(actor?.id) === String(member.id);

    let title;
    let icon;
    let reasonLine;

    if (isBanned) {
        title = member.is_bot ? 'Бот заблокирован' : 'Пользователь заблокирован';
        icon = member.is_bot ? '🤖' : '🚫';
        reasonLine = actor
            ? `🛡 <b>Заблокировал:</b> ${telegramUserLink(actor)}`
            : '🛡 <b>Заблокировал:</b> неизвестно';
    } else if (selfLeave) {
        title = member.is_bot ? 'Бот покинул группу' : 'Участник покинул группу';
        icon = member.is_bot ? '🤖' : '🚪';
        reasonLine = 'ℹ️ <b>Причина:</b> вышел самостоятельно';
    } else {
        title = member.is_bot ? 'Бот удалён из группы' : 'Участник удалён из группы';
        icon = member.is_bot ? '🤖' : '⛔';
        reasonLine = actor
            ? `🛡 <b>Удалил:</b> ${telegramUserLink(actor)}`
            : '🛡 <b>Удалил:</b> неизвестно';
    }

    const lines = [
        `${icon} <b>${title}</b>`,
        '',
        `${member.is_bot ? '🤖 <b>Бот:</b>' : '👤 <b>Участник:</b>'} ${telegramUserLink(member)}`,
        member.username
            ? `🔗 <b>Username:</b> @${escapeHtml(member.username)}`
            : '🔗 <b>Username:</b> отсутствует',
        `🆔 <b>Telegram ID:</b> <code>${member.id}</code>`,
        reasonLine,
        `💬 <b>Группа:</b> ${escapeHtml(chatMember.chat?.title || 'Без названия')}`,
        `🕒 <b>Время:</b> ${escapeHtml(formatMoscowTime(chatMember.date))} МСК`,
    ];

    const farewellImagePath = path.join(
        __dirname,
        '..',
        'assets',
        'leave',
        'gs-telegram-farewell.png',
    );

    await api('sendPhoto', {
        chat_id: targetChatId,
        caption: lines.join('\n'),
        parse_mode: 'HTML',
        ...(targetThreadId
            ? { message_thread_id: Number(targetThreadId) }
            : {}),
        __fileFields: {
            photo: {
                path: farewellImagePath,
                filename: 'gs-telegram-farewell.png',
                contentType: 'image/png',
            },
        },
    });

    console.log(
        `[Telegram Leave Log] ${newStatus}: ` +
        `${member.id} (${member.username || telegramFullName(member)})`
    );

    return true;
}

async function handleCommand(api, message, command) {
    const crocHandled = await crocodile.handleCommand(
        api,
        message,
        command,
        (chatId, userId) => isChatAdmin(api, chatId, userId)
    );
    if (crocHandled) return true;

    const { chat, from } = message;

    if (command === '/gs') {
        return gsCall.handleGsCommand(api, message, isChatAdmin, sendMessage);
    }

    if (command === '/gsregister') {
        return gsCall.handleGsRegisterCommand(api, message, sendMessage);
    }

    if (command === '/start') {
        await sendMessage(api, chat.id, [
            '🎮 <b>GAME SYNDICATE — СБОРЫ</b>',
            '',
            'Этот бот используется для быстрой публикации игровых лобби.',
            '',
            'Команда:',
            '<code>/game</code> + три строки: игра, карта, код.',
            '',
            'Лобби сразу появится в Telegram game-lobby и в назначенном Discord-канале.',
        ].join('\n'), { parse_mode: 'HTML' });
        return true;
    }

    if (command === '/setleavelog') {
        if (chat.type === 'private') {
            await sendMessage(
                api,
                chat.id,
                'Эту команду нужно выполнить внутри темы «Логи» в Telegram-группе.'
            );
            return true;
        }

        const admin = await isChatAdmin(api, chat.id, from.id);
        if (!admin) {
            await deleteMessageQuietly(api, chat.id, message.message_id);
            return true;
        }

        setSetting('telegram_leave_log_chat_id', String(chat.id));
        setSetting(
            'telegram_leave_log_thread_id',
            message.message_thread_id
                ? String(message.message_thread_id)
                : ''
        );
        setSetting(
            'telegram_leave_log_chat_title',
            chat.title || 'Telegram logs'
        );

        await deleteMessageQuietly(api, chat.id, message.message_id);

        const confirmation = await sendMessage(api, chat.id, [
            '✅ <b>Логи выходов настроены.</b>',
            '',
            'Сюда будут приходить уведомления, когда участник:',
            '• выйдет самостоятельно;',
            '• будет удалён администратором;',
            '• будет заблокирован.',
            '',
            'Важно: Telegram-бот должен быть администратором группы.',
        ].join('\n'), {
            parse_mode: 'HTML',
            ...(message.message_thread_id
                ? { message_thread_id: message.message_thread_id }
                : {}),
        });

        setTimeout(() => {
            deleteMessageQuietly(api, chat.id, confirmation.message_id);
        }, 20_000);

        return true;
    }

    if (command === '/setgatherchannel') {
        if (chat.type === 'private') {
            await sendMessage(api, chat.id, 'Эту команду нужно выполнить в Telegram-чате game-lobby.');
            return true;
        }

        const admin = await isChatAdmin(api, chat.id, from.id);
        if (!admin) {
            await deleteMessageQuietly(api, chat.id, message.message_id);
            return true;
        }

        setSetting('telegram_gatherings_chat_id', String(chat.id));
        setSetting('telegram_gatherings_chat_title', chat.title || 'game-lobby');
        if (message.message_thread_id) {
            setSetting('telegram_gatherings_thread_id', String(message.message_thread_id));
        } else {
            setSetting('telegram_gatherings_thread_id', '');
        }

        await deleteMessageQuietly(api, chat.id, message.message_id);
        const confirmation = await sendMessage(api, chat.id, [
            '✅ Этот чат назначен каналом игровых сборов.',
            'Все новые сборы будут публиковаться здесь.',
        ].join('\n'), {
            ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
        });

        setTimeout(() => {
            deleteMessageQuietly(api, chat.id, confirmation.message_id);
        }, 15_000);

        return true;
    }

    if (command === '/game') {
        const fullText = message.text || '';

        const args = fullText
            .replace(/^\/\s*game(?:@\w+)?[ \t]*/i, '')
            .replace(/^\r?\n/, '')
            .trim();

        if (!args) {
            await sendMessage(api, chat.id, [
                '🎮 <b>GS Game Lobby</b>',
                '',
                'Отправь команду в четыре строки:',
                '<code>/game',
                'Goose Goose Duck',
                'Basement',
                'ABC123</code>',
                '',
                '1 строка — игра',
                '2 строка — карта / режим',
                '3 строка — код лобби',
            ].join('\n'), {
                parse_mode: 'HTML',
                ...(message.message_thread_id
                    ? { message_thread_id: message.message_thread_id }
                    : {}),
            });
            return true;
        }

        const parts = args
            .split(/\r?\n/)
            .map(value => value.trim())
            .filter(Boolean);

        let game, location, codeLine;

        if (parts.length === 3) {
            [game, location, codeLine] = parts;
        } else {
            const raw = message.text.replace('/game', '').trim();
            const inlineParts = raw.split(/\s+/);
            if (inlineParts.length >= 3) {
                game = inlineParts[0];
                location = inlineParts[1];
                codeLine = inlineParts.slice(2).join(' ');
            } else {
                await sendMessage(api, chat.id, '❌ Неверный формат. Используй либо 3 строки, либо: /game название место код');
                return;
            }
        }

        const mapName = location;
        const lobbyCode = codeLine;

        if (game.length > 60 || mapName.length > 60 || lobbyCode.length > 40) {
            await sendMessage(
                api,
                chat.id,
                '❌ Слишком длинные данные. Игра и карта — до 60 символов, код — до 40.',
                message.message_thread_id
                    ? { message_thread_id: message.message_thread_id }
                    : {}
            );
            return true;
        }

        try {
            await publishGameLobby({
                creatorId: `tg:${from.id}`,
                creatorName: userName(from),
                game,
                mapName,
                lobbyCode,
            });

            if (chat.type !== 'private') {
                await deleteMessageQuietly(api, chat.id, message.message_id);
            }

            if (chat.type === 'private') {
                await sendMessage(api, chat.id, [
                    '✅ Лобби опубликовано в Telegram и Discord.',
                    'Оно автоматически закроется через 4 часа.',
                ].join('\n'));
            }
        } catch (error) {
            const messageText = String(error?.message || error);
            if (error?.code === 'DISCORD_NOT_READY') {
                console.warn('[Telegram /game] Discord ещё не готов; команда отклонена без публикации.');
            } else {
                console.error(`[Telegram /game] ${messageText}`);
            }
            await sendMessage(api, chat.id, [
                '❌ Не удалось опубликовать лобби.',
                `<code>${messageText}</code>`,
            ].join('\n'), {
                parse_mode: 'HTML',
                ...(message.message_thread_id
                    ? { message_thread_id: message.message_thread_id }
                    : {}),
            });
        }

        return true;
    }

    if (command === '/gather' || command === '/сбор') {
        await sendMessage(api, chat.id, [
            'ℹ️ Команда <code>/gather</code> заменена на <code>/game</code>.',
            '',
            'Формат:',
            '<code>/game',
            'Goose Goose Duck',
            'Basement',
            'ABC123</code>',
        ].join('\n'), {
            parse_mode: 'HTML',
            ...(message.message_thread_id
                ? { message_thread_id: message.message_thread_id }
                : {}),
        });
        return true;
    }

    if (command === '/cancel') {
        drafts.delete(draftKey(chat.id, from.id));
        await sendMessage(api, chat.id, 'Создание сбора отменено.');
        return true;
    }

    return false;
}

async function handleText(api, message) {
    const text = message.text?.trim();
    if (!text) return;

    // Дополнительно понимаем вариант "/ game" с пробелом.
    const normalizedText = text.replace(/^\/\s+game\b/i, '/game');
    if (normalizedText !== text) {
        message = { ...message, text: normalizedText };
    }

    const command = normalizedText
        .split(/\s+/)[0]
        .split('@')[0]
        .toLowerCase();

    if (command.startsWith('/')) {
        const handled = await handleCommand(api, message, command);
        if (handled) return;
    }

    const crocMessageHandled = await crocodile.handleMessage(api, message);
    if (crocMessageHandled) return;

    const key = draftKey(message.chat.id, message.from.id);
    const draft = drafts.get(key);
    if (!draft || text.startsWith('/')) return;

    if (draft.step === 'custom_game') {
        if (text.length < 2 || text.length > 50) {
            await sendMessage(api, message.chat.id, 'Название должно содержать от 2 до 50 символов.');
            return;
        }
        draft.game = text;
        draft.step = 'time';
        await sendMessage(api, message.chat.id, 'Во сколько собираемся? Например: <b>20:00</b>', {
            parse_mode: 'HTML',
            reply_markup: forceReply(),
        });
        return;
    }

    if (draft.step === 'time') {
        if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(text)) {
            await sendMessage(api, message.chat.id, 'Укажи время в формате ЧЧ:ММ, например 20:00.');
            return;
        }
        draft.startsAtText = text.padStart(5, '0');
        draft.step = 'count';
        await sendMessage(api, message.chat.id, 'Сколько всего игроков нужно? Введи число от 2 до 50:', {
            reply_markup: forceReply(),
        });
        return;
    }

    if (draft.step === 'count') {
        const count = Number(text);
        if (!Number.isInteger(count) || count < 2 || count > 50) {
            await sendMessage(api, message.chat.id, 'Введи целое число от 2 до 50.');
            return;
        }
        draft.maxPlayers = count;
        draft.step = 'comment';
        await sendMessage(api, message.chat.id, 'Добавь комментарий или отправь <b>-</b>, если он не нужен:', {
            parse_mode: 'HTML',
            reply_markup: forceReply(),
        });
        return;
    }

    if (draft.step === 'comment') {
        draft.comment = text === '-' ? null : text.slice(0, 300);

        const gathering = createGathering({
            creatorPlatform: 'telegram',
            creatorId: draft.creatorId,
            creatorName: draft.creatorName,
            game: draft.game,
            time: draft.startsAtText,
            startsAtTs: resolveStartTimestamp(draft.startsAtText),
            maxPlayers: draft.maxPlayers,
            comment: draft.comment,
            telegramChatId: draft.targetChatId,
            telegramThreadId: draft.targetThreadId,
            discordUserId: null,
        });

        await publish(gathering);
        drafts.delete(key);
    }
}

async function handleCallback(api, callback) {
    const data = callback.data || '';
    const from = callback.from;
    const message = callback.message;
    if (!message) return;

    const crocCallbackHandled = await crocodile.handleCallback(api, callback);
    if (crocCallbackHandled) return;

    const gsRegisterHandled = await gsCall.handleGsRegisterCallback(api, callback, answerCallback);
    if (gsRegisterHandled) return;

    if (data.startsWith('game_lobby_close:')) {
        const handled = await handleGameLobbyTelegramCallback(
            api,
            callback,
            answerCallback
        );
        if (handled) return;
    }

    if (data.startsWith('xg_')) {
        const handled = await handleCrossGatheringTelegram(api, callback, answerCallback);
        if (handled) return;
    }

    const key = draftKey(message.chat.id, from.id);

    if (data.startsWith('game_')) {
        const draft = drafts.get(key);
        if (!draft) {
            await answerCallback(api, callback.id, 'Создание сбора уже завершено или отменено.');
            return;
        }

        const selected = GAMES.find(([, id]) => id === data);
        if (!selected) return;

        if (data === 'game_other') {
            draft.step = 'custom_game';
            await answerCallback(api, callback.id, 'Напиши название игры');
            await sendMessage(api, message.chat.id, 'Напиши название игры:', {
                reply_markup: forceReply(),
            });
            return;
        }

        draft.game = selected[0];
        draft.step = 'time';
        await answerCallback(api, callback.id, 'Игра выбрана');
        await sendMessage(api, message.chat.id, 'Во сколько собираемся? Например: <b>20:00</b>', {
            parse_mode: 'HTML',
            reply_markup: forceReply(),
        });
        return;
    }

    if (data === 'draft_cancel') {
        drafts.delete(key);
        await answerCallback(api, callback.id, 'Отменено');
        await api('editMessageText', {
            chat_id: message.chat.id,
            message_id: message.message_id,
            text: 'Создание сбора отменено.',
        });
    }
}

async function processUpdate(api, update) {
    try {
        if (update.chat_member) {
            gsCall.rememberChatMemberUpdate(update);
            await sendLeaveLog(api, update);
            return;
        }

        if (update.message) {
            gsCall.rememberMessage(update.message);
        }

        if (update.message?.pinned_message) {
            await handleTelegramPinnedServiceMessage(update.message);
            return;
        }

        if (update.message?.text) {
            await handleText(api, update.message);
        } else if (update.callback_query) {
            await handleCallback(api, update.callback_query);
        }
    } catch (error) {
        console.error('❌ Ошибка обработки Telegram update:', error.message);
    }
}

async function pollingLoop(api) {
    while (pollingStarted) {
        try {
            const updates = await api('getUpdates', {
                offset: updateOffset,
                timeout: 30,
                allowed_updates: [
                    'message',
                    'callback_query',
                    'chat_member',
                ],
            });

            for (const update of updates) {
                updateOffset = update.update_id + 1;
                await processUpdate(api, update);
            }
        } catch (error) {
            console.error('⚠️ Telegram polling error:', error.message);
            await sleep(3000);
        }
    }
}

async function startTelegramBot(client) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.log('ℹ️ Telegram-бот не запущен: TELEGRAM_BOT_TOKEN не указан в .env');
        return null;
    }
    if (pollingStarted) return true;

    const api = createTelegramApi(token);
    const botInfo = await api('getMe');
    setRuntime(api, client);
    setGameLobbyRuntime(api, client);
    gsCall.setDiscordClient(client);

    await api('deleteWebhook', { drop_pending_updates: false }).catch(() => null);
    await api('setMyCommands', {
        commands: [
            { command: 'gs', description: 'призвать участников группы' },
            { command: 'gsregister', description: 'изменить личный эмодзи для GS-созыва' },
            { command: 'game', description: 'создать игровое лобби' },
            { command: 'setgatherchannel', description: 'назначить Telegram game-lobby' },
            { command: 'setleavelog', description: 'назначить тему логов выходов' },
            { command: 'setcrocodile', description: 'назначить тему Крокодила' },
            { command: 'crocodile', description: 'начать игру Крокодил' },
            { command: 'croctop', description: 'топ игроков Крокодила' },
            { command: 'crocstats', description: 'личная статистика Крокодила' },
            { command: 'crocstop', description: 'остановить текущий раунд' },
            { command: 'crocreset', description: 'сбросить зависшие раунды' },
        ],
    }).catch(error => {
        console.error('⚠️ Не удалось установить команды Telegram:', error.message);
    });

    crocodile.init(api);

    pollingStarted = true;
    pollingLoop(api).catch(error => {
        pollingStarted = false;
        console.error('❌ Telegram polling stopped:', error);
    });

    console.log(`✅ GS Telegram Gather Bot запущен: @${botInfo.username}`);
    console.log('✅ Telegram leave logs: chat_member tracking enabled');
    return { api, botInfo };
}

module.exports = { startTelegramBot };