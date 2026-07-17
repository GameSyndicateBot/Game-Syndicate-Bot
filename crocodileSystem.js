const { db, getSetting, setSetting } = require('./ecosystemDb');

const ROUND_MS = 60 * 60 * 1000;
const WINNER_PRIORITY_MS = 5 * 1000;
const timers = new Map();
let apiRef = null;

// Curated core vocabulary plus safe combinatorial phrases. The generator yields
// tens of thousands of pronounceable, explainable game prompts without external APIs.
const NOUNS = [
'аквариум','акула','альбом','апельсин','аптека','арбуз','артист','аэропорт','бабочка','багажник','балкон','банан','банкомат','барабан','бассейн','батарейка','библиотека','билет','бинокль','блендер','блокнот','бобёр','будильник','бутерброд','велосипед','вертолёт','весы','ветер','вилка','водопад','вокзал','волк','воробей','врач','галстук','гамак','гараж','гитара','глобус','голубь','гриб','грузовик','дельфин','диван','динозавр','дирижёр','дождевик','дракон','ежевика','жираф','завтрак','замок','зеркало','зонт','игрушка','кактус','календарь','камера','карандаш','карта','кастрюля','каток','кенгуру','клавиатура','ключ','книга','ковёр','корабль','компас','компьютер','конфета','корзина','корона','кошка','кресло','крокодил','кукуруза','лампа','лестница','лифт','лимон','лиса','лодка','ложка','луна','магазин','магнит','машина','маяк','медведь','метро','микрофон','молоток','мороженое','мост','муравей','наушники','облако','огурец','одеяло','окно','орёл','остров','панда','парашют','парк','паровоз','паутина','пельмень','пингвин','пицца','планета','плеер','подушка','пожарный','помидор','портфель','почтальон','пылесос','радуга','ракета','рюкзак','самолёт','самокат','свеча','светофор','сковорода','слон','снеговик','собака','сокровище','стадион','стул','телевизор','телефон','термос','тигр','торт','трактор','трамвай','троллейбус','труба','туфля','утюг','фонарь','фотоаппарат','холодильник','чайник','чемодан','черепаха','шахматы','шляпа','шоколад','щётка','экскаватор','яблоко','якорь'
];
const ADJECTIVES = [
'бесшумный','быстрый','весёлый','волшебный','гигантский','голодный','горячий','грустный','деревянный','домашний','забытый','загадочный','золотой','колючий','космический','крошечный','ледяной','летающий','мокрый','музыкальный','невидимый','ночной','огромный','праздничный','прозрачный','пушистый','радужный','резиновый','роботизированный','секретный','смешной','сонный','стеклянный','танцующий','умный','фиолетовый','храбрый','шоколадный','электрический'
];
const ACTIONS = [
'варить суп','вести поезд','выгуливать собаку','выключать свет','готовить завтрак','делать селфи','завязывать шнурки','запускать ракету','искать клад','кататься на коньках','кормить голубей','красить стену','ловить рыбу','мыть посуду','надувать шарик','открывать подарок','печатать сообщение','перепрыгивать лужу','петь в душе','покупать билет','поливать цветы','ремонтировать велосипед','рисовать портрет','собирать чемодан','строить замок','танцевать вальс','убирать комнату','фотографировать закат','читать карту','чистить зубы'
];
const EXPRESSIONS = [
'белая ворона','бить баклуши','витать в облаках','время летит','вставать не с той ноги','держать язык за зубами','делать из мухи слона','душа компании','за семью печатями','зарубить на носу','золотые руки','играть первую скрипку','как две капли воды','крокодиловы слёзы','ломать голову','медвежья услуга','море по колено','на вес золота','найти общий язык','не в своей тарелке','ни пуха ни пера','палка о двух концах','попасть в яблочко','работать спустя рукава','рукой подать','сесть в лужу','смотреть сквозь пальцы','стреляный воробей','тянуть кота за хвост','яблоку негде упасть'
];

const WORDS = (() => {
    const set = new Set([...NOUNS, ...ACTIONS, ...EXPRESSIONS]);
    for (const adjective of ADJECTIVES) {
        for (const noun of NOUNS) set.add(`${adjective} ${noun}`);
    }
    for (const action of ACTIONS) {
        for (const noun of NOUNS.slice(0, 90)) set.add(`${action} с ${noun}`);
    }
    return [...set];
})();

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
CREATE TABLE IF NOT EXISTS crocodile_likes (
    round_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY(round_id, user_id)
);
CREATE TABLE IF NOT EXISTS crocodile_achievements (
    user_id TEXT NOT NULL,
    achievement_key TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY(user_id, achievement_key)
);
`);

function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function nameOf(u) { return [u?.first_name,u?.last_name].filter(Boolean).join(' ') || u?.username || `ID ${u?.id}`; }
function normalize(v) { return String(v || '').toLowerCase().replaceAll('ё','е').replace(/[^a-zа-я0-9]+/gi,' ').trim().replace(/\s+/g,' '); }
function sameTopic(message) {
    return String(message.chat.id) === String(getSetting('telegram_crocodile_chat_id'))
        && String(message.message_thread_id || '') === String(getSetting('telegram_crocodile_thread_id') || '');
}
function activeRound(chatId, threadId) {
    return db.prepare(`SELECT * FROM crocodile_rounds WHERE chat_id=? AND COALESCE(thread_id,0)=? AND status='active' ORDER BY id DESC LIMIT 1`).get(String(chatId), Number(threadId || 0));
}
function ensureStats(user) {
    db.prepare(`INSERT INTO crocodile_stats(user_id,display_name,username,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=excluded.updated_at`)
      .run(String(user.id), nameOf(user), user.username || null, Date.now());
}
function chooseWord(exclude = []) {
    const blocked = new Set(exclude.filter(Boolean));
    for (let i=0;i<30;i++) { const w=WORDS[Math.floor(Math.random()*WORDS.length)]; if(!blocked.has(w)) return w; }
    return WORDS[Math.floor(Math.random()*WORDS.length)];
}
function keyboard(round, claimAll=false) {
    if (round.status === 'active') return { inline_keyboard:[
        [{text:'👁 Посмотреть слово',callback_data:`croc_show:${round.id}`}],
        [{text:'↩ Предыдущее слово',callback_data:`croc_prev:${round.id}`},{text:'🔄 Новое слово',callback_data:`croc_new:${round.id}`}]
    ]};
    return { inline_keyboard:[
        [{text:`💜 ${db.prepare('SELECT COUNT(*) c FROM crocodile_likes WHERE round_id=?').get(round.id).c}`,callback_data:`croc_like:${round.id}`}],
        [{text:'✋ Хочу быть ведущим!',callback_data:`croc_claim:${round.id}`}]
    ]};
}
function roundText(round) {
    return [
        '🐊 <b>КРОКОДИЛ • GAME SYNDICATE</b>',
        '━━━━━━━━━━━━━━━━━━',
        '',
        `🎭 <b>Ведущий:</b> ${esc(round.host_name)}`,
        '💬 Объясняет новое слово',
        '',
        '⏳ На объяснение даётся 1 час.',
        'Слово видит только ведущий.',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '💜 <i>GS Crocodile</i>'
    ].join('\n');
}
async function send(api, chatId, text, opts={}) { return api('sendMessage',{chat_id:chatId,text,...opts}); }
async function edit(api, chatId, messageId, text, opts={}) { return api('editMessageText',{chat_id:chatId,message_id:messageId,text,...opts}); }
async function answer(api,id,text,alert=false){ return api('answerCallbackQuery',{callback_query_id:id,text,show_alert:alert}).catch(()=>null); }

function achievementDefs(stats) {
    return [
        ['first_guess','🎯 Первый ответ',stats.guessed>=1],['guess_10','🧠 Знаток',stats.guessed>=10],['guess_50','🏆 Мастер догадок',stats.guessed>=50],['guess_100','👑 Легенда ответов',stats.guessed>=100],
        ['first_explain','🎭 Первый раунд',stats.explained>=1],['explain_25','🎙 Умелый ведущий',stats.explained>=25],['explain_100','🌟 Мастер объяснений',stats.explained>=100],
        ['likes_50','💜 Любимец публики',stats.likes>=50],['streak_5','🔥 Серия ×5',stats.best_streak>=5],['streak_10','⚡ Серия ×10',stats.best_streak>=10]
    ];
}
async function unlockAchievements(api,userId,chatId,threadId) {
    const s=db.prepare('SELECT * FROM crocodile_stats WHERE user_id=?').get(String(userId)); if(!s)return;
    const fresh=[];
    for(const [key,title,ok] of achievementDefs(s)) if(ok){ const r=db.prepare('INSERT OR IGNORE INTO crocodile_achievements VALUES(?,?,?)').run(String(userId),key,Date.now()); if(r.changes)fresh.push(title); }
    if(fresh.length) await send(api,chatId,[`✨ <b>ДОСТИЖЕНИЕ • GAME SYNDICATE</b>`,'',`👤 ${esc(s.display_name)}`, ...fresh.map(x=>`🏅 ${x}`)].join('\n'),{parse_mode:'HTML',...(threadId?{message_thread_id:threadId}:{})});
}
async function startRound(api,chatId,threadId,user) {
    if(activeRound(chatId,threadId)) return null;
    ensureStats(user);
    const now=Date.now(), word=chooseWord();
    const info=db.prepare(`INSERT INTO crocodile_rounds(chat_id,thread_id,host_id,host_name,word,started_at,ends_at) VALUES(?,?,?,?,?,?,?)`).run(String(chatId),threadId||null,String(user.id),nameOf(user),word,now,now+ROUND_MS);
    const round=db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(info.lastInsertRowid);
    const msg=await send(api,chatId,roundText(round),{parse_mode:'HTML',reply_markup:keyboard(round),...(threadId?{message_thread_id:threadId}:{})});
    db.prepare('UPDATE crocodile_rounds SET message_id=? WHERE id=?').run(msg.message_id,round.id);
    scheduleTimeout(round.id);
    return round;
}
async function finishTimeout(roundId) {
    const r=db.prepare("SELECT * FROM crocodile_rounds WHERE id=? AND status='active'").get(roundId); if(!r||!apiRef)return;
    db.prepare("UPDATE crocodile_rounds SET status='timeout',claim_open_at=? WHERE id=?").run(Date.now(),r.id);
    const done=db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(r.id);
    await edit(apiRef,r.chat_id,r.message_id,[
        '🐊 <b>КРОКОДИЛ • GAME SYNDICATE</b>','━━━━━━━━━━━━━━━━━━','',
        '⌛ <b>Время вышло!</b>',`📝 Правильный ответ: <b>${esc(r.word)}</b>`,'',
        'Никто не угадал слово. Теперь любой участник может стать ведущим.','',
        '━━━━━━━━━━━━━━━━━━','💜 <i>GS Crocodile</i>'
    ].join('\n'),{parse_mode:'HTML',reply_markup:keyboard(done,true)}).catch(()=>null);
}
function scheduleTimeout(roundId){ const r=db.prepare("SELECT * FROM crocodile_rounds WHERE id=? AND status='active'").get(roundId); if(!r)return; clearTimeout(timers.get(roundId)); const t=setTimeout(()=>finishTimeout(roundId),Math.max(1000,r.ends_at-Date.now())); timers.set(roundId,t); }

async function handleCommand(api,message,command,isAdmin) {
    if(command==='/setcrocodile') {
        if(message.chat.type==='private') { await send(api,message.chat.id,'Эту команду нужно выполнить в теме Telegram-группы.'); return true; }
        if(!await isAdmin(message.chat.id,message.from.id)) return true;
        setSetting('telegram_crocodile_chat_id',String(message.chat.id)); setSetting('telegram_crocodile_thread_id',message.message_thread_id?String(message.message_thread_id):'');
        await send(api,message.chat.id,'✅ <b>Тема «Крокодил» настроена.</b>\n\nЗапуск игры: /crocodile',{parse_mode:'HTML',...(message.message_thread_id?{message_thread_id:message.message_thread_id}:{})}); return true;
    }
    if(!sameTopic(message)) return false;
    if(command==='/crocodile'||command==='/croc'||command==='/startgame') {
        if(activeRound(message.chat.id,message.message_thread_id)) { await send(api,message.chat.id,'🐊 Раунд уже идёт.',message.message_thread_id?{message_thread_id:message.message_thread_id}:{}); return true; }
        await startRound(api,message.chat.id,message.message_thread_id,message.from); return true;
    }
    if(command==='/croctop') { await showTop(api,message.chat.id,message.message_thread_id); return true; }
    if(command==='/crocstats') { await showStats(api,message); return true; }
    if(command==='/crocstop') { if(await isAdmin(message.chat.id,message.from.id)){ const r=activeRound(message.chat.id,message.message_thread_id); if(r){db.prepare("UPDATE crocodile_rounds SET status='stopped' WHERE id=?").run(r.id); await edit(api,r.chat_id,r.message_id,'🐊 <b>Раунд остановлен администратором.</b>',{parse_mode:'HTML'}).catch(()=>null);} } return true; }
    return false;
}
async function showTop(api,chatId,threadId) {
    const guesses=db.prepare('SELECT * FROM crocodile_stats ORDER BY guessed DESC, updated_at ASC LIMIT 15').all();
    const explains=db.prepare('SELECT * FROM crocodile_stats ORDER BY explained DESC, likes DESC LIMIT 15').all();
    const fmt=(rows,key)=>rows.length?rows.map((x,i)=>`${i+1}. ${esc(x.display_name)} — <b>${x[key]}</b>`).join('\n'):'Пока нет данных.';
    await send(api,chatId,['🏆 <b>КРОКОДИЛ • ТОП-15</b>','━━━━━━━━━━━━━━━━━━','','🧠 <b>Больше всего угадано</b>',fmt(guesses,'guessed'),'','🎭 <b>Больше всего объяснено</b>',fmt(explains,'explained')].join('\n'),{parse_mode:'HTML',...(threadId?{message_thread_id:threadId}:{})});
}
async function showStats(api,message){ ensureStats(message.from); const s=db.prepare('SELECT * FROM crocodile_stats WHERE user_id=?').get(String(message.from.id)); await send(api,message.chat.id,['🐊 <b>ПРОФИЛЬ КРОКОДИЛА</b>','',`👤 ${esc(s.display_name)}`,`🧠 Угадано: <b>${s.guessed}</b>`,`🎭 Объяснено: <b>${s.explained}</b>`,`💜 Лайков: <b>${s.likes}</b>`,`🔥 Текущая серия: <b>${s.current_streak}</b>`,`⚡ Лучшая серия: <b>${s.best_streak}</b>`].join('\n'),{parse_mode:'HTML',...(message.message_thread_id?{message_thread_id:message.message_thread_id}:{})}); }

async function handleMessage(api,message) {
    if(!sameTopic(message)||!message.text||message.text.startsWith('/')) return false;
    const r=activeRound(message.chat.id,message.message_thread_id); if(!r||String(message.from.id)===String(r.host_id)) return false;
    if(normalize(message.text)!==normalize(r.word)) return false;
    ensureStats(message.from);
    const now=Date.now();
    db.transaction(()=>{
        db.prepare("UPDATE crocodile_rounds SET status='guessed',winner_id=?,winner_name=?,claim_open_at=? WHERE id=? AND status='active'").run(String(message.from.id),nameOf(message.from),now+WINNER_PRIORITY_MS,r.id);
        db.prepare('UPDATE crocodile_stats SET guessed=guessed+1,current_streak=current_streak+1,best_streak=MAX(best_streak,current_streak+1),updated_at=? WHERE user_id=?').run(now,String(message.from.id));
        db.prepare('UPDATE crocodile_stats SET explained=explained+1,updated_at=? WHERE user_id=?').run(now,String(r.host_id));
    })();
    const done=db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(r.id);
    await edit(api,r.chat_id,r.message_id,[
        '🐊 <b>КРОКОДИЛ • GAME SYNDICATE</b>','━━━━━━━━━━━━━━━━━━','',
        `🎉 <b>${esc(done.winner_name)}</b> отгадал(а) слово <b>${esc(done.word)}</b>!`,'',
        `💜 Поставь лайк ведущему <b>${esc(done.host_name)}</b>, если понравилось объяснение.`,'',
        '⏱ Первые 5 секунд стать ведущим может только угадавший.','',
        '━━━━━━━━━━━━━━━━━━','💜 <i>GS Crocodile</i>'
    ].join('\n'),{parse_mode:'HTML',reply_markup:keyboard(done)});
    await unlockAchievements(api,done.winner_id,done.chat_id,done.thread_id); await unlockAchievements(api,done.host_id,done.chat_id,done.thread_id);
    return true;
}

async function handleCallback(api,callback) {
    const data=callback.data||''; if(!data.startsWith('croc_')) return false;
    const [action,idRaw]=data.split(':'); const id=Number(idRaw); const r=db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(id); if(!r){await answer(api,callback.id,'Раунд не найден.');return true;}
    const uid=String(callback.from.id);
    if(action==='croc_show'){ if(uid!==String(r.host_id)){await answer(api,callback.id,'Слово видит только ведущий.',true);} else await answer(api,callback.id,`Твоё слово: ${r.word}`,true); return true; }
    if(action==='croc_new'||action==='croc_prev'){
        if(uid!==String(r.host_id)||r.status!=='active'){await answer(api,callback.id,'Только ведущий активного раунда.',true);return true;}
        const next=action==='croc_prev'&&r.previous_word?r.previous_word:chooseWord([r.word,r.previous_word]);
        db.prepare('UPDATE crocodile_rounds SET previous_word=?,word=? WHERE id=?').run(r.word,next,r.id); await answer(api,callback.id,`Новое слово: ${next}`,true); return true;
    }
    if(action==='croc_like'){
        if(r.status!=='guessed'){await answer(api,callback.id,'Оценка уже недоступна.');return true;}
        if(uid===String(r.host_id)){await answer(api,callback.id,'Нельзя поставить лайк самому себе.',true);return true;}
        const ins=db.prepare('INSERT OR IGNORE INTO crocodile_likes(round_id,user_id) VALUES(?,?)').run(r.id,uid);
        if(!ins.changes){await answer(api,callback.id,'Ты уже поставил лайк.');return true;}
        db.prepare('UPDATE crocodile_stats SET likes=likes+1 WHERE user_id=?').run(String(r.host_id));
        const fresh=db.prepare('SELECT * FROM crocodile_rounds WHERE id=?').get(r.id); await edit(api,r.chat_id,r.message_id,callback.message.text,{reply_markup:keyboard(fresh),...(callback.message.entities?{entities:callback.message.entities}:{})}).catch(()=>null); await answer(api,callback.id,'💜 Лайк ведущему засчитан!'); await unlockAchievements(api,r.host_id,r.chat_id,r.thread_id); return true;
    }
    if(action==='croc_claim'){
        if(!['guessed','timeout'].includes(r.status)){await answer(api,callback.id,'Ведущий уже выбран.');return true;}
        if(r.status==='guessed'&&Date.now()<Number(r.claim_open_at)&&uid!==String(r.winner_id)){await answer(api,callback.id,'Первые 5 секунд право у угадавшего.',true);return true;}
        const changed=db.prepare("UPDATE crocodile_rounds SET status='claimed' WHERE id=? AND status IN ('guessed','timeout')").run(r.id); if(!changed.changes){await answer(api,callback.id,'Кто-то уже стал ведущим.');return true;}
        await answer(api,callback.id,'Ты новый ведущий!'); await startRound(api,r.chat_id,r.thread_id,callback.from); return true;
    }
    return true;
}
function init(api){ apiRef=api; for(const r of db.prepare("SELECT id FROM crocodile_rounds WHERE status='active'").all()) scheduleTimeout(r.id); console.log(`✅ GS Crocodile: ${WORDS.length} игровых слов и выражений`); }
module.exports={init,handleCommand,handleMessage,handleCallback,showTop};
