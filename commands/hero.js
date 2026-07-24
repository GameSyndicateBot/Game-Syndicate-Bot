const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { HERO_CLASSES, ORIGINS, STAT_LABELS, xpForNextLevel } = require('../systems/hero/heroData');
const { getHero, createHero, getHistory } = require('../systems/hero/heroService');
const { getInventory, getEquipment, getClassEquipment, getEffectiveHero, getInventoryItem, equipItem, equipItemForClass, unequipItem, unequipItemForClass, getCollection, formatBonuses, parseBonuses, applyUpgradeToBonuses } = require('../systems/hero/itemService');
const { SLOT_LABELS, TYPE_LABELS, RARITY_LABELS } = require('../systems/hero/itemData');
const { createHeroCard } = require('../images/hero/createHeroCard');
const { getAllClassProgress, classXpForNextLevel, classWorldBossBonuses, getMasteryRank, classProgressPercent } = require('../systems/hero/classProgressService');

const classChoices = Object.entries(HERO_CLASSES).map(([value,c])=>({name:`${c.icon} ${c.name}`,value}));
const originChoices = Object.entries(ORIGINS).map(([value,o])=>({name:`${o.icon} ${o.name}`,value}));
const slotChoices = Object.entries(SLOT_LABELS).map(([value,name])=>({name,value}));
const typeChoices = [
 {name:'Все предметы',value:'all'},{name:'⚔️ Оружие',value:'weapon'},{name:'🛡️ Броня',value:'armor'},{name:'🪖 Шлемы',value:'helmet'},
 {name:'🧤 Перчатки',value:'gloves'},{name:'🥾 Ботинки',value:'boots'},{name:'💍 Кольца',value:'ring'},{name:'📿 Амулеты',value:'amulet'},
 {name:'🎒 Рюкзаки',value:'backpack'},{name:'🧪 Расходники',value:'consumable'},{name:'📦 Материалы',value:'material'},{name:'🔑 Инструменты',value:'utility'},{name:'⭐ Артефакты',value:'artifact'}
];
function missing(){return {content:'❌ У тебя ещё нет героя. Создай его командой `/hero create`.',flags:MessageFlags.Ephemeral};}
function date(v){try{return new Date(`${v}Z`).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'});}catch(_){return v;}}
function rarity(r){return RARITY_LABELS[r]||r;}
function upgradedName(i){const level=Number(i.upgrade_level)||0;return `${i.name}${level>0?` +${level}`:''}`;}
function itemLine(i){return `**#${i.id} · ${upgradedName(i)}** [${rarity(i.rarity)}] ×${i.quantity}`;}

module.exports={
 data:new SlashCommandBuilder().setName('hero').setDescription('Герой, экипировка и RPG-система GS Expeditions')
  .addSubcommand(s=>s.setName('create').setDescription('Создать своего единственного героя')
   .addStringOption(o=>o.setName('name').setDescription('Имя героя: 2–24 символа').setMinLength(2).setMaxLength(24).setRequired(true))
   .addStringOption(o=>o.setName('gender').setDescription('Пол героя').setRequired(true).addChoices({name:'♂️ Мужской',value:'male'},{name:'♀️ Женский',value:'female'}))
   .addStringOption(o=>o.setName('class').setDescription('Один из 12 классов World Boss').setRequired(true).addChoices(...classChoices))
   .addStringOption(o=>o.setName('origin').setDescription('Происхождение и пассивный бонус').setRequired(true).addChoices(...originChoices)))
  .addSubcommand(s=>s.setName('view').setDescription('Показать карточку героя').addUserOption(o=>o.setName('user').setDescription('Герой другого участника')))
  .addSubcommand(s=>s.setName('stats').setDescription('Характеристики с учётом экипировки').addUserOption(o=>o.setName('user').setDescription('Герой другого участника')))
  .addSubcommand(s=>s.setName('equipment').setDescription('Показать экипировку героя или комплекта класса').addUserOption(o=>o.setName('user').setDescription('Герой другого участника')).addStringOption(o=>o.setName('class').setDescription('Комплект конкретного класса').addChoices(...classChoices)))
  .addSubcommand(s=>s.setName('inventory').setDescription('Показать инвентарь').addStringOption(o=>o.setName('category').setDescription('Категория').addChoices(...typeChoices)))
  .addSubcommand(s=>s.setName('item').setDescription('Подробности предмета по номеру из инвентаря').addIntegerOption(o=>o.setName('id').setDescription('Номер #ID').setMinValue(1).setRequired(true)))
  .addSubcommand(s=>s.setName('equip').setDescription('Экипировать предмет по номеру #ID').addIntegerOption(o=>o.setName('id').setDescription('Номер предмета из /hero inventory').setMinValue(1).setRequired(true)).addStringOption(o=>o.setName('class').setDescription('Сохранить в комплект выбранного класса').addChoices(...classChoices)))
  .addSubcommand(s=>s.setName('unequip').setDescription('Снять предмет').addStringOption(o=>o.setName('slot').setDescription('Слот').setRequired(true).addChoices(...slotChoices)).addStringOption(o=>o.setName('class').setDescription('Снять из комплекта выбранного класса').addChoices(...classChoices)))
  .addSubcommand(s=>s.setName('collection').setDescription('Энциклопедия найденных предметов'))
  .addSubcommand(s=>s.setName('history').setDescription('Последние события истории героя').addUserOption(o=>o.setName('user').setDescription('Герой другого участника')))
  .addSubcommand(s=>s.setName('classes').setDescription('Список классов'))
  .addSubcommand(s=>s.setName('origins').setDescription('Список происхождений')),
 async execute(interaction){
  const sub=interaction.options.getSubcommand();
  if(sub==='classes'){
   const hero=getHero(interaction.user.id);
   if(!hero){
    const text=Object.values(HERO_CLASSES).map(c=>`${c.icon} **${c.name}** — ${c.role}\n❤️ ${c.hp} · ⚔️ ${c.strength} · 🛡️ ${c.defense} · 🏃 ${c.dexterity} · 🧠 ${c.intelligence} · 🍀 ${c.luck}`).join('\n\n');
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('⚔️ 12 классов героев').setDescription(text)],flags:MessageFlags.Ephemeral});
   }
   const rows=getAllClassProgress(interaction.user.id);
   const text=rows.map(row=>{const c=HERO_CLASSES[row.class_key],rank=getMasteryRank(row.level),pct=classProgressPercent(row.level,row.xp),b=classWorldBossBonuses(row.level,row.class_key);return `${c.icon} **${c.name} Lv.${row.level}** • ${rank.name}\n${row.level>=50?'MAX':`${row.xp}/${classXpForNextLevel(row.level)} XP`} • ${pct}% • WB: ⚔️+${b.damagePercent}% ❤️+${b.hpPercent}% 🛡️+${b.resistancePercent}%`;}).join('\n\n');
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`📚 Классы героя ${hero.name}`).setDescription(text).setFooter({text:'Класс получает XP только в тех экспедициях, где он был выбран.'})],flags:MessageFlags.Ephemeral});
  }
  if(sub==='origins'){
   const text=Object.values(ORIGINS).map(o=>`${o.icon} **${o.name}** — ${o.description}\n*${o.passive}*`).join('\n\n');
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0xA855F7).setTitle('📜 Происхождения').setDescription(text)],flags:MessageFlags.Ephemeral});
  }
  if(sub==='create'){
   if(getHero(interaction.user.id))return interaction.reply({content:'❌ У тебя уже есть герой.',flags:MessageFlags.Ephemeral});
   const result=createHero({userId:interaction.user.id,name:interaction.options.getString('name'),gender:interaction.options.getString('gender'),classKey:interaction.options.getString('class'),originKey:interaction.options.getString('origin')});
   if(!result.ok)return interaction.reply({content:result.reason==='name'?'❌ Имя должно содержать от 2 до 24 символов.':'❌ Не удалось создать героя.',flags:MessageFlags.Ephemeral});
   await interaction.deferReply(); const effective=getEffectiveHero(result.hero); const buffer=await createHeroCard(effective,interaction.user);
   return interaction.editReply({content:`✨ **${result.hero.name}** вступает в мир Game Syndicate и получает стартовый предмет!`,files:[new AttachmentBuilder(buffer,{name:`hero-${interaction.user.id}.png`})]});
  }
  const target=interaction.options.getUser('user')||interaction.user;
  if(target.bot)return interaction.reply({content:'❌ У ботов нет героев.',flags:MessageFlags.Ephemeral});
  const base=getHero(target.id); if(!base)return interaction.reply(target.id===interaction.user.id?missing():{content:'❌ У этого участника ещё нет героя.',flags:MessageFlags.Ephemeral});
  const hero=getEffectiveHero(base),cls=HERO_CLASSES[hero.class_key],org=ORIGINS[hero.origin_key];
  if(sub==='view'){await interaction.deferReply();const buffer=await createHeroCard(hero,target);return interaction.editReply({files:[new AttachmentBuilder(buffer,{name:`hero-${target.id}.png`})]});}
  if(sub==='stats'){
   const req=xpForNextLevel(hero.level);const b=hero.equipmentBonuses||{};
   const lines=Object.entries(STAT_LABELS).map(([k,l])=>`**${l}:** ${k==='hp'?`${hero.hp}/${hero.max_hp}`:hero[k]}${b[k]?` *(+${b[k]} экипировка)*`:''}`).join('\n');
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${cls.icon} ${hero.name} — характеристики`).setDescription(lines).addFields({name:'Класс',value:`${cls.name} • ${cls.role}`,inline:true},{name:'Происхождение',value:`${org.icon} ${org.name}`,inline:true},{name:'Уровень',value:`${hero.level} • ${hero.xp}/${req} XP`,inline:true},{name:'Экспедиции',value:`+${b.expedition_success||0}% успех · +${b.rare_find||0}% редкая добыча`,inline:false},{name:'World Boss',value:`+${b.world_boss_damage||0}% урон · +${b.world_boss_resistance||0}% защита`,inline:false})]});
  }
  if(sub==='equipment'){
   const classKey=interaction.options.getString('class');
   const selectedClass=classKey?HERO_CLASSES[classKey]:null;
   const items=classKey?getClassEquipment(target.id,classKey,{fallback:true}):getEquipment(target.id);
   const by=new Map(items.map(e=>[e.slot,e]));
   const text=Object.entries(SLOT_LABELS).map(([k,l])=>{const i=by.get(k);return `${l}: ${i?`**${upgradedName(i)}** [${rarity(i.rarity)}]`:'—'}`;}).join('\n');
   const title=selectedClass?`Экипировка ${selectedClass.icon} ${selectedClass.name}: ${hero.name}`:`Экипировка: ${hero.name}`;
   const footer=selectedClass
    ?'Если у класса нет собственного комплекта, показывается общая экипировка.'
    :'Используй /hero equip id:<номер> и /hero unequip.';
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle(title).setDescription(text).setFooter({text:footer})]});
  }
  if(sub==='inventory'){
   const category=interaction.options.getString('category')||'all'; const items=getInventory(interaction.user.id,{type:category==='all'?null:category,limit:40});
   const text=items.length?items.map(itemLine).join('\n'):'В этой категории пока нет предметов.';
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x9333EA).setTitle(`🎒 Инвентарь: ${hero.name}`).setDescription(text).setFooter({text:'Номер #ID нужен для просмотра и экипировки предмета.'})],flags:MessageFlags.Ephemeral});
  }
  if(sub==='item'){
   const item=getInventoryItem(interaction.user.id,interaction.options.getInteger('id')); if(!item)return interaction.reply({content:'❌ Предмет с таким #ID не найден в твоём инвентаре.',flags:MessageFlags.Ephemeral});
   const bonuses=formatBonuses(applyUpgradeToBonuses(parseBonuses(item.bonuses_json),item.upgrade_level)); return interaction.reply({embeds:[new EmbedBuilder().setColor(0xA855F7).setTitle(`${upgradedName(item)} · ${rarity(item.rarity)}`).setDescription(`${item.description}\n\n*${item.lore||'История предмета пока неизвестна.'}*`).addFields({name:'Тип',value:`${TYPE_LABELS[item.item_type]||item.item_type}${item.slot?` · ${SLOT_LABELS[item.slot]}`:''}`,inline:true},{name:'Количество',value:String(item.quantity),inline:true},{name:'Бонусы',value:bonuses.join('\n')||'Нет постоянных бонусов.'}).setFooter({text:`Инвентарный ID: #${item.id}`})],flags:MessageFlags.Ephemeral});
  }
  if(sub==='equip'){
   const classKey=interaction.options.getString('class');
   const result=classKey?equipItemForClass(interaction.user.id,interaction.options.getInteger('id'),classKey):equipItem(interaction.user.id,interaction.options.getInteger('id'));
   if(!result.ok)return interaction.reply({content:result.reason==='not_equippable'?'❌ Этот предмет нельзя экипировать.':result.reason==='invalid_class'?'❌ Неизвестный класс.':'❌ Предмет не найден.',flags:MessageFlags.Ephemeral});
   const c=classKey?HERO_CLASSES[classKey]:null;
   return interaction.reply({content:`✅ **${upgradedName(result.item)}** экипирован в слот «${SLOT_LABELS[result.slot]}»${c?` комплекта ${c.icon} **${c.name}**`:' общей экипировки'}.`,flags:MessageFlags.Ephemeral});
  }
  if(sub==='unequip'){
   const slot=interaction.options.getString('slot'),classKey=interaction.options.getString('class');
   const result=classKey?unequipItemForClass(interaction.user.id,slot,classKey):unequipItem(interaction.user.id,slot);
   const c=classKey?HERO_CLASSES[classKey]:null;
   return interaction.reply({content:result.ok?`✅ Слот «${SLOT_LABELS[slot]}» освобождён${c?` в комплекте ${c.icon} **${c.name}**`:''}.`:'ℹ️ В этом слоте ничего не было.',flags:MessageFlags.Ephemeral});
  }
  if(sub==='collection'){
   const c=getCollection(interaction.user.id);const counts={};for(const i of c.rows)counts[i.rarity]=(counts[i.rarity]||0)+1;
   const detail=Object.entries(RARITY_LABELS).map(([k,v])=>`**${v}:** ${counts[k]||0}`).join('\n');
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0xC084FC).setTitle('📚 Коллекционный индекс предметов').setDescription(`Найдено уникальных предметов: **${c.found} / ${c.total}**\n\n${detail}`).setFooter({text:'Запись остаётся в коллекции даже после будущей продажи или использования предмета.'})],flags:MessageFlags.Ephemeral});
  }
  if(sub==='history'){
   const rows=getHistory(target.id,10);const text=rows.length?rows.map(r=>`**${date(r.created_at)}**\n${r.description}`).join('\n\n'):'История пока пуста.';
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0xA855F7).setTitle(`📖 История: ${hero.name}`).setDescription(text).setFooter({text:`HERO #${String(hero.hero_number).padStart(5,'0')}`})]});
  }
 }
};
