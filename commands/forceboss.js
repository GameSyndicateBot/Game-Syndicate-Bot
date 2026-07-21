const { SlashCommandBuilder } = require('discord.js');
const { forceBoss } = require('../systems/eventEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forceboss')
        .setDescription('Запустить босса (админ)'),
    async execute(interaction) {
        forceBoss(interaction.client);
        await interaction.reply({ content: '👹 Босс запущен вручную', ephemeral: true });
    },
};
