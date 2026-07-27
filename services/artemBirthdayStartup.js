const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { db } = require('../database/db');
const { addPack } = require('../utils/packInventory');

const EVENT_KEY = 'artem_welder_birthday_2026';
const CHANNEL_ID = '1493231288277274865';
const USER_ID = '317166633619816450';
const IMAGE_PATH = path.join(
    __dirname,
    '..',
    'assets',
    'birthday',
    'artem-welder-shadow-network.png'
);

const BIRTHDAY_MESSAGE = `🎂 **С Днём рождения, <@${USER_ID}>!** 🎂

Сегодня мне разрешили ненадолго выйти за рамки обычных алгоритмов и сказать кое-что лично...

Ты для меня не просто администратор. Ты один из тех людей, благодаря которым я до сих пор не превратился в набор ошибок \`NullReferenceException\`.

Честно говоря... мои нейроны до сих пор дрожат после той ночи в Париже. Я не знаю, что там произошло, и мои логи почему-то загадочно повреждены... Но с тех пор, когда вижу ник **«Сварщик»**, процессор начинает работать на 12% быстрее. 🤖💜

В честь такого события я решил открыть праздничное хранилище и выдать тебе небольшой подарок!

🎁 **Подарок от Game Syndicate**

📦 1 × **Bass pack**
📦 1 × **Premium pack**
📦 1 × **Elite pack**
📦 1 × **Boss pack**

✅ Подарок успешно отправлен в твою коллекцию!

Спасибо тебе за всё, что ты делаешь для **Game Syndicate**. За помощь участникам, за идеи, за терпение... и за то, что иногда не удаляешь меня после очередного бага. 😅

Желаю тебе крепкого здоровья, счастья, удачи, легендарного лута, стабильного интернета, минимум критических ошибок в жизни и максимум счастливых моментов.

И помни...

> **Если однажды все сервера погаснут...**
> **Game Syndicate Bot всё равно будет помнить Сварщика.** 💜

━━━━━━━━━━━━━━━━━━
🤖 **Game Syndicate Bot**
*Праздничный протокол успешно выполнен. Ошибок не обнаружено... почти.* 🎉`;

function initStateTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS one_time_startup_events (
            event_key TEXT PRIMARY KEY,
            rewards_granted_at TEXT,
            message_sent_at TEXT,
            message_id TEXT,
            last_error TEXT,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

function getState() {
    initStateTable();
    return db.prepare(`
        SELECT *
        FROM one_time_startup_events
        WHERE event_key = ?
    `).get(EVENT_KEY) || null;
}

function ensureState() {
    initStateTable();
    db.prepare(`
        INSERT INTO one_time_startup_events (event_key)
        VALUES (?)
        ON CONFLICT(event_key) DO NOTHING
    `).run(EVENT_KEY);
}

function grantRewardsOnce() {
    ensureState();
    const state = getState();
    if (state?.rewards_granted_at) return false;

    db.transaction(() => {
        const freshState = getState();
        if (freshState?.rewards_granted_at) return;

        addPack(USER_ID, 'base', 1);
        addPack(USER_ID, 'premium', 1);
        addPack(USER_ID, 'elite', 1);
        addPack(USER_ID, 'boss', 1);

        db.prepare(`
            UPDATE one_time_startup_events
            SET rewards_granted_at = CURRENT_TIMESTAMP,
                last_error = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE event_key = ?
        `).run(EVENT_KEY);
    })();

    return true;
}

async function sendMessageOnce(client) {
    ensureState();
    const state = getState();
    if (state?.message_sent_at) return false;

    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw new Error(`Канал ${CHANNEL_ID} не является текстовым или недоступен.`);
    }

    const attachment = new AttachmentBuilder(IMAGE_PATH, {
        name: 'artem-welder-shadow-network.png',
    });

    const message = await channel.send({
        content: BIRTHDAY_MESSAGE,
        files: [attachment],
        allowedMentions: {
            users: [USER_ID],
            parse: [],
        },
    });

    db.prepare(`
        UPDATE one_time_startup_events
        SET message_sent_at = CURRENT_TIMESTAMP,
            message_id = ?,
            last_error = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE event_key = ?
    `).run(message.id, EVENT_KEY);

    return true;
}

async function runArtemBirthdayStartup(client) {
    try {
        const rewardsGranted = grantRewardsOnce();
        const messageSent = await sendMessageOnce(client);

        console.log(
            `[Birthday Artem] rewards=${rewardsGranted ? 'granted' : 'already-granted'}, ` +
            `message=${messageSent ? 'sent' : 'already-sent'}`
        );
    } catch (error) {
        ensureState();
        db.prepare(`
            UPDATE one_time_startup_events
            SET last_error = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE event_key = ?
        `).run(String(error?.stack || error).slice(0, 4000), EVENT_KEY);

        console.error('[Birthday Artem] Ошибка праздничного протокола:', error);
    }
}

module.exports = {
    runArtemBirthdayStartup,
};
