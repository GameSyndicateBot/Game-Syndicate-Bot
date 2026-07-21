async function grantAchievementRoles(member, player) {
    if (!member || !member.roles) return;

    const rewards = [
        { count: 15, roleId: process.env.ACHIEVEMENT_ROLE_15 },
        { count: 30, roleId: process.env.ACHIEVEMENT_ROLE_30 },
        { count: 45, roleId: process.env.ACHIEVEMENT_ROLE_45 },
        { count: 60, roleId: process.env.ACHIEVEMENT_ROLE_60 },
        { count: 75, roleId: process.env.ACHIEVEMENT_ROLE_75 },
        { count: 82, roleId: process.env.ACHIEVEMENT_ROLE_82 },
    ];

    const achievementCount = player.achievements ?? 0;

    for (const reward of rewards) {
        if (!reward.roleId) continue;
        if (achievementCount < reward.count) continue;
        if (member.roles.cache.has(reward.roleId)) continue;

        await member.roles.add(reward.roleId);
    }
}

module.exports = {
    grantAchievementRoles,
};