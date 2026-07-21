'use strict';

const crypto = require('node:crypto');
const { db } = require('../database/db');

db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_discord_links (
        telegram_user_id TEXT PRIMARY KEY,
        discord_user_id TEXT NOT NULL UNIQUE,
        telegram_username TEXT,
        telegram_display_name TEXT,
        linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS telegram_link_codes (
        code TEXT PRIMARY KEY,
        telegram_user_id TEXT NOT NULL,
        telegram_username TEXT,
        telegram_display_name TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user
    ON telegram_link_codes(telegram_user_id);

    CREATE TABLE IF NOT EXISTS gs_account_links (
        telegram_user_id TEXT PRIMARY KEY,
        discord_user_id TEXT UNIQUE,
        telegram_username TEXT,
        linked_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

const CODE_TTL_MS = 10 * 60 * 1000;

function cleanupExpiredCodes() {
    const now = Date.now();
    db.prepare(`
        DELETE FROM telegram_link_codes
        WHERE expires_at < ? OR used_at IS NOT NULL
    `).run(now);
}

function generateCode() {
    cleanupExpiredCodes();

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = String(crypto.randomInt(100000, 1000000));
        const exists = db.prepare(`
            SELECT 1 FROM telegram_link_codes WHERE code = ?
        `).get(code);

        if (!exists) return code;
    }

    throw new Error('Не удалось создать уникальный код привязки.');
}

function createLinkCode({ telegramUserId, telegramUsername, telegramDisplayName }) {
    cleanupExpiredCodes();

    const telegramId = String(telegramUserId);
    db.prepare(`
        DELETE FROM telegram_link_codes
        WHERE telegram_user_id = ?
    `).run(telegramId);

    const code = generateCode();
    const createdAt = Date.now();
    const expiresAt = createdAt + CODE_TTL_MS;

    db.prepare(`
        INSERT INTO telegram_link_codes (
            code,
            telegram_user_id,
            telegram_username,
            telegram_display_name,
            created_at,
            expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        code,
        telegramId,
        telegramUsername || null,
        telegramDisplayName || null,
        createdAt,
        expiresAt,
    );

    return { code, expiresAt };
}

function consumeLinkCode({ code, discordUserId }) {
    cleanupExpiredCodes();

    const normalizedCode = String(code || '').trim();
    const row = db.prepare(`
        SELECT *
        FROM telegram_link_codes
        WHERE code = ? AND used_at IS NULL AND expires_at >= ?
    `).get(normalizedCode, Date.now());

    if (!row) {
        return {
            ok: false,
            reason: 'Код не найден или срок его действия истёк.',
        };
    }

    const telegramId = String(row.telegram_user_id);
    const discordId = String(discordUserId);

    const currentByTelegram = db.prepare(`
        SELECT * FROM telegram_discord_links
        WHERE telegram_user_id = ?
    `).get(telegramId);

    const currentByDiscord = db.prepare(`
        SELECT * FROM telegram_discord_links
        WHERE discord_user_id = ?
    `).get(discordId);

    if (currentByTelegram && currentByTelegram.discord_user_id !== discordId) {
        return {
            ok: false,
            reason: 'Этот Telegram-аккаунт уже привязан к другому Discord-профилю.',
        };
    }

    if (currentByDiscord && currentByDiscord.telegram_user_id !== telegramId) {
        return {
            ok: false,
            reason: 'Твой Discord-профиль уже привязан к другому Telegram-аккаунту.',
        };
    }

    const transaction = db.transaction(() => {
        db.prepare(`
            INSERT INTO telegram_discord_links (
                telegram_user_id,
                discord_user_id,
                telegram_username,
                telegram_display_name,
                linked_at,
                updated_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(telegram_user_id) DO UPDATE SET
                discord_user_id = excluded.discord_user_id,
                telegram_username = excluded.telegram_username,
                telegram_display_name = excluded.telegram_display_name,
                updated_at = CURRENT_TIMESTAMP
        `).run(
            telegramId,
            discordId,
            row.telegram_username,
            row.telegram_display_name,
        );

        db.prepare(`
            INSERT INTO gs_account_links (
                telegram_user_id,
                discord_user_id,
                telegram_username,
                linked_at
            ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(telegram_user_id) DO UPDATE SET
                discord_user_id = excluded.discord_user_id,
                telegram_username = excluded.telegram_username,
                linked_at = CURRENT_TIMESTAMP
        `).run(
            telegramId,
            discordId,
            row.telegram_username,
        );

        db.prepare(`
            UPDATE telegram_link_codes
            SET used_at = ?
            WHERE code = ?
        `).run(Date.now(), normalizedCode);
    });

    transaction();

    return {
        ok: true,
        telegramUserId: telegramId,
        telegramUsername: row.telegram_username,
        telegramDisplayName: row.telegram_display_name,
        discordUserId: discordId,
    };
}

function getLinkByTelegramId(telegramUserId) {
    const telegramId = String(telegramUserId);
    return db.prepare(`
        SELECT *
        FROM telegram_discord_links
        WHERE telegram_user_id = ?
    `).get(telegramId) || db.prepare(`
        SELECT
            telegram_user_id,
            discord_user_id,
            telegram_username,
            NULL AS telegram_display_name,
            linked_at,
            linked_at AS updated_at
        FROM gs_account_links
        WHERE telegram_user_id = ?
    `).get(telegramId);
}

function getLinkByDiscordId(discordUserId) {
    const discordId = String(discordUserId);
    return db.prepare(`
        SELECT *
        FROM telegram_discord_links
        WHERE discord_user_id = ?
    `).get(discordId) || db.prepare(`
        SELECT
            telegram_user_id,
            discord_user_id,
            telegram_username,
            NULL AS telegram_display_name,
            linked_at,
            linked_at AS updated_at
        FROM gs_account_links
        WHERE discord_user_id = ?
    `).get(discordId);
}

function unlinkByDiscordId(discordUserId) {
    const discordId = String(discordUserId);
    const transaction = db.transaction(() => {
        const first = db.prepare(`
            DELETE FROM telegram_discord_links
            WHERE discord_user_id = ?
        `).run(discordId);
        const second = db.prepare(`
            DELETE FROM gs_account_links
            WHERE discord_user_id = ?
        `).run(discordId);
        return first.changes + second.changes;
    });

    return transaction() > 0;
}

function unlinkByTelegramId(telegramUserId) {
    const telegramId = String(telegramUserId);
    const transaction = db.transaction(() => {
        const first = db.prepare(`
            DELETE FROM telegram_discord_links
            WHERE telegram_user_id = ?
        `).run(telegramId);
        const second = db.prepare(`
            DELETE FROM gs_account_links
            WHERE telegram_user_id = ?
        `).run(telegramId);
        db.prepare(`
            DELETE FROM telegram_link_codes
            WHERE telegram_user_id = ?
        `).run(telegramId);
        return first.changes + second.changes;
    });

    return transaction() > 0;
}

async function notifyTelegramLinkSuccess(telegramUserId, discordDisplayName) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return false;

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    chat_id: telegramUserId,
                    parse_mode: 'HTML',
                    text: [
                        '✅ <b>Аккаунты успешно связаны!</b>',
                        '',
                        `Discord-профиль: <b>${escapeHtml(discordDisplayName)}</b>`,
                        '',
                        'Теперь Telegram-бот сможет показывать данные твоего профиля Game Syndicate.',
                    ].join('\n'),
                }),
            },
        );

        return response.ok;
    } catch (error) {
        console.error('Не удалось отправить подтверждение в Telegram:', error.message);
        return false;
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

module.exports = {
    createLinkCode,
    consumeLinkCode,
    getLinkByTelegramId,
    getLinkByDiscordId,
    unlinkByDiscordId,
    unlinkByTelegramId,
    notifyTelegramLinkSuccess,
};
