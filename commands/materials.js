const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { getMaterials } = require('../systems/hero/materialService');

module.exports = {
  data: new SlashCommandBuilder().setName('materials').setDescription('Материалы твоего героя'),
  async execute(interaction) {
    const hero = getHero(interaction.user.id);
    if (!hero) return interaction.reply({ content:'❌ Сначала создай героя командой `/hero create`.', flags:MessageFlags.Ephemeral });
    const rows = getMaterials(interaction.user.id);
    const text = rows.length ? rows.map(m => `${m.icon} **${m.name}** × **${m.quantity}**\n${m.description}`).join('\n\n') : 'Материалов пока нет. Их можно найти в экспедициях и сундуках.';
    return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle(`🧱 Материалы: ${hero.name}`).setDescription(text).setFooter({ text:'Используй материалы в `/craft list` и `/craft create`.' })], flags:MessageFlags.Ephemeral });
  },
};
