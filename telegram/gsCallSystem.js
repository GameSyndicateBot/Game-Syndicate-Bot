const { db } = require('./database');

const EMOJIS = [
    '🦊','👻','🤖','🐸','🐼','👑','🥷','🐧','🦁','🐺','🦄','😎','🐻','🐨','⚡','🎯',
    '🐯','🦝','🦉','🐙','🦈','🐲','🦋','🐝','🦖','🐬','🦅','🐢','🐱','🐶','🦇','🦜',
    '🍀','🌙','☀️','⭐','🔥','💎','🎲','🎮','🚀','🛸','⚔️','🛡️','🏹','🧩','🎭','🎪',
    '🍉','🍒','🍓','🥝','🍕','🍔','🍩','🍪','☕','🎸','🎧','🎨','🏆','🎁','🔮','🧿',
];

const ACTIVE_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted']);

const upsertMember = db.prepare(`
    INSERT INTO telegram_gs_members (
        chat_id, user_id, first_name, last_name, username,
        is_bot, status, emoji, updated_at
    ) VALUES (
        @chat_id, @user_id, @first_name, @last_name, @username,
        @is_bot, @status, @emoji, CURRENT_TIMESTAMP
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

const listActiveMembers = db.prepare(`
    SELECT * FROM telegram_gs_members
    WHERE chat_id = ?
      AND is_bot = 0
      AND status IN ('creator', 'administrator', 'member', 'restricted')
    ORDER BY CASE WHEN emoji IS NULL OR emoji = '' THEN 1 ELSE 0 END, created_at ASC, user_id ASC
`);

const listUsedEmojis = db.prepare(`
    SELECT emoji FROM telegram_gs_members
    WHERE chat_id = ? AND emoji IS NOT NULL AND emoji <> ''
`);

const setEmoji = db.prepare(`
    UPDATE telegram_gs_members
    SET emoji = ?, updated_at = CURRENT_TIMESTAMP
    WHERE chat_id = ? AND user_id = ?
`);

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
    };
}

function rememberUser(chatId, user, status = 'member') {
    if (!chatId || !user?.id) return;

    const existing = getMember.get(String(chatId), String(user.id));
    const record = normalizeUser(user, status);
    record.chat_id = String(chatId);
    record.emoji = existing?.emoji || null;
    upsertMember.run(record);
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

    const members = listActiveMembers.all(String(chat.id));
    for (const member of members) ensureEmoji(chat.id, member);

    if (!members.length) {
        await sendMessage(api, chat.id, '⚠️ Не удалось найти участников для призыва.', {
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

    const mentionChunks = chunkMentions(members);
    for (let index = 0; index < mentionChunks.length; index += 1) {
        const body = index === 0 ? `${header}${mentionChunks[index]}` : mentionChunks[index];
        await sendMessage(api, chat.id, body, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
        });
    }

    return true;
}

module.exports = {
    ACTIVE_STATUSES,
    handleGsCommand,
    rememberChatMemberUpdate,
    rememberMessage,
    rememberUser,
};
