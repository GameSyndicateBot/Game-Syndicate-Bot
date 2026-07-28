const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getEconomyLog } = require('../services/economyService');

const ICONS = { dust: '💎', material: '📦', item: '🎒', chest: '🎁' };
function formatDate(value) {
  const d = new Date(String(value).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? String(value) : `<t:${Math.floor(d.getTime()/1000)}:f>`;
}
module.exports = {
  data: new SlashCommandBuilder().setName('economylog').setDescription('Показать последние изменения ресурсов и GS Dust'),
  async execute(interaction) {
    const rows = getEconomyLog(interaction.user.id, { limit: 20 });
    const text = rows.length ? rows.map(r => {
      const icon = r.asset_type === 'dust' ? '💎' : (ICONS[r.asset_type] || '📦');
      const sign = Number(r.delta) >= 0 ? '+' : '';
      return `${icon} **${sign}${r.delta} ${r.asset_name || r.asset_key}**\nИсточник: **${r.reason}**\nБаланс: **${r.balance_before} → ${r.balance_after}** · ${formatDate(r.created_at)}`;
    }).join('\n\n') : 'Операций пока нет. Журнал начнёт заполняться после установки этого патча.';
    const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle('📜 Журнал экономики').setDescription(text.slice(0, 4000)).setFooter({ text: 'Показаны последние 20 операций' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
