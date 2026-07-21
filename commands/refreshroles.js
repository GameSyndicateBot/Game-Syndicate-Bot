const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const achievements = require('../data/achievements.json');
const { db, updatePlayer } = require('../database/db');
const { grantAchievementRoles } = require('../utils/grantAchievementRoles');
const { grantCategoryRoles } = require('../utils/grantCategoryRoles');

function canUse(interaction) {
    return (
        interaction.user.id === process.env.BOT_OWNER_ID ||
        interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('refreshroles')
        .setDescription('Пересчитать достижения/AP и обновить роли игроков')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!canUse(interaction)) {
            return interaction.reply({
                content: '❌ Команда доступна только админам и владельцу бота.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        const validIds = new Set(achievements.map(a => a.id));
        const pointsById = new Map(
            achievements.map(a => [a.id, a.points ?? 0])
        );

        const allUnlocked = db.prepare(`
            SELECT user_id, achievement_id
            FROM player_achievements
        `).all();

        const deleteOldAchievement = db.prepare(`
            DELETE FROM player_achievements
            WHERE user_id = ? AND achievement_id = ?
        `);

        let removedOld = 0;
        const achievementsByUser = new Map();

        const cleanupTransaction = db.transaction(() => {
            for (const row of allUnlocked) {
                if (!validIds.has(row.achievement_id)) {
                    deleteOldAchievement.run(row.user_id, row.achievement_id);
                    removedOld++;
                    continue;
                }

                if (!achievementsByUser.has(row.user_id)) {
                    achievementsByUser.set(row.user_id, []);
                }
                achievementsByUser.get(row.user_id).push(row.achievement_id);
            }
        });
        cleanupTransaction();

        const players = db.prepare(`
            SELECT *
            FROM players
        `).all();

        let updatedPlayers = 0;
        let skippedPlayers = 0;

        for (let player of players) {
            const achievementIds = achievementsByUser.get(player.user_id) ?? [];

            player.achievements = achievementIds.length;
            player.achievement_points = achievementIds.reduce((sum, id) => {
                return sum + (pointsById.get(id) ?? 0);
            }, 0);

            const member = await interaction.guild.members
                .fetch(player.user_id)
                .catch(() => null);

            if (!member) {
                updatePlayer(player);
                skippedPlayers++;
                continue;
            }

            player.username = require('../utils/displayName').getServerDisplayName(member, member.user);

            updatePlayer(player);

            await grantAchievementRoles(member, player);
            await grantCategoryRoles(member, { silent: true });

            updatedPlayers++;
        }

        return interaction.editReply({
            content:
`✅ Синхронизация завершена.

👥 Обновлено игроков: **${updatedPlayers}**
⏭ Пропущено не на сервере: **${skippedPlayers}**
🧹 Удалено старых достижений из БД: **${removedOld}**`,
        });
    }
};