const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    AttachmentBuilder,
} = require('discord.js');

const {
    getDuplicateGroups,
    getDismantleDustForRarity,
    dismantleCard,
    syncCardsCatalog,
} = require('../utils/cardSystem');

const {
    getCardDust,
} = require('../database/db');

const { checkDeveloper } = require('../utils/devOnly');
const { createDustPanel } = require('../images/dust/createDustPanel');
const { createDustInfoPanel } = require('../images/dust/createDustInfoPanel');
const { createDismantlePanel } = require('../images/dust/createDismantlePanel');
const { createCardImage } = require('../images/cards/createCardImage');

const PAGE_SIZE = 10;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRarityName(rarity) {
    return {
        common: 'Common',
        rare: 'Rare',
        epic: 'Epic',
        legendary: 'Legendary',
        mythic: 'Mythic',
    }[rarity] ?? rarity;
}

function getEditionName(edition) {
    return {
        standard: 'Standard',
        foil: 'Foil',
        galaxy: 'Galaxy',
        crystal: 'Crystal',
        signature: 'Signature',
        glitch: 'Glitch',
        gold: 'Gold',
    }[edition] ?? edition;
}

function getRarityEmoji(rarity) {
    return {
        common: '⚪',
        rare: '🔵',
        epic: '🟣',
        legendary: '🟠',
        mythic: '🔴',
    }[rarity] ?? '🎴';
}

function getEditionEmoji(edition) {
    return {
        standard: '⬜',
        foil: '✨',
        galaxy: '🌌',
        crystal: '💎',
        signature: '✍️',
        glitch: '⚡',
        gold: '👑',
    }[edition] ?? '⬜';
}

function formatCopyNumber(number) {
    return `#${String(number).padStart(6, '0')}`;
}

function getDuplicateCardsForDismantle(userId) {
    const groups = getDuplicateGroups(userId);
    const items = [];

    for (const group of groups) {
        const sorted = [...group.ownedCards].sort((a, b) => {
            const rarityPower = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, exclusive: 6, holographic: 7, treasure: 8 };
            const editionPower = { standard: 1, foil: 2, galaxy: 3, crystal: 4, signature: 5, glitch: 6, gold: 7 };

            const scoreA = (rarityPower[a.rarity] ?? 0) * 100 + (editionPower[a.edition] ?? 0);
            const scoreB = (rarityPower[b.rarity] ?? 0) * 100 + (editionPower[b.edition] ?? 0);

            return scoreB - scoreA;
        });

        for (const owned of sorted.slice(1)) {
            items.push({
                ...owned,
                card: group.card,
                dust: getDismantleDustForRarity(owned.rarity),
            });
        }
    }

    return items.sort((a, b) => b.dust - a.dust);
}

function getPageData(userId, page = 1) {
    const duplicates = getDuplicateCardsForDismantle(userId);
    const totalPages = Math.max(1, Math.ceil(duplicates.length / PAGE_SIZE));
    const safePage = Math.max(1, Math.min(page, totalPages));

    const start = (safePage - 1) * PAGE_SIZE;
    const visible = duplicates.slice(start, start + PAGE_SIZE);
    const totalDust = duplicates.reduce((sum, item) => sum + item.dust, 0);

    return { duplicates, visible, totalPages, safePage, totalDust };
}

function findDuplicateItem(userId, inventoryId) {
    return getDuplicateCardsForDismantle(userId)
        .find(item => Number(item.id) === Number(inventoryId)) ?? null;
}

function buildSelectRow(userId, page) {
    const { visible } = getPageData(userId, page);
    if (!visible.length) return null;

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`dust_select_${userId}_${page}`)
            .setPlaceholder('Выбери карточку для распыления')
            .addOptions(
                visible.map(item => ({
                    label: `${item.card.code} • ${item.card.name}`.slice(0, 100),
                    description: `${getRarityName(item.rarity)} • ${getEditionName(item.edition)} • +${item.dust} Dust`.slice(0, 100),
                    value: String(item.id),
                    emoji: '♻️',
                }))
            )
    );
}

function buildListButtons(userId, page) {
    const { totalPages } = getPageData(userId, page);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dust_page_${userId}_${page - 1}`)
            .setLabel('Назад')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),

        new ButtonBuilder()
            .setCustomId(`dust_refresh_${userId}_${page}`)
            .setLabel('Обновить')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`dust_info_${userId}_${page}`)
            .setLabel('Как получить Dust')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`dust_page_${userId}_${page + 1}`)
            .setLabel('Вперёд')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
    );
}

function buildConfirmButtons(userId, inventoryId, page) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dust_confirm_${userId}_${inventoryId}_${page}`)
            .setLabel('Распылить')
            .setEmoji('♻️')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`dust_cancel_${userId}_${page}`)
            .setLabel('Назад к списку')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildResultButtons(userId, page) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dust_cancel_${userId}_${page}`)
            .setLabel('Назад к Dust')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Primary)
    );
}

async function buildDustReply(user, page = 1) {
    const { duplicates, visible, totalPages, safePage, totalDust } = getPageData(user.id, page);
    const balance = getCardDust(user.id);

    const panel = await createDustPanel(user, {
        balance,
        duplicates: visible,
        totalDuplicates: duplicates.length,
        page: safePage,
        totalPages,
        totalDust,
    });

    const rows = [];
    const selectRow = buildSelectRow(user.id, safePage);
    if (selectRow) rows.push(selectRow);
    rows.push(buildListButtons(user.id, safePage));

    return {
        content: `# ✨ GS Dust`,
        files: [new AttachmentBuilder(panel, { name: 'gs-dust.png' })],
        components: rows,
    };
}


async function buildDustInfoReply(user, page = 1) {
    const panel = await createDustInfoPanel(user);

    return {
        content: '# GS Dust — способы получения',
        files: [new AttachmentBuilder(panel, { name: 'gs-dust-guide.png' })],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`dust_cancel_${user.id}_${page}`)
                    .setLabel('Назад к Dust')
                    .setStyle(ButtonStyle.Primary)
            ),
        ],
    };
}

async function buildConfirmReply(user, inventoryId, page) {
    const item = findDuplicateItem(user.id, inventoryId);

    if (!item) {
        const reply = await buildDustReply(user, page);
        return { ...reply, content: '❌ Эта карточка уже недоступна для распыления.' };
    }

    const cardImage = await createCardImage(item.card, item, { locked: false });

    return {
        content:
`# ♻️ Подтверждение распыления

${getRarityEmoji(item.rarity)} **${getRarityName(item.rarity)}** • ${getEditionEmoji(item.edition)} **${getEditionName(item.edition)}** • ${formatCopyNumber(item.copy_number)}

Получишь: ✨ **${item.dust} GS Dust**`,
        files: [new AttachmentBuilder(cardImage, { name: `dust-preview-${item.card.code}.png` })],
        components: [buildConfirmButtons(user.id, inventoryId, page)],
    };
}

async function editDismantlePanel(interaction, content, panel, fileName) {
    return interaction.editReply({
        content,
        files: [new AttachmentBuilder(panel, { name: fileName })],
        components: [],
    });
}

async function playDismantleAnimation(interaction, user, inventoryId, page) {
    const item = findDuplicateItem(user.id, inventoryId);

    if (!item) {
        const reply = await buildDustReply(user, page);
        return interaction.editReply({ ...reply, content: '❌ Эта карточка уже недоступна для распыления.' });
    }

    const charge = await createDismantlePanel(user, item, 'charge');
    await editDismantlePanel(interaction, '# ♻️ Распыление карточки', charge, 'dust-charge.png');
    await sleep(900);

    const crack = await createDismantlePanel(user, item, 'crack');
    await editDismantlePanel(interaction, '# ♻️ Распыление карточки', crack, 'dust-crack.png');
    await sleep(900);

    const burst = await createDismantlePanel(user, item, 'burst');
    await editDismantlePanel(interaction, '# ♻️ Распыление карточки', burst, 'dust-burst.png');
    await sleep(950);

    const result = dismantleCard(user.id, inventoryId);

    if (!result.ok) {
        const reply = await buildDustReply(user, page);
        return interaction.editReply({ ...reply, content: `❌ ${result.message ?? 'Не удалось распылить карточку.'}` });
    }

    const resultPanel = await createDismantlePanel(user, item, 'result', result);

    return interaction.editReply({
        content: '# ✨ Распыление завершено',
        files: [new AttachmentBuilder(resultPanel, { name: 'dust-result.png' })],
        components: [buildResultButtons(user.id, page)],
    });
}

module.exports = {
    buildDustReply,
    playDismantleAnimation,

data: new SlashCommandBuilder()
        .setName('dust')
        .setDescription('GS Dust и распыление повторок карточек'),

    async execute(interaction) {
        if (!(await checkDeveloper(interaction))) return;

        await interaction.deferReply();
        syncCardsCatalog();

        const reply = await buildDustReply(interaction.user, 1);
        return interaction.editReply(reply);
    },

    async handleComponent(interaction) {
        const parts = interaction.customId.split('_');

        if (parts[0] !== 'dust') return false;

        const action = parts[1];
        const ownerId = parts[2];

        if (interaction.user.id !== ownerId) {
            await interaction.reply({
                content: 'Это меню Dust открыто не для тебя.',
                ephemeral: true,
            });

            return true;
        }

        if (action === 'page' || action === 'refresh') {
            const page = Number(parts[3] ?? 1);
            const reply = await buildDustReply(interaction.user, page);
            await interaction.update(reply);
            return true;
        }

        if (action === 'info') {
            const page = Number(parts[3] ?? 1);
            const reply = await buildDustInfoReply(interaction.user, page);
            await interaction.update(reply);
            return true;
        }

        if (action === 'select') {
            const page = Number(parts[3] ?? 1);
            const inventoryId = Number(interaction.values[0]);
            const reply = await buildConfirmReply(interaction.user, inventoryId, page);
            await interaction.update(reply);
            return true;
        }

        if (action === 'cancel') {
            const page = Number(parts[3] ?? 1);
            const reply = await buildDustReply(interaction.user, page);
            await interaction.update(reply);
            return true;
        }

        if (action === 'confirm') {
            const inventoryId = Number(parts[3]);
            const page = Number(parts[4] ?? 1);

            await interaction.deferUpdate();
            await playDismantleAnimation(interaction, interaction.user, inventoryId, page);
            return true;
        }

        return false;
    },
};
