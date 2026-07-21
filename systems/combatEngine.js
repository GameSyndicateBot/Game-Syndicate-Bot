
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

let fight = null;

function startFight(channel) {
    if (fight) return;

    fight = {
        players: [],
        bossHp: 1000,
        energy: {},
    };

    const embed = new EmbedBuilder()
        .setTitle('👹 БОСС: Тёмный Страж')
        .setDescription('Нажми JOIN чтобы войти в бой')
        .setColor(0x990000);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('JOIN').setStyle(ButtonStyle.Success)
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
        }

        return interaction.reply({ content: 'Ты в бою', ephemeral: true });
    }

    if (interaction.customId === 'attack') {
        const dmg = Math.floor(Math.random() * 20) + 10;
        fight.bossHp -= dmg;
        fight.energy[id] += 1;

        return interaction.reply({ content: `⚔️ Урон: ${dmg}`, ephemeral: true });
    }

    if (interaction.customId === 'skill') {
        if (fight.energy[id] < 3)
            return interaction.reply({ content: 'Недостаточно энергии', ephemeral: true });

        fight.energy[id] -= 3;
        const dmg = 60;
        fight.bossHp -= dmg;

        return interaction.reply({ content: `💥 Способность: ${dmg}`, ephemeral: true });
    }

    if (interaction.customId === 'ult') {
        if (fight.energy[id] < 6)
            return interaction.reply({ content: 'Нет энергии на ульту', ephemeral: true });

        fight.energy[id] -= 6;
        const dmg = 150;
        fight.bossHp -= dmg;

        return interaction.reply({ content: `🔥 УЛЬТА: ${dmg}`, ephemeral: true });
    }
}

function getControls() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('⚔️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('skill').setLabel('🔋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ult').setLabel('💥').setStyle(ButtonStyle.Danger),
    );
}

module.exports = { startFight, handleInteraction, getControls };
