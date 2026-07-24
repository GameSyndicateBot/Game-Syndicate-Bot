const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getConsumables, useConsumable } = require('../systems/hero/alchemyService');

module.exports = {
  data: new SlashCommandBuilder().setName('use').setDescription('Использовать RPG-расходник')
    .addStringOption(o => o.setName('item').setDescription('Зелье, свиток или реагент').setRequired(true).setAutocomplete(true)),
  async autocomplete(interaction) {
    const q = interaction.options.getFocused().toLowerCase();
    const rows = getConsumables(interaction.user.id).filter(i => `${i.name} ${i.item_key}`.toLowerCase().includes(q)).slice(0, 25);
    return interaction.respond(rows.map(i => ({ name: `${i.effect.icon} ${i.name} ×${i.quantity}`, value: i.item_key })));
  },
  async execute(interaction) {
    const key = interaction.options.getString('item');
    const result = useConsumable(interaction.user.id, key);
    if (!result.ok) {
      const text = result.reason === 'no_hero' ? '❌ Сначала создай героя.' : result.reason === 'none' ? '❌ Этого расходника нет в инвентаре.' : result.reason === 'full_hp' ? '❤️ У героя уже полное здоровье — зелье не потрачено.' : result.reason === 'already_active' ? '✨ Такой эффект уже активен. Сначала израсходуй его в соответствующей активности.' : '❌ Этот предмет пока нельзя использовать.';
      return interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    }
    const effect = result.effect;
    const detail = effect.kind === 'instant'
      ? `Восстановлено **${result.result.healed} HP**. Сейчас: **${result.result.hp}/${result.result.maxHp} HP**.`
      : `Эффект активирован на ${effect.context === 'world_boss' ? 'следующий бой с World Boss' : 'следующую экспедицию'}.`;
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle(`${effect.icon} ${effect.name} использован`).setDescription(`${effect.description}\n\n${detail}`).setFooter({ text: 'Активные эффекты можно проверить через /potions' })] });
  },
};
