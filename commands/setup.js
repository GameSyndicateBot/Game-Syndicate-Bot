const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder().setName('setup').setDescription('Быстрая первоначальная настройка Game Syndicate').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const owner=interaction.user.id;
    const embed=new EmbedBuilder().setColor(0x8B5CF6).setTitle('🚀 Game Syndicate • Первый запуск')
      .setDescription('Настройка занимает несколько минут. Сначала назначьте каналы, затем запустите диагностику.')
      .addFields({name:'Шаг 1',value:'Откройте Control Panel и назначьте каналы.'},{name:'Шаг 2',value:'Проверьте соединения и права через Diagnostics.'},{name:'Шаг 3',value:'Зарегистрируйте slash-команды командой `npm run deploy` после обновления.'});
    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`control:channels:${owner}`).setLabel('Начать настройку').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`control:diagnostics:${owner}`).setLabel('Диагностика').setEmoji('🩺').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({embeds:[embed],components:[row],flags:MessageFlags.Ephemeral});
  }
};
