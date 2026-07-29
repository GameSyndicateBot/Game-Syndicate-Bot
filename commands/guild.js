const { listResources, getResourceQuantity, grantResource, consumeResources } = require('../systems/hero/resourceService');
const {
  SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');

const { getHero, getLatestExpeditionClassKey, createHero, addHistory } = require('../systems/hero/heroService');
const { getEffectiveHero, getInventory, getEquipment, getInventoryItem, equipItem, unequipItem, unequipInventoryItem, formatBonuses } = require('../systems/hero/itemService');
const { listRecipes, hydrateRecipe, craft } = require('../systems/hero/craftingService');
const { getUpgradeInfo, upgradeItem, MAX_UPGRADE } = require('../systems/hero/upgradeService');
const { listCompanions, activateCompanion, getActiveMount, sellableCompanions, takeCompanionForTransfer, giveTransferredCompanion, companionTransferData } = require('../systems/hero/companionService');
const { COMPANIONS, RARITY_LABELS: COMPANION_RARITIES } = require('../systems/hero/companionData');
const { RARITY_LABELS } = require('../systems/hero/itemData');
const { HERO_CLASSES, ORIGINS, GENDERS } = require('../systems/hero/heroData');
const { getAllClassProgress, getClassProgress, classXpForNextLevel, classWorldBossBonuses, getMasteryRank, getNextMilestone, classProgressPercent } = require('../systems/hero/classProgressService');
const { getActiveExpedition } = require('../systems/hero/expeditionService');
const { createGuildHubCard } = require('../images/hero/createGuildHubCard');
const { createHeroCard } = require('../images/hero/createHeroCard');
const { db, getCardDust, addCardDust, removeCardDust } = require('../database/db');
const { PROFESSIONS, SPECIALIZATIONS, getProfession, getProfessionCounts, getProfessionLeaders, getAllProfessionLeaders, processProfessionMaterial, changeProfession, PROFESSION_CHANGE_COST } = require('../systems/hero/professionService');
const { ITEMS } = require('../systems/hero/itemData');
const { createOrder, listOpenOrders, listMyOrders, fulfillOrder, cancelOrder, stats: getOrderStats } = require('../systems/hero/orderBoardService');
const { listOpen: listEquipmentMarket, listMine: listMyEquipmentMarket, duplicateEquipment, createListing, buyListing, cancelListing, sellToBlacksmith } = require('../systems/hero/equipmentMarketService');
const { getChests, openChest } = require('../systems/hero/materialService');
const { CHESTS, MATERIALS } = require('../systems/hero/materialData');
const { listCookRecipes, hydrateCookRecipe, cook } = require('../systems/hero/cookService');
const { sourceFor, missingRecipeSummary, missingCookSummary, recipeState, cookState, itemBonusLines } = require('../systems/hero/craftingUx');
const caravan = require('../services/caravanService');
const guildMerchant = require('../services/guildMerchantService');

const GUILD_CHANNEL_ID = '1530165282512044032';
const EXPEDITION_CHANNEL_ID = '1529566430301782017';
const HUB_MARKER = '🏰 **ГИЛЬДИЯ ГЕРОЕВ • GAME SYNDICATE**';

function hubRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:create').setLabel('Создать героя').setEmoji('🧙').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('guild:profile').setLabel('Профиль').setEmoji('👤').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:classes').setLabel('Классы').setEmoji('📚').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:inventory').setLabel('Инвентарь').setEmoji('🎒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:storage').setLabel('Хранилище').setEmoji('📦').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:profession').setLabel('Профессия').setEmoji('👷').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:npcs').setLabel('Гильдейцы').setEmoji('🧑‍🤝‍🧑').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('guild:orders').setLabel('Рынок').setEmoji('🏪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:registry').setLabel('Реестр').setEmoji('📖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:masters').setLabel('Зал мастеров').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:codex').setLabel('Кодекс').setEmoji('📖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:economylog').setLabel('Журнал экономики').setEmoji('📜').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function ensureProfilePreferences() {
  const columns = db.prepare("PRAGMA table_info(heroes)").all().map(r => r.name);
  if (!columns.includes('display_class_key')) db.exec("ALTER TABLE heroes ADD COLUMN display_class_key TEXT");
}
ensureProfilePreferences();

function npcRows() {
  const buttons = [
    new ButtonBuilder().setCustomId('guild:blacksmith').setLabel('Кузнец').setEmoji('⚒️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('guild:alchemist').setLabel('Алхимик').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('guild:hospital').setLabel('Лекарь').setEmoji('🩺').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('guild:cook').setLabel('Повар').setEmoji('👨‍🍳').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('guild:merchant').setLabel('Торговец').setEmoji('💰').setStyle(ButtonStyle.Primary),
  ];
  if (caravan.isActive()) {
    buttons.push(new ButtonBuilder().setCustomId('guild:caravan').setLabel('Караванщик').setEmoji('🐪').setStyle(ButtonStyle.Primary));
  }
  return [new ActionRowBuilder().addComponents(...buttons.slice(0,5)),...(buttons.length>5?[new ActionRowBuilder().addComponents(...buttons.slice(5,10))]:[])];
}

function storageExtraRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:artifacts').setLabel('Артефакты').setEmoji('💍').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('guild:chests').setLabel('Сундуки').setEmoji('🎁').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('guild:home').setLabel('В Гильдию').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  )];
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

async function showProfile(interaction, notice = '') {
  const base = getHero(interaction.user.id);
  if (!base) return interaction.reply({ content: '❌ Сначала создай героя кнопкой **«Создать героя»**.', flags: MessageFlags.Ephemeral });
  const hero = getEffectiveHero(base);
  hero.display_class_key = base.display_class_key || hero.class_key;
  const buffer = await createHeroCard(hero, interaction.user);
  const progress = getAllClassProgress(interaction.user.id).filter(r => HERO_CLASSES[r.class_key]);
  const components = [];
  if (progress.length) components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('guild:profile:displayclass').setPlaceholder('Выбрать класс для отображения в профиле')
      .addOptions(progress.slice(0,25).map(r => ({ label:`${HERO_CLASSES[r.class_key].name} • Lv.${r.level}`.slice(0,100), value:r.class_key, emoji:HERO_CLASSES[r.class_key].icon, default:r.class_key===hero.display_class_key })))
  ));
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:profile:rename').setLabel('Изменить имя • 200 Dust').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('guild:home').setLabel('В Гильдию').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  ));
  const payload = {
    content: [notice, `👤 **Профиль героя ${hero.name}**`, `Отображаемый класс: ${HERO_CLASSES[hero.display_class_key]?.icon || '⚔️'} **${HERO_CLASSES[hero.display_class_key]?.name || hero.display_class_key}**`].filter(Boolean).join('\n'),
    files: [new AttachmentBuilder(buffer, { name: `hero-${interaction.user.id}.png` })],
    components,
    flags: MessageFlags.Ephemeral,
  };
  return interaction.replied || interaction.deferred ? interaction.editReply(payload) : interaction.reply(payload);
}

function raritySphere(rarity) {
  return ({ common:'⚪', rare:'🔵', epic:'🟣', legendary:'🟠', mythic:'🔴', exclusive:'💠' })[String(rarity||'').toLowerCase()] || '⚪';
}

async function showInventory(interaction, notice = '') {
  const hero=getHero(interaction.user.id);if(!hero)return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const items=getInventory(interaction.user.id,{limit:100}),equipment=getEquipment(interaction.user.id),equippedIds=new Set(equipment.map(x=>Number(x.inventory_id)));
  const activeMount=getActiveMount(interaction.user.id);
  const labels={melee:'Оружие ближнего боя',ranged:'Дальнее оружие',offhand:'Щит / левая рука',ring1:'Кольцо I',ring2:'Кольцо II',belt:'Пояс',legs:'Штаны',chest:'Нагрудник',boots:'Сапоги',helmet:'Шлем',amulet:'Амулет',gloves:'Перчатки',backpack:'Рюкзак'};
  const icons={melee:'⚔️',ranged:'🏹',offhand:'🛡️',ring1:'💍',ring2:'💍',belt:'🪢',legs:'👖',chest:'🥋',boots:'🥾',helmet:'🪖',amulet:'📿',gloves:'🧤',backpack:'🎒'};
  const slots=['melee','ranged','offhand','ring1','ring2','belt','helmet','chest','legs','boots','amulet','backpack'];
  const bySlot=new Map(equipment.map(x=>[x.slot,x]));
  const slotText=slots.map(slot=>{const x=bySlot.get(slot);return `${icons[slot]||'▫️'} **${labels[slot]}:** ${x?`${raritySphere(x.rarity)} ${x.name}${Number(x.upgrade_level||0)?` +${x.upgrade_level}`:''}`:'⚪ Свободно'}`;}).join('\n');
  const mountLine=`🐎 **Маунт (ездовой):** ${activeMount?`${raritySphere(activeMount.rarity)} ${activeMount.name}`:'⚪ Свободно'}`;
  const legacy=equipment.filter(x=>!slots.includes(x.slot)).map(x=>`${icons[x.slot]||'▫️'} **${labels[x.slot]||x.slot}:** ${raritySphere(x.rarity)} ${x.name}`).join('\n');
  const itemText=items.length?items.slice(0,25).map(i=>`${raritySphere(i.rarity)} **#${i.id} ${i.name}**${Number(i.upgrade_level||0)?` +${i.upgrade_level}`:''} ×${i.quantity} · ${RARITY_LABELS[i.rarity]||i.rarity}${equippedIds.has(Number(i.id))?' · **надето**':''}`).join('\n'):'Инвентарь пока пуст.';
  const allCompanions=listCompanions(interaction.user.id),mounts=allCompanions.filter(x=>x.companion_kind==='mount'),pets=allCompanions.filter(x=>x.companion_kind!=='mount');
  const mountStock=mounts.length?mounts.map(x=>`${raritySphere(x.rarity)} **#${x.id} 🐎 ${x.name}**${x.active_mount?' · **надето**':' · на складе'}`).join('\n'):'Маунтов пока нет.';
  const petStock=pets.length?pets.map(x=>`${raritySphere(x.rarity)} **#${x.id} 🐾 ${x.name}**${x.active_slot?` · **активен, слот ${x.active_slot}**`:' · на складе'}`).join('\n'):'Питомцев пока нет.';
  const embed=new EmbedBuilder().setColor(0x8B5CF6).setTitle(`🎒 Инвентарь — ${hero.name}`).setDescription([notice,'### Активные слоты',slotText,mountLine,legacy,'','### Предметы',itemText,'','### 🐎 Маунты',mountStock,'','### 🐾 Питомцы',petStock].filter(Boolean).join('\n').slice(0,4000)).setFooter({text:'⚪ Common • 🔵 Rare • 🟣 Epic • 🟠 Legendary • 🔴 Mythic. Активные предметы отмечены текстом «надето».'});
  const components=[],eq=items.filter(i=>i.slot).slice(0,25);if(eq.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:inventory:select').setPlaceholder('Выбрать предмет: информация / надеть / снять').addOptions(eq.map(i=>({label:`#${i.id} ${i.name}`.slice(0,100),value:String(i.id),emoji:raritySphere(i.rarity),description:equippedIds.has(Number(i.id))?'Сейчас надето':'Свободно в инвентаре'})))));
  if(mounts.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:inventory:mount').setPlaceholder('Выбрать маунта: информация / надеть / снять').addOptions(mounts.slice(0,25).map(m=>({label:`#${m.id} ${m.name}`.slice(0,100),value:String(m.id),emoji:'🐎',description:m.active_mount?'Сейчас надет • открыть характеристики':`${RARITY_LABELS[m.rarity]||m.rarity} • открыть характеристики`})))));
  if(pets.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:inventory:pet').setPlaceholder('Выбрать питомца: информация / надеть / снять').addOptions(pets.slice(0,25).map(m=>({label:`#${m.id} ${m.name}`.slice(0,100),value:String(m.id),emoji:'🐾',description:m.active_slot?`Активен в слоте ${m.active_slot} • открыть характеристики`:`${COMPANION_RARITIES[m.rarity]||m.rarity} • открыть характеристики`})))));
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:home').setLabel('Вернуться в Гильдию').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)));
  const payload={embeds:[embed],components};const eph=Boolean(interaction.message?.flags?.has?.(MessageFlags.Ephemeral));return eph?interaction.update(payload):interaction.reply({...payload,flags:MessageFlags.Ephemeral});
}

async function showInventoryItem(interaction, inventoryId, notice='') {
  const item=getInventoryItem(interaction.user.id, Number(inventoryId));
  if(!item) return showInventory(interaction,'❌ Предмет не найден.');
  const equipment=getEquipment(interaction.user.id);
  const equippedRow=equipment.find(i=>Number(i.inventory_id)===Number(item.id));const equipped=Boolean(equippedRow);
  const bonuses=formatBonuses(item.bonuses_json);
  const embed=new EmbedBuilder().setColor(equipped?0x22C55E:0x7C3AED).setTitle(`${equipped?'🟢':'⚔️'} ${item.name}`)
    .setDescription([notice,item.description,`⭐ **Редкость:** ${RARITY_LABELS[item.rarity]||item.rarity}`,`🎒 **Слот:** ${equippedRow?.slot||item.slot||'не экипируется'}`,`✨ **Улучшение:** +${Number(item.upgrade_level||0)}`,bonuses.length?`📊 ${bonuses.join('\n')}`:'',equipped?'\n✅ Сейчас надето.':'\nПредмет находится в инвентаре.'].filter(Boolean).join('\n'));
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:inventory').setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`guild:inventory:${equipped?'unequip':'equip'}:${item.id}`).setLabel(equipped?'Снять':'Экипировать').setEmoji(equipped?'📤':'⚔️').setStyle(equipped?ButtonStyle.Danger:ButtonStyle.Success)
  );
  return interaction.update({embeds:[embed],components:[row]});
}

async function showInventoryCompanion(interaction, companionId, notice='') {
  const row=listCompanions(interaction.user.id).find(x=>Number(x.id)===Number(companionId));
  if(!row)return showInventory(interaction,'❌ Питомец или маунт не найден.');
  const d=companionTransferData(row);
  const bonusLines=formatBonuses(d.bonuses||{});
  const active=row.companion_kind==='mount'?Boolean(row.active_mount):Boolean(row.active_slot);
  const type=row.companion_kind==='mount'?'Маунт (ездовой)':'Питомец';
  const status=row.companion_kind==='mount'?(active?'✅ Надет в слот маунта':'⚪ На складе'):(active?`✅ Активен в слоте ${row.active_slot}/3`:'⚪ На складе');
  const embed=new EmbedBuilder().setColor(active?0x22C55E:0x8B5CF6).setTitle(`${row.companion_kind==='mount'?'🐎':'🐾'} ${d.name}`)
    .setDescription([notice,`**Тип:** ${type}`,`**Редкость:** ${raritySphere(d.rarity)} ${COMPANION_RARITIES[d.rarity]||d.rarity}`,`**Статус:** ${status}`,d.description?`\n${d.description}`:'',bonusLines.length?`\n**Характеристики и бонусы**\n${bonusLines.join('\n')}`:'\nБез дополнительных бонусов.'].filter(Boolean).join('\n'));
  const buttons=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`guild:inventory:companion:toggle:${row.id}`).setLabel(active?'Снять':'Надеть').setEmoji(active?'📤':'✅').setStyle(active?ButtonStyle.Danger:ButtonStyle.Success),new ButtonBuilder().setCustomId('guild:inventory').setLabel('Назад в инвентарь').setEmoji('⬅️').setStyle(ButtonStyle.Secondary));
  return interaction.update({embeds:[embed],components:[buttons]});
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
  const bonus = classWorldBossBonuses(row.level, classKey);
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

const BLACKSMITH_CATEGORIES = Object.freeze({
  all: { label: 'Все рецепты', emoji: '📚' },
  weapon: { label: 'Оружие', emoji: '⚔️' },
  armor: { label: 'Броня', emoji: '🛡️' },
  jewelry: { label: 'Украшения', emoji: '💍' },
  consumable: { label: 'Расходники', emoji: '📦' },
  available: { label: 'Доступные', emoji: '⭐' },
  locked: { label: 'Заблокированные', emoji: '🔒' },
});

function blacksmithCategoryFor(recipe) {
  const type = recipe?.item?.type;
  if (type === 'weapon') return 'weapon';
  if (['armor', 'helmet', 'gloves', 'boots', 'backpack'].includes(type)) return 'armor';
  if (['ring', 'amulet'].includes(type)) return 'jewelry';
  if (type === 'consumable') return 'consumable';
  return 'all';
}

function filterBlacksmithRecipes(recipes, category = 'all') {
  if (category === 'available') return recipes.filter(recipe => recipe.canCraft);
  if (category === 'locked') return recipes.filter(recipe => !recipe.canCraft);
  if (category === 'all') return recipes;
  return recipes.filter(recipe => blacksmithCategoryFor(recipe) === category);
}

function blacksmithCategoryRow(selected = 'all') {
  const options = Object.entries(BLACKSMITH_CATEGORIES).map(([value, data]) => ({
    label: data.label,
    value,
    emoji: data.emoji,
    default: value === selected,
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('guild:blacksmith:category')
      .setPlaceholder('Выбрать категорию рецептов')
      .addOptions(options)
  );
}

async function showBlacksmith(interaction, notice = '', category = 'all') {
  const hero = getHero(interaction.user.id);
  if (!hero) return interaction.reply({ content: '❌ Сначала создай героя.', flags: MessageFlags.Ephemeral });
  if (!BLACKSMITH_CATEGORIES[category]) category = 'all';
  const allRecipes = listRecipes(interaction.user.id).filter(r => r.npc !== 'Алхимик Лира');
  const recipes = filterBlacksmithRecipes(allRecipes, category);
  const items = getInventory(interaction.user.id, { limit: 100 }).filter(i => i.slot && Number(i.upgrade_level || 0) < MAX_UPGRADE);
  const readyRecipes = allRecipes.filter(r => r.canCraft).length;
  const unlockedRecipes = allRecipes.filter(r => r.heroLevel >= r.level).length;
  const categoryInfo = BLACKSMITH_CATEGORIES[category];
  const embed = new EmbedBuilder().setColor(0xF59E0B).setTitle('⚒️ Кузница Гильдии')
    .setDescription([
      notice,
      '*Кузнец создаёт оружие, броню и украшения из материалов, найденных в экспедициях.*',
      '',
      '📌 **Как открыть рецепт:** достигни указанного уровня героя. Рецепт откроется автоматически.',
      '📦 **Как создать предмет:** после открытия собери Dust и все перечисленные материалы.',
      '✨ **Как улучшать:** выбери уже найденный или созданный предмет в меню улучшения.',
      '',
      `🔨 **Рецептов:** ${allRecipes.length} · открыто по уровню: **${unlockedRecipes}** · готово к созданию: **${readyRecipes}**`,
      `🗂️ **Категория:** ${categoryInfo.emoji} ${categoryInfo.label} · показано **${recipes.length}**`,
      `✨ **Предметов для улучшения:** **${items.length}**`,
      '',
      'Состояния: ✅ можно создать · 🟡 уровень открыт, не хватает ресурсов · 🔒 ещё не достигнут уровень.',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `Герой: ${hero.name} · уровень ${hero.level} · рецепты проверяются по реальному уровню героя` });

  const components = [guildNavRow('blacksmith'), blacksmithCategoryRow(category)];
  if (recipes.length) components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`guild:blacksmith:recipe:${category}`).setPlaceholder('🔨 Выбрать рецепт и посмотреть условия')
      .addOptions(recipes.slice(0,25).map(r => {
        const state = recipeState(r);
        const missing = missingRecipeSummary(r);
        return {
          label:r.item.name.slice(0,100), value:r.key, emoji:state.icon,
          description:`${state.label}${missing.length ? ` · нужно: ${missing.join(', ')}` : ''}`.slice(0,100)
        };
      }))
  ));
  else embed.addFields({ name:'В этой категории пока пусто', value:'Выбери другую категорию или продолжай развивать героя и собирать ресурсы.' });
  if (items.length) components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('guild:blacksmith:upgrade').setPlaceholder('✨ Выбрать предмет для улучшения')
      .addOptions(items.slice(0,25).map(i => ({
        label:`#${i.id} ${i.name} +${i.upgrade_level || 0}`.slice(0,100), value:String(i.id), emoji:'⚒️',
        description:`${RARITY_LABELS[i.rarity] || i.rarity} · следующий уровень +${Number(i.upgrade_level || 0)+1}`.slice(0,100)
      })))
  ));
  const payload = { embeds:[embed], components };
  const isEphemeralMessage = Boolean(interaction.message?.flags?.has?.(MessageFlags.Ephemeral));
  return isEphemeralMessage ? interaction.update(payload) : interaction.reply({ ...payload, flags:MessageFlags.Ephemeral });
}

async function showBlacksmithRecipe(interaction, recipeKey, notice = '', category = 'all') {
  const recipe = hydrateRecipe(recipeKey, interaction.user.id);
  if (!recipe || recipe.npc === 'Алхимик Лира') return interaction.update({ content:'❌ Рецепт не найден.', embeds:[], components:[guildNavRow('blacksmith')] });
  const state = recipeState(recipe);
  const missing = missingRecipeSummary(recipe);
  const sources = recipe.materials.map(m => `${m.icon} **${m.name}:** ${sourceFor(m.key)}`).join('\n');
  const resultText = recipe.canCraft
    ? '✅ Всё готово — предмет можно создать прямо сейчас.'
    : recipe.heroLevel < recipe.level
      ? `🔒 Рецепт автоматически откроется на **${recipe.level} уровне**. Сейчас уровень **${recipe.heroLevel}**.`
      : `🟡 Уровень уже открыт. Осталось собрать: **${missing.join(', ')}**.`;
  const embed = new EmbedBuilder().setColor(recipe.canCraft?0x22C55E:0xF59E0B).setTitle(`🔨 ${recipe.item.name}`)
    .setDescription([
      notice,
      recipe.item.description,
      '',
      `📍 **Статус:** ${state.icon} ${state.label}`,
      `⭐ **Редкость:** ${RARITY_LABELS[recipe.item.rarity] || recipe.item.rarity}`,
      `🧙 **Уровень героя:** ${recipe.heroLevel}/${recipe.level} ${recipe.heroLevel >= recipe.level ? '✅' : '❌'}`,
      `💠 **Dust:** ${recipe.dustBalance}/${recipe.dust} ${recipe.dustBalance >= recipe.dust ? '✅' : '❌'}`,
      '',
      '**Характеристики предмета**',
      itemBonusLines(recipe.item),
      '',
      '**Материалы**',
      recipeMaterials(recipe),
      '',
      '**Где добыть**',
      sources,
      '',
      resultText,
    ].filter(Boolean).join('\n'));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`guild:blacksmith:menu:${category}`).setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`guild:blacksmith:craft:${category}:${recipeKey}`).setLabel('Создать').setEmoji('🔨').setStyle(ButtonStyle.Success).setDisabled(!recipe.canCraft)
  );
  return interaction.update({ embeds:[embed], components:[guildNavRow('blacksmith'),row] });
}

async function showUpgrade(interaction, inventoryId, notice = '') {
  const info = getUpgradeInfo(interaction.user.id, Number(inventoryId));
  if (!info.ok) return interaction.update({ content:'❌ Предмет не найден или его нельзя улучшить.', embeds:[], components:[guildNavRow('blacksmith')] });
  if (info.maxed) return interaction.update({ content:`✅ **${info.item.name}** уже улучшен до +${MAX_UPGRADE}.`, embeds:[], components:[guildNavRow('blacksmith')] });
  const materials = info.cost.materials.map(m => `${m.icon} ${m.name}: **${m.owned}/${m.required}**${m.owned>=m.required?' ✅':' ❌'}`).join('\n');
  const missing = [];
  if (info.dust < info.cost.dust) missing.push(`${info.cost.dust - info.dust} Dust`);
  for (const material of info.cost.materials) if (material.owned < material.required) missing.push(`${material.name} ×${material.required - material.owned}`);
  const embed = new EmbedBuilder().setColor(info.canAfford?0x22C55E:0xF59E0B)
    .setTitle(`✨ ${info.item.name} +${info.level} → +${info.targetLevel}`)
    .setDescription([notice,`**Уровень:** +${info.level} → +${info.targetLevel}`,`**Реальное усиление характеристик:** ${info.previewText || `все базовые бонусы предмета усиливаются до ×${(1 + info.targetLevel * 0.08).toFixed(2)}`}`,`**Шанс успеха:** ${info.chance}%`,`**Dust:** ${info.dust}/${info.cost.dust} ${info.dust>=info.cost.dust?'✅':'❌'}`,'','**Материалы**',materials,'',info.canAfford?'✅ Всё готово к улучшению.':`❌ Не хватает: **${missing.join(', ')}**.`].filter(Boolean).join('\n'))
    .setFooter({text:'При неудаче уровень и предмет сохраняются, ресурсы расходуются.'});
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:blacksmith:menu').setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`guild:blacksmith:apply:${inventoryId}`).setLabel('Улучшить').setEmoji('⚒️').setStyle(ButtonStyle.Success).setDisabled(!info.canAfford)
  );
  return interaction.update({embeds:[embed],components:[guildNavRow('blacksmith'),row]});
}

async function showPets(interaction, notice = '') {
  const hero=getHero(interaction.user.id);
  if(!hero)return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const rows=listCompanions(interaction.user.id).filter(r=>r.companion_kind!=='mount');
  const text=rows.length?rows.map(r=>{
    const d=COMPANIONS[r.companion_key]||{};
    const bonuses=Object.entries(d.bonuses||{}).map(([k,v])=>`${k==='expedition_success'?'успех экспедиций':k==='rare_find'?'редкая добыча':k==='world_boss_damage'?'урон по боссу':'защита от босса'} +${v}%`).join(' · ');
    return `${r.active_mount?'🟣':r.active_slot?'🟢':'⚪'} **#${r.id} ${d.icon||(r.companion_kind==='mount'?'🐎':'🐾')} ${r.name}** · ${COMPANION_RARITIES[r.rarity]||r.rarity}\n${bonuses||'Без пассивного бонуса'}`;
  }).join('\n\n'):'Питомцев пока нет. Их можно найти в редких экспедиционных событиях или получить в магазине.';
  const embed=new EmbedBuilder().setColor(0x38BDF8).setTitle('🐾 Питомцы героя').setDescription([notice,text].filter(Boolean).join('\n\n')).setFooter({text:'Можно активировать до 3 питомцев. Маунты теперь находятся в Инвентаре в отдельном слоте.'});
  const components=[guildNavRow('pets')];
  if(rows.length)components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('guild:pets:activate').setPlaceholder('Выбрать активного питомца')
      .addOptions(rows.slice(0,25).map(r=>({label:`#${r.id} ${r.name}`.slice(0,100),value:String(r.id),emoji:r.active?'🟢':'🐾',description:r.active_slot?`Активен: слот ${r.active_slot}`:'Активировать питомца'})))
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
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:registry').setLabel('Обновить реестр').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('guild:home').setLabel('В Гильдию').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  )];
}
function professionRosterText() {
  const rows=db.prepare(`SELECT h.user_id,h.name hero_name,h.level hero_level,h.class_key,
    hp.profession_key,hp.level profession_level,hp.specialization_key
    FROM heroes h LEFT JOIN hero_professions hp ON hp.user_id=h.user_id
    ORDER BY hp.profession_key,hp.level DESC,h.level DESC,h.name`).all();
  return Object.entries(PROFESSIONS).map(([key,p])=>{
    const members=rows.filter(r=>r.profession_key===key);
    const lines=members.length?members.map(r=>{
      const spec=r.specialization_key?SPECIALIZATIONS[key]?.[r.specialization_key]:null;
      return `• <@${r.user_id}> — **${r.hero_name}** · ${p.icon} ур. ${r.profession_level}${spec?` · ${spec.icon} ${spec.name}`:''}`;
    }).join('\n'):'• Свободно — участников пока нет';
    return `### ${p.icon} ${p.name} (${members.length})\n${lines}`;
  }).join('\n\n');
}
function discordName(interaction,userId, fallback='Неизвестный герой') {
  return interaction.guild?.members?.cache?.get(userId)?.displayName || fallback;
}
async function showRegistry(interaction) {
  const heroes=Number(db.prepare('SELECT COUNT(*) c FROM heroes').get()?.c||0);
  const embed=new EmbedBuilder().setColor(0x8B5CF6).setTitle('📖 Реестр профессий Гильдии')
    .setDescription(`👥 Зарегистрировано героев: **${heroes}**

${professionRosterText()}`.slice(0,4000))
    .setFooter({text:'Только профессии: Discord-участник, имя персонажа, уровень и специализация профессии.'});
  return interaction.reply({embeds:[embed],components:[],flags:MessageFlags.Ephemeral});
}


function cookRows(recipes) {
  const rows = [];
  if (recipes.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('guild:cook:recipe').setPlaceholder('🍲 Выбрать блюдо и посмотреть условия')
        .addOptions(recipes.map(r => {
          const state = cookState(r);
          const missing = missingCookSummary(r);
          return {
            label: r.item.name,
            value: r.key,
            emoji: state.icon,
            description: `${state.label}${missing.length ? ` · нужно: ${missing.join(', ')}` : ''}`.slice(0, 100),
          };
        }))
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:home').setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

async function showCook(interaction, notice = '') {
  const hero = getHero(interaction.user.id);
  if (!hero) return interaction.reply({ content:'❌ Сначала создай героя.', flags:MessageFlags.Ephemeral });
  const recipes = listCookRecipes(interaction.user.id);
  const lines = recipes.map(r => {
    const state = cookState(r);
    const missing = missingCookSummary(r);
    return `${state.icon} **${r.item.name}** — ${state.label}
${r.item.description}
${missing.length ? `Нужно: ${missing.join(', ')}` : 'Все условия выполнены.'}`;
  });
  const embed = new EmbedBuilder().setColor(0xF59E0B).setTitle('👨‍🍳 Повар Гильдии — Марко')
    .setDescription([
      notice,
      'Марко готовит походные блюда из ингредиентов, добытых в экспедициях. **Dust не требуется.**',
      '',
      '📌 **Когда блюдо доступно:** достигни указанного уровня героя — рецепт откроется автоматически.',
      '🧺 **Что нужно после открытия:** собери все ингредиенты в походах или через мирные профессии.',
      '🎒 Готовое блюдо попадает в расходники и применяется перед нужной активностью.',
      '',
      ...lines,
    ].filter(Boolean).join('\n\n').slice(0, 4000))
    .setFooter({ text:`Герой: ${hero.name} · уровень ${hero.level} · использовать блюдо можно через Алхимика` });
  const payload = { embeds:[embed], components:cookRows(recipes) };
  return interaction.message?.flags?.has?.(MessageFlags.Ephemeral)
    ? interaction.update(payload)
    : interaction.reply({ ...payload, flags:MessageFlags.Ephemeral });
}

async function showCookRecipe(interaction, recipeKey, notice = '') {
  const recipe = hydrateCookRecipe(interaction.user.id, recipeKey);
  if (!recipe) return showCook(interaction, '❌ Рецепт не найден.');
  const state = cookState(recipe);
  const missing = missingCookSummary(recipe);
  const ingredientText = recipe.ingredients.map(i => `${i.owned >= i.required ? '✅' : '❌'} **${i.item.name}:** ${i.owned}/${i.required}`).join('\n');
  const sources = recipe.ingredients.map(i => `• **${i.item.name}:** ${sourceFor(i.key)}`).join('\n');
  const resultText = recipe.canCook
    ? '✅ Всё готово. Марко может приготовить блюдо.'
    : recipe.heroLevel < recipe.level
      ? `🔒 Блюдо автоматически откроется на **${recipe.level} уровне**. Сейчас уровень **${recipe.heroLevel}**.`
      : `🟡 Уровень открыт. Осталось собрать: **${missing.join(', ')}**.`;
  const embed = new EmbedBuilder().setColor(recipe.canCook ? 0x22C55E : 0xF59E0B).setTitle(`🍲 ${recipe.item.name}`)
    .setDescription([
      notice,
      recipe.item.description,
      '',
      `📍 **Статус:** ${state.icon} ${state.label}`,
      `🧙 **Уровень героя:** ${recipe.heroLevel}/${recipe.level} ${recipe.heroLevel >= recipe.level ? '✅' : '❌'}`,
      '💠 **Dust:** не требуется',
      '',
      '**Ингредиенты**', ingredientText,
      '',
      '**Где добыть**', sources,
      '',
      resultText,
      '',
      '🎒 После приготовления блюдо появится в расходниках. Применяй его через меню Алхимика.',
    ].filter(Boolean).join('\n'));
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`guild:cook:make:${recipe.key}`).setLabel('Приготовить').setEmoji('🍳').setStyle(ButtonStyle.Success).setDisabled(!recipe.canCook),
      new ButtonBuilder().setCustomId('guild:cook').setLabel('К блюдам').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return interaction.update({ embeds:[embed], components:rows });
}

function hospitalPrice(hero) {
  const maxHp = Math.max(1, Number(hero?.max_hp || 1));
  const hp = Math.max(0, Math.min(maxHp, Number(hero?.hp || 0)));
  const missingPercent = Math.max(0, Math.round((maxHp - hp) / maxHp * 100));
  if (hp <= 0) return { price: 400, tier: '☠️ Погиб', missingPercent };
  if (missingPercent <= 0 && hero?.status !== 'wounded') return { price: 0, tier: '🟢 Здоров', missingPercent: 0 };
  if (missingPercent <= 25) return { price: 75, tier: '🟡 Лёгкое ранение', missingPercent };
  if (missingPercent <= 50) return { price: 150, tier: '🟠 Среднее ранение', missingPercent };
  if (missingPercent <= 75) return { price: 250, tier: '🔴 Тяжёлое ранение', missingPercent };
  return { price: 400, tier: '🩸 Критическое ранение', missingPercent };
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
  const embed = new EmbedBuilder().setColor(canHeal ? 0xD4A017 : 0x22C55E).setTitle(`🩺 Лекарь — ${hero.name}`)
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
    .setFooter({ text: 'Лекарь снимает ранение и отменяет оставшееся время восстановления.' });
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
    return `**${i+1}. ${h.name}** • <@${h.user_id}>\n${cls?.icon||'⚔️'} **${cls?.name||h.class_key}** • ⭐ ${h.level}${prof?` • ${prof.icon} **${prof.name}** ур. ${h.profession_level}`:' • 👷 Профессия не выбрана'}`;
  }).join('\n'):'Героев пока нет.';
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('👥 Герои Гильдии').setDescription(text.slice(0,4000))],components:registryRows()});
}
async function showRegistryClasses(interaction) {
  const rows=db.prepare('SELECT class_key,COUNT(*) count FROM heroes GROUP BY class_key ORDER BY count DESC').all();
  const text=Object.entries(HERO_CLASSES).map(([k,c])=>`${c.icon} **${c.name}** — ${Number(rows.find(r=>r.class_key===k)?.count||0)}`).join('\n');
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('⚔️ Классы Гильдии').setDescription(text)],components:registryRows()});
}
async function showRegistryProfessions(interaction) {
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('👷 Профессии Гильдии').setDescription(professionRosterText().slice(0,4000))],components:registryRows()});
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
  return interaction.reply({embeds:[embed],components:[],flags:MessageFlags.Ephemeral});
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
    .setDescription(`⚡ Энергия: **${row.energy}/${row.energy_max}**\n🔨 Работ: **${row.work_count}**\n📦 Ресурсов собрано: **${row.resources_gathered||0}**\n📜 Заказов выполнено: **${row.orders_completed||0}**\n💰 Заработано: **${row.dust_earned||0} Dust**${spec?`\n🏅 Специализация: **${spec.icon} ${spec.name}**`:''}\n\nРабота: **/profession work**\nПолный прогресс: **/profession status**${['miner','hunter','lumberjack','herbalist'].includes(row.profession_key)?'\nПереработка сырья доступна кнопкой ниже.':''}`);
  const components=[];
  const professionButtons=[];
  if(['miner','hunter','lumberjack','herbalist','cook'].includes(row.profession_key)) {
    professionButtons.push(new ButtonBuilder().setCustomId('guild:profession:processing').setLabel('Переработка').setEmoji('⚒️').setStyle(ButtonStyle.Success));
  }
  professionButtons.push(new ButtonBuilder().setCustomId('guild:profession:change').setLabel(`Сменить профессию · ${PROFESSION_CHANGE_COST} Dust`).setEmoji('🔄').setStyle(ButtonStyle.Primary));
  components.push(new ActionRowBuilder().addComponents(...professionButtons));
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:home').setLabel('В Гильдию').setEmoji('↩️').setStyle(ButtonStyle.Secondary)));
  return interaction.reply({embeds:[embed],components,flags:MessageFlags.Ephemeral});
}

function professionProcessingRecipe(professionKey) {
  if (professionKey === 'miner') return { input:'iron_ore', output:'iron_ingot', inputQty:2, outputQty:1, title:'Плавка руды' };
  if (professionKey === 'hunter') return { input:'beast_hide', output:'leather', inputQty:2, outputQty:1, title:'Выделка шкур' };
  if (professionKey === 'lumberjack') return { input:'hardwood', output:'board', inputQty:2, outputQty:1, title:'Обработка древесины' };
  if (professionKey === 'herbalist') return { input:'spicy_herbs', output:'herb_extract', inputQty:3, outputQty:1, title:'Переработка пряных трав' };
  if (professionKey === 'cook') return { input:'prepared_food', output:'food_ration', inputQty:3, outputQty:1, title:'Переработка еды' };
  return null;
}

async function showProfessionProcessing(interaction, notice='') {
  const row=getProfession(interaction.user.id);
  const recipe=professionProcessingRecipe(row?.profession_key);
  if(!recipe) return interaction.update({content:'❌ Для этой профессии переработка пока недоступна.',embeds:[],components:[guildNavRow('profession')]});
  const owned=getResourceQuantity(interaction.user.id,recipe.input);
  const outputOwned=getResourceQuantity(interaction.user.id,recipe.output);
  const possible=Math.floor(owned/recipe.inputQty);
  const inputMeta=MATERIALS[recipe.input]||ITEMS[recipe.input]||{};
  const outputMeta=MATERIALS[recipe.output]||ITEMS[recipe.output]||{};
  const inputName=inputMeta.name||recipe.input;
  const outputName=outputMeta.name||recipe.output;
  const description=[
    notice,
    `**${recipe.inputQty} ${inputName} → ${recipe.outputQty} ${outputName}**`,
    '',
    `🧱 **Исходный материал**`,
    `${inputMeta.icon||'📦'} ${inputName}: **${owned}**`,
    '',
    `🔨 **После переработки получится**`,
    `${outputMeta.icon||'✅'} ${outputName}: **${possible * recipe.outputQty}**`,
    '',
    `📦 **Уже на складе**`,
    `${outputMeta.icon||'✅'} ${outputName}: **${outputOwned}**`,
    '',
    'Выбери количество партий переработки.',
  ].filter(Boolean).join('\n');
  const rowButtons=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:profession:process:1').setLabel('+1').setStyle(ButtonStyle.Primary).setDisabled(possible<1),
    new ButtonBuilder().setCustomId('guild:profession:process:5').setLabel('+5').setStyle(ButtonStyle.Primary).setDisabled(possible<5),
    new ButtonBuilder().setCustomId('guild:profession:process:all').setLabel('Переработать всё').setEmoji('⚙️').setStyle(ButtonStyle.Success).setDisabled(possible<1),
    new ButtonBuilder().setCustomId('guild:profession').setLabel('Назад').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`⚒️ ${recipe.title}`).setDescription(description)],components:[rowButtons]});
}
async function showStorage(interaction) {
  if(!getHero(interaction.user.id))return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const rows=listResources(interaction.user.id);
  const text=rows.length?rows.map(r=>`${r.icon || '📦'} **${r.name}** ×${r.quantity}`).join('\n'):'Хранилище ресурсов пока пусто.';
  return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('📦 Хранилище ресурсов').setDescription(`${text}\n\nРесурсы профессий автоматически складываются сюда и используются доской заказов и ремесленниками.`.slice(0,4000))],components:storageExtraRows(),flags:MessageFlags.Ephemeral});
}
function marketRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:orders:buy').setLabel('Купить').setEmoji('🛒').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guild:orders:sell').setLabel('Продать').setEmoji('💰').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('guild:orders:exchange').setLabel('Обмен').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:orders:requests').setLabel('Заказы').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guild:orders:mine').setLabel('Мои сделки').setEmoji('📦').setStyle(ButtonStyle.Secondary),
    ),
  ];
}
function marketBackRow(){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:orders').setLabel('Назад на рынок').setEmoji('↩️').setStyle(ButtonStyle.Secondary));}
function itemName(key){return key==='gs_dust'?'GS Dust':MATERIALS[key]?.name||ITEMS[key]?.name||COMPANIONS[key]?.name||key;}
function itemIcon(key){return key==='gs_dust'?'💎':MATERIALS[key]?.icon||ITEMS[key]?.icon||'📦';}
function marketModal(customId,title,fields){const modal=new ModalBuilder().setCustomId(customId).setTitle(title);for(const f of fields)modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(f.placeholder||'')));return modal;}
function ensureExchangeSchema(){db.exec(`CREATE TABLE IF NOT EXISTS market_exchange_lots(id INTEGER PRIMARY KEY AUTOINCREMENT,creator_id TEXT NOT NULL,offer_type TEXT NOT NULL,offer_key TEXT NOT NULL,offer_name TEXT NOT NULL,offer_qty INTEGER NOT NULL DEFAULT 1,offer_upgrade INTEGER NOT NULL DEFAULT 0,want_type TEXT NOT NULL,want_key TEXT NOT NULL,want_name TEXT NOT NULL,want_qty INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'open',taker_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,closed_at TEXT);CREATE INDEX IF NOT EXISTS idx_market_exchange_open ON market_exchange_lots(status,id DESC);`)}
ensureExchangeSchema();try{const cols=db.prepare('PRAGMA table_info(market_exchange_lots)').all().map(x=>x.name);if(!cols.includes('offer_data'))db.exec('ALTER TABLE market_exchange_lots ADD COLUMN offer_data TEXT');}catch(_){}
db.exec(`CREATE TABLE IF NOT EXISTS market_companion_listings(
 id INTEGER PRIMARY KEY AUTOINCREMENT,seller_id TEXT NOT NULL,companion_key TEXT NOT NULL,companion_name TEXT NOT NULL,companion_kind TEXT NOT NULL,rarity TEXT NOT NULL,price INTEGER NOT NULL,companion_data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',buyer_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,closed_at TEXT);
 CREATE INDEX IF NOT EXISTS idx_market_companion_open ON market_companion_listings(status,id DESC);`);
function listCompanionMarket(limit=25){return db.prepare("SELECT * FROM market_companion_listings WHERE status='open' ORDER BY id DESC LIMIT ?").all(limit);}
function listMyCompanionMarket(userId,limit=25){return db.prepare("SELECT * FROM market_companion_listings WHERE seller_id=? AND status='open' ORDER BY id DESC LIMIT ?").all(String(userId),limit);}
function createCompanionListing(userId,id,price){const value=Math.floor(Number(price));if(value<1||value>10000000)return {ok:false,reason:'price'};let data;try{db.transaction(()=>{data=takeCompanionForTransfer(userId,Number(id));if(!data)throw new Error('missing');db.prepare('INSERT INTO market_companion_listings(seller_id,companion_key,companion_name,companion_kind,rarity,price,companion_data) VALUES(?,?,?,?,?,?,?)').run(String(userId),data.key,data.name,data.kind,data.rarity,value,JSON.stringify(data));})();return {ok:true,data,price:value};}catch(e){return {ok:false,reason:e.message};}}
function buyCompanionListing(userId,id){const uid=String(userId);let lot;try{db.transaction(()=>{lot=db.prepare("SELECT * FROM market_companion_listings WHERE id=? AND status='open'").get(Number(id));if(!lot)throw new Error('missing');if(String(lot.seller_id)===uid)throw new Error('self');const claim=db.prepare("UPDATE market_companion_listings SET status='processing',buyer_id=? WHERE id=? AND status='open'").run(uid,Number(id));if(claim.changes!==1)throw new Error('missing');const pay=removeCardDust(uid,Number(lot.price),`Покупка ${lot.companion_name}`);if(!pay?.ok)throw new Error('dust');const granted=giveTransferredCompanion(uid,JSON.parse(lot.companion_data));if(!granted)throw new Error('grant');addCardDust(String(lot.seller_id),Number(lot.price),`Продажа ${lot.companion_name}`);db.prepare("UPDATE market_companion_listings SET status='sold',closed_at=CURRENT_TIMESTAMP WHERE id=? AND status='processing' AND buyer_id=?").run(Number(id),uid);})();return {ok:true,lot};}catch(e){return {ok:false,reason:e.message};}}
function cancelCompanionListing(userId,id){let lot;try{db.transaction(()=>{lot=db.prepare("SELECT * FROM market_companion_listings WHERE id=? AND seller_id=? AND status='open'").get(Number(id),String(userId));if(!lot)throw new Error('missing');const claim=db.prepare("UPDATE market_companion_listings SET status='cancelling' WHERE id=? AND seller_id=? AND status='open'").run(Number(id),String(userId));if(claim.changes!==1)throw new Error('missing');const granted=giveTransferredCompanion(userId,JSON.parse(lot.companion_data));if(!granted)throw new Error('grant');db.prepare("UPDATE market_companion_listings SET status='cancelled',closed_at=CURRENT_TIMESTAMP WHERE id=? AND status='cancelling'").run(Number(id));})();return {ok:true,lot};}catch(e){return {ok:false,reason:e.message};}}

const marketDrafts=new Map();
function removeEquipmentForTrade(userId,inventoryId){
 const row=db.prepare(`SELECT hi.*,i.name,i.rarity,i.slot,i.item_type,i.description,i.bonuses_json,i.lore
 FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key
 WHERE hi.id=? AND hi.user_id=?`).get(Number(inventoryId),String(userId));
 if(!row||!row.slot||Number(row.quantity)<=0)return null;
 if(Number(row.quantity)<=1){
  db.prepare('DELETE FROM hero_equipment WHERE user_id=? AND inventory_id=?').run(String(userId),Number(inventoryId));
  db.prepare('DELETE FROM hero_class_equipment WHERE user_id=? AND inventory_id=?').run(String(userId),Number(inventoryId));
  db.prepare('DELETE FROM hero_inventory WHERE id=? AND user_id=?').run(Number(inventoryId),String(userId));
 }else db.prepare('UPDATE hero_inventory SET quantity=quantity-1 WHERE id=? AND user_id=?').run(Number(inventoryId),String(userId));
 return {key:row.item_key,name:row.name||row.item_key,rarity:row.rarity||'common',slot:row.slot,upgrade:Number(row.upgrade_level||0)};
}
function giveEquipmentTrade(userId,key,upgrade=0){
 const exists=db.prepare('SELECT 1 FROM hero_items WHERE item_key=?').get(String(key));
 if(!exists)throw new Error('unknown_equipment');
 db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,upgrade_level,acquired_from) VALUES(?,?,1,?,'market_exchange')
 ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+1,upgrade_level=MAX(COALESCE(upgrade_level,0),excluded.upgrade_level),acquired_from='market_exchange'`)
 .run(String(userId),String(key),Number(upgrade)||0);
}
function allEquipmentCatalog(limit=25,query=''){
 const q=String(query||'').trim();
 if(q)return db.prepare(`SELECT item_key key,name,rarity,slot FROM hero_items WHERE slot IS NOT NULL AND LOWER(name) LIKE LOWER(?) ORDER BY name LIMIT ?`).all(`%${q}%`,Number(limit));
 return db.prepare(`SELECT item_key key,name,rarity,slot FROM hero_items WHERE slot IS NOT NULL ORDER BY name LIMIT ?`).all(Number(limit));
}
function claimExchangeLot(id,takerId){return db.prepare("UPDATE market_exchange_lots SET status='processing',taker_id=? WHERE id=? AND status='open'").run(String(takerId),Number(id)).changes===1;}
async function showOrdersHub(interaction, notice='') {
  const orderStats=getOrderStats(), equipment=listEquipmentMarket(50), companions=listCompanionMarket(50), openOrders=listOpenOrders(50); const exchanges=db.prepare("SELECT COUNT(*) c FROM market_exchange_lots WHERE status='open'").get().c;
  const embed=new EmbedBuilder().setColor(0x8B5CF6).setTitle('🏪 Рынок Game Syndicate').setDescription([notice,`🛒 Лотов экипировки: **${equipment.length}**`,`🐾 Лотов питомцев и маунтов: **${companions.length}**`,`📋 Заказов на материалы: **${openOrders.length}**`,`🔄 Предложений обмена: **${exchanges}**`,`🔒 В заказах зарезервировано: **${orderStats.reserved_dust||0} GS Dust**`,'','Все действия выполняются кнопками и выпадающими меню. Команды вводить не нужно.'].filter(Boolean).join('\n'));
  const payload={content:'',embeds:[embed],components:marketRows(),flags:MessageFlags.Ephemeral}; return interaction.replied||interaction.deferred?interaction.editReply(payload):interaction.reply(payload);
}
async function showMarketBuy(interaction,notice=''){
  const eq=listEquipmentMarket(25).filter(x=>x.seller_id!==interaction.user.id), companions=listCompanionMarket(25).filter(x=>x.seller_id!==interaction.user.id), orders=listOpenOrders(25).filter(x=>x.buyer_id!==interaction.user.id);
  const components=[];
  if(eq.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:buy:eq').setPlaceholder('Выбери экипировку для покупки').addOptions(eq.map(x=>({label:`${x.item_name} — ${x.price} Dust`.slice(0,100),description:`Лот №${x.id} • ${x.rarity}${x.upgrade_level?` • +${x.upgrade_level}`:''}`.slice(0,100),value:String(x.id),emoji:'⚔️'})))));
  if(companions.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:buy:companion').setPlaceholder('Выбери питомца или маунта').addOptions(companions.map(x=>({label:`${x.companion_name} — ${x.price} Dust`.slice(0,100),description:`${x.companion_kind==='mount'?'Маунт (ездовой)':'Питомец'} • ${x.rarity} • лот №${x.id}`.slice(0,100),value:String(x.id),emoji:x.companion_kind==='mount'?'🐎':'🐾'})))));
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:orders:exchange:list').setLabel('Посмотреть обмены').setEmoji('🔄').setStyle(ButtonStyle.Secondary)),marketBackRow());
  return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle('🛒 Покупка').setDescription([notice,eq.length||companions.length?'Выбери экипировку, питомца или маунта. Покупка будет показана для подтверждения.':'Сейчас нет доступных лотов.',orders.length?`\n📋 Активных заказов на материалы: **${orders.length}**. Они находятся в разделе «Заказы».`:'' ].filter(Boolean).join('\n'))],components});
}
async function showMarketSell(interaction,notice=''){
 const resources=listResources(interaction.user.id).filter(x=>x.quantity>0).slice(0,25), duplicates=duplicateEquipment(interaction.user.id).slice(0,25), companions=sellableCompanions(interaction.user.id).slice(0,25);const components=[];
 if(resources.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:sell:resource').setPlaceholder('Продать материал по заказу').addOptions(resources.map(x=>({label:`${x.name} ×${x.quantity}`.slice(0,100),value:x.key,emoji:x.icon,description:'Показать заказы на этот материал'})))));
 if(duplicates.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:sell:eq').setPlaceholder('Выставить экипировку на рынок').addOptions(duplicates.map(x=>({label:`${x.name} • свободно ${x.sellable}`.slice(0,100),value:String(x.id),emoji:'⚔️',description:`${x.rarity}${x.upgrade_level?` • +${x.upgrade_level}`:''}`.slice(0,100)})))));
 if(companions.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:sell:companion').setPlaceholder('Выставить питомца или маунта').addOptions(companions.map(x=>({label:(x.transfer?.name||x.name).slice(0,100),value:String(x.id),emoji:x.companion_kind==='mount'?'🐎':'🐾',description:`${x.companion_kind==='mount'?'Маунт (ездовой)':'Питомец'} • ${x.rarity}`.slice(0,100)})))));
 components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:orders:sell:blacksmith').setLabel('Продать кузнецу').setEmoji('🔨').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('guild:orders:requests:create').setLabel('Создать заказ').setEmoji('📋').setStyle(ButtonStyle.Primary)),marketBackRow());
 const lines=resources.map(x=>`${x.icon} **${x.name}** ×${x.quantity}`).join('\n')||'Материалов нет.';
 return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0xF59E0B).setTitle('💰 Продажа').setDescription([notice,'### Материалы',lines,'','Выбери материал — бот покажет подходящие заказы и предложит количество.','Экипировку, неактивных питомцев и маунтов можно выставить на рынок через меню ниже.'].filter(Boolean).join('\n'))],components});
}
async function showMarketRequests(interaction,notice=''){
 const rows=listOpenOrders(25), components=[];if(rows.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:requests:fulfill').setPlaceholder('Выбери заказ для выполнения').addOptions(rows.filter(o=>o.buyer_id!==interaction.user.id).slice(0,25).map(o=>({label:`${itemName(o.item_key)} ×${o.quantity_remaining}`.slice(0,100),description:`№${o.id} • ${o.price_each} Dust за единицу`.slice(0,100),value:String(o.id),emoji:itemIcon(o.item_key)})))));
 components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:orders:requests:create').setLabel('Создать заказ').setEmoji('➕').setStyle(ButtonStyle.Success)),marketBackRow());
 const text=rows.length?rows.map(o=>`**№${o.id}** • ${itemIcon(o.item_key)} **${itemName(o.item_key)}** ×${o.quantity_remaining}/${o.quantity_total} • **${o.price_each} Dust/шт.**`).join('\n'):'Открытых заказов нет.';
 return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('📋 Заказы игроков').setDescription([notice,text,'','Создание и выполнение заказов производится через меню — без английских команд.'].filter(Boolean).join('\n'))],components});
}
async function showMarketMine(interaction,notice=''){
 const orders=listMyOrders(interaction.user.id,25).filter(x=>x.status==='open'), eq=listMyEquipmentMarket(interaction.user.id,25).filter(x=>x.status==='open'), companions=listMyCompanionMarket(interaction.user.id,25), ex=db.prepare("SELECT * FROM market_exchange_lots WHERE creator_id=? AND status='open' ORDER BY id DESC LIMIT 25").all(interaction.user.id);const components=[];
 if(eq.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:mine:eqcancel').setPlaceholder('Снять лот экипировки').addOptions(eq.map(x=>({label:`№${x.id} ${x.item_name}`.slice(0,100),description:`${x.price} Dust`,value:String(x.id),emoji:'⚔️'})))));
 if(companions.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:mine:companioncancel').setPlaceholder('Снять лот питомца или маунта').addOptions(companions.map(x=>({label:`№${x.id} ${x.companion_name}`.slice(0,100),description:`${x.price} Dust`,value:String(x.id),emoji:x.companion_kind==='mount'?'🐎':'🐾'})))));
 if(orders.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:mine:ordercancel').setPlaceholder('Отменить заказ').addOptions(orders.map(x=>({label:`№${x.id} ${itemName(x.item_key)}`.slice(0,100),description:`Осталось ${x.quantity_remaining}`,value:String(x.id),emoji:'📋'})))));
 if(ex.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:mine:excancel').setPlaceholder('Отменить предложение обмена').addOptions(ex.map(x=>({label:`№${x.id} ${x.offer_name} → ${x.want_name}`.slice(0,100),value:String(x.id),emoji:'🔄'})))));
 components.push(marketBackRow());
 return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0x60A5FA).setTitle('📦 Мои сделки').setDescription([notice,`⚔️ Лотов экипировки: **${eq.length}**`,`🐾 Лотов питомцев/маунтов: **${companions.length}**`,`📋 Заказов: **${orders.length}**`,`🔄 Обменов: **${ex.length}**`].filter(Boolean).join('\n'))],components});
}
async function showExchangeHub(interaction,notice=''){
 const lots=db.prepare("SELECT * FROM market_exchange_lots WHERE status='open' ORDER BY id DESC LIMIT 25").all();const components=[];
 if(lots.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:exchange:take').setPlaceholder('Выбери предложение обмена').addOptions(lots.filter(x=>x.creator_id!==interaction.user.id).map(x=>({label:`${x.offer_name} ×${x.offer_qty} → ${x.want_name} ×${x.want_qty}`.slice(0,100),description:`Предложение №${x.id}`.slice(0,100),value:String(x.id),emoji:'🔄'})).slice(0,25))));
 components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:orders:exchange:create').setLabel('Создать обмен').setEmoji('➕').setStyle(ButtonStyle.Success)),marketBackRow());
 const text=lots.length?lots.map(x=>`**№${x.id}** • ${x.offer_name} ×${x.offer_qty} **⇄** ${x.want_name} ×${x.want_qty}`).join('\n'):'Предложений обмена пока нет.';
 return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0xEC4899).setTitle('🔄 Безопасный обмен').setDescription([notice,text,'','Предметы создателя резервируются сразу. Обмен проходит одной операцией: никто не потеряет вещи без встречной передачи.'].filter(Boolean).join('\n'))],components});
}
async function showChestsHub(interaction, notice=''){
  const hero=getHero(interaction.user.id);
  if(!hero)return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const rows=getChests(interaction.user.id);
  const text=rows.length?rows.map(c=>`${c.icon} **${c.name}** × **${c.quantity}**`).join('\n\n'):'Сундуков пока нет. Их можно найти в экспедициях, данжах и получить за особые события.';
  const components=[];
  if(rows.length) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:chests:open').setPlaceholder('Выбери сундук для открытия').addOptions(rows.slice(0,25).map(c=>({label:`${c.name} ×${c.quantity}`.slice(0,100),value:c.key,emoji:c.icon,description:'Открыть один сундук'})))));
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:chests:loot').setLabel('Возможная добыча').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('guild:home').setLabel('В Гильдию').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
  ));
  const payload={embeds:[new EmbedBuilder().setColor(0xEAB308).setTitle(`🎁 Сундуки: ${hero.name}`).setDescription([notice,text,'','Выбери сундук в меню — он откроется сразу, а награда попадёт в инвентарь героя.'].filter(Boolean).join('\n\n'))],components,flags:MessageFlags.Ephemeral};
  return interaction.replied||interaction.deferred?interaction.editReply(payload):interaction.reply(payload);
}


function caravanRarityText(key) {
  const r = caravan.RARITY[key] || caravan.RARITY.common;
  return `${r.icon} ${r.label}`;
}

function caravanOfferSummary(offer) {
  const deal = offer.is_daily_deal ? ` • 🔥 −${offer.discount_percent}%` : '';
  const status = offer.purchased ? ' • ✅ Куплено' : '';
  return `${offer.item.icon || '🎁'} **${offer.item.name}**\n${caravanRarityText(offer.rarity)}${deal}${status}\n💎 **${offer.current_price} GS Dust**`;
}

function caravanMainComponents(offers) {
  const available = offers.filter(o => !o.purchased);
  const rows = [];
  if (available.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('guild:caravan:select')
        .setPlaceholder('Выбери товар Караванщика')
        .addOptions(available.map(o => ({
          label: `${o.item.name}`.slice(0, 100),
          value: String(o.id),
          emoji: o.item.icon || '🎁',
          description: `${caravan.RARITY[o.rarity]?.label || o.rarity} • ${o.current_price} GS Dust${o.is_daily_deal ? ` • скидка ${o.discount_percent}%` : ''}`.slice(0, 100),
        }))),
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('guild:caravan:reservation:cancel').setLabel('Отменить отложенный').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('guild:npcs').setLabel('К гильдейцам').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

async function showCaravan(interaction, notice = '') {
  if (!caravan.isActive()) {
    const payload = { content: '🐪 Караванщик уже покинул Гильдию. Он вернётся в случайное время на следующий день.', embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:npcs').setLabel('К гильдейцам').setEmoji('↩️').setStyle(ButtonStyle.Secondary))], flags: MessageFlags.Ephemeral };
    return interaction.replied || interaction.deferred ? interaction.editReply(payload) : interaction.reply(payload);
  }
  const hero = getHero(interaction.user.id);
  if (!hero) {
    const payload = { content: '❌ Сначала создай героя, чтобы Караванщик подготовил персональные предложения.', flags: MessageFlags.Ephemeral };
    return interaction.replied || interaction.deferred ? interaction.editReply(payload) : interaction.reply(payload);
  }
  const state = caravan.statePublic();
  const offers = caravan.ensureOffers(interaction.user.id);
  const [atmosphereIcon, atmosphereText] = state.atmosphere;
  const balance = getCardDust(interaction.user.id);
  const description = [
    notice,
    `${atmosphereIcon} *${atmosphereText}*`,
    `⏳ До ухода: **${caravan.formatTimeLeft()}** • 💎 Баланс: **${balance} GS Dust**`,
    '',
    ...offers.map((offer, index) => `**${index + 1}.** ${caravanOfferSummary(offer)}`),
    '',
    '🤝 На каждый товар доступна одна попытка торга. Цена может снизиться, не измениться или немного вырасти.',
    '⭐ Можно отложить один товар: он вернётся во время следующего визита и займёт один из пяти слотов.',
  ].filter(Boolean).join('\n\n');
  const payload = { embeds: [new EmbedBuilder().setColor(0x7C3AED).setTitle('🐪 Караванщик').setDescription(description).setFooter({ text: 'Ассортимент персональный и не меняется до конца текущего визита.' })], components: caravanMainComponents(offers), flags: MessageFlags.Ephemeral };
  return interaction.replied || interaction.deferred ? interaction.editReply(payload) : interaction.reply(payload);
}

async function showCaravanOffer(interaction, offer, notice = '') {
  if (!offer || offer.purchased) return showCaravan(interaction, notice || '❌ Этот товар уже недоступен.');
  const bonusLines = formatBonuses(offer.item.bonuses || {});
  const details = [
    notice,
    `${offer.item.icon || '🎁'} **${offer.item.name}**`,
    `${caravanRarityText(offer.rarity)}${offer.is_daily_deal ? ` • 🔥 Товар дня: скидка ${offer.discount_percent}%` : ''}`,
    offer.item.description,
    bonusLines.length ? `**Бонусы:**\n${bonusLines.join('\n')}` : '',
    offer.item.lore ? `*${offer.item.lore}*` : '',
    `💎 Цена: **${offer.current_price} GS Dust**${offer.current_price !== offer.base_price ? ` (обычно ${offer.base_price})` : ''}`,
    `Твой баланс: **${getCardDust(interaction.user.id)} GS Dust**`,
  ].filter(Boolean).join('\n\n');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`guild:caravan:buy:${offer.id}`).setLabel('Купить').setEmoji('💎').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`guild:caravan:bargain:${offer.id}`).setLabel(offer.bargained ? 'Торг использован' : 'Поторговаться').setEmoji('🤝').setStyle(ButtonStyle.Primary).setDisabled(Boolean(offer.bargained)),
    new ButtonBuilder().setCustomId(`guild:caravan:reserve:${offer.id}`).setLabel('Отложить').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('guild:caravan').setLabel('Назад').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  const payload = { embeds: [new EmbedBuilder().setColor(0x8B5CF6).setTitle('🐪 Предложение Караванщика').setDescription(details)], components: [row], flags: MessageFlags.Ephemeral };
  return interaction.replied || interaction.deferred ? interaction.editReply(payload) : interaction.update(payload);
}

function merchantHomeRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:merchant:sell:materials').setLabel('Продать материалы').setEmoji('📦').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('guild:merchant:sell:equipment').setLabel('Продать экипировку').setEmoji('⚔️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('guild:merchant:sell:companions').setLabel('Продать питомца/маунта').setEmoji('🐾').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('guild:merchant:buy').setLabel('Купить товары').setEmoji('🛒').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guild:npcs').setLabel('К гильдейцам').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    ),
  ];
}
function professionName(key){
  return PROFESSIONS[key] ? `${PROFESSIONS[key].icon} ${PROFESSIONS[key].name}` : 'не определено';
}
function showMerchant(interaction, notice=''){
  const market=guildMerchant.marketSummary();
  const embed=new EmbedBuilder().setColor(0xC084FC).setTitle('💰 Торговец Гильдии')
    .setDescription(`${notice ? `${notice}\n\n` : ''}Я оцениваю товары по редкости, полезности и текущему положению рынка.\n\n📈 **Дефицитная профессия:** ${professionName(market.scarce?.key)} — её материалы сегодня ценятся выше.\n📉 **Самая распространённая:** ${professionName(market.abundant?.key)} — её добычу покупаю дешевле.\n\n💡 Мои цены ограничены разумным диапазоном. У игроков обычно выгоднее, а у меня можно быстро продать или срочно купить.`)
    .addFields({name:'Твой баланс',value:`💠 ${getCardDust(interaction.user.id)} GS Dust`,inline:true},{name:'Пересчёт рынка',value:'Автоматически по числу профессий и продажам за 7 дней',inline:true})
    .setFooter({text:'Торговец — страховка рынка, а не замена торговле между игроками.'});
  const payload={embeds:[embed],components:merchantHomeRows()};
  return interaction.replied||interaction.deferred?interaction.editReply(payload):interaction.update?interaction.update(payload):interaction.reply({...payload,flags:MessageFlags.Ephemeral});
}
function showMerchantMaterialList(interaction, notice=''){
  const rows=guildMerchant.sellableMaterials(interaction.user.id).slice(0,25);
  if(!rows.length) return interaction.update({content:`${notice}\n\n📦 У тебя нет материалов для продажи.`,embeds:[],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:merchant').setLabel('Назад').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]});
  const menu=new StringSelectMenuBuilder().setCustomId('guild:merchant:sell:material:select').setPlaceholder('Выбери материал для оценки').addOptions(rows.map(r=>({label:r.name.slice(0,100),value:r.key,emoji:r.icon,description:`Есть ${r.quantity} · ${r.unitPrice} Dust за 1`})));
  return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle('📦 Продажа материалов').setDescription(`${notice ? `${notice}\n\n`:''}Цена учитывает редкость, число представителей профессии и объём продаж NPC за последние 7 дней.\n\nВыбери материал — затем количество.`)],components:[new ActionRowBuilder().addComponents(menu),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:merchant').setLabel('Назад').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]});
}
function showMerchantMaterialConfirm(interaction,key,notice=''){
  const row=guildMerchant.sellableMaterials(interaction.user.id).find(x=>x.key===key);
  if(!row)return showMerchantMaterialList(interaction,'❌ Материал уже закончился.');
  const max=Math.max(1,Number(row.quantity)||1);
  const buttons=[
    new ButtonBuilder().setCustomId(`guild:merchant:sell:material:${key}:1`).setLabel('Продать 1').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`guild:merchant:sell:material:${key}:${Math.min(5,max)}`).setLabel(`Продать ${Math.min(5,max)}`).setStyle(ButtonStyle.Success).setDisabled(max<2),
    new ButtonBuilder().setCustomId(`guild:merchant:sell:material:${key}:${max}`).setLabel(`Продать всё (${max})`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('guild:merchant:sell:materials').setLabel('Назад').setStyle(ButtonStyle.Secondary),
  ];
  return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0xF59E0B).setTitle(`${row.icon} ${row.name}`).setDescription(`${notice?`${notice}\n\n`:''}В наличии: **${max}**\nЦена за единицу: **${row.unitPrice} GS Dust**\nЦена за всё: **${row.unitPrice*max} GS Dust**\n\n${row.profession?`Рынок профессии: ${professionName(row.profession)}`:'Редкий универсальный ресурс'}`)],components:[new ActionRowBuilder().addComponents(...buttons)]});
}
function showMerchantEquipmentList(interaction,notice=''){
  const rows=guildMerchant.sellableEquipment(interaction.user.id).slice(0,25);
  if(!rows.length)return interaction.update({content:`${notice}\n\n⚔️ Нет свободной экипировки для продажи. Надетые вещи не показываются.`,embeds:[],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:merchant').setLabel('Назад').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]});
  const menu=new StringSelectMenuBuilder().setCustomId('guild:merchant:sell:equipment:select').setPlaceholder('Выбери предмет для оценки').addOptions(rows.map(i=>({label:i.name.slice(0,100),value:String(i.id),description:`${RARITY_LABELS[i.rarity]||i.rarity}${i.upgrade_level?` · +${i.upgrade_level}`:''} · ${i.unitPrice} Dust`})));
  return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0xEF4444).setTitle('⚔️ Продажа экипировки').setDescription(`${notice?`${notice}\n\n`:''}Цена зависит от редкости и уровня улучшения. Надетую экипировку продать нельзя.`)],components:[new ActionRowBuilder().addComponents(menu),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:merchant').setLabel('Назад').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]});
}
function showMerchantEquipmentConfirm(interaction,id){
  const item=guildMerchant.sellableEquipment(interaction.user.id).find(x=>Number(x.id)===Number(id));
  if(!item)return showMerchantEquipmentList(interaction,'❌ Предмет уже недоступен.');
  return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0xDC2626).setTitle(`⚔️ ${item.name}`).setDescription(`Редкость: **${RARITY_LABELS[item.rarity]||item.rarity}**\nУлучшение: **+${item.upgrade_level||0}**\nОценка торговца: **${item.unitPrice} GS Dust**\n\n⚠️ Продажа необратима.`)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`guild:merchant:sell:equipment:confirm:${item.id}`).setLabel(`Продать за ${item.unitPrice}`).setEmoji('💠').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId('guild:merchant:sell:equipment').setLabel('Отмена').setStyle(ButtonStyle.Secondary))]});
}
function showMerchantCompanionList(interaction,notice=''){
 const rows=guildMerchant.sellableCompanionRows(interaction.user.id).slice(0,25);if(!rows.length)return interaction.update({content:`${notice}\n\n🐾 Нет неактивных питомцев или маунтов для продажи. Активных спутников сначала нужно отключить.`,embeds:[],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:merchant').setLabel('Назад').setStyle(ButtonStyle.Secondary))]});
 const menu=new StringSelectMenuBuilder().setCustomId('guild:merchant:sell:companion:select').setPlaceholder('Выбери питомца или маунта').addOptions(rows.map(x=>({label:(x.transfer.name||x.name).slice(0,100),value:String(x.id),emoji:x.transfer.kind==='mount'?'🐎':'🐾',description:`${x.transfer.kind==='mount'?'Маунт (ездовой)':'Питомец'} • ${x.transfer.rarity} • ${x.unitPrice} Dust`.slice(0,100)})));
 return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0xA855F7).setTitle('🐾 Продажа спутников').setDescription([notice,'Активных питомцев и активного маунта продать нельзя.','Маунт всегда подписывается как **Маунт (ездовой)**, обычный спутник — как **Питомец**.'].filter(Boolean).join('\n\n'))],components:[new ActionRowBuilder().addComponents(menu),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:merchant').setLabel('Назад').setStyle(ButtonStyle.Secondary))]});
}
function showMerchantCompanionConfirm(interaction,id){const x=guildMerchant.sellableCompanionRows(interaction.user.id).find(r=>Number(r.id)===Number(id));if(!x)return showMerchantCompanionList(interaction,'❌ Спутник недоступен.');const d=x.transfer;return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0x9333EA).setTitle(`${d.kind==='mount'?'🐎':'🐾'} ${d.name}`).setDescription(`Тип: **${d.kind==='mount'?'Маунт (ездовой)':'Питомец'}**\nРедкость: **${COMPANION_RARITIES[d.rarity]||d.rarity}**\n${d.description||''}\n\n${formatBonuses(d.bonuses).join('\n')||'Без бонусов'}\n\nОценка: **${x.unitPrice} GS Dust**`)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`guild:merchant:sell:companion:confirm:${x.id}`).setLabel(`Продать за ${x.unitPrice}`).setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId('guild:merchant:sell:companions').setLabel('Назад').setStyle(ButtonStyle.Secondary))]});}

function showMerchantBuy(interaction,notice=''){
  const rows=guildMerchant.saleStock().slice(0,25);
  if(!rows.length)return interaction.update({content:`${notice}\n\n🛒 Сегодня товары закончились.`,embeds:[],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:merchant').setLabel('Назад').setStyle(ButtonStyle.Secondary))]});
  const menu=new StringSelectMenuBuilder().setCustomId('guild:merchant:buy:select').setPlaceholder('Выбери товар').addOptions(rows.map(r=>({label:(r.meta.name||r.material_key).slice(0,100),value:r.material_key,emoji:r.meta.icon||'📦',description:`Осталось ${r.quantity} · ${r.unit_price} Dust`})));
  return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0x3B82F6).setTitle('🛒 Лавка Торговца').setDescription(`${notice?`${notice}\n\n`:''}Ассортимент ограничен и меняется каждый день.\n\n⚠️ Наценка сделана намеренно: выгоднее искать нужные материалы у других игроков.`).addFields({name:'Баланс',value:`💠 ${getCardDust(interaction.user.id)} GS Dust`,inline:true})],components:[new ActionRowBuilder().addComponents(menu),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:merchant').setLabel('Назад').setStyle(ButtonStyle.Secondary))]});
}
function showMerchantBuyConfirm(interaction,key){
  const row=guildMerchant.saleStock().find(x=>x.material_key===key);
  if(!row)return showMerchantBuy(interaction,'❌ Товар закончился.');
  return interaction.update({content:'',embeds:[new EmbedBuilder().setColor(0x2563EB).setTitle(`${row.meta.icon||'📦'} ${row.meta.name||key}`).setDescription(`В наличии: **${row.quantity}**\nЦена: **${row.unit_price} GS Dust за 1**\nРедкость: **${RARITY_LABELS[row.meta.rarity]||row.meta.rarity||'Обычный'}**\n${row.meta.description?`\n${row.meta.description}`:''}${row.meta.bonuses?`\n\n📊 ${formatBonuses(row.meta.bonuses).join('\n')}`:''}\n\nУ игроков этот материал обычно можно купить дешевле.`)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`guild:merchant:buy:confirm:${key}`).setLabel(`Купить за ${row.unit_price}`).setEmoji('💠').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:merchant:buy').setLabel('Назад').setStyle(ButtonStyle.Secondary))]});
}

async function handleComponent(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'merchant' && parts.length === 2) return showMerchant(interaction);
  if (action === 'merchant' && parts[2] === 'sell' && parts[3] === 'materials') return showMerchantMaterialList(interaction);
  if (action === 'merchant' && parts[2] === 'sell' && parts[3] === 'material' && parts[4] === 'select') return showMerchantMaterialConfirm(interaction, interaction.values?.[0]);
  if (action === 'merchant' && parts[2] === 'sell' && parts[3] === 'material' && parts[4] && parts[4] !== 'select') {
    const key=parts[4], qty=Number(parts[5]||1);
    const r=guildMerchant.sellMaterial(interaction.user.id,key,qty);
    return showMerchantMaterialList(interaction,r.ok?`✅ Продано **${r.item.name} ×${r.qty}** за **${r.total} GS Dust**.`:'❌ Продажа не выполнена.');
  }
  if (action === 'merchant' && parts[2] === 'sell' && parts[3] === 'equipment' && parts.length===4) return showMerchantEquipmentList(interaction);
  if (action === 'merchant' && parts[2] === 'sell' && parts[3] === 'equipment' && parts[4] === 'select') return showMerchantEquipmentConfirm(interaction,interaction.values?.[0]);
  if (action === 'merchant' && parts[2] === 'sell' && parts[3] === 'equipment' && parts[4] === 'confirm') {
    const r=guildMerchant.sellEquipment(interaction.user.id,Number(parts[5]));
    return showMerchantEquipmentList(interaction,r.ok?`✅ **${r.item.name}** продан за **${r.total} GS Dust**.`:'❌ Предмет не удалось продать.');
  }
  if (action === 'merchant' && parts[2] === 'sell' && parts[3] === 'companions') return showMerchantCompanionList(interaction);
  if (action === 'merchant' && parts[2] === 'sell' && parts[3] === 'companion' && parts[4] === 'select') return showMerchantCompanionConfirm(interaction,interaction.values?.[0]);
  if (action === 'merchant' && parts[2] === 'sell' && parts[3] === 'companion' && parts[4] === 'confirm') {const r=guildMerchant.sellCompanion(interaction.user.id,Number(parts[5]));return showMerchantCompanionList(interaction,r.ok?`✅ **${r.item.name}** продан за **${r.total} GS Dust**.`:'❌ Продажа не выполнена.');}
  if (action === 'merchant' && parts[2] === 'buy' && parts.length===3) return showMerchantBuy(interaction);
  if (action === 'merchant' && parts[2] === 'buy' && parts[3] === 'select') return showMerchantBuyConfirm(interaction,interaction.values?.[0]);
  if (action === 'merchant' && parts[2] === 'buy' && parts[3] === 'confirm') {
    const r=guildMerchant.buyMaterial(interaction.user.id,parts[4],1);
    return showMerchantBuy(interaction,r.ok?`✅ Куплено: **${r.meta?.name||parts[4]} ×1** за **${r.total} GS Dust**.`:r.reason==='dust'?`❌ Недостаточно GS Dust. Нужно **${r.total}**, баланс **${r.balance}**.`:'❌ Товар уже закончился.');
  }


  if (action === 'caravan' && parts.length === 2) return showCaravan(interaction);
  if (action === 'caravan' && parts[2] === 'select') {
    const offer = caravan.getOffer(interaction.user.id, Number(interaction.values?.[0]));
    return showCaravanOffer(interaction, offer);
  }
  if (action === 'caravan' && parts[2] === 'buy') {
    const result = caravan.buyOffer(interaction.user.id, Number(parts[3]));
    if (result.ok) return showCaravan(interaction, `✅ Куплено: **${result.offer.item.name}** за **${result.offer.current_price} GS Dust**. Осталось: **${result.balance} GS Dust**.`);
    if (result.reason === 'dust') return showCaravanOffer(interaction, caravan.getOffer(interaction.user.id, Number(parts[3])), `❌ Недостаточно GS Dust. Баланс: **${result.balance}**.`);
    if (result.reason === 'closed') return showCaravan(interaction, '🐪 Караванщик уже уехал.');
    return showCaravan(interaction, '❌ Не удалось совершить покупку. Товар мог уже стать недоступен.');
  }
  if (action === 'caravan' && parts[2] === 'reserve') {
    const result = caravan.reserveOffer(interaction.user.id, Number(parts[3]));
    return showCaravan(interaction, result.ok ? `⭐ Караванщик запомнил **${result.offer.item.name}**. Товар вернётся во время следующего визита.` : '❌ Не удалось отложить товар.');
  }
  if (action === 'caravan' && parts[2] === 'reservation' && parts[3] === 'cancel') {
    const result = caravan.cancelReservation(interaction.user.id);
    return showCaravan(interaction, result.ok ? '✅ Отложенный товар отменён.' : 'ℹ️ У тебя нет отложенного товара.');
  }
  if (action === 'caravan' && parts[2] === 'bargain') {
    const result = caravan.bargain(interaction.user.id, Number(parts[3]));
    if (!result.ok) return showCaravanOffer(interaction, result.offer || caravan.getOffer(interaction.user.id, Number(parts[3])), result.reason === 'used' ? 'ℹ️ Ты уже торговался за этот товар.' : '❌ Торг недоступен.');
    let message = '😐 Караванщик не изменил цену.';
    if (result.percent < 0) message = `🤝 Удачный торг! Цена снижена на **${Math.abs(result.percent)}%**: ${result.oldPrice} → **${result.newPrice} GS Dust**.`;
    if (result.percent > 0) message = `😅 Караванщик заметил твой интерес и поднял цену на **${result.percent}%**: ${result.oldPrice} → **${result.newPrice} GS Dust**.`;
    return showCaravanOffer(interaction, result.offer, message);
  }

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
  if (action === 'npcs') return interaction.reply({ content:`## 🏰 Гильдейцы\nВыбери нужного мастера Гильдии.`, components:npcRows(), flags:MessageFlags.Ephemeral });
  if (action === 'economylog') { const command=interaction.client.commands.get('economylog'); return command?.execute ? command.execute(interaction) : interaction.reply({content:'❌ Журнал временно недоступен.',flags:MessageFlags.Ephemeral}); }
  if (action === 'profile' && parts[2] === 'displayclass') {
    const classKey=interaction.values?.[0];
    if(!HERO_CLASSES[classKey]) return showProfile(interaction,'❌ Класс не найден.');
    db.prepare('UPDATE heroes SET display_class_key=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(classKey,interaction.user.id);
    return showProfile(interaction,`✅ В профиле теперь отображается класс **${HERO_CLASSES[classKey].name}**.`);
  }
  if (action === 'profile' && parts[2] === 'rename') {
    const modal=new ModalBuilder().setCustomId('guild:profile:rename:modal').setTitle('Изменить имя героя');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel('Новое имя • стоимость 200 GS Dust').setMinLength(2).setMaxLength(24).setRequired(true).setStyle(TextInputStyle.Short)));
    return interaction.showModal(modal);
  }

  if (action === 'registry' && parts.length === 2) return showRegistry(interaction);
  if (action === 'registry' && parts[2] === 'heroes') return showRegistryHeroes(interaction);
  if (action === 'registry' && parts[2] === 'classes') return showRegistryClasses(interaction);
  if (action === 'registry' && parts[2] === 'professions') return showRegistryProfessions(interaction);
  if (action === 'registry' && parts[2] === 'stats') return showRegistryStats(interaction);
  if (action === 'masters') return showMasters(interaction);
  if (action === 'profession' && parts.length === 2) return showProfessionHub(interaction);
  if (action === 'profession' && parts[2] === 'change' && parts.length === 3) {
    const current=getProfession(interaction.user.id);
    if(!current) return interaction.update({content:'❌ Сначала выбери профессию через `/profession choose`.',embeds:[],components:[guildNavRow('profession')]});
    const options=Object.entries(PROFESSIONS).filter(([key])=>key!==current.profession_key).map(([value,p])=>({label:p.name,value,emoji:p.icon,description:`Смена за ${PROFESSION_CHANGE_COST} GS Dust · прогресс новой профессии начнётся с 1 уровня`}));
    const menu=new StringSelectMenuBuilder().setCustomId('guild:profession:change:select').setPlaceholder('Выбери новую профессию').addOptions(options);
    return interaction.update({content:`## 🔄 Смена профессии
Текущая: **${PROFESSIONS[current.profession_key]?.icon||'👷'} ${PROFESSIONS[current.profession_key]?.name||current.profession_key}**
Стоимость: **${PROFESSION_CHANGE_COST} GS Dust**

⚠️ Уровень, опыт, специализация и прогресс текущей профессии будут сброшены. Предметы и материалы сохранятся.`,embeds:[],components:[new ActionRowBuilder().addComponents(menu),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:profession').setLabel('Назад').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]});
  }
  if (action === 'profession' && parts[2] === 'change' && parts[3] === 'select') {
    const nextKey=interaction.values?.[0];
    const current=getProfession(interaction.user.id);
    const next=PROFESSIONS[nextKey];
    if(!current||!next) return showProfessionHub(interaction);
    return interaction.update({content:`## ⚠️ Подтверждение смены
**Сейчас:** ${PROFESSIONS[current.profession_key]?.icon||'👷'} ${PROFESSIONS[current.profession_key]?.name||current.profession_key}
**Новая:** ${next.icon} ${next.name}
**Цена:** ${PROFESSION_CHANGE_COST} GS Dust

Подтвердить смену профессии?`,embeds:[],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`guild:profession:change:confirm:${nextKey}`).setLabel('Подтвердить').setEmoji('✅').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId('guild:profession').setLabel('Отмена').setEmoji('❌').setStyle(ButtonStyle.Secondary))]});
  }
  if (action === 'profession' && parts[2] === 'change' && parts[3] === 'confirm') {
    const nextKey=parts[4];
    const result=changeProfession(interaction.user.id,nextKey);
    let notice='❌ Не удалось сменить профессию.';
    if(result.ok) notice=`✅ Профессия изменена на **${PROFESSIONS[nextKey]?.icon||'👷'} ${PROFESSIONS[nextKey]?.name||nextKey}**. Списано **${PROFESSION_CHANGE_COST} GS Dust**.`;
    else if(result.reason==='dust') notice=`❌ Недостаточно GS Dust. Нужно **${PROFESSION_CHANGE_COST}**, баланс: **${result.balance||0}**.`;
    else if(result.reason==='same') notice='ℹ️ Эта профессия уже выбрана.';
    return showProfessionHub(interaction,notice);
  }
  if (action === 'profession' && parts[2] === 'processing') return showProfessionProcessing(interaction);
  if (action === 'profession' && parts[2] === 'process') {
    const current=getProfession(interaction.user.id);
    const recipe=professionProcessingRecipe(current?.profession_key);
    if(!recipe) return showProfessionProcessing(interaction,'❌ Для этой профессии переработка недоступна.');
    const owned=getResourceQuantity(interaction.user.id,recipe.input);
    const possible=Math.floor(owned/recipe.inputQty);
    const batches=parts[3]==='all'?possible:Math.max(1,Number(parts[3])||1);
    const result=processProfessionMaterial(interaction.user.id,batches);
    const notice=result.ok
      ? `✅ Переработано партий: **${result.batches}**. Получено: **${ITEMS[result.recipe.output]?.name||result.recipe.output} ×${result.produced}**.`
      : result.reason==='materials'?'❌ Недостаточно сырья для выбранного количества.':'❌ Переработка не выполнена.';
    return showProfessionProcessing(interaction,notice);
  }
  if (action === 'storage') { const result=await showStorage(interaction); return result; }
  if (action === 'orders' && parts.length === 2) return showOrdersHub(interaction);
  if (action === 'orders' && parts[2] === 'buy' && parts.length===3) return showMarketBuy(interaction);
  if (action === 'orders' && parts[2] === 'buy' && parts[3] === 'eq') {const id=Number(interaction.values[0]);const l=listEquipmentMarket(100).find(x=>x.id===id);if(!l)return showMarketBuy(interaction,'❌ Лот уже недоступен.');return interaction.update({embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle('Подтвердить покупку').setDescription(`⚔️ **${l.item_name}**\nРедкость: ${l.rarity}${l.upgrade_level?` • +${l.upgrade_level}`:''}\nЦена: **${l.price} GS Dust**`)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`guild:orders:buy:confirm:${id}`).setLabel('Купить').setEmoji('✅').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('guild:orders:buy').setLabel('Отмена').setStyle(ButtonStyle.Secondary))]});}
  if (action === 'orders' && parts[2] === 'buy' && parts[3] === 'confirm') {const r=buyListing(interaction.user.id,Number(parts[4]));const fail=r.reason==='dust'?`❌ Недостаточно GS Dust. Нужно **${r.price||0}**, баланс: **${r.balance||0}**.`:r.reason==='self'?'❌ Нельзя купить собственный лот.':r.reason==='grant'?'❌ Не удалось передать предмет. Покупка полностью отменена, Dust не списан.':'❌ Лот уже куплен, снят с продажи или недоступен.';return showMarketBuy(interaction,r.ok?`✅ Куплено: **${r.listing.item_name}** за **${r.listing.price} GS Dust**.`:fail);}
  if (action === 'orders' && parts[2] === 'sell' && parts.length===3) return showMarketSell(interaction);
  if (action === 'orders' && parts[2] === 'sell' && parts[3] === 'resource') {const key=interaction.values[0];const orders=listOpenOrders(25).filter(o=>o.item_key===key&&o.buyer_id!==interaction.user.id);if(!orders.length)return showMarketSell(interaction,`ℹ️ Сейчас нет заказов на **${itemName(key)}**.`);return interaction.update({embeds:[new EmbedBuilder().setColor(0xF59E0B).setTitle(`Продать: ${itemName(key)}`).setDescription(`У тебя: **${getResourceQuantity(interaction.user.id,key)}**\nВыбери заказ.`)],components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`guild:orders:sell:order:${key}`).setPlaceholder('Выбери заказ').addOptions(orders.map(o=>({label:`№${o.id} • ${o.price_each} Dust/шт.`.slice(0,100),description:`Нужно до ${o.quantity_remaining} единиц`,value:String(o.id),emoji:itemIcon(key)})))),marketBackRow()]});}
  if (action === 'orders' && parts[2] === 'sell' && parts[3] === 'order') return interaction.showModal(marketModal(`guild:market:fulfill:${parts[4]}:${interaction.values[0]}`,'Количество для продажи',[{id:'quantity',label:'Сколько единиц продать',placeholder:'Например: 5'}]));
  if (action === 'orders' && parts[2] === 'sell' && parts[3] === 'eq') return interaction.showModal(marketModal(`guild:market:eqsell:${interaction.values[0]}`,'Выставить экипировку',[{id:'price',label:'Цена в GS Dust',placeholder:'Например: 300'}]));
  if (action === 'orders' && parts[2] === 'sell' && parts[3] === 'companion') return interaction.showModal(marketModal(`guild:market:companionsell:${interaction.values[0]}`,'Выставить питомца или маунта',[{id:'price',label:'Цена в GS Dust',placeholder:'Например: 500'}]));
  if (action === 'orders' && parts[2] === 'buy' && parts[3] === 'companion') {const lot=listCompanionMarket(50).find(x=>Number(x.id)===Number(interaction.values[0]));if(!lot)return showMarketBuy(interaction,'❌ Лот уже недоступен.');return interaction.update({embeds:[new EmbedBuilder().setColor(0xA855F7).setTitle(`${lot.companion_kind==='mount'?'🐎':'🐾'} ${lot.companion_name}`).setDescription(`Тип: **${lot.companion_kind==='mount'?'Маунт (ездовой)':'Питомец'}**\nРедкость: **${COMPANION_RARITIES[lot.rarity]||lot.rarity}**\nЦена: **${lot.price} GS Dust**`)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`guild:orders:buy:companionconfirm:${lot.id}`).setLabel(`Купить за ${lot.price}`).setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('guild:orders:buy').setLabel('Назад').setStyle(ButtonStyle.Secondary))]});}
  if (action === 'orders' && parts[2] === 'buy' && parts[3] === 'companionconfirm') {const r=buyCompanionListing(interaction.user.id,Number(parts[4]));return showMarketBuy(interaction,r.ok?'✅ Питомец или маунт куплен.':r.reason==='dust'?'❌ Не хватает GS Dust.':'❌ Лот уже недоступен.');}
  if (action === 'orders' && parts[2] === 'mine' && parts[3] === 'companioncancel') {const r=cancelCompanionListing(interaction.user.id,Number(interaction.values[0]));return showMarketMine(interaction,r.ok?'✅ Лот снят, питомец или маунт возвращён.':'❌ Лот недоступен.');}

  if (action === 'orders' && parts[2] === 'sell' && parts[3] === 'blacksmith') {const rows=duplicateEquipment(interaction.user.id).slice(0,25);if(!rows.length)return showMarketSell(interaction,'ℹ️ Нет свободных дубликатов.');return interaction.update({embeds:[new EmbedBuilder().setColor(0xF59E0B).setTitle('🔨 Продажа кузнецу').setDescription('Выбери дубликат. Продажа произойдёт сразу.')],components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:sell:blacksmithitem').setPlaceholder('Выбери предмет').addOptions(rows.map(x=>({label:x.name.slice(0,100),description:`${x.rarity} • свободно ${x.sellable}`,value:String(x.id),emoji:'🔨'})))),marketBackRow()]});}
  if (action === 'orders' && parts[2] === 'sell' && parts[3] === 'blacksmithitem') {const r=sellToBlacksmith(interaction.user.id,Number(interaction.values[0]));return showMarketSell(interaction,r.ok?`✅ Кузнец купил **${r.item.name}** за **${r.earned} GS Dust**.`:'❌ Продажа не выполнена.');}
  if (action === 'orders' && parts[2] === 'requests' && parts.length===3) return showMarketRequests(interaction);
  if (action === 'orders' && parts[2] === 'requests' && parts[3] === 'create') {const all=Object.values(MATERIALS).filter(x=>x?.key).slice(0,25);const opts=Object.entries(MATERIALS).slice(0,25).map(([key,x])=>({label:(x.name||key).slice(0,100),value:key,emoji:x.icon||'📦'}));return interaction.update({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('Создать заказ').setDescription('Выбери материал, затем укажи количество и цену за единицу.')],components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('guild:orders:requests:createitem').setPlaceholder('Выбери материал').addOptions(opts)),marketBackRow()]});}
  if (action === 'orders' && parts[2] === 'requests' && parts[3] === 'createitem') return interaction.showModal(marketModal(`guild:market:createorder:${interaction.values[0]}`,'Новый заказ',[{id:'quantity',label:'Количество',placeholder:'Например: 20'},{id:'price',label:'Цена за 1 единицу',placeholder:'Например: 5'}]));
  if (action === 'orders' && parts[2] === 'requests' && parts[3] === 'fulfill') {const o=listOpenOrders(100).find(x=>x.id===Number(interaction.values[0]));if(!o)return showMarketRequests(interaction,'❌ Заказ уже закрыт.');return interaction.showModal(marketModal(`guild:market:fulfill:${o.item_key}:${o.id}`,'Выполнить заказ',[{id:'quantity',label:'Количество',placeholder:`Максимум ${o.quantity_remaining}`}]))}
  if (action === 'orders' && parts[2] === 'mine' && parts.length===3) return showMarketMine(interaction);
  if (action === 'orders' && parts[2] === 'mine' && parts[3] === 'eqcancel') {const r=cancelListing(interaction.user.id,Number(interaction.values[0]));return showMarketMine(interaction,r.ok?'✅ Лот снят, предмет возвращён.':'❌ Лот уже недоступен.');}
  if (action === 'orders' && parts[2] === 'mine' && parts[3] === 'ordercancel') {const r=cancelOrder(Number(interaction.values[0]),interaction.user.id);return showMarketMine(interaction,r.ok?`✅ Заказ отменён, возвращено ${r.refund} Dust.`:'❌ Заказ уже недоступен.');}
  if (action === 'orders' && parts[2] === 'mine' && parts[3] === 'excancel') {
    const id=Number(interaction.values[0]), uid=String(interaction.user.id);let ok=false;
    try{db.transaction(()=>{const lot=db.prepare("SELECT * FROM market_exchange_lots WHERE id=? AND creator_id=? AND status='open'").get(id,uid);if(!lot)throw new Error('missing');const claim=db.prepare("UPDATE market_exchange_lots SET status='cancelling' WHERE id=? AND creator_id=? AND status='open'").run(id,uid);if(claim.changes!==1)throw new Error('missing');if(lot.offer_type==='material')grantResource(uid,lot.offer_key,Number(lot.offer_qty),'market_exchange_cancel');else if(lot.offer_type==='dust')addCardDust(uid,Number(lot.offer_qty),'Отмена обмена');else if(lot.offer_type==='companion'){if(!giveTransferredCompanion(uid,JSON.parse(lot.offer_data||'{}')))throw new Error('grant');}else if(lot.offer_type==='equipment')giveEquipmentTrade(uid,lot.offer_key,Number(lot.offer_upgrade)||0);else throw new Error('type');db.prepare("UPDATE market_exchange_lots SET status='cancelled',closed_at=CURRENT_TIMESTAMP WHERE id=? AND status='cancelling'").run(id);ok=true;})();}catch(_){}return showMarketMine(interaction,ok?'✅ Обмен отменён, зарезервированное имущество возвращено.':'❌ Предложение уже закрыто или не удалось вернуть имущество.');
  }
  if (action === 'orders' && parts[2] === 'exchange' && parts.length===3) return showExchangeHub(interaction);
  if (action === 'orders' && parts[2] === 'exchange' && parts[3] === 'list') return showExchangeHub(interaction);
  if (action === 'orders' && parts[2] === 'exchange' && parts[3] === 'create') return interaction.update({embeds:[new EmbedBuilder().setColor(0xEC4899).setTitle('Что отдаёшь?').setDescription('Выбери тип предмета для обмена.')],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:orders:exchange:offer:material').setLabel('Материал').setEmoji('🪨').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:orders:exchange:offer:equipment').setLabel('Экипировка').setEmoji('⚔️').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:orders:exchange:offer:dust').setLabel('GS Dust').setEmoji('💎').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:orders:exchange:offer:companion').setLabel('Питомец/маунт').setEmoji('🐾').setStyle(ButtonStyle.Primary)),marketBackRow()]});
  if (action === 'orders' && parts[2] === 'exchange' && parts[3] === 'offer') {const type=parts[4];if(type==='dust'){const balance=getCardDust(interaction.user.id);if(balance<1)return showExchangeHub(interaction,'❌ У тебя нет GS Dust для обмена.');marketDrafts.set(interaction.user.id,{offerType:'dust',offerValue:'gs_dust'});return interaction.update({embeds:[new EmbedBuilder().setColor(0xEC4899).setTitle('Что хочешь получить?').setDescription(`Доступно: **${balance} GS Dust**`)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:orders:exchange:want:material').setLabel('Материал').setEmoji('🪨').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:orders:exchange:want:equipment').setLabel('Экипировка').setEmoji('⚔️').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:orders:exchange:want:dust').setLabel('GS Dust').setEmoji('💎').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:orders:exchange:want:companion').setLabel('Питомец/маунт').setEmoji('🐾').setStyle(ButtonStyle.Primary)),marketBackRow()]});}const rows=type==='material'?listResources(interaction.user.id).filter(x=>x.quantity>0):type==='companion'?sellableCompanions(interaction.user.id):duplicateEquipment(interaction.user.id);if(!rows.length)return showExchangeHub(interaction,'❌ Нет подходящих предметов.');return interaction.update({embeds:[new EmbedBuilder().setColor(0xEC4899).setTitle('Выбери, что отдаёшь')],components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`guild:orders:exchange:offerset:${type}`).setPlaceholder('Выбери предмет').addOptions(rows.slice(0,25).map(x=>({label:(x.name||x.key).slice(0,100),description:type==='material'?`Доступно ${x.quantity}`:type==='companion'?`${x.companion_kind==='mount'?'Маунт (ездовой)':'Питомец'} • ${x.rarity}`:`Свободно ${x.sellable}`,value:type==='material'?x.key:String(x.id),emoji:type==='material'?(x.icon||'📦'):type==='companion'?(x.companion_kind==='mount'?'🐎':'🐾'):'⚔️'})))),marketBackRow()]});}
  if (action === 'orders' && parts[2] === 'exchange' && parts[3] === 'offerset') {marketDrafts.set(interaction.user.id,{offerType:parts[4],offerValue:interaction.values[0]});return interaction.update({embeds:[new EmbedBuilder().setColor(0xEC4899).setTitle('Что хочешь получить?')],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:orders:exchange:want:material').setLabel('Материал').setEmoji('🪨').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:orders:exchange:want:equipment').setLabel('Экипировка').setEmoji('⚔️').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:orders:exchange:want:dust').setLabel('GS Dust').setEmoji('💎').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('guild:orders:exchange:want:companion').setLabel('Питомец/маунт').setEmoji('🐾').setStyle(ButtonStyle.Primary)),marketBackRow()]});}
  if (action === 'orders' && parts[2] === 'exchange' && parts[3] === 'want') {const type=parts[4];if(type==='dust'){const d=marketDrafts.get(interaction.user.id);if(!d)return showExchangeHub(interaction,'❌ Черновик обмена устарел.');d.wantType='dust';d.wantKey='gs_dust';marketDrafts.set(interaction.user.id,d);return interaction.showModal(marketModal('guild:market:exchangeqty','Количество в обмене',[{id:'offer_qty',label:'Сколько отдаёшь',placeholder:d.offerType==='equipment'?'1':'Например: 100'},{id:'want_qty',label:'Сколько GS Dust хочешь',placeholder:'Например: 250'}]));}const all=type==='material'?Object.entries(MATERIALS):type==='companion'?db.prepare('SELECT companion_key key,MAX(name) name,MAX(rarity) rarity FROM hero_companions GROUP BY companion_key ORDER BY name LIMIT 25').all().map(x=>[x.key,{name:x.name,rarity:x.rarity,kind:(COMPANIONS[x.key]?.kind||(/mount|маунт|конь|олень|виверн|скакун/i.test(x.name)?'mount':'pet'))}]):allEquipmentCatalog(25).map(x=>[x.key,x]);const opts=all.slice(0,25).map(([k,x])=>({label:(x.name||k).slice(0,100),value:k,emoji:type==='material'?(x.icon||'📦'):type==='companion'?(x.kind==='mount'?'🐎':'🐾'):'⚔️'}));const rows=[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`guild:orders:exchange:wanted:${type}`).setPlaceholder('Выбери предмет из списка').addOptions(opts))];if(type==='equipment')rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:orders:exchange:search').setLabel('Поиск по названию').setEmoji('🔎').setStyle(ButtonStyle.Primary)));rows.push(marketBackRow());return interaction.update({embeds:[new EmbedBuilder().setColor(0xEC4899).setTitle('Выбери желаемый предмет').setDescription(type==='equipment'?'В списке показаны первые 25 предметов. Если нужного нет — используй поиск по названию.':type==='companion'?'Выбери питомца или маунта, которого хочешь получить.':'Выбери материал из списка.')],components:rows});}
  if (action === 'orders' && parts[2] === 'exchange' && parts[3] === 'search') return interaction.showModal(marketModal('guild:market:exchangesearch','Поиск экипировки',[{id:'query',label:'Название предмета',placeholder:'Например: Амулет Рассвета'}]));
  if (action === 'orders' && parts[2] === 'exchange' && parts[3] === 'wanted') {const d=marketDrafts.get(interaction.user.id);if(!d)return showExchangeHub(interaction,'❌ Черновик обмена устарел.');d.wantType=parts[4];d.wantKey=interaction.values[0];marketDrafts.set(interaction.user.id,d);return interaction.showModal(marketModal('guild:market:exchangeqty','Количество в обмене',[{id:'offer_qty',label:'Сколько отдаёшь',placeholder:d.offerType==='equipment'?'1':'Например: 5'},{id:'want_qty',label:'Сколько хочешь получить',placeholder:d.wantType==='equipment'?'1':'Например: 5'}]));}
  if (action === 'orders' && parts[2] === 'exchange' && parts[3] === 'take') {const lot=db.prepare("SELECT * FROM market_exchange_lots WHERE id=? AND status='open'").get(Number(interaction.values[0]));if(!lot)return showExchangeHub(interaction,'❌ Предложение уже закрыто.');return interaction.update({embeds:[new EmbedBuilder().setColor(0xEC4899).setTitle('Подтвердить обмен').setDescription(`Ты отдаёшь: **${lot.want_name} ×${lot.want_qty}**\nПолучаешь: **${lot.offer_name} ×${lot.offer_qty}**`)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`guild:orders:exchange:confirm:${lot.id}`).setLabel('Обменять').setEmoji('✅').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('guild:orders:exchange').setLabel('Отмена').setStyle(ButtonStyle.Secondary))]});}
  if (action === 'orders' && parts[2] === 'exchange' && parts[3] === 'confirm') {
    const id=Number(parts[4]), takerId=String(interaction.user.id);
    let completed=null, reason='transaction';
    try{
      completed=db.transaction(()=>{
        const lot=db.prepare("SELECT * FROM market_exchange_lots WHERE id=? AND status='open'").get(id);
        if(!lot)throw new Error('closed');
        if(String(lot.creator_id)===takerId)throw new Error('self');
        if(!claimExchangeLot(id,takerId))throw new Error('closed');

        if(lot.want_type==='material'){
          if(!consumeResources(takerId,{[lot.want_key]:Number(lot.want_qty)}).ok)throw new Error('materials');
          grantResource(lot.creator_id,lot.want_key,Number(lot.want_qty),'market_exchange_received');
        }else if(lot.want_type==='dust'){
          const payment=removeCardDust(takerId,Number(lot.want_qty),`Обмен №${id}`);
          if(!payment?.ok)throw new Error('dust');
          addCardDust(String(lot.creator_id),Number(lot.want_qty),`Обмен №${id}`);
        }else if(lot.want_type==='companion'){
          const owned=sellableCompanions(takerId).find(x=>x.companion_key===lot.want_key);
          const data=owned&&takeCompanionForTransfer(takerId,owned.id);
          if(!data)throw new Error('companion');
          if(!giveTransferredCompanion(lot.creator_id,data))throw new Error('grant');
        }else if(lot.want_type==='equipment'){
          const inv=duplicateEquipment(takerId).find(x=>x.item_key===lot.want_key);
          const removed=inv&&removeEquipmentForTrade(takerId,inv.id);
          if(!removed)throw new Error('equipment');
          giveEquipmentTrade(lot.creator_id,removed.key,removed.upgrade||0);
        }else throw new Error('want_type');

        if(lot.offer_type==='material')grantResource(takerId,lot.offer_key,Number(lot.offer_qty),'market_exchange_received');
        else if(lot.offer_type==='dust')addCardDust(takerId,Number(lot.offer_qty),`Обмен №${id}`);
        else if(lot.offer_type==='companion'){
          const data=JSON.parse(lot.offer_data||'{}');
          if(!giveTransferredCompanion(takerId,data))throw new Error('grant');
        }else if(lot.offer_type==='equipment')giveEquipmentTrade(takerId,lot.offer_key,Number(lot.offer_upgrade)||0);
        else throw new Error('offer_type');

        const closed=db.prepare("UPDATE market_exchange_lots SET status='completed',closed_at=CURRENT_TIMESTAMP WHERE id=? AND status='processing' AND taker_id=?").run(id,takerId);
        if(closed.changes!==1)throw new Error('closed');
        return lot;
      })();
    }catch(e){reason=e?.message||'transaction';}
    const errors={dust:'❌ Недостаточно GS Dust.',materials:'❌ Недостаточно материалов.',companion:'❌ Нужный питомец или маунт не найден либо активен.',equipment:'❌ Нужный предмет не найден.',closed:'❌ Предложение уже закрыто.',self:'❌ Нельзя принять собственный обмен.'};
    return showExchangeHub(interaction,completed?'✅ Обмен успешно завершён: предметы и GS Dust переданы одновременно.':(errors[reason]||'❌ Обмен не выполнен. Ничего не было списано.'));
  }
  if (action === 'chests' && parts.length === 2) return showChestsHub(interaction);
  if (action === 'chests' && parts[2] === 'loot') return interaction.update({embeds:[new EmbedBuilder().setColor(0xEAB308).setTitle('📖 Возможная добыча из сундуков').setDescription('📦 **Обычный:** Dust, обычные материалы, небольшой шанс экипировки.\n🎁 **Редкий:** больше материалов и повышенный шанс экипировки.\n🧰 **Эпический:** ценные материалы и высокий шанс сильного предмета.\n👑 **Легендарный:** крупная награда и очень высокий шанс экипировки.\n🐉 **Сундук босса:** особая добыча Мирового босса.\n\nТочный результат определяется только при открытии.')],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guild:chests').setLabel('Назад').setEmoji('↩️').setStyle(ButtonStyle.Secondary))]});
  if (action === 'chests' && parts[2] === 'open') {
    const result=openChest(interaction.user.id,interaction.values?.[0]);
    if(!result.ok)return showChestsHub(interaction,result.reason==='none'?'❌ У тебя больше нет такого сундука.':'❌ Не удалось открыть сундук.');
    const r=result.rewards;
    const materialLines=r.materials.map(x=>{const m=MATERIALS[x.key];return `${m?.icon||'📦'} **${m?.name||x.key} ×${x.quantity}**`;});
    const rewardLines=[`💠 **${r.dust} Dust**`,...materialLines,r.item?`⚔️ **${r.item.name}** [${r.item.rarity}]`:null].filter(Boolean);
    return showChestsHub(interaction,`${result.chest.icon} **${result.chest.name} открыт!**\n${rewardLines.join('\n')}`);
  }
  if (action === 'cook' && parts.length === 2) return showCook(interaction);
  if (action === 'cook' && parts[2] === 'recipe') return showCookRecipe(interaction, interaction.values?.[0]);
  if (action === 'cook' && parts[2] === 'make') {
    const recipeKey = parts.slice(3).join(':');
    const result = cook(interaction.user.id, recipeKey);
    const notice = result.ok ? `✅ Марко приготовил: **${result.recipe.item.name}**.` :
      result.reason === 'ingredients' ? '❌ Не хватает ингредиентов.' :
      result.reason === 'level' ? `❌ Нужен уровень героя ${result.requiredLevel}.` : '❌ Приготовить блюдо не удалось.';
    return showCookRecipe(interaction, recipeKey, notice);
  }
  if (action === 'hospital' && parts.length === 2) return showHospital(interaction);
  if (action === 'hospital' && parts[2] === 'heal') return healInHospital(interaction);
  if (action === 'hospital' && parts[2] === 'expedition') return interaction.reply({ content:`🗺️ Перейди в канал <#${EXPEDITION_CHANNEL_ID}> и выбери новую экспедицию.`, flags:MessageFlags.Ephemeral });
  if (action === 'profile' && parts.length === 2) return showProfile(interaction);
  if (action === 'inventory' && parts.length === 2) return showInventory(interaction);
  if (action === 'inventory' && parts[2] === 'select') return showInventoryItem(interaction, interaction.values?.[0]);
  if (action === 'inventory' && parts[2] === 'equip') { const r=equipItem(interaction.user.id,Number(parts[3])); const msg=r.ok?'✅ Предмет экипирован.':r.reason==='class_restricted'?'❌ Этот класс не может использовать данный тип оружия или щита.':r.reason==='two_handed_conflict'?'❌ Двуручное оружие нельзя использовать одновременно со щитом.':'❌ Не удалось экипировать предмет.'; return showInventoryItem(interaction,parts[3],msg); }
  if (action === 'inventory' && parts[2] === 'unequip') { const r=unequipInventoryItem(interaction.user.id,Number(parts[3])); return showInventory(interaction,r.ok?'✅ Предмет снят.':'❌ Не удалось снять предмет.'); }
  if (action === 'inventory' && parts[2] === 'mount' && parts.length === 3) return showInventoryCompanion(interaction, Number(interaction.values?.[0]));
  if (action === 'classes' && parts.length === 2) return showClasses(interaction);
  if (action === 'classes' && parts[2] === 'select') return showClassDetails(interaction, interaction.values?.[0]);

  if (action === 'blacksmith' && parts.length === 2) return showBlacksmith(interaction);
  if (action === 'blacksmith' && parts[2] === 'menu') return showBlacksmith(interaction, '', parts[3] || 'all');
  if (action === 'blacksmith' && parts[2] === 'category') return showBlacksmith(interaction, '', interaction.values?.[0] || 'all');
  if (action === 'blacksmith' && parts[2] === 'recipe') return showBlacksmithRecipe(interaction, interaction.values?.[0], '', parts[3] || 'all');
  if (action === 'blacksmith' && parts[2] === 'craft') {
    const category = BLACKSMITH_CATEGORIES[parts[3]] ? parts[3] : 'all';
    const recipeKey = parts.slice(BLACKSMITH_CATEGORIES[parts[3]] ? 4 : 3).join(':');
    const result = craft(interaction.user.id, recipeKey, 1);
    const notice = result.ok ? `✅ Создано: **${result.recipe.item.name}**. Потрачено ${result.spent} Dust.` :
      result.reason === 'materials' ? '❌ Не хватает материалов.' :
      result.reason === 'dust' ? '❌ Не хватает Dust.' :
      result.reason === 'level' ? '❌ Недостаточный уровень героя.' : '❌ Создание не удалось.';
    return showBlacksmithRecipe(interaction, recipeKey, notice, category);
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

  if (action === 'inventory' && ['companion','mount','pet'].includes(parts[2]) && parts.length === 3) return showInventoryCompanion(interaction, Number(interaction.values?.[0]));
  if (action === 'inventory' && parts[2] === 'companion' && parts[3] === 'toggle') {
    const id=Number(parts[4]);
    const result=activateCompanion(interaction.user.id,id);
    const notice=result.ok?(result.active?`✅ **${result.companion.name}** активирован.`:`✅ **${result.companion.name}** снят.`):(result.reason==='max_active'?'❌ Уже активно 3 питомца. Сначала сними одного.':'❌ Не удалось изменить активность.');
    return showInventoryCompanion(interaction,id,notice);
  }
  if (action === 'pets' && parts.length === 2) return showPets(interaction);
  if (action === 'pets' && parts[2] === 'activate') {
    const result = activateCompanion(interaction.user.id, Number(interaction.values?.[0]));
    const rows = listCompanions(interaction.user.id).filter(r=>r.companion_kind!=='mount');
    const notice = result.ok ? (result.kind==='mount' ? (result.active ? `✅ Активный маунт: **${result.companion.name}**.` : `✅ Маунт **${result.companion.name}** снят.`) : (result.active ? `✅ Питомец **${result.companion.name}** активирован${result.slot?` в слоте ${result.slot}/3`:''}.` : `✅ Питомец **${result.companion.name}** снят.`)) : (result.reason==='max_active' ? '❌ Уже активно 3 питомца. Сначала сними одного повторным выбором.' : '❌ Питомец не найден.');
    const text = rows.length ? rows.map(r => {
      const d = COMPANIONS[r.companion_key] || {};
      const bonuses = Object.entries(d.bonuses || {}).map(([k,v]) => `${k==='expedition_success'?'успех экспедиций':k==='rare_find'?'редкая добыча':k==='world_boss_damage'?'урон по боссу':'защита от босса'} +${v}%`).join(' · ');
      return `${r.active_mount?'🟣':r.active_slot?'🟢':'⚪'} **#${r.id} ${d.icon||(r.companion_kind==='mount'?'🐎':'🐾')} ${r.name}** · ${COMPANION_RARITIES[r.rarity]||r.rarity}\n${bonuses||'Без пассивного бонуса'}`;
    }).join('\n\n') : 'Питомцев пока нет.';
    const embed = new EmbedBuilder().setColor(0x38BDF8).setTitle('🐾 Питомцы героя').setDescription(`${notice}\n\n${text}`).setFooter({text:'Можно активировать до 3 питомцев. Маунты теперь находятся в Инвентаре в отдельном слоте.'});
    const components=[guildNavRow('pets')];
    if(rows.length) components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('guild:pets:activate').setPlaceholder('Выбрать активного питомца')
        .addOptions(rows.slice(0,25).map(r=>({label:`#${r.id} ${r.name}`.slice(0,100),value:String(r.id),emoji:r.active?'🟢':'🐾',description:r.active_slot?`Активен: слот ${r.active_slot}`:'Активировать питомца'})))
    ));
    return interaction.update({embeds:[embed],components});
  }
  if (action === 'artifacts') return showArtifacts(interaction);

  if (action === 'codex') {
    const classRows=db.prepare(`SELECT h.user_id,h.name,h.class_key,h.level
      FROM heroes h ORDER BY h.class_key,h.level DESC,h.name`).all();
    const classText=Object.entries(HERO_CLASSES).map(([key,c])=>{
      const members=classRows.filter(r=>r.class_key===key);
      const lines=members.length
        ? members.map(r=>`• <@${r.user_id}> — **${r.name}** · уровень ${r.level}`).join('\n')
        : '• Представителей пока нет';
      return `### ${c.icon} ${c.name}\n${lines}`;
    }).join('\n\n');
    const embed=new EmbedBuilder().setColor(0x8B5CF6).setTitle('📖 Кодекс классов Гильдии')
      .setDescription(`Только классы героев: участники Discord, имена персонажей и уровни.\n\n${classText}`.slice(0,4000))
      .setFooter({text:'Профессии отображаются отдельно в Реестре Гильдии.'});
    return interaction.reply({embeds:[embed],components:[],flags:MessageFlags.Ephemeral});
  }

}

async function handleModal(interaction) {
  const parts = interaction.customId.split(':');
  if (interaction.customId === 'guild:profile:rename:modal') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const name = interaction.fields.getTextInputValue('new_name').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 24) {
      return interaction.editReply({ content: '❌ Имя должно содержать от 2 до 24 символов.' });
    }
    const hero = getHero(interaction.user.id);
    if (!hero) return interaction.editReply({ content: '❌ Сначала создай героя.' });

    try {
      const result = db.transaction(() => {
        const payment = removeCardDust(interaction.user.id, 200, 'Смена имени героя');
        if (!payment?.ok) return { ok: false, reason: 'dust', balance: payment?.balance || 0 };
        const updated = db.prepare('UPDATE heroes SET name=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
          .run(name, interaction.user.id);
        if (!updated.changes) throw new Error('Hero rename updated zero rows');
        return { ok: true };
      })();
      if (!result.ok) {
        return interaction.editReply({ content: `❌ Недостаточно GS Dust. Нужно **200**, баланс: **${result.balance}**.` });
      }
      return interaction.editReply({ content: `✅ Имя героя изменено на **${name}**. Списано **200 GS Dust**.` });
    } catch (error) {
      console.error('[Guild Rename]', interaction.user.id, error);
      return interaction.editReply({ content: '❌ Не удалось изменить имя. Dust не списан. Ошибка записана в лог.' });
    }
  }
  if(parts[0]==='guild'&&parts[1]==='market'){
    const kind=parts[2];
    if(kind==='eqsell'){const price=Number(interaction.fields.getTextInputValue('price'));const r=createListing(interaction.user.id,Number(parts[3]),price);return interaction.reply({content:r.ok?`✅ **${r.listing.item_name}** выставлен за **${r.listing.price} GS Dust**.`:'❌ Не удалось выставить предмет. Проверь цену и наличие предмета.',flags:MessageFlags.Ephemeral});}
    if(kind==='fulfill'){const qty=Number(interaction.fields.getTextInputValue('quantity'));const r=fulfillOrder(Number(parts[4]),interaction.user.id,qty);return interaction.reply({content:r.ok?`✅ Продано **${r.quantity}** ед. Получено **${r.pay} GS Dust**.`:r.reason==='materials'?`❌ Недостаточно материала. Доступно: ${r.available||0}.`:'❌ Не удалось выполнить заказ.',flags:MessageFlags.Ephemeral});}
    if(kind==='createorder'){const qty=Number(interaction.fields.getTextInputValue('quantity')),price=Number(interaction.fields.getTextInputValue('price'));const r=createOrder(interaction.user.id,parts[3],qty,price);return interaction.reply({content:r.ok?`✅ Заказ №${r.order.id} создан: **${itemName(parts[3])} ×${qty}** по **${price} Dust**.`:r.reason==='dust'?`❌ Недостаточно Dust. Нужно ${r.total}.`:'❌ Не удалось создать заказ.',flags:MessageFlags.Ephemeral});}
    if(kind==='exchangesearch'){
      const d=marketDrafts.get(interaction.user.id);
      if(!d)return interaction.reply({content:'❌ Черновик обмена устарел.',flags:MessageFlags.Ephemeral});
      const query=interaction.fields.getTextInputValue('query').trim().toLocaleLowerCase('ru-RU');
      const matches=allEquipmentCatalog(25,query).map(x=>[x.key,x]);
      if(!matches.length)return interaction.reply({content:`❌ По запросу **${query}** экипировка не найдена. Попробуй часть названия.`,flags:MessageFlags.Ephemeral});
      const menu=new StringSelectMenuBuilder().setCustomId('guild:orders:exchange:wanted:equipment').setPlaceholder('Выбери найденный предмет').addOptions(matches.map(([key,x])=>({label:(x.name||key).slice(0,100),value:key,emoji:'⚔️',description:(x.rarity||'equipment').slice(0,100)})));
      return interaction.reply({content:`🔎 Найдено предметов: **${matches.length}**. Выбери нужный:`,components:[new ActionRowBuilder().addComponents(menu)],flags:MessageFlags.Ephemeral});
    }
    if(kind==='companionsell'){const id=Number(parts[3]);const price=Math.max(1,Number(interaction.fields.getTextInputValue('price'))||0);const r=createCompanionListing(interaction.user.id,id,price);return interaction.reply({content:r.ok?`✅ **${r.data.name}** выставлен на рынок за **${r.price} GS Dust**.`:'❌ Не удалось выставить. Активного питомца или маунта сначала нужно снять.',flags:MessageFlags.Ephemeral});}
    if(kind==='exchangeqty'){const d=marketDrafts.get(interaction.user.id);if(!d)return interaction.reply({content:'❌ Черновик обмена устарел.',flags:MessageFlags.Ephemeral});let oq=Math.max(1,Number(interaction.fields.getTextInputValue('offer_qty'))||1),wq=Math.max(1,Number(interaction.fields.getTextInputValue('want_qty'))||1);if(['equipment','companion'].includes(d.offerType))oq=1;if(['equipment','companion'].includes(d.wantType))wq=1;let offerKey,offerName,upgrade=0,offerData=null;try{db.transaction(()=>{if(d.offerType==='material'){offerKey=d.offerValue;offerName=itemName(offerKey);if(!consumeResources(interaction.user.id,{[offerKey]:oq}).ok)throw new Error('materials');}else if(d.offerType==='dust'){offerKey='gs_dust';offerName='GS Dust';const payment=removeCardDust(interaction.user.id,oq);if(!payment?.ok)throw new Error('dust');}else if(d.offerType==='companion'){const removed=takeCompanionForTransfer(interaction.user.id,Number(d.offerValue));if(!removed)throw new Error('companion');offerKey=removed.key;offerName=removed.name;offerData=JSON.stringify(removed);}else{const removed=removeEquipmentForTrade(interaction.user.id,Number(d.offerValue));if(!removed)throw new Error('equipment');offerKey=removed.key;offerName=removed.name;upgrade=removed.upgrade;}db.prepare(`INSERT INTO market_exchange_lots(creator_id,offer_type,offer_key,offer_name,offer_qty,offer_upgrade,want_type,want_key,want_name,want_qty,offer_data) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(interaction.user.id,d.offerType,offerKey,offerName,oq,upgrade,d.wantType,d.wantKey,itemName(d.wantKey),wq,offerData);})();}catch(e){return interaction.reply({content:'❌ Не удалось зарезервировать предметы. Проверь количество и наличие предмета.',flags:MessageFlags.Ephemeral});}marketDrafts.delete(interaction.user.id);return interaction.reply({content:`✅ Предложение обмена создано: **${offerName} ×${oq} ⇄ ${itemName(d.wantKey)} ×${wq}**.`,flags:MessageFlags.Ephemeral});}
  }
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
