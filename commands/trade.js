const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    AttachmentBuilder,
} = require('discord.js');

const { normalizeServerNickname } = require('../utils/displayName');
const { db } = require('../database/db');
const { getUserCards, getUserCardByInventoryId } = require('../utils/cardSystem');
const { createTradePanel } = require('../images/trade/createTradePanel');
const { createTradeHistoryCard } = require('../images/history/createTradeHistoryCard');

const TRADE_TTL_MINUTES = 10;

// Persistent trade storage. The selected inventory ids are the actual physical copies;
// copy_number therefore survives the exchange unchanged.
db.exec(`
    CREATE TABLE IF NOT EXISTS card_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT,
        message_id TEXT,
        initiator_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        initiator_card_id INTEGER NOT NULL,
        target_card_id INTEGER,
        initiator_confirmed INTEGER DEFAULT 0,
        target_confirmed INTEGER DEFAULT 0,
        status TEXT DEFAULT 'selecting',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL,
        completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_card_trades_status ON card_trades(status);
    CREATE INDEX IF NOT EXISTS idx_card_trades_users ON card_trades(initiator_id, target_id);
`);

function expiresAtSql() {
    return new Date(Date.now() + TRADE_TTL_MINUTES * 60_000).toISOString();
}

function rarityLabel(rarity) {
    const map = {
        common: '⚪ Common', rare: '🔵 Rare', epic: '🟣 Epic',
        legendary: '🟡 Legendary', mythic: '🔴 Mythic',
        exclusive: '💠 Exclusive', holographic: '🌈 Holographic', treasure: '💎 Treasure',
    };
    return map[rarity] ?? rarity;
}

function cardLine(owned) {
    if (!owned) return 'Не выбрана';
    return `**${owned.code} • ${owned.name}**\n${rarityLabel(owned.rarity)} • экземпляр **#${String(owned.copy_number).padStart(6, '0')}**`;
}

function isExpired(trade) {
    return !trade || Date.parse(trade.expires_at) <= Date.now();
}

function getTrade(id) {
    return db.prepare('SELECT * FROM card_trades WHERE id = ?').get(id);
}

function getInventory(inventoryId) {
    const row = db.prepare('SELECT * FROM player_cards WHERE id = ?').get(inventoryId);
    if (!row) return null;
    return getUserCardByInventoryId(row.user_id, inventoryId);
}

function isCardLocked(inventoryId, ignoredTradeId = null) {
    const trade = db.prepare(`
        SELECT id FROM card_trades
        WHERE status IN ('selecting','pending')
          AND id != COALESCE(?, -1)
          AND (initiator_card_id = ? OR target_card_id = ?)
          AND expires_at > ?
        LIMIT 1
    `).get(ignoredTradeId, inventoryId, inventoryId, new Date().toISOString());

    const auction = db.prepare(`
        SELECT id FROM card_auction_listings
        WHERE status = 'active' AND inventory_id = ?
        LIMIT 1
    `).get(inventoryId);

    return Boolean(trade || auction);
}

function tradeableCards(userId, ignoredTradeId = null) {
    return getUserCards(userId)
        .filter(card => card.rarity !== 'treasure')
        .filter(card => !isCardLocked(card.id, ignoredTradeId))
        .slice(0, 25);
}

function cardOptions(cards) {
    return cards.map(card => ({
        label: `${card.code} • ${card.name}`.slice(0, 100),
        value: String(card.id),
        description: `${rarityLabel(card.rarity).replace(/^\S+\s/, '')} • #${String(card.copy_number).padStart(6, '0')}`.slice(0, 100),
        emoji: card.rarity === 'holographic' ? '🌈' : card.rarity === 'exclusive' ? '💠' : '🎴',
    }));
}

async function resolveTradeMemberName(client, guildId, userId) {
    try {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        return normalizeServerNickname(member.displayName || member.user.globalName || member.user.username || userId);
    } catch (_) {
        try {
            const user = await client.users.fetch(userId);
            return normalizeServerNickname(user.globalName || user.username || userId);
        } catch (_) {
            return userId;
        }
    }
}

async function renderTrade(trade, client) {
    const left = getInventory(trade.initiator_card_id);
    const right = trade.target_card_id ? getInventory(trade.target_card_id) : null;

    const statusText = trade.status === 'completed' ? 'Обмен завершён'
        : trade.status === 'cancelled' ? 'Обмен отменён'
        : trade.status === 'expired' ? 'Предложение истекло'
        : !trade.target_card_id ? 'Ожидается выбор карточки второй стороны'
        : 'Ожидаются подтверждения обеих сторон';

    const statusColor = trade.status === 'completed' ? '#22C55E'
        : ['cancelled', 'expired'].includes(trade.status) ? '#EF4444'
        : '#C084FC';

    const [initiatorName, targetName] = await Promise.all([
        resolveTradeMemberName(client, trade.guild_id, trade.initiator_id),
        resolveTradeMemberName(client, trade.guild_id, trade.target_id),
    ]);

    const panel = await createTradePanel({
        id: trade.id,
        left,
        right,
        leftTitle: initiatorName,
        rightTitle: targetName,
        leftConfirmed: trade.initiator_confirmed,
        rightConfirmed: trade.target_confirmed,
        statusText,
        statusColor,
        ttlMinutes: TRADE_TTL_MINUTES,
    });

    const components = [];
    if (trade.status === 'selecting') {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_changeinit_${trade.id}`).setLabel('Изменить карту автора').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`trade_pick_${trade.id}`).setLabel('Выбрать карту второй стороны').setEmoji('🎴').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`trade_decline_${trade.id}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger),
        ));
    } else if (trade.status === 'pending') {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_changeinit_${trade.id}`).setLabel('Изменить карту автора').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`trade_changetarget_${trade.id}`).setLabel('Изменить карту участника').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
        ));
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_confirm_${trade.id}`).setLabel('Подтвердить').setEmoji('✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`trade_cancel_${trade.id}`).setLabel('Отменить').setStyle(ButtonStyle.Danger),
        ));
    }

    return {
        content: `# 🔄 Обмен карточками • Сделка #${trade.id}
<@${trade.initiator_id}> ⇄ <@${trade.target_id}>`,
        embeds: [],
        files: [new AttachmentBuilder(panel, { name: `trade-${trade.id}.png` })],
        components,
    };
}

async function refreshPublicMessage(client, tradeId) {
    const trade = getTrade(tradeId);
    if (!trade?.channel_id || !trade?.message_id) return;
    const channel = await client.channels.fetch(trade.channel_id).catch(() => null);
    const message = channel ? await channel.messages.fetch(trade.message_id).catch(() => null) : null;
    if (message) await message.edit(await renderTrade(trade, client)).catch(() => null);
}

function validateTrade(trade) {
    if (!trade) throw new Error('Сделка не найдена.');
    if (!['selecting', 'pending'].includes(trade.status)) throw new Error('Эта сделка уже закрыта.');
    if (isExpired(trade)) {
        db.prepare("UPDATE card_trades SET status='expired' WHERE id=?").run(trade.id);
        throw new Error('Время сделки истекло.');
    }
    return trade;
}

function completeTrade(tradeId) {
    const transaction = db.transaction(() => {
        const trade = validateTrade(getTrade(tradeId));
        if (!trade.initiator_confirmed || !trade.target_confirmed || !trade.target_card_id) {
            throw new Error('Обе стороны ещё не подтвердили обмен.');
        }

        const left = db.prepare('SELECT * FROM player_cards WHERE id=? AND user_id=?').get(trade.initiator_card_id, trade.initiator_id);
        const right = db.prepare('SELECT * FROM player_cards WHERE id=? AND user_id=?').get(trade.target_card_id, trade.target_id);
        if (!left || !right) throw new Error('Одна из карточек больше не принадлежит участнику.');
        if (left.rarity === 'treasure' || right.rarity === 'treasure') throw new Error('TREASURE нельзя обменивать.');

        db.prepare('UPDATE player_cards SET user_id=? WHERE id=? AND user_id=?').run(trade.target_id, left.id, trade.initiator_id);
        db.prepare('UPDATE player_cards SET user_id=? WHERE id=? AND user_id=?').run(trade.initiator_id, right.id, trade.target_id);
        db.prepare("UPDATE card_trades SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?").run(trade.id);
        return getTrade(trade.id);
    });
    return transaction();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trade')
        .setDescription('Безопасный обмен карточками')
        .addSubcommand(sub => sub.setName('start').setDescription('Предложить обмен')
            .addUserOption(o => o.setName('участник').setDescription('С кем обменяться').setRequired(true)))
        .addSubcommand(sub => sub.setName('list').setDescription('Мои активные сделки'))
        .addSubcommand(sub => sub.setName('history').setDescription('История моих обменов'))
        .addSubcommand(sub => sub.setName('cancel').setDescription('Отменить сделку')
            .addIntegerOption(o => o.setName('номер').setDescription('Номер сделки').setRequired(true).setMinValue(1))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'start') {
            const target = interaction.options.getUser('участник', true);
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Нельзя обмениваться с собой.', ephemeral: true });
            if (target.bot) return interaction.reply({ content: '❌ С ботами обмениваться нельзя.', ephemeral: true });

            const cards = tradeableCards(interaction.user.id);
            if (!cards.length) return interaction.reply({ content: '❌ У тебя нет доступных для обмена карточек.', ephemeral: true });

            const menu = new StringSelectMenuBuilder()
                .setCustomId(`trade_startpick_${target.id}`)
                .setPlaceholder('Выбери карточку, которую отдаёшь')
                .addOptions(cardOptions(cards));
            return interaction.reply({
                content: `Выбери карточку для предложения участнику ${target}. Показываются последние 25 доступных экземпляров.`,
                components: [new ActionRowBuilder().addComponents(menu)],
                ephemeral: true,
            });
        }

        if (sub === 'list') {
            const rows = db.prepare(`
                SELECT * FROM card_trades
                WHERE (initiator_id=? OR target_id=?) AND status IN ('selecting','pending') AND expires_at>?
                ORDER BY id DESC LIMIT 20
            `).all(interaction.user.id, interaction.user.id, new Date().toISOString());
            if (!rows.length) return interaction.reply({ content: 'У тебя нет активных сделок.', ephemeral: true });
            return interaction.reply({
                content: rows.map(t => `**#${t.id}** • <@${t.initiator_id}> ⇄ <@${t.target_id}> • ${t.status === 'selecting' ? 'выбор карточки' : 'подтверждение'}`).join('\n'),
                ephemeral: true,
            });
        }

        if (sub === 'history') {
            db.prepare(`
                UPDATE card_trades
                SET status='expired'
                WHERE status IN ('selecting','pending') AND expires_at<=?
            `).run(new Date().toISOString());

            const rows = db.prepare(`
                SELECT * FROM card_trades
                WHERE (initiator_id=? OR target_id=?)
                  AND status IN ('completed','cancelled','expired')
                ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
                LIMIT 15
            `).all(interaction.user.id, interaction.user.id);

            const names = new Map();
            for (const id of new Set(rows.flatMap(row => [row.initiator_id, row.target_id]))) {
                names.set(id, await resolveTradeMemberName(interaction.client, interaction.guildId, id));
            }

            const dateFormat = new Intl.DateTimeFormat('ru-RU', {
                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
            });
            const entries = rows.map(trade => ({
                id: trade.id,
                status: trade.status,
                left: getInventory(trade.initiator_card_id),
                right: trade.target_card_id ? getInventory(trade.target_card_id) : null,
                leftName: names.get(trade.initiator_id),
                rightName: names.get(trade.target_id),
                dateLabel: dateFormat.format(new Date(trade.completed_at || trade.created_at)),
            }));

            const image = await createTradeHistoryCard({
                ownerName: normalizeServerNickname(interaction.member?.displayName || interaction.user.globalName || interaction.user.username),
                entries,
            });
            return interaction.reply({
                files: [new AttachmentBuilder(image, { name: 'trade-history.png' })],
                ephemeral: true,
            });
        }

        if (sub === 'cancel') {
            const id = interaction.options.getInteger('номер', true);
            const trade = getTrade(id);
            if (!trade || ![trade.initiator_id, trade.target_id].includes(interaction.user.id)) {
                return interaction.reply({ content: '❌ Сделка не найдена.', ephemeral: true });
            }
            if (!['selecting', 'pending'].includes(trade.status)) return interaction.reply({ content: '❌ Сделка уже закрыта.', ephemeral: true });
            db.prepare("UPDATE card_trades SET status='cancelled' WHERE id=?").run(id);
            await refreshPublicMessage(interaction.client, id);
            return interaction.reply({ content: `✅ Сделка #${id} отменена.`, ephemeral: true });
        }
    },

    async handleComponent(interaction) {
        if (!interaction.customId.startsWith('trade_')) return false;
        const [, action, raw] = interaction.customId.split('_');

        if (action === 'startpick') {
            const targetId = raw;
            const inventoryId = Number(interaction.values[0]);
            const owned = getUserCardByInventoryId(interaction.user.id, inventoryId);
            if (!owned || owned.rarity === 'treasure' || isCardLocked(inventoryId)) {
                return interaction.update({ content: '❌ Эта карточка больше недоступна для обмена.', components: [] });
            }
            const result = db.prepare(`
                INSERT INTO card_trades(guild_id,initiator_id,target_id,initiator_card_id,status,expires_at)
                VALUES(?,?,?,?, 'selecting', ?)
            `).run(interaction.guildId, interaction.user.id, targetId, inventoryId, expiresAtSql());
            const tradeId = Number(result.lastInsertRowid);
            const publicMessage = await interaction.channel.send(await renderTrade(getTrade(tradeId), interaction.client));
            db.prepare('UPDATE card_trades SET channel_id=?,message_id=? WHERE id=?').run(publicMessage.channelId, publicMessage.id, tradeId);
            await interaction.update({ content: `✅ Предложение обмена #${tradeId} отправлено <@${targetId}>.`, components: [] });
            return true;
        }

        const tradeId = Number(raw);
        let trade;
        try { trade = validateTrade(getTrade(tradeId)); }
        catch (error) {
            await refreshPublicMessage(interaction.client, tradeId);
            return interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }

        if (action === 'changeinit') {
            if (interaction.user.id !== trade.initiator_id) {
                return interaction.reply({ content: '❌ Изменить эту карточку может только автор сделки.', ephemeral: true });
            }
            const cards = tradeableCards(interaction.user.id, trade.id);
            if (!cards.length) return interaction.reply({ content: '❌ У тебя нет доступных карточек для обмена.', ephemeral: true });
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`trade_initpick_${trade.id}`)
                .setPlaceholder('Выбери новую карточку автора')
                .addOptions(cardOptions(cards));
            await interaction.reply({
                content: `Выбери новую карточку для сделки #${trade.id}. После замены оба подтверждения будут сброшены.`,
                components: [new ActionRowBuilder().addComponents(menu)],
                ephemeral: true,
            });
            return true;
        }

        if (action === 'changetarget') {
            if (interaction.user.id !== trade.target_id) {
                return interaction.reply({ content: '❌ Изменить эту карточку может только второй участник.', ephemeral: true });
            }
            const cards = tradeableCards(interaction.user.id, trade.id);
            if (!cards.length) return interaction.reply({ content: '❌ У тебя нет доступных карточек для обмена.', ephemeral: true });
            const menu = new StringSelectMenuBuilder()
                .setCustomId(`trade_targetpick_${trade.id}`)
                .setPlaceholder('Выбери новую карточку участника')
                .addOptions(cardOptions(cards));
            await interaction.reply({
                content: `Выбери новую карточку для сделки #${trade.id}. После замены оба подтверждения будут сброшены.`,
                components: [new ActionRowBuilder().addComponents(menu)],
                ephemeral: true,
            });
            return true;
        }

        if (action === 'initpick') {
            if (interaction.user.id !== trade.initiator_id) return interaction.reply({ content: '❌ Это не твоя сторона сделки.', ephemeral: true });
            const inventoryId = Number(interaction.values[0]);
            const owned = getUserCardByInventoryId(interaction.user.id, inventoryId);
            if (!owned || owned.rarity === 'treasure' || isCardLocked(inventoryId, trade.id)) {
                return interaction.update({ content: '❌ Эта карточка больше недоступна.', components: [] });
            }
            db.prepare(`UPDATE card_trades
                SET initiator_card_id=?, initiator_confirmed=0, target_confirmed=0
                WHERE id=?`)
                .run(inventoryId, trade.id);
            await interaction.update({ content: `✅ Твоя карточка в сделке #${trade.id} изменена. Подтверждения сброшены.`, components: [] });
            await refreshPublicMessage(interaction.client, trade.id);
            return true;
        }

        if (action === 'pick') {
            if (interaction.user.id !== trade.target_id) return interaction.reply({ content: 'Эту карточку должен выбрать второй участник сделки.', ephemeral: true });
            const cards = tradeableCards(interaction.user.id, trade.id);
            if (!cards.length) return interaction.reply({ content: '❌ У тебя нет доступных карточек для обмена.', ephemeral: true });
            const menu = new StringSelectMenuBuilder().setCustomId(`trade_targetpick_${trade.id}`).setPlaceholder('Что ты отдаёшь?').addOptions(cardOptions(cards));
            await interaction.reply({ content: `Выбери карточку для сделки #${trade.id}.`, components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
            return true;
        }

        if (action === 'targetpick') {
            if (interaction.user.id !== trade.target_id) return interaction.reply({ content: '❌ Это не твоя сделка.', ephemeral: true });
            const inventoryId = Number(interaction.values[0]);
            const owned = getUserCardByInventoryId(interaction.user.id, inventoryId);
            if (!owned || owned.rarity === 'treasure' || isCardLocked(inventoryId, trade.id)) {
                return interaction.update({ content: '❌ Эта карточка больше недоступна.', components: [] });
            }
            db.prepare(`UPDATE card_trades SET target_card_id=?,status='pending',initiator_confirmed=0,target_confirmed=0 WHERE id=?`)
                .run(inventoryId, trade.id);
            await interaction.update({ content: `✅ Карточка добавлена в сделку #${trade.id}. Теперь оба участника должны подтвердить обмен.`, components: [] });
            await refreshPublicMessage(interaction.client, trade.id);
            return true;
        }

        if (action === 'confirm') {
            if (![trade.initiator_id, trade.target_id].includes(interaction.user.id)) return interaction.reply({ content: '❌ Ты не участвуешь в этой сделке.', ephemeral: true });
            if (trade.status !== 'pending' || !trade.target_card_id) return interaction.reply({ content: '❌ Вторая карточка ещё не выбрана.', ephemeral: true });
            const field = interaction.user.id === trade.initiator_id ? 'initiator_confirmed' : 'target_confirmed';
            db.prepare(`UPDATE card_trades SET ${field}=1 WHERE id=?`).run(trade.id);
            trade = getTrade(trade.id);
            if (trade.initiator_confirmed && trade.target_confirmed) {
                try { completeTrade(trade.id); }
                catch (error) { return interaction.reply({ content: `❌ Обмен не выполнен: ${error.message}`, ephemeral: true }); }
            }
            await interaction.deferUpdate();
            await refreshPublicMessage(interaction.client, trade.id);
            return true;
        }

        if (action === 'decline' || action === 'cancel') {
            if (![trade.initiator_id, trade.target_id].includes(interaction.user.id)) return interaction.reply({ content: '❌ Ты не участвуешь в этой сделке.', ephemeral: true });
            db.prepare("UPDATE card_trades SET status='cancelled' WHERE id=?").run(trade.id);
            await interaction.deferUpdate();
            await refreshPublicMessage(interaction.client, trade.id);
            return true;
        }

        return false;
    },
};
