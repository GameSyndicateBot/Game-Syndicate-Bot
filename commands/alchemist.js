const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');

const { getHero } = require('../systems/hero/heroService');
const { listRecipes, hydrateRecipe, craft } = require('../systems/hero/craftingService');
const { getConsumables, getActiveBuffs, useConsumable } = require('../systems/hero/alchemyService');
const { ALCHEMY_EFFECTS } = require('../systems/hero/alchemyData');
const { RARITY_LABELS } = require('../systems/hero/itemData');

const COLOR = 0x7C3AED;
const NPC = 'Алхимик Лира';

function cid(userId, action, value = '') {
  return `alchemist:${userId}:${action}${value ? `:${value}` : ''}`;
}

function navRow(userId, active = 'home') {
  const defs = [
    ['home', 'Лавка', '🧪'],
    ['recipes', 'Рецепты', '📖'],
    ['bag', 'Сумка', '🎒'],
    ['buffs', 'Эффекты', '✨'],
  ];
  return new ActionRowBuilder().addComponents(
    defs.map(([key, label, emoji]) => new ButtonBuilder()
      .setCustomId(cid(userId, key))
      .setLabel(label)
      .setEmoji(emoji)
      .setStyle(key === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(key === active)),
  );
}

function bonusText(bonuses = {}) {
  const labels = {
    heal: 'HP',
    expedition_success: 'успех экспедиции',
    rare_find: 'редкая добыча',
    world_boss_damage: 'урон по World Boss',
    world_boss_resistance: 'защита от World Boss',
    boss_flat_damage: 'особый урон',
  };
  return Object.entries(bonuses)
    .filter(([, value]) => Number(value))
    .map(([key, value]) => `+${value}${['expedition_success', 'rare_find', 'world_boss_damage', 'world_boss_resistance'].includes(key) ? '%' : ''} ${labels[key] || key}`)
    .join(' · ');
}

function materialText(recipe) {
  return recipe.materials
    .map(m => `${m.icon} ${m.name}: **${m.owned}/${m.required}**${m.owned >= m.required ? ' ✅' : ' ❌'}`)
    .join('\n');
}

function homeView(userId) {
  const hero = getHero(userId);
  const recipes = listRecipes(userId).filter(r => r.npc === NPC);
  const ready = recipes.filter(r => r.canCraft).length;
  const items = getConsumables(userId);
  const buffs = getActiveBuffs(userId);
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🧪 Алхимическая лавка Лиры')
    .setDescription([
      '*«Хороший эликсир спасает поход. Плохой — делает его интереснее.»*',
      '',
      'Лира превращает материалы из экспедиций в зелья, эликсиры, свитки и боевые реагенты.',
      '',
      `📖 **Рецепты:** ${recipes.length} · можно создать сейчас: **${ready}**`,
      `🎒 **Расходники в сумке:** **${itemCount}**`,
      `✨ **Активные эффекты:** **${buffs.length}**`,
      '',
      '**Выбери раздел кнопками ниже.** Создавать и применять предметы теперь можно прямо из лавки, без отдельных команд.',
    ].join('\n'))
    .setFooter({ text: `Герой: ${hero.name} · уровень ${hero.level}` });

  return { embeds: [embed], components: [navRow(userId, 'home')] };
}

function recipesView(userId) {
  const recipes = listRecipes(userId).filter(r => r.npc === NPC);
  const ready = recipes.filter(r => r.canCraft).length;
  const lines = recipes.map(r => {
    const state = r.canCraft ? '✅' : r.heroLevel < r.level ? '🔒' : '❌';
    return `${state} **${r.item.name}** · ур. ${r.level} · 💠 ${r.dust}\n${r.item.description}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('📖 Рецепты Лиры')
    .setDescription(lines.join('\n\n').slice(0, 4000) || 'Рецептов пока нет.')
    .setFooter({ text: `Доступно сейчас: ${ready}/${recipes.length} · выбери рецепт ниже` });

  const components = [navRow(userId, 'recipes')];
  if (recipes.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(cid(userId, 'recipe'))
        .setPlaceholder('Выбрать рецепт')
        .addOptions(recipes.slice(0, 25).map(r => ({
          label: r.item.name.slice(0, 100),
          description: `${r.canCraft ? 'Можно создать' : `Нужен ур. ${r.level} и ресурсы`} · ${r.dust} Dust`.slice(0, 100),
          value: r.key,
          emoji: r.canCraft ? '✅' : '🔒',
        }))),
    ));
  }
  return { embeds: [embed], components };
}

function recipeView(userId, key, notice = '') {
  const recipe = hydrateRecipe(key, userId);
  if (!recipe || recipe.npc !== NPC) return recipesView(userId);
  const effect = ALCHEMY_EFFECTS[recipe.itemKey];
  const missingLevel = recipe.heroLevel < recipe.level;

  const embed = new EmbedBuilder()
    .setColor(recipe.canCraft ? 0x22C55E : COLOR)
    .setTitle(`${effect?.icon || '🧪'} ${recipe.item.name}`)
    .setDescription([
      notice ? `${notice}\n` : '',
      recipe.item.description,
      recipe.item.lore ? `*${recipe.item.lore}*` : '',
      '',
      `⭐ **Редкость:** ${RARITY_LABELS[recipe.item.rarity] || recipe.item.rarity}`,
      `🧙 **Требуемый уровень:** ${recipe.level} ${missingLevel ? `(у тебя ${recipe.heroLevel}) ❌` : '✅'}`,
      `💠 **Стоимость:** ${recipe.dust} Dust · у тебя ${recipe.dustBalance} Dust ${recipe.dustBalance >= recipe.dust ? '✅' : '❌'}`,
      effect ? `⚗️ **Эффект:** ${effect.description}` : '',
      bonusText(effect?.bonuses || recipe.item.bonuses) ? `📊 **Бонус:** ${bonusText(effect?.bonuses || recipe.item.bonuses)}` : '',
      '',
      '**Материалы**',
      materialText(recipe),
    ].filter(Boolean).join('\n'))
    .setFooter({ text: recipe.canCraft ? 'Все ресурсы собраны — предмет можно создать.' : 'Недостающие ресурсы добываются в экспедициях и сундуках.' });

  const back = new ButtonBuilder().setCustomId(cid(userId, 'recipes')).setLabel('К рецептам').setEmoji('⬅️').setStyle(ButtonStyle.Secondary);
  const create = new ButtonBuilder().setCustomId(cid(userId, 'craft', key)).setLabel('Создать 1').setEmoji('⚒️').setStyle(ButtonStyle.Success).setDisabled(!recipe.canCraft);
  const row = new ActionRowBuilder().addComponents(back, create);
  return { embeds: [embed], components: [navRow(userId), row] };
}

function bagView(userId, notice = '') {
  const items = getConsumables(userId);
  const text = items.length
    ? items.map(i => `${i.effect.icon} **${i.name} ×${i.quantity}**\n${i.effect.description}`).join('\n\n')
    : 'Сумка пуста. Открой раздел рецептов и создай первый расходник.';

  const embed = new EmbedBuilder()
    .setColor(0xA855F7)
    .setTitle('🎒 Алхимическая сумка')
    .setDescription(`${notice ? `${notice}\n\n` : ''}${text}`.slice(0, 4000))
    .setFooter({ text: 'Выбери предмет ниже, чтобы применить его.' });

  const components = [navRow(userId, 'bag')];
  if (items.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(cid(userId, 'use'))
        .setPlaceholder('Применить расходник')
        .addOptions(items.slice(0, 25).map(i => ({
          label: `${i.name} ×${i.quantity}`.slice(0, 100),
          description: i.effect.description.slice(0, 100),
          value: i.item_key,
          emoji: i.effect.icon,
        }))),
    ));
  }
  return { embeds: [embed], components };
}

function buffsView(userId) {
  const buffs = getActiveBuffs(userId);
  const text = buffs.length
    ? buffs.map(buff => {
      const effect = ALCHEMY_EFFECTS[buff.buff_key] || ALCHEMY_EFFECTS[buff.source_item_key];
      const target = buff.context === 'world_boss' ? 'следующий World Boss' : 'следующая экспедиция';
      return `✨ **${effect?.icon || '🧪'} ${effect?.name || buff.source_item_key}**\nЦель: ${target} · зарядов: **${buff.charges}**\n${bonusText(buff.bonuses)}`;
    }).join('\n\n')
    : 'Активных эффектов нет. Примени эликсир или свиток из сумки.';

  const embed = new EmbedBuilder()
    .setColor(0xC084FC)
    .setTitle('✨ Активные алхимические эффекты')
    .setDescription(text.slice(0, 4000))
    .setFooter({ text: 'Эффект списывается только при фактическом старте соответствующей активности.' });
  return { embeds: [embed], components: [navRow(userId, 'buffs')] };
}

async function sendView(interaction, payload) {
  if (interaction.isMessageComponent()) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder().setName('alchemist').setDescription('Открыть меню алхимика Лиры'),

  async execute(interaction) {
    const hero = getHero(interaction.user.id);
    if (!hero) return interaction.reply({ content: '❌ Сначала создай героя: `/hero create`.', flags: MessageFlags.Ephemeral });
    return sendView(interaction, homeView(interaction.user.id));
  },

  async handleComponent(interaction) {
    const parts = interaction.customId.split(':');
    const ownerId = parts[1];
    const action = parts[2];
    const value = parts.slice(3).join(':');

    if (interaction.user.id !== ownerId) {
      return interaction.reply({ content: '❌ Это меню принадлежит другому участнику.', flags: MessageFlags.Ephemeral });
    }
    if (!getHero(ownerId)) {
      return interaction.update({ content: '❌ Герой не найден. Создай его через `/hero create`.', embeds: [], components: [] });
    }

    if (action === 'home') return sendView(interaction, homeView(ownerId));
    if (action === 'recipes') return sendView(interaction, recipesView(ownerId));
    if (action === 'bag') return sendView(interaction, bagView(ownerId));
    if (action === 'buffs') return sendView(interaction, buffsView(ownerId));

    if (action === 'recipe' && interaction.isStringSelectMenu()) {
      return sendView(interaction, recipeView(ownerId, interaction.values[0]));
    }

    if (action === 'craft') {
      const result = craft(ownerId, value, 1);
      if (!result.ok) {
        const notices = {
          level: '❌ Уровень героя недостаточен.',
          materials: '❌ Не хватает материалов.',
          dust: '❌ Не хватает Dust.',
          invalid_recipe: '❌ Рецепт не найден.',
          error: '❌ Во время создания произошла ошибка. Ресурсы возвращены.',
        };
        return sendView(interaction, recipeView(ownerId, value, notices[result.reason] || '❌ Предмет создать не удалось.'));
      }
      return sendView(interaction, recipeView(ownerId, value, `✅ Создан предмет: **${result.recipe.item.name} ×1**. Потрачено **${result.spent} Dust**.`));
    }

    if (action === 'use' && interaction.isStringSelectMenu()) {
      const itemKey = interaction.values[0];
      const result = useConsumable(ownerId, itemKey);
      if (!result.ok) {
        const notices = {
          none: '❌ Этого предмета больше нет в сумке.',
          full_hp: '❤️ У героя уже полное здоровье — зелье не потрачено.',
          already_active: '✨ Такой эффект уже активен. Сначала израсходуй его.',
          unsupported: '❌ Этот предмет пока нельзя применить.',
        };
        return sendView(interaction, bagView(ownerId, notices[result.reason] || '❌ Предмет применить не удалось.'));
      }
      const effect = result.effect;
      const notice = effect.kind === 'instant'
        ? `✅ **${effect.name}** использован. Восстановлено **${result.result.healed} HP** — сейчас ${result.result.hp}/${result.result.maxHp}.`
        : `✅ **${effect.name}** активирован на ${effect.context === 'world_boss' ? 'следующий World Boss' : 'следующую экспедицию'}.`;
      return sendView(interaction, bagView(ownerId, notice));
    }

    return interaction.reply({ content: '❌ Неизвестное действие меню.', flags: MessageFlags.Ephemeral });
  },
};
