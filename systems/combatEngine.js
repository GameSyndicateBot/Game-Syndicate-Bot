
let activeFight = null;

function startFight(client, channel) {
    if (activeFight) return;

    activeFight = {
        players: [],
        bossHp: 1000,
        turn: 0,
        energy: {}
    };

    channel.send("👹 БОСС ПОЯВИЛСЯ! ЖМИ 'JOIN'");
}

function joinFight(user) {
    if (!activeFight) return;
    if (activeFight.players.includes(user.id)) return;

    activeFight.players.push(user.id);
    activeFight.energy[user.id] = 0;
}

function attack(userId) {
    if (!activeFight) return;

    const dmg = Math.floor(Math.random() * 30) + 10;
    activeFight.bossHp -= dmg;
    activeFight.energy[userId] += 1;

    return dmg;
}

function getState() {
    return activeFight;
}

module.exports = {
    startFight,
    joinFight,
    attack,
    getState
};
