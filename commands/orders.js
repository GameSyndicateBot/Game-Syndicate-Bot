const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { ITEMS } = require('../systems/hero/itemData');
const { getHero } = require('../systems/hero/heroService');
const { createOrder,listOpenOrders,listMyOrders,fulfillOrder,cancelOrder } = require('../systems/hero/orderBoardService');
const { duplicateEquipment,sellToBlacksmith,createListing,listOpen:listEquipment,listMine:listMyEquipment,buyListing,cancelListing } = require('../systems/hero/equipmentMarketService');

const ITEM_CHOICES=[{name:'Лесные травы',value:'forest_herbs'},{name:'Экстракт трав',value:'herb_extract'},{name:'Пряные травы',value:'culinary_herbs'},{name:'Лунный цветок',value:'moon_blossom'},{name:'Железная руда',value:'iron_ore'},{name:'Железный слиток',value:'iron_ingot'},{name:'Самоцвет',value:'gemstone'},{name:'Древний фрагмент',value:'ancient_fragment'},{name:'Твёрдая древесина',value:'hardwood'},{name:'Доска',value:'board'},{name:'Лесные ягоды',value:'wild_berries'},{name:'Лесные грибы',value:'forest_mushrooms'},{name:'Древняя древесина',value:'ancient_wood'},{name:'Свежая рыба',value:'fresh_fish'},{name:'Морепродукты',value:'shellfish'},{name:'Лунный карп',value:'moon_carp'},{name:'Жемчуг',value:'pearl'},{name:'Сырое мясо',value:'raw_meat'},{name:'Шкура зверя',value:'beast_hide'},{name:'Кожа',value:'leather'},{name:'Кость зверя',value:'beast_bone'},{name:'Сердце зверя',value:'beast_heart'}];
function orderLine(o){
  const item=ITEMS[o.item_key]?.name||o.item_key;
  return `#${o.id} • **${item}** ×${o.quantity_remaining}/${o.quantity_total} • **${o.price_each} Dust/шт.** • <@${o.buyer_id}>`;
}
module.exports={
 data:new SlashCommandBuilder().setName('orders').setDescription('Доска заказов Гильдии')
  .addSubcommand(s=>s.setName('list').setDescription('Показать открытые заказы'))
  .addSubcommand(s=>s.setName('create').setDescription('Создать заказ и зарезервировать Dust')
    .addStringOption(o=>o.setName('item').setDescription('Материал').setRequired(true).addChoices(...ITEM_CHOICES))
    .addIntegerOption(o=>o.setName('quantity').setDescription('Количество').setRequired(true).setMinValue(1).setMaxValue(10000))
    .addIntegerOption(o=>o.setName('price').setDescription('Цена за 1 единицу в Dust').setRequired(true).setMinValue(1).setMaxValue(1000000)))
  .addSubcommand(s=>s.setName('fulfill').setDescription('Частично или полностью выполнить заказ')
    .addIntegerOption(o=>o.setName('id').setDescription('ID заказа').setRequired(true).setMinValue(1))
    .addIntegerOption(o=>o.setName('quantity').setDescription('Сколько единиц передать').setRequired(true).setMinValue(1)))
  .addSubcommand(s=>s.setName('equipment-inventory').setDescription('Показать свободные дубликаты экипировки'))
  .addSubcommand(s=>s.setName('blacksmith-sell').setDescription('Продать дубликат экипировки кузнецу')
    .addIntegerOption(o=>o.setName('inventory_id').setDescription('ID предмета из списка').setRequired(true).setMinValue(1)))
  .addSubcommand(s=>s.setName('equipment-list').setDescription('Предметы игроков на продаже'))
  .addSubcommand(s=>s.setName('equipment-sell').setDescription('Выставить дубликат экипировки')
    .addIntegerOption(o=>o.setName('inventory_id').setDescription('ID предмета').setRequired(true).setMinValue(1))
    .addIntegerOption(o=>o.setName('price').setDescription('Цена в GS Dust').setRequired(true).setMinValue(1).setMaxValue(10000000)))
  .addSubcommand(s=>s.setName('equipment-buy').setDescription('Купить предмет игрока')
    .addIntegerOption(o=>o.setName('id').setDescription('ID объявления').setRequired(true).setMinValue(1)))
  .addSubcommand(s=>s.setName('equipment-mine').setDescription('Мои объявления экипировки'))
  .addSubcommand(s=>s.setName('equipment-cancel').setDescription('Снять своё объявление')
    .addIntegerOption(o=>o.setName('id').setDescription('ID объявления').setRequired(true).setMinValue(1)))
  .addSubcommand(s=>s.setName('mine').setDescription('Показать мои заказы'))
  .addSubcommand(s=>s.setName('cancel').setDescription('Отменить свой заказ и вернуть остаток Dust')
    .addIntegerOption(o=>o.setName('id').setDescription('ID заказа').setRequired(true).setMinValue(1))),
 async execute(interaction){
  if(!getHero(interaction.user.id))return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const sub=interaction.options.getSubcommand();
  if(sub==='equipment-inventory'){
    const rows=duplicateEquipment(interaction.user.id);
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('🎒 Дубликаты экипировки').setDescription(rows.length?rows.map(x=>`ID **${x.id}** • **${x.name}** [${x.rarity}] • свободно: **${x.sellable}**${x.upgrade_level?` • +${x.upgrade_level}`:''}`).join('\n'):'Свободных дубликатов нет. Последняя копия и экипированные предметы не продаются.')],flags:MessageFlags.Ephemeral});
  }
  if(sub==='blacksmith-sell'){
    const r=sellToBlacksmith(interaction.user.id,interaction.options.getInteger('inventory_id'));
    const errors={not_found:'❌ Экипировка не найдена.',equipped:'❌ Экипированный предмет продать нельзя.',last_copy:'❌ Последнюю копию предмета продать нельзя.'};
    return interaction.reply({content:r.ok?`🔨 Кузнец купил **${r.item.name}** за **${r.earned} GS Dust**. Баланс: **${r.balance}**.`:(errors[r.reason]||'❌ Продажа не выполнена.'),flags:MessageFlags.Ephemeral});
  }
  if(sub==='equipment-list'){
    const rows=listEquipment(25); return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('🛒 Рынок экипировки').setDescription(rows.length?rows.map(x=>`#**${x.id}** • **${x.item_name}** [${x.rarity}]${x.upgrade_level?` +${x.upgrade_level}`:''} • **${x.price} Dust** • <@${x.seller_id}>`).join('\n'):'Открытых объявлений нет.')],flags:MessageFlags.Ephemeral});
  }
  if(sub==='equipment-mine'){
    const rows=listMyEquipment(interaction.user.id,25); return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('📝 Мои объявления').setDescription(rows.length?rows.map(x=>`#**${x.id}** • **${x.item_name}** • ${x.price} Dust • ${x.status}`).join('\n'):'Объявлений нет.')],flags:MessageFlags.Ephemeral});
  }
  if(sub==='equipment-sell'){
    const r=createListing(interaction.user.id,interaction.options.getInteger('inventory_id'),interaction.options.getInteger('price'));
    const errors={not_found:'❌ Экипировка не найдена.',equipped:'❌ Экипированный предмет выставить нельзя.',last_copy:'❌ Можно выставлять только лишние копии.',price:'❌ Неверная цена.'};
    return interaction.reply({content:r.ok?`✅ **${r.listing.item_name}** выставлен под №${r.listing.id} за **${r.listing.price} GS Dust**.`:(errors[r.reason]||'❌ Не удалось создать объявление.'),flags:MessageFlags.Ephemeral});
  }
  if(sub==='equipment-buy'){
    const r=buyListing(interaction.user.id,interaction.options.getInteger('id')); const errors={closed:'❌ Объявление уже закрыто.',self:'❌ Нельзя купить собственный предмет.',dust:`❌ Недостаточно Dust. Нужно **${r.price||0}**.`};
    return interaction.reply({content:r.ok?`✅ Куплен предмет **${r.listing.item_name}** за **${r.listing.price} GS Dust**.`:(errors[r.reason]||'❌ Покупка не выполнена.'),flags:MessageFlags.Ephemeral});
  }
  if(sub==='equipment-cancel'){
    const r=cancelListing(interaction.user.id,interaction.options.getInteger('id')); return interaction.reply({content:r.ok?`✅ Объявление снято, **${r.listing.item_name}** возвращён в инвентарь.`:'❌ Объявление не найдено или уже закрыто.',flags:MessageFlags.Ephemeral});
  }
  if(sub==='list'){
    const rows=listOpenOrders(25);
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('📜 Доска заказов').setDescription(rows.length?rows.map(orderLine).join('\n'):'Открытых заказов пока нет.').setFooter({text:'Используй /orders fulfill для частичного или полного выполнения.'})],flags:MessageFlags.Ephemeral});
  }
  if(sub==='mine'){
    const rows=listMyOrders(interaction.user.id,25);
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle('📝 Мои заказы').setDescription(rows.length?rows.map(o=>`${orderLine(o)} • ${o.status}`).join('\n'):'У тебя нет заказов.')],flags:MessageFlags.Ephemeral});
  }
  if(sub==='create'){
    const item=interaction.options.getString('item'),quantity=interaction.options.getInteger('quantity'),price=interaction.options.getInteger('price');
    const r=createOrder(interaction.user.id,item,quantity,price);
    if(!r.ok){
      const m={item:'❌ Этот материал нельзя заказать.',quantity:'❌ Неверное количество.',price:'❌ Неверная цена.',dust:`❌ Недостаточно Dust. Нужно **${r.total}**.`};
      return interaction.reply({content:m[r.reason]||'❌ Не удалось создать заказ.',flags:MessageFlags.Ephemeral});
    }
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle('✅ Заказ опубликован').setDescription(`${orderLine(r.order)}\n\nЗарезервировано: **${r.order.dust_reserved} Dust**.`)],flags:MessageFlags.Ephemeral});
  }
  if(sub==='fulfill'){
    const r=fulfillOrder(interaction.options.getInteger('id'),interaction.user.id,interaction.options.getInteger('quantity'));
    if(!r.ok){
      const m={closed:'❌ Заказ уже закрыт или не существует.',self:'❌ Нельзя выполнить собственный заказ.',materials:`❌ Недостаточно материала. Доступно: **${r.available||0}**.`,quantity:'❌ Неверное количество.'};
      return interaction.reply({content:m[r.reason]||'❌ Не удалось выполнить заказ.',flags:MessageFlags.Ephemeral});
    }
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0x22C55E).setTitle('🤝 Заказ выполнен').setDescription(`Передано: **${r.quantity}**\nПолучено: **${r.pay} Dust**\nОсталось в заказе: **${r.remaining}**\n\nТакже начислен опыт профессии.`)],flags:MessageFlags.Ephemeral});
  }
  const r=cancelOrder(interaction.options.getInteger('id'),interaction.user.id);
  return interaction.reply({content:r.ok?`✅ Заказ отменён. Возвращено **${r.refund} Dust**.`:'❌ Заказ не найден, не принадлежит тебе или уже закрыт.',flags:MessageFlags.Ephemeral});
 }
};
