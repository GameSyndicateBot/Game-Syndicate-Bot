const HERO_CLASSES = Object.freeze({
  warrior: { name: 'Воин', icon: '⚔️', hp: 125, strength: 14, defense: 11, dexterity: 7, intelligence: 4, luck: 5, role: 'Танк / урон' },
  paladin: { name: 'Паладин', icon: '🛡️', hp: 120, strength: 11, defense: 13, dexterity: 5, intelligence: 7, luck: 5, role: 'Танк / поддержка' },
  guardian: { name: 'Страж', icon: '🏰', hp: 135, strength: 9, defense: 15, dexterity: 4, intelligence: 4, luck: 4, role: 'Танк' },
  berserker: { name: 'Берсерк', icon: '⚙️', hp: 118, strength: 15, defense: 8, dexterity: 7, intelligence: 3, luck: 5, role: 'Поддержка / урон' },
  assassin: { name: 'Ассасин', icon: '🗡️', hp: 92, strength: 12, defense: 6, dexterity: 15, intelligence: 6, luck: 8, role: 'Урон' },
  ranger: { name: 'Следопыт', icon: '🏹', hp: 102, strength: 10, defense: 7, dexterity: 14, intelligence: 6, luck: 9, role: 'Урон' },
  engineer: { name: 'Инженер', icon: '🔧', hp: 108, strength: 8, defense: 9, dexterity: 9, intelligence: 14, luck: 6, role: 'Урон / поддержка' },
  mage: { name: 'Маг', icon: '🔮', hp: 88, strength: 4, defense: 5, dexterity: 7, intelligence: 17, luck: 7, role: 'Магический урон' },
  warlock: { name: 'Чернокнижник', icon: '🌑', hp: 96, strength: 5, defense: 6, dexterity: 6, intelligence: 16, luck: 8, role: 'Магический урон' },
  cleric: { name: 'Клирик', icon: '✝️', hp: 105, strength: 6, defense: 8, dexterity: 5, intelligence: 15, luck: 7, role: 'Лечение' },
  priest: { name: 'Жрец', icon: '✨', hp: 98, strength: 4, defense: 7, dexterity: 5, intelligence: 16, luck: 8, role: 'Лечение / поддержка' },
  druid: { name: 'Друид', icon: '🌿', hp: 110, strength: 7, defense: 8, dexterity: 8, intelligence: 14, luck: 8, role: 'Поддержка / лечение' },
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
