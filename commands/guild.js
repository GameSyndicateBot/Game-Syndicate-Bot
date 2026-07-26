const {
  SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');

const { getHero, createHero, addHistory } = require('../systems/hero/heroService');
const { getEffectiveHero, getInventory, getEquipment, getInventoryItem, equipItem, unequipItem, formatBonuses } = require('../systems/hero/itemService');
const { listRecipes, hydrateRecipe, craft } = require('../systems/hero/craftingService');
const { getUpgradeInfo, upgradeItem, MAX_UPGRADE } = require('../systems/hero/upgradeService');
const { listCompanions, activateCompanion } = require('../systems/hero/companionService');
const { COMPANIONS, RARITY_LABELS: COMPANION_RARITIES } = require('../systems/hero/companionData');
const { RARITY_LABELS } = require('../systems/hero/itemData');
const { HERO_CLASSES, ORIGINS, GENDERS } = require('../systems/hero/heroData');
const { getAllClassProgress, getClassProgress, classXpForNextLevel, classWorldBossBonuses, getMasteryRank, getNextMilestone, classProgressPercent } = require('../systems/hero/classProgressService');
const { getActiveExpedition } = require('../systems/hero/expeditionService');
const { createGuildHubCard } = require('../images/hero/createGuildHubCard');
const { createHeroCard } = require('../images/hero/createHeroCard');
const { db, getCardDust, removeCardDust } = require('../database/db');
const { PROFESSIONS, SPECIALIZATIONS, getProfession, getProfessionCounts, getProfessionLeaders, getAllProfessionLeaders } = require('../systems/hero/professionService');
const { ITEMS } = require('../systems/hero/itemData');
const { listOpenOrders, stats: getOrderStats } = require('../systems/hero/orderBoardService');

const GUILD_CHANNEL_ID = '1530165282512044032';
const EXPEDITION_CHANNEL_ID = '1529566430301782017';
const HUB_MARKER = '🏰 **ГИЛЬДИЯ ГЕРОЕВ • GAME SYNDICATE**';

function hubRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:create').setLabel('Создать героя').setEmoji('🧙').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('guild:profile').setLabel('Профиль').setEmoji('👤').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:inventory').setLabel('Инвентарь').setEmoji('🎒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:storage').setLabel('Хранилище').setEmoji('📦').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:blacksmith').setLabel('Кузнец').setEmoji('⚒️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:alchemist').setLabel('Алхимик').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:pets').setLabel('Питомцы').setEmoji('🐾').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:artifacts').setLabel('Артефакты').setEmoji('💍').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:classes').setLabel('Классы').setEmoji('📚').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:codex').setLabel('Кодекс').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:registry').setLabel('Реестр Гильдии').setEmoji('📖').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:masters').setLabel('Зал мастеров').setEmoji('🏆').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:profession').setLabel('Профессия').setEmoji('👷').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:orders').setLabel('Доска заказов').setEmoji('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:hospital').setLabel('Лечебница').setEmoji('🏥').setStyle(ButtonStyle.Success),
    ),
  ];
}

async function hubPayload() {
  const buffer = await createGuildHubCard();
  return {
    content: `${HUB_MARKER}\nСоздай героя и управляй его развитием через кнопки ниже.`,
    files: [new AttachmentBuilder(buffer, { name: 'gs-guild-hub.png' })],
    components: hubRows(),
  };
}

async function ensureGuildHub(client) {
  try {
    const channel = await client.channels.fetch(GUILD_CHANNEL_ID);
    if (!channel?.isTextBased()) return null;
    const recent = await channel.messages.fetch({ limit: 50 });
    const existing = recent.find(m => m.author.id === client.user.id && m.content.startsWith(HUB_MARKER));
    const payload = await hubPayload();
    if (existing) {
      await existing.edit(payload);
      return existing;
    }
    return await channel.send(payload);
  } catch (error) {
    console.error('[Guild Hub] Не удалось создать/обновить панель:', error);
    return null;
  }
}

function creationSummary(state) {
  const gender = state.gender ? GENDERS[state.gender] : 'не выбран';
  const cls = state.classKey ? `${HERO_CLASSES[state.classKey].icon} ${HERO_CLASSES[state.classKey].name}` : 'не выбран';
  const origin = state.originKey ? `${ORIGINS[state.originKey].icon} ${ORIGINS[state.originKey].name}` : 'не выбрано';
  return `## 🧙 Создание героя\n**Пол:** ${gender}\n**Класс:** ${cls}\n**Происхождение:** ${origin}`;
}

function genderMenu() {
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('guild:create:gender').setPlaceholder('Выбери пол героя').addOptions(
      { label: 'Мужской', value: 'male', emoji: '♂️' },
      { label: 'Женский', value: 'female', emoji: '♀️' },
    ),
  )];
}

function classMenu(gender) {
  const options = Object.entries(HERO_CLASSES).map(([value, c]) => ({
    label: c.name, value, emoji: c.icon, description: `${c.role} • HP ${c.hp}`,
  }));
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`guild:create:class:${gender}`).setPlaceholder('Выбери класс героя').addOptions(options),
  )];
}

function originMenu(gender, classKey) {
  const options = Object.entries(ORIGINS).map(([value, o]) => ({
    label: o.name, value, emoji: o.icon, description: o.passive.slice(0, 100),
  }));
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`guild:create:origin:${gender}:${classKey}`).setPlaceholder('Выбери происхождение').addOptions(options),
  )];
}

async function showProfile(interaction) {
  const base = getHero(interaction.user.id);
  if (!base) return interaction.reply({ content: '❌ Сначала создай героя кнопкой **«Создать героя»**.', flags: MessageFlags.Ephemeral });
  const hero = getEffectiveHero(base);
  const buffer = await createHeroCard(hero, interaction.user);
  return interaction.reply({
    content: `👤 **Профиль героя ${hero.name}**`,
    files: [new AttachmentBuilder(buffer, { name: `hero-${interaction.user.id}.png` })],
    flags: MessageFlags.Ephemeral,
  });
}

async function showInventory(interaction, notice = '') {
  const hero = getHero(interaction.user.id);
  if (!hero) return interaction.reply({ content: '❌ Сначала создай героя.', flags: MessageFlags.Ephemeral });
  const items = getInventory(interaction.user.id, { limit: 100 });
  const equipment = getEquipment(interaction.user.id);
  const equippedIds = new Set(equipment.map(i => Number(i.inventory_id)));
  const slotLabels = { weapon:'Оружие', armor:'Броня', helmet:'Шлем', accessory:'Аксессуар', boots:'Обувь' };
  const equippedText = equipment.length
    ? equipment.map(i => `${i.slot === 'weapon' ? '⚔️' : '🛡️'} **${slotLabels[i.slot] || i.slot}:** ${i.name}${Number(i.upgrade_level||0) ? ` +${i.upgrade_level}` : ''}`).join('\n')
    : 'Экипировка пока не надета. Стартовые характеристики героя действуют без отдельного предмета.';
  const itemText = items.length
    ? items.slice(0, 25).map(i => {
        const mark = equippedIds.has(Number(i.id)) ? '🟢' : i.slot ? '⚪' : '📦';
        const bonuses = formatBonuses(i.bonuses_json);
        return `${mark} **#${i.id} ${i.name}**${Number(i.upgrade_level||0) ? ` +${i.upgrade_level}` : ''} ×${i.quantity} · ${RARITY_LABELS[i.rarity] || i.rarity}${i.slot ? `\nСлот: **${slotLabels[i.slot] || i.slot}**` : ''}${bonuses.length ? ` · ${bonuses.join(' · ')}` : ''}`;
      }).join('\n\n')
    : 'Инвентарь пока пуст.';
  const embed = new EmbedBuilder().setColor(0x8B5CF6).setTitle(`🎒 Инвентарь — ${hero.name}`)
    .setDescription([notice, '**Сейчас экипировано**', equippedText, '', '**Предметы**', itemText].filter(Boolean).join('\n').slice(0,4000))
    .setFooter({text:'Выбери предмет ниже, чтобы надеть или снять его.'});
  const components=[];
  const equippable=items.filter(i=>i.slot).slice(0,25);
  if(equippable.length) components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('guild:inventory:select').setPlaceholder('Выбрать предмет экипировки')
      .addOptions(equippable.map(i=>({label:`#${i.id} ${i.name}${Number(i.upgrade_level||0)?` +${i.upgrade_level}`:''}`.slice(0,100),value:String(i.id),emoji:equippedIds.has(Number(i.id))?'🟢':'⚔️',description:`${slotLabels[i.slot]||i.slot} · ${equippedIds.has(Number(i.id))?'сейчас надето':'можно экипировать'}`.slice(0,100)})))
  ));
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:home').setLabel('Вернуться в Гильдию').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  ));
  const payload={embeds:[embed],components};

  // Главное сообщение Гильдии является общим для всего сервера.
  // Его нельзя заменять личным инвентарём нажавшего игрока.
  // Обновляем только уже созданное ephemeral-меню владельца,
  // а при нажатии на публичную панель всегда создаём новый личный ответ.
  const isEphemeralMessage = Boolean(
    interaction.message?.flags?.has?.(MessageFlags.Ephemeral)
  );

  return isEphemeralMessage
    ? interaction.update(payload)
    : interaction.reply({...payload,flags:MessageFlags.Ephemeral});
}

async function showInventoryItem(interaction, inventoryId, notice='') {
  const item=getInventoryItem(interaction.user.id, Number(inventoryId));
  if(!item) return showInventory(interaction,'❌ Предмет не найден.');
  const equipment=getEquipment(interaction.user.id);
  const equipped=equipment.some(i=>Number(i.inventory_id)===Number(item.id));
  const bonuses=formatBonuses(item.bonuses_json);
  const embed=new EmbedBuilder().setColor(equipped?0x22C55E:0x7C3AED).setTitle(`${equipped?'🟢':'⚔️'} ${item.name}`)
    .setDescription([notice,item.description,`⭐ **Редкость:** ${RARITY_LABELS[item.rarity]||item.rarity}`,`🎒 **Слот:** ${item.slot||'не экипируется'}`,`✨ **Улучшение:** +${Number(item.upgrade_level||0)}`,bonuses.length?`📊 ${bonuses.join('\n')}`:'',equipped?'\n✅ Сейчас надето.':'\nПредмет находится в инвентаре.'].filter(Boolean).join('\n'));
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:inventory').setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`guild:inventory:${equipped?'unequip':'equip'}:${item.id}`).setLabel(equipped?'Снять':'Экипировать').setEmoji(equipped?'📤':'⚔️').setStyle(equipped?ButtonStyle.Danger:ButtonStyle.Success)
  );
  return interaction.update({embeds:[embed],components:[row]});
}

function progressBar(percent, size = 10) {
  const filled = Math.max(0, Math.min(size, Math.round((Number(percent) || 0) / 100 * size)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)}`;
}

function classesMenu(userId) {
  const rows = getAllClassProgress(userId);
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('guild:classes:select')
      .setPlaceholder('Открыть подробности класса')
      .addOptions(rows.map(row => {
        const cls = HERO_CLASSES[row.class_key];
        const rank = getMasteryRank(row.level);
        return {
          label: `${cls.name} • Lv.${row.level}`,
          value: row.class_key,
          emoji: cls.icon,
          description: `${rank.name} • ${row.expeditions_completed || 0} экспедиций`,
        };
      })),
  )];
}

async function showClasses(interaction) {
  const hero = getHero(interaction.user.id);
  if (!hero) return interaction.reply({ content: '❌ Сначала создай героя.', flags: MessageFlags.Ephemeral });
  const rows = getAllClassProgress(interaction.user.id);
  const text = rows.map(row => {
    const cls = HERO_CLASSES[row.class_key];
    const pct = classProgressPercent(row.level, row.xp);
    const rank = getMasteryRank(row.level);
    const xpText = row.level >= 50 ? 'MAX' : `${row.xp}/${classXpForNextLevel(row.level)} XP`;
    return `${cls.icon} **${cls.name} Lv.${row.level}** • ${rank.icon} ${rank.name}\n${progressBar(pct)} ${xpText}`;
  }).join('\n\n');
  return interaction.reply({
    content: `## 📚 Классы героя — ${hero.name}\nОпыт получает класс, выбранный перед экспедицией. В World Boss можно выбрать любой класс, а его прокачка даст небольшой ограниченный бонус.\n\n${text}`,
    components: classesMenu(interaction.user.id),
    flags: MessageFlags.Ephemeral,
  });
}

async function showClassDetails(interaction, classKey) {
  const hero = getHero(interaction.user.id);
  if (!hero) return interaction.update({ content: '❌ Герой не найден.', components: [] });
  const row = getClassProgress(interaction.user.id, classKey) || { class_key: classKey, level: 1, xp: 0, expeditions_completed: 0 };
  const cls = HERO_CLASSES[classKey];
  if (!cls) return interaction.update({ content: '❌ Неизвестный класс.', components: classesMenu(interaction.user.id) });
  const bonus = classWorldBossBonuses(row.level);
  const rank = getMasteryRank(row.level);
  const next = getNextMilestone(row.level);
  const pct = classProgressPercent(row.level, row.xp);
  const xpText = row.level >= 50 ? 'Максимальный уровень' : `${row.xp}/${classXpForNextLevel(row.level)} XP`;
  return interaction.update({
    content: `## ${cls.icon} ${cls.name} — Lv.${row.level}\n**Роль:** ${cls.role}\n**Мастерство:** ${rank.icon} ${rank.name}\n**Экспедиций этим классом:** ${row.expeditions_completed || 0}\n\n${progressBar(pct, 12)} **${xpText}**\n${next ? `Следующий ранг: **${next.name}** на Lv.${next.level}` : 'Достигнут высший ранг класса.'}\n\n### Бонусы в World Boss\n⚔️ Урон: **+${bonus.damagePercent}%**\n❤️ HP: **+${bonus.hpPercent}%**\n🛡️ Сопротивление: **+${bonus.resistancePercent}%**\n\n*Бонусы уже ограничены общими капами World Boss и не заменяют правильный выбор способностей и командную игру.*`,
    components: classesMenu(interaction.user.id),
  });
}


function guildNavRow(active) {
  const defs = [
    ['blacksmith', 'Кузнец', '⚒️'],
    ['alchemist', 'Алхимик', '🧪'],
    ['pets', 'Питомцы', '🐾'],
    ['artifacts', 'Артефакты', '💍'],
  ];
  return new ActionRowBuilder().addComponents(defs.map(([key,label,emoji]) =>
    new ButtonBuilder().setCustomId(`guild:${key}`).setLabel(label).setEmoji(emoji)
      .setStyle(key === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(key === active)
  ));
}

function recipeMaterials(recipe) {
  return recipe.materials.map(m => `${m.icon} ${m.name}: **${m.owned}/${m.required}**${m.owned >= m.required ? ' ✅' : ' ❌'}`).join('\n');
}

async function showBlacksmith(interaction, notice = '') {
  const hero = getHero(interaction.user.id);
  if (!hero) return interaction.reply({ content: '❌ Сначала создай героя.', flags: MessageFlags.Ephemeral });
  const recipes = listRecipes(interaction.user.id).filter(r => r.npc !== 'Алхимик Лира');
  const items = getInventory(interaction.user.id, { limit: 100 }).filter(i => i.slot && Number(i.upgrade_level || 0) < MAX_UPGRADE);
  const readyRecipes = recipes.filter(r => r.canCraft).length;
  const embed = new EmbedBuilder().setColor(0xF59E0B).setTitle('⚒️ Кузница Гильдии')
    .setDescription([
      notice,
      '*Здесь можно создавать экипировку и усиливать найденные предметы до +10.*',
      '',
      `🔨 **Рецептов:** ${recipes.length} · доступно сейчас: **${readyRecipes}**`,
      `✨ **Предметов для улучшения:** **${items.length}**`,
      '',
      'Выбери рецепт или предмет в меню ниже.',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `Герой: ${hero.name} · ресурсы при неудачном улучшении расходуются, предмет не ломается` });

  const components = [guildNavRow('blacksmith')];
  if (recipes.length) components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('guild:blacksmith:recipe').setPlaceholder('🔨 Выбрать рецепт')
      .addOptions(recipes.slice(0,25).map(r => ({
        label:r.item.name.slice(0,100), value:r.key, emoji:r.canCraft?'✅':'🔒',
        description:`ур. ${r.level} · ${r.dust} Dust · ${r.canCraft?'можно создать':'не хватает ресурсов'}`.slice(0,100)
      })))
  ));
  if (items.length) components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('guild:blacksmith:upgrade').setPlaceholder('✨ Выбрать предмет для улучшения')
      .addOptions(items.slice(0,25).map(i => ({
        label:`#${i.id} ${i.name} +${i.upgrade_level || 0}`.slice(0,100), value:String(i.id), emoji:'⚒️',
        description:`${RARITY_LABELS[i.rarity] || i.rarity} · следующий уровень +${Number(i.upgrade_level || 0)+1}`.slice(0,100)
      })))
  ));
  return interaction.reply({ embeds:[embed], components, flags:MessageFlags.Ephemeral });
}

async function showBlacksmithRecipe(interaction, recipeKey, notice = '') {
  const recipe = hydrateRecipe(recipeKey, interaction.user.id);
  if (!recipe || recipe.npc === 'Алхимик Лира') return interaction.update({ content:'❌ Рецепт не найден.', embeds:[], components:[guildNavRow('blacksmith')] });
  const embed = new EmbedBuilder().setColor(recipe.canCraft?0x22C55E:0xF59E0B).setTitle(`🔨 ${recipe.item.name}`)
    .setDescription([
      notice,
      recipe.item.description,
      '',
      `⭐ **Редкость:** ${RARITY_LABELS[recipe.item.rarity] || recipe.item.rarity}`,
      `🧙 **Уровень:** ${recipe.level} · у тебя ${recipe.heroLevel}`,
      `💠 **Стоимость:** ${recipe.dust} Dust · у тебя ${recipe.dustBalance}`,
      '',
      '**Материалы**',
      recipeMaterials(recipe),
    ].filter(Boolean).join('\n'));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:blacksmith').setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`guild:blacksmith:craft:${recipeKey}`).setLabel('Создать').setEmoji('🔨').setStyle(ButtonStyle.Success).setDisabled(!recipe.canCraft)
  );
  return interaction.update({ embeds:[embed], components:[guildNavRow('blacksmith'),row] });
}

async function showUpgrade(interaction, inventoryId, notice = '') {
  const info = getUpgradeInfo(interaction.user.id, Number(inventoryId));
  if (!info.ok) return interaction.update({ content:'❌ Предмет не найден или его нельзя улучшить.', embeds:[], components:[guildNavRow('blacksmith')] });
  if (info.maxed) return interaction.update({ content:`✅ **${info.item.name}** уже улучшен до +${MAX_UPGRADE}.`, embeds:[], components:[guildNavRow('blacksmith')] });
  const materials = info.cost.materials.map(m => `${m.icon} ${m.name}: **${m.owned}/${m.required}**${m.owned>=m.required?' ✅':' ❌'}`).join('\n');
  const embed = new EmbedBuilder().setColor(info.canAfford?0x22C55E:0xF59E0B)
    .setTitle(`✨ ${info.item.name} +${info.level} → +${info.targetLevel}`)
    .setDescription([notice,`**Шанс успеха:** ${info.chance}%`,`**Стоимость:** 💠 ${info.cost.dust} Dust`,'','**Материалы**',materials,'',info.canAfford?'✅ Всё готово к улучшению.':'🔒 Не хватает ресурсов.'].filter(Boolean).join('\n'))
    .setFooter({text:'При неудаче уровень и предмет сохраняются, ресурсы расходуются.'});
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:blacksmith').setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`guild:blacksmith:apply:${inventoryId}`).setLabel('Улучшить').setEmoji('⚒️').setStyle(ButtonStyle.Success).setDisabled(!info.canAfford)
  );
  return interaction.update({embeds:[embed],components:[guildNavRow('blacksmith'),row]});
}

async function showPets(interaction, notice = '') {
  const hero=getHero(interaction.user.id);
  if(!hero)return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const rows=listCompanions(interaction.user.id);
  const text=rows.length?rows.map(r=>{
    const d=COMPANIONS[r.companion_key]||{};
    const bonuses=Object.entries(d.bonuses||{}).map(([k,v])=>`${k==='expedition_success'?'успех экспедиций':k==='rare_find'?'редкая добыча':k==='world_boss_damage'?'урон по боссу':'защита от босса'} +${v}%`).join(' · ');
    return `${r.active?'🟢':'⚪'} **#${r.id} ${d.icon||'🐾'} ${r.name}** · ${COMPANION_RARITIES[r.rarity]||r.rarity}\n${bonuses||'Без пассивного бонуса'}`;
  }).join('\n\n'):'Питомцев пока нет. Их можно найти в редких экспедиционных событиях или получить в магазине.';
  const embed=new EmbedBuilder().setColor(0x38BDF8).setTitle('🐾 Питомцы героя').setDescription([notice,text].filter(Boolean).join('\n\n')).setFooter({text:'Активным может быть только один питомец.'});
  const components=[guildNavRow('pets')];
  if(rows.length)components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('guild:pets:activate').setPlaceholder('Выбрать активного питомца')
      .addOptions(rows.slice(0,25).map(r=>({label:`#${r.id} ${r.name}`.slice(0,100),value:String(r.id),emoji:r.active?'🟢':'🐾',description:r.active?'Сейчас активен':'Сделать активным'})))
  ));
  return interaction.reply({embeds:[embed],components,flags:MessageFlags.Ephemeral});
}

async function showArtifacts(interaction) {
  const hero=getHero(interaction.user.id);
  if(!hero)return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const items=getInventory(interaction.user.id,{type:'artifact',limit:50});
  const text=items.length?items.map(i=>{
    const bonuses=formatBonuses(i.bonuses_json);
    return `💍 **#${i.id} ${i.name}** ×${i.quantity} · ${RARITY_LABELS[i.rarity]||i.rarity}\n${i.description}${bonuses.length?`\n${bonuses.join(' · ')}`:''}`;
  }).join('\n\n'):'Артефактов пока нет. Это редчайшие реликвии, которые выпадают в особых экспедициях и с сильных противников.';
  const embed=new EmbedBuilder().setColor(0xA855F7).setTitle('💍 Артефакты героя').setDescription(text.slice(0,4000))
    .setFooter({text:'Артефакты хранятся отдельно от обычной экипировки и дают постоянные коллекционные реликвии.'});
  return interaction.reply({embeds:[embed],components:[guildNavRow('artifacts')],flags:MessageFlags.Ephemeral});
}


function registryRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:registry:heroes').setLabel('Герои').setEmoji('👥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:registry:classes').setLabel('Классы').setEmoji('⚔️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:registry:professions').setLabel('Профессии').setEmoji('👷').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:masters').setLabel('Зал мастеров').setEmoji('🏆').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:registry:stats').setLabel('Статистика').setEmoji('📊').setStyle(ButtonStyle.Secondary),
    ),
    guildNavRow('registry'),
  ];
}
function discordName(interaction,userId, fallback='Неизвестный герой') {
  return interaction.guild?.members?.cache?.get(userId)?.displayName || fallback;
}
async function showRegistry(interaction) {
  const heroes=Number(db.prepare('SELECT COUNT(*) c FROM heroes').get()?.c||0);
  const counts=getProfessionCounts();
  const professionText=Object.entries(PROFESSIONS).map(([k,p])=>`${p.icon} ${p.name}: **${counts[k]||0}**`).join('\n');
  const embed=new EmbedBuilder().setColor(0x8B5CF6).setTitle('📖 Реестр Гильдии')
    .setDescription(`Здесь собраны герои, классы, профессии и лучшие мастера Game Syndicate.\n\n👥 Зарегистрировано героев: **${heroes}**\n\n${professionText}`);
  return interaction.reply({embeds:[embed],components:registryRows(),flags:MessageFlags.Ephemeral});
}

function hospitalPrice(hero) {
  const maxHp = Math.max(1, Number(hero?.max_hp || 1));
  const hp = Math.max(0, Math.min(maxHp, Number(hero?.hp || 0)));
  const missingPercent = Math.max(0, Math.round((maxHp - hp) / maxHp * 100));
  if (hp <= 0) return { price: 1500, tier: '☠️ Погиб', missingPercent };
  if (missingPercent <= 0 && hero?.status !== 'wounded') return { price: 0, tier: '🟢 Здоров', missingPercent: 0 };
  if (missingPercent <= 25) return { price: 250, tier: '🟡 Лёгкое ранение', missingPercent };
  if (missingPercent <= 50) return { price: 500, tier: '🟠 Среднее ранение', missingPercent };
  if (missingPercent <= 75) return { price: 850, tier: '🔴 Тяжёлое ранение', missingPercent };
  return { price: 1200, tier: '🩸 Критическое ранение', missingPercent };
}

function hospitalRows(hero, canHeal) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:hospital:heal').setLabel('Полностью вылечить').setEmoji('❤️').setStyle(ButtonStyle.Success).setDisabled(!canHeal),
      new ButtonBuilder().setCustomId('guild:hospital:expedition').setLabel('В экспедиции').setEmoji('🗺️').setStyle(ButtonStyle.Primary).setDisabled(hero?.status !== 'ready'),
      new ButtonBuilder().setCustomId('guild:home').setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function showHospital(interaction, notice = '') {
  const hero = getHero(interaction.user.id);
  if (!hero) return interaction.reply({ content: '❌ Сначала создай героя.', flags: MessageFlags.Ephemeral });
  const activeExpedition = getActiveExpedition(interaction.user.id);
  const balance = getCardDust(interaction.user.id);
  const treatment = hospitalPrice(hero);
  const canHeal = !activeExpedition && hero.status !== 'expedition' && treatment.price > 0;
  const statusText = activeExpedition || hero.status === 'expedition'
    ? '🗺️ Герой сейчас находится в экспедиции.'
    : hero.status === 'wounded'
      ? '🩹 Герой ранен и временно не может отправиться в новую экспедицию.'
      : treatment.price > 0 ? '🩹 Герою требуется лечение.' : '✅ Герой полностью здоров и готов к приключениям.';
  const embed = new EmbedBuilder().setColor(canHeal ? 0xD4A017 : 0x22C55E).setTitle(`🏥 Лечебница — ${hero.name}`)
    .setDescription([
      notice,
      statusText,
      '',
      `❤️ **HP:** ${hero.hp}/${hero.max_hp}`,
      `🩺 **Состояние:** ${treatment.tier}`,
      treatment.missingPercent ? `📉 **Потеряно здоровья:** ${treatment.missingPercent}%` : null,
      treatment.price ? `💠 **Полное лечение:** ${treatment.price} Dust` : '💠 **Лечение не требуется.**',
      `💰 **Баланс:** ${balance} Dust`,
      '',
      activeExpedition ? 'Лечение недоступно до возвращения героя.' : treatment.price > balance ? `❌ Не хватает **${treatment.price - balance} Dust**.` : treatment.price ? 'После оплаты герой сразу получит полное HP и статус **«Готов»**.' : 'Можно сразу отправляться в экспедицию.',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: 'Лечебница снимает ранение и отменяет оставшееся время восстановления.' });
  return interaction.reply({ embeds:[embed], components:hospitalRows(hero, canHeal && balance >= treatment.price), flags:MessageFlags.Ephemeral });
}

async function healInHospital(interaction) {
  const hero = getHero(interaction.user.id);
  if (!hero) return interaction.reply({ content:'❌ Герой не найден.', flags:MessageFlags.Ephemeral });
  if (getActiveExpedition(interaction.user.id) || hero.status === 'expedition') {
    return interaction.reply({ content:'❌ Нельзя лечить героя, пока он находится в экспедиции.', flags:MessageFlags.Ephemeral });
  }
  const treatment = hospitalPrice(hero);
  if (!treatment.price) return interaction.reply({ content:'✅ Герой уже полностью здоров.', flags:MessageFlags.Ephemeral });
  const payment = removeCardDust(interaction.user.id, treatment.price);
  if (!payment.ok) return interaction.reply({ content:`❌ Для лечения требуется **${treatment.price} Dust**. На балансе: **${payment.balance} Dust**.`, flags:MessageFlags.Ephemeral });
  db.prepare("UPDATE heroes SET hp=max_hp,status='ready',recovery_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(interaction.user.id);
  addHistory(interaction.user.id, 'hospital_treatment', `Герой полностью вылечен в лечебнице за ${treatment.price} Dust.`, { price:treatment.price, hpBefore:hero.hp, hpAfter:hero.max_hp });
  const updated = getHero(interaction.user.id);
  const embed = new EmbedBuilder().setColor(0x22C55E).setTitle('✅ Лечение завершено')
    .setDescription(`❤️ **${updated.name}: ${updated.hp}/${updated.max_hp} HP**\n💠 Потрачено: **${treatment.price} Dust**\n\nГерой полностью восстановлен и уже может отправляться в новую экспедицию.`);
  return interaction.reply({ embeds:[embed], components:hospitalRows(updated, false), flags:MessageFlags.Ephemeral });
}

async function showRegistryHeroes(interaction) {
  const rows=db.prepare(`SELECT h.user_id,h.name,h.level,h.class_key,hp.profession_key,hp.level profession_level
    FROM heroes h LEFT JOIN hero_professions hp ON hp.user_id=h.user_id ORDER BY h.level DESC,h.xp DESC LIMIT 25`).all();
  const text=rows.length?rows.map((h,i)=>{
    const cls=HERO_CLASSES[h.class_key];
    const prof=PROFESSIONS[h.profession_key];
    return `**${i+1}. ${h.name}** • ${cls?.icon||'⚔️'} ${cls?.name||h.class_key} • ⭐ ${h.level}${prof?` • ${prof.icon} ${prof.name} ${h.profession_level}`:''}`;
  }).join('\n'):'Героев пока нет.';
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('👥 Герои Гильдии').setDescription(text.slice(0,4000))],components:registryRows()});
}
async function showRegistryClasses(interaction) {
  const rows=db.prepare('SELECT class_key,COUNT(*) count FROM heroes GROUP BY class_key ORDER BY count DESC').all();
  const text=Object.entries(HERO_CLASSES).map(([k,c])=>`${c.icon} **${c.name}** — ${Number(rows.find(r=>r.class_key===k)?.count||0)}`).join('\n');
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('⚔️ Классы Гильдии').setDescription(text)],components:registryRows()});
}
async function showRegistryProfessions(interaction) {
  const counts=getProfessionCounts();
  const text=Object.entries(PROFESSIONS).map(([k,p])=>{
    const leader=getProfessionLeaders(k,1)[0];
    return `${p.icon} **${p.name}** — ${counts[k]||0}${leader?`\n👑 Лидер: **${leader.hero_name||'Без имени'}**, ур. ${leader.level}`:''}`;
  }).join('\n\n');
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('👷 Профессии Гильдии').setDescription(text)],components:registryRows()});
}
async function showMasters(interaction) {
  const all=getAllProfessionLeaders(5);
  const fields=[];
  for(const [key,p] of Object.entries(PROFESSIONS)){
    const rows=all[key]||[];
    const medals=['🥇','🥈','🥉','4️⃣','5️⃣'];
    const value=rows.length?rows.map((r,i)=>{
      const spec=r.specialization_key?SPECIALIZATIONS[key]?.[r.specialization_key]:null;
      return `${medals[i]||`${i+1}.`} **${r.hero_name||discordName(interaction,r.user_id)}** — ур. ${r.level}${spec?` • ${spec.icon} ${spec.name}`:''}`;
    }).join('\n'):'Пока нет представителей.';
    fields.push({name:`${p.icon} Лучшие ${p.name.toLowerCase()}и`,value,inline:false});
  }
  const embed=new EmbedBuilder().setColor(0xF59E0B).setTitle('🏆 Зал мастеров').setDescription('Рейтинг сортируется по уровню профессии, затем по опыту и числу выполненных работ. Лидер получает почётный статус 👑.').addFields(fields);
  return interaction.reply({embeds:[embed],components:registryRows(),flags:MessageFlags.Ephemeral});
}
async function showRegistryStats(interaction) {
  const heroStats=db.prepare(`SELECT COUNT(*) heroes,COALESCE(SUM(level),0) hero_levels FROM heroes`).get();
  const profStats=db.prepare(`SELECT COUNT(*) professionals,COALESCE(SUM(work_count),0) works,COALESCE(SUM(resources_gathered),0) resources FROM hero_professions`).get();
  const orderStats=getOrderStats();
  const dust=Number(db.prepare('SELECT COALESCE(SUM(card_dust),0) total FROM players').get()?.total||0);
  const embed=new EmbedBuilder().setColor(0x8B5CF6).setTitle('📊 Статистика Гильдии').setDescription(
    `👥 Героев: **${heroStats.heroes||0}**\n⭐ Суммарно уровней героев: **${heroStats.hero_levels||0}**\n👷 Выбрали профессию: **${profStats.professionals||0}**\n🔨 Выполнено работ: **${profStats.works||0}**\n📦 Собрано ресурсов: **${profStats.resources||0}**\n\n📜 Открытых заказов: **${orderStats.open_orders||0}**\n✅ Выполненных заказов: **${orderStats.completed_orders||0}**\n🔒 Зарезервировано: **${orderStats.reserved_dust||0} Dust**\n💰 Всего Dust у игроков: **${dust}**`
  );
  return interaction.update({embeds:[embed],components:registryRows()});
}
async function showProfessionHub(interaction) {
  const row=getProfession(interaction.user.id);
  if(!row)return interaction.reply({content:'👷 Профессия ещё не выбрана.\nИспользуй **/profession choose**, чтобы выбрать одну из пяти профессий.',flags:MessageFlags.Ephemeral});
  const p=PROFESSIONS[row.profession_key];
  const spec=row.specialization_key?SPECIALIZATIONS[row.profession_key]?.[row.specialization_key]:null;
  const embed=new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${p.icon} ${p.name} • ур. ${row.level}`)
    .setDescription(`⚡ Энергия: **${row.energy}/${row.energy_max}**\n🔨 Работ: **${row.work_count}**\n📦 Ресурсов собрано: **${row.resources_gathered||0}**\n📜 Заказов выполнено: **${row.orders_completed||0}**\n💰 Заработано: **${row.dust_earned||0} Dust**${spec?`\n🏅 Специализация: **${spec.icon} ${spec.name}**`:''}\n\nРабота: **/profession work**\nПолный прогресс: **/profession status**`);
  return interaction.reply({embeds:[embed],components:[guildNavRow('profession')],flags:MessageFlags.Ephemeral});
}
async function showStorage(interaction) {
  if(!getHero(interaction.user.id))return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const rows=db.prepare(`SELECT hi.item_key,hi.quantity,i.name FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key
    WHERE hi.user_id=? AND i.item_type='material' AND hi.quantity>0 ORDER BY i.name`).all(interaction.user.id);
  const text=rows.length?rows.map(r=>`📦 **${r.name}** ×${r.quantity}`).join('\n'):'Хранилище ресурсов пока пусто.';
  return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('📦 Хранилище ресурсов').setDescription(`${text}\n\nРесурсы профессий автоматически складываются сюда и используются доской заказов и ремесленниками.`.slice(0,4000))],components:[guildNavRow('storage')],flags:MessageFlags.Ephemeral});
}
async function showOrdersHub(interaction) {
  const rows=listOpenOrders(10);
  const text=rows.length?rows.map(o=>`#${o.id} • **${ITEMS[o.item_key]?.name||o.item_key}** ×${o.quantity_remaining} • ${o.price_each} Dust/шт.`).join('\n'):'Открытых заказов пока нет.';
  return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('📜 Доска заказов').setDescription(`${text}\n\nСоздать заказ: **/orders create**\nВыполнить: **/orders fulfill**\nМои заказы: **/orders mine**`)],components:[guildNavRow('orders')],flags:MessageFlags.Ephemeral});
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'create' && parts.length === 2) {
    if (getHero(interaction.user.id)) {
      return interaction.reply({ content: 'ℹ️ У тебя уже есть герой. Открой его через кнопку **«Профиль»**.', flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: creationSummary({}), components: genderMenu(), flags: MessageFlags.Ephemeral });
  }

  if (action === 'create' && parts[2] === 'gender') {
    const gender = interaction.values[0];
    return interaction.update({ content: creationSummary({ gender }), components: classMenu(gender) });
  }

  if (action === 'create' && parts[2] === 'class') {
    const gender = parts[3];
    const classKey = interaction.values[0];
    return interaction.update({ content: creationSummary({ gender, classKey }), components: originMenu(gender, classKey) });
  }

  if (action === 'create' && parts[2] === 'origin') {
    const [, , , gender, classKey] = parts;
    const originKey = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(`guild:create:modal:${gender}:${classKey}:${originKey}`)
      .setTitle('Имя героя');
    const input = new TextInputBuilder()
      .setCustomId('hero_name')
      .setLabel('Имя героя')
      .setPlaceholder('От 2 до 24 символов')
      .setMinLength(2).setMaxLength(24).setRequired(true)
      .setStyle(TextInputStyle.Short);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (action === 'home') return interaction.update({ content:'🏰 **Гильдия героев**\nВыберите нужный раздел. Это личное меню видно только вам.', embeds:[], components:hubRows() });
  if (action === 'registry' && parts.length === 2) return showRegistry(interaction);
  if (action === 'registry' && parts[2] === 'heroes') return showRegistryHeroes(interaction);
  if (action === 'registry' && parts[2] === 'classes') return showRegistryClasses(interaction);
  if (action === 'registry' && parts[2] === 'professions') return showRegistryProfessions(interaction);
  if (action === 'registry' && parts[2] === 'stats') return showRegistryStats(interaction);
  if (action === 'masters') return showMasters(interaction);
  if (action === 'profession') return showProfessionHub(interaction);
  if (action === 'storage') return showStorage(interaction);
  if (action === 'orders') return showOrdersHub(interaction);
  if (action === 'hospital' && parts.length === 2) return showHospital(interaction);
  if (action === 'hospital' && parts[2] === 'heal') return healInHospital(interaction);
  if (action === 'hospital' && parts[2] === 'expedition') return interaction.reply({ content:`🗺️ Перейди в канал <#${EXPEDITION_CHANNEL_ID}> и выбери новую экспедицию.`, flags:MessageFlags.Ephemeral });
  if (action === 'profile') return showProfile(interaction);
  if (action === 'inventory' && parts.length === 2) return showInventory(interaction);
  if (action === 'inventory' && parts[2] === 'select') return showInventoryItem(interaction, interaction.values?.[0]);
  if (action === 'inventory' && parts[2] === 'equip') { const r=equipItem(interaction.user.id,Number(parts[3])); return showInventoryItem(interaction,parts[3],r.ok?'✅ Предмет экипирован.':'❌ Не удалось экипировать предмет.'); }
  if (action === 'inventory' && parts[2] === 'unequip') { const item=getInventoryItem(interaction.user.id,Number(parts[3])); const r=item?.slot?unequipItem(interaction.user.id,item.slot):{ok:false}; return showInventory(interaction,r.ok?'✅ Предмет снят.':'❌ Не удалось снять предмет.'); }
  if (action === 'classes' && parts.length === 2) return showClasses(interaction);
  if (action === 'classes' && parts[2] === 'select') return showClassDetails(interaction, interaction.values?.[0]);

  if (action === 'blacksmith' && parts.length === 2) return showBlacksmith(interaction);
  if (action === 'blacksmith' && parts[2] === 'recipe') return showBlacksmithRecipe(interaction, interaction.values?.[0]);
  if (action === 'blacksmith' && parts[2] === 'craft') {
    const recipeKey = parts.slice(3).join(':');
    const result = craft(interaction.user.id, recipeKey, 1);
    const notice = result.ok ? `✅ Создано: **${result.recipe.item.name}**. Потрачено ${result.spent} Dust.` :
      result.reason === 'materials' ? '❌ Не хватает материалов.' :
      result.reason === 'dust' ? '❌ Не хватает Dust.' :
      result.reason === 'level' ? '❌ Недостаточный уровень героя.' : '❌ Создание не удалось.';
    return showBlacksmithRecipe(interaction, recipeKey, notice);
  }
  if (action === 'blacksmith' && parts[2] === 'upgrade') return showUpgrade(interaction, interaction.values?.[0]);
  if (action === 'blacksmith' && parts[2] === 'apply') {
    const id = Number(parts[3]);
    const result = upgradeItem(interaction.user.id, id);
    const notice = result.ok
      ? (result.success ? `✅ Улучшение успешно: **${result.item.name} +${result.targetLevel}**.` : `❌ Попытка не удалась. Предмет остался +${result.fromLevel}.`)
      : result.reason === 'materials' ? '❌ Не хватает материалов.' : result.reason === 'dust' ? '❌ Не хватает Dust.' : '❌ Улучшение не удалось.';
    return showUpgrade(interaction, id, notice);
  }

  if (action === 'alchemist') {
    const command = interaction.client.commands.get('alchemist');
    if (command?.execute) return command.execute(interaction);
    return interaction.reply({ content: '❌ Алхимик временно недоступен.', flags: MessageFlags.Ephemeral });
  }

  if (action === 'pets' && parts.length === 2) return showPets(interaction);
  if (action === 'pets' && parts[2] === 'activate') {
    const result = activateCompanion(interaction.user.id, Number(interaction.values?.[0]));
    const rows = listCompanions(interaction.user.id);
    const notice = result.ok ? `✅ Активный питомец: **${result.companion.name}**.` : '❌ Питомец не найден.';
    const text = rows.length ? rows.map(r => {
      const d = COMPANIONS[r.companion_key] || {};
      const bonuses = Object.entries(d.bonuses || {}).map(([k,v]) => `${k==='expedition_success'?'успех экспедиций':k==='rare_find'?'редкая добыча':k==='world_boss_damage'?'урон по боссу':'защита от босса'} +${v}%`).join(' · ');
      return `${r.active?'🟢':'⚪'} **#${r.id} ${d.icon||'🐾'} ${r.name}** · ${COMPANION_RARITIES[r.rarity]||r.rarity}\n${bonuses||'Без пассивного бонуса'}`;
    }).join('\n\n') : 'Питомцев пока нет.';
    const embed = new EmbedBuilder().setColor(0x38BDF8).setTitle('🐾 Питомцы героя').setDescription(`${notice}\n\n${text}`).setFooter({text:'Активным может быть только один питомец.'});
    const components=[guildNavRow('pets')];
    if(rows.length) components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('guild:pets:activate').setPlaceholder('Выбрать активного питомца')
        .addOptions(rows.slice(0,25).map(r=>({label:`#${r.id} ${r.name}`.slice(0,100),value:String(r.id),emoji:r.active?'🟢':'🐾',description:r.active?'Сейчас активен':'Сделать активным'})))
    ));
    return interaction.update({embeds:[embed],components});
  }
  if (action === 'artifacts') return showArtifacts(interaction);

  if (action === 'codex') {
    const classes = Object.values(HERO_CLASSES).map(c => `${c.icon} **${c.name}** — ${c.role}`).join('\n');
    return interaction.reply({
      content: `## 📖 Кодекс Гильдии\n\n### Классы\n${classes}\n\n🗺️ Экспедиции проходят в канале <#${EXPEDITION_CHANNEL_ID}>.\n👹 На World Boss нельзя идти, пока герой находится в экспедиции.`,
      flags: MessageFlags.Ephemeral,
    });
  }

}

async function handleModal(interaction) {
  const parts = interaction.customId.split(':');
  const gender = parts[3], classKey = parts[4], originKey = parts[5];
  if (getHero(interaction.user.id)) {
    return interaction.reply({ content: '❌ Герой уже существует.', flags: MessageFlags.Ephemeral });
  }
  const name = interaction.fields.getTextInputValue('hero_name');
  const result = createHero({ userId: interaction.user.id, name, gender, classKey, originKey });
  if (!result.ok) {
    const reason = result.reason === 'name' ? 'Имя должно содержать от 2 до 24 символов.' : 'Не удалось создать героя.';
    return interaction.reply({ content: `❌ ${reason}`, flags: MessageFlags.Ephemeral });
  }
  const hero = getEffectiveHero(result.hero);
  const buffer = await createHeroCard(hero, interaction.user);
  return interaction.reply({
    content: `✨ **${hero.name}** вступает в Гильдию героев!\nТеперь ему доступны экспедиции в <#${EXPEDITION_CHANNEL_ID}> и участие в World Boss, когда он свободен.`,
    files: [new AttachmentBuilder(buffer, { name: `hero-${interaction.user.id}.png` })],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  data: new SlashCommandBuilder().setName('guild').setDescription('Опубликовать или обновить главное меню Гильдии героев'),
  async execute(interaction) {
    if (interaction.channelId !== GUILD_CHANNEL_ID) {
      return interaction.reply({ content: `Команда доступна только в канале <#${GUILD_CHANNEL_ID}>.`, flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await ensureGuildHub(interaction.client);
    return interaction.editReply(message ? '✅ Главное меню Гильдии опубликовано или обновлено.' : '❌ Не удалось опубликовать меню. Проверь права бота.');
  },
  handleComponent,
  handleModal,
  ensureGuildHub,
  GUILD_CHANNEL_ID,
};
