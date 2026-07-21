
function spawnMinion(players) {
    return {
        name: "Тень",
        hp: 100,
        attack() {
            const target = players[Math.floor(Math.random()*players.length)];
            target.hp -= 20;
            return `👾 Миньон ударил <@${target.userId}>`;
        }
    };
}

module.exports = { spawnMinion };
