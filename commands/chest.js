const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { CHESTS, MATERIALS } = require('../systems/hero/materialData');
const { getChests, openChest } = require('../systems/hero/materialService');

module.exports = {
  data: new SlashCommandBuilder().setName('chest').setDescription('Сундуки героя')
    .addSubcommand(s => s.setName('list').setDescription('Показать имеющиеся сундуки'))
    .addSubcommand(s => s.setName('open').setDescription('Открыть один сундук')
      .addStringOption(o => o.setName('type').setDescription('Тип сундука').setRequired(true).setAutocomplete(true))),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const owned = getChests(interaction.user.id);
    return interaction.respond(owned.filter(c => `${c.name} ${c.key}`.toLowerCase().includes(focused)).slice(0,25).map(c => ({ name:`${c.icon} ${c.name} ×${c.quantity}`, value:c.key })));
  },
  async execute(interaction) {
    const hero = getHero(interaction.user.id);
    if (!hero) return interaction.reply({ content:'❌ Сначала создай героя командой `/hero create`.', flags:MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') {
      const rows = getChests(interaction.user.id);
      const text = rows.length ? rows.map(c => `${c.icon} **${c.name}** × **${c.quantity}**\nКлюч: \`${c.key}\``).join('\n\n') : 'Сундуков пока нет. Они могут выпасть в экспедициях.';
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x8B5CF6).setTitle(`🎁 Сундуки: ${hero.name}`).setDescription(text)], flags:MessageFlags.Ephemeral });
    }
    const result = openChest(interaction.user.id, interaction.options.getString('type'));
    if (!result.ok) return interaction.reply({ content: result.reason === 'none' ? '❌ У тебя нет такого сундука.' : '❌ Не удалось открыть сундук.', flags:MessageFlags.Ephemeral });
    const r = result.rewards;
    const materialLines = r.materials.map(x => { const m=MATERIALS[x.key]; return `${m?.icon||'📦'} **${m?.name||x.key} ×${x.quantity}**`; });
    const lines = [`💠 **${r.dust} Dust**`, ...materialLines, r.item ? `⚔️ **${r.item.name}** [${r.item.rarity}]` : null].filter(Boolean);
    return interaction.reply({ embeds:[new EmbedBuilder().setColor(0xEAB308).setTitle(`${result.chest.icon} ${result.chest.name} открыт!`).setDescription(`✨ **${hero.name} получает:**\n\n${lines.join('\n')}`).setFooter({ text:'Сундук списан из инвентаря.' })] });
  },
};
