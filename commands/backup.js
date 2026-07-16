const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require('discord.js');

const {
    runAutomaticBackup,
} = require('../services/automaticBackups');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription(
            'Создать и отправить свежий бэкап базы в служебный канал'
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    async execute(interaction) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
        });

        try {
            const result = await runAutomaticBackup(
                interaction.client,
                `manual-before-update:${interaction.user.id}`
            );

            if (result?.busy) {
                return interaction.editReply({
                    content:
                        '⏳ Другой бэкап уже создаётся. ' +
                        'Подожди немного и повтори команду.',
                });
            }

            return interaction.editReply({
                content: [
                    '✅ **Свежий бэкап создан и загружен в Discord.**',
                    '',
                    'Теперь безопасный порядок такой:',
                    '1. Останови бота.',
                    '2. Обнови данные из GitHub.',
                    '3. Запусти бота.',
                    '',
                    'До остановки не выдавай карточки и не меняй экономику.',
                ].join('\n'),
            });
        } catch (error) {
            console.error('❌ Manual backup failed:', error);

            return interaction.editReply({
                content:
                    `❌ Не удалось создать или загрузить бэкап:\n` +
                    `\`${error.message}\`\n\n` +
                    'Не обновляй бота, пока бэкап не завершится успешно.',
            });
        }
    },
};
