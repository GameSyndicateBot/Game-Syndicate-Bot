const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getRoundView, buyTicket, history, TICKET_PRICE } = require('../services/weeklyLottery');
const { createLotteryHubCard } = require('../images/lottery/createLotteryHubCard');

function displayName(interaction){return interaction.member?.displayName || interaction.user.globalName || interaction.user.username;}
function rows(view){
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lottery:buy').setLabel(view.own?'Билет приобретён':'Купить билет').setEmoji(view.own?'✅':'🎟️').setStyle(view.own?ButtonStyle.Secondary:ButtonStyle.Success).setDisabled(Boolean(view.own)),
    new ButtonBuilder().setCustomId('lottery:refresh').setLabel('Обновить').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lottery:history').setLabel('История победителей').setEmoji('📜').setStyle(ButtonStyle.Secondary)
  )];
}
async function render(interaction, notice=''){
  const view=getRoundView(interaction.guildId,interaction.user.id);
  const card=await createLotteryHubCard({prizePool:view.round.prize_pool,tickets:view.tickets});
  const unix=Math.floor(Number(view.round.draw_at)/1000);
  const content=[notice,`🎟️ **Ваш статус:** ${view.own?`билет **№${view.own.ticket_number}** приобретён`:`билет не куплен · баланс **${view.balance} Пыли**`}`,`📅 Розыгрыш: <t:${unix}:F> · <t:${unix}:R>`].filter(Boolean).join('\n');
  const payload={content,files:[new AttachmentBuilder(card,{name:'weekly-lottery.png'})],components:rows(view)};
  if(interaction.deferred||interaction.replied)return interaction.editReply(payload);
  return interaction.reply({...payload,flags:MessageFlags.Ephemeral});
}
async function showHistory(interaction){
  const items=history(interaction.guildId,10);
  const text=items.length?items.map((r,i)=>`${i+1}. 🏆 **${r.winner_display_name||'Неизвестный игрок'}** — **${Number(r.prize_pool).toLocaleString('ru-RU')} Пыли**\nБилет №${r.winning_ticket} · участников: ${r.participant_count} · ${r.closed_at}`).join('\n\n'):'История победителей пока пуста.';
  const embed=new EmbedBuilder().setColor(0x7c3aed).setTitle('📜 История победителей лотереи').setDescription(text.slice(0,4000));
  return interaction.update({content:'',embeds:[embed],files:[],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('lottery:back').setLabel('Вернуться в лотерею').setEmoji('🎟️').setStyle(ButtonStyle.Primary))]});
}
module.exports={
 data:new SlashCommandBuilder().setName('lottery').setDescription('Открыть личный хаб еженедельной лотереи'),
 async execute(interaction){await interaction.deferReply({flags:MessageFlags.Ephemeral});return render(interaction);},
 async handleComponent(interaction){
  if(!interaction.guildId)return interaction.reply({content:'Лотерея доступна только на сервере.',flags:MessageFlags.Ephemeral});
  if(interaction.customId==='lottery:history')return showHistory(interaction);
  if(interaction.customId==='lottery:buy'){
    await interaction.deferUpdate();
    const result=buyTicket({guildId:interaction.guildId,userId:interaction.user.id,displayName:displayName(interaction)});
    const msg=result.ok?`✅ Билет **№${result.ticketNumber}** куплен за **${TICKET_PRICE} Пыли**. Призовой фонд теперь **${result.round.prize_pool} Пыли**.`:result.reason==='already'?'ℹ️ У вас уже есть билет на эту неделю.':result.reason==='dust'?`❌ Недостаточно Пыли. Нужно **${TICKET_PRICE}**, баланс **${result.balance}**.`:'⏳ Розыгрыш уже начинается. Обновите хаб.';
    return render(interaction,msg);
  }
  if(interaction.customId==='lottery:refresh'||interaction.customId==='lottery:back'){await interaction.deferUpdate();return render(interaction,'🔄 Данные обновлены.');}
 }
};
