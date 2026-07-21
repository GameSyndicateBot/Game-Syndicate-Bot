const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require('discord.js');

const {
    forceCloseQuickEvent,
    getQuickEventScheduleStatus,
} = require('../systems/quickEventSystem');

function formatDuration(milliseconds) {
    const totalMinutes = Math.max(
        1,
        Math.ceil(Number(milliseconds || 0) / 60_000)
    );
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) return `${hours} ч ${minutes} мин`;
    if (hours > 0) return `${hours} ч`;
    return `${minutes} мин`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quickevent')
        .setDescription('Управление системой быстрых ивентов')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('win')
                .setDescription('Закрыть зависший ивент и запустить новый отсчёт')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('boss')
                .setDescription('Запустить регистрацию мирового босса вручную')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Показать состояние и время следующего Quick Event')
        ),

    async execute(interaction) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
        });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'boss') {
            const { startRegistration } = require('../services/worldBoss/worldBossSystem');
            const result = await startRegistration(interaction.client, { manual: true });
            return interaction.editReply({
                content: result.ok
                    ? `✅ Регистрация мирового босса запущена в канале <#1529226831797158130>.`
                    : result.reason === 'active'
                        ? '❌ Мировой босс уже активен или идёт регистрация.'
                        : '❌ Не удалось запустить мирового босса: канал не найден.',
            });
        }

        if (subcommand === 'status') {
            const status = getQuickEventScheduleStatus();
            const lines = ['# ⚡ Quick Event — статус', ''];

            if (status.active && status.activeRound) {
                lines.push(
                    `**Активный ивент:** #${status.activeRound.id}`,
                    `**Тип:** ${status.activeRound.type}`,
                    `**Сложность:** ${status.activeRound.difficulty}`
                );
            } else {
                lines.push('**Активный ивент:** нет');
            }

            if (status.nextEventAt) {
                lines.push(
                    `**Следующий запуск:** <t:${Math.floor(status.nextEventAt / 1000)}:R>`,
                    `**Осталось примерно:** ${formatDuration(status.remainingMs)}`
                );
            } else if (status.schedulerStarted) {
                lines.push('**Следующий запуск:** таймер сейчас перестраивается.');
            } else {
                lines.push('**Планировщик:** ещё не запущен.');
            }

            return interaction.editReply({
                content: lines.join('\n'),
            });
        }

        if (subcommand === 'win') {
            const result = await forceCloseQuickEvent(interaction.client);

            const closeText = result.closed
                ? `✅ Quick Event #${result.roundId} закрыт без награды.`
                : 'ℹ️ Активного Quick Event не было, но отсчёт перезапущен.';

            return interaction.editReply({
                content:
                    `${closeText}\n` +
                    `Следующее событие появится случайно. ` +
                    `Ориентировочно: <t:${Math.floor(result.scheduledAt / 1000)}:R>.`,
            });
        }

        return interaction.editReply({
            content: '❌ Неизвестная подкоманда Quick Event.',
        });
    },
};
