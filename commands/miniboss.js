const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getMinibossOverview } = require('../systems/world/minibossService');
const { REGION_MINIBOSSES } = require('../systems/world/minibossData');
const { WORLD_REGIONS } = require('../systems/world/worldData');

function bossChoices(){ return Object.values(REGION_MINIBOSSES).map(b=>({name:`${b.icon} ${b.name}`,value:b.key})); }
function fmtDate(value){ return value ? `<t:${Math.floor(new Date(value).getTime()/1000)}:d>` : '—'; }

module.exports={
  data:new SlashCommandBuilder()
    .setName('miniboss').setDescription('Региональные мини-боссы и охотничьи рейтинги')
    .addSubcommand(s=>s.setName('overview').setDescription('Показать всех региональных мини-боссов'))
    .addSubcommand(s=>s.setName('leaderboard').setDescription('Рейтинг убийц выбранного мини-босса')
      .addStringOption(o=>o.setName('boss').setDescription('Мини-босс').setRequired(true).addChoices(...bossChoices()))),
  async execute(interaction){
    const guildId=interaction.guildId||'global';
    const sub=interaction.options.getSubcommand();
    const overview=getMinibossOverview(guildId,interaction.user.id);
    if(sub==='overview'){
      const text=overview.map(x=>{
        const b=x.boss, region=WORLD_REGIONS[b.region];
        const mine=x.mine||{};
        return `${b.icon} **${b.name}** · ${region?.icon||'🗺️'} ${region?.name||b.region}\n`+
          `Побед сервера: **${x.total}** · Твои: **${mine.wins||0}** · Поражения: **${mine.losses||0}**\n`+
          `Первый убийца: ${x.first?`<@${x.first.user_id}> (${fmtDate(x.first.killed_at)})`:'ещё не найден'}`;
      }).join('\n\n');
      return interaction.reply({embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle('👑 Региональные мини-боссы').setDescription(`${text}\n\nМини-боссы встречаются редко и автоматически во время четырёхчасовых экспедиций. Осторожная тактика снижает шанс встречи, но не исключает её.`)],flags:MessageFlags.Ephemeral});
    }
    const key=interaction.options.getString('boss');
    const row=overview.find(x=>x.boss.key===key);
    if(!row) return interaction.reply({content:'❌ Мини-босс не найден.',flags:MessageFlags.Ephemeral});
    const {db}=require('../database/db');
    const leaders=db.prepare(`SELECT user_id,wins,losses,escapes,best_score FROM player_miniboss_stats WHERE guild_id=? AND boss_key=? ORDER BY wins DESC,best_score DESC LIMIT 10`).all(guildId,key);
    const board=leaders.length?leaders.map((x,i)=>`${i+1}. <@${x.user_id}> — **${x.wins} побед** · лучший результат ${x.best_score}`).join('\n'):'Пока никто не встречал этого противника.';
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0xDC2626).setTitle(`${row.boss.icon} ${row.boss.name}`).setDescription(`${row.boss.title}\n\n**Первый убийца:** ${row.first?`<@${row.first.user_id}> (${fmtDate(row.first.killed_at)})`:'ещё не найден'}\n**Всего побед:** ${row.total}\n\n🏆 **Рейтинг**\n${board}`)],flags:MessageFlags.Ephemeral});
  }
};
