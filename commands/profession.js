const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { ITEMS } = require('../systems/hero/itemData');
const { PROFESSIONS, RECIPES, xpNeeded, getProfession, chooseProfession, work, cook } = require('../systems/hero/professionService');

function duration(ms) { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m/60)} ч ${m%60} мин` : `${m} мин`; }
function ingredientsText(recipe) { return Object.entries(recipe.ingredients).map(([k,q]) => `${ITEMS[k]?.name || k} ×${q}`).join(', '); }
module.exports = {
  data: new SlashCommandBuilder().setName('profession').setDescription('Мирная профессия героя')
    .addSubcommand(s => s.setName('choose').setDescription('Выбрать профессию навсегда').addStringOption(o => o.setName('profession').setDescription('Профессия').setRequired(true).addChoices(...Object.entries(PROFESSIONS).map(([value,p]) => ({ name: `${p.icon} ${p.name}`, value })))))
    .addSubcommand(s => s.setName('status').setDescription('Показать профессию и прогресс'))
    .addSubcommand(s => s.setName('work').setDescription('Выполнить профессиональную работу'))
    .addSubcommand(s => s.setName('recipes').setDescription('Рецепты повара'))
    .addSubcommand(s => s.setName('cook').setDescription('Приготовить блюдо').addStringOption(o => o.setName('recipe').setDescription('Рецепт').setRequired(true).addChoices(...Object.entries(RECIPES).map(([value,r]) => ({ name: `${r.icon} ${r.name}`, value }))))),
  async execute(interaction) {
    if (!getHero(interaction.user.id)) return interaction.reply({ content: '❌ Сначала создай героя.', flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    if (sub === 'choose') {
      const result = chooseProfession(interaction.user.id, interaction.options.getString('profession'));
      if (!result.ok) return interaction.reply({ content: result.reason === 'already' ? `❌ Профессия уже выбрана: **${PROFESSIONS[result.current.profession_key]?.name}**. Менять её пока нельзя.` : '❌ Неизвестная профессия.', flags: MessageFlags.Ephemeral });
      const p = PROFESSIONS[result.row.profession_key];
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${p.icon} Профессия выбрана: ${p.name}`).setDescription(`${p.description}\n\nРаботай через **/profession work** и развивай мастерство.`)], flags: MessageFlags.Ephemeral });
    }
    const row = getProfession(interaction.user.id);
    if (!row) return interaction.reply({ content: 'Выбери профессию через **/profession choose**.', flags: MessageFlags.Ephemeral });
    const p = PROFESSIONS[row.profession_key];
    if (sub === 'status') return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${p.icon} ${p.name} · Lv.${row.level}`).setDescription(`${p.description}\n\nXP: **${row.xp}/${xpNeeded(row.level)}**\nВыполнено работ: **${row.work_count}**`)], flags: MessageFlags.Ephemeral });
    if (sub === 'work') {
      const result = work(interaction.user.id);
      if (!result.ok) return interaction.reply({ content: result.reason === 'cooldown' ? `⏳ Следующая профессиональная работа будет доступна через **${duration(result.waitMs)}**.` : '❌ Не удалось выполнить работу.', flags: MessageFlags.Ephemeral });
      const rewards = result.rewards.map(([k,q]) => `• ${ITEMS[k]?.name || k} ×${q}`).join('\n');
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle(`${p.icon} Работа завершена`).setDescription(`${rewards}\n\n+35 XP профессии${result.leveled ? `\n🎉 Новый уровень: **${result.level}**` : ''}`)], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'recipes') {
      const text = Object.entries(RECIPES).map(([k,r]) => `${r.icon} **${r.name}** · Lv.${r.level}\n${ingredientsText(r)}\nСоздаёт: ${ITEMS[r.item]?.description || r.item}`).join('\n\n');
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xF59E0B).setTitle('👨‍🍳 Книга рецептов').setDescription(text)], flags: MessageFlags.Ephemeral });
    }
    const result = cook(interaction.user.id, interaction.options.getString('recipe'));
    const errors = { wrong_profession:'❌ Готовить блюда может только Повар.', level:`❌ Нужен уровень профессии ${result.required}.`, materials:'❌ Не хватает ингредиентов.', invalid:'❌ Рецепт не найден.' };
    if (!result.ok) return interaction.reply({ content: errors[result.reason] || '❌ Не удалось приготовить блюдо.', flags: MessageFlags.Ephemeral });
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle(`${result.recipe.icon} ${result.recipe.name} приготовлено`).setDescription(`Блюдо добавлено в инвентарь. Его можно использовать на себе или подарить эффект другому герою через **/use**.${result.leveled ? `\n\n🎉 Профессия повышена до Lv.${result.level}.` : ''}`)], flags: MessageFlags.Ephemeral });
  },
};
