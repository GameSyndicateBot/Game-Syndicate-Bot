const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');

const {
    openDailyPack,
    hasOpenedDailyPack,
    syncCardsCatalog,
} = require('../utils/cardSystem');

const { createPackPanel } = require('../images/pack/createPackPanel');
const { createPackOpeningPanel } = require('../images/pack/createPackOpeningPanel');
const { createPackOpeningGif } = require('../images/pack/createPackOpeningGif');
const { backupCriticalChange } = require('../services/automaticBackups');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function openButtonId(userId) {
    return `pack_daily_open_${userId}`;
}

function cancelButtonId(userId) {
    return `pack_daily_cancel_${userId}`;
}

function buildPackButtons(userId, isReady = true) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(openButtonId(userId))
            .setLabel('Открыть пак')
            .setEmoji('🎴')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!isReady),

        new ButtonBuilder()
            .setCustomId(cancelButtonId(userId))
            .setLabel('Отмена')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!isReady),

        new ButtonBuilder()
            .setCustomId(`gs_home_${userId}`)
            .setLabel('GS Hub')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildResultButtons(userId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`cards_back_${userId}_all_1`)
                .setLabel('Открыть альбом')
                .setEmoji('📖')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`gs_home_${userId}`)
                .setLabel('Вернуться в GS Hub')
                .setEmoji('🏠')
                .setStyle(ButtonStyle.Secondary)
        ),
    ];
}

async function buildPackReply(user) {
    const isReady = !hasOpenedDailyPack(user.id);
    const panel = await createPackPanel(user, { isReady });

    return {
        content: isReady
            ? '# 🎁 Ежедневный пак готов'
            : '# ❌ Ежедневный пак уже открыт',
        files: [
            new AttachmentBuilder(panel, {
                name: 'daily-pack.png',
            }),
        ],
        components: [buildPackButtons(user.id, isReady)],
    };
}

async function playPackOpening(interaction, user) {
    const result = openDailyPack(user.id);

    if (!result.ok) {
        const reply = await buildPackReply(user);
        return interaction.editReply(reply);
    }

    await backupCriticalChange(interaction.client, 'daily-pack-opened');

    const gif = await createPackOpeningGif(
        user,
        result.drop,
        'DAILY PACK'
    );

    await interaction.editReply({
        content: '# 🎬 Открытие пака...',
        files: [
            new AttachmentBuilder(gif, {
                name: 'pack-opening.gif',
            }),
        ],
        components: [],
    });

    await sleep(6200);

    const finalPanel = await createPackOpeningPanel(
        user,
        'result',
        result.drop,
        'DAILY PACK'
    );

    return interaction.editReply({
        content: '# 🎴 Карточка получена',
        files: [
            new AttachmentBuilder(finalPanel, {
                name: 'pack-result.png',
            }),
        ],
        components: buildResultButtons(user.id),
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

        if (interaction.options.getSubcommand() !== 'daily') {
            return interaction.editReply({
                content: '❌ Неизвестная команда пака.',
                files: [],
                components: [],
            });
        }

        const reply = await buildPackReply(interaction.user);
        return interaction.editReply(reply);
    },

    async handleComponent(interaction) {
        if (!interaction.customId.startsWith('pack_daily_')) {
            return false;
        }

        const parts = interaction.customId.split('_');
        const action = parts[2];
        const ownerId = parts[3];

        if (!ownerId || interaction.user.id !== ownerId) {
            await interaction.reply({
                content: 'Этот пак открыт не для тебя.',
                flags: MessageFlags.Ephemeral,
            });
            return true;
        }

        if (action === 'cancel') {
            await interaction.update({
                content: '❌ Открытие пака отменено.',
                files: [],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`gs_home_${ownerId}`)
                            .setLabel('Вернуться в GS Hub')
                            .setEmoji('🏠')
                            .setStyle(ButtonStyle.Secondary)
                    ),
                ],
            });
            return true;
        }

        if (action !== 'open') {
            return false;
        }

        // Ровно одно подтверждение interaction.
        // После deferUpdate используются только editReply.
        await interaction.deferUpdate();

        try {
            await playPackOpening(interaction, interaction.user);
        } catch (error) {
            console.error('Daily pack opening failed:', error);

            await interaction.editReply({
                content:
                    '❌ Не удалось открыть ежедневный пак. Попробуй ещё раз.',
                files: [],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`gs_home_${ownerId}`)
                            .setLabel('Вернуться в GS Hub')
                            .setEmoji('🏠')
                            .setStyle(ButtonStyle.Secondary)
                    ),
                ],
            }).catch(() => null);
        }

        return true;
    },
};
