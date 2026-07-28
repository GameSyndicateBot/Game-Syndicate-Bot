const CATEGORY_DEFS = [
  ['games','🎮 Игры'],['movies','🎬 Фильмы'],['series','📺 Сериалы'],['geography','🌍 География'],
  ['history','📚 История'],['space','🚀 Космос'],['animals','🐾 Животные'],['food','🍔 Еда'],
  ['cars','🚗 Автомобили'],['sports','⚽ Спорт'],['music','🎵 Музыка'],['it','💻 IT'],
  ['logic','🧩 Логика'],['memes','😂 Мемы и интернет'],['ukraine','🇺🇦 Украина'],
  ['general','🌎 Общие знания'],['gs','🏰 Game Syndicate'],
];

const DATA = {
  games: [
    ['Minecraft','Mojang',2011,'песочница'],['Fortnite','Epic Games',2017,'королевская битва'],['The Witcher 3','CD Projekt Red',2015,'RPG'],
    ['GTA V','Rockstar Games',2013,'экшен'],['Portal 2','Valve',2011,'головоломка'],['Baldur’s Gate 3','Larian Studios',2023,'RPG'],
    ['Among Us','Innersloth',2018,'социальная дедукция'],['Dota 2','Valve',2013,'MOBA'],['Counter-Strike 2','Valve',2023,'шутер'],
    ['Cyberpunk 2077','CD Projekt Red',2020,'RPG'],['Elden Ring','FromSoftware',2022,'RPG'],['Overwatch','Blizzard',2016,'шутер'],
    ['Goose Goose Duck','Gaggle Studios',2021,'социальная дедукция'],['Terraria','Re-Logic',2011,'песочница'],['Stardew Valley','ConcernedApe',2016,'симулятор'],
  ],
  movies: [
    ['Титаник','Джеймс Кэмерон',1997],['Матрица','сёстры Вачовски',1999],['Интерстеллар','Кристофер Нолан',2014],
    ['Аватар','Джеймс Кэмерон',2009],['Начало','Кристофер Нолан',2010],['Властелин колец: Братство Кольца','Питер Джексон',2001],
    ['Гладиатор','Ридли Скотт',2000],['Паразиты','Пон Джун-хо',2019],['Крёстный отец','Фрэнсис Форд Коппола',1972],
    ['Назад в будущее','Роберт Земекис',1985],['Чужой','Ридли Скотт',1979],['Терминатор 2','Джеймс Кэмерон',1991],
    ['Дюна','Дени Вильнёв',2021],['Оппенгеймер','Кристофер Нолан',2023],['Шрек','Эндрю Адамсон',2001],
  ],
  series: [
    ['Игра престолов','HBO',2011],['Во все тяжкие','AMC',2008],['Очень странные дела','Netflix',2016],['Офис','NBC',2005],
    ['Шерлок','BBC',2010],['Чернобыль','HBO',2019],['Мандалорец','Disney+',2019],['Пацаны','Prime Video',2019],
    ['Доктор Кто','BBC',1963],['Друзья','NBC',1994],['Тьма','Netflix',2017],['Сёгун','FX',2024],
    ['Аркейн','Netflix',2021],['Одни из нас','HBO',2023],['Мистер Робот','USA Network',2015],
  ],
  geography: [
    ['Франция','Париж','Европа'],['Италия','Рим','Европа'],['Япония','Токио','Азия'],['Канада','Оттава','Северная Америка'],
    ['Австралия','Канберра','Австралия'],['Бразилия','Бразилиа','Южная Америка'],['Египет','Каир','Африка'],['Норвегия','Осло','Европа'],
    ['Аргентина','Буэнос-Айрес','Южная Америка'],['Таиланд','Бангкок','Азия'],['Португалия','Лиссабон','Европа'],['Мексика','Мехико','Северная Америка'],
    ['Индия','Нью-Дели','Азия'],['Кения','Найроби','Африка'],['Новая Зеландия','Веллингтон','Океания'],['Чили','Сантьяго','Южная Америка'],
  ],
  history: [
    ['падение Западной Римской империи',476],['открытие Америки Колумбом',1492],['начало Французской революции',1789],
    ['окончание Первой мировой войны',1918],['начало Второй мировой войны',1939],['первый полёт человека в космос',1961],
    ['падение Берлинской стены',1989],['изобретение книгопечатания Гутенбергом',1440],['Великая хартия вольностей',1215],
    ['битва при Ватерлоо',1815],['основание Рима по традиционной дате',753],['первый крестовый поход',1096],
    ['подписание Декларации независимости США',1776],['Чернобыльская катастрофа',1986],['распад СССР',1991],
  ],
  space: [
    ['Меркурий',1,0],['Венера',2,0],['Земля',3,1],['Марс',4,2],['Юпитер',5,95],['Сатурн',6,146],['Уран',7,28],['Нептун',8,16],
  ],
  animals: [
    ['гепард','млекопитающее','суша'],['дельфин','млекопитающее','океан'],['императорский пингвин','птица','Антарктида'],
    ['комодский варан','рептилия','острова Индонезии'],['синий кит','млекопитающее','океан'],['африканский слон','млекопитающее','Африка'],
    ['осьминог','моллюск','океан'],['белая акула','рыба','океан'],['летучая мышь','млекопитающее','воздух'],['крокодил','рептилия','реки'],
    ['страус','птица','Африка'],['коала','млекопитающее','Австралия'],['капибара','млекопитающее','Южная Америка'],['хамелеон','рептилия','тропики'],
  ],
  food: [
    ['суши','Япония'],['паэлья','Испания'],['пицца','Италия'],['борщ','Украина'],['тако','Мексика'],['круассан','Франция'],
    ['фалафель','Ближний Восток'],['кимчи','Корея'],['карри','Индия'],['гуляш','Венгрия'],['хачапури','Грузия'],['пад-тай','Таиланд'],
    ['братвурст','Германия'],['пастел-де-ната','Португалия'],['путин','Канада'],
  ],
  cars: [
    ['Toyota','Япония'],['BMW','Германия'],['Ferrari','Италия'],['Volvo','Швеция'],['Hyundai','Южная Корея'],['Ford','США'],
    ['Renault','Франция'],['Škoda','Чехия'],['SEAT','Испания'],['Jaguar','Великобритания'],['Honda','Япония'],['Lamborghini','Италия'],
    ['Mercedes-Benz','Германия'],['Tesla','США'],['Peugeot','Франция'],['Kia','Южная Корея'],
  ],
  sports: [
    ['футбол',11],['баскетбол',5],['волейбол',6],['хоккей',6],['гандбол',7],['бейсбол',9],['регби-юнион',15],['водное поло',7],
  ],
  music: [
    ['Queen','Великобритания'],['ABBA','Швеция'],['The Beatles','Великобритания'],['Rammstein','Германия'],['Daft Punk','Франция'],
    ['Nirvana','США'],['Metallica','США'],['Måneskin','Италия'],['BTS','Южная Корея'],['AC/DC','Австралия'],['Imagine Dragons','США'],
    ['Linkin Park','США'],['The Cranberries','Ирландия'],['a-ha','Норвегия'],['Scorpions','Германия'],
  ],
  it: [
    ['HTML','язык разметки'],['CSS','стили веб-страниц'],['JavaScript','язык программирования'],['SQL','язык запросов к базам данных'],
    ['HTTP','протокол передачи гипертекста'],['DNS','система доменных имён'],['RAM','оперативная память'],['CPU','центральный процессор'],
    ['Git','система контроля версий'],['JSON','формат обмена данными'],['Linux','семейство операционных систем'],['SQLite','встраиваемая база данных'],
  ],
  memes: [
    ['404','страница не найдена'],['AFK','отошёл от клавиатуры'],['GG','хорошая игра'],['NPC','неигровой персонаж'],
    ['POV','точка зрения'],['LOL','громко смеюсь'],['BRB','скоро вернусь'],['IRL','в реальной жизни'],
    ['TL;DR','слишком длинно; не читал'],['FOMO','страх упустить что-то'],['OP','автор исходного поста'],['DM','личное сообщение'],
  ],
  ukraine: [
    ['Украина','Киев'],['Одесская область','Одесса'],['Львовская область','Львов'],['Харьковская область','Харьков'],
    ['Днепропетровская область','Днепр'],['Полтавская область','Полтава'],['Черкасская область','Черкассы'],['Винницкая область','Винница'],
    ['Волынская область','Луцк'],['Закарпатская область','Ужгород'],['Запорожская область','Запорожье'],['Черниговская область','Чернигов'],
  ],
  general: [
    ['вода','H₂O'],['углекислый газ','CO₂'],['поваренная соль','NaCl'],['золото','Au'],['серебро','Ag'],['железо','Fe'],
    ['кислород','O₂'],['азот','N₂'],['озон','O₃'],['метан','CH₄'],['аммиак','NH₃'],['глюкоза','C₆H₁₂O₆'],
  ],
  gs: [
    ['Крокодил','объяснение слов без прямого называния'],['Бункер','социальная дискуссионная игра'],['Goose Goose Duck','игра социальной дедукции'],
    ['Мировой босс','кооперативное PvE-событие'],['Экспедиции','добыча ресурсов и предметов'],['Гильдия героев','развитие RPG-персонажа'],
    ['Lucky Day','ежедневный случайный выбор участника'],['GS Blitz','викторина на выбывание'],['Аукцион','продажа предметов игрокам'],
    ['Обмен','прямая сделка между игроками'],['Паки','получение коллекционных карточек'],['Достижения','награды за прогресс сообщества'],
  ],
};

function mulberry32(seed) { return function() { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function shuffle(arr, rng) { const out=[...arr]; for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];} return out; }
function distract(values, correct, rng) { return shuffle([...new Set(values.filter(v => String(v)!==String(correct)))], rng).slice(0,3); }
function q(category, difficulty, text, correct, wrong, explanation='') { const answers=[String(correct),...wrong.map(String)]; if(answers.length<4) return null; return {category,difficulty,text,answers,correctIndex:0,explanation}; }

function factualQuestions(key, rows, rng) {
  const out=[];
  const colCount=Math.max(...rows.map(r=>r.length));
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    for(let c=1;c<colCount;c++){
      if(row[c]===undefined) continue;
      const labels={1:'значение',2:'категория',3:'жанр'};
      const wrong=distract(rows.map(r=>r[c]).filter(v=>v!==undefined),row[c],rng);
      if(wrong.length===3) out.push(q(key,1+((i+c)%3),`Что соответствует «${row[0]}»?`,row[c],wrong));
      const wrongNames=distract(rows.filter(r=>r[c]!==undefined).map(r=>r[0]),row[0],rng);
      if(wrongNames.length===3) out.push(q(key,1+((i+c+1)%3),`К чему относится: «${row[c]}»?`,row[0],wrongNames));
    }
  }
  return out.filter(Boolean);
}

function buildLogic(rng, count=240){
  const out=[];
  for(let i=0;i<count;i++){
    const a=2+Math.floor(rng()*40), b=2+Math.floor(rng()*30), op=i%4;
    let text,ans;
    if(op===0){text=`Сколько будет ${a} + ${b} × 2?`; ans=a+b*2;}
    if(op===1){text=`Продолжи последовательность: ${a}, ${a+b}, ${a+2*b}, ...`; ans=a+3*b;}
    if(op===2){text=`У числа ${a*2} отняли половину. Что осталось?`; ans=a;}
    if(op===3){text=`Какое число лишнее: ${a}, ${a+2}, ${a+4}, ${a+5}?`; ans=a+5;}
    const wrong=[ans+1,ans-1,ans+(b||2)].filter((v,j,arr)=>v>=0&&arr.indexOf(v)===j).slice(0,3);
    while(wrong.length<3) wrong.push(ans+wrong.length+2);
    out.push(q('logic',1+(i%4===0?1:0),text,ans,wrong));
  }
  return out;
}

function buildCategory(key, rng){
  if(key==='logic') return buildLogic(rng,260);
  if(key==='space'){
    const rows=DATA.space; const out=factualQuestions(key,rows,rng);
    for(let i=0;i<rows.length;i++){
      const [name,order,moons]=rows[i];
      const wrong=distract(rows.map(r=>r[0]),name,rng);
      out.push(q(key,1,`Какая планета находится ${order}-й от Солнца?`,name,wrong));
      const mWrong=distract(rows.map(r=>r[2]),moons,rng);
      if(mWrong.length===3) out.push(q(key,3,`Сколько известных спутников указано в игровом справочнике для планеты ${name}?`,moons,mWrong));
    }
    return out;
  }
  if(key==='sports'){
    const out=factualQuestions(key,DATA.sports,rng);
    for(let i=0;i<120;i++){
      const row=pick(DATA.sports,rng); const wrong=distract(DATA.sports.map(r=>r[1]),row[1],rng);
      if(wrong.length===3) out.push(q(key,1+(i%3),`Сколько игроков одной команды одновременно находится на площадке/поле в классическом виде спорта «${row[0]}»?`,row[1],wrong));
    }
    return out;
  }
  return factualQuestions(key,DATA[key],rng);
}

function expandToTarget(key, base, target, rng){
  const out=[]; let serial=0;
  while(out.length<target){
    const source=base[serial%base.length];
    const answers=shuffle(source.answers,rng);
    const correctText=source.answers[source.correctIndex];
    const correctIndex=answers.indexOf(correctText);
    const variant=Math.floor(serial/base.length)+1;
    const text=variant===1?source.text:`${source.text} [вариант ${variant}]`;
    out.push({...source,id:`${key}_${String(out.length+1).padStart(4,'0')}`,text,answers,correctIndex});
    serial++;
  }
  return out;
}

function buildQuestionBank(targetPerCategory=200){
  const rng=mulberry32(20260728); const all=[];
  for(const [key] of CATEGORY_DEFS){
    const base=buildCategory(key,rng);
    if(!base.length) throw new Error(`No questions for ${key}`);
    all.push(...expandToTarget(key,base,targetPerCategory,rng));
  }
  return all;
}

const QUESTIONS=buildQuestionBank(200);
const CATEGORY_MAP=Object.fromEntries(CATEGORY_DEFS);
module.exports={QUESTIONS,CATEGORY_DEFS,CATEGORY_MAP};
