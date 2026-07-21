
const { SlashCommandBuilder } = require('discord.js');
const { startFight } = require('../systems/combatEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bossfight')
        .setDescription('Запустить бой с боссом'),

    async execute(interaction) {
        startFight(interaction.client, interaction.channel);
        await interaction.reply('⚔️ Бой начался');
    },
};
