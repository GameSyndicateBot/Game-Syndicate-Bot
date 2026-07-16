const {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const {
    getAllCards,
    getUserCards,
    getUserCardStats,
    syncCardsCatalog,
} = require('../utils/cardSystem');

const { checkDeveloper } = require('../utils/devOnly');
const { createCardsAlbumCard } = require('../images/cards/createCardsAlbumCard');
const { createCardImage } = require('../images/cards/createCardImage');

const PAGE_SIZE = 9;

function clampPage(page, totalPages) {
    return Math.max(1, Math.min(page, totalPages));
}

function isRarityFilter(filter) {
    return [
        'common',
        'rare',
        'epic',
        'legendary',
        'mythic',
        'exclusive',
        'holographic',
    ].includes(filter);
}

function getFilteredCards(filter) {
    const allCards = getAllCards();

    if (isRarityFilter(filter)) {
        return allCards.filter(card =>
            (card.drop_rarities ?? [card.base_rarity]).includes(filter)
        );
    }

    return allCards;
}

function getBestOwnedCard(userCards, cardId, filter = 'all') {
    const rarityPower = {
        common: 1,
        rare: 2,
        epic: 3,
        legendary: 4,
        mythic: 5,
        exclusive: 6,
        holographic: 7,
        treasure: 8,
    };

    const editionPower = {
        standard: 1,
        foil: 2,
        galaxy: 3,
        crystal: 4,
        signature: 5,
        glitch: 6,
        gold: 7,
    };

    const owned = userCards.filter(card => {
        const sameCard = Number(card.card_id) === Number(cardId);
        const sameRarity = !isRarityFilter(filter) || card.rarity === filter;
        return sameCard && sameRarity;
    });

    if (!owned.length) return null;

    return owned.sort((a, b) => {
        const scoreA =
            (rarityPower[a.rarity] ?? 0) * 100 +
            (editionPower[a.edition] ?? 0);

        const scoreB =
            (rarityPower[b.rarity] ?? 0) * 100 +
            (editionPower[b.edition] ?? 0);

        return scoreB - scoreA;
    })[0];
}

function getOwnedCount(userCards, cardId, filter = 'all') {
    return userCards.filter(card => {
        const sameCard = Number(card.card_id) === Number(cardId);
        const sameRarity = !isRarityFilter(filter) || card.rarity === filter;
        return sameCard && sameRarity;
    }).length;
}

function buildButtonRows(userId, filter, page, totalPages) {
    const firstFiltersRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cards_filter_${userId}_all_1`)
            .setLabel('Все')
            .setStyle(filter === 'all' ? ButtonStyle.Primary : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`cards_filter_${userId}_common_1`)
            .setLabel('Common')
            .setStyle(filter === 'common' ? ButtonStyle.Primary : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`cards_filter_${userId}_rare_1`)
            .setLabel('Rare')
            .setStyle(filter === 'rare' ? ButtonStyle.Primary : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`cards_filter_${userId}_epic_1`)
            .setLabel('Epic')
            .setStyle(filter === 'epic' ? ButtonStyle.Primary : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`cards_filter_${userId}_legendary_1`)
            .setLabel('Legendary')
            .setStyle(filter === 'legendary' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    const secondFiltersRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cards_filter_${userId}_mythic_1`)
            .setLabel('Mithic')
            .setStyle(filter === 'mythic' ? ButtonStyle.Primary : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`cards_filter_${userId}_exclusive_1`)
            .setLabel('Exclusive')
            .setStyle(filter === 'exclusive' ? ButtonStyle.Primary : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`cards_filter_${userId}_holographic_1`)
            .setLabel('Holographic')
            .setStyle(filter === 'holographic' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    const pagesRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cards_page_${userId}_${filter}_${page - 1}`)
            .setLabel('Назад')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),

        new ButtonBuilder()
            .setCustomId(`cards_page_${userId}_${filter}_${page + 1}`)
            .setLabel('Вперёд')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page >= totalPages)
    );

    return [firstFiltersRow, secondFiltersRow, pagesRow];
}

function buildSelectRow(userId, filter, page, visibleCards) {
    const options = visibleCards.map(card => ({
        label: `${card.code} • ${card.name}`.slice(0, 100),
        value: String(card.id),
        description: isRarityFilter(filter)
            ? `Редкость: ${filter.toUpperCase()}`
            : (card.type === 'role' ? 'Роль Game Syndicate' : 'Участник Game Syndicate'),
        emoji: isRarityFilter(filter) ? '💎' : (card.type === 'role' ? '🎖️' : '🎴'),
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`cards_open_${userId}_${filter}_${page}`)
            .setPlaceholder('Выбери карточку для просмотра')
            .addOptions(options)
    );
}

async function buildCardsReply(user, filter = 'all', page = 1) {
    syncCardsCatalog();

    const allCards = getAllCards();
    const filteredCards = getFilteredCards(filter);
    const userCards = getUserCards(user.id);
    const stats = getUserCardStats(user.id);

    const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
    const safePage = clampPage(page, totalPages);

    const start = (safePage - 1) * PAGE_SIZE;
    const visibleCards = filteredCards.slice(start, start + PAGE_SIZE);

    const cardImage = await createCardsAlbumCard(
        user,
        allCards,
        userCards,
        {
            filter,
            page: safePage,
            pageSize: PAGE_SIZE,
        }
    );

    const attachment = new AttachmentBuilder(cardImage, {
        name: 'cards-album.png',
    });

    return {
        content:
`# 🎴 Альбом карточек

**Собрано:** ${stats.unique} / ${stats.available}
**Всего карточек:** ${stats.total}
**Страница:** ${safePage} / ${totalPages}

Выбери карточку в меню ниже, чтобы открыть её крупно.`,
        files: [attachment],
        components: [
            buildSelectRow(user.id, filter, safePage, visibleCards),
            ...buildButtonRows(user.id, filter, safePage, totalPages),
            buildGsHubRow(user.id),
        ],
    };
}

async function buildSingleCardReply(user, cardId, filter, page) {
    syncCardsCatalog();

    const allCards = getAllCards();
    const card = allCards.find(item => Number(item.id) === Number(cardId));

    if (!card) {
        return {
            content: '❌ Карточка не найдена.',
            files: [],
            components: [buildBackRow(user.id, filter, page), buildGsHubRow(user.id)],
        };
    }

    const userCards = getUserCards(user.id);
    const owned = getBestOwnedCard(userCards, card.id, filter);
    const ownedCount = getOwnedCount(userCards, card.id, filter);

    const image = await createCardImage(card, owned, {
        locked: !owned,
    });

    const attachment = new AttachmentBuilder(image, {
        name: `card-${card.code}.png`,
    });

    return {
        content: owned
            ? `# 🎴 ${card.code} • ${card.name}\nУ тебя есть **${ownedCount}** экземпляр(ов) этой карточки. Показан лучший вариант.`
            : `# 🔒 ${card.code} • ${card.name}\nЭта карточка пока не открыта.`,
        files: [attachment],
        components: [buildBackRow(user.id, filter, page), buildGsHubRow(user.id)],
    };
}

function buildBackRow(userId, filter, page) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cards_back_${userId}_${filter}_${page}`)
            .setLabel('Назад к альбому')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildGsHubRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cards_refresh_${userId}`)
            .setLabel('Обновить альбом')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`gs_home_${userId}`)
            .setLabel('Назад в GS Hub')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Primary)
    );
}

module.exports = {
    buildCardsReply,
    buildSingleCardReply,

data: new SlashCommandBuilder()
        .setName('cards')
        .setDescription('Посмотреть свою коллекцию карточек'),

    async execute(interaction) {
        if (!(await checkDeveloper(interaction))) {
            return;
        }

        await interaction.deferReply();

        const reply = await buildCardsReply(interaction.user, 'all', 1);

        return interaction.editReply(reply);
    },

    async handleComponent(interaction) {
        const parts = interaction.customId.split('_');

        if (parts[0] !== 'cards') return false;

        const action = parts[1];
        const ownerId = parts[2];

        if (interaction.user.id !== ownerId) {
            await interaction.reply({
                content: 'Эта коллекция открыта не для тебя.',
                ephemeral: true,
            });

            return true;
        }

        if (action === 'filter') {
            const filter = parts[3];
            const page = Number(parts[4] ?? 1);

            const reply = await buildCardsReply(interaction.user, filter, page);

            await interaction.update(reply);
            return true;
        }

        if (action === 'page') {
            const filter = parts[3];
            const page = Number(parts[4] ?? 1);

            const reply = await buildCardsReply(interaction.user, filter, page);

            await interaction.update(reply);
            return true;
        }

        if (action === 'open') {
            const filter = parts[3];
            const page = Number(parts[4] ?? 1);
            const cardId = interaction.values[0];

            const reply = await buildSingleCardReply(interaction.user, cardId, filter, page);

            await interaction.update(reply);
            return true;
        }

        if (action === 'refresh') {
            const reply = await buildCardsReply(interaction.user, 'all', 1);

            await interaction.update(reply);
            return true;
        }

        if (action === 'back') {
            const filter = parts[3];
            const page = Number(parts[4] ?? 1);

            const reply = await buildCardsReply(interaction.user, filter, page);

            await interaction.update(reply);
            return true;
        }

        return false;
    },
};
