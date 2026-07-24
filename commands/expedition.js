const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { LOCATIONS } = require('../systems/hero/expeditionData');
const { getDailyLocations, getActiveExpedition, getLatestExpeditions, startExpedition, resolveExpedition, recoverHero, computeSuccessChance } = require('../systems/hero/expeditionService');

function ts(value, style = 'R') { return `<t:${Math.floor(new Date(value).getTime() / 1000)}:${style}>`; }
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
function outcomeLabel(key) { return ({ great:'🌟 Великолепный успех', success:'✅ Успех', partial:'⚠️ Частичный успех', fail:'❌ Провал' })[key] || key; }
function noHero() { return { content: '❌ Сначала создай героя командой `/hero create`.', flags: MessageFlags.Ephemeral }; }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('expedition').setDescription('Ежедневные экспедиции героя')
    .addSubcommand(s => s.setName('locations').setDescription('Показать 5 доступных сегодня локаций'))
    .addSubcommand(s => s.setName('start').setDescription('Отправить героя в экспедицию')
      .addStringOption(o => o.setName('location').setDescription('Ключ локации из /expedition locations').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s.setName('status').setDescription('Проверить состояние текущей экспедиции'))
    .addSubcommand(s => s.setName('return').setDescription('Забрать героя после окончания экспедиции'))
    .addSubcommand(s => s.setName('history').setDescription('Последние экспедиции героя')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const offered = getDailyLocations(interaction.guildId || 'dm');
    return interaction.respond(offered.filter(l => `${l.name} ${l.key}`.toLowerCase().includes(focused)).slice(0,25).map(l => ({ name: `${l.icon} ${l.name} • ${l.difficulty}/5`, value: l.key })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    let hero = getHero(interaction.user.id);
    if (!hero) return interaction.reply(noHero());
    if (hero.status === 'wounded' && recoverHero(interaction.user.id)) hero = getHero(interaction.user.id);

    if (sub === 'locations') {
      const offered = getDailyLocations(interaction.guildId || 'dm');
      const active = getActiveExpedition(interaction.user.id);
      const text = offered.map(l => {
        const chance = computeSuccessChance(hero, l);
        return `${l.icon} **${l.name}** · ${stars(l.difficulty)}\n${l.description}\n🎯 Твой шанс успеха: **${Math.round(chance)}%** · ⏳ ${l.durationHours} ч. · Ключ: \`${l.key}\``;
      }).join('\n\n');
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x7C3AED).setTitle('🗺️ Экспедиции на сегодня').setDescription(text).setFooter({ text: active ? 'Твой герой уже находится в экспедиции.' : 'Можно выбрать только одну экспедицию в день.' })], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'start') {
      const result = startExpedition(interaction.user.id, interaction.options.getString('location'), interaction.guildId || 'dm');
      const errors = { busy:'❌ Герой сейчас недоступен.', active:'❌ Герой уже находится в экспедиции.', daily_used:'❌ Сегодня ты уже отправлял героя в экспедицию.', not_offered:'❌ Эта локация сегодня недоступна. Посмотри `/expedition locations`.' };
      if (!result.ok) return interaction.reply({ content: errors[result.reason] || '❌ Не удалось начать экспедицию.', flags: MessageFlags.Ephemeral });
      let expeditionBuffs = {}; try { expeditionBuffs = JSON.parse(result.expedition.buffs_json || '{}') || {}; } catch {}
      const activeEffects = expeditionBuffs.effects?.length ? `\n\n🧪 Активировано: ${expeditionBuffs.effects.map(e => `**${e.icon} ${e.name}**`).join(', ')}` : '';
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${result.location.icon} Экспедиция началась`).setDescription(`**${hero.name}** отправился в локацию **${result.location.name}**.\n\nВернётся ${ts(result.expedition.returns_at)} (${ts(result.expedition.returns_at, 'f')}).\nПосле этого используй \`/expedition return\`.${activeEffects}`).addFields({ name:'Опасность', value:stars(result.location.difficulty), inline:true }, { name:'Ожидаемый шанс', value:`${Math.round(computeSuccessChance(hero, result.location, expeditionBuffs.bonuses || {}))}%`, inline:true })] });
    }

    if (sub === 'status') {
      const active = getActiveExpedition(interaction.user.id);
      if (!active) {
        const status = hero.status === 'wounded' ? `Герой ранен и восстановится ${ts(hero.recovery_until)}.` : 'Герой готов к новому приключению.';
        return interaction.reply({ content: `ℹ️ Активной экспедиции нет. ${status}`, flags: MessageFlags.Ephemeral });
      }
      const loc = LOCATIONS[active.location_key];
      const ready = Date.now() >= new Date(active.returns_at).getTime();
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(ready ? 0x22C55E : 0x7C3AED).setTitle(`${loc.icon} ${loc.name}`).setDescription(ready ? '✅ Герой уже вернулся. Используй `/expedition return`, чтобы получить результат.' : `⏳ Герой ещё в пути и вернётся ${ts(active.returns_at)}.`)] , flags: MessageFlags.Ephemeral });
    }

    if (sub === 'return') {
      const result = resolveExpedition(interaction.user.id);
      if (!result.ok) {
        if (result.reason === 'not_ready') return interaction.reply({ content:`⏳ Экспедиция ещё не завершена. Возвращение ${ts(result.expedition.returns_at)}.`, flags:MessageFlags.Ephemeral });
        return interaction.reply({ content:'❌ У тебя нет завершённой активной экспедиции.', flags:MessageFlags.Ephemeral });
      }
      const r = result.result;
      const materialText = Array.isArray(r.materials) && r.materials.length ? r.materials.map(m => `${m.icon || '📦'} **${m.name} ×${m.quantity}**`).join('\n') : null;
      const alchemyText = Array.isArray(r.alchemy) && r.alchemy.length ? `🧪 **Сработало:** ${r.alchemy.map(e => `${e.icon} ${e.name}`).join(', ')}` : null;
      const rewards = [`✨ **+${r.xp} XP**`, r.dust ? `💠 **+${r.dust} Dust**` : null, r.dustLost ? `💠 **−${r.dustLost} Dust**` : null, `🏅 **+${r.reputation} репутации**`, r.item ? `🎁 **${r.item.name}** [${r.item.rarity}]` : null, materialText, r.chest ? `${r.chest.icon || '📦'} **${r.chest.name}**` : null, alchemyText, r.levelsGained ? `⬆️ Новый уровень героя!` : null, r.injuryHours ? `🩹 Ранение: восстановление ${r.injuryHours} ч.` : null].filter(Boolean).join('\n');
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(r.outcome==='fail'?0xEF4444:r.outcome==='partial'?0xF59E0B:r.outcome==='great'?0xEAB308:0x22C55E).setTitle(`${result.location.icon} ${outcomeLabel(r.outcome)}`).setDescription(`${r.event}\n\n${rewards}`).addFields({name:'Расчёт',value:`Шанс: ${r.chance}% · Бросок: ${r.roll}`,inline:true},{name:'Локация',value:result.location.name,inline:true}).setFooter({text:'Исход зависит от уровня, характеристик, происхождения, сложности и небольшого случайного фактора.'})] });
    }

    if (sub === 'history') {
      const rows = getLatestExpeditions(interaction.user.id, 8);
      const text = rows.length ? rows.map(e => { const loc=LOCATIONS[e.location_key]; let result='В пути'; try { const r=JSON.parse(e.result_json||'null'); if(r) result=outcomeLabel(r.outcome); } catch(_){} return `${loc?.icon||'🗺️'} **${loc?.name||e.location_key}** — ${result}\n${ts(e.started_at,'d')}`; }).join('\n\n') : 'Герой ещё не участвовал в экспедициях.';
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x9333EA).setTitle(`📜 Экспедиции: ${hero.name}`).setDescription(text)], flags:MessageFlags.Ephemeral });
    }
  },
};
