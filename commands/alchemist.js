const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { listRecipes } = require('../systems/hero/craftingService');
const { getConsumables, getActiveBuffs } = require('../systems/hero/alchemyService');

module.exports = {
  data: new SlashCommandBuilder().setName('alchemist').setDescription('Открыть меню алхимика Лиры'),
  async execute(interaction) {
    const hero = getHero(interaction.user.id);
    if (!hero) return interaction.reply({ content: '❌ Сначала создай героя: `/hero create`.', flags: MessageFlags.Ephemeral });
    const recipes = listRecipes(interaction.user.id).filter(r => r.npc === 'Алхимик Лира');
    const ready = recipes.filter(r => r.canCraft).length;
    const items = getConsumables(interaction.user.id);
    const buffs = getActiveBuffs(interaction.user.id);
    const description = [
      'Лира создаёт зелья, свитки и боевые реагенты из материалов экспедиций.',
      '',
      `🧪 **Рецепты:** ${recipes.length} · доступно сейчас: ${ready}`,
      `🎒 **Расходники:** ${items.reduce((s, i) => s + Number(i.quantity || 0), 0)}`,
      `✨ **Активные эффекты:** ${buffs.length}`,
      '',
      '**Что делать дальше**',
      '• `/craft list available:true` — посмотреть доступные рецепты.',
      '• `/potions` — открыть сумку расходников и активные эффекты.',
      '• `/use item:<название>` — применить зелье или свиток.',
      '',
      '💡 Материалы добываются в экспедициях и сундуках. Боевые свитки действуют на следующий World Boss, а походные эликсиры — на следующую экспедицию.',
    ].join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x7C3AED).setTitle('🧪 Алхимическая лавка Лиры').setDescription(description).setFooter({ text: `Герой: ${hero.name} · уровень ${hero.level}` })], flags: MessageFlags.Ephemeral });
  },
};
