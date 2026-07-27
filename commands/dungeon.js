'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const system = require('../services/groupDungeonSystem');
module.exports={
 data:new SlashCommandBuilder().setName('dungeon').setDescription('Групповые данжи')
  .addSubcommand(s=>s.setName('hub').setDescription('Открыть хаб групповых данжей'))
  .addSubcommand(s=>s.setName('setup').setDescription('Создать или назначить канал данжей').addChannelOption(o=>o.setName('channel').setDescription('Существующий текстовый канал'))),
 async execute(interaction){const sub=interaction.options.getSubcommand();if(sub==='setup')return system.setupChannel(interaction);await system.ensureHub(interaction.client,interaction.guildId);const cfg=require('../database/db').db.prepare('SELECT channel_id FROM dungeon_config WHERE guild_id=?').get(interaction.guildId);return interaction.reply({content:cfg?.channel_id?`🏰 Хаб данжей: <#${cfg.channel_id}>`:'Сначала администратор должен выполнить `/dungeon setup`.',ephemeral:true});},
 handleComponent:system.handle,
};
