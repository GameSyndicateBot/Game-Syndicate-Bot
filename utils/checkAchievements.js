const ACHIEVEMENT_DUST = { common: 5, rare: 10, epic: 20, legendary: 35, mythic: 60 };

const { AttachmentBuilder } = require('discord.js');
const achievements = require('../data/achievements.json');

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

db.exec(`
    CREATE TABLE IF NOT EXISTS achievement_dust_rewards (
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        dust INTEGER NOT NULL,
        claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, achievement_id)
    );
`);

function grantAchievementDust(userId, achievementId, rarity) {
    const dust = ACHIEVEMENT_DUST[String(rarity || 'common').toLowerCase()] ?? 5;
    const result = db.prepare(`
        INSERT OR IGNORE INTO achievement_dust_rewards(user_id, achievement_id, dust)
        VALUES (?, ?, ?)
    `).run(userId, achievementId, dust);
    if (!result.changes) return 0;
    addCardDust(userId, dust);
    return dust;
}

function getServerDays(member) {
    if (!member || !member.joinedTimestamp) return 0;

    const diffMs = Date.now() - member.joinedTimestamp;
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
            return (streak?.current ?? 0) >= achievement.target;
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

        default:
            return false;
    }
}

async function sendAchievementMessage(message, achievement, dustReward = 0) {
    const card = await createAchievementCard(message.author, { ...achievement, dustReward });

    const attachment = new AttachmentBuilder(card, {
        name: 'achievement.png',
    });

    const achievementChannel = await message.guild.channels.fetch(
        process.env.ACHIEVEMENTS_CHANNEL_ID
    );

    if (!achievementChannel) return;

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
            const dustReward = ACHIEVEMENT_DUST[String(achievement.rarity ?? 'common').toLowerCase()] ?? 5;
            addCardDust(player.user_id, dustReward);

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