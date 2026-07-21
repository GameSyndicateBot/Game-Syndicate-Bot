
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

let fight = null;

function rollD20() {
    return Math.floor(Math.random() * 20) + 1;
}

function startFight(channel) {
    if (fight) return;

    fight = {
        players: [],
        bossHp: 2000,
        energy: {},
        damage: {},
        turnOrder: [],
        turnIndex: 0,
    };

    const embed = new EmbedBuilder()
        .setTitle('👹 Мировой Босс')
        .setDescription('Нажми JOIN чтобы вступить в бой')
        .setColor(0xff0000);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('JOIN').setStyle(ButtonStyle.Success)
    );

    channel.send({ embeds: [embed], components: [row] });
}

function startTurns(channel) {
    fight.turnOrder = fight.players
        .map(id => ({ id, roll: rollD20() }))
        .sort((a, b) => b.roll - a.roll)
        .map(p => p.id);

    fight.turnIndex = 0;

    nextTurn(channel);
}

function nextTurn(channel) {
    if (!fight) return;

    if (fight.bossHp <= 0) {
        endFight(channel);
        return;
    }

    const playerId = fight.turnOrder[fight.turnIndex];

    const embed = new EmbedBuilder()
        .setTitle('⚔️ Ход игрока')
        .setDescription(`<@${playerId}> твой ход!`)
        .addFields({ name: 'HP Босса', value: String(fight.bossHp) });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('⚔️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('skill').setLabel('🔋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ult').setLabel('💥').setStyle(ButtonStyle.Danger),
    );

    channel.send({ embeds: [embed], components: [row] });
}

function handleInteraction(interaction) {
    if (!fight) return;

    const id = interaction.user.id;

    if (interaction.customId === 'join') {
        if (!fight.players.includes(id)) {
            fight.players.push(id);
            fight.energy[id] = 0;
            fight.damage[id] = 0;
        }
        return interaction.reply({ content: 'Ты в бою', ephemeral: true });
    }

    if (!fight.turnOrder.includes(id)) return;

    let dmg = 0;

    if (interaction.customId === 'attack') {
        dmg = Math.floor(Math.random() * 30) + 20;
        fight.energy[id]++;
    }

    if (interaction.customId === 'skill') {
        if (fight.energy[id] < 3)
            return interaction.reply({ content: 'Нет энергии', ephemeral: true });
        fight.energy[id] -= 3;
        dmg = 80;
    }

    if (interaction.customId === 'ult') {
        if (fight.energy[id] < 6)
            return interaction.reply({ content: 'Нет энергии', ephemeral: true });
        fight.energy[id] -= 6;
        dmg = 180;
    }

    fight.bossHp -= dmg;
    fight.damage[id] += dmg;

    interaction.reply({ content: `💥 Урон: ${dmg}`, ephemeral: true });

    fight.turnIndex = (fight.turnIndex + 1) % fight.turnOrder.length;
}

function endFight(channel) {
    const sorted = Object.entries(fight.damage)
        .sort((a, b) => b[1] - a[1]);

    const mvp = sorted[0][0];

    channel.send(`🏆 Босс убит!
MVP: <@${mvp}>`);

    fight = null;
}

module.exports = { startFight, handleInteraction, startTurns };
