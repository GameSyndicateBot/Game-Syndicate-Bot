const { db: telegramDb } = require('./database');
const { db } = require('../database/db');

let discordClient = null;
const DISCORD_GS_CHANNEL_ID = process.env.GS_CALL_DISCORD_CHANNEL_ID || '1526531339149512754';
const GS_MESSAGE_TTL_MS = 5 * 60 * 1000;

// GS-регистрация хранится в основной БД Discord, которая попадает в резервные копии.
db.exec(`
CREATE TABLE IF NOT EXISTS telegram_gs_members (
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    is_bot INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'member',
    emoji TEXT,
    registered INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_id),
    UNIQUE (chat_id, emoji)
);
`);

// Однократно переносим прежние регистрации из отдельной Telegram-БД.
try {
    const oldRows = telegramDb.prepare('SELECT * FROM telegram_gs_members').all();
    const migrate = db.prepare(`
        INSERT OR IGNORE INTO telegram_gs_members (
            chat_id,user_id,first_name,last_name,username,is_bot,status,emoji,registered,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);
    const tx = db.transaction(rows => {
        for (const row of rows) {
            migrate.run(
                row.chat_id,row.user_id,row.first_name,row.last_name,row.username,row.is_bot,row.status,
                row.emoji,row.registered ?? 1,row.created_at,row.updated_at
            );
        }
    });
    tx(oldRows);
} catch (error) {
    console.warn(`⚠️ Не удалось перенести старые GS-регистрации: ${error.message}`);
}


const EMOJIS = [
    // Животные и персонажи
    '🦊','👻','😈','👿','🤖','🐸','🐼','👑','🥷','🐧','🦁','🐺','🦄','😎','🐻','🐨','⚡','🎯',
    '🐯','🦝','🦉','🐙','🦈','🐲','🦋','🐝','🦖','🐬','🦅','🐢','🐱','🐶','🦇','🦜',
    '🐹','🐰','🦔','🦦','🦥','🦘','🦬','🦣','🐗','🦏','🦛','🐊','🐍','🦎','🐉','🦕',
    '🐳','🐋','🐟','🐠','🐡','🦀','🦞','🦐','🦑','🪼','🐚','🦭','🐓','🦃','🦚','🦩',

    // Символы, игры и приключения
    '🍀','🌙','☀️','⭐','🔥','💎','🎲','🎮','🚀','🛸','⚔️','🛡️','🏹','🧩','🎭','🎪',
    '🌟','✨','💫','☄️','🌈','🌊','🌪️','❄️','🌋','🌌','🪐','🧨','💣','🗡️','🔱','🪄',
    '🎃','🤠','🧙','🧛','🧟','🧞','🧚','🦸','🦹','👽','💀','☠️','👾','🕵️','🧑‍🚀','🧑‍🎤',
    '♠️','♥️','♦️','♣️','🃏','🎰','🎳','🥅','🏀','⚽','🏈','🏒','🥊','🏎️','🏍️','⛵',

    // Еда, музыка и предметы
    '🍉','🍒','🍓','🥝','🍕','🍔','🍩','🍪','☕','🎸','🎧','🎨','🏆','🎁','🔮','🧿',
    '🍎','🍊','🍋','🍌','🍇','🍑','🍍','🥥','🥑','🌶️','🍄','🧀','🍗','🍣','🍿','🍫',
    '🥤','🧋','🍺','🍷','🥂','🎹','🥁','🎷','🎺','🪕','🎻','🎤','📸','💻','⌚','📱',
];

const ACTIVE_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted']);

const upsertMember = db.prepare(`
    INSERT INTO telegram_gs_members (
        chat_id, user_id, first_name, last_name, username,
        is_bot, status, emoji, registered, updated_at
    ) VALUES (
        @chat_id, @user_id, @first_name, @last_name, @username,
        @is_bot, @status, @emoji, @registered, CURRENT_TIMESTAMP
    )
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        username = excluded.username,
        is_bot = excluded.is_bot,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
`);

const getMember = db.prepare(`
    SELECT * FROM telegram_gs_members
    WHERE chat_id = ? AND user_id = ?
`);

const listRegisteredMembers = db.prepare(`
    SELECT * FROM telegram_gs_members
    WHERE chat_id = ?
      AND is_bot = 0
      AND registered = 1
      AND emoji IS NOT NULL
      AND emoji <> ''
      AND status IN ('creator', 'administrator', 'member', 'restricted')
    ORDER BY created_at ASC, user_id ASC
`);

const listUsedEmojis = db.prepare(`
    SELECT emoji FROM telegram_gs_members
    WHERE chat_id = ? AND registered = 1 AND emoji IS NOT NULL AND emoji <> ''
`);

const setEmoji = db.prepare(`
    UPDATE telegram_gs_members
    SET emoji = ?, registered = 1, updated_at = CURRENT_TIMESTAMP
    WHERE chat_id = ? AND user_id = ?
`);

const getEmojiOwner = db.prepare(`
    SELECT user_id FROM telegram_gs_members
    WHERE chat_id = ? AND emoji = ? AND registered = 1
`);

const EMOJIS_PER_PAGE = 16;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function normalizeUser(user, status = 'member') {
    return {
        chat_id: '',
        user_id: String(user.id),
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        username: user.username || '',
        is_bot: user.is_bot ? 1 : 0,
        status,
        emoji: null,
        registered: 1,
    };
}

function rememberUser(chatId, user, status = 'member') {
    if (!chatId || !user?.id) return;

    const existing = getMember.get(String(chatId), String(user.id));
    const record = normalizeUser(user, status);
    record.chat_id = String(chatId);
    record.emoji = existing?.emoji || null;
    record.registered = 1;
    upsertMember.run(record);

    if (!record.is_bot && ACTIVE_STATUSES.has(status)) {
        const member = getMember.get(String(chatId), String(user.id));
        if (member && !member.emoji) ensureEmoji(chatId, member);
    }
}

function rememberMessage(message) {
    const chat = message?.chat;
    if (!chat || chat.type === 'private') return;

    if (message.from) rememberUser(chat.id, message.from, 'member');
    for (const user of message.new_chat_members || []) {
        rememberUser(chat.id, user, 'member');
    }
    if (message.left_chat_member) {
        rememberUser(chat.id, message.left_chat_member, 'left');
    }
}

function rememberChatMemberUpdate(update) {
    const chatMember = update?.chat_member;
    const chatId = chatMember?.chat?.id;
    const member = chatMember?.new_chat_member;
    const user = member?.user;
    if (!chatId || !user) return;
    rememberUser(chatId, user, member.status || 'member');
}

async function syncAdministrators(api, chatId) {
    const admins = await api('getChatAdministrators', { chat_id: chatId }).catch(() => []);
    for (const entry of admins) {
        rememberUser(chatId, entry.user, entry.status || 'administrator');
    }
}

function nextFreeEmoji(chatId) {
    const used = new Set(listUsedEmojis.all(String(chatId)).map(row => row.emoji));
    const free = EMOJIS.find(emoji => !used.has(emoji));
    if (free) return free;

    // Запасной вариант, если участников больше базового набора.
    let index = 1;
    while (used.has(`👤${index}`)) index += 1;
    return `👤${index}`;
}

function ensureEmoji(chatId, member) {
    if (member.emoji) return member.emoji;
    const emoji = nextFreeEmoji(chatId);
    setEmoji.run(emoji, String(chatId), String(member.user_id));
    member.emoji = emoji;
    return emoji;
}

function mentionByEmoji(member) {
    return `<a href="tg://user?id=${escapeHtml(member.user_id)}">${escapeHtml(member.emoji)}</a>`;
}

function chunkMentions(members, maxLength = 3200) {
    const chunks = [];
    let current = '';

    for (const member of members) {
        const mention = mentionByEmoji(member);
        const candidate = current ? `${current} ${mention}` : mention;
        if (candidate.length > maxLength && current) {
            chunks.push(current);
            current = mention;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}


function registrationText(member) {
    const current = member?.registered && member?.emoji
        ? `\n\nТвой текущий эмодзи: <b>${escapeHtml(member.emoji)}</b>`
        : '';

    return [
        '🎮 <b>РЕГИСТРАЦИЯ В GS-СОЗЫВЕ</b>',
        '',
        'Выбери личный эмодзи. Именно им бот будет отмечать тебя при команде <code>/gs</code>.',
        '',
        'Эмодзи можно поменять в любой момент, снова вызвав <code>/gsregister</code>.',
        current,
    ].join('\n').replace(/\n{3,}/g, '\n\n');
}

function emojiKeyboard(chatId, userId, page = 0) {
    const totalPages = Math.ceil(EMOJIS.length / EMOJIS_PER_PAGE);
    const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
    const member = getMember.get(String(chatId), String(userId));
    const start = safePage * EMOJIS_PER_PAGE;
    const pageEmojis = EMOJIS.slice(start, start + EMOJIS_PER_PAGE);
    const rows = [];

    for (let i = 0; i < pageEmojis.length; i += 4) {
        rows.push(pageEmojis.slice(i, i + 4).map((emoji, offset) => {
            const index = start + i + offset;
            const owner = getEmojiOwner.get(String(chatId), emoji);
            const isMine = Boolean(member?.registered) && member?.emoji === emoji;
            const isTaken = owner && String(owner.user_id) !== String(userId);
            return {
                text: isMine ? `✅ ${emoji}` : isTaken ? `🔒 ${emoji}` : emoji,
                callback_data: `gsreg_pick:${userId}:${index}:${safePage}`,
            };
        }));
    }

    const nav = [];
    if (safePage > 0) nav.push({ text: '⬅️', callback_data: `gsreg_page:${userId}:${safePage - 1}` });
    nav.push({ text: `${safePage + 1}/${totalPages}`, callback_data: `gsreg_noop:${userId}` });
    if (safePage < totalPages - 1) nav.push({ text: '➡️', callback_data: `gsreg_page:${userId}:${safePage + 1}` });
    rows.push(nav);

    return { inline_keyboard: rows };
}

async function handleGsRegisterCommand(api, message, sendMessage) {
    const { chat, from } = message;
    if (chat.type === 'private') {
        await sendMessage(api, chat.id, '⛔ Команду <code>/gsregister</code> нужно использовать в группе Game Syndicate.', {
            parse_mode: 'HTML',
        });
        return true;
    }

    rememberUser(chat.id, from, 'member');
    const member = getMember.get(String(chat.id), String(from.id));

    await sendMessage(api, chat.id, registrationText(member), {
        parse_mode: 'HTML',
        reply_markup: emojiKeyboard(chat.id, from.id, 0),
        ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
    });
    return true;
}

async function safeEditRegistrationMessage(api, params) {
    try {
        await api('editMessageText', params);
        return true;
    } catch (error) {
        const message = String(error?.message || error || '');

        // Telegram возвращает 400, когда текст и клавиатура уже совпадают.
        // Для интерфейса регистрации это нормальная ситуация, а не ошибка.
        if (message.includes('message is not modified')) return false;

        // Не создаём лавину повторных editMessageText при быстром клике.
        if (message.includes('Too Many Requests') || message.includes('retry after')) return false;

        throw error;
    }
}

async function handleGsRegisterCallback(api, callback, answerCallback) {
    const data = callback.data || '';
    if (!data.startsWith('gsreg_')) return false;

    const message = callback.message;
    const from = callback.from;
    if (!message || !from) return true;

    const chatId = message.chat.id;
    rememberUser(chatId, from, 'member');

    if (data.startsWith('gsreg_noop')) {
        const ownerId = data.split(':')[1];
        if (ownerId && String(ownerId) !== String(from.id)) {
            await answerCallback(api, callback.id, 'Открой свою регистрацию командой /gsregister', true);
            return true;
        }
        await answerCallback(api, callback.id, 'Выбери эмодзи');
        return true;
    }

    if (data.startsWith('gsreg_page:')) {
        const parts = data.split(':');
        const ownerId = parts.length >= 3 ? parts[1] : String(from.id);
        const page = Number(parts.length >= 3 ? parts[2] : parts[1]) || 0;

        if (String(ownerId) !== String(from.id)) {
            await answerCallback(api, callback.id, 'Это меню другого участника. Вызови /gsregister', true);
            return true;
        }

        // Сначала закрываем callback, чтобы Telegram не присылал повторные нажатия.
        await answerCallback(api, callback.id);
        const member = getMember.get(String(chatId), String(from.id));
        await safeEditRegistrationMessage(api, {
            chat_id: chatId,
            message_id: message.message_id,
            text: registrationText(member),
            parse_mode: 'HTML',
            reply_markup: emojiKeyboard(chatId, from.id, page),
        });
        return true;
    }

    if (data.startsWith('gsreg_pick:')) {
        const parts = data.split(':');
        const hasOwner = parts.length >= 4;
        const ownerId = hasOwner ? parts[1] : String(from.id);
        const indexRaw = hasOwner ? parts[2] : parts[1];
        const pageRaw = hasOwner ? parts[3] : parts[2];

        if (String(ownerId) !== String(from.id)) {
            await answerCallback(api, callback.id, 'Это меню другого участника. Вызови /gsregister', true);
            return true;
        }

        const index = Number(indexRaw);
        const page = Number(pageRaw) || 0;
        const emoji = EMOJIS[index];
        if (!emoji) {
            await answerCallback(api, callback.id, 'Эмодзи не найден.', true);
            return true;
        }

        const owner = getEmojiOwner.get(String(chatId), emoji);
        if (owner && String(owner.user_id) !== String(from.id)) {
            await answerCallback(api, callback.id, 'Этот эмодзи уже занят другим участником.', true);
            return true;
        }

        try {
            setEmoji.run(emoji, String(chatId), String(from.id));
        } catch (error) {
            await answerCallback(api, callback.id, 'Этот эмодзи уже успели выбрать. Попробуй другой.', true);
            return true;
        }

        const member = getMember.get(String(chatId), String(from.id));
        await answerCallback(api, callback.id, `Выбран эмодзи ${emoji}`);
        await safeEditRegistrationMessage(api, {
            chat_id: chatId,
            message_id: message.message_id,
            text: [
                registrationText(member),
                '',
                `✅ <b>Готово!</b> Твой эмодзи для созыва: ${escapeHtml(emoji)}`,
            ].join('\n'),
            parse_mode: 'HTML',
            reply_markup: emojiKeyboard(chatId, from.id, page),
        });
        return true;
    }

    return false;
}

function setDiscordClient(client) {
    discordClient = client;
}

async function deleteTelegramMessage(api, chatId, messageId) {
    if (!messageId) return;
    await api('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => null);
}

async function publishDiscordGs(game) {
    if (!discordClient) return null;
    const channel = await discordClient.channels.fetch(DISCORD_GS_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased()) return null;

    const sentMessage = await channel.send({
        content: `@everyone

🎮 **GAME SYNDICATE — СБОР**
Игра: **${String(game).slice(0, 1000)}**`,
        allowedMentions: { parse: ['everyone'] },
    });

    // Сбор должен исчезнуть одновременно в Telegram и Discord.
    setTimeout(() => {
        sentMessage.delete().catch(() => null);
    }, GS_MESSAGE_TTL_MS).unref?.();

    return sentMessage;
}

async function handleGsCommand(api, message, isChatAdmin, sendMessage) {
    const { chat, from } = message;

    if (chat.type === 'private') {
        await sendMessage(api, chat.id, '⛔ Команда /gs работает только внутри группы.');
        return true;
    }

    const admin = await isChatAdmin(api, chat.id, from.id);
    if (!admin) {
        await sendMessage(api, chat.id, '⛔ Эта команда доступна только администраторам группы.', {
            ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
        });
        return true;
    }

    const text = String(message.text || '')
        .replace(/^\/gs(?:@\w+)?(?:\s+|$)/i, '')
        .trim();

    if (!text) {
        await sendMessage(api, chat.id, 'Укажите текст призыва.\n\nНапример: <code>/gs Peak</code>', {
            parse_mode: 'HTML',
            ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
        });
        return true;
    }

    rememberUser(chat.id, from, 'administrator');
    await syncAdministrators(api, chat.id);

    // Команда не должна оставаться в Telegram-чате.
    await deleteTelegramMessage(api, chat.id, message.message_id);

    // Всем уже известным активным участникам автоматически назначается эмодзи.
    const knownMembers = db.prepare(`
        SELECT * FROM telegram_gs_members
        WHERE chat_id = ? AND is_bot = 0
          AND status IN ('creator','administrator','member','restricted')
        ORDER BY created_at ASC, user_id ASC
    `).all(String(chat.id));
    for (const member of knownMembers) ensureEmoji(chat.id, member);

    const members = listRegisteredMembers.all(String(chat.id));

    if (!members.length) {
        await sendMessage(api, chat.id, '⚠️ Бот ещё не видел участников группы. После любого сообщения участник автоматически получит эмодзи.', {
            ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
        });
        return true;
    }

    const creatorName = from.username
        ? `@${from.username}`
        : [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Администратор';

    const header = [
        '🎮 <b>GAME SYNDICATE</b>',
        '',
        `📢 <b>${escapeHtml(creatorName)}</b> собирает команду!`,
        '',
        `🎯 ${escapeHtml(text.slice(0, 1000))}`,
        '',
    ].join('\n');

    const sentMessages = [];
    const mentionChunks = chunkMentions(members);
    for (let index = 0; index < mentionChunks.length; index += 1) {
        const body = index === 0 ? `${header}${mentionChunks[index]}` : mentionChunks[index];
        const sent = await sendMessage(api, chat.id, body, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
        });
        if (sent?.message_id) sentMessages.push(sent.message_id);
    }

    setTimeout(() => {
        for (const messageId of sentMessages) {
            deleteTelegramMessage(api, chat.id, messageId).catch(() => null);
        }
    }, GS_MESSAGE_TTL_MS).unref?.();

    await publishDiscordGs(text).catch(error => {
        console.error(`❌ Не удалось опубликовать /gs в Discord: ${error.message}`);
    });

    return true;
}

module.exports = {
    ACTIVE_STATUSES,
    handleGsCommand,
    handleGsRegisterCommand,
    handleGsRegisterCallback,
    rememberChatMemberUpdate,
    rememberMessage,
    rememberUser,
    setDiscordClient,
};
