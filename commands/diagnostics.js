const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { diagnosticsEmbed } = require('./control');
module.exports={data:new SlashCommandBuilder().setName('diagnostics').setDescription('Проверить готовность бота и настройки').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),async execute(interaction){await interaction.reply({embeds:[diagnosticsEmbed(interaction)],flags:MessageFlags.Ephemeral});}};
