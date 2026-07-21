const {
    SlashCommandBuilder,
    AttachmentBuilder,
} = require('discord.js');

const {
    getOrCreatePlayer,
    getDailyHistory,
    getUserStreak,
} = require('../database/db');

const { createDailyHistoryCard } = require('../images/daily/createDailyHistoryCard');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dailyhistory')
        .setDescription('Показать историю ежедневных заданий')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Игрок, чью историю показать')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') || interaction.user;

        if (targetUser.bot) {
            return interaction.editReply({
                content: '❌ У ботов нет истории ежедневок.',
            });
        }

        getOrCreatePlayer(targetUser);

        const history = getDailyHistory(targetUser.id, 30);
        const dailyStreak = getUserStreak(targetUser.id, 'daily_claim');

        const card = await createDailyHistoryCard(
            targetUser,
            history,
            dailyStreak
        );

        return interaction.editReply({
            files: [
                new AttachmentBuilder(card, {
                    name: 'daily-history.png',
                }),
            ],
        });
    },
};