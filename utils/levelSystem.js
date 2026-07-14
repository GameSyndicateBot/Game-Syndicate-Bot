function getRequiredXP(level) {
    return Math.floor(150 * Math.pow(level, 1.45));
}

function addXP(player, amount) {
    let xp = player.xp + amount;
    let level = player.level;
    let leveledUp = false;

    while (xp >= getRequiredXP(level)) {
        xp -= getRequiredXP(level);
        level++;
        leveledUp = true;
    }

    return {
        ...player,
        xp,
        level,
        leveledUp,
    };
}

module.exports = {
    getRequiredXP,
    addXP,
};