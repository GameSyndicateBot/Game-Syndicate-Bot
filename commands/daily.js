const {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const {
    db,
    getOrCreatePlayer,
    updatePlayer,
    getTodayDate,
    getOrCreateDailyProgress,
    markDailyClaimed,
    updateDailyHistory,
    addCardDust,
    getCardDust,
} = require('../database/db');

const { addXP } = require('../utils/levelSystem');
const { checkAchievements } = require('../utils/checkAchievements');
const { checkpointCurrentMemberVoice } = require('../systems/voiceTrackingSystem');
const { createDailyCard } = require('../images/daily/createDailyCard');
const { openRandomCard } = require('../utils/cardSystem');

const DAILY_BONUS_XP = 150;
const DAILY_BONUS_DUST = 45;
const QUEST_DUST_BY_FIELD = { messages: 15, voice_seconds: 20, given_reactions: 10, received_reactions: 10 };
const WEEKLY_CHEST_DUST = 300;

const QUEST_POOL = [
    { key: 'messages_15', title: 'Написать 15 сообщений', icon: '💬', field: 'messages', target: 15, unit: 'count', reward_xp: 60 },
    { key: 'messages_30', title: 'Написать 30 сообщений', icon: '💬', field: 'messages', target: 30, unit: 'count', reward_xp: 100 },
    { key: 'messages_50', title: 'Написать 50 сообщений', icon: '💬', field: 'messages', target: 50, unit: 'count', reward_xp: 150 },

    { key: 'voice_15m', title: 'Провести 15 минут в голосе', icon: '🎙', field: 'voice_seconds', target: 15 * 60, unit: 'seconds', reward_xp: 80 },
    { key: 'voice_30m', title: 'Провести 30 минут в голосе', icon: '🎙', field: 'voice_seconds', target: 30 * 60, unit: 'seconds', reward_xp: 130 },
    { key: 'voice_60m', title: 'Провести 60 минут в голосе', icon: '🎙', field: 'voice_seconds', target: 60 * 60, unit: 'seconds', reward_xp: 220 },

    { key: 'given_reactions_5', title: 'Поставить 5 реакций', icon: '👍', field: 'given_reactions', target: 5, unit: 'count', reward_xp: 50 },
    { key: 'given_reactions_10', title: 'Поставить 10 реакций', icon: '👍', field: 'given_reactions', target: 10, unit: 'count', reward_xp: 90 },
    { key: 'given_reactions_15', title: 'Поставить 15 реакций', icon: '👍', field: 'given_reactions', target: 15, unit: 'count', reward_xp: 130 },

    { key: 'received_reactions_3', title: 'Получить 3 реакции', icon: '❤️', field: 'received_reactions', target: 3, unit: 'count', reward_xp: 70 },
    { key: 'received_reactions_5', title: 'Получить 5 реакций', icon: '❤️', field: 'received_reactions', target: 5, unit: 'count', reward_xp: 110 },
    { key: 'received_reactions_8', title: 'Получить 8 реакций', icon: '❤️', field: 'received_reactions', target: 8, unit: 'count', reward_xp: 160 },
].map(quest => ({ ...quest, reward_dust: QUEST_DUST_BY_FIELD[quest.field] ?? 0 }));

function seededRandom(seed) {
    let value = 0;

    for (let i = 0; i < seed.length; i++) {
        value = (value * 31 + seed.charCodeAt(i)) >>> 0;
    }

    return function random() {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

function pickPersonalQuests(userId, date) {
    const random = seededRandom(`${userId}_${date}`);
    const pool = [...QUEST_POOL];

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const selected = [];
    const usedFields = new Set();

    for (const quest of pool) {
        if (usedFields.has(quest.field)) continue;

        selected.push(quest);
        usedFields.add(quest.field);

        if (selected.length === 4) break;
    }

    return selected;
}

function getOrCreatePersonalQuests(userId) {
    const date = getTodayDate();

    const existing = db.prepare(`
        SELECT *
        FROM daily_player_quests
        WHERE user_id = ? AND date = ?
        ORDER BY slot ASC
    `).all(userId, date);

    if (existing.length === 4) return existing;

    db.prepare(`
        DELETE FROM daily_player_quests
        WHERE user_id = ? AND date = ?
    `).run(userId, date);

    const selected = pickPersonalQuests(userId, date);

    const insert = db.prepare(`
        INSERT INTO daily_player_quests
        (user_id, date, slot, quest_key, title, icon, field, target, unit, reward_xp, reward_dust, claimed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    selected.forEach((quest, index) => {
        insert.run(
            userId,
            date,
            index + 1,
            quest.key,
            quest.title,
            quest.icon,
            quest.field,
            quest.target,
            quest.unit,
            quest.reward_xp,
            quest.reward_dust
        );
    });

    return db.prepare(`
        SELECT *
        FROM daily_player_quests
        WHERE user_id = ? AND date = ?
        ORDER BY slot ASC
    `).all(userId, date);
}

function getQuestCurrent(progress, quest) {
    return progress[quest.field] ?? 0;
}

function isQuestCompleted(progress, quest) {
    return getQuestCurrent(progress, quest) >= quest.target;
}

function areAllQuestsCompleted(progress, quests) {
    return quests.every(quest => isQuestCompleted(progress, quest));
}

function areAllQuestsClaimed(quests) {
    return quests.every(quest => quest.claimed);
}

function saveDailyHistory(userId, progress, quests, xpEarned, dustEarned, bonusClaimed) {
    const completedCount = quests.filter(q =>
        isQuestCompleted(progress, q)
    ).length;

    const claimedCount = quests.filter(q => q.claimed).length;

    updateDailyHistory(userId, {
        total_quests: quests.length,
        completed_quests: completedCount,
        claimed_quests: claimedCount,
        bonus_claimed: bonusClaimed,
        xp_earned: xpEarned,
        dust_earned: dustEarned,
    });
}


function getIsoWeekRange(dateString = getTodayDate()) {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    const day = date.getUTCDay() || 7;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const keyDate = new Date(monday);
    keyDate.setUTCDate(monday.getUTCDate() + 3);
    const yearStart = new Date(Date.UTC(keyDate.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((keyDate - yearStart) / 86400000) + 1) / 7);
    return {
        weekKey: `${keyDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
        start: monday.toISOString().slice(0, 10),
        end: sunday.toISOString().slice(0, 10),
        isSunday: day === 7,
    };
}

function tryClaimWeeklyChest(userId) {
    const week = getIsoWeekRange();
    if (!week.isSunday) return null;
    const fullDays = db.prepare(`
        SELECT COUNT(*) AS count FROM daily_history
        WHERE user_id = ? AND date BETWEEN ? AND ? AND bonus_claimed = 1
    `).get(userId, week.start, week.end)?.count ?? 0;
    if (fullDays < 7) return null;
    const already = db.prepare('SELECT 1 FROM weekly_activity_rewards WHERE user_id=? AND week_key=?').get(userId, week.weekKey);
    if (already) return null;
    const drop = openRandomCard(userId, { source: 'weekly_activity_chest', allowTreasure: true });
    addCardDust(userId, WEEKLY_CHEST_DUST);
    db.prepare(`INSERT INTO weekly_activity_rewards(user_id,week_key,dust,inventory_id) VALUES(?,?,?,?)`)
        .run(userId, week.weekKey, WEEKLY_CHEST_DUST, drop.inventoryId);
    return { dust: WEEKLY_CHEST_DUST, drop };
}

async function giveXPAndCheck(interaction, xp) {
    let player = getOrCreatePlayer(interaction.user);
    const member = await interaction.guild.members.fetch(interaction.user.id);

    const levelBefore = player.level;

    player = addXP(player, xp);

    const result = await checkAchievements({
        message: {
            author: interaction.user,
            guild: interaction.guild,
        },
        player,
        member,
    });

    updatePlayer(result.player);

    return {
        player: result.player,
        levelUp: result.player.level > levelBefore,
    };
}


function hasAvailableDailyRewards(progress, quests) {
    const availableQuest = quests.some(quest =>
        !quest.claimed && isQuestCompleted(progress, quest)
    );

    const bonusAvailable =
        areAllQuestsCompleted(progress, quests) &&
        areAllQuestsClaimed(quests) &&
        !progress.claimed;

    return availableQuest || bonusAvailable;
}

function buildDailyButtons(userId, hasReward) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`daily_claim_all_${userId}`)
            .setLabel('Получить награды')
            .setEmoji('🎁')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!hasReward),

        new ButtonBuilder()
            .setCustomId(`daily_refresh_all_${userId}`)
            .setLabel('Обновить')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Primary)
    );
}

function getGsBackRowFromMessage(interaction) {
    const hasGsBack = interaction.message?.components?.some(row =>
        row.components?.some(component =>
            component.customId === `gs_home_${interaction.user.id}` ||
            component.data?.custom_id === `gs_home_${interaction.user.id}`
        )
    );

    if (!hasGsBack) return null;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gs_home_${interaction.user.id}`)
            .setLabel('Назад в GS Hub')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Primary)
    );
}

async function claimDailyRewards(interaction, slot = null) {
    const progress = getOrCreateDailyProgress(interaction.user.id);
    const quests = getOrCreatePersonalQuests(interaction.user.id);

    let totalReward = 0;
    let totalDust = 0;
    let streakDust = 0;
    const claimedSlots = [];

    const questsToCheck = slot
        ? quests.filter(quest => quest.slot === slot)
        : quests;

    for (const quest of questsToCheck) {
        if (quest.claimed) continue;
        if (!isQuestCompleted(progress, quest)) continue;

        db.prepare(`
            UPDATE daily_player_quests
            SET claimed = 1
            WHERE user_id = ? AND date = ? AND slot = ?
        `).run(interaction.user.id, getTodayDate(), quest.slot);

        totalReward += quest.reward_xp;
        totalDust += Number(quest.reward_dust) > 0 ? Number(quest.reward_dust) : (QUEST_DUST_BY_FIELD[quest.field] ?? 0);
        claimedSlots.push(quest.slot);
    }

    let updatedQuests = getOrCreatePersonalQuests(interaction.user.id);
    let bonusClaimed = false;

    if (
        areAllQuestsCompleted(progress, updatedQuests) &&
        areAllQuestsClaimed(updatedQuests) &&
        !progress.claimed
    ) {
        const streakResult = markDailyClaimed(interaction.user.id);
        streakDust = streakResult?.dustReward ?? 0;
        totalReward += DAILY_BONUS_XP;
        totalDust += DAILY_BONUS_DUST;
        bonusClaimed = true;
    }

    updatedQuests = getOrCreatePersonalQuests(interaction.user.id);

    saveDailyHistory(
        interaction.user.id,
        progress,
        updatedQuests,
        totalReward,
        totalDust,
        bonusClaimed || Boolean(progress.claimed)
    );

    if (totalDust > 0) addCardDust(interaction.user.id, totalDust);
    const weeklyChest = bonusClaimed ? tryClaimWeeklyChest(interaction.user.id) : null;

    return {
        totalReward,
        totalDust,
        streakDust,
        weeklyChest,
        claimedSlots,
        bonusClaimed,
        slot,
    };
}

async function buildDailyReply(user) {
    const progress = getOrCreateDailyProgress(user.id);
    const quests = getOrCreatePersonalQuests(user.id);
    const hasReward = hasAvailableDailyRewards(progress, quests);

    const card = await createDailyCard(
        user,
        progress,
        quests,
        DAILY_BONUS_XP,
        DAILY_BONUS_DUST
    );

    return {
        files: [
            new AttachmentBuilder(card, {
                name: 'daily.png',
            }),
        ],
        components: [
            buildDailyButtons(user.id, hasReward),
        ],
    };
}
module.exports = {
    buildDailyReply,

data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Ежедневные задания')
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Показать ежедневные задания')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('claim')
                .setDescription('Забрать награду')
                .addIntegerOption(option =>
                    option
                        .setName('slot')
                        .setDescription('Номер задания от 1 до 4. Если не указать — заберёт всё доступное.')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(4)
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
        await checkpointCurrentMemberVoice(member);

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'show') {
            const progress = getOrCreateDailyProgress(interaction.user.id);
            const quests = getOrCreatePersonalQuests(interaction.user.id);

            saveDailyHistory(interaction.user.id, progress, quests, 0, 0, Boolean(progress.claimed));

            const reply = await buildDailyReply(interaction.user);
            return interaction.editReply(reply);
        }

        if (subcommand === 'claim') {
            const slot = interaction.options.getInteger('slot');
            const result = await claimDailyRewards(interaction, slot);
            const reply = await buildDailyReply(interaction.user);

            if (result.totalReward <= 0 && result.totalDust <= 0) {
                return interaction.editReply({
                    content: slot
                        ? `Задание №${slot} ещё не выполнено или награда уже получена.`
                        : 'Нет доступных наград для получения.',
                    files: reply.files,
                    components: reply.components,
                });
            }

            await giveXPAndCheck(interaction, result.totalReward);
            const extras = [];
            if (result.bonusClaimed) extras.push('Бонус дня получен.');
            if (result.streakDust) extras.push(`Награда за серию: +${result.streakDust} GS Dust.`);
            if (result.weeklyChest) extras.push(`Недельный сундук: +${result.weeklyChest.dust} GS Dust и ${result.weeklyChest.drop.rarityName} ${result.weeklyChest.drop.card.name}.`);

            return interaction.editReply({
                content: `Награда получена: **+${result.totalReward} XP** и **+${result.totalDust} GS Dust**.\n${extras.join('\n')}`,
                files: reply.files,
                components: reply.components,
            });
        }
    },

    async handleComponent(interaction) {
        const parts = interaction.customId.split('_');

        if (parts[0] !== 'daily') return false;

        const action = parts[1];
        const ownerId = parts[3];

        if (interaction.user.id !== ownerId) {
            await interaction.reply({
                content: 'Эти ежедневные задания открыты не для тебя.',
                ephemeral: true,
            });

            return true;
        }


        if (action === 'refresh' && parts[2] === 'all') {
            await interaction.deferUpdate();

            const member = await interaction.guild.members
                .fetch(interaction.user.id)
                .catch(() => interaction.member);

            // Добавляет время активной голосовой сессии перед пересчётом панели.
            await checkpointCurrentMemberVoice(member);

            const progress = getOrCreateDailyProgress(interaction.user.id);
            const quests = getOrCreatePersonalQuests(interaction.user.id);

            saveDailyHistory(
                interaction.user.id,
                progress,
                quests,
                0,
                0,
                Boolean(progress.claimed)
            );

            const reply = await buildDailyReply(interaction.user);
            const gsBackRow = getGsBackRowFromMessage(interaction);
            const components = [...(reply.components ?? [])];

            if (gsBackRow) {
                components.push(gsBackRow);
            }

            return interaction.editReply({
                content: '# Ежедневные задания\n\nИнформация обновлена.',
                files: reply.files,
                components,
            });
        }

        if (action === 'claim' && parts[2] === 'all') {
            await interaction.deferUpdate();

            const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
            await checkpointCurrentMemberVoice(member);

            const result = await claimDailyRewards(interaction, null);
            const reply = await buildDailyReply(interaction.user);

            const gsBackRow = getGsBackRowFromMessage(interaction);
            const components = [...(reply.components ?? [])];

            if (gsBackRow) {
                components.push(gsBackRow);
            }

            if (result.totalReward <= 0 && result.totalDust <= 0) {
                return interaction.editReply({
                    content: '# 🎯 Ежедневные задания\n\n❌ Нет доступных наград для получения.',
                    files: reply.files,
                    components,
                });
            }

            await giveXPAndCheck(interaction, result.totalReward);

            return interaction.editReply({
                content:
`# 🎯 Ежедневные задания

✅ Награда получена: **+${result.totalReward} XP** и **+${result.totalDust} GS Dust**

${result.claimedSlots.length ? `Забраны задания: **${result.claimedSlots.join(', ')}**` : ''}
${result.bonusClaimed ? 'Бонус дня тоже получен!' : ''}
${result.streakDust ? `Награда за серию: **+${result.streakDust} GS Dust**` : ''}
${result.weeklyChest ? `Недельный сундук: **+${result.weeklyChest.dust} GS Dust** и карта **${result.weeklyChest.drop.card.name}**` : ''}`,
                files: reply.files,
                components,
            });
        }

        return false;
    }
};