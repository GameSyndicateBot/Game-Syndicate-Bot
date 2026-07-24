// PATCHED: achievement notification duplicate protection prepared
const { AttachmentBuilder } = require('discord.js');
const { getGuildSetting } = require('./guildSettings');
const achievements = require('../data/achievements.json');
const {
    calculateAchievementDust,
    grantAchievementDust,
    rebalancePreviouslyUnlockedAchievements,
} = require('./achievementDustEconomy');

const {
    db,
    unlockAchievement,
    addCardDust,
    getPlayerAchievementIds,
    updatePlayer,
    getUserStreak,
} = require('../database/db');

const { addXP } = require('./levelSystem');
const { createAchievementCard } = require('../images/achievements/createAchievementCard');
const { grantAchievementRoles } = require('./grantAchievementRoles');
const { grantCategoryRoles } = require('./grantCategoryRoles');
const { getEffectiveJoinedTimestamp } = require('./memberJoinOverrides');
const { isCardCollectionAchievementCompleted } = require('./cardCollectionProgress');

try {
    const migration = rebalancePreviouslyUnlockedAchievements();

    if (migration.applied) {
        console.log(
            `[Achievements] Dust v2: доплачено ${migration.dustDistributed} Dust ` +
            `${migration.usersUpdated} участникам за ` +
            `${migration.achievementsUpdated} достижений.`
        );
    }
} catch (error) {
    console.error('[Achievements] Ошибка перерасчёта Dust:', error);
}

function getServerDays(member) {
    const joinedTimestamp = getEffectiveJoinedTimestamp(member);
    if (!joinedTimestamp) return 0;

    const diffMs = Date.now() - joinedTimestamp;
    return Math.floor(diffMs / 1000 / 60 / 60 / 24);
}

function getDailyClaimedQuests(userId) {
    const row = db.prepare(`
        SELECT COALESCE(SUM(claimed_quests), 0) AS total
        FROM daily_history
        WHERE user_id = ?
    `).get(userId);

    return row?.total ?? 0;
}

function getDailyFullDays(userId) {
    const row = db.prepare(`
        SELECT COUNT(*) AS total
        FROM daily_history
        WHERE user_id = ?
        AND bonus_claimed = 1
    `).get(userId);

    return row?.total ?? 0;
}

function getDailyXpEarned(userId) {
    const row = db.prepare(`
        SELECT COALESCE(SUM(xp_earned), 0) AS total
        FROM daily_history
        WHERE user_id = ?
    `).get(userId);

    return row?.total ?? 0;
}


function getQuickEventStats(userId) {
    const row = db.prepare(`
        SELECT total_wins, best_streak, types_json
        FROM quick_event_player_stats
        WHERE user_id = ?
    `).get(userId);

    let uniqueTypes = 0;

    try {
        uniqueTypes = new Set(JSON.parse(row?.types_json || '[]')).size;
    } catch {
        uniqueTypes = 0;
    }

    return {
        totalWins: Number(row?.total_wins || 0),
        bestStreak: Number(row?.best_streak || 0),
        uniqueTypes,
    };
}


function getGuildHeroStats(userId) {
    const hero = db.prepare(`SELECT level FROM heroes WHERE user_id = ?`).get(userId);
    const maxClass = db.prepare(`SELECT COALESCE(MAX(level), 0) AS value FROM hero_class_progress WHERE user_id = ?`).get(userId)?.value || 0;
    const trainedClasses = db.prepare(`SELECT COUNT(*) AS value FROM hero_class_progress WHERE user_id = ? AND level >= 2`).get(userId)?.value || 0;
    const crafts = db.prepare(`SELECT COUNT(*) AS value FROM hero_crafting_history WHERE user_id = ?`).get(userId)?.value || 0;
    const upgrades = db.prepare(`SELECT COUNT(*) AS value FROM hero_upgrade_history WHERE user_id = ? AND success = 1`).get(userId)?.value || 0;
    const consumables = db.prepare(`SELECT COUNT(*) AS value FROM hero_consumable_history WHERE user_id = ?`).get(userId)?.value || 0;
    const companions = db.prepare(`SELECT COUNT(*) AS value FROM hero_companions WHERE user_id = ?`).get(userId)?.value || 0;
    const artifacts = db.prepare(`SELECT COUNT(*) AS value FROM hero_artifacts WHERE user_id = ?`).get(userId)?.value || 0;

    return {
        heroCreated: hero ? 1 : 0,
        heroLevel: Number(hero?.level || 0),
        maxClassLevel: Number(maxClass),
        trainedClasses: Number(trainedClasses),
        crafts: Number(crafts),
        successfulUpgrades: Number(upgrades),
        consumables: Number(consumables),
        companions: Number(companions),
        artifacts: Number(artifacts),
    };
}

function getExpeditionAchievementStats(userId) {
    const rows = db.prepare(`
        SELECT location_key, result_json
        FROM hero_expeditions
        WHERE user_id = ? AND status = 'resolved'
    `).all(userId);

    let great = 0;
    const uniqueLocations = new Set();

    for (const row of rows) {
        if (row.location_key) uniqueLocations.add(row.location_key);
        try {
            const result = JSON.parse(row.result_json || '{}');
            if (result?.outcome === 'great') great++;
        } catch (_) {}
    }

    const minibossWins = db.prepare(`
        SELECT COUNT(*) AS value
        FROM miniboss_kills
        WHERE user_id = ? AND outcome = 'victory'
    `).get(userId)?.value || 0;

    return {
        completed: rows.length,
        great,
        uniqueLocations: uniqueLocations.size,
        minibossWins: Number(minibossWins),
    };
}

function isAchievementCompleted(achievement, player, member) {
    const now = new Date();

    switch (achievement.type) {
        case 'messages':
            return player.messages >= achievement.target;

        case 'level':
            return player.level >= achievement.target;

        case 'server_days':
            return getServerDays(member) >= achievement.target;

        case 'voice_seconds':
            return (player.voice_seconds ?? 0) >= achievement.target;

        case 'achievements_count':
            return (player.achievements ?? 0) >= achievement.target;

        case 'xp_current':
            return player.xp >= achievement.target;

        case 'given_reactions':
            return (player.given_reactions ?? 0) >= achievement.target;

        case 'received_reactions':
            return (player.received_reactions ?? 0) >= achievement.target;

        case 'night_message': {
            const hour = now.getHours();
            return hour >= 0 && hour < 6;
        }

        case 'morning_message': {
            const hour = now.getHours();
            return hour >= 6 && hour < 10;
        }

        case 'weekend_message': {
            const day = now.getDay();
            return day === 0 || day === 6;
        }

        case 'combo_level_voice':
            return player.level >= 10 && (player.voice_seconds ?? 0) >= 36000;

        case 'combo_chat_voice':
            return player.messages >= 1000 && (player.voice_seconds ?? 0) >= 180000;

        case 'event_count':
            return (player.events_count ?? 0) >= achievement.target;

        case 'streak': {
            const streak = getUserStreak(player.user_id, achievement.streak_type);
            return Math.max(streak?.current ?? 0, streak?.best ?? 0) >= achievement.target;
        }

        case 'daily_claimed_quests':
            return getDailyClaimedQuests(player.user_id) >= achievement.target;

        case 'daily_full_days':
            return getDailyFullDays(player.user_id) >= achievement.target;

        case 'daily_xp_earned':
            return getDailyXpEarned(player.user_id) >= achievement.target;

        case 'quick_event_wins':
            return getQuickEventStats(player.user_id).totalWins >= achievement.target;

        case 'quick_event_best_streak':
            return getQuickEventStats(player.user_id).bestStreak >= achievement.target;

        case 'quick_event_unique_types':
            return getQuickEventStats(player.user_id).uniqueTypes >= achievement.target;


        case 'guild_hero_created':
            return getGuildHeroStats(player.user_id).heroCreated >= achievement.target;

        case 'guild_hero_level':
            return getGuildHeroStats(player.user_id).heroLevel >= achievement.target;

        case 'guild_max_class_level':
            return getGuildHeroStats(player.user_id).maxClassLevel >= achievement.target;

        case 'guild_trained_classes':
            return getGuildHeroStats(player.user_id).trainedClasses >= achievement.target;

        case 'guild_crafts':
            return getGuildHeroStats(player.user_id).crafts >= achievement.target;

        case 'guild_successful_upgrades':
            return getGuildHeroStats(player.user_id).successfulUpgrades >= achievement.target;

        case 'guild_consumables':
            return getGuildHeroStats(player.user_id).consumables >= achievement.target;

        case 'guild_companions':
            return getGuildHeroStats(player.user_id).companions >= achievement.target;

        case 'guild_artifacts':
            return getGuildHeroStats(player.user_id).artifacts >= achievement.target;

        case 'expeditions_completed':
            return getExpeditionAchievementStats(player.user_id).completed >= achievement.target;

        case 'expeditions_great':
            return getExpeditionAchievementStats(player.user_id).great >= achievement.target;

        case 'expeditions_unique_locations':
            return getExpeditionAchievementStats(player.user_id).uniqueLocations >= achievement.target;

        case 'expedition_miniboss_wins':
            return getExpeditionAchievementStats(player.user_id).minibossWins >= achievement.target;

        case 'card_rarity_complete':
        case 'boss_pack_type_complete':
        case 'boss_pack_complete':
        case 'all_cards_complete':
            return isCardCollectionAchievementCompleted(player.user_id, achievement);

        default:
            return false;
    }
}

async function sendAchievementMessage(message, achievement, dustReward = 0) {
    const card = await createAchievementCard(message.author, { ...achievement, dustReward });

    const attachment = new AttachmentBuilder(card, {
        name: 'achievement.png',
    });

    const channelId = getGuildSetting(
        message.guild.id,
        'achievements_channel_id',
        process.env.ACHIEVEMENTS_CHANNEL_ID
    );
    if (!channelId) return;

    const achievementChannel = await message.guild.channels.fetch(channelId).catch(() => null);
    if (!achievementChannel || typeof achievementChannel.send !== 'function') return;

    await achievementChannel.send({
        content:
`# 🏆 Новое достижение!

Поздравляем ${message.author} с получением достижения **«${achievement.title}»**!
Награда: **+${dustReward} GS Dust**.`,
        files: [attachment],
    });
}

async function checkAchievements({ message, player, member }) {
    const unlockedAchievements = [];

    const unlockedSet = new Set(getPlayerAchievementIds(player.user_id));
    player.achievements = unlockedSet.size;

    let unlockedSomething = true;

    while (unlockedSomething) {
        unlockedSomething = false;

        for (const achievement of achievements) {
            if (unlockedSet.has(achievement.id)) continue;
            if (!isAchievementCompleted(achievement, player, member)) continue;

            const unlocked = unlockAchievement(player.user_id, achievement.id);
            if (!unlocked) continue;

            unlockedSet.add(achievement.id);
            unlockedSomething = true;

            player.achievements = unlockedSet.size;
            player.achievement_points =
                (player.achievement_points ?? 0) + (achievement.points ?? 0);

            player = addXP(player, achievement.xp ?? 0);

            const dustResult = grantAchievementDust(
                player.user_id,
                achievement
            );
            const dustReward = Number(dustResult.granted || 0);

            // grantAchievementDust() увеличивает Dust напрямую в SQLite.
            // Ниже updatePlayer(player) сохраняет весь объект игрока, поэтому
            // обязательно синхронизируем его локальное значение, чтобы старый
            // card_dust не затёр только что начисленную награду.
            if (dustReward > 0) {
                player.card_dust =
                    Number(player.card_dust || 0) + dustReward;

                console.log(
                    `[Achievements] +${dustReward} Dust: ` +
                    `${player.user_id} -> ${achievement.id}`
                );
            } else {
                console.warn(
                    `[Achievements] Dust не начислен: ` +
                    `${player.user_id} -> ${achievement.id}; ` +
                    `alreadyGranted=${Boolean(dustResult.alreadyGranted)}`
                );
            }

            unlockedAchievements.push(achievement);

            await sendAchievementMessage(message, achievement, dustReward);
        }
    }

    await grantAchievementRoles(member, player);
    await grantCategoryRoles(member);

    player = updatePlayer(player);

    return {
        player,
        unlockedAchievements,
    };
}

module.exports = {
    checkAchievements,
};