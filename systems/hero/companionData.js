const COMPANIONS = {
  gray_wolf: { name:'Серый Волк', icon:'🐺', rarity:'common', description:'Верный следопыт, который помогает находить безопасную дорогу.', bonuses:{ expedition_success:5 } },
  white_eagle: { name:'Белый Орёл', icon:'🦅', rarity:'rare', description:'Замечает редкую добычу с высоты.', bonuses:{ rare_find:8 } },
  shadow_fox: { name:'Теневая Лисица', icon:'🦊', rarity:'epic', description:'Чувствует скрытые тропы и опасности.', bonuses:{ expedition_success:6, rare_find:6 } },
  stone_golem: { name:'Каменный Голем', icon:'🗿', rarity:'epic', description:'Принимает часть ударов на себя.', bonuses:{ world_boss_resistance:10 } },
  young_dragon: { name:'Маленький Дракон', icon:'🐉', rarity:'legendary', description:'Его пламя усиливает атаки против мировых боссов.', bonuses:{ world_boss_damage:10 } },
};
const RARITY_LABELS={common:'Обычный',rare:'Редкий',epic:'Эпический',legendary:'Легендарный',mythic:'Мифический',exclusive:'Эксклюзивный'};
module.exports={COMPANIONS,RARITY_LABELS};
