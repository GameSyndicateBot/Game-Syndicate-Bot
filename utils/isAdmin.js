const { PermissionFlagsBits } = require('discord.js');

function isAdmin(interaction) {
    return (
        interaction.user.id === process.env.BOT_OWNER_ID ||
        interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    );
}

module.exports = {
    isAdmin,
};