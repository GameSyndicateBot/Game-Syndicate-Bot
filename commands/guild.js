const {
  SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');

const { getHero, createHero } = require('../systems/hero/heroService');
const { getEffectiveHero, getInventory, getEquipment, formatBonuses } = require('../systems/hero/itemService');
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

const GUILD_CHANNEL_ID = '1530165282512044032';
const EXPEDITION_CHANNEL_ID = '1529566430301782017';
const HUB_MARKER = '🏰 **ГИЛЬДИЯ ГЕРОЕВ • GAME SYNDICATE**';

function hubRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:create').setLabel('Создать героя').setEmoji('🧙').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('guild:profile').setLabel('Профиль').setEmoji('👤').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:inventory').setLabel('Инвентарь').setEmoji('🎒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:blacksmith').setLabel('Кузнец').setEmoji('⚒️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:alchemist').setLabel('Алхимик').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:pets').setLabel('Питомцы').setEmoji('🐾').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:artifacts').setLabel('Артефакты').setEmoji('💍').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:classes').setLabel('Классы').setEmoji('📚').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:codex').setLabel('Кодекс').setEmoji('📖').setStyle(ButtonStyle.Secondary),
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

async function showInventory(interaction) {
  const hero = getHero(interaction.user.id);
  if (!hero) return interaction.reply({ content: '❌ Сначала создай героя.', flags: MessageFlags.Ephemeral });
  const items = getInventory(interaction.user.id, { limit: 30 });
  const equipment = getEquipment(interaction.user.id);
  const text = items.length
    ? items.slice(0, 20).map(i => `**#${i.id} ${i.name}** ×${i.quantity} • ${i.rarity}`).join('\n')
    : 'Инвентарь пока пуст.';
  return interaction.reply({
    content: `## 🎒 Инвентарь — ${hero.name}\nЭкипировано предметов: **${equipment.length}**\n\n${text}`,
    flags: MessageFlags.Ephemeral,
  });
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

  if (action === 'profile') return showProfile(interaction);
  if (action === 'inventory') return showInventory(interaction);
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
