'use strict';

/**
 * Permanent Game Syndicate RPG channels.
 * Environment variables allow moving a module without editing source files.
 */
module.exports = Object.freeze({
  guild: process.env.GUILD_HUB_CHANNEL_ID || '1530165282512044032',
  expeditions: process.env.EXPEDITION_CHANNEL_ID || '1529566430301782017',
  worldBoss: process.env.WORLD_BOSS_CHANNEL_ID || '1529226831797158130',
});
