const {
    SlashCommandBuilder,
} = require('discord.js');

const {
    buildTopReply,
} = require('./gs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('top')
        .setDescription('Показать лидерборд сервера')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Тип рейтинга')
                .setRequired(true)
                .addChoices(
                    { name: 'XP', value: 'xp' },
                    { name: 'Сообщения', value: 'messages' },
                    { name: 'Голосовой онлайн', value: 'voice' },
                    { name: 'Достижения', value: 'achievements' },
                    { name: 'Поставленные реакции', value: 'given_reactions' },
                    { name: 'Полученные реакции', value: 'received_reactions' },
                    { name: 'Achievement Points', value: 'achievement_points' },
                    { name: 'Игровые вечера', value: 'events' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type');
        const reply = await buildTopReply(interaction.user, type, 0, interaction.guild);

        return interaction.editReply(reply);
    },

    async handleComponent(interaction) {
        return false;
    },
};
