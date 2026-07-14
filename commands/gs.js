const {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const achievementsList = require('../data/achievements.json');

const {
    db,
    getOrCreatePlayer,
    getAchievementCount,
    getCardDust,
} = require('../database/db');

const {
    getUserCardStats,
    syncCardsCatalog,
} = require('../utils/cardSystem');

const { getRequiredXP } = require('../utils/levelSystem');
const { attachServerDisplayName } = require('../utils/displayName');
const { createGsDashboardPanel } = require('../images/gs/createGsDashboardPanel');
const { createGsProfilePanel } = require('../images/gs/createGsProfilePanel');
const { createGsTopPanel } = require('../images/gs/createGsTopPanel');
const cardsCommand = require('./cards');
const achievementsCommand = require('./achievements');
const packCommand = require('./pack');
const dustCommand = require('./dust');
const cardshopCommand = require('./cardshop');
const forecastCommand = require('./forecast');
const streakCommand = require('./streak');
const dailyCommand = require('./daily');

const TOP_PAGE_SIZE = 5;

const topTypes = {
    xp: {
        label: 'XP',
        emoji: '⭐',
        column: 'xp',
    },
    messages: {
        label: 'Сообщения',
        emoji: '💬',
        column: 'messages',
    },
    voice: {
        label: 'Голосовой онлайн',
        emoji: '🎙️',
        column: null,
    },
    achievements: {
        label: 'Достижения',
        emoji: '🏅',
        column: 'achievements',
    },
    given_reactions: {
        label: 'Поставленные реакции',
        emoji: '👍',
        column: 'given_reactions',
    },
    received_reactions: {
        label: 'Полученные реакции',
        emoji: '💜',
        column: 'received_reactions',
    },
    achievement_points: {
        label: 'Achievement Points',
        emoji: '🏆',
        column: 'achievement_points',
    },
    events: {
        label: 'Игровые вечера',
        emoji: '🎮',
        column: 'events_count',
    },
};


function getTotalXP(player) {
    const level = Math.max(1, Number(player.level) || 1);
    let total = Math.max(0, Number(player.xp) || 0);

    for (let completedLevel = 1; completedLevel < level; completedLevel += 1) {
        total += getRequiredXP(completedLevel);
    }

    return total;
}

function getPlayersForTop(type, limit, offset) {
    if (type === 'xp') {
        return db.prepare(`
            SELECT *
            FROM players
        `).all()
            .map(player => ({
                ...player,
                total_xp: getTotalXP(player),
            }))
            .sort((a, b) =>
                b.total_xp - a.total_xp
                || (Number(b.level) || 1) - (Number(a.level) || 1)
                || (Number(b.xp) || 0) - (Number(a.xp) || 0)
            )
            .slice(offset, offset + limit);
    }

    if (type === 'voice') {
        const now = Date.now();

        const players = db.prepare(`
            SELECT
                p.*,
                vs.started_at AS active_voice_started_at
            FROM players p
            LEFT JOIN voice_sessions vs
                ON vs.user_id = p.user_id
            ORDER BY
                (
                    COALESCE(p.voice_seconds, 0) +
                    CASE
                        WHEN vs.started_at IS NOT NULL
                        THEN CAST((? - vs.started_at) / 1000 AS INTEGER)
                        ELSE 0
                    END
                ) DESC
            LIMIT ? OFFSET ?
        `).all(now, limit, offset);

        return players.map(player => {
            const activeSeconds = player.active_voice_started_at
                ? Math.floor((now - player.active_voice_started_at) / 1000)
                : 0;

            return {
                ...player,
                voice_seconds: (player.voice_seconds ?? 0) + activeSeconds,
            };
        });
    }

    const column = topTypes[type]?.column ?? 'xp';

    return db.prepare(`
        SELECT *
        FROM players
        ORDER BY ${column} DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);
}

function buildTopSelect(userId, activeType, page = 0) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`gs_topselect_${userId}_${page}`)
            .setPlaceholder('Выбери рейтинг')
            .addOptions(
                Object.entries(topTypes).map(([value, data]) => ({
                    label: data.label,
                    value,
                    emoji: data.emoji,
                    default: value === activeType,
                }))
            )
    );
}

function buildHubButtons(userId) {
    const button = (id, label, style = ButtonStyle.Secondary) =>
        new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

    return [
        new ActionRowBuilder().addComponents(
            button(`gs_profile_${userId}`, 'Профиль', ButtonStyle.Primary),
            button(`gs_hint_${userId}_cards`, 'Коллекция'),
            button(`gs_hint_${userId}_achievements`, 'Достижения'),
            button(`gs_top_${userId}_xp_0`, 'Топы')
        ),
        new ActionRowBuilder().addComponents(
            button(`gs_hint_${userId}_pack`, 'Daily Pack', ButtonStyle.Success),
            button(`gs_hint_${userId}_dust`, 'GS Dust'),
            button(`gs_hint_${userId}_shop`, 'Card Shop'),
            button(`gs_hint_${userId}_daily`, 'Ежедневки')
        ),
        new ActionRowBuilder().addComponents(
            button(`gs_hint_${userId}_trade`, 'Обмен', ButtonStyle.Primary),
            button(`gs_hint_${userId}_auction`, 'Аукцион', ButtonStyle.Primary),
            button(`gs_hint_${userId}_streak`, 'Серии'),
            button(`gs_hint_${userId}_forecast`, 'Прогноз')
        ),
        buildTopSelect(userId, 'xp', 0),
    ];
}

function buildBackButton(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gs_home_${userId}`)
            .setLabel('Назад в GS Hub')
            .setStyle(ButtonStyle.Primary)
    );
}

function buildTopButtons(userId, type, page, totalPages) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`gs_top_${userId}_${type}_${page - 1}`)
                .setLabel('Назад')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 0),

            new ButtonBuilder()
                .setCustomId(`gs_home_${userId}`)
                .setLabel('GS Hub')
                .setEmoji('🏠')
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(`gs_top_${userId}_${type}_${page + 1}`)
                .setLabel('Вперёд')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        ),

        buildTopSelect(userId, type, page),
    ];
}

async function buildHubReply(user) {
    syncCardsCatalog();

    const player = getOrCreatePlayer(user);
    const cardStats = getUserCardStats(user.id);
    const dust = getCardDust(user.id);
    const achievements = getAchievementCount(user.id);
    const requiredXP = getRequiredXP(player.level);

    const panel = await createGsDashboardPanel(user, {
        player,
        cardStats,
        dust,
        achievements,
        totalAchievements: achievementsList.length,
        requiredXP,
    });

    return {
        content: '# GS Hub',
        files: [
            new AttachmentBuilder(panel, {
                name: 'gs-hub.png',
            }),
        ],
        components: buildHubButtons(user.id),
    };
}

async function buildProfileReply(user, guild) {
    syncCardsCatalog();

    const player = getOrCreatePlayer(user);
    const member = guild
        ? await guild.members.fetch(user.id).catch(() => null)
        : null;

    attachServerDisplayName(user, member);

    const cardStats = getUserCardStats(user.id);
    const dust = getCardDust(user.id);
    const achievements = getAchievementCount(user.id);
    const requiredXP = getRequiredXP(player.level);

    const panel = await createGsProfilePanel(user, member, {
        player,
        cardStats,
        dust,
        achievements,
        totalAchievements: achievementsList.length,
        requiredXP,
    });

    return {
        content: '# 👤 GS Profile',
        files: [
            new AttachmentBuilder(panel, {
                name: 'gs-profile.png',
            }),
        ],
        components: [buildBackButton(user.id)],
    };
}

async function buildTopReply(user, type = 'xp', page = 0) {
    const safeType = topTypes[type] ? type : 'xp';

    const totalPlayers = db.prepare(`
        SELECT COUNT(*) AS count
        FROM players
    `).get().count;

    const totalPages = Math.max(1, Math.ceil(totalPlayers / TOP_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const offset = safePage * TOP_PAGE_SIZE;

    const players = getPlayersForTop(safeType, TOP_PAGE_SIZE, offset);
    const panel = await createGsTopPanel(players, safeType, {
        page: safePage + 1,
        totalPages,
        offset,
        label: topTypes[safeType].label,
    });

    return {
        content: `# ${topTypes[safeType].emoji} GS Leaderboard — ${topTypes[safeType].label}`,
        files: [
            new AttachmentBuilder(panel, {
                name: 'gs-top.png',
            }),
        ],
        components: buildTopButtons(user.id, safeType, safePage, totalPages),
    };
}

function withGsBackButton(reply, userId) {
    const backRow = buildBackButton(userId);
    const components = [...(reply.components ?? [])];

    const hasBackButton = components.some(row =>
        row.components?.some(component =>
            component.data?.custom_id === `gs_home_${userId}`
        )
    );

    if (!hasBackButton) {
        if (components.length >= 5) {
            components[components.length - 1] = backRow;
        } else {
            components.push(backRow);
        }
    }

    return {
        ...reply,
        components,
    };
}

async function buildSectionReply(user, target) {
    if (target === 'cards' && cardsCommand.buildCardsReply) {
        const reply = await cardsCommand.buildCardsReply(user, 'all', 1);
        return withGsBackButton(reply, user.id);
    }

    if (target === 'achievements' && achievementsCommand.buildAchievementsReply) {
        const reply = await achievementsCommand.buildAchievementsReply(user, 'overview', 1);

        return withGsBackButton({
            content: '# 🏅 GS Achievements',
            ...reply,
        }, user.id);
    }

    if (target === 'pack' && packCommand.buildPackReply) {
        const reply = await packCommand.buildPackReply(user);
        return withGsBackButton(reply, user.id);
    }

    if (target === 'dust' && dustCommand.buildDustReply) {
        const reply = await dustCommand.buildDustReply(user, 1);
        return withGsBackButton(reply, user.id);
    }

    if (target === 'shop' && cardshopCommand.buildShopReply) {
        const reply = await cardshopCommand.buildShopReply(user);
        return withGsBackButton(reply, user.id);
    }

    if (target === 'daily' && dailyCommand.buildDailyReply) {
        const reply = await dailyCommand.buildDailyReply(user);
        return withGsBackButton({
            content: '# 🎯 Ежедневные задания',
            ...reply,
        }, user.id);
    }

    if (target === 'streak' && streakCommand.buildStreakReply) {
        const reply = await streakCommand.buildStreakReply(user);
        return withGsBackButton({
            content: '# 🔥 Серии активности',
            ...reply,
        }, user.id);
    }

    if (target === 'forecast' && forecastCommand.buildForecastReply) {
        const reply = await forecastCommand.buildForecastReply(user);
        return withGsBackButton({
            content: '# 🔮 Предсказание дня',
            ...reply,
        }, user.id);
    }

    if (target === 'trade') {
        return {
            content: '# Обмен карточками\n\nИспользуй `/trade start`, `/trade list` или `/trade history`.',
            files: [],
            components: [buildBackButton(user.id)],
        };
    }

    if (target === 'auction') {
        return {
            content: '# Аукцион карточек\n\nИспользуй `/auction browse`, `/auction sell`, `/auction my` или `/auction history`.',
            files: [],
            components: [buildBackButton(user.id)],
        };
    }

    return {
        content: '# ⚠️ Раздел пока недоступен\n\nЭтот раздел ещё не подключён к GS Hub.',
        files: [],
        components: [buildBackButton(user.id)],
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gs')
        .setDescription('Главный центр Game Syndicate'),

    async execute(interaction) {
        await interaction.deferReply();

        const reply = await buildHubReply(interaction.user);
        return interaction.editReply(reply);
    },

    async handleComponent(interaction) {
        const parts = interaction.customId.split('_');

        if (parts[0] !== 'gs') return false;

        const action = parts[1];
        const ownerId = parts[2];

        if (interaction.user.id !== ownerId) {
            await interaction.reply({
                content: 'Это меню GS Hub открыто не для тебя.',
                ephemeral: true,
            });

            return true;
        }

        if (action === 'home') {
            const reply = await buildHubReply(interaction.user);
            await interaction.update(reply);
            return true;
        }

        if (action === 'profile') {
            const reply = await buildProfileReply(interaction.user, interaction.guild);
            await interaction.update(reply);
            return true;
        }

        if (action === 'top') {
            const type = parts[3] ?? 'xp';
            const page = Number(parts[4] ?? 0);
            const reply = await buildTopReply(interaction.user, type, page);
            await interaction.update(reply);
            return true;
        }

        if (action === 'topselect') {
            const selectedType = interaction.values?.[0] ?? 'xp';
            const reply = await buildTopReply(interaction.user, selectedType, 0);
            await interaction.update(reply);
            return true;
        }

        if (action === 'hint') {
            const target = parts[3];
            const reply = await buildSectionReply(interaction.user, target);
            await interaction.update(reply);
            return true;
        }

        return false;
    },

    buildHubReply,
    buildProfileReply,
    buildTopReply,
};
