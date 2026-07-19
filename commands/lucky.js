'use strict';

const {
    SlashCommandBuilder,
    AttachmentBuilder,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');
const {
    getLuckyStats,
    setConfiguredChannel,
    runLuckyDayForGuild,
} = require('../services/luckyDay');
const { createLuckyDayCard } = require('../images/lucky/createLuckyDayCard');
const { getServerDisplayName } = require('../utils/displayName');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lucky')
        .setDescription('Lucky Day: статистика и ежедневный розыгрыш')
        .addChannelOption(option => option
            .setName('channel')
            .setDescription('Настроить канал публикации Lucky Day (только администратор)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false))
        .addBooleanOption(option => option
            .setName('run_now')
            .setDescription('Запустить сегодняшний розыгрыш вручную (только администратор)')
            .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const selectedChannel = interaction.options.getChannel('channel');
        const runNow = interaction.options.getBoolean('run_now') || false;
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

        if ((selectedChannel || runNow) && !isAdmin) {
            return interaction.editReply('Настраивать канал и запускать розыгрыш вручную может только участник с правом «Управлять сервером».');
        }

        if (selectedChannel) {
            setConfiguredChannel(interaction.guildId, selectedChannel.id);
        }

        let manualResult = null;
        if (runNow) {
            manualResult = await runLuckyDayForGuild(interaction.guild);
        }

        const stats = getLuckyStats(interaction.guildId, interaction.user.id);
        const displayName = getServerDisplayName(interaction.member, interaction.user);
        const panel = await createLuckyDayCard({
            mode: 'stats',
            user: interaction.user,
            stats,
            displayName,
        });

        const notes = [];
        if (selectedChannel) notes.push(`Канал Lucky Day настроен: ${selectedChannel}.`);
        if (manualResult?.skipped) notes.push('Сегодняшний розыгрыш уже проводился — повторная награда не выдана.');
        if (manualResult && !manualResult.skipped) notes.push('Сегодняшний розыгрыш успешно проведён.');
        if (!stats.channelId) notes.push('Администратору нужно один раз указать канал: `/lucky channel:#канал`.');

        return interaction.editReply({
            content: notes.length ? notes.join('\n') : '🍀 Lucky Day проходит ежедневно в **12:00 МСК** среди тех, кто вчера полностью закрыл ежедневные задания.',
            files: [new AttachmentBuilder(panel, { name: 'lucky-day-stats.png' })],
        });
    },
};
