const HERO_CLASSES = Object.freeze({
  warrior: { name: 'Воин', icon: '⚔️', hp: 180, strength: 14, defense: 18, dexterity: 7, intelligence: 4, luck: 5, role: 'Танк' },
  paladin: { name: 'Паладин', icon: '🛡️', hp: 170, strength: 11, defense: 16, dexterity: 5, intelligence: 9, luck: 5, role: 'Танк' },
  guardian: { name: 'Страж', icon: '🏰', hp: 200, strength: 9, defense: 20, dexterity: 4, intelligence: 4, luck: 4, role: 'Танк' },
  cleric: { name: 'Клирик', icon: '✝️', hp: 120, strength: 6, defense: 8, dexterity: 5, intelligence: 15, luck: 7, role: 'Хиллер' },
  priest: { name: 'Жрец', icon: '✨', hp: 125, strength: 4, defense: 7, dexterity: 5, intelligence: 16, luck: 8, role: 'Хиллер' },
  bard: { name: 'Бард', icon: '🎵', hp: 130, strength: 7, defense: 8, dexterity: 8, intelligence: 14, luck: 8, role: 'Хиллер' },
  berserker: { name: 'Берсерк', icon: '🪓', hp: 150, strength: 17, defense: 8, dexterity: 8, intelligence: 3, luck: 5, role: 'DPS' },
  assassin: { name: 'Ассасин', icon: '🗡️', hp: 100, strength: 13, defense: 6, dexterity: 17, intelligence: 6, luck: 10, role: 'DPS' },
  archer: { name: 'Лучник', icon: '🏹', hp: 110, strength: 11, defense: 7, dexterity: 16, intelligence: 6, luck: 9, role: 'DPS' },
  mage: { name: 'Маг', icon: '🔮', hp: 95, strength: 4, defense: 5, dexterity: 7, intelligence: 17, luck: 7, role: 'DPS' },
  pyromancer: { name: 'Пиромант', icon: '🔥', hp: 105, strength: 4, defense: 6, dexterity: 7, intelligence: 17, luck: 7, role: 'DPS' },
  duelist: { name: 'Дуэлянт', icon: '⚔️', hp: 120, strength: 14, defense: 8, dexterity: 16, intelligence: 5, luck: 8, role: 'DPS' },
  reaper: { name: 'Жнец', icon: '☠️', hp: 115, strength: 15, defense: 7, dexterity: 12, intelligence: 6, luck: 7, role: 'DPS' },
  mindlord: { name: 'Повелитель Разума', icon: '🧠', hp: 105, strength: 4, defense: 6, dexterity: 7, intelligence: 17, luck: 8, role: 'DPS' },
  engineer: { name: 'Инженер', icon: '🔧', hp: 125, strength: 8, defense: 9, dexterity: 9, intelligence: 14, luck: 6, role: 'Поддержка' },
  necromancer: { name: 'Некромант', icon: '☠️', hp: 115, strength: 5, defense: 6, dexterity: 6, intelligence: 16, luck: 8, role: 'Поддержка' },
  druid: { name: 'Друид', icon: '🌿', hp: 135, strength: 6, defense: 10, dexterity: 7, intelligence: 15, luck: 8, role: 'Поддержка' },
  shaman: { name: 'Шаман', icon: '🪬', hp: 125, strength: 6, defense: 9, dexterity: 7, intelligence: 15, luck: 8, role: 'Поддержка' },
  chronomancer: { name: 'Хрономант', icon: '⏳', hp: 120, strength: 4, defense: 8, dexterity: 8, intelligence: 17, luck: 9, role: 'Поддержка' },
  illusionist: { name: 'Иллюзионист', icon: '🎭', hp: 115, strength: 4, defense: 7, dexterity: 9, intelligence: 16, luck: 10, role: 'Поддержка' },
});

const ORIGINS = Object.freeze({
  noble: { name: 'Дворянин', icon: '🏰', description: 'Воспитан при дворе и знаком с торговлей.', bonus: { luck: 1 }, passive: '+2% выгодных встреч с торговцами' },
  hunter: { name: 'Охотник', icon: '🌲', description: 'Знает лесные тропы и повадки зверей.', bonus: { dexterity: 2 }, passive: '+3% успеха в природных локациях' },
  mercenary: { name: 'Наёмник', icon: '⚔️', description: 'Закалён контрактами и тяжёлыми боями.', bonus: { strength: 2 }, passive: '+3% успеха в боевых событиях' },
  apprentice: { name: 'Ученик мага', icon: '📚', description: 'Получил основы тайных наук.', bonus: { intelligence: 2 }, passive: '+3% успеха в магических событиях' },
  thief: { name: 'Вор', icon: '🦊', description: 'Ловкие руки и привычка замечать тайники.', bonus: { dexterity: 1, luck: 1 }, passive: '+4% шанс открыть тайник' },
  forestborn: { name: 'Лесной житель', icon: '🍃', description: 'Вырос вдали от городов.', bonus: { hp: 5, luck: 1 }, passive: '+3% шанс найти редкий материал' },
  monk: { name: 'Монах', icon: '⛩️', description: 'Дисциплина укрепила тело и разум.', bonus: { defense: 1, intelligence: 1 }, passive: '-5% длительность ранений' },
  highlander: { name: 'Горец', icon: '🏔️', description: 'Привык к холоду и опасным подъёмам.', bonus: { hp: 8, defense: 1 }, passive: '+4% успеха в горах' },
  sailor: { name: 'Моряк', icon: '⚓', description: 'Пережил штормы, пиратов и дальние берега.', bonus: { strength: 1, luck: 1 }, passive: '+3% успеха у воды и в руинах' },
  prince: { name: 'Изгнанный принц', icon: '👑', description: 'Потерял титул, но не амбиции.', bonus: { hp: 4, strength: 1, intelligence: 1 }, passive: '+2% ко всем наградам репутации' },
});

const GENDERS = Object.freeze({ male: 'Мужской', female: 'Женский' });
const STAT_LABELS = Object.freeze({ hp: 'HP', strength: 'Сила', defense: 'Защита', dexterity: 'Ловкость', intelligence: 'Интеллект', luck: 'Удача' });

function xpForNextLevel(level) { return 100 + Math.max(0, level - 1) * 50; }

module.exports = { HERO_CLASSES, ORIGINS, GENDERS, STAT_LABELS, xpForNextLevel };
