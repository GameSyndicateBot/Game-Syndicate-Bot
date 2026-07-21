const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Проверить работу бота'),

    async execute(interaction) {
        await interaction.reply('🏓 Pong! ');
    }
};