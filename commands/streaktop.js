const {
    SlashCommandBuilder,
    AttachmentBuilder,
} = require('discord.js');

const { db } = require('../database/db');
const { createStreakTopCard } = require('../images/streak/createStreakTopCard');

const streakTypes = {
    daily_claim: 'Ежедневные задания',
    chat: 'Серия сообщений',
    voice: 'Голосовая активность',
    given_reactions: 'Выданные реакции',
    received_reactions: 'Полученные реакции',
    achievement: 'Достижения',
    level_up: 'Повышение уровня',
    event: 'Игровые вечера',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('streaktop')
        .setDescription('Топ игроков по сериям активности')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Тип серии')
                .setRequired(true)
                .addChoices(
                    { name: '🔥 Ежедневные задания', value: 'daily_claim' },
                    { name: '💬 Сообщения', value: 'chat' },
                    { name: '🎙 Голос', value: 'voice' },
                    { name: '👍 Выданные реакции', value: 'given_reactions' },
                    { name: '❤️ Полученные реакции', value: 'received_reactions' },
                    { name: '🏆 Достижения', value: 'achievement' },
                    { name: '⭐ Повышение уровня', value: 'level_up' },
                    { name: '🎮 Игровые вечера', value: 'event' },
                )
        )
        .addStringOption(option =>
            option
                .setName('mode')
                .setDescription('Что показывать')
                .setRequired(true)
                .addChoices(
                    { name: 'Текущая серия', value: 'current' },
                    { name: 'Рекорд', value: 'best' },
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type');
        const mode = interaction.options.getString('mode');

        const players = db.prepare(`
            SELECT
                s.user_id,
                s.type,
                s.current,
                s.best,
                s.last_date,
                p.username
            FROM streaks s
            LEFT JOIN players p ON p.user_id = s.user_id
            WHERE s.type = ?
            ORDER BY ${mode} DESC
            LIMIT 10
        `).all(type);

        const card = await createStreakTopCard(
            players,
            type,
            mode,
            streakTypes[type] || type
        );

        const attachment = new AttachmentBuilder(card, {
            name: 'streak-top.png',
        });

        return interaction.editReply({
            files: [attachment],
        });
    },
};