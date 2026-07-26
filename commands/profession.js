const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { ITEMS } = require('../systems/hero/itemData');
const {
  PROFESSIONS,SPECIALIZATIONS,ENERGY_REGEN_PER_HOUR,LEVEL_CAP,xpNeeded,energyMaxForLevel,energyCostForLevel,
  getProfession,chooseProfession,changeProfession,processProfessionMaterial,PROFESSION_CHANGE_COST,work,chooseSpecialization,getProfessionCounts,getMilestones
} = require('../systems/hero/professionService');

function duration(ms){const m=Math.max(1,Math.ceil(ms/60000));return m>=60?`${Math.floor(m/60)} ч ${m%60} мин`:`${m} мин`;}
function energyBar(value,max){const filled=Math.max(0,Math.min(10,Math.round((value/Math.max(1,max))*10)));return `${'🟪'.repeat(filled)}${'⬛'.repeat(10-filled)}`;}
function specChoices(){
  const values=[];
  for(const [profession,specs] of Object.entries(SPECIALIZATIONS)){
    for(const [key,s] of Object.entries(specs)) values.push({name:`${s.icon} ${PROFESSIONS[profession].name}: ${s.name}`,value:key});
  }
  return values.slice(0,25);
}
module.exports={
 data:new SlashCommandBuilder().setName('profession').setDescription('Мирная профессия героя')
  .addSubcommand(s=>s.setName('choose').setDescription('Выбрать одну профессию').addStringOption(o=>o.setName('profession').setDescription('Профессия').setRequired(true).addChoices(...Object.entries(PROFESSIONS).map(([value,p])=>({name:`${p.icon} ${p.name}`,value})))))
  .addSubcommand(s=>s.setName('change').setDescription('Сменить профессию за 500 GS Dust').addStringOption(o=>o.setName('profession').setDescription('Новая профессия').setRequired(true).addChoices(...Object.entries(PROFESSIONS).map(([value,p])=>({name:`${p.icon} ${p.name}`,value})))))
  .addSubcommand(s=>s.setName('process').setDescription('Переработать сырьё профессии').addIntegerOption(o=>o.setName('batches').setDescription('Количество партий (2 сырья → 1 материал)').setMinValue(1).setMaxValue(100)))
  .addSubcommand(s=>s.setName('status').setDescription('Показать профессию, прогрессию и энергию'))
  .addSubcommand(s=>s.setName('work').setDescription('Выполнить работу за энергию'))
  .addSubcommand(s=>s.setName('specialization').setDescription('Выбрать специализацию на 50 уровне').addStringOption(o=>o.setName('specialization').setDescription('Специализация').setRequired(true).addChoices(...specChoices())))
  .addSubcommand(s=>s.setName('server').setDescription('Показать распределение профессий на сервере')),
 async execute(interaction){
  if(!getHero(interaction.user.id)) return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const sub=interaction.options.getSubcommand();
  if(sub==='choose'){
   const result=chooseProfession(interaction.user.id,interaction.options.getString('profession'));
   if(!result.ok) return interaction.reply({content:result.reason==='already'?`❌ У тебя уже выбрана профессия: **${PROFESSIONS[result.current.profession_key]?.name}**. Одновременно можно иметь только одну.`:'❌ Неизвестная профессия.',flags:MessageFlags.Ephemeral});
   const p=PROFESSIONS[result.row.profession_key];
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${p.icon} Профессия выбрана: ${p.name}`).setDescription(`${p.description}\n\n⚡ Энергия: **${result.row.energy}/${result.row.energy_max}**\nОдна работа расходует **${energyCostForLevel(1)}** энергии.\nВосстановление: **${ENERGY_REGEN_PER_HOUR}/час**.\n\nПрофессия одна на героя. Обменивайтесь ресурсами и выполняйте заказы.`)],flags:MessageFlags.Ephemeral});
  }

  if(sub==='change'){
   const key=interaction.options.getString('profession');
   const result=changeProfession(interaction.user.id,key);
   if(!result.ok){
    const messages={missing:'❌ Сначала выбери профессию.',same:'❌ Эта профессия уже выбрана.',invalid:'❌ Неизвестная профессия.'};
    if(result.reason==='dust') return interaction.reply({content:`❌ Для смены профессии нужно **${PROFESSION_CHANGE_COST} GS Dust**. Твой баланс: **${result.balance}**.`,flags:MessageFlags.Ephemeral});
    return interaction.reply({content:messages[result.reason]||'❌ Не удалось сменить профессию.',flags:MessageFlags.Ephemeral});
   }
   const next=PROFESSIONS[result.row.profession_key];
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0xF59E0B).setTitle(`${next.icon} Профессия изменена: ${next.name}`).setDescription(`Списано: **${result.spent} GS Dust**.
Уровень и опыт профессии сброшены. Материалы, герой, экипировка и достижения сохранены.`)],flags:MessageFlags.Ephemeral});
  }
  if(sub==='process'){
   const batches=interaction.options.getInteger('batches')||1;
   const result=processProfessionMaterial(interaction.user.id,batches);
   if(!result.ok){
    if(result.reason==='unsupported') return interaction.reply({content:'❌ Переработка сейчас доступна Горняку (руда → слитки) и Охотнику (шкуры → кожа).',flags:MessageFlags.Ephemeral});
    if(result.reason==='materials') return interaction.reply({content:`❌ Недостаточно сырья: нужно **${result.needed}**, есть **${result.owned}**.`,flags:MessageFlags.Ephemeral});
    return interaction.reply({content:'❌ Не удалось переработать материалы.',flags:MessageFlags.Ephemeral});
   }
   const input=ITEMS[result.recipe.input]?.name||result.recipe.input;
   const output=ITEMS[result.recipe.output]?.name||result.recipe.output;
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle('⚒️ Материал обработан').setDescription(`Использовано: **${input} ×${result.consumed}**
Получено: **${output} ×${result.produced}**`)],flags:MessageFlags.Ephemeral});
  }
  if(sub==='server'){
   const counts=getProfessionCounts();
   const text=Object.entries(PROFESSIONS).map(([k,p])=>`${p.icon} **${p.name}** — ${counts[k]||0}`).join('\n');
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('👥 Профессии Гильдии').setDescription(`${text}\n\nПодробный рейтинг находится в **📖 Реестре Гильдии → 🏆 Зал мастеров**.`)],flags:MessageFlags.Ephemeral});
  }
  const row=getProfession(interaction.user.id);
  if(!row) return interaction.reply({content:'Выбери профессию через **/profession choose**.',flags:MessageFlags.Ephemeral});
  const p=PROFESSIONS[row.profession_key];
  if(sub==='specialization'){
    const key=interaction.options.getString('specialization');
    const result=chooseSpecialization(interaction.user.id,key);
    if(!result.ok){
      const messages={level:`❌ Специализация открывается на **${LEVEL_CAP} уровне** профессии.`,already:'❌ Специализация уже выбрана.',invalid:'❌ Эта специализация не подходит твоей профессии.'};
      return interaction.reply({content:messages[result.reason]||'❌ Не удалось выбрать специализацию.',flags:MessageFlags.Ephemeral});
    }
    const s=SPECIALIZATIONS[row.profession_key][key];
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0xF59E0B).setTitle(`${s.icon} Мастерство: ${s.name}`).setDescription(`${s.description}\n\nВыбор окончательный и отображается в Реестре Гильдии.`)],flags:MessageFlags.Ephemeral});
  }
  if(sub==='status'){
    const spec=row.specialization_key?SPECIALIZATIONS[row.profession_key]?.[row.specialization_key]:null;
    const milestone=getMilestones(row.level);
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${p.icon} ${p.name} · Ур. ${row.level}/${LEVEL_CAP}`)
      .setDescription(`${p.description}\n\n${energyBar(row.energy,row.energy_max)}\n⚡ Энергия: **${row.energy}/${row.energy_max}**\nВосстановление: **${ENERGY_REGEN_PER_HOUR}/час**\nСтоимость работы: **${energyCostForLevel(row.level)}**\n\n⭐ Опыт: **${row.xp}/${xpNeeded(row.level)}**\n🔨 Выполнено работ: **${row.work_count}**\n📦 Собрано ресурсов: **${row.resources_gathered||0}**\n📜 Выполнено заказов: **${row.orders_completed||0}**\n💰 Заработано профессией: **${row.dust_earned||0} Dust**${spec?`\n\n🏅 Специализация: **${spec.icon} ${spec.name}**`:''}${milestone?`\n\n🔓 Следующая награда — **ур. ${milestone.level}**\n${milestone.text}`:''}`)],flags:MessageFlags.Ephemeral});
  }
  const result=work(interaction.user.id);
  if(!result.ok) return interaction.reply({content:result.reason==='energy'?`⚡ Недостаточно энергии: **${result.energy}/${result.maxEnergy}**. До следующей работы: **${duration(result.waitMs)}**.`:'❌ Не удалось выполнить работу.',flags:MessageFlags.Ephemeral});
  const rewards=result.rewards.length?result.rewards.map(([k,q])=>`• ${ITEMS[k]?.name||k} ×${q}`).join('\n'):'• Редких находок не было';
  return interaction.reply({embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle(`${p.icon} Работа завершена`).setDescription(`${rewards}\n\n+35 XP профессии\n⚡ Осталось энергии: **${result.energy}/${result.maxEnergy}**${result.leveled?`\n🎉 Получено уровней: **${result.gained}**. Новый уровень: **${result.level}**`:''}`)],flags:MessageFlags.Ephemeral});
 }
};
