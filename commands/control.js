const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags,
} = require('discord.js');
const { getGuildSetting, setGuildSetting } = require('../utils/guildSettings');

const CHANNELS = {
  logs_channel_id: ['📋 Логи сервера', 'Канал системных и модераторских логов'],
  achievements_channel_id: ['🏆 Достижения', 'Публикация новых достижений'],
  welcome_channel_id: ['👋 Приветствия', 'Приветствие новых участников'],
  quick_event_channel_id: ['⚡ Quick Event', 'Канал быстрых событий'],
  lucky_day_channel_id: ['🎁 Lucky Day', 'Ежедневный розыгрыш'],
  gatherings_channel_id: ['🎮 Game Lobby', 'Канал публикации игровых лобби из Discord и Telegram'],
  backup_channel_id: ['🛡️ Бэкапы', 'Канал резервных копий базы'],
};

function ownerSuffix(interaction) { return interaction.user.id; }
function id(type, owner, extra='') { return `control:${type}:${owner}${extra ? `:${extra}` : ''}`; }
function isOwner(interaction, owner) { return interaction.user.id === owner; }

function mainEmbed(interaction) {
  const configured = Object.keys(CHANNELS).filter(k => getGuildSetting(interaction.guildId, k)).length;
  return new EmbedBuilder().setColor(0x8B5CF6).setTitle('🏴 GAME SYNDICATE • CONTROL PANEL')
    .setDescription('Настройка действующего сервера без редактирования кода и без сброса данных.')
    .addFields(
      { name: '📡 Каналы', value: `${configured}/${Object.keys(CHANNELS).length} настроено`, inline: true },
      { name: '🧰 Управление', value: 'Доступно администраторам', inline: true },
      { name: '🚀 Быстрый старт', value: 'Откройте «Каналы» и назначьте основные точки публикации.', inline: false },
    ).setFooter({ text: 'Game Syndicate • Server Control' });
}

function mainRows(owner) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('channels', owner)).setLabel('Каналы').setEmoji('📡').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('diagnostics', owner)).setLabel('Диагностика').setEmoji('🩺').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('refresh', owner)).setLabel('Обновить').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('rebuildexpedition', owner)).setLabel('Пересоздать хаб экспедиций').setEmoji('🗺️').setStyle(ButtonStyle.Danger),
  )];
}

function channelsEmbed(interaction) {
  const lines = Object.entries(CHANNELS).map(([key, [name]]) => {
    const value = getGuildSetting(interaction.guildId, key);
    return `${value ? '✅' : '⚪'} ${name}: ${value ? `<#${value}>` : 'не настроено'}`;
  });
  return new EmbedBuilder().setColor(0x8B5CF6).setTitle('📡 Настройка каналов').setDescription(lines.join('\n'))
    .setFooter({ text: 'Выберите назначение, затем укажите канал' });
}

function channelRows(owner) {
  const buttons = Object.entries(CHANNELS).map(([key,[name]]) => new ButtonBuilder()
    .setCustomId(id('pick', owner, key)).setLabel(name.replace(/^\S+\s/, '').slice(0, 80)).setStyle(ButtonStyle.Secondary));
  const rows=[];
  for(let i=0;i<buttons.length;i+=4) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i,i+4)));
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id('home', owner)).setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Primary)));
  return rows;
}

function diagnosticsEmbed(interaction) {
  const checks = Object.entries(CHANNELS).map(([key,[name]]) => {
    const channelId=getGuildSetting(interaction.guildId,key);
    const channel=channelId ? interaction.guild.channels.cache.get(channelId) : null;
    return `${channel?.isTextBased?.() ? '✅' : channelId ? '❌' : '⚠️'} ${name}${channelId ? ` — ${channel ? `<#${channelId}>` : 'канал не найден'}` : ' — не настроено'}`;
  });
  checks.unshift('✅ SQLite — подключена', `✅ Discord — ${interaction.client.user.tag}`, `${process.env.TELEGRAM_BOT_TOKEN ? '✅' : '⚠️'} Telegram token — ${process.env.TELEGRAM_BOT_TOKEN ? 'задан' : 'не задан'}`);
  return new EmbedBuilder().setColor(0x8B5CF6).setTitle('🩺 GS Diagnostics').setDescription(checks.join('\n')).setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder().setName('control').setDescription('Панель управления Game Syndicate')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.reply({ embeds:[mainEmbed(interaction)], components:mainRows(ownerSuffix(interaction)), flags:MessageFlags.Ephemeral });
  },
  async handleComponent(interaction) {
    const parts=interaction.customId.split(':'); const type=parts[1], owner=parts[2], extra=parts[3];
    if(!isOwner(interaction,owner)) return interaction.reply({content:'Откройте собственную панель командой `/control`.',flags:MessageFlags.Ephemeral});
    if(type==='home'||type==='refresh') return interaction.update({embeds:[mainEmbed(interaction)],components:mainRows(owner)});
    if(type==='channels') return interaction.update({embeds:[channelsEmbed(interaction)],components:channelRows(owner)});
    if(type==='diagnostics') return interaction.update({embeds:[diagnosticsEmbed(interaction)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id('home',owner)).setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Primary))]});
    if(type==='rebuildexpedition') {
      await interaction.deferUpdate();
      const result = await require('./expedition').rebuildExpeditionHub(interaction.client);
      const embed = new EmbedBuilder()
        .setColor(result.ok ? 0x22C55E : 0xEF4444)
        .setTitle(result.ok ? '✅ Expedition Hub пересоздан' : '❌ Не удалось пересоздать Expedition Hub')
        .setDescription(result.ok
          ? `Создано новое публичное сообщение в <#${require('./expedition').EXPEDITION_CHANNEL_ID}>.\nУдалено старых хабов: **${result.deleted}**.\nНовый ID: \`${result.message.id}\`.`
          : 'Проверьте доступ бота к каналу, разрешения **Просматривать канал**, **Отправлять сообщения**, **Прикреплять файлы**, **Управлять сообщениями** и логи запуска.')
        .setTimestamp();
      return interaction.editReply({ embeds:[embed], components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id('home',owner)).setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Primary))] });
    }
    if(type==='pick') {
      const meta=CHANNELS[extra]; if(!meta) return interaction.reply({content:'Неизвестная настройка.',flags:MessageFlags.Ephemeral});
      const select=new ChannelSelectMenuBuilder().setCustomId(id('save',owner,extra)).setPlaceholder(`Выберите: ${meta[0]}`).setChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1);
      return interaction.update({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(meta[0]).setDescription(meta[1])],components:[new ActionRowBuilder().addComponents(select),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id('channels',owner)).setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary))]});
    }
    if(type==='save' && interaction.isChannelSelectMenu()) {
      const channelId=interaction.values[0]; setGuildSetting(interaction.guildId,extra,channelId,interaction.user.id);
      // Compatibility with the existing Telegram game-lobby settings table.
      if(extra==='gatherings_channel_id') {
        try { require('../telegram/ecosystemDb').setSetting('discord_gatherings_channel_id',channelId); } catch(_) {}
      }
      if(extra==='lucky_day_channel_id') {
        try { require('../services/luckyDay').setConfiguredChannel(interaction.guildId, channelId); } catch(_) {}
      }
      if(extra==='quick_event_channel_id') {
        try { require('../systems/quickEventSystem').setConfiguredChannel(interaction.guildId, channelId); } catch(_) {}
      }
      return interaction.update({embeds:[channelsEmbed(interaction)],components:channelRows(owner)});
    }
  },
  diagnosticsEmbed, mainEmbed, mainRows,
};
