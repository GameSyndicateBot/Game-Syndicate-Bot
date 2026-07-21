const {
    SlashCommandBuilder,
    AttachmentBuilder,
} = require('discord.js');

const {
    getOrCreatePlayer,
    getUserStreaks,
} = require('../database/db');

const { createStreakCard } = require('../images/streak/createStreakCard');


async function buildStreakReply(user) {
    getOrCreatePlayer(user);

    const streaks = getUserStreaks(user.id);
    const card = await createStreakCard(user, streaks);

    return {
        files: [
            new AttachmentBuilder(card, {
                name: 'streak.png',
            }),
        ],
    };
}

module.exports = {
    buildStreakReply,

data: new SlashCommandBuilder()
        .setName('streak')
        .setDescription('Показать серии активности')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Игрок, чьи серии показать')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser =
            interaction.options.getUser('user') || interaction.user;

        if (targetUser.bot) {
            return interaction.editReply({
                content: '❌ У ботов нет серий активности.',
            });
        }

        getOrCreatePlayer(targetUser);

        const streaks = getUserStreaks(targetUser.id);

        const card = await createStreakCard(targetUser, streaks);

        const attachment = new AttachmentBuilder(card, {
            name: 'streak.png',
        });

        return interaction.editReply({
            files: [attachment],
        });
    }
};