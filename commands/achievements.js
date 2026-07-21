const {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');

const achievements = require('../data/achievements.json');
const { db, getOrCreatePlayer } = require('../database/db');
const { createAchievementsOverviewCard } = require('../images/achievements/createAchievementsOverviewCard');
const { createAchievementCategoryCard } = require('../images/achievements/createAchievementCategoryCard');

const PAGE_SIZE = 8;

const categories = [
    { label: 'Обзор', value: 'overview', emoji: '📚' },
    { label: 'Сообщения', value: 'messages', emoji: '💬' },
    { label: 'Уровни', value: 'levels', emoji: '⭐' },
    { label: 'Голос', value: 'voice', emoji: '🎙' },
    { label: 'Реакции', value: 'reactions', emoji: '❤️' },
    { label: 'Сервер', value: 'server', emoji: '📅' },
    { label: 'Коллекция', value: 'collection', emoji: '🏆' },
    { label: 'Игровые вечера', value: 'events', emoji: '🎮' },
    { label: 'Quick Events', value: 'quick_events', emoji: '⚡' },
    { label: 'Ежедневки', value: 'daily', emoji: '🎯' },
    { label: 'Серии', value: 'streaks', emoji: '🔥' },
    { label: 'Особые', value: 'special', emoji: '🌙' },
    { label: 'XP', value: 'xp', emoji: '⚡' },
];

function getUnlockedIds(userId) {
    return db.prepare(`
        SELECT achievement_id
        FROM player_achievements
        WHERE user_id = ?
    `).all(userId).map(row => row.achievement_id);
}

function buildSelectRow(currentCategory, userId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`achievements_category_${userId}`)
            .setPlaceholder('Выбери категорию достижений')
            .addOptions(
                categories.map(category => ({
                    label: category.label,
                    value: category.value,
                    emoji: category.emoji,
                    default: category.value === currentCategory,
                }))
            )
    );
}

function buildButtonRow(category, page, totalPages, userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`achievements_prev_${userId}_${category}_${page}`)
            .setLabel('Назад')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(category === 'overview' || page <= 1),

        new ButtonBuilder()
            .setCustomId(`achievements_next_${userId}_${category}_${page}`)
            .setLabel('Вперёд')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(category === 'overview' || page >= totalPages)
    );
}

async function buildAchievementsReply(user, category = 'overview', page = 1) {
    const unlockedIds = getUnlockedIds(user.id);

    if (category === 'overview') {
        const card = await createAchievementsOverviewCard(user, achievements, unlockedIds);

        return {
            files: [
                new AttachmentBuilder(card, {
                    name: 'achievements-overview.png',
                }),
            ],
            components: [
                buildSelectRow('overview', user.id),
                buildButtonRow('overview', 1, 1, user.id),
            ],
        };
    }

    const categoryAchievements = achievements.filter(
        achievement => achievement.category === category
    );

    const totalPages = Math.max(1, Math.ceil(categoryAchievements.length / PAGE_SIZE));
    const safePage = Math.max(1, Math.min(page, totalPages));

    const card = await createAchievementCategoryCard(
        category,
        categoryAchievements,
        unlockedIds,
        safePage
    );

    return {
        files: [
            new AttachmentBuilder(card, {
                name: `achievements-${category}.png`,
            }),
        ],
        components: [
            buildSelectRow(category, user.id),
            buildButtonRow(category, safePage, totalPages, user.id),
        ],
    };
}

module.exports = {
    buildAchievementsReply,

data: new SlashCommandBuilder()
        .setName('achievements')
        .setDescription('Открыть энциклопедию достижений'),

    async execute(interaction) {
        getOrCreatePlayer(interaction.user);
        const reply = await buildAchievementsReply(interaction.user);
        await interaction.reply(reply);
    },

    async handleComponent(interaction) {
        const parts = interaction.customId.split('_');

        if (parts[0] !== 'achievements') return false;

        if (parts[1] === 'category') {
            const ownerId = parts[2];

            if (interaction.user.id !== ownerId) {
                await interaction.reply({
                    content: 'Эта энциклопедия открыта не для тебя.',
                    flags: MessageFlags.Ephemeral,
                });
                return true;
            }

            const category = interaction.values[0];
            const updatedReply = await buildAchievementsReply(interaction.user, category, 1);

            await interaction.update(updatedReply);
            return true;
        }

        if (parts[1] === 'prev' || parts[1] === 'next') {
            const action = parts[1];
            const ownerId = parts[2];
            const category = parts[3];
            const currentPage = Number(parts[4]);

            if (interaction.user.id !== ownerId) {
                await interaction.reply({
                    content: 'Эта энциклопедия открыта не для тебя.',
                    flags: MessageFlags.Ephemeral,
                });
                return true;
            }

            const nextPage = action === 'next'
                ? currentPage + 1
                : currentPage - 1;

            const updatedReply = await buildAchievementsReply(
                interaction.user,
                category,
                nextPage
            );

            await interaction.update(updatedReply);
            return true;
        }

        return false;
    },
};