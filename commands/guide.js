const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');

const COLOR = 0x8B5CF6;

const SECTIONS = {
    home: {
        emoji: '📖',
        label: 'Главная',
        title: '📖 Руководство Game Syndicate',
        description:
`Добро пожаловать в RPG-систему Game Syndicate.

**Быстрый старт**
1. Создай героя — \`/hero create\`.
2. Открой экспедиции — \`/expedition\`.
3. Выбери регион, класс, длительность и тактику.
4. После возвращения проверь награды, экипировку и материалы.

Выбери раздел ниже, чтобы узнать подробности.`,
    },
    hero: {
        emoji: '👤', label: 'Герой', title: '👤 Герой',
        description:
`**Создание:** \`/hero create\`
**Карточка:** \`/hero view\`
**Характеристики:** \`/hero stats\`
**История:** \`/hero history\`

У героя есть уровень, характеристики, происхождение, инвентарь и экипировка. Одновременно у игрока может быть только один герой.

Удалить героя и начать заново можно через \`/hero delete\`. Удаление проходит через два подтверждения и стирает RPG-прогресс, но не карточки, Dust и достижения сообщества.`,
    },
    classes: {
        emoji: '⚔️', label: 'Классы', title: '⚔️ Классы и мастерство',
        description:
`Перед экспедицией выбирается один из 12 классов. Каждый класс развивается **отдельно** и получает опыт только тогда, когда выбран для похода.

**Посмотреть прогресс:** \`/hero classes\`

Высокое мастерство усиливает класс в экспедициях и в сражении с Мировым Боссом. Для каждого класса можно сохранить отдельный комплект экипировки.`,
    },
    expeditions: {
        emoji: '🧭', label: 'Экспедиции', title: '🧭 Экспедиции',
        description:
`Экспедиции — основной способ развития героя.

**Как отправиться:** \`/expedition\`

Перед походом выбираются:
• регион;
• класс;
• длительность;
• тактика и автоматическое поведение.

Герой действует самостоятельно. Он может сражаться, находить сундуки и ресурсы, попадать в происшествия или встретить регионального мини-босса. После завершения появляется подробный журнал похода.`,
    },
    equipment: {
        emoji: '🎒', label: 'Экипировка', title: '🎒 Инвентарь и экипировка',
        description:
`**Инвентарь:** \`/hero inventory\`
**Предмет:** \`/hero item\`
**Надеть:** \`/hero equip\`
**Снять:** \`/hero unequip\`
**Комплекты:** \`/hero equipment\`

Экипировка усиливает характеристики героя, успех экспедиций, редкую добычу и бой с Мировым Боссом. Можно использовать общую экипировку или отдельный комплект для выбранного класса.`,
    },
    materials: {
        emoji: '📦', label: 'Материалы и сундуки', title: '📦 Материалы и сундуки',
        description:
`Материалы добываются в экспедициях, сундуках, событиях и боях с мини-боссами.

**Материалы:** \`/materials\`
**Сундуки:** \`/chest\`

Не все материалы нужно тратить сразу: редкие компоненты могут понадобиться для алхимии, крафта и улучшения сильной экипировки.`,
    },
    alchemy: {
        emoji: '🧪', label: 'Алхимия', title: '🧪 Алхимия и зелья',
        description:
`**Алхимик:** \`/alchemist\`
**Зелья:** \`/potions\`
**Использовать предмет:** \`/use\`

Алхимия превращает собранные компоненты в зелья и полезные расходники. Перед созданием проверь рецепт, количество материалов и эффект предмета.`,
    },
    crafting: {
        emoji: '🔨', label: 'Крафт и улучшение', title: '🔨 Крафт и улучшение',
        description:
`**Крафт:** \`/craft\`
**Улучшение:** \`/upgrade\`

Крафт создаёт новые предметы из материалов. Улучшение повышает силу уже найденной экипировки. Чем ценнее предмет и выше уровень улучшения, тем дороже следующая попытка.`,
    },
    minibosses: {
        emoji: '👹', label: 'Мини-боссы', title: '👹 Региональные мини-боссы',
        description:
`Мини-босс может редко встретиться во время экспедиции. Бой рассчитывается автоматически с учётом класса, мастерства и экипировки.

**Справка и статистика:** \`/miniboss overview\`
**Рейтинг:** \`/miniboss leaderboard\`

Победа приносит опыт, Dust и уникальные материалы. Поражение не уничтожает героя, но может уменьшить итоговую награду похода.`,
    },
    world: {
        emoji: '🌍', label: 'Живой мир', title: '🌍 Живой мир',
        description:
`**Состояние мира:** \`/world\`

Регионы меняются под влиянием событий, контрактов и побед над мини-боссами. Активные эффекты могут повышать опасность, опыт, Dust, материалы или шанс редкой добычи.

Проверяй состояние региона перед отправкой героя.`,
    },
    guild: {
        emoji: '🏛️', label: 'Гильдия героев', title: '🏛️ Гильдия героев',
        description:
`**Открыть гильдию:** \`/guild\`

Гильдия объединяет основные RPG-разделы и помогает быстро перейти к герою, экспедициям и связанным системам. Это удобная стартовая точка для ежедневной игры.`,
    },
    worldboss: {
        emoji: '👑', label: 'Мировой Босс', title: '👑 Мировой Босс',
        description:
`Мировой Босс — совместное PvE-сражение участников сервера. Перед боем игрок выбирает один из прокачанных классов.

В бою важны роли команды: танки защищают союзников, лекари поддерживают группу, а бойцы наносят урон. Сила выбранного класса зависит от его мастерства и классовой экипировки.

Следи за сообщением регистрации в канале события.`,
    },
    economy: {
        emoji: '💎', label: 'Dust и магазин', title: '💎 Dust, магазин и карточки',
        description:
`Dust — общая валюта аккаунта Game Syndicate.

**Баланс:** \`/dust\`
**Магазин героя:** \`/shop\`
**Магазин карточек:** \`/cardshop\`
**Наборы карточек:** \`/packs\`

Карточная коллекция и Dust не относятся к жизни конкретного героя и сохраняются после его удаления.`,
    },
    faq: {
        emoji: '❓', label: 'Частые вопросы', title: '❓ Частые вопросы',
        description:
`**Почему класс не получает опыт?**
Опыт получает только класс, выбранный перед экспедицией.

**Почему поход закончился хуже ожидаемого?**
Тактика меняет вероятность событий, но не гарантирует безопасность.

**Где взять экипировку и материалы?**
В экспедициях, сундуках, событиях, магазине и после мини-боссов.

**Можно ли начать заново?**
Да: \`/hero delete\`, затем \`/hero create\`.

**Что не удаляется вместе с героем?**
Карточки, Dust, достижения сообщества и основной профиль.`,
    },
};

const ORDER = Object.keys(SECTIONS);

function makeEmbed(sectionKey) {
    const section = SECTIONS[sectionKey] || SECTIONS.home;
    return new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(section.title)
        .setDescription(section.description)
        .setFooter({ text: `Game Syndicate • Раздел ${ORDER.indexOf(sectionKey) + 1 || 1} из ${ORDER.length}` });
}

function makeComponents(ownerId, sectionKey = 'home') {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`guide:section:${ownerId}`)
        .setPlaceholder('Выберите раздел руководства')
        .addOptions(ORDER.filter(key => key !== 'home').map(key => ({
            label: SECTIONS[key].label,
            value: key,
            emoji: SECTIONS[key].emoji,
            default: key === sectionKey,
        })));

    const index = Math.max(0, ORDER.indexOf(sectionKey));
    const previous = ORDER[(index - 1 + ORDER.length) % ORDER.length];
    const next = ORDER[(index + 1) % ORDER.length];

    const navigation = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`guide:page:${previous}:${ownerId}`).setLabel('Назад').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`guide:page:home:${ownerId}`).setLabel('Главная').setEmoji('🏠').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`guide:page:${next}:${ownerId}`).setLabel('Далее').setEmoji('▶️').setStyle(ButtonStyle.Secondary),
    );

    return [new ActionRowBuilder().addComponents(menu), navigation];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guide')
        .setDescription('Полное интерактивное руководство по Game Syndicate RPG')
        .addStringOption(option => option
            .setName('section')
            .setDescription('Сразу открыть нужный раздел')
            .addChoices(...ORDER.map(key => ({ name: `${SECTIONS[key].emoji} ${SECTIONS[key].label}`, value: key })))),

    async execute(interaction) {
        const sectionKey = interaction.options.getString('section') || 'home';
        await interaction.reply({
            embeds: [makeEmbed(sectionKey)],
            components: makeComponents(interaction.user.id, sectionKey),
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleComponent(interaction) {
        if ((!interaction.isButton() && !interaction.isStringSelectMenu()) || !interaction.customId.startsWith('guide:')) return false;

        const parts = interaction.customId.split(':');
        const ownerId = parts.at(-1);
        if (interaction.user.id !== ownerId) {
            await interaction.reply({ content: '❌ Это руководство открыто другим участником.', flags: MessageFlags.Ephemeral });
            return true;
        }

        let sectionKey = 'home';
        if (interaction.isStringSelectMenu()) sectionKey = interaction.values[0];
        if (interaction.isButton()) sectionKey = parts[2];
        if (!SECTIONS[sectionKey]) sectionKey = 'home';

        await interaction.update({
            embeds: [makeEmbed(sectionKey)],
            components: makeComponents(ownerId, sectionKey),
        });
        return true;
    },

    makeWelcomeComponents(ownerId) {
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`guide:page:home:${ownerId}`).setLabel('Открыть руководство').setEmoji('📖').setStyle(ButtonStyle.Primary),
        )];
    },
};
