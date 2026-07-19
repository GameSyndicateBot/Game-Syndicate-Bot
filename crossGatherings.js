'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const {
    db,
    getSetting,
} = require('./ecosystemDb');

let runtime = { api: null, client: null };
let reminderTimer = null;

db.exec(`
    CREATE TABLE IF NOT EXISTS cross_gathering_reminders (
        gathering_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        platform_user_id TEXT NOT NULL,
        discord_user_id TEXT,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (gathering_id, platform, platform_user_id)
    );
`);


function setRuntime(api, client) {
    runtime = { api, client };
    startReminderScheduler();
}

function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function stripHtml(value) {
    return String(value).replace(/<[^>]*>/g, '');
}

function resolveStartTimestamp(timeText) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeText);
    if (!match) throw new Error('Некорректное время.');

    const now = new Date();
    const moscowNow = new Date(
        now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }),
    );

    const targetMoscow = new Date(moscowNow);
    targetMoscow.setHours(Number(match[1]), Number(match[2]), 0, 0);

    if (targetMoscow.getTime() <= moscowNow.getTime() + 60_000) {
        targetMoscow.setDate(targetMoscow.getDate() + 1);
    }

    const utcApprox = targetMoscow.getTime() - (3 * 60 * 60 * 1000);
    return utcApprox;
}

function formatStart(ts) {
    if (!ts) return '';
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(Number(ts))).replace(',', '');
}

function createGathering(data) {
    const startsAtTs = data.startsAtTs || resolveStartTimestamp(data.time);

    const result = db.prepare(`
        INSERT INTO cross_gatherings (
            creator_platform,
            creator_platform_id,
            creator_name,
            game,
            starts_at_text,
            starts_at_ts,
            max_players,
            comment,
            telegram_chat_id,
            telegram_thread_id
        ) VALUES (
            @creatorPlatform,
            @creatorId,
            @creatorName,
            @game,
            @time,
            @startsAtTs,
            @maxPlayers,
            @comment,
            @telegramChatId,
            @telegramThreadId
        )
    `).run({
        ...data,
        startsAtTs,
        telegramThreadId: data.telegramThreadId ?? null,
    });

    const id = Number(result.lastInsertRowid);

    addMember(
        id,
        data.creatorPlatform,
        data.creatorId,
        data.creatorName,
        data.discordUserId || null,
    );

    return getGathering(id);
}

function getGathering(id) {
    return db.prepare(`
        SELECT *
        FROM cross_gatherings
        WHERE id = ?
    `).get(Number(id));
}

function members(id) {
    return db.prepare(`
        SELECT *
        FROM cross_gathering_members
        WHERE gathering_id = ?
        ORDER BY datetime(joined_at) ASC
    `).all(Number(id));
}

function findDuplicateMember(id, platform, platformId, discordId) {
    if (discordId) {
        const byDiscord = db.prepare(`
            SELECT *
            FROM cross_gathering_members
            WHERE gathering_id = ? AND discord_user_id = ?
        `).get(Number(id), String(discordId));

        if (byDiscord) return byDiscord;
    }

    return db.prepare(`
        SELECT *
        FROM cross_gathering_members
        WHERE gathering_id = ?
          AND platform = ?
          AND platform_user_id = ?
    `).get(Number(id), platform, String(platformId));
}

function addMember(id, platform, platformId, name, discordId = null) {
    if (findDuplicateMember(id, platform, platformId, discordId)) return false;

    db.prepare(`
        INSERT INTO cross_gathering_members (
            gathering_id,
            platform,
            platform_user_id,
            discord_user_id,
            display_name
        ) VALUES (?, ?, ?, ?, ?)
    `).run(
        Number(id),
        platform,
        String(platformId),
        discordId ? String(discordId) : null,
        name,
    );

    return true;
}

function removeMember(id, platform, platformId, discordId = null) {
    if (discordId) {
        db.prepare(`
            DELETE FROM cross_gathering_members
            WHERE gathering_id = ? AND discord_user_id = ?
        `).run(Number(id), String(discordId));
        return;
    }

    db.prepare(`
        DELETE FROM cross_gathering_members
        WHERE gathering_id = ?
          AND platform = ?
          AND platform_user_id = ?
    `).run(Number(id), platform, String(platformId));
}


function addReminder(id, platform, platformId, name, discordId = null) {
    db.prepare(`
        INSERT INTO cross_gathering_reminders (
            gathering_id,
            platform,
            platform_user_id,
            discord_user_id,
            display_name
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(gathering_id, platform, platform_user_id) DO UPDATE SET
            discord_user_id = excluded.discord_user_id,
            display_name = excluded.display_name
    `).run(
        Number(id),
        platform,
        String(platformId),
        discordId ? String(discordId) : null,
        name,
    );
}

function removeReminder(id, platform, platformId, discordId = null) {
    if (discordId) {
        db.prepare(`
            DELETE FROM cross_gathering_reminders
            WHERE gathering_id = ? AND discord_user_id = ?
        `).run(Number(id), String(discordId));
    }

    db.prepare(`
        DELETE FROM cross_gathering_reminders
        WHERE gathering_id = ?
          AND platform = ?
          AND platform_user_id = ?
    `).run(Number(id), platform, String(platformId));
}

function reminders(id) {
    return db.prepare(`
        SELECT *
        FROM cross_gathering_reminders
        WHERE gathering_id = ?
        ORDER BY datetime(created_at) ASC
    `).all(Number(id));
}

function close(id) {
    db.prepare(`
        UPDATE cross_gatherings
        SET status = 'cancelled'
        WHERE id = ?
    `).run(Number(id));
}

function markStarted(id) {
    db.prepare(`
        UPDATE cross_gatherings
        SET
            status = 'started',
            started_at = ?,
            start_notice_sent = 1
        WHERE id = ?
    `).run(Date.now(), Number(id));
}

function render(gathering) {
    const list = members(gathering.id);
    const participantLines = list.length
        ? list.map((member, index) => {
            const source = member.platform === 'telegram' ? 'TG' : 'Discord';
            return `${index + 1}. ${esc(member.display_name)} <i>(${source})</i>`;
        }).join('\n')
        : 'Пока никто не записался';

    const reminderCount = reminders(gathering.id).length;

    const statusText = {
        active: [
            `<b>Свободно мест: ${Math.max(0, gathering.max_players - list.length)}</b>`,
            reminderCount ? `<i>Попросили напомнить: ${reminderCount}</i>` : null,
        ].filter(Boolean).join('\n'),
        cancelled: '<b>Сбор отменён</b>',
        started: '<b>Игра уже началась</b>',
    }[gathering.status] || `<b>${esc(gathering.status)}</b>`;

    return [
        '🎮 <b>СБОР ИГРОКОВ</b>',
        '',
        `<b>Игра:</b> ${esc(gathering.game)}`,
        `<b>Начало:</b> ${esc(formatStart(gathering.starts_at_ts))} МСК`,
        `<b>Нужно игроков:</b> ${gathering.max_players}`,
        gathering.comment
            ? `<b>Комментарий:</b> ${esc(gathering.comment)}`
            : null,
        `<b>Создал:</b> ${esc(gathering.creator_name)}`,
        '',
        `<b>Участники (${list.length}/${gathering.max_players}):</b>`,
        participantLines,
        '',
        statusText,
    ].filter(Boolean).join('\n');
}


function tgKeyboard(gathering) {
    if (gathering.status !== 'active') return { inline_keyboard: [] };

    return {
        inline_keyboard: [
            [
                {
                    text: '✅ Иду',
                    callback_data: `xg_join:${gathering.id}`,
                },
                {
                    text: '❌ Не смогу',
                    callback_data: `xg_decline:${gathering.id}`,
                },
            ],
            [
                {
                    text: '⏰ Напомнить',
                    callback_data: `xg_remind:${gathering.id}`,
                },
            ],
            [
                {
                    text: '🚀 Запустить сейчас',
                    callback_data: `xg_start:${gathering.id}`,
                },
                {
                    text: '🛑 Отменить',
                    callback_data: `xg_cancel:${gathering.id}`,
                },
            ],
        ],
    };
}


function discordRows(gathering) {
    if (gathering.status !== 'active') return [];

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`xg_join:${gathering.id}`)
                .setLabel('Иду')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`xg_decline:${gathering.id}`)
                .setLabel('Не смогу')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`xg_remind:${gathering.id}`)
                .setLabel('Напомнить')
                .setStyle(ButtonStyle.Primary),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`xg_start:${gathering.id}`)
                .setLabel('Запустить сейчас')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`xg_cancel:${gathering.id}`)
                .setLabel('Отменить сбор')
                .setStyle(ButtonStyle.Danger),
        ),
    ];
}

async function publish(gathering) {
    if (runtime.api && gathering.telegram_chat_id) {
        const message = await runtime.api('sendMessage', {
            chat_id: gathering.telegram_chat_id,
            ...(gathering.telegram_thread_id
                ? { message_thread_id: Number(gathering.telegram_thread_id) }
                : {}),
            text: [
                '🔔 <b>НОВЫЙ СБОР — ОТМЕТЬТЕСЬ!</b>',
                '',
                render(gathering),
                '',
                'Нажмите <b>«Иду»</b>, <b>«Не смогу»</b> или <b>«Напомнить»</b>.',
            ].join('\n'),
            parse_mode: 'HTML',
            reply_markup: tgKeyboard(gathering),
        });

        await runtime.api('pinChatMessage', {
            chat_id: gathering.telegram_chat_id,
            message_id: message.message_id,
            disable_notification: false,
        }).catch(error => {
            console.error('Telegram gathering pin:', error.message);
        });

        setTimeout(() => {
            runtime.api('unpinChatMessage', {
                chat_id: gathering.telegram_chat_id,
                message_id: message.message_id,
            }).catch(() => {});
        }, 60_000);

        db.prepare(`
            UPDATE cross_gatherings
            SET telegram_message_id = ?
            WHERE id = ?
        `).run(message.message_id, gathering.id);
    }

    const channelId = getSetting('discord_gatherings_channel_id');

    if (runtime.client && channelId) {
        const channel = await runtime.client.channels.fetch(channelId).catch(() => null);

        if (channel?.isTextBased()) {
            const message = await channel.send({
                content: [
                    '@everyone',
                    '**🔔 НОВЫЙ СБОР — ОТМЕТЬТЕСЬ!**',
                    '',
                    stripHtml(render(gathering)),
                    '',
                    'Нажмите **«Иду»**, **«Не смогу»** или **«Напомнить»**.',
                ].join('\n'),
                components: discordRows(gathering),
                allowedMentions: { parse: ['everyone'] },
            });

            db.prepare(`
                UPDATE cross_gatherings
                SET discord_channel_id = ?, discord_message_id = ?
                WHERE id = ?
            `).run(channelId, message.id, gathering.id);
        }
    }

    await refresh(gathering.id);
    return getGathering(gathering.id);
}

async function refresh(id) {
    const gathering = getGathering(id);
    if (!gathering) return;

    if (
        runtime.api
        && gathering.telegram_chat_id
        && gathering.telegram_message_id
    ) {
        await runtime.api('editMessageText', {
            chat_id: gathering.telegram_chat_id,
            message_id: gathering.telegram_message_id,
            text: render(gathering),
            parse_mode: 'HTML',
            reply_markup: tgKeyboard(gathering),
        }).catch(error => {
            if (!String(error.message).includes('message is not modified')) {
                console.error('Telegram gathering edit:', error.message);
            }
        });
    }

    if (
        runtime.client
        && gathering.discord_channel_id
        && gathering.discord_message_id
    ) {
        const channel = await runtime.client.channels
            .fetch(gathering.discord_channel_id)
            .catch(() => null);

        const message = channel
            ? await channel.messages
                .fetch(gathering.discord_message_id)
                .catch(() => null)
            : null;

        if (message) {
            await message.edit({
                content: [
                    '**🎮 СБОР ИГРОКОВ**',
                    '',
                    stripHtml(render(gathering)),
                ].join('\n'),
                components: discordRows(gathering),
            }).catch(() => {});
        }
    }
}

function telegramMention(member) {
    const id = String(member.platform_user_id);
    return `<a href="tg://user?id=${esc(id)}">${esc(member.display_name)}</a>`;
}

function discordMention(member) {
    if (member.discord_user_id) return `<@${member.discord_user_id}>`;
    if (member.platform === 'discord') return `<@${member.platform_user_id}>`;
    return null;
}

async function sendNotice(gathering, kind) {
    const list = members(gathering.id);
    const reminderList = reminders(gathering.id);
    const recipients = [...list];

    for (const reminder of reminderList) {
        const duplicate = recipients.some(item =>
            (reminder.discord_user_id && item.discord_user_id === reminder.discord_user_id)
            || (
                item.platform === reminder.platform
                && String(item.platform_user_id) === String(reminder.platform_user_id)
            )
        );
        if (!duplicate) recipients.push(reminder);
    }

    if (!recipients.length) return;

    const titles = {
        reminder30: '⏰ До сбора осталось 30 минут',
        reminder10: '⏰ До сбора осталось 10 минут',
        start: '🎮 Сбор начинается — заходим в игру!',
    };

    const title = titles[kind];

    if (runtime.api && gathering.telegram_chat_id) {
        const telegramMembers = recipients.filter(member => member.platform === 'telegram');
        const mentions = telegramMembers.length
            ? telegramMembers.map(telegramMention).join(', ')
            : 'Записавшиеся участники Telegram';

        await runtime.api('sendMessage', {
            chat_id: gathering.telegram_chat_id,
            ...(gathering.telegram_thread_id
                ? { message_thread_id: Number(gathering.telegram_thread_id) }
                : {}),
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            text: [
                `<b>${title}</b>`,
                '',
                `Игра: <b>${esc(gathering.game)}</b>`,
                kind === 'start'
                    ? 'Можно заходить!'
                    : `Начало: <b>${esc(formatStart(gathering.starts_at_ts))} МСК</b>`,
                '',
                mentions,
            ].join('\n'),
        }).catch(error => {
            console.error('Telegram gathering notice:', error.message);
        });
    }

    if (runtime.client && gathering.discord_channel_id) {
        const channel = await runtime.client.channels
            .fetch(gathering.discord_channel_id)
            .catch(() => null);

        if (channel?.isTextBased()) {
            const discordMentions = [...new Set(
                recipients.map(discordMention).filter(Boolean),
            )];

            await channel.send({
                content: [
                    `**${title}**`,
                    '',
                    `Игра: **${gathering.game}**`,
                    kind === 'start'
                        ? 'Можно заходить!'
                        : `Начало: **${formatStart(gathering.starts_at_ts)} МСК**`,
                    '',
                    discordMentions.join(' '),
                ].join('\n'),
                allowedMentions: {
                    users: discordMentions.map(value => value.replace(/\D/g, '')),
                },
            }).catch(error => {
                console.error('Discord gathering notice:', error.message);
            });
        }
    }
}

async function startNow(id) {
    const gathering = getGathering(id);
    if (!gathering || gathering.status !== 'active') return false;

    await sendNotice(gathering, 'start');
    markStarted(id);
    await refresh(id);
    return true;
}

async function checkReminders() {
    const now = Date.now();

    const active = db.prepare(`
        SELECT *
        FROM cross_gatherings
        WHERE status = 'active'
          AND starts_at_ts IS NOT NULL
          AND starts_at_ts <= ?
    `).all(now + 31 * 60 * 1000);

    for (const gathering of active) {
        const diff = Number(gathering.starts_at_ts) - now;

        if (
            diff <= 30 * 60 * 1000
            && diff > 10 * 60 * 1000
            && !Number(gathering.reminder_30_sent)
        ) {
            await sendNotice(gathering, 'reminder30');
            db.prepare(`
                UPDATE cross_gatherings
                SET reminder_30_sent = 1
                WHERE id = ?
            `).run(gathering.id);
        }

        if (
            diff <= 10 * 60 * 1000
            && diff > 0
            && !Number(gathering.reminder_10_sent)
        ) {
            await sendNotice(gathering, 'reminder10');
            db.prepare(`
                UPDATE cross_gatherings
                SET reminder_10_sent = 1
                WHERE id = ?
            `).run(gathering.id);
        }

        if (
            diff <= 0
            && !Number(gathering.start_notice_sent)
        ) {
            await startNow(gathering.id);
        }
    }
}

function startReminderScheduler() {
    if (reminderTimer) return;

    reminderTimer = setInterval(() => {
        checkReminders().catch(error => {
            console.error('Gathering reminder scheduler:', error);
        });
    }, 30_000);

    setTimeout(() => {
        checkReminders().catch(error => {
            console.error('Gathering reminder startup check:', error);
        });
    }, 5_000);

    console.log('✅ Сборы: напоминания за 30/10 минут и при старте включены');
}

function isCreator(gathering, platform, platformId) {
    return (
        gathering.creator_platform === platform
        && String(gathering.creator_platform_id) === String(platformId)
    );
}

async function handleDiscord(interaction) {
    const [action, idText] = interaction.customId.split(':');
    const id = Number(idText);
    const gathering = getGathering(id);

    if (!gathering) {
        return interaction.reply({
            content: 'Сбор не найден.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const name = interaction.member?.displayName
        || interaction.user.globalName
        || interaction.user.username;

    if (action === 'xg_join') {
        if (gathering.status !== 'active') {
            return interaction.reply({
                content: 'Этот сбор уже закрыт.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (members(id).length >= gathering.max_players) {
            return interaction.reply({
                content: 'Мест больше нет.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const added = addMember(
            id,
            'discord',
            interaction.user.id,
            name,
            interaction.user.id,
        );
        removeReminder(
            id,
            'discord',
            interaction.user.id,
            interaction.user.id,
        );

        await interaction.reply({
            content: added ? 'Ты добавлен в сбор.' : 'Ты уже участвуешь.',
            flags: MessageFlags.Ephemeral,
        });
    }


if (action === 'xg_decline') {
    removeMember(
        id,
        'discord',
        interaction.user.id,
        interaction.user.id,
    );
    removeReminder(
        id,
        'discord',
        interaction.user.id,
        interaction.user.id,
    );

    await interaction.reply({
        content: 'Понял, тебя не записываю.',
        flags: MessageFlags.Ephemeral,
    });
}

if (action === 'xg_remind') {
    addReminder(
        id,
        'discord',
        interaction.user.id,
        name,
        interaction.user.id,
    );

    await interaction.reply({
        content: '⏰ Напомню перед началом сбора.',
        flags: MessageFlags.Ephemeral,
    });
}

    if (action === 'xg_leave') {
        if (isCreator(gathering, 'discord', interaction.user.id)) {
            return interaction.reply({
                content: 'Автор может только отменить сбор.',
                flags: MessageFlags.Ephemeral,
            });
        }

        removeMember(
            id,
            'discord',
            interaction.user.id,
            interaction.user.id,
        );

        await interaction.reply({
            content: 'Ты вышел из сбора.',
            flags: MessageFlags.Ephemeral,
        });
    }

    if (action === 'xg_cancel' || action === 'xg_start') {
        const isAdmin = interaction.memberPermissions?.has(
            PermissionFlagsBits.Administrator,
        );

        if (
            !isCreator(gathering, 'discord', interaction.user.id)
            && !isAdmin
        ) {
            return interaction.reply({
                content: 'Доступно только автору или администратору.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (action === 'xg_cancel') {
            close(id);
            await interaction.reply({
                content: 'Сбор отменён.',
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await startNow(id);
            await interaction.reply({
                content: 'Участники уведомлены — сбор запущен.',
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    await refresh(id);
}

async function handleTelegram(api, callback, answerCallback) {
    const data = callback.data || '';
    const match = data.match(/^xg_(join|leave|decline|remind|cancel|start):(\d+)$/);
    if (!match) return false;

    const action = match[1];
    const id = Number(match[2]);
    const gathering = getGathering(id);
    const from = callback.from;
    const message = callback.message;

    if (!gathering) {
        await answerCallback(api, callback.id, 'Сбор не найден.');
        return true;
    }

    const displayName = from.username
        ? `@${from.username}`
        : [from.first_name, from.last_name].filter(Boolean).join(' ')
            || `ID ${from.id}`;

    if (action === 'join') {
        if (gathering.status !== 'active') {
            await answerCallback(api, callback.id, 'Этот сбор закрыт.');
            return true;
        }

        if (members(id).length >= gathering.max_players) {
            await answerCallback(api, callback.id, 'Свободных мест нет.');
            return true;
        }

        const added = addMember(
            id,
            'telegram',
            from.id,
            displayName,
            null,
        );
        removeReminder(
            id,
            'telegram',
            from.id,
            null,
        );

        await answerCallback(
            api,
            callback.id,
            added ? 'Ты добавлен в сбор!' : 'Ты уже участвуешь.',
        );
    }


if (action === 'decline') {
    removeMember(
        id,
        'telegram',
        from.id,
        null,
    );
    removeReminder(
        id,
        'telegram',
        from.id,
        null,
    );

    await answerCallback(api, callback.id, 'Понял, не записываю.');
}

if (action === 'remind') {
    addReminder(
        id,
        'telegram',
        from.id,
        displayName,
        null,
    );

    await answerCallback(api, callback.id, '⏰ Напомню перед началом.');
}

    if (action === 'leave') {
        if (isCreator(gathering, 'telegram', from.id)) {
            await answerCallback(
                api,
                callback.id,
                'Автор может только отменить сбор.',
                true,
            );
            return true;
        }

        removeMember(
            id,
            'telegram',
            from.id,
            null,
        );

        await answerCallback(api, callback.id, 'Ты вышел из сбора.');
    }

    if (action === 'cancel' || action === 'start') {
        const admins = await api('getChatAdministrators', {
            chat_id: message.chat.id,
        }).catch(() => []);

        const isAdmin = admins.some(admin => admin.user.id === from.id);

        if (!isCreator(gathering, 'telegram', from.id) && !isAdmin) {
            await answerCallback(
                api,
                callback.id,
                'Доступно только автору или администратору.',
                true,
            );
            return true;
        }

        if (action === 'cancel') {
            close(id);
            await answerCallback(api, callback.id, 'Сбор отменён.');
        } else {
            await startNow(id);
            await answerCallback(
                api,
                callback.id,
                'Участники уведомлены.',
            );
        }
    }

    await refresh(id);
    return true;
}

module.exports = {
    setRuntime,
    createGathering,
    getGathering,
    members,
    addMember,
    removeMember,
    addReminder,
    removeReminder,
    reminders,
    close,
    publish,
    refresh,
    handleDiscord,
    handleTelegram,
    render,
    tgKeyboard,
    resolveStartTimestamp,
    startNow,
};
