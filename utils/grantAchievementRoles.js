async function grantAchievementRoles(member, player) {
    if (!member || !member.roles || !member.guild) return;

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
        if (!reward.roleId || achievementCount < reward.count) continue;
        if (member.roles.cache.has(reward.roleId)) continue;

        const role = member.guild.roles.cache.get(reward.roleId)
            || await member.guild.roles.fetch(reward.roleId).catch(() => null);

        if (!role) {
            console.warn(
                `[Achievement Roles] Роль ${reward.roleId} не существует на сервере ` +
                `${member.guild.id}; выдача за ${reward.count} достижений пропущена.`
            );
            continue;
        }

        try {
            await member.roles.add(role);
        } catch (error) {
            if (error?.code === 10011) {
                console.warn(`[Achievement Roles] Роль ${reward.roleId} была удалена; выдача пропущена.`);
                continue;
            }
            console.warn(
                `[Achievement Roles] Не удалось выдать роль ${reward.roleId} ` +
                `участнику ${member.id}: ${error.message}`
            );
        }
    }
}

module.exports = {
    grantAchievementRoles,
};
