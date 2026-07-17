'use strict';

const {
    ActionRowBuilder,
    ModalBuilder,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} = require('discord.js');
const { publishGameLobby } = require('../systems/gameLobbySystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('game')
        .setDescription('Быстро создать игровое лобби в Discord и Telegram'),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('game_create_modal')
            .setTitle('GS Game Lobby');

        const gameInput = new TextInputBuilder()
            .setCustomId('game_name')
            .setLabel('Название игры')
            .setPlaceholder('Например: Гномы')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(60)
            .setRequired(true);

        const lobbyCodeInput = new TextInputBuilder()
            .setCustomId('game_code')
            .setLabel('Код лобби (необязательно)')
            .setPlaceholder('Например: ABC123')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(40)
            .setRequired(false);

        const timeInput = new TextInputBuilder()
            .setCustomId('game_time')
            .setLabel('Время (необязательно)')
            .setPlaceholder('Например: 21:00')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(40)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gameInput),
            new ActionRowBuilder().addComponents(lobbyCodeInput),
            new ActionRowBuilder().addComponents(timeInput),
        );

        await interaction.showModal(modal);
    },

    async handleModal(interaction) {
        if (!interaction.isModalSubmit() || interaction.customId !== 'game_create_modal') {
            return false;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const creatorName = interaction.member?.displayName
            || interaction.user.globalName
            || interaction.user.username;

        try {
            await publishGameLobby({
                creatorId: interaction.user.id,
                creatorName,
                game: interaction.fields.getTextInputValue('game_name').trim(),
                lobbyCode: interaction.fields.getTextInputValue('game_code').trim(),
                timeText: interaction.fields.getTextInputValue('game_time').trim(),
            });

            await interaction.editReply({
                content: '✅ **GS Game Lobby опубликовано.**\nОтправлено в Discord и Telegram. Автозакрытие через 4 часа.',
            });
        } catch (error) {
            console.error('[GameLobby] Create:', error);
            await interaction.editReply({
                content: `❌ Не удалось опубликовать лобби.\n\`${error.message}\``,
            });
        }

        return true;
    },
};
