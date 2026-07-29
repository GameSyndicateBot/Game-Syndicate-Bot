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
    const rows = getEconomyLog(interaction.user.id, { limit: 30, guildWide: true });
    const text = rows.length ? rows.map(r => {
      const icon = r.asset_type === 'dust' ? '💎' : r.asset_type === 'companion' ? '🐾' : (ICONS[r.asset_type] || '📦');
      const sign = Number(r.delta) >= 0 ? '+' : '';
      let meta={}; try{meta=JSON.parse(r.metadata_json||'{}')}catch(_){}
      const details=[meta.rarity?`Редкость: **${meta.rarity}**`:null,meta.slot?`Слот: **${meta.slot}**`:null,meta.kind?`Тип: **${meta.kind==='mount'?'Маунт (ездовой)':'Питомец'}**`:null,meta.description?`Описание: ${String(meta.description).slice(0,180)}`:null,meta.bonuses&&meta.bonuses!=='{}'?`Характеристики: ${typeof meta.bonuses==='string'?meta.bonuses:JSON.stringify(meta.bonuses)}`:null].filter(Boolean).join('\n');
      return `${icon} <@${r.user_id}> • **${sign}${r.delta} ${r.asset_name || r.asset_key}**\nГде/источник: **${r.reason}**${details?`\n${details}`:''}\nКоличество/баланс: **${r.balance_before} → ${r.balance_after}** · ${formatDate(r.created_at)}`;
    }).join('\n\n') : 'Операций пока нет. Журнал начнёт заполняться после установки этого патча.';
    const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle('📜 Журнал экономики').setDescription(text.slice(0, 4000)).setFooter({ text: 'Последние 30 операций всей Гильдии • подробный журнал восстановления' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
