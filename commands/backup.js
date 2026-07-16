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
        .setDescription('Управление резервными копиями базы')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription(
                    'Создать свежий бэкап перед обновлением бота'
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand !== 'create') {
            return interaction.reply({
                content: 'Неизвестная подкоманда.',
                flags: MessageFlags.Ephemeral,
            });
        }

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
                        'Подожди немного и повтори `/backup create`.',
                });
            }

            return interaction.editReply({
                content: [
                    '✅ **Свежий бэкап создан и загружен в канал бэкапов.**',
                    '',
                    'Теперь можно безопасно:',
                    '1. Остановить бота.',
                    '2. Обновить данные из GitHub.',
                    '3. Снова запустить бота.',
                    '',
                    'После этого проверь, что восстановилась самая свежая копия.',
                ].join('\n'),
            });
        } catch (error) {
            console.error('❌ Manual backup failed:', error);

            return interaction.editReply({
                content: [
                    '❌ **Бэкап не создан. Не обновляй бота.**',
                    `Ошибка: \`${error.message}\``,
                ].join('\n'),
            });
        }
    },
};
