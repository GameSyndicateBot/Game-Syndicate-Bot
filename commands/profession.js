const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { ITEMS } = require('../systems/hero/itemData');
const { PROFESSIONS, ENERGY_MAX, ENERGY_COST, ENERGY_REGEN_PER_HOUR, xpNeeded, getProfession, chooseProfession, work, getProfessionCounts } = require('../systems/hero/professionService');

function duration(ms){const m=Math.max(1,Math.ceil(ms/60000));return m>=60?`${Math.floor(m/60)} ч ${m%60} мин`:`${m} мин`;}
function energyBar(value){const filled=Math.max(0,Math.min(10,Math.round(value/10)));return `${'🟪'.repeat(filled)}${'⬛'.repeat(10-filled)}`;}
module.exports={
 data:new SlashCommandBuilder().setName('profession').setDescription('Мирная профессия героя')
  .addSubcommand(s=>s.setName('choose').setDescription('Выбрать одну профессию').addStringOption(o=>o.setName('profession').setDescription('Профессия').setRequired(true).addChoices(...Object.entries(PROFESSIONS).map(([value,p])=>({name:`${p.icon} ${p.name}`,value})))))
  .addSubcommand(s=>s.setName('status').setDescription('Показать профессию, опыт и энергию'))
  .addSubcommand(s=>s.setName('work').setDescription(`Выполнить работу за ${ENERGY_COST} энергии`))
  .addSubcommand(s=>s.setName('server').setDescription('Показать распределение профессий на сервере')),
 async execute(interaction){
  if(!getHero(interaction.user.id)) return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const sub=interaction.options.getSubcommand();
  if(sub==='choose'){
   const result=chooseProfession(interaction.user.id,interaction.options.getString('profession'));
   if(!result.ok) return interaction.reply({content:result.reason==='already'?`❌ У тебя уже выбрана профессия: **${PROFESSIONS[result.current.profession_key]?.name}**. Одновременно можно иметь только одну.`:'❌ Неизвестная профессия.',flags:MessageFlags.Ephemeral});
   const p=PROFESSIONS[result.row.profession_key];
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${p.icon} Профессия выбрана: ${p.name}`).setDescription(`${p.description}\n\n⚡ Запас энергии: **${ENERGY_MAX}/${ENERGY_MAX}**\nОдна работа расходует **${ENERGY_COST}** энергии. Восстановление: **${ENERGY_REGEN_PER_HOUR} энергии в час**.\n\nПрофессия одна на героя — договаривайтесь с участниками и обменивайтесь ресурсами.`)],flags:MessageFlags.Ephemeral});
  }
  if(sub==='server'){
   const counts=getProfessionCounts();
   const text=Object.entries(PROFESSIONS).map(([k,p])=>`${p.icon} **${p.name}** — ${counts[k]||0}`).join('\n');
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('👥 Профессии Гильдии').setDescription(`${text}\n\nВыбирайте профессию, которой не хватает серверу.`)],flags:MessageFlags.Ephemeral});
  }
  const row=getProfession(interaction.user.id);
  if(!row) return interaction.reply({content:'Выбери профессию через **/profession choose**.',flags:MessageFlags.Ephemeral});
  const p=PROFESSIONS[row.profession_key];
  if(sub==='status') return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${p.icon} ${p.name} · Lv.${row.level}`).setDescription(`${p.description}\n\n${energyBar(row.energy)}\n⚡ Энергия: **${row.energy}/${ENERGY_MAX}**\nВосстановление: **${ENERGY_REGEN_PER_HOUR}/час**\nСтоимость работы: **${ENERGY_COST}**\n\nXP: **${row.xp}/${xpNeeded(row.level)}**\nВыполнено работ: **${row.work_count}**`)],flags:MessageFlags.Ephemeral});
  const result=work(interaction.user.id);
  if(!result.ok) return interaction.reply({content:result.reason==='energy'?`⚡ Недостаточно энергии: **${result.energy}/${ENERGY_MAX}**. До следующей работы: **${duration(result.waitMs)}**.`:'❌ Не удалось выполнить работу.',flags:MessageFlags.Ephemeral});
  const rewards=result.rewards.length?result.rewards.map(([k,q])=>`• ${ITEMS[k]?.name||k} ×${q}`).join('\n'):'• Редких находок не было';
  return interaction.reply({embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle(`${p.icon} Работа завершена`).setDescription(`${rewards}\n\n+35 XP профессии\n⚡ Осталось энергии: **${result.energy}/${ENERGY_MAX}**${result.leveled?`\n🎉 Новый уровень: **${result.level}**`:''}`)],flags:MessageFlags.Ephemeral});
 }
};
