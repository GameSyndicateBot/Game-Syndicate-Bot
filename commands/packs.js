'use strict';

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getPackInventory, openStoredPacks } = require('../utils/packInventory');
const { createPackOpeningPanel } = require('../images/pack/createPackOpeningPanel');
const { checkAchievementsForInteraction } = require('../utils/checkAchievements');

const LABELS = {
    base: 'Base Pack',
    premium: 'Premium Pack',
    elite: 'Elite Pack',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('packs')
        .setDescription('Инвентарь паков, полученных в Quick Events')
        .addSubcommand(sub => sub
            .setName('inventory')
            .setDescription('Показать сохранённые паки'))
        .addSubcommand(sub => sub
            .setName('open')
            .setDescription('Открыть сохранённые паки')
            .addStringOption(option => option
                .setName('type')
                .setDescription('Тип пака')
                .setRequired(true)
                .addChoices(
                    { name: 'Base Pack', value: 'base' },
                    { name: 'Premium Pack', value: 'premium' },
                    { name: 'Elite Pack', value: 'elite' },
                ))
            .addIntegerOption(option => option
                .setName('amount')
                .setDescription('Количество от 1 до 10')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(false))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'inventory') {
            const inventory = getPackInventory(interaction.user.id);
            return interaction.reply({
                content: [
                    '# 📦 Инвентарь паков',
                    '',
                    `📦 Base Pack: **${inventory.base}**`,
                    `💎 Premium Pack: **${inventory.premium}**`,
                    `👑 Elite Pack: **${inventory.elite}**`,
                    '',
                    'Открытие: `/packs open`',
                ].join('\n'),
                ephemeral: true,
            });
        }

        await interaction.deferReply();
        const type = interaction.options.getString('type');
        const amount = interaction.options.getInteger('amount') || 1;
        const result = openStoredPacks(interaction.user.id, type, amount);

        if (!result.ok) {
            return interaction.editReply({
                content: result.reason === 'not_enough_packs'
                    ? `❌ Недостаточно ${LABELS[type]}. В наличии: **${result.available}**.`
                    : '❌ Неизвестный тип пака.',
            });
        }

        await checkAchievementsForInteraction(interaction);

        if (result.opened === 1) {
            const drop = result.drops[0];
            const panel = await createPackOpeningPanel(
                interaction.user,
                'result',
                drop,
                LABELS[type].toUpperCase(),
            );
            return interaction.editReply({
                content: `# 🎴 ${LABELS[type]} открыт\nОсталось: **${result.remaining}**`,
                files: [new AttachmentBuilder(panel, { name: 'stored-pack-result.png' })],
            });
        }

        const lines = result.drops.map((drop, index) =>
            `${index + 1}. **${drop.rarityName}** — ${drop.card.name} #${String(drop.copyNumber).padStart(4, '0')}`
        );
        return interaction.editReply({
            content: [
                `# 📦 Открыто паков: ${result.opened}`,
                '',
                ...lines,
                '',
                `Осталось ${LABELS[type]}: **${result.remaining}**`,
            ].join('\n'),
        });
    },
};
