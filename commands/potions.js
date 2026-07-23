const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { getConsumables, getActiveBuffs } = require('../systems/hero/alchemyService');

function bonusText(b) {
  const labels = { expedition_success: 'успех экспедиции', rare_find: 'редкая добыча', world_boss_damage: 'урон по боссу', world_boss_resistance: 'защита от босса', boss_flat_damage: 'особый урон' };
  return Object.entries(b || {}).map(([k,v]) => `+${v}${k === 'boss_flat_damage' ? '' : '%'} ${labels[k] || k}`).join(', ');
}
module.exports = {
  data: new SlashCommandBuilder().setName('potions').setDescription('Расходники и активные алхимические эффекты'),
  async execute(interaction) {
    if (!getHero(interaction.user.id)) return interaction.reply({ content: '❌ Сначала создай героя: `/hero create`.', flags: MessageFlags.Ephemeral });
    const items = getConsumables(interaction.user.id);
    const buffs = getActiveBuffs(interaction.user.id);
    const inventory = items.length ? items.map(i => `${i.effect.icon} **${i.name} ×${i.quantity}**\n${i.effect.description}`).join('\n\n') : 'Пока пусто. Создай расходники через `/craft list available:true`.';
    const active = buffs.length ? buffs.map(b => `✨ **${b.source_item_key}** · ${b.context === 'world_boss' ? 'World Boss' : 'экспедиция'} · зарядов: ${b.charges}\n${bonusText(b.bonuses)}`).join('\n\n') : 'Активных эффектов нет.';
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xA855F7).setTitle('🧪 Сумка алхимика').addFields({ name: 'Расходники', value: inventory.slice(0, 1024) }, { name: 'Активные эффекты', value: active.slice(0, 1024) }).setFooter({ text: 'Использование: /use item:<название>' })], flags: MessageFlags.Ephemeral });
  },
};
