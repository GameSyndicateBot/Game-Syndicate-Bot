const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { HERO_CLASSES, ORIGINS, GENDERS, STAT_LABELS, xpForNextLevel } = require('../systems/hero/heroData');
const { getHero, createHero, getHistory, getInventory, getEquipment } = require('../systems/hero/heroService');
const { createHeroCard } = require('../images/hero/createHeroCard');

const classChoices = Object.entries(HERO_CLASSES).map(([value, c]) => ({ name: `${c.icon} ${c.name}`, value }));
const originChoices = Object.entries(ORIGINS).map(([value, o]) => ({ name: `${o.icon} ${o.name}`, value }));

function heroMissing() { return { content: '❌ У тебя ещё нет героя. Создай его командой `/hero create`.', flags: MessageFlags.Ephemeral }; }
function formatDate(value) { try { return new Date(`${value}Z`).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return value; } }

module.exports = {
 data: new SlashCommandBuilder()
  .setName('hero').setDescription('Герой и RPG-система GS Expeditions')
  .addSubcommand(s => s.setName('create').setDescription('Создать своего единственного героя')
    .addStringOption(o => o.setName('name').setDescription('Имя героя: 2–24 символа').setMinLength(2).setMaxLength(24).setRequired(true))
    .addStringOption(o => o.setName('gender').setDescription('Пол героя').setRequired(true)
      .addChoices({ name: '♂️ Мужской', value: 'male' }, { name: '♀️ Женский', value: 'female' }))
    .addStringOption(o => o.setName('class').setDescription('Один из 12 классов World Boss').setRequired(true).addChoices(...classChoices))
    .addStringOption(o => o.setName('origin').setDescription('Происхождение и пассивный бонус').setRequired(true).addChoices(...originChoices)))
  .addSubcommand(s => s.setName('view').setDescription('Показать карточку героя').addUserOption(o => o.setName('user').setDescription('Герой другого участника')))
  .addSubcommand(s => s.setName('stats').setDescription('Подробные характеристики героя').addUserOption(o => o.setName('user').setDescription('Герой другого участника')))
  .addSubcommand(s => s.setName('equipment').setDescription('Показать экипировку героя').addUserOption(o => o.setName('user').setDescription('Герой другого участника')))
  .addSubcommand(s => s.setName('inventory').setDescription('Показать инвентарь героя'))
  .addSubcommand(s => s.setName('history').setDescription('Последние события истории героя').addUserOption(o => o.setName('user').setDescription('Герой другого участника')))
  .addSubcommand(s => s.setName('classes').setDescription('Список классов и базовых характеристик'))
  .addSubcommand(s => s.setName('origins').setDescription('Список происхождений и бонусов')),

 async execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'classes') {
   const text = Object.entries(HERO_CLASSES).map(([k,c]) => `${c.icon} **${c.name}** — ${c.role}\n❤️ ${c.hp} · ⚔️ ${c.strength} · 🛡️ ${c.defense} · 🏃 ${c.dexterity} · 🧠 ${c.intelligence} · 🍀 ${c.luck}`).join('\n\n');
   return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B5CF6).setTitle('⚔️ 12 классов героев').setDescription(text).setFooter({text:'Класс после создания героя изменить нельзя.'})], flags: MessageFlags.Ephemeral });
  }
  if (sub === 'origins') {
   const text = Object.values(ORIGINS).map(o => `${o.icon} **${o.name}** — ${o.description}\n*${o.passive}*`).join('\n\n');
   return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xA855F7).setTitle('📜 Происхождения').setDescription(text).setFooter({text:'Происхождение добавляет небольшие стартовые бонусы.'})], flags: MessageFlags.Ephemeral });
  }
  if (sub === 'create') {
   if (getHero(interaction.user.id)) return interaction.reply({ content: '❌ У тебя уже есть герой. В V15 каждый участник владеет только одним героем.', flags: MessageFlags.Ephemeral });
   const result = createHero({ userId: interaction.user.id, name: interaction.options.getString('name'), gender: interaction.options.getString('gender'), classKey: interaction.options.getString('class'), originKey: interaction.options.getString('origin') });
   if (!result.ok) return interaction.reply({ content: result.reason === 'name' ? '❌ Имя должно содержать от 2 до 24 символов.' : '❌ Не удалось создать героя.', flags: MessageFlags.Ephemeral });
   await interaction.deferReply();
   const buffer = await createHeroCard(result.hero, interaction.user);
   return interaction.editReply({ content: `✨ **${result.hero.name}** вступает в мир Game Syndicate!`, files: [new AttachmentBuilder(buffer, { name: `hero-${interaction.user.id}.png` })] });
  }
  const target = interaction.options.getUser('user') || interaction.user;
  if (target.bot) return interaction.reply({ content: '❌ У ботов нет героев.', flags: MessageFlags.Ephemeral });
  const hero = getHero(target.id); if (!hero) return interaction.reply(target.id === interaction.user.id ? heroMissing() : { content: '❌ У этого участника ещё нет героя.', flags: MessageFlags.Ephemeral });
  const cls = HERO_CLASSES[hero.class_key], org = ORIGINS[hero.origin_key];
  if (sub === 'view') { await interaction.deferReply(); const buffer = await createHeroCard(hero, target); return interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: `hero-${target.id}.png` })] }); }
  if (sub === 'stats') {
   const req=xpForNextLevel(hero.level); const lines=Object.entries(STAT_LABELS).map(([k,l])=>`**${l}:** ${k==='hp'?`${hero.hp}/${hero.max_hp}`:hero[k]}`).join('\n');
   return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${cls.icon} ${hero.name} — характеристики`).setDescription(lines).addFields(
    {name:'Класс',value:`${cls.name} • ${cls.role}`,inline:true},{name:'Происхождение',value:`${org.icon} ${org.name}`,inline:true},{name:'Уровень',value:`${hero.level} • ${hero.xp}/${req} XP`,inline:true},{name:'Пассивный бонус',value:org.passive},{name:'Состояние',value:hero.status==='ready'?'✅ Готов к приключениям':hero.status,inline:true},{name:'Номер героя',value:`#${String(hero.hero_number).padStart(5,'0')}`,inline:true})] });
  }
  if (sub === 'equipment') {
   const equipment=getEquipment(target.id); const bySlot=new Map(equipment.map(e=>[e.slot,e])); const slots=[['weapon','⚔️ Оружие'],['armor','🛡️ Броня'],['helmet','🪖 Шлем'],['gloves','🧤 Перчатки'],['boots','🥾 Ботинки'],['ring','💍 Кольцо'],['amulet','📿 Амулет'],['backpack','🎒 Рюкзак']];
   const text=slots.map(([k,l])=>`${l}: ${bySlot.get(k)?.name || '—'}`).join('\n'); return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle(`Экипировка: ${hero.name}`).setDescription(text).setFooter({text:'Предметы появятся в V15.3 и будут совместимы с этой структурой.'})] });
  }
  if (sub === 'inventory') {
   const items=getInventory(interaction.user.id); const text=items.length?items.map(i=>`• **${i.name}** [${i.rarity}] ×${i.quantity}`).join('\n'):'Инвентарь пока пуст. Первые предметы появятся в экспедициях V15.2–V15.3.';
   return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x9333EA).setTitle(`🎒 Инвентарь: ${hero.name}`).setDescription(text)], flags: MessageFlags.Ephemeral });
  }
  if (sub === 'history') {
   const rows=getHistory(target.id,10); const text=rows.length?rows.map(r=>`**${formatDate(r.created_at)}**\n${r.description}`).join('\n\n'):'История пока пуста.';
   return interaction.reply({ embeds:[new EmbedBuilder().setColor(0xA855F7).setTitle(`📖 История: ${hero.name}`).setDescription(text).setFooter({text:`HERO #${String(hero.hero_number).padStart(5,'0')}`})] });
  }
 }
};
