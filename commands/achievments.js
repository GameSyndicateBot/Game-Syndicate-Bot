const { SlashCommandBuilder } = require('discord.js');
const achievementsCommand = require('./achievements');

/**
 * Совместимый алиас для исторически используемого написания /achievments.
 * Основная реализация остаётся в achievements.js, поэтому обе команды
 * открывают одну и ту же энциклопедию и используют одинаковые компоненты.
 */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('achievments')
        .setDescription('Открыть энциклопедию достижений'),

    async execute(interaction) {
        return achievementsCommand.execute(interaction);
    },
};
