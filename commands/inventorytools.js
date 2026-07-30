'use strict';
const {SlashCommandBuilder,MessageFlags}=require('discord.js');
const {dismantle,giftMaterial,giftItem,equipArtifact,unequipArtifact}=require('../systems/hero/playerCorrectionService');
module.exports={
 data:new SlashCommandBuilder().setName('inventorytools').setDescription('Разбор, подарки и артефакты')
  .addSubcommand(s=>s.setName('dismantle').setDescription('Разобрать экипировку на материалы').addIntegerOption(o=>o.setName('inventory_id').setDescription('ID предмета').setRequired(true)))
  .addSubcommand(s=>s.setName('gift-material').setDescription('Подарить материал').addUserOption(o=>o.setName('user').setDescription('Получатель').setRequired(true)).addStringOption(o=>o.setName('material').setDescription('Ключ материала').setRequired(true)).addIntegerOption(o=>o.setName('quantity').setDescription('Количество').setMinValue(1).setRequired(true)))
  .addSubcommand(s=>s.setName('gift-item').setDescription('Подарить предмет').addUserOption(o=>o.setName('user').setDescription('Получатель').setRequired(true)).addIntegerOption(o=>o.setName('inventory_id').setDescription('ID предмета').setRequired(true)).addIntegerOption(o=>o.setName('quantity').setDescription('Количество').setMinValue(1)))
  .addSubcommand(s=>s.setName('artifact-equip').setDescription('Надеть артефакт').addIntegerOption(o=>o.setName('inventory_id').setDescription('ID артефакта').setRequired(true)).addIntegerOption(o=>o.setName('slot').setDescription('Слот 1 или 2').setMinValue(1).setMaxValue(2)))
  .addSubcommand(s=>s.setName('artifact-remove').setDescription('Снять артефакт').addIntegerOption(o=>o.setName('slot').setDescription('Слот 1 или 2').setMinValue(1).setMaxValue(2).setRequired(true))),
 async execute(i){const s=i.options.getSubcommand();let r;
  if(s==='dismantle'){r=dismantle(i.user.id,i.options.getInteger('inventory_id'));return i.reply({content:r.ok?`♻️ **${r.item.name}** разобран. Получено: **${r.name} ×${r.qty}**.`:'❌ Не удалось разобрать: предмет не найден, не является экипировкой или сейчас надет.',flags:MessageFlags.Ephemeral});}
  if(s==='gift-material'){r=giftMaterial(i.user.id,i.options.getUser('user').id,i.options.getString('material'),i.options.getInteger('quantity'));return i.reply({content:r.ok?`🎁 Передано <@${i.options.getUser('user').id}>: **${r.name} ×${r.qty}**.`:'❌ Недостаточно материала.',flags:MessageFlags.Ephemeral});}
  if(s==='gift-item'){r=giftItem(i.user.id,i.options.getUser('user').id,i.options.getInteger('inventory_id'),i.options.getInteger('quantity')||1);return i.reply({content:r.ok?`🎁 Передано <@${i.options.getUser('user').id}>: **${r.row.name} ×${r.qty}**.`:'❌ Не удалось передать предмет. Сначала сними его, если он экипирован.',flags:MessageFlags.Ephemeral});}
  if(s==='artifact-equip'){r=equipArtifact(i.user.id,i.options.getInteger('inventory_id'),i.options.getInteger('slot')||1);return i.reply({content:r.ok?`💍 **${r.row.name}** надет в слот ${r.slot}.`:'❌ Артефакт не найден.',flags:MessageFlags.Ephemeral});}
  r=unequipArtifact(i.user.id,i.options.getInteger('slot'));return i.reply({content:r.ok?'📤 Артефакт снят.':'ℹ️ Этот слот уже пуст.',flags:MessageFlags.Ephemeral});
 }};
