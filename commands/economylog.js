const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { getEconomyLog } = require('../services/economyService');

const ICONS = { dust: '💎', material: '📦', item: '🎒', chest: '🎁', companion: '🐾' };
const PERSONAL_PAGE_SIZE = 8;

function formatDate(value) {
  const raw = String(value || '');
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? raw : `<t:${Math.floor(d.getTime() / 1000)}:f>`;
}
function parseMeta(row) {
  try { return JSON.parse(row.metadata_json || '{}') || {}; } catch (_) { return {}; }
}
function iconFor(row, meta = {}) {
  if (row.asset_type === 'companion') return meta.kind === 'mount' ? '🐎' : '🐾';
  return ICONS[row.asset_type] || '📦';
}
function assetLabel(row) {
  return row.asset_name || row.asset_key || 'Неизвестное имущество';
}
function globalLine(row) {
  const meta = parseMeta(row);
  const sign = Number(row.delta) >= 0 ? '+' : '';
  const kind = meta.kind === 'mount' ? 'маунт' : meta.kind === 'pet' ? 'питомец' : row.asset_type;
  return `${iconFor(row, meta)} <@${row.user_id}> • **${sign}${row.delta} ${assetLabel(row)}** · ${kind || 'имущество'}\n↳ **${row.reason}** · ${formatDate(row.created_at)}`;
}
function personalEntry(row) {
  const meta = parseMeta(row);
  const sign = Number(row.delta) >= 0 ? '+' : '';
  const details = [
    meta.kind ? `Тип: **${meta.kind === 'mount' ? 'Маунт (ездовой)' : 'Питомец'}**` : null,
    meta.rarity ? `Редкость: **${meta.rarity}**` : null,
    meta.slot ? `Слот: **${meta.slot}**` : null,
    meta.level != null ? `Уровень: **${meta.level}**` : null,
    meta.description ? `Описание: ${String(meta.description).slice(0, 280)}` : null,
    meta.bonuses && meta.bonuses !== '{}' ? `Характеристики: ${typeof meta.bonuses === 'string' ? meta.bonuses : JSON.stringify(meta.bonuses)}` : null,
    meta.inventory_id ? `ID в инвентаре: **${meta.inventory_id}**` : null,
    meta.companion_id ? `ID питомца/маунта: **${meta.companion_id}**` : null,
  ].filter(Boolean).join('\n');
  return `${iconFor(row, meta)} **${sign}${row.delta} ${assetLabel(row)}**\nИсточник/действие: **${row.reason}**\nБаланс/количество: **${row.balance_before} → ${row.balance_after}**${details ? `\n${details}` : ''}\n${formatDate(row.created_at)}`;
}
function controls(scope, page, hasNext) {
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:economylog:global:0').setLabel('Общий журнал').setEmoji('🌐').setStyle(scope === 'global' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('guild:economylog:personal:0').setLabel('Личный журнал').setEmoji('👤').setStyle(scope === 'personal' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  )];
  if (scope === 'personal') rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`guild:economylog:personal:${Math.max(0, page - 1)}`).setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`guild:economylog:personal:${page + 1}`).setLabel('Дальше').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(!hasNext),
  ));
  return rows;
}
async function render(interaction) {
  const parts = String(interaction.customId || '').split(':');
  const scope = parts[2] === 'personal' ? 'personal' : 'global';
  const page = Math.max(0, Number(parts[3]) || 0);
  let rows, text, title, footer, hasNext = false;
  if (scope === 'global') {
    rows = getEconomyLog(interaction.user.id, { limit: 30, guildWide: true });
    text = rows.length ? rows.map(globalLine).join('\n\n') : 'Операций пока нет.';
    title = '📜 Журнал экономики • Общий';
    footer = 'Последние 30 операций всей Гильдии';
  } else {
    rows = getEconomyLog(interaction.user.id, { limit: PERSONAL_PAGE_SIZE + 1, offset: page * PERSONAL_PAGE_SIZE, guildWide: false });
    hasNext = rows.length > PERSONAL_PAGE_SIZE;
    rows = rows.slice(0, PERSONAL_PAGE_SIZE);
    text = rows.length ? rows.map(personalEntry).join('\n\n') : (page ? 'На этой странице записей нет.' : 'Личных операций пока нет.');
    title = `📜 Журнал экономики • Личный`;
    footer = `Страница ${page + 1} • история не ограничена, записи листаются страницами`;
  }
  const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle(title).setDescription(text.slice(0, 4000)).setFooter({ text: footer });
  const payload = { embeds: [embed], components: controls(scope, page, hasNext) };
  const isJournalPage = String(interaction.customId || '').startsWith('guild:economylog:');
  return isJournalPage ? interaction.update(payload) : interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}
module.exports = {
  data: new SlashCommandBuilder().setName('economylog').setDescription('Открыть общий или личный журнал экономики'),
  execute: render,
};
