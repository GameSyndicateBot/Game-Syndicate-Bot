const {
    SlashCommandBuilder,
    AttachmentBuilder,
} = require('discord.js');

const { db, getTodayDate } = require('../database/db');
const { createForecastCard } = require('../images/forecast/createForecastCard');

const rarities = [
    { id: 'common', name: 'Обычное', icon: '⚪', chance: 650 },
    { id: 'rare', name: 'Редкое', icon: '🔵', chance: 220 },
    { id: 'epic', name: 'Эпическое', icon: '🟣', chance: 100 },
    { id: 'legendary', name: 'Легендарное', icon: '🟠', chance: 25 },
    { id: 'mythic', name: 'Мифическое', icon: '🔴', chance: 5 },
];

const dayTypes = [
    '⚔ Боевой',
    '💬 Общительный',
    '🎮 Игровой',
    '📚 Продуктивный',
    '🌙 Спокойный',
    '🔥 Энергичный',
    '🎲 Авантюрный',
    '👑 Лидерский',
    '🌌 Таинственный',
    '💎 Удачный',
];

const colors = [
    'Фиолетовый',
    'Золотой',
    'Алый',
    'Бирюзовый',
    'Изумрудный',
    'Сапфировый',
    'Белый',
    'Чёрный',
    'Янтарный',
    'Лавандовый',
];

const bestTimes = [
    '08:00 — 10:00',
    '10:00 — 12:00',
    '12:00 — 14:00',
    '14:00 — 16:00',
    '16:00 — 18:00',
    '18:00 — 20:00',
    '20:00 — 22:00',
    '22:00 — 00:00',
];

const predictions = {
    common: [
        { icon: '💬', title: 'Слова имеют вес', text: 'Сегодня даже короткое сообщение может привести к хорошему разговору.' },
        { icon: '🎮', title: 'Игровой импульс', text: 'Хороший день, чтобы зайти в игру не одному. Командный вайб сегодня сильнее обычного.' },
        { icon: '🌙', title: 'Тихая сила', text: 'Сегодня не обязательно быть самым громким. Достаточно появиться в нужный момент.' },
        { icon: '⚡', title: 'Малый прогресс', text: 'Даже небольшая активность сегодня приблизит тебя к уровню, роли или достижению.' },
        { icon: '💜', title: 'Связь Синдиката', text: 'Простая реакция или сообщение может поднять настроение другому участнику.' },
        { icon: '🔥', title: 'Начни первым', text: 'Сегодня хороший день, чтобы проявить инициативу в чате или голосе.' },
        { icon: '🎲', title: 'Случайный плюс', text: 'Не всё пойдёт по плану, но одна случайность может оказаться удачной.' },
        { icon: '☕', title: 'День разгона', text: 'Сначала может быть медленно, но ближе к вечеру активность пойдёт лучше.' },
    ],
    rare: [
        { icon: '🔵', title: 'Сильный сигнал', text: 'Сегодня тебя могут заметить чаще обычного. Не пропускай момент проявиться.' },
        { icon: '🎮', title: 'Удачная партия', text: 'Вероятность хорошей игры сегодня выше обычного, особенно если собрать команду.' },
        { icon: '💬', title: 'Разговорный день', text: 'Сегодня хороший день для новых тем, шуток и неожиданных диалогов.' },
        { icon: '🏆', title: 'Цель рядом', text: 'Проверь ежедневки и достижения — сегодня есть шанс закрыть что-то приятное.' },
        { icon: '👥', title: 'Командный вайб', text: 'Лучшие моменты дня придут не в одиночку, а через людей рядом.' },
    ],
    epic: [
        { icon: '🟣', title: 'День рекорда', text: 'Сегодня один из твоих показателей может заметно вырасти. Серия, уровень или достижение — что-то рядом.' },
        { icon: '⭐', title: 'Рост агента', text: 'Твои действия сегодня могут дать больше прогресса, чем кажется на первый взгляд.' },
        { icon: '👑', title: 'Инициатива лидера', text: 'Если сегодня предложишь движ — есть хороший шанс, что за тобой пойдут.' },
        { icon: '🌌', title: 'Необычный знак', text: 'Сегодня случайные совпадения могут сложиться слишком удачно, чтобы быть просто случайностью.' },
    ],
    legendary: [
        { icon: '🟠', title: 'День чемпиона', text: 'Сегодня ты можешь стать центром события. Не бойся взять инициативу в свои руки.' },
        { icon: '🔥', title: 'Огонь Синдиката', text: 'Сегодня твоя активность способна зажечь других. Один твой шаг может собрать движ.' },
        { icon: '🏆', title: 'Трофейный день', text: 'Сегодня особенно хороший день для достижений, рекордов и красивых моментов.' },
    ],
    mythic: [
        { icon: '🔴', title: 'Выбор Синдиката', text: 'Сегодня судьба смотрит в твою сторону. Любое действие может стать началом редкого события.' },
        { icon: '🌌', title: 'Звёздный разлом', text: 'Такой день выпадает редко. Используй его — Синдикат может запомнить твой ход.' },
    ],
};

const blessings = [
    {
        id: 'none',
        title: 'Без благословения',
        text: 'Сегодня звёзды наблюдают без вмешательства.',
        minRarity: 'common',
    },
    {
        id: 'daily_hint',
        title: 'Импульс ежедневок',
        text: 'Сегодня ежедневные задания стоит проверить раньше обычного.',
        minRarity: 'common',
    },
    {
        id: 'chat_focus',
        title: 'Сила общения',
        text: 'Сегодня чат может принести тебе больше пользы, чем кажется.',
        minRarity: 'rare',
    },
    {
        id: 'voice_focus',
        title: 'Голосовой резонанс',
        text: 'Сегодня голосовые каналы особенно благоприятны.',
        minRarity: 'rare',
    },
    {
        id: 'achievement_focus',
        title: 'След трофея',
        text: 'Сегодня хороший день, чтобы закрыть достижение.',
        minRarity: 'epic',
    },
    {
        id: 'event_focus',
        title: 'Зов игрового вечера',
        text: 'Если сегодня будет игровой вечер — тебе стоит быть там.',
        minRarity: 'epic',
    },
    {
        id: 'syndicate_blessing',
        title: 'Благословение Синдиката',
        text: 'Редкий знак. Сегодня твоя активность особенно заметна для Синдиката.',
        minRarity: 'legendary',
    },
    {
        id: 'chosen_one',
        title: 'Избранник Синдиката',
        text: 'Мифический знак дня. Сегодня ты получил одно из самых редких предсказаний.',
        minRarity: 'mythic',
    },
];

const rarityOrder = {
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
};

function seededNumber(seed) {
    let value = 0;

    for (let i = 0; i < seed.length; i++) {
        value = (value * 31 + seed.charCodeAt(i)) >>> 0;
    }

    return value;
}

function createRandom(seed) {
    let value = seededNumber(seed);

    return function random() {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 4294967296;
    };
}

function pick(array, random) {
    return array[Math.floor(random() * array.length)];
}

function pickRarity(random) {
    const roll = Math.floor(random() * 1000) + 1;
    let current = 0;

    for (const rarity of rarities) {
        current += rarity.chance;
        if (roll <= current) return rarity;
    }

    return rarities[0];
}

function getAchievementChance(value) {
    if (value >= 85) return 'Очень высокий';
    if (value >= 70) return 'Высокий';
    if (value >= 45) return 'Средний';
    return 'Низкий';
}

function generateForecast(userId) {
    const date = getTodayDate();
    const random = createRandom(`${userId}_${date}_full_forecast`);

    const rarity = pickRarity(random);
    const prediction = pick(predictions[rarity.id], random);

    const availableBlessings = blessings.filter(blessing => {
        return rarityOrder[rarity.id] >= rarityOrder[blessing.minRarity];
    });

    const blessing = pick(availableBlessings, random);

    const luck = 20 + Math.floor(random() * 81);
    const energy = 20 + Math.floor(random() * 81);
    const social = 20 + Math.floor(random() * 81);
    const gaming = 20 + Math.floor(random() * 81);
    const focus = 20 + Math.floor(random() * 81);

    return {
        user_id: userId,
        date,
        rarity: rarity.id,
        rarity_name: `${rarity.icon} ${rarity.name}`,
        day_type: pick(dayTypes, random),
        prediction_title: prediction.title,
        prediction_text: prediction.text,
        prediction_icon: prediction.icon,
        luck,
        energy,
        social,
        gaming,
        focus,
        achievement_chance: getAchievementChance((luck + focus) / 2),
        blessing_id: blessing.id,
        blessing_title: blessing.title,
        blessing_text: blessing.text,
        lucky_number: 1 + Math.floor(random() * 99),
        color: pick(colors, random),
        best_time: pick(bestTimes, random),
    };
}

function getOrCreateForecast(userId) {
    const date = getTodayDate();

    const existing = db.prepare(`
        SELECT *
        FROM daily_forecasts
        WHERE user_id = ? AND date = ?
    `).get(userId, date);

    if (existing) return existing;

    const forecast = generateForecast(userId);

    db.prepare(`
        INSERT INTO daily_forecasts (
            user_id,
            date,
            rarity,
            day_type,
            prediction_title,
            prediction_text,
            prediction_icon,
            luck,
            energy,
            social,
            gaming,
            focus,
            achievement_chance,
            blessing_id,
            blessing_title,
            blessing_text,
            lucky_number,
            color,
            best_time
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        forecast.user_id,
        forecast.date,
        forecast.rarity,
        forecast.day_type,
        forecast.prediction_title,
        forecast.prediction_text,
        forecast.prediction_icon,
        forecast.luck,
        forecast.energy,
        forecast.social,
        forecast.gaming,
        forecast.focus,
        forecast.achievement_chance,
        forecast.blessing_id,
        forecast.blessing_title,
        forecast.blessing_text,
        forecast.lucky_number,
        forecast.color,
        forecast.best_time
    );

    return db.prepare(`
        SELECT *
        FROM daily_forecasts
        WHERE user_id = ? AND date = ?
    `).get(userId, date);
}


async function buildForecastReply(user) {
    const forecast = getOrCreateForecast(user.id);
    const card = await createForecastCard(user, forecast);

    return {
        files: [
            new AttachmentBuilder(card, {
                name: 'forecast.png',
            }),
        ],
    };
}

module.exports = {
    buildForecastReply,

data: new SlashCommandBuilder()
        .setName('forecast')
        .setDescription('Получить персональное предсказание на день'),

    async execute(interaction) {
        await interaction.deferReply();

        const forecast = getOrCreateForecast(interaction.user.id);
        const card = await createForecastCard(interaction.user, forecast);

        return interaction.editReply({
            files: [
                new AttachmentBuilder(card, {
                    name: 'forecast.png',
                }),
            ],
        });
    },
};