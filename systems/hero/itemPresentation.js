const { RARITY_LABELS } = require('./itemData');
const { parseBonuses, applyUpgradeToBonuses, equipmentKind } = require('./itemService');

const RARITY_ICONS = Object.freeze({
  common:'⭐', rare:'⭐⭐', epic:'⭐⭐⭐', legendary:'⭐⭐⭐⭐', mythic:'⭐⭐⭐⭐⭐', exclusive:'🌈', holographic:'✨'
});
const SLOT_LABELS = Object.freeze({
  weapon:'Оружие', melee:'Основное оружие', offhand:'Левая рука', armor:'Доспех', chest:'Нагрудник', helmet:'Шлем',
  gloves:'Перчатки', boots:'Сапоги', ring:'Кольцо', amulet:'Амулет', backpack:'Рюкзак', belt:'Пояс', legs:'Поножи'
});
const TYPE_LABELS = Object.freeze({
  weapon:'Оружие', armor:'Броня', helmet:'Шлем', gloves:'Перчатки', boots:'Сапоги', ring:'Кольцо', amulet:'Амулет', backpack:'Рюкзак'
});
const TYPE_ICONS = Object.freeze({weapon:'⚔️',armor:'🛡️',helmet:'🪖',gloves:'🧤',boots:'🥾',ring:'💍',amulet:'📿',backpack:'🎒'});

function formatItemDetails(item,{price=null,sellerId=null,includeHeader=true}={}){
  if(!item) return ['❓ Предмет недоступен'];
  const level=Math.max(0,Number(item.upgrade_level)||0);
  const rarity=String(item.rarity||'common').toLowerCase();
  const bonuses=applyUpgradeToBonuses(parseBonuses(item.bonuses_json),level);
  const lines=[];
  if(includeHeader) lines.push(`${TYPE_ICONS[item.item_type]||'🧰'} **${item.name||item.item_name||item.item_key||'Предмет'}${level?` +${level}`:''}**`);
  lines.push(`${RARITY_ICONS[rarity]||'⭐'} **${RARITY_LABELS?.[rarity]||rarity}**`);
  const slot=item.slot||item.item_type;
  if(slot) lines.push(`📍 Слот: **${SLOT_LABELS[slot]||TYPE_LABELS[item.item_type]||slot}**`);
  const kind=equipmentKind(item);
  if(kind && !['weapon','armor','helmet','gloves','boots','ring','amulet','backpack'].includes(kind)) {
    const kinds={staff:'Магическое оружие',ranged:'Дальнобойное оружие',shield:'Щит',two_handed:'Двуручное оружие',martial:'Боевое оружие'};
    if(kinds[kind]) lines.push(`🧩 Тип: **${kinds[kind]}**`);
  }
  const bonusLines=require('./itemService').formatBonuses(bonuses);
  if(bonusLines.length){ lines.push('',...bonusLines); }
  if(item.description) lines.push('',`📝 ${item.description}`);
  if(price!=null) lines.push('',`💰 Цена: **${Number(price)||0} GS Dust**`);
  if(sellerId) lines.push(`👤 Продавец: <@${sellerId}>`);
  return lines;
}
function formatItemDescription(item,options={}){return formatItemDetails(item,options).join('\n');}
module.exports={formatItemDetails,formatItemDescription,RARITY_ICONS,SLOT_LABELS};
