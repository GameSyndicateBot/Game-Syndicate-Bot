const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { resetPlayer } = require('../database/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetprofile')
        .setDescription('Сбросить профиль и достижения пользователя')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Пользователь, которому нужно сбросить профиль')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');

        resetPlayer(targetUser.id);

        await interaction.reply({
            content: `♻️ Профиль пользователя ${targetUser} был полностью сброшен.`,
            ephemeral: true,
        });
    },
};