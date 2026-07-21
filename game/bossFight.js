class Player {
    constructor(userId, cls) {
        this.userId = userId;
        this.class = cls;
        this.hp = 120;
        this.maxHp = 120;
        this.energy = 0;
        this.initiative = Math.floor(Math.random() * 20) + 1;
        this.damageDone = 0;
        this.alive = true;
    }
}

class Boss {
    constructor(playersCount) {
        this.name = "Багровый Дракон";
        this.hp = 3000 + playersCount * 400;
        this.maxHp = this.hp;
        this.damage = [40, 80];
    }

    attack(players) {
        const alive = players.filter(p => p.alive);
        const target = alive[Math.floor(Math.random() * alive.length)];
        if (!target) return "Босс пропускает ход";
        const dmg = rand(this.damage);
        target.hp -= dmg;
        if (target.hp <= 0) target.alive = false;
        return `🐉 Босс ударил <@${target.userId}> на ${dmg}`;
    }
}

function rand([min, max]) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

class BossFight {
    constructor() {
        this.players = [];
        this.turnOrder = [];
        this.turnIndex = 0;
        this.boss = null;
        this.state = "waiting";
        this.log = [];
    }

    addPlayer(userId) {
        const classes = ["tank", "mage", "assassin", "healer"];
        const cls = classes[Math.floor(Math.random() * classes.length)];
        this.players.push(new Player(userId, cls));
    }

    start() {
        if (this.players.length < 4) return false;
        this.boss = new Boss(this.players.length);
        this.turnOrder = [...this.players].sort((a, b) => b.initiative - a.initiative);
        this.state = "fight";
        return true;
    }

    current() {
        return this.turnOrder[this.turnIndex];
    }

    attack(player) {
        const dmg = rand([20, 35]);
        this.boss.hp -= dmg;
        player.energy += 20;
        player.damageDone += dmg;
        this.log.push(`⚔️ <@${player.userId}> ударил на ${dmg}`);
    }

    ability(player) {
        if (player.energy < 50) {
            this.log.push("❌ Недостаточно энергии");
            return;
        }
        const dmg = rand([50, 80]);
        this.boss.hp -= dmg;
        player.energy -= 50;
        player.damageDone += dmg;
        this.log.push(`💥 Способность: ${dmg} урона`);
    }

    ulti(player) {
        if (player.energy < 100) {
            this.log.push("❌ Нет энергии для ульты");
            return;
        }
        const dmg = rand([120, 180]);
        this.boss.hp -= dmg;
        player.energy = 0;
        player.damageDone += dmg;
        this.log.push(`🔥 УЛЬТА: ${dmg} урона`);
    }

    nextTurn() {
        this.turnIndex++;
        if (this.turnIndex >= this.turnOrder.length) {
            this.turnIndex = 0;
            const bossLog = this.boss.attack(this.players);
            this.log.push(bossLog);
        }
    }

    isFinished() {
        return this.boss.hp <= 0 || this.players.filter(p => p.alive).length === 0;
    }

    getMVP() {
        return this.players.sort((a, b) => b.damageDone - a.damageDone)[0];
    }
}

module.exports = { BossFight };
