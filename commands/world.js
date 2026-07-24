const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { WORLD_REGIONS } = require('../systems/world/worldData');
const { getWorld, getRegion, getContracts, getWorldProgress } = require('../systems/world/worldService');

function bar(value, max, size=12) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value/max)) : 0;
  const filled = Math.round(ratio*size);
  return `${'█'.repeat(filled)}${'░'.repeat(size-filled)}`;
}
function stars(n) { return `${'★'.repeat(Math.max(0,n))}${'☆'.repeat(Math.max(0,5-n))}`; }
function contractLine(c) {
  const done = c.completed ? '✅' : c.icon;
  return `${done} **${c.title}**\n${bar(c.progress,c.target,10)} **${c.progress}/${c.target}**\n🎁 ${c.reward_text}`;
}
function buffLine(b) {
  const left = Math.max(0, new Date(b.expires_at).getTime()-Date.now());
  const hours = Math.max(1, Math.ceil(left/3600000));
  return `✨ ${b.description} · ещё ~${hours} ч.`;
}
function effectSummary(r) {
  const e=r.event; const parts=[];
  if (e.success) parts.push(`шанс ${e.success>0?'+':''}${e.success}%`);
  if (e.xp && e.xp!==1) parts.push(`XP ×${e.xp.toFixed(2)}`);
  if (e.dust && e.dust!==1) parts.push(`Dust ×${e.dust.toFixed(2)}`);
  if (e.materials && e.materials!==1) parts.push(`материалы ×${e.materials.toFixed(2)}`);
  if (e.rare) parts.push(`редкая находка +${e.rare}%`);
  return parts.join(' · ') || 'без дополнительных модификаторов';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('world').setDescription('Живой мир Game Syndicate')
    .addSubcommand(s=>s.setName('map').setDescription('Карта регионов и общий прогресс'))
    .addSubcommand(s=>s.setName('region').setDescription('Подробности региона')
      .addStringOption(o=>o.setName('name').setDescription('Регион').setRequired(true)
        .addChoices(...Object.values(WORLD_REGIONS).map(r=>({name:`${r.icon} ${r.name}`,value:r.key})))))
    .addSubcommand(s=>s.setName('contracts').setDescription('Активные серверные контракты'))
    .addSubcommand(s=>s.setName('events').setDescription('События и активные бонусы регионов')),

  async execute(interaction) {
    const guildId = interaction.guildId || 'global';
    const sub = interaction.options.getSubcommand();
    if (sub === 'map') {
      const world = getWorld(guildId);
      const progress = getWorldProgress(guildId);
      const lines = world.map(r => {
        if (!r.discovered) return `${r.icon} **${r.name}** — 🔒 не исследовано`;
        return `${r.icon} **${r.name}** · Ур. ${r.stage}\n${stars(Math.min(5,r.danger+(r.event.danger||0)))} · 🏅 ${r.reputation}/${r.nextThreshold}\n${r.event.icon} ${r.event.name}`;
      });
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle('🌍 Мир Game Syndicate').setDescription(`${lines.join('\n\n')}\n\n🌐 **Исследовано:** ${progress.percent}% · ${progress.discovered}/${progress.totalRegions} регионов\n🏅 **Общая репутация:** ${progress.total}`).setFooter({text:'Экспедиции всех участников меняют общий мир сервера.'})] });
    }
    if (sub === 'region') {
      const key = interaction.options.getString('name');
      const r = getRegion(guildId,key);
      if (!r) return interaction.reply({content:'❌ Регион не найден.',flags:MessageFlags.Ephemeral});
      if (!r.discovered) return interaction.reply({content:`🔒 **${r.name}** ещё не исследован сообществом.`,flags:MessageFlags.Ephemeral});
      const contracts = getContracts(guildId,key);
      const contractText = contracts.length ? contracts.map(contractLine).join('\n\n') : 'Сегодня контрактов нет.';
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${r.icon} ${r.name} — уровень ${r.stage}`).setDescription(`${r.description}\n\n🏅 **Репутация региона**\n${bar(r.reputation,r.nextThreshold)} **${r.reputation}/${r.nextThreshold}**\n\n⚠️ **Опасность:** ${stars(Math.min(5,r.danger+(r.event.danger||0)))}\n${r.event.icon} **Событие: ${r.event.name}**\n${r.event.description}\n📊 ${effectSummary(r)}\n${r.buffs.length ? `\n**Активные награды сообщества**\n${r.buffs.map(buffLine).join('\n')}\n` : ''}\n📦 **Ресурсы:** ${r.resources.join(', ')}\n\n### Контракт дня\n${contractText}`).addFields({name:'Активность сообщества',value:`🗺️ Экспедиций: **${r.expeditions}**\n⚔️ Успешных: **${r.successes}**\n🌿 Материалов собрано: **${r.materials_collected}**`,inline:true})] });
    }
    if (sub === 'events') {
      const world = getWorld(guildId).filter(r => r.discovered);
      const text = world.map(r => {
        const buffs = r.buffs.length ? `
${r.buffs.map(buffLine).join('\n')}` : '';
        return `${r.icon} **${r.name}**
${r.event.icon} ${r.event.name} — ${effectSummary(r)}${buffs}`;
      }).join('\n\n');
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(0xA855F7).setTitle('🌦️ События живого мира').setDescription(text || 'Нет открытых регионов.').setFooter({text:'События меняются ежедневно, награды контрактов действуют 24 часа.'})] });
    }
    const contracts = getContracts(guildId);
    const grouped = new Map();
    for (const c of contracts) { if (!grouped.has(c.region_key)) grouped.set(c.region_key,[]); grouped.get(c.region_key).push(c); }
    const text = [...grouped.entries()].map(([key,list])=>{ const r=WORLD_REGIONS[key]||{icon:'🗺️',name:key}; return `## ${r.icon} ${r.name}\n${list.map(contractLine).join('\n\n')}`; }).join('\n\n');
    return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x9333EA).setTitle('📜 Контракты мира').setDescription(text || 'Сегодня активных контрактов нет.').setFooter({text:'Прогресс общий для всего Discord-сервера и обновляется экспедициями.'})] });
  }
};
