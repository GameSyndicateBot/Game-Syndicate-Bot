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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('world').setDescription('Живой мир Game Syndicate')
    .addSubcommand(s=>s.setName('map').setDescription('Карта регионов и общий прогресс'))
    .addSubcommand(s=>s.setName('region').setDescription('Подробности региона')
      .addStringOption(o=>o.setName('name').setDescription('Регион').setRequired(true)
        .addChoices(...Object.values(WORLD_REGIONS).map(r=>({name:`${r.icon} ${r.name}`,value:r.key})))))
    .addSubcommand(s=>s.setName('contracts').setDescription('Активные серверные контракты')),

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
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${r.icon} ${r.name} — уровень ${r.stage}`).setDescription(`${r.description}\n\n🏅 **Репутация региона**\n${bar(r.reputation,r.nextThreshold)} **${r.reputation}/${r.nextThreshold}**\n\n⚠️ **Опасность:** ${stars(Math.min(5,r.danger+(r.event.danger||0)))}\n${r.event.icon} **Событие: ${r.event.name}**\n${r.event.description}\n\n📦 **Ресурсы:** ${r.resources.join(', ')}\n\n### Контракт дня\n${contractText}`).addFields({name:'Активность сообщества',value:`🗺️ Экспедиций: **${r.expeditions}**\n⚔️ Успешных: **${r.successes}**\n🌿 Материалов собрано: **${r.materials_collected}**`,inline:true})] });
    }
    const contracts = getContracts(guildId);
    const grouped = new Map();
    for (const c of contracts) { if (!grouped.has(c.region_key)) grouped.set(c.region_key,[]); grouped.get(c.region_key).push(c); }
    const text = [...grouped.entries()].map(([key,list])=>{ const r=WORLD_REGIONS[key]||{icon:'🗺️',name:key}; return `## ${r.icon} ${r.name}\n${list.map(contractLine).join('\n\n')}`; }).join('\n\n');
    return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x9333EA).setTitle('📜 Контракты мира').setDescription(text || 'Сегодня активных контрактов нет.').setFooter({text:'Прогресс общий для всего Discord-сервера и обновляется экспедициями.'})] });
  }
};
