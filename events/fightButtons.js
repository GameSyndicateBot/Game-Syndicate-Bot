const { fights } = require('../commands/event');

module.exports = async (interaction) => {
    if (!interaction.isButton()) return;

    const fight = fights.get(interaction.channelId);
    if (!fight) return;

    const player = fight.current();

    if (player.userId !== interaction.user.id) {
        return interaction.reply({ content: "Не твой ход", ephemeral: true });
    }

    if (interaction.customId === "attack") fight.attack(player);
    if (interaction.customId === "ability") fight.ability(player);
    if (interaction.customId === "ulti") fight.ulti(player);

    if (fight.isFinished()) {
        const mvp = fight.getMVP();
        return interaction.reply(`🏆 Босс убит! MVP: <@${mvp.userId}>`);
    }

    fight.nextTurn();

    await interaction.update({
        content: fight.log.join("\n") + `\n\nХод: <@${fight.current().userId}>`,
    });

    fight.log = [];
};
