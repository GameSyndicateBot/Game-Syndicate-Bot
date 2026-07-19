const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags} = require('discord.js');
const { setSetting } = require('../telegram/ecosystemDb');
module.exports={data:new SlashCommandBuilder().setName('setgatherchannel').setDescription('Назначить этот канал для Game Lobby').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),async execute(interaction){setSetting('discord_gatherings_channel_id',interaction.channelId);await interaction.reply({content:'✅ Этот канал назначен для Game Lobby (Discord + Telegram).',flags: MessageFlags.Ephemeral});}};
