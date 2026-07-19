const { MessageFlags } = require('discord.js');

function isDeveloper(userId) {
    return userId === process.env.DEVELOPER_ID;
}

function isDevMode() {
    return String(process.env.DEV_MODE).toLowerCase() === 'true';
}

async function checkDeveloper(interaction) {
    if (!isDevMode()) {
        return true;
    }

    if (isDeveloper(interaction.user.id)) {
        return true;
    }

    const reply = {
        content: '🚧 Эта функция пока находится в разработке и временно доступна только разработчику.',
        flags: MessageFlags.Ephemeral,
    };

    if (interaction.deferred || interaction.replied) {
        await interaction.followUp(reply);
    } else {
        await interaction.reply(reply);
    }

    return false;
}

module.exports = {
    isDeveloper,
    isDevMode,
    checkDeveloper,
};
