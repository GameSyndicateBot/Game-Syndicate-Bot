
const { SlashCommandBuilder } = require('discord.js');
const { startFight, getControls } = require('../systems/combatEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boss')
        .setDescription('Начать бой'),

    async execute(interaction) {
        startFight(interaction.channel);
        await interaction.reply({ content: 'Бой начат', ephemeral: true });
        await interaction.channel.send({ content: '⚔️ Бой начался', components: [getControls()] });
    },
};
