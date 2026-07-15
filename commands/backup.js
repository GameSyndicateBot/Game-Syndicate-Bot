const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { backupDatabase } = require('../utils/backupDatabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Создать бэкап базы данных')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const backupPath = await backupDatabase({ reason: `manual:${interaction.user.id}` });

        const attachment = new AttachmentBuilder(backupPath, {
            name: 'database-backup.sqlite',
        });

        await interaction.editReply({
            content: '✅ Бэкап базы данных создан.',
            files: [attachment],
            ephemeral: true,
        });
    },
};