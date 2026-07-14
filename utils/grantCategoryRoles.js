const {
    AttachmentBuilder,
} = require('discord.js');

const achievements = require('../data/achievements.json');
const { db, addCardDust } = require('../database/db');
const { createCategoryRoleCard } = require('../images/category/createCategoryRoleCard');

const categoryPrefixes = {
    messages: 'CATEGORY_MESSAGES',
    levels: 'CATEGORY_LEVELS',
    voice: 'CATEGORY_VOICE',
    reactions: 'CATEGORY_REACTIONS',
    server: 'CATEGORY_SERVER',
    events: 'CATEGORY_EVENTS',
    xp: 'CATEGORY_XP',
    daily: 'CATEGORY_DAILY',
};

const additiveCategoryPrefixes = {
    streaks: 'CATEGORY_STREAKS',
};


const CATEGORY_DUST_BY_LEVEL = [30, 60, 100, 150];

function grantCategoryDust(userId, category, roleId, roleIndex) {
    const dust = CATEGORY_DUST_BY_LEVEL[Math.min(roleIndex, CATEGORY_DUST_BY_LEVEL.length - 1)] ?? 30;
    const result = db.prepare(`
        INSERT OR IGNORE INTO category_dust_rewards(user_id, category, role_id, dust)
        VALUES (?, ?, ?, ?)
    `).run(userId, category, roleId, dust);
    if (!result.changes) return 0;
    addCardDust(userId, dust);
    return dust;
}

function getRoleIdsByPrefix(prefix) {
    const roleIds = [];

    for (let i = 1; i <= 30; i++) {
        const roleId = process.env[`${prefix}_${i}`];

        if (roleId) {
            roleIds.push(roleId);
        }
    }

    return roleIds;
}

function getCategoryRoleIds(category) {
    const prefix = categoryPrefixes[category];
    if (!prefix) return [];

    return getRoleIdsByPrefix(prefix);
}

function getAdditiveCategoryRoleIds(category) {
    const prefix = additiveCategoryPrefixes[category];
    if (!prefix) return [];

    return getRoleIdsByPrefix(prefix);
}

function getUnlockedIds(userId) {
    const rows = db.prepare(`
        SELECT achievement_id
        FROM player_achievements
        WHERE user_id = ?
    `).all(userId);

    return rows.map(row => row.achievement_id);
}

function getCategoryAchievements(category) {
    return achievements.filter(
        achievement => achievement.category === category
    );
}

function getCategoryProgress(userId, category) {
    const categoryAchievements = getCategoryAchievements(category);
    const unlockedIds = getUnlockedIds(userId);

    const unlockedCount = categoryAchievements.filter(
        achievement => unlockedIds.includes(achievement.id)
    ).length;

    return {
        total: categoryAchievements.length,
        unlocked: unlockedCount,
    };
}

async function sendCategoryRoleMessage(member, role, category, progress, dustReward = 0) {
    const channelId = process.env.ACHIEVEMENTS_CHANNEL_ID;
    if (!channelId) return;

    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || typeof channel.send !== 'function') return;

    const card = await createCategoryRoleCard(
        member.user,
        role,
        category,
        progress
    );

    const attachment = new AttachmentBuilder(card, {
        name: 'category-role.png',
    });

    await channel.send({
        content:
`# 🎖️ Новая роль категории!

Поздравляем ${member} с получением новой роли **${role.name}**!
Награда: **+${dustReward} GS Dust**.`,
        files: [attachment],
    });
}

async function grantReplaceableCategoryRoles(member, category, options = {}) {
    const roleIds = getCategoryRoleIds(category);
    if (!roleIds.length) return;

    const progress = getCategoryProgress(member.user.id, category);

    const roleIndex = progress.unlocked > 0
        ? Math.min(progress.unlocked, roleIds.length) - 1
        : null;

    const roleToAdd = roleIndex !== null
        ? roleIds[roleIndex]
        : null;

    const rolesToRemove = roleIds.filter(roleId =>
        member.roles.cache.has(roleId) && roleId !== roleToAdd
    );

    for (const roleId of rolesToRemove) {
        await member.roles.remove(roleId).catch(() => null);
    }

    if (roleToAdd && !member.roles.cache.has(roleToAdd)) {
        await member.roles.add(roleToAdd).catch(() => null);

        const role = member.guild.roles.cache.get(roleToAdd);

        const dustReward = grantCategoryDust(member.user.id, category, roleToAdd, roleIndex);
        if (role && !options.silent) {
            await sendCategoryRoleMessage(member, role, category, progress, dustReward);
        }
    }
}

async function grantAdditiveCategoryRoles(member, category, options = {}) {
    const roleIds = getAdditiveCategoryRoleIds(category);
    if (!roleIds.length) return;

    const categoryAchievements = getCategoryAchievements(category);
    const unlockedIds = getUnlockedIds(member.user.id);
    const progress = getCategoryProgress(member.user.id, category);

    const earnedRoleIds = [];

    for (let i = 0; i < categoryAchievements.length; i++) {
        const achievement = categoryAchievements[i];
        const roleId = roleIds[i];

        if (!roleId) continue;

        if (unlockedIds.includes(achievement.id)) {
            earnedRoleIds.push(roleId);
        }
    }

    const rolesToRemove = roleIds.filter(roleId =>
        member.roles.cache.has(roleId) && !earnedRoleIds.includes(roleId)
    );

    for (const roleId of rolesToRemove) {
        await member.roles.remove(roleId).catch(() => null);
    }

    for (const roleId of earnedRoleIds) {
        const roleIndex = roleIds.indexOf(roleId);
        if (member.roles.cache.has(roleId)) continue;

        await member.roles.add(roleId).catch(() => null);

        const role = member.guild.roles.cache.get(roleId);

        const dustReward = grantCategoryDust(member.user.id, category, roleId, roleIndex);
        if (role && !options.silent) {
            await sendCategoryRoleMessage(member, role, category, progress, dustReward);
        }
    }
}

async function grantCategoryRoles(member, options = {}) {
    if (!member || !member.user || member.user.bot) return;

    for (const category of Object.keys(categoryPrefixes)) {
        await grantReplaceableCategoryRoles(member, category, options);
    }

    for (const category of Object.keys(additiveCategoryPrefixes)) {
        await grantAdditiveCategoryRoles(member, category, options);
    }
}

module.exports = {
    grantCategoryRoles,
};