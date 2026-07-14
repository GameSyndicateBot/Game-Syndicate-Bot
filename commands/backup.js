const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { backupDatabase } = require('../utils/backupDatabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Создать бэкап базы данных')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const backupPath = backupDatabase();

        const attachment = new AttachmentBuilder(backupPath, {
            name: 'database-backup.sqlite',
        });

        await interaction.reply({
            content: '✅ Бэкап базы данных создан.',
            files: [attachment],
            ephemeral: true,
        });
    },
};