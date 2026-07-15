const {
    SlashCommandBuilder,
    PermissionFlagsBits,
} = require('discord.js');

const {
    forceCloseQuickEvent,
    getQuickEventScheduleStatus,
} = require('../systems/quickEventSystem');

function isOwner(userId) {
    const ownerId = String(process.env.BOT_OWNER_ID ?? '').trim();
    return Boolean(ownerId) && String(userId) === ownerId;
}

function formatDuration(milliseconds) {
    const totalMinutes = Math.max(1, Math.ceil(Number(milliseconds || 0) / 60_000));
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
                .setDescription('Принудительно закрыть зависший ивент и запустить новый отсчёт')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Показать время до следующего быстрого ивента')
        ),

    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Эта команда доступна только владельцу бота.',
                ephemeral: true,
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'status') {
            const status = getQuickEventScheduleStatus();

            if (!status.nextEventAt) {
                return interaction.reply({
                    content: '⚠️ Планировщик Quick Event пока не запущен.',
                    ephemeral: true,
                });
            }

            return interaction.reply({
                content: `⏳ Следующий Quick Event примерно через **${formatDuration(status.remainingMs)}** (<t:${Math.floor(status.nextEventAt / 1000)}:R>).`,
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const result = await forceCloseQuickEvent(
            interaction.client,
            interaction.user.id
        );

        const closeText = result.closed
            ? `✅ Зависший Quick Event #${result.roundId} закрыт без награды.`
            : 'ℹ️ Активного Quick Event не было, но отсчёт перезапущен.';

        return interaction.editReply(
            `${closeText}\n⏳ Следующий ивент появится примерно через **${formatDuration(result.delayMs)}** (<t:${Math.floor(result.scheduledAt / 1000)}:R>).`
        );
    },
};
