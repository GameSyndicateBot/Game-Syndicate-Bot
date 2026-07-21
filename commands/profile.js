const {
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');

const {
    buildProfileReply,
} = require('./gs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Показать профиль игрока')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Игрок, чей профиль показать')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetMember = interaction.guild
            ? await interaction.guild.members.fetch(targetUser.id).catch(() => null)
            : null;
        const { attachServerDisplayName } = require('../utils/displayName');
        attachServerDisplayName(targetUser, targetMember);

        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ У ботов нет профиля.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        const reply = await buildProfileReply(targetUser, interaction.guild);
        return interaction.editReply(reply);
    }
};
