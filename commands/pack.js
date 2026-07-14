const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
} = require('discord.js');

const {
    openDailyPack,
    hasOpenedDailyPack,
    syncCardsCatalog,
} = require('../utils/cardSystem');

const { createPackPanel } = require('../images/pack/createPackPanel');
const { createPackOpeningPanel } = require('../images/pack/createPackOpeningPanel');
const { createPackOpeningGif } = require('../images/pack/createPackOpeningGif');

const OPEN_BUTTON_ID = 'pack_daily_open';
const CANCEL_BUTTON_ID = 'pack_daily_cancel';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function buildPackButtons(isReady = true) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(OPEN_BUTTON_ID)
            .setLabel('Открыть пак')
            .setEmoji('🎴')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!isReady),

        new ButtonBuilder()
            .setCustomId(CANCEL_BUTTON_ID)
            .setLabel('Отмена')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!isReady)
    );
}

function buildResultButtons(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`cards_back_${userId}_all_1`)
            .setLabel('Открыть альбом')
            .setEmoji('📖')
            .setStyle(ButtonStyle.Primary)
    );
}

async function buildPackReply(user) {
    const isReady = !hasOpenedDailyPack(user.id);
    const panel = await createPackPanel(user, { isReady });

    return {
        content: isReady
            ? `# 🎁 Ежедневный пак готов`
            : `# ❌ Ежедневный пак уже открыт`,
        files: [new AttachmentBuilder(panel, { name: 'daily-pack.png' })],
        components: [buildPackButtons(isReady)],
    };
}

async function editPanel(interaction, content, panel, fileName) {
    return interaction.editReply({
        content,
        files: [new AttachmentBuilder(panel, { name: fileName })],
        components: [],
    });
}

async function playPackOpening(interaction, user) {
    const result = openDailyPack(user.id);

    if (!result.ok) {
        const reply = await buildPackReply(user);
        return interaction.editReply(reply);
    }

    const gif = await createPackOpeningGif(user, result.drop, 'DAILY PACK');

    await interaction.editReply({
        content: '# 🎬 Открытие пака...',
        files: [new AttachmentBuilder(gif, { name: 'pack-opening.gif' })],
        components: [],
    });

    await sleep(6200);

    const finalPanel = await createPackOpeningPanel(user, 'result', result.drop, 'DAILY PACK');

    return interaction.editReply({
        content: `# 🎴 Карточка получена`,
        files: [new AttachmentBuilder(finalPanel, { name: 'pack-result.png' })],
        components: [buildResultButtons(user.id)],
    });
}

module.exports = {
    buildPackReply,
    playPackOpening,

    data: new SlashCommandBuilder()
        .setName('pack')
        .setDescription('Открытие паков с коллекционными карточками')
        .addSubcommand(subcommand =>
            subcommand
                .setName('daily')
                .setDescription('Открыть ежедневный бесплатный пак')
        ),

    async execute(interaction) {
        await interaction.deferReply();
        syncCardsCatalog();

        if (interaction.options.getSubcommand() === 'daily') {
            const reply = await buildPackReply(interaction.user);
            await interaction.editReply(reply);

            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                time: 60_000,
            });

            collector.on('collect', async buttonInteraction => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    return buttonInteraction.reply({
                        content: 'Этот пак открыт не для тебя.',
                        ephemeral: true,
                    });
                }

                if (buttonInteraction.customId === CANCEL_BUTTON_ID) {
                    collector.stop('cancelled');
                    await buttonInteraction.update({
                        content: '❌ Открытие пака отменено.',
                        files: [],
                        components: [],
                    });
                    return;
                }

                if (buttonInteraction.customId === OPEN_BUTTON_ID) {
                    collector.stop('opened');
                    await buttonInteraction.deferUpdate();
                    await playPackOpening(interaction, interaction.user);
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'opened' || reason === 'cancelled') return;

                await interaction.editReply({
                    content: '⌛ Время открытия пака истекло. Используй `/pack daily` ещё раз.',
                    files: [],
                    components: [],
                }).catch(() => null);
            });

            return;
        }

        return interaction.editReply({
            content: '❌ Неизвестная команда пака.',
            files: [],
            components: [],
        });
    },

    async handleComponent(interaction) {
        if (interaction.customId !== OPEN_BUTTON_ID && interaction.customId !== CANCEL_BUTTON_ID) {
            return false;
        }

        if (interaction.customId === CANCEL_BUTTON_ID) {
            await interaction.update({
                content: '❌ Открытие пака отменено.',
                files: [],
                components: [],
            });

            return true;
        }

        await interaction.deferUpdate();
        await playPackOpening(interaction, interaction.user);

        return true;
    },
};
