
if (!global.gs_sent_lobbies) {
    global.gs_sent_lobbies = new Set();
}
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

        const mapInput = new TextInputBuilder()
            .setCustomId('game_map')
            .setLabel('Название карты или лобби')
            .setPlaceholder('Например: Basement или Lobby 1')
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(60)
            .setRequired(true);

        const lobbyCodeInput = new TextInputBuilder()
            .setCustomId('game_code')
            .setLabel('Код лобби или пароль')
            .setPlaceholder('Например: ABC123')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(40)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(gameInput),
            new ActionRowBuilder().addComponents(mapInput),
            new ActionRowBuilder().addComponents(lobbyCodeInput),
        );

        await interaction.showModal(modal);
    }
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
                mapName: interaction.fields.getTextInputValue('game_map').trim(),
                lobbyCode: interaction.fields.getTextInputValue('game_code').trim(),
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
    }
};
