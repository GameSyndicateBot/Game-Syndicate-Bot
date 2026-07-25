const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { ITEMS } = require('../systems/hero/itemData');
const { getHero } = require('../systems/hero/heroService');
const { createOrder,listOpenOrders,listMyOrders,fulfillOrder,cancelOrder } = require('../systems/hero/orderBoardService');

const ITEM_CHOICES=[{name:'Лесные травы',value:'forest_herbs'},{name:'Пряные травы',value:'culinary_herbs'},{name:'Лунный цветок',value:'moon_blossom'},{name:'Железная руда',value:'iron_ore'},{name:'Самоцвет',value:'gemstone'},{name:'Древний фрагмент',value:'ancient_fragment'},{name:'Твёрдая древесина',value:'hardwood'},{name:'Лесные ягоды',value:'wild_berries'},{name:'Лесные грибы',value:'forest_mushrooms'},{name:'Древняя древесина',value:'ancient_wood'},{name:'Свежая рыба',value:'fresh_fish'},{name:'Морепродукты',value:'shellfish'},{name:'Лунный карп',value:'moon_carp'},{name:'Жемчуг',value:'pearl'},{name:'Сырое мясо',value:'raw_meat'},{name:'Шкура зверя',value:'beast_hide'},{name:'Кость зверя',value:'beast_bone'},{name:'Сердце зверя',value:'beast_heart'}];
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
  .addSubcommand(s=>s.setName('mine').setDescription('Показать мои заказы'))
  .addSubcommand(s=>s.setName('cancel').setDescription('Отменить свой заказ и вернуть остаток Dust')
    .addIntegerOption(o=>o.setName('id').setDescription('ID заказа').setRequired(true).setMinValue(1))),
 async execute(interaction){
  if(!getHero(interaction.user.id))return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const sub=interaction.options.getSubcommand();
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
