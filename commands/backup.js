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
        // false = не выбрасывать ошибку, если Discord ещё хранит
        // старую версию команды /backup без подкоманды create.
        const subcommand = interaction.options.getSubcommand(false);

        if (subcommand && subcommand !== 'create') {
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

            if (result?.discordUploaded) {
                return interaction.editReply({
                    content: [
                        '✅ **Свежий бэкап создан.**',
                        `📁 Локальная копия: \`${result.backupPath}\``,
                        `☁️ Discord: загружено частей — **${result.discordParts || 1}**.`,
                        '',
                        'Теперь можно безопасно обновлять бота.',
                    ].join('\n'),
                });
            }

            return interaction.editReply({
                content: [
                    '✅ **Свежий локальный бэкап создан.**',
                    `📁 Файл: \`${result.backupPath}\``,
                    '',
                    '⚠️ Копию не удалось отправить в Discord, но сам SQLite-бэкап создан успешно.',
                    `Причина Discord: \`${result.discordError || 'неизвестная ошибка'}\``,
                    '',
                    'Обновление не уничтожит эту локальную копию в `/app/shared/backups`.',
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
