
function getPack() {
    const r = Math.random()*100;
    if (r < 40) return "Обычный пак";
    if (r < 65) return "Премиум пак";
    if (r < 85) return "Элитный пак";
    return "Босс пак";
}

function getDust(players) {
    const total = Math.floor(Math.random()*300)+300;
    return Math.floor(total / players.length);
}

module.exports = { getPack, getDust };
