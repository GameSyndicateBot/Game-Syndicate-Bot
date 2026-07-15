const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
} = require('discord.js');

const { buyRandomCardWithDust, PACK_TYPES, syncCardsCatalog } = require('../utils/cardSystem');
const { getCardDust } = require('../database/db');
const { createCardShopPanel } = require('../images/shop/createCardShopPanel');
const { createRevealPanel } = require('../images/reveal/createRevealPanel');

const BUTTON_PREFIX = 'cardshop_buy_';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function buildShopButtons(user) {
    const balance = getCardDust(user.id);
    return new ActionRowBuilder().addComponents(
        ...Object.values(PACK_TYPES).map(pack => new ButtonBuilder()
            .setCustomId(`${BUTTON_PREFIX}${pack.id}`)
            .setLabel(`${pack.name} • ${pack.cost} Dust`)
            .setStyle(pack.id === 'base' ? ButtonStyle.Success : pack.id === 'premium' ? ButtonStyle.Primary : ButtonStyle.Danger)
            .setDisabled(balance < pack.cost))
    );
}


function buildGsHubRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gs_home_${userId}`)
            .setLabel('Вернуться в GS Hub')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Secondary)
    );
}

async function buildShopReply(user) {
    const balance = getCardDust(user.id);
    const panel = await createCardShopPanel(user, { balance, packs: PACK_TYPES });
    return {
        content: `# Card Shop\n${user}, выбери пак. Каждый пак содержит одну случайную карточку.`,
        files: [new AttachmentBuilder(panel, { name: 'card-shop.png' })],
        components: [buildShopButtons(user), buildGsHubRow(user.id)],
    };
}

async function editPanel(interaction, content, panel, fileName) {
    return interaction.editReply({ content, files: [new AttachmentBuilder(panel, { name: fileName })], components: [] });
}

async function playBuyAnimation(interaction, user, packId) {
    const pack = PACK_TYPES[packId] ?? PACK_TYPES.base;
    const charge = await createRevealPanel(user, { phase: 'charge', source: pack.name.toUpperCase() });
    await editPanel(interaction, `Открываем ${pack.name}...`, charge, 'shop-charge.png');
    await sleep(650);

    const result = buyRandomCardWithDust(user.id, { packId: pack.id, source: `dust_shop_${pack.id}`, allowTreasure: true });
    if (!result.ok) {
        const reply = await buildShopReply(user);
        return interaction.editReply({ ...reply, content: `Недостаточно GS Dust. Нужно **${result.cost}**, у тебя **${result.balance}**.` });
    }

    const burst = await createRevealPanel(user, { phase: 'burst', source: pack.name.toUpperCase(), drop: result.drop });
    await editPanel(interaction, 'Пак открыт...', burst, 'shop-burst.png');
    await sleep(750);
    const rarity = await createRevealPanel(user, { phase: 'rarity', source: pack.name.toUpperCase(), drop: result.drop });
    await editPanel(interaction, 'Редкость определена...', rarity, 'shop-rarity.png');
    await sleep(850);
    const finalPanel = await createRevealPanel(user, { phase: 'result', source: pack.name.toUpperCase(), drop: result.drop });
    return interaction.editReply({
        content: `Покупка успешна: **${result.drop.rarityName} ${result.drop.card.name}**. Остаток: **${result.balance} GS Dust**.`,
        files: [new AttachmentBuilder(finalPanel, { name: 'shop-result.png' })],
        components: [buildShopButtons(user), buildGsHubRow(user.id)],
    });
}

module.exports = {
    buildShopReply,
    playBuyAnimation,
    data: new SlashCommandBuilder()
        .setName('cardshop')
        .setDescription('Магазин коллекционных карточек')
        .addSubcommand(subcommand => subcommand.setName('random').setDescription('Купить случайный пак за GS Dust')),

    async execute(interaction) {
        await interaction.deferReply();
        syncCardsCatalog();
        return interaction.editReply(await buildShopReply(interaction.user));
    },

    async handleComponent(interaction) {
        if (!interaction.customId.startsWith(BUTTON_PREFIX)) return false;
        const packId = interaction.customId.slice(BUTTON_PREFIX.length);
        await interaction.deferUpdate();
        await playBuyAnimation(interaction, interaction.user, packId);
        return true;
    },
};
