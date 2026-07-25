const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getConsumables, useConsumable } = require('../systems/hero/alchemyService');

module.exports = {
  data: new SlashCommandBuilder().setName('use').setDescription('Использовать RPG-расходник')
    .addStringOption(o => o.setName('item').setDescription('Зелье, еда или свиток').setRequired(true).setAutocomplete(true))
    .addUserOption(o => o.setName('target').setDescription('Герой, на которого применить предмет')),
  async autocomplete(interaction) {
    const q = interaction.options.getFocused().toLowerCase();
    const rows = getConsumables(interaction.user.id).filter(i => `${i.name} ${i.item_key}`.toLowerCase().includes(q)).slice(0, 25);
    return interaction.respond(rows.map(i => ({ name: `${i.effect.icon} ${i.name} ×${i.quantity}${i.effect.allyAllowed ? ' · можно союзнику' : ''}`, value: i.item_key })));
  },
  async execute(interaction) {
    const key = interaction.options.getString('item');
    const target = interaction.options.getUser('target') || interaction.user;
    if (target.bot) return interaction.reply({ content: '❌ Нельзя применять расходники на ботов.', flags: MessageFlags.Ephemeral });
    const result = useConsumable(interaction.user.id, key, target.id);
    if (!result.ok) {
      const texts = {
        no_hero:'❌ Сначала создай героя.', target_no_hero:'❌ У выбранного участника нет героя.', none:'❌ Этого расходника нет в инвентаре.',
        full_hp:'❤️ У выбранного героя уже полное здоровье — предмет не потрачен.', already_active:'✨ Такой эффект уже активен.',
        not_shareable:'❌ Этот расходник можно использовать только на своём герое.', conflicting_active:`❌ Уже действует несовместимый эффект: **${result.conflicting || 'другой эффект'}**.`,
      };
      return interaction.reply({ content: texts[result.reason] || '❌ Этот предмет пока нельзя использовать.', flags: MessageFlags.Ephemeral });
    }
    const effect = result.effect;
    const targetText = target.id === interaction.user.id ? 'на своём герое' : `на герое ${target}`;
    const detail = effect.kind === 'instant'
      ? `Восстановлено **${result.result.healed} HP**. Сейчас: **${result.result.hp}/${result.result.maxHp} HP**.`
      : `Эффект активирован ${effect.context === 'world_boss' ? 'на следующий бой с World Boss' : 'на следующую экспедицию'}.`;
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22C55E).setTitle(`${effect.icon} ${effect.name} использован`).setDescription(`Предмет применён ${targetText}.\n\n${effect.description}\n\n${detail}`).setFooter({ text: 'Активные эффекты можно проверить через /potions' })] });
  },
};
