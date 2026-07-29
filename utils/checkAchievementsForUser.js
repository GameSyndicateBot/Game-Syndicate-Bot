'use strict';

const { getOrCreatePlayer } = require('../database/db');
const { checkAchievements } = require('./checkAchievements');

async function checkAchievementsForUser(client, guildId, userId) {
  if (!client || !guildId || !userId) return null;
  const guild = client.guilds.cache.get(String(guildId))
    || await client.guilds.fetch(String(guildId)).catch(() => null);
  if (!guild) return null;
  const member = await guild.members.fetch(String(userId)).catch(() => null);
  if (!member || member.user.bot) return null;
  const player = getOrCreatePlayer(member.user);
  return checkAchievements({
    message: { author: member.user, guild },
    player,
    member,
  });
}

async function checkAchievementsForUsers(client, guildId, userIds) {
  const uniqueIds = [...new Set((userIds || []).map(String).filter(Boolean))];
  const results = [];
  for (const userId of uniqueIds) {
    try {
      results.push(await checkAchievementsForUser(client, guildId, userId));
    } catch (error) {
      console.error(`[Achievements] event check failed for ${userId}:`, error);
    }
  }
  return results;
}

module.exports = { checkAchievementsForUser, checkAchievementsForUsers };
