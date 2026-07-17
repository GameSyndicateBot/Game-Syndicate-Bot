const { db, getSetting, setSetting } = require('./telegram/ecosystemDb');

const ROUND_MS = 60 * 60 * 1000;
const WINNER_PRIORITY_MS = 5 * 1000;
const RECENT_WORD_LIMIT = 500;
const timers = new Map();
let apiRef = null;

// Только одиночные слова: без словосочетаний и генерации комбинаций.
const WORD_GROUPS = [
    [
        'аквариум','акула','альбом','апельсин','аптека','арбуз','артист','аэропорт','бабочка','багажник','балкон','банан','банкомат','барабан','бассейн','батарейка','библиотека','билет','бинокль','блендер','блокнот','бобёр','будильник','бутерброд','велосипед','вертолёт','весы','ветер','вилка','водопад','вокзал','волк','воробей','врач','галстук','гамак','гараж','гитара','глобус','голубь','гриб','грузовик','дельфин','диван','динозавр','дирижёр','дождевик','дракон','ежевика','жираф','завтрак','замок','зеркало','зонт','игрушка','кактус','календарь','камера','карандаш','карта','кастрюля','каток','кенгуру','клавиатура','ключ','книга','ковёр','корабль','компас','компьютер','конфета','корзина','корона','кошка','кресло','крокодил','кукуруза','лампа','лестница','лифт','лимон','лиса','лодка','ложка','луна','магазин','магнит','машина','маяк','медведь','метро','микрофон','молоток','мороженое','мост','муравей','наушники','облако','огурец','одеяло','окно','орёл','остров','панда','парашют','парк','паровоз','паутина','пельмень','пингвин','пицца','планета','плеер','подушка','пожарный','помидор','портфель','почтальон','пылесос','радуга','ракета','рюкзак','самолёт','самокат','свеча','светофор','сковорода','слон','снеговик','собака','сокровище','стадион','стул','телевизор','телефон','термос','тигр','торт','трактор','трамвай','троллейбус','труба','туфля','утюг','фонарь','фотоаппарат','холодильник','чайник','чемодан','черепаха','шахматы','шляпа','шоколад','щётка','экскаватор','яблоко','якорь'
    ],
    [
        'абрикос','автобус','автограф','адвокат','айсберг','академия','акробат','алмаз','ананас','ангел','антенна','арена','арфа','архив','архитектор','астероид','атлас','аттракцион','багаж','барьер','башня','бегемот','белка','берег','библиотекарь','блин','богатырь','болото','борода','браслет','бриллиант','броня','будка','букет','бульдозер','бумага','бургер','вагон','валенок','ванна','варенье','вафля','ведро','веник','верблюд','верёвка','весло','виноград','витрина','водолаз','водоросль','ворота','вулкан','выдра','галактика','газета','гвоздь','генерал','географ','герой','гимнаст','гнездо','гном','горилла','горка','горчица','градусник','граната','гребень','гроза','груша','гусеница','гусь','дворец','дворник','дедушка','дельтаплан','джунгли','диктор','директор','диск','дневник','доктор','доска','дятел','енот','желе','железо','жемчуг','журнал','забор','завод','заяц','звезда','зебра','земляника','игла','изумруд','инженер','инструмент','каблук','кактус','капуста','караван','карета','карман','картофель','каска','катер','кафе','качели','каштан','кинотеатр','кирпич','кит','клоун','клубника','кнопка','ковбой','колесо','колодец','кольцо','комар','комета','конверт','конструктор','континент','конфетти','копилка','коридор','космонавт','костёр','котёнок','кофеварка','кран','креветка','кровать','кружка','кубик','кукла','купол','куртка','лавина','ладонь','лебедь','лейка','лепесток','лесник','лимонад','линейка','лопата','лошадь','лыжи','малина','мандарин','матрас','медуза','мельница','метеорит','миксер','морковь','музей','мяч','нефть','носорог','обсерватория','овца','одуванчик','олень','омлет','оркестр','осёл','осьминог','пакет','палатка','пальма','пантера','пароход','пастух','паук','печенье','пианино','пирамида','пирог','планшет','плотник','поезд','полицейский','попугай','принтер','причал','пчела','пятка','радио','раковина','расчёска','робот','ромашка','руль','рыцарь','салат','сапог','сарай','сахар','светлячок','синица','скала','скрипка','скульптор','слива','сметана','сова','сосиска','спутник','стакан','статуя','страус','стрекоза','струна','сумка','сыр','такси','тарелка','теплица','тетрадь','топор','трамплин','тюлень','удочка','улитка','флейта','флюгер','фокусник','футболист','хомяк','художник','цапля','цепочка','цирк','цистерна','часы','черника','шахтёр','шкаф','шлем','шмель','шорты','шпион','шприц','штурвал','эскалатор','эскимо','этаж','юла','ягуар'
    ],
    [
        'аватар','алхимик','амулет','арбалет','аркада','артефакт','ассасин','битва','босс','бронежилет','вампир','ведьма','воин','выживание','геймер','гильдия','голем','джойстик','зелье','зомби','инвентарь','квест','киборг','клан','консоль','крипер','лабиринт','маг','мана','монстр','некромант','ниндзя','пиксель','портал','призрак','рейд','рыцарь','сервер','скелет','скин','снайпер','стратегия','стример','танк','телепорт','турнир','уровень','ферма','хилер','читер','шутер','эльф','эндермен','эфир'
    ],
    [
        'актёр','аниме','балерина','барабанщик','басист','блогер','видеокамера','гример','декорация','диджей','дублёр','журналист','иллюзионист','каскадёр','комедия','концерт','критик','мелодия','мультфильм','опера','оператор','певец','плейлист','подкаст','продюсер','режиссёр','репетиция','саксофон','сериал','сцена','танцор','театр','трейлер','фильм','фотограф','хор','циркач','экран'
    ],
    [
        'австралия','австрия','албания','алжир','аргентина','армения','африка','беларусь','бельгия','болгария','бразилия','венгрия','вьетнам','германия','греция','грузия','дания','египет','европа','израиль','индия','индонезия','ирландия','исландия','испания','италия','казахстан','канада','кипр','китай','корея','латвия','литва','мексика','молдова','монголия','непал','нидерланды','норвегия','польша','португалия','румыния','сербия','словакия','словения','таиланд','тунис','турция','украина','финляндия','франция','хорватия','черногория','чили','швейцария','швеция','эстония','япония','амазонка','антарктида','атлантика','байкал','берлин','варшава','венеция','вена','днепр','дубай','карпаты','киев','лондон','мадрид','мальдивы','москва','ниагара','одесса','париж','прага','рим','сахара','сидней','токио','чернобыль'
    ],
    [
        'адмирал','акушер','археолог','астроном','бармен','биолог','бухгалтер','ветеринар','визажист','водитель','воспитатель','геолог','дизайнер','диспетчер','кондитер','курьер','лаборант','лётчик','маляр','маркетолог','массажист','механик','моряк','нотариус','официант','парикмахер','переводчик','повар','программист','продавец','психолог','редактор','спасатель','стоматолог','строитель','судья','тренер','учитель','фармацевт','фермер','хирург','эколог','электрик','юрист'
    ],
    [
        'адреналин','азарт','вдохновение','волнение','восторг','гнев','гордость','грусть','доверие','дружба','жадность','зависть','злость','интерес','испуг','любовь','мечта','надежда','обида','одиночество','паника','радость','ревность','скука','смелость','сомнение','спокойствие','страх','стыд','счастье','тревога','удивление','усталость','ярость'
    ],
    [
        'алгоритм','антивирус','браузер','вайфай','вебкамера','видеокарта','вирус','дискорд','домен','интернет','капча','комментарий','контент','лайк','логин','мем','мессенджер','модератор','ноутбук','пароль','подписчик','приложение','профиль','репост','роутер','сайт','смайлик','сообщение','спам','стикер','телеграм','флешка','форум','хэштег','чат','эмодзи'
    ],
    [
        'айкидо','баскетбол','бокс','борьба','боулинг','волейбол','гантель','гольф','гонка','дайвинг','каратэ','лыжник','марафон','медаль','плавание','ракетка','ролики','самбо','серфинг','скейтборд','спортзал','теннис','фехтование','финиш','футбол','хоккей','штанга'
    ],
    [
        'багет','борщ','брокколи','вафля','винегрет','голубцы','горох','гречка','йогурт','какао','карамель','карри','кефир','колбаса','котлета','круассан','лапша','майонез','макароны','мармелад','мёд','мюсли','наггетс','пельмени','персик','пирожок','попкорн','рис','салями','салат','смузи','спагетти','стейк','суп','суши','творог','тост','хлеб','хинкали','хурма','чеснок','шаурма','яичница'
    ],
    [
        'авария','аплодисменты','аукцион','бал','банкет','бунт','встреча','выборы','дуэль','экзамен','катастрофа','карнавал','конкурс','конференция','маскарад','митинг','пикник','пожар','праздник','презентация','пробка','свадьба','соревнование','спектакль','фестиваль','ярмарка'
    ]
];

const WORDS = [...new Set(WORD_GROUPS.flat())]
    .map(word => String(word).trim().toLowerCase())
    .filter(word => /^[а-яёa-z0-9-]+$/i.test(word));

db.exec(`
CREATE TABLE IF NOT EXISTS crocodile_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    thread_id INTEGER,
    message_id INTEGER,
    host_id TEXT NOT NULL,
    host_name TEXT NOT NULL,
    word TEXT NOT NULL,
    previous_word TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    winner_id TEXT,
    winner_name TEXT,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    claim_open_at INTEGER,
    result_message_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_croc_round_active ON crocodile_rounds(chat_id, thread_id, status);
CREATE TABLE IF NOT EXISTS crocodile_stats (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    username TEXT,
    guessed INTEGER NOT NULL DEFAULT 0,
    explained INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crocodile_ratings (
    round_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 3),
    created_at INTEGER NOT NULL,
    PRIMARY KEY(round_id, user_id)
);
CREATE TABLE IF NOT EXISTS crocodile_achievements (
    user_id TEXT NOT NULL,
    achievement_key TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY(user_id, achievement_key)
);
CREATE TABLE IF NOT EXISTS crocodile_word_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    thread_id INTEGER,
    word TEXT NOT NULL,
    used_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_croc_word_history ON crocodile_word_history(chat_id, thread_id, id DESC);
`);

function ensureColumn(table, column, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(item => item.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}
ensureColumn('crocodile_stats', 'three_heart_ratings', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('crocodile_stats', 'successful_explains', 'INTEGER NOT NULL DEFAULT 0');

function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}
function nameOf(user) {
    return [user?.first_name, user?.last_name].filter(Boolean).join(' ')
        || user?.username
        || `ID ${user?.id}`;
}
function normalize(value) {
    return String(value || '')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^a-zа-я0-9-]+/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}
function sameTopic(message) {
    return String(message.chat.id) === String(getSetting('telegram_crocodile_chat_id'))
        && String(message.message_thread_id || '') === String(getSetting('telegram_crocodile_thread_id') || '');
}
function activeRound(chatId, threadId) {
    return db.prepare(`
        SELECT * FROM crocodile_rounds
        WHERE chat_id=? AND COALESCE(thread_id,0)=? AND status='active'
        ORDER BY id DESC LIMIT 1
    `).get(String(chatId), Number(threadId || 0));
}
function ensureStats(user) {
    if (!user?.id) return;
    db.prepare(`
        INSERT INTO crocodile_stats(user_id,display_name,username,updated_at)
        VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET
            display_name=excluded.display_name,
            username=excluded.username,
            updated_at=excluded.updated_at
    `).run(String(user.id), nameOf(user), user.username || null, Date.now());
}
function ratingCounts(roundId) {
    const rows = db.prepare(`
        SELECT score, COUNT(*) AS count
        FROM crocodile_ratings
        WHERE round_id=?
        GROUP BY score
    `).all(roundId);
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (const row of rows) counts[row.score] = row.count;
    return counts;
}
function recentWords(chatId, threadId) {
    return db.prepare(`
        SELECT word FROM crocodile_word_history
        WHERE chat_id=? AND COALESCE(thread_id,0)=?
        ORDER BY id DESC LIMIT ?
    `).all(String(chatId), Number(threadId || 0), RECENT_WORD_LIMIT).map(row => row.word);
}
function chooseWord(chatId, threadId, exclude = []) {
    const blocked = new Set([...recentWords(chatId, threadId), ...exclude.filter(Boolean)]);
    let available = WORDS.filter(word => !blocked.has(word));
    if (!available.length) {
        db.prepare(`DELETE FROM crocodile_word_history WHERE chat_id=? AND COALESCE(thread_id,0)=?`)
            .run(String(chatId), Number(threadId || 0));
        available = WORDS.filter(word => !exclude.includes(word));
    }
    return available[Math.floor(Math.random() * available.length)] || WORDS[0];
}
function rememberWord(chatId, threadId, word) {
    db.prepare(`
        INSERT INTO crocodile_word_history(chat_id,thread_id,word,used_at)
        VALUES(?,?,?,?)
    `).run(String(chatId), threadId || null, word, Date.now());
    db.prepare(`
        DELETE FROM crocodile_word_history
        WHERE chat_id=? AND COALESCE(thread_id,0)=?
          AND id NOT IN (
              SELECT id FROM crocodile_word_history
              WHERE chat_id=? AND COALESCE(thread_id,0)=?
              ORDER BY id DESC LIMIT ?
          )
    `).run(String(chatId), Number(threadId || 0), String(chatId), Number(threadId || 0), RECENT_WORD_LIMIT);
}
function keyboard(round) {
    if (round.status === 'active') {
        return {
            inline_keyboard: [
                [{ text: '👁 Посмотреть слово', callback_data: `croc_show:${round.id}` }],
                [
                    { text: '↩ Предыдущее слово', callback_data: `croc_prev:${round.id}` },
                    { text: '🔄 Новое слово', callback_data: `croc_new:${round.id}` },
                ],
            ],
        };
    }

    const counts = ratingCounts(round.id);
    const rows = [];
    if (round.status === 'guessed') {
        rows.push([
            { text: `💜 ${counts[1]}`, callback_data: `croc_rate1:${round.id}` },
            { text: `💜💜 ${counts[2]}`, callback_data: `croc_rate2:${round.id}` },
            { text: `💜💜💜 ${counts[3]}`, callback_data: `croc_rate3:${round.id}` },
        ]);
    }
    rows.push([{ text: '✋ Хочу быть ведущим!', callback_data: `croc_claim:${round.id}` }]);
    return { inline_keyboard: rows };
}
function roundText(round) {
    return [
        '🐊 <b>КРОКОДИЛ • GAME SYNDICATE</b>',
        '━━━━━━━━━━━━━━━━━━',
        '',
        `🎭 <b>Ведущий:</b> ${esc(round.host_name)}`,
        '💬 Объясняет одно слово',
        '',
        '⏳ На объяснение даётся 1 час.',
        'Слово видит только ведущий.',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '💜 <i>GS Crocodile</i>',
    ].join('\n');
}
async function send(api, chatId, text, options = {}) {
    return api('sendMessage', { chat_id: chatId, text, ...options });
}
async function edit(api, chatId, messageId, text, options = {}) {
    return api('editMessageText', { chat_id: chatId, message_id: messageId, text, ...options });
}
async function answer(api, id, text, alert = false) {
    return api('answerCallbackQuery', {
        callback_query_id: id,
        text,
        show_alert: alert,
    }).catch(() => null);
}
function achievementDefs(stats) {
    return [
        ['first_round', '🐊 Первый раунд', stats.explained >= 1],
        ['first_guess', '🎯 Первый ответ', stats.guessed >= 1],
        ['guess_10', '🧠 10 угаданных слов', stats.guessed >= 10],
        ['guess_50', '🏆 50 угаданных слов', stats.guessed >= 50],
        ['guess_100', '👑 100 угаданных слов', stats.guessed >= 100],
        ['guess_500', '🌟 500 угаданных слов', stats.guessed >= 500],
        ['explain_10', '🎭 10 проведённых раундов', stats.explained >= 10],
        ['explain_50', '🎙 50 проведённых раундов', stats.explained >= 50],
        ['triple_10', '💜 10 оценок по три сердца', stats.three_heart_ratings >= 10],
        ['triple_50', '💜 50 оценок по три сердца', stats.three_heart_ratings >= 50],
        ['triple_100', '💜 100 оценок по три сердца', stats.three_heart_ratings >= 100],
        ['streak_5', '🔥 Серия ×5', stats.best_streak >= 5],
        ['streak_10', '⚡ Серия ×10', stats.best_streak >= 10],
        [
            'croc_legend',
            '👑 Легенда Крокодила',
            stats.guessed >= 100 && stats.three_heart_ratings >= 50 && stats.best_streak >= 10,
        ],
    ];
}
async function unlockAchievements(api, userId, chatId, threadId) {
    const stats = db.prepare('SELECT * FROM crocodile_stats WHERE user_id=?').get(String(userId));
    if (!stats) return;
    const fresh = [];
    for (const [key, title, unlocked] of achievementDefs(stats)) {
        if (!unlocked) continue;
        const result = db.prepare(`
            INSERT OR IGNORE INTO crocodile_achievements(user_id,achievement_key,unlocked_at)
            VALUES(?,?,?)
        `).run(String(userId), key, Date.now());
        if (result.changes) fresh.push(title);
    }
    if (!fresh.length) return;
    await send(api, chatId, [
        '✨ <b>ДОСТИЖЕНИЕ • GAME SYNDICATE</b>',
        '',
        `👤 ${esc(stats.display_name)}`,
        ...fresh.map(title => `🏅 ${title}`),
    ].join('\n'), {
        parse_mode: 'HTML',
        ...(threadId ? { message_thread_id: threadId } : {}),
    });
}
async function startRound(api, chatId, threadId, user) {
    if (!user?.id || activeRound(chatId, threadId)) return null;
    ensureStats(user);
    const now = Date.now();
    const word = chooseWord(chatId, threadId);
    rememberWord(chatId, threadId, word);
    const info = db.prepare(`
        INSERT INTO crocodile_rounds(
            chat_id,thread_id,host_id,host_name,word,started_at,ends_at
        ) VALUES(?,?,?,?,?,?,?)
    `).run(
        String(chatId),
        threadId || null,
        String(user.id),
        nameOf(user),
        word,
        now,
        now + ROUND_MS,
    );
    const round = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(info.lastInsertRowid);
    const message = await send(api, chatId, roundText(round), {
        parse_mode: 'HTML',
        reply_markup: keyboard(round),
        ...(threadId ? { message_thread_id: threadId } : {}),
    });
    db.prepare('UPDATE crocodile_rounds SET message_id=? WHERE id=?').run(message.message_id, round.id);
    scheduleTimeout(round.id);
    return round;
}
async function finishTimeout(roundId) {
    const round = db.prepare(`
        SELECT * FROM crocodile_rounds WHERE id=? AND status='active'
    `).get(roundId);
    if (!round || !apiRef) return;
    db.prepare(`UPDATE crocodile_rounds SET status='timeout',claim_open_at=? WHERE id=?`)
        .run(Date.now(), round.id);
    const finished = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.id);
    await edit(apiRef, round.chat_id, round.message_id, [
        '🐊 <b>КРОКОДИЛ • GAME SYNDICATE</b>',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '⌛ <b>Время вышло!</b>',
        `📝 Правильный ответ: <b>${esc(round.word)}</b>`,
        '',
        'Никто не угадал слово. Теперь любой участник может стать ведущим.',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '💜 <i>GS Crocodile</i>',
    ].join('\n'), {
        parse_mode: 'HTML',
        reply_markup: keyboard(finished),
    }).catch(() => null);
}
function scheduleTimeout(roundId) {
    const round = db.prepare(`
        SELECT * FROM crocodile_rounds WHERE id=? AND status='active'
    `).get(roundId);
    if (!round) return;
    clearTimeout(timers.get(roundId));
    const timer = setTimeout(
        () => finishTimeout(roundId),
        Math.max(1000, round.ends_at - Date.now()),
    );
    timers.set(roundId, timer);
}
async function checkAdminSafely(checkAdmin, chatId, userId) {
    if (typeof checkAdmin !== 'function' || !userId) return false;
    try {
        return Boolean(await checkAdmin(chatId, userId));
    } catch {
        return false;
    }
}
async function handleCommand(api, message, command, checkAdmin) {
    if (command === '/setcrocodile') {
        if (message.chat.type === 'private') {
            await send(api, message.chat.id, 'Эту команду нужно выполнить в теме Telegram-группы.');
            return true;
        }
        const sentAsChat = message.sender_chat
            && String(message.sender_chat.id) === String(message.chat.id);
        const userIsAdmin = sentAsChat
            || await checkAdminSafely(checkAdmin, message.chat.id, message.from?.id);
        if (!userIsAdmin) {
            await send(
                api,
                message.chat.id,
                '⛔ Настроить тему «Крокодил» может только администратор группы.',
                message.message_thread_id
                    ? { message_thread_id: message.message_thread_id }
                    : {},
            );
            return true;
        }
        setSetting('telegram_crocodile_chat_id', String(message.chat.id));
        setSetting(
            'telegram_crocodile_thread_id',
            message.message_thread_id ? String(message.message_thread_id) : '',
        );
        await send(api, message.chat.id, [
            '✅ <b>Тема «Крокодил» настроена.</b>',
            '',
            'Запуск игры: /crocodile',
        ].join('\n'), {
            parse_mode: 'HTML',
            ...(message.message_thread_id
                ? { message_thread_id: message.message_thread_id }
                : {}),
        });
        return true;
    }

    if (!sameTopic(message)) return false;

    if (command === '/crocodile' || command === '/croc' || command === '/startgame') {
        if (activeRound(message.chat.id, message.message_thread_id)) {
            await send(
                api,
                message.chat.id,
                '🐊 Раунд уже идёт.',
                message.message_thread_id
                    ? { message_thread_id: message.message_thread_id }
                    : {},
            );
            return true;
        }
        await startRound(api, message.chat.id, message.message_thread_id, message.from);
        return true;
    }
    if (command === '/croctop') {
        await showTop(api, message.chat.id, message.message_thread_id);
        return true;
    }
    if (command === '/crocstats') {
        await showStats(api, message);
        return true;
    }
    if (command === '/crocstop') {
        const sentAsChat = message.sender_chat
            && String(message.sender_chat.id) === String(message.chat.id);
        const userIsAdmin = sentAsChat
            || await checkAdminSafely(checkAdmin, message.chat.id, message.from?.id);
        if (!userIsAdmin) {
            await send(api, message.chat.id, '⛔ Остановить раунд может только администратор.', {
                ...(message.message_thread_id
                    ? { message_thread_id: message.message_thread_id }
                    : {}),
            });
            return true;
        }
        const round = activeRound(message.chat.id, message.message_thread_id);
        if (round) {
            db.prepare(`UPDATE crocodile_rounds SET status='stopped' WHERE id=?`).run(round.id);
            clearTimeout(timers.get(round.id));
            await edit(
                api,
                round.chat_id,
                round.message_id,
                '🐊 <b>Раунд остановлен администратором.</b>',
                { parse_mode: 'HTML' },
            ).catch(() => null);
        }
        return true;
    }
    return false;
}
async function showTop(api, chatId, threadId) {
    const guesses = db.prepare(`
        SELECT * FROM crocodile_stats
        ORDER BY guessed DESC, updated_at ASC LIMIT 15
    `).all();
    const explainers = db.prepare(`
        SELECT * FROM crocodile_stats
        ORDER BY three_heart_ratings DESC, explained DESC, updated_at ASC LIMIT 15
    `).all();
    const format = (rows, key, suffix = '') => {
        const nonZero = rows.filter(row => Number(row[key]) > 0);
        return nonZero.length
            ? nonZero.map((row, index) => (
                `${index + 1}. ${esc(row.display_name)} — <b>${row[key]}</b>${suffix}`
            )).join('\n')
            : 'Пока нет данных.';
    };
    await send(api, chatId, [
        '🏆 <b>КРОКОДИЛ • ТОП-15</b>',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '🧠 <b>Лучшие угадывающие</b>',
        format(guesses, 'guessed'),
        '',
        '🎭 <b>Лучшие ведущие</b>',
        format(explainers, 'three_heart_ratings', ' 💜💜💜'),
    ].join('\n'), {
        parse_mode: 'HTML',
        ...(threadId ? { message_thread_id: threadId } : {}),
    });
}
async function showStats(api, message) {
    ensureStats(message.from);
    const stats = db.prepare(`SELECT * FROM crocodile_stats WHERE user_id=?`)
        .get(String(message.from.id));
    await send(api, message.chat.id, [
        '🐊 <b>ПРОФИЛЬ КРОКОДИЛА</b>',
        '',
        `👤 ${esc(stats.display_name)}`,
        `🧠 Угадано: <b>${stats.guessed}</b>`,
        `🎭 Проведено раундов: <b>${stats.explained}</b>`,
        `💜 Получено оценок 💜💜💜: <b>${stats.three_heart_ratings}</b>`,
        `🔥 Текущая серия: <b>${stats.current_streak}</b>`,
        `⚡ Лучшая серия: <b>${stats.best_streak}</b>`,
    ].join('\n'), {
        parse_mode: 'HTML',
        ...(message.message_thread_id
            ? { message_thread_id: message.message_thread_id }
            : {}),
    });
}
async function handleMessage(api, message) {
    if (!sameTopic(message) || !message.text || message.text.startsWith('/')) return false;
    const round = activeRound(message.chat.id, message.message_thread_id);
    if (!round || String(message.from.id) === String(round.host_id)) return false;
    if (normalize(message.text) !== normalize(round.word)) return false;

    ensureStats(message.from);
    const now = Date.now();
    db.transaction(() => {
        db.prepare(`
            UPDATE crocodile_rounds
            SET status='guessed',winner_id=?,winner_name=?,claim_open_at=?
            WHERE id=? AND status='active'
        `).run(
            String(message.from.id),
            nameOf(message.from),
            now + WINNER_PRIORITY_MS,
            round.id,
        );
        db.prepare(`
            UPDATE crocodile_stats
            SET guessed=guessed+1,
                current_streak=current_streak+1,
                best_streak=MAX(best_streak,current_streak+1),
                updated_at=?
            WHERE user_id=?
        `).run(now, String(message.from.id));
        db.prepare(`
            UPDATE crocodile_stats
            SET explained=explained+1,updated_at=?
            WHERE user_id=?
        `).run(now, String(round.host_id));
        db.prepare(`
            UPDATE crocodile_stats
            SET current_streak=0,updated_at=?
            WHERE user_id<>? AND current_streak>0
        `).run(now, String(message.from.id));
    })();

    clearTimeout(timers.get(round.id));
    const finished = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.id);
    await edit(api, round.chat_id, round.message_id, [
        '🐊 <b>КРОКОДИЛ • GAME SYNDICATE</b>',
        '━━━━━━━━━━━━━━━━━━',
        '',
        `🎉 <b>${esc(finished.winner_name)}</b> отгадал(а) слово <b>${esc(finished.word)}</b>!`,
        '',
        `🎭 Ведущий: <b>${esc(finished.host_name)}</b>`,
        'Оцените объяснение:',
        '',
        '💜 — нормально',
        '💜💜 — хорошо',
        '💜💜💜 — отлично',
        '',
        'Только оценка 💜💜💜 учитывается в топе ведущих.',
        '',
        '⏱ Первые 5 секунд стать ведущим может только угадавший.',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '💜 <i>GS Crocodile</i>',
    ].join('\n'), {
        parse_mode: 'HTML',
        reply_markup: keyboard(finished),
    });
    await unlockAchievements(api, finished.winner_id, finished.chat_id, finished.thread_id);
    await unlockAchievements(api, finished.host_id, finished.chat_id, finished.thread_id);
    return true;
}
async function handleRating(api, callback, round, score) {
    const userId = String(callback.from.id);
    if (round.status !== 'guessed') {
        await answer(api, callback.id, 'Оценка уже недоступна.');
        return true;
    }
    if (userId === String(round.host_id)) {
        await answer(api, callback.id, 'Нельзя оценивать самого себя.', true);
        return true;
    }
    const old = db.prepare(`
        SELECT score FROM crocodile_ratings WHERE round_id=? AND user_id=?
    `).get(round.id, userId);
    if (old) {
        await answer(api, callback.id, 'Ты уже оценил(а) это объяснение.');
        return true;
    }

    db.transaction(() => {
        db.prepare(`
            INSERT INTO crocodile_ratings(round_id,user_id,score,created_at)
            VALUES(?,?,?,?)
        `).run(round.id, userId, score, Date.now());
        if (score === 3) {
            db.prepare(`
                UPDATE crocodile_stats
                SET three_heart_ratings=three_heart_ratings+1,
                    successful_explains=successful_explains+1,
                    updated_at=?
                WHERE user_id=?
            `).run(Date.now(), String(round.host_id));
        }
    })();

    const fresh = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(round.id);
    await edit(api, round.chat_id, round.message_id, callback.message.text, {
        reply_markup: keyboard(fresh),
        ...(callback.message.entities ? { entities: callback.message.entities } : {}),
    }).catch(() => null);
    await answer(api, callback.id, `${'💜'.repeat(score)} Оценка принята!`);
    if (score === 3) {
        await unlockAchievements(api, round.host_id, round.chat_id, round.thread_id);
    }
    return true;
}
async function handleCallback(api, callback) {
    const data = callback.data || '';
    if (!data.startsWith('croc_')) return false;
    const [action, idRaw] = data.split(':');
    const roundId = Number(idRaw);
    const round = db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(roundId);
    if (!round) {
        await answer(api, callback.id, 'Раунд не найден.');
        return true;
    }
    const userId = String(callback.from.id);

    if (action === 'croc_show') {
        if (userId !== String(round.host_id)) {
            await answer(api, callback.id, 'Слово видит только ведущий.', true);
        } else {
            await answer(api, callback.id, `Твоё слово: ${round.word}`, true);
        }
        return true;
    }

    if (action === 'croc_new' || action === 'croc_prev') {
        if (userId !== String(round.host_id) || round.status !== 'active') {
            await answer(api, callback.id, 'Только ведущий активного раунда.', true);
            return true;
        }
        const next = action === 'croc_prev' && round.previous_word
            ? round.previous_word
            : chooseWord(round.chat_id, round.thread_id, [round.word, round.previous_word]);
        rememberWord(round.chat_id, round.thread_id, next);
        db.prepare(`
            UPDATE crocodile_rounds SET previous_word=?,word=? WHERE id=?
        `).run(round.word, next, round.id);
        await answer(api, callback.id, `Новое слово: ${next}`, true);
        return true;
    }

    if (action === 'croc_rate1') return handleRating(api, callback, round, 1);
    if (action === 'croc_rate2') return handleRating(api, callback, round, 2);
    if (action === 'croc_rate3') return handleRating(api, callback, round, 3);

    // Поддержка старых сообщений с кнопкой лайка после обновления.
    if (action === 'croc_like') return handleRating(api, callback, round, 3);

    if (action === 'croc_claim') {
        if (!['guessed', 'timeout'].includes(round.status)) {
            await answer(api, callback.id, 'Ведущий уже выбран.');
            return true;
        }
        if (
            round.status === 'guessed'
            && Date.now() < Number(round.claim_open_at)
            && userId !== String(round.winner_id)
        ) {
            await answer(api, callback.id, 'Первые 5 секунд право у угадавшего.', true);
            return true;
        }
        const changed = db.prepare(`
            UPDATE crocodile_rounds SET status='claimed'
            WHERE id=? AND status IN ('guessed','timeout')
        `).run(round.id);
        if (!changed.changes) {
            await answer(api, callback.id, 'Кто-то уже стал ведущим.');
            return true;
        }
        await answer(api, callback.id, 'Ты новый ведущий!');
        await startRound(api, round.chat_id, round.thread_id, callback.from);
        return true;
    }
    return true;
}
function init(api) {
    apiRef = api;
    for (const round of db.prepare(`
        SELECT id FROM crocodile_rounds WHERE status='active'
    `).all()) {
        scheduleTimeout(round.id);
    }
}

module.exports = {
    init,
    handleCommand,
    handleMessage,
    handleCallback,
    showTop,
};
