const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getGuildSetting } = require('../utils/guildSettings');

const REQUIRED_CHANNELS = [
  ['logs_channel_id', 'Логи'],
  ['achievements_channel_id', 'Достижения'],
  ['welcome_channel_id', 'Приветствия'],
  ['quick_event_channel_id', 'Quick Event'],
  ['lucky_day_channel_id', 'Lucky Day'],
  ['gatherings_channel_id', 'Game Lobby'],
  ['backup_channel_id', 'Бэкапы'],
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Настройка действующего сервера Game Syndicate')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const owner = interaction.user.id;
    const configured = REQUIRED_CHANNELS.filter(([key]) => getGuildSetting(interaction.guildId, key));
    const missing = REQUIRED_CHANNELS.filter(([key]) => !getGuildSetting(interaction.guildId, key));

    const embed = new EmbedBuilder()
      .setColor(missing.length ? 0xF59E0B : 0x22C55E)
      .setTitle('⚙️ Game Syndicate • Настройка сервера')
      .setDescription(
        missing.length
          ? 'Откройте панель и назначьте недостающие каналы. Существующие данные и настройки при этом не сбрасываются.'
          : 'Основные серверные каналы настроены. Запустите диагностику для проверки доступа бота.'
      )
      .addFields(
        { name: 'Настроено', value: `${configured.length}/${REQUIRED_CHANNELS.length}`, inline: true }
        { name: 'Не настроено', value: missing.length ? missing.map(([, name]) => `• ${name}`).join('\n') : 'Нет', inline: false }
        { name: 'Важно', value: 'Команда не очищает базу, карточки, Dust, достижения, Discord- или Telegram-данные.', inline: false }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`control:channels:${owner}`)
        .setLabel('Настроить каналы')
        .setEmoji('📡')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`control:diagnostics:${owner}`)
        .setLabel('Диагностика')
        .setEmoji('🩺')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  }
};
