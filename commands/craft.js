const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { listRecipes, hydrateRecipe, craft } = require('../systems/hero/craftingService');
const { RARITY_LABELS } = require('../systems/hero/itemData');

const rarityColors={common:0x94A3B8,rare:0x3B82F6,epic:0xA855F7,legendary:0xF59E0B,mythic:0xEF4444};
function materialLines(recipe){return recipe.materials.map(m=>`${m.icon} **${m.name}** — ${m.owned}/${m.required}`).join('\n');}

module.exports={
 data:new SlashCommandBuilder().setName('craft').setDescription('Кузница и создание RPG-предметов')
  .addSubcommand(s=>s.setName('list').setDescription('Показать доступные рецепты').addBooleanOption(o=>o.setName('available').setDescription('Только те, которые можно создать сейчас')))
  .addSubcommand(s=>s.setName('info').setDescription('Посмотреть рецепт').addStringOption(o=>o.setName('recipe').setDescription('Рецепт').setRequired(true).setAutocomplete(true)))
  .addSubcommand(s=>s.setName('create').setDescription('Создать предмет').addStringOption(o=>o.setName('recipe').setDescription('Рецепт').setRequired(true).setAutocomplete(true)).addIntegerOption(o=>o.setName('quantity').setDescription('Количество (1–10)').setMinValue(1).setMaxValue(10))),
 async autocomplete(interaction){
  const focused=interaction.options.getFocused().toLowerCase();
  const rows=listRecipes(interaction.user.id).filter(r=>`${r.item.name} ${r.key} ${r.npc}`.toLowerCase().includes(focused)).slice(0,25);
  return interaction.respond(rows.map(r=>({name:`${r.canCraft?'✅':'🔒'} ${r.item.name} · ур. ${r.level}`,value:r.key})));
 },
 async execute(interaction){
  const hero=getHero(interaction.user.id);
  if(!hero)return interaction.reply({content:'❌ Сначала создай героя: `/hero create`.',flags:MessageFlags.Ephemeral});
  const sub=interaction.options.getSubcommand();
  if(sub==='list'){
   const only=interaction.options.getBoolean('available')||false;
   const rows=listRecipes(interaction.user.id,{craftableOnly:only});
   const shown=rows.slice(0,20);
   const text=shown.length?shown.map(r=>`${r.canCraft?'✅':'🔒'} **${r.item.name}** · ${RARITY_LABELS[r.item.rarity]||r.item.rarity}\nУровень ${r.level} · 💠 ${r.dust} · ${r.npc}`).join('\n\n'):'Нет рецептов, подходящих под выбранный фильтр.';
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle('🔨 Книга рецептов').setDescription(text).setFooter({text:`Показано ${shown.length} из ${rows.length} • /craft info для состава`})],flags:MessageFlags.Ephemeral});
  }
  const key=interaction.options.getString('recipe');
  const recipe=hydrateRecipe(key,interaction.user.id);
  if(!recipe)return interaction.reply({content:'❌ Рецепт не найден.',flags:MessageFlags.Ephemeral});
  if(sub==='info'){
   const status=recipe.canCraft?'✅ Можно создать сейчас':'🔒 Пока не хватает ресурсов или уровня';
   return interaction.reply({embeds:[new EmbedBuilder().setColor(rarityColors[recipe.item.rarity]||0x7C3AED).setTitle(`🔨 ${recipe.item.name}`).setDescription(`${recipe.item.description}\n\n**Мастер:** ${recipe.npc}\n**Требуемый уровень:** ${recipe.level}\n**Стоимость:** 💠 ${recipe.dust} Dust\n\n**Материалы**\n${materialLines(recipe)}\n\n${status}`).setFooter({text:`Твой уровень: ${recipe.heroLevel} • Dust: ${recipe.dustBalance}`})],flags:MessageFlags.Ephemeral});
  }
  const quantity=interaction.options.getInteger('quantity')||1;
  const result=craft(interaction.user.id,key,quantity);
  if(!result.ok){
   if(result.reason==='level')return interaction.reply({content:`❌ Нужен уровень героя **${result.requiredLevel}**. Твой уровень: **${result.heroLevel}**.`,flags:MessageFlags.Ephemeral});
   if(result.reason==='dust')return interaction.reply({content:`❌ Нужно **${result.required} Dust**, у тебя **${result.balance}**.`,flags:MessageFlags.Ephemeral});
   if(result.reason==='materials')return interaction.reply({content:`❌ Не хватает материалов:\n${result.missing.map(m=>`${m.icon} ${m.name}: ${m.owned}/${m.required}`).join('\n')}`,flags:MessageFlags.Ephemeral});
   return interaction.reply({content:'❌ Не удалось создать предмет. Попробуй ещё раз.',flags:MessageFlags.Ephemeral});
  }
  return interaction.reply({embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle('⚒️ Предмет создан!').setDescription(`**${hero.name}** получает:\n\n✨ **${result.recipe.item.name} ×${result.quantity}**\n\nПотрачено: 💠 **${result.spent} Dust**\nОсталось: 💠 **${result.balance} Dust**`).setFooter({text:`Работу выполнил: ${result.recipe.npc}`})]});
 }
};
