const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { getInventory } = require('../systems/hero/itemService');
const { RARITY_LABELS } = require('../systems/hero/itemData');
const { getUpgradeInfo, upgradeItem, getUpgradeHistory, MAX_UPGRADE } = require('../systems/hero/upgradeService');

const COLORS={common:0x94A3B8,rare:0x3B82F6,epic:0xA855F7,legendary:0xF59E0B,mythic:0xEF4444,exclusive:0xEC4899};
function itemName(item,level=item.upgrade_level||0){return `${item.name}${level>0?` +${level}`:''}`;}
function materialsText(rows){return rows.map(m=>`${m.icon} **${m.name}** — ${m.owned}/${m.required}`).join('\n');}

module.exports={
 data:new SlashCommandBuilder().setName('upgrade').setDescription('Улучшение экипировки героя до +10')
  .addSubcommand(s=>s.setName('list').setDescription('Показать экипировку, которую можно улучшить'))
  .addSubcommand(s=>s.setName('info').setDescription('Стоимость следующего улучшения').addIntegerOption(o=>o.setName('id').setDescription('ID предмета из /hero inventory').setMinValue(1).setRequired(true)))
  .addSubcommand(s=>s.setName('apply').setDescription('Попытаться улучшить предмет').addIntegerOption(o=>o.setName('id').setDescription('ID предмета из /hero inventory').setMinValue(1).setRequired(true)))
  .addSubcommand(s=>s.setName('history').setDescription('Последние попытки улучшения')),
 async execute(interaction){
  if(!getHero(interaction.user.id))return interaction.reply({content:'❌ Сначала создай героя: `/hero create`.',flags:MessageFlags.Ephemeral});
  const sub=interaction.options.getSubcommand();
  if(sub==='list'){
   const items=getInventory(interaction.user.id,{limit:100}).filter(i=>i.slot);
   const text=items.length?items.map(i=>`**#${i.id} · ${itemName(i)}** [${RARITY_LABELS[i.rarity]||i.rarity}]${Number(i.upgrade_level)>=MAX_UPGRADE?' · ✅ максимум':''}`).join('\n'):'У тебя пока нет экипируемых предметов.';
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle('⚒️ Улучшение экипировки').setDescription(text).setFooter({text:'Используй /upgrade info id:<номер>'})],flags:MessageFlags.Ephemeral});
  }
  if(sub==='history'){
   const rows=getUpgradeHistory(interaction.user.id,10);
   const text=rows.length?rows.map(r=>`${r.success?'✅':'❌'} **${r.name||r.item_key}** +${r.from_level} → +${r.to_level} · ${r.chance}% · 💠 ${r.dust_spent}`).join('\n'):'Попыток улучшения пока не было.';
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x6D28D9).setTitle('📜 История улучшений').setDescription(text)],flags:MessageFlags.Ephemeral});
  }
  const id=interaction.options.getInteger('id');
  if(sub==='info'){
   const info=getUpgradeInfo(interaction.user.id,id);
   if(!info.ok)return interaction.reply({content:info.reason==='not_upgradeable'?'❌ Этот предмет нельзя улучшать.':'❌ Предмет с таким ID не найден.',flags:MessageFlags.Ephemeral});
   if(info.maxed)return interaction.reply({content:`✅ **${itemName(info.item,info.level)}** уже улучшен до максимума.`,flags:MessageFlags.Ephemeral});
   return interaction.reply({embeds:[new EmbedBuilder().setColor(COLORS[info.item.rarity]||0x7C3AED).setTitle(`⚒️ ${itemName(info.item,info.level)} → +${info.targetLevel}`).setDescription(`**Шанс успеха:** ${info.chance}%\n**Стоимость:** 💠 ${info.cost.dust} Dust\n\n**Материалы**\n${materialsText(info.cost.materials)}\n\n${info.canAfford?'✅ Ресурсов достаточно.':'🔒 Ресурсов пока не хватает.'}`).setFooter({text:'При неудаче предмет не ломается и не теряет уровень, но ресурсы расходуются.'})],flags:MessageFlags.Ephemeral});
  }
  const result=upgradeItem(interaction.user.id,id);
  if(!result.ok){
   if(result.reason==='materials')return interaction.reply({content:`❌ Не хватает материалов:\n${result.missing.map(m=>`${m.icon} ${m.name}: ${m.owned}/${m.required}`).join('\n')}`,flags:MessageFlags.Ephemeral});
   if(result.reason==='dust')return interaction.reply({content:`❌ Нужно **${result.required} Dust**, у тебя **${result.balance}**.`,flags:MessageFlags.Ephemeral});
   if(result.maxed)return interaction.reply({content:'✅ Предмет уже улучшен до +10.',flags:MessageFlags.Ephemeral});
   return interaction.reply({content:result.reason==='not_upgradeable'?'❌ Этот предмет нельзя улучшать.':'❌ Не удалось выполнить улучшение.',flags:MessageFlags.Ephemeral});
  }
  if(result.success){
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle('✨ Улучшение успешно!').setDescription(`**${result.item.name}** теперь имеет уровень **+${result.targetLevel}**.\n\nШанс: ${result.chance}% · Выпало: ${result.roll}\nПотрачено: 💠 ${result.spent} Dust`).setFooter({text:'Бонусы предмета автоматически усилены.'})]});
  }
  return interaction.reply({embeds:[new EmbedBuilder().setColor(0xEF4444).setTitle('💥 Улучшение не удалось').setDescription(`**${result.item.name}** остаётся на уровне **+${result.fromLevel}**.\n\nШанс: ${result.chance}% · Выпало: ${result.roll}\nПотрачено: 💠 ${result.spent} Dust`).setFooter({text:'Предмет не сломан и уровень не потерян.'})],flags:MessageFlags.Ephemeral});
 }
};
