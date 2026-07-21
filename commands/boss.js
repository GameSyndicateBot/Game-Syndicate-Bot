
const { SlashCommandBuilder } = require('discord.js');
const { startFight, startTurns } = require('../systems/combatEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boss')
        .setDescription('Начать бой'),

    async execute(interaction) {
        startFight(interaction.channel);
        await interaction.reply({ content: 'Бой начался', ephemeral: true });

        setTimeout(() => {
            startTurns(interaction.channel);
        }, 10000);
    },
};
