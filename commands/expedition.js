const { SlashCommandBuilder, EmbedBuilder, MessageFlags, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getHero } = require('../systems/hero/heroService');
const { LOCATIONS } = require('../systems/hero/expeditionData');
const { getDailyWorld, getDailyLocations, getActiveExpedition, getLatestExpeditions, startExpedition, resolveExpedition, recoverHero, computeSuccessChance, nextBossAt, expeditionWindow, getWorldStats, getWorldActivity, EXPEDITION_TACTICS, getExpeditionTactic } = require('../systems/hero/expeditionService');
const { createExpeditionHubCard } = require('../images/hero/createExpeditionHubCard');
const { HERO_CLASSES } = require('../systems/hero/heroData');
const { getAllClassProgress, getClassProgress, normalizeClassKey } = require('../systems/hero/classProgressService');

function ts(value, style = 'R') { return `<t:${Math.floor(new Date(value).getTime() / 1000)}:${style}>`; }
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
function outcomeLabel(key) { return ({ great:'🌟 Великолепный успех', success:'✅ Успех', partial:'⚠️ Частичный успех', fail:'❌ Провал' })[key] || key; }
function noHero() { return { content: '❌ Сначала создай героя в постоянном **Guild Hub**.', flags: MessageFlags.Ephemeral }; }


const EXPEDITION_CHANNEL_ID = '1529566430301782017';
const HUB_MARKER = '🗺️ **EXPEDITION HUB • GAME SYNDICATE**';
let lastAutoHubSignature = null;
let lastHubMessageId = null;

function hubRows(world, locked) {
  const buttons = world.locations.slice(0, 3).map((location, index) =>
    new ButtonBuilder()
      .setCustomId(`expedition:start:${location.key}`)
      .setLabel(location.name)
      .setStyle(index === 0 ? ButtonStyle.Success : index === 1 ? ButtonStyle.Primary : ButtonStyle.Danger)
      .setDisabled(locked)
  );
  return [
    new ActionRowBuilder().addComponents(...buttons),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('expedition:status').setLabel('Моя экспедиция').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('expedition:return').setLabel('Забрать результат').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('expedition:history').setLabel('История').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('expedition:refresh').setLabel('Обновить хаб').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function bossLabel(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date) + ' МСК';
}

async function hubPayload(guildId = 'global') {
  const world = getDailyWorld(guildId);
  const window = expeditionWindow();
  const boss = nextBossAt();
  const stats=getWorldStats(guildId); const activity=getWorldActivity(guildId,5);
  const buffer = await createExpeditionHubCard({ world, nextBossLabel: bossLabel(boss), locked: !window.fits, stats, activity });
  return {
    content: `${HUB_MARKER}\nВыбери одну из трёх локаций. Поход длится **4 часа**. Личные результаты открываются только тебе. В каталоге **${world.totalCatalog || Object.keys(LOCATIONS).length} локаций** с редкостью и особыми условиями появления.`,
    files: [new AttachmentBuilder(buffer, { name: 'gs-expedition-hub.png' })],
    components: hubRows(world, !window.fits),
  };
}

async function ensureExpeditionHub(client) {
  try {
    const channel = await client.channels.fetch(EXPEDITION_CHANNEL_ID);
    if (!channel?.isTextBased()) return null;
    const recent = await channel.messages.fetch({ limit: 50 });
    const existing = recent.find(m => m.author.id === client.user.id && m.content.startsWith(HUB_MARKER));
    const payload = await hubPayload(channel.guildId || 'global');
    if (existing) {
      await existing.edit(payload);
      lastHubMessageId = existing.id;
      return existing;
    }
    const created = await channel.send(payload);
    lastHubMessageId = created.id;
    return created;
  } catch (error) {
    console.error('[Expedition Hub] Не удалось создать/обновить панель:', error);
    return null;
  }
}

function currentHubSignature(guildId = 'global') {
  const world = getDailyWorld(guildId);
  const window = expeditionWindow();
  const stats=getWorldStats(guildId); const activity=getWorldActivity(guildId,1);
  return `${world.dateKey || ''}|${world.weather?.name || ''}|${world.locations.map(l => l.key).join(',')}|${window.fits ? 'open' : 'locked'}|${bossLabel(nextBossAt())}|${stats.active}|${stats.completed}|${activity[0]?.id||0}`;
}

async function refreshExpeditionHubIfNeeded(client) {
  const channel = await client.channels.fetch(EXPEDITION_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return null;
  const signature = currentHubSignature(channel.guildId || 'global');
  if (signature === lastAutoHubSignature && lastHubMessageId) {
    const existing = await channel.messages.fetch(lastHubMessageId).catch(() => null);
    if (existing) return null;
  }
  const message = await ensureExpeditionHub(client);
  if (message) lastAutoHubSignature = signature;
  return message;
}

async function handleComponent(interaction) {
  if (interaction.channelId !== EXPEDITION_CHANNEL_ID) {
    return interaction.reply({ content: `Панель экспедиций доступна только в канале <#${EXPEDITION_CHANNEL_ID}>.`, flags: MessageFlags.Ephemeral });
  }

  const parts = interaction.customId.split(':');
  const action = parts[1];
  let hero = getHero(interaction.user.id);
  if (!hero) return interaction.reply(noHero());
  if (hero.status === 'wounded' && recoverHero(interaction.user.id)) hero = getHero(interaction.user.id);

  if (action === 'refresh') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await ensureExpeditionHub(interaction.client);
    return interaction.editReply(message ? '✅ Expedition Hub обновлён.' : '❌ Не удалось обновить хаб.');
  }

  if (action === 'start') {
    const locationKey = parts[2];
    const location = LOCATIONS[locationKey];
    const progress = getAllClassProgress(interaction.user.id);
    const menu = new StringSelectMenuBuilder().setCustomId(`expedition:class:${locationKey}`).setPlaceholder('Выбери класс для этой экспедиции')
      .addOptions(progress.map(row => { const c=HERO_CLASSES[row.class_key]; return { label:`${c.name} • Lv.${row.level}`, value:row.class_key, emoji:c.icon, description:`Опыт ${row.xp} • прокачивается только выбранный класс` }; }));
    return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle(`${location?.icon||'🗺️'} Кто отправится в экспедицию?`).setDescription(`Локация: **${location?.name||locationKey}**

Можно выбрать любой класс. После возвращения опыт получит именно он.`)], components:[new ActionRowBuilder().addComponents(menu)], flags:MessageFlags.Ephemeral });
  }

  if (action === 'class') {
    const locationKey=parts[2];
    const classKey=normalizeClassKey(interaction.values?.[0]);
    const tacticMenu = new StringSelectMenuBuilder().setCustomId(`expedition:tactic:${locationKey}:${classKey}`).setPlaceholder('Выбери тактику героя')
      .addOptions(Object.values(EXPEDITION_TACTICS).map(t => ({ label:t.name, value:t.key, emoji:t.icon, description:t.description.slice(0,100) })));
    return interaction.update({ embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle('🎯 Тактика экспедиции').setDescription(`Класс: **${HERO_CLASSES[classKey]?.icon || ''} ${HERO_CLASSES[classKey]?.name || classKey}**

Тактика меняет вероятности, но ничего не гарантирует. Даже осторожный герой может попасть в засаду и вернуться раненым.`)], components:[new ActionRowBuilder().addComponents(tacticMenu)] });
  }

  if (action === 'tactic') {
    const locationKey=parts[2];
    const classKey=normalizeClassKey(parts[3]);
    const tacticKey=interaction.values?.[0] || 'balanced';
    const tactic=getExpeditionTactic(tacticKey);
    const result = startExpedition(interaction.user.id, locationKey, interaction.guildId || 'global', classKey, tacticKey);
    const errors = {
      busy: '❌ Герой сейчас недоступен.', active: '❌ Герой уже находится в экспедиции.',
      boss_active: '❌ Сейчас идёт регистрация или бой с World Boss.',
      boss_window: `❌ До World Boss осталось менее 4 часов. Герой не успеет вернуться к бою ${result.nextBossAt ? ts(result.nextBossAt) : ''}.`,
      not_offered: '❌ Эта локация сегодня уже недоступна. Обнови хаб.',
    };
    if (!result.ok) return interaction.reply({ content: errors[result.reason] || '❌ Не удалось начать экспедицию.', flags: MessageFlags.Ephemeral });
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${result.location.icon} Экспедиция началась`)
        .setDescription(`**${hero.name}** отправился в **${result.location.name}** как **${HERO_CLASSES[result.expedition.class_key]?.icon || ''} ${HERO_CLASSES[result.expedition.class_key]?.name || result.expedition.class_key}**.\n🎯 Тактика: **${tactic.icon} ${tactic.name}**\n\nВозвращение ${ts(result.expedition.returns_at)}. После этого нажми **«Забрать результат»**.`)
        .addFields({ name: 'Опасность', value: stars(result.location.difficulty), inline: true }, { name: 'Шанс успеха', value: `${Math.round(computeSuccessChance(hero, result.location, {}, tactic.key))}%`, inline: true })],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'status') {
    const active = getActiveExpedition(interaction.user.id);
    if (!active) return interaction.reply({ content: 'ℹ️ Активной экспедиции нет. Герой свободен.', flags: MessageFlags.Ephemeral });
    const loc = LOCATIONS[active.location_key];
    const tactic = getExpeditionTactic(active.tactic_key);
    const ready = Date.now() >= new Date(active.returns_at).getTime();
    return interaction.reply({ content: ready ? `✅ **${hero.name}** вернулся из локации **${loc?.name || active.location_key}**. Нажми **«Забрать результат»**.` : `⏳ **${hero.name}** исследует **${loc?.name || active.location_key}** и вернётся ${ts(active.returns_at)}.\n🎯 Тактика: **${tactic.icon} ${tactic.name}**`, flags: MessageFlags.Ephemeral });
  }

  if (action === 'return') {
    const result = resolveExpedition(interaction.user.id);
    if (!result.ok) {
      const text = result.reason === 'not_ready' ? `⏳ Герой ещё в пути. Возвращение ${ts(result.expedition.returns_at)}.` : '❌ Завершённой экспедиции пока нет.';
      return interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    }
    const r = result.result;
    const rewards = [`✨ **+${r.xp} XP героя**`, r.classXp ? `${HERO_CLASSES[r.classKey]?.icon || '📚'} **+${r.classXp} XP класса ${HERO_CLASSES[r.classKey]?.name || r.classKey}** → Lv.${r.classLevel}` : null, r.dust ? `💠 **+${r.dust} Dust**` : null, `🏅 **+${r.reputation} репутации**`, r.item ? `🎁 **${r.item.name}** [${r.item.rarity}]` : null, r.companion ? `🐾 **Новый питомец: ${r.companion.name}**` : null, r.injuryHours ? `🩹 Ранение на ${r.injuryHours} ч.` : null].filter(Boolean).join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(r.outcome === 'fail' ? 0xEF4444 : r.outcome === 'partial' ? 0xF59E0B : 0x22C55E).setTitle(`${result.location.icon} ${outcomeLabel(r.outcome)}`).setDescription(`${r.event}\n\n🎯 **Тактика:** ${r.tactic?.icon || '⚖️'} ${r.tactic?.name || 'Сбалансированно'}\n\n${rewards}`)], flags: MessageFlags.Ephemeral });
  }

  if (action === 'history') {
    const rows = getLatestExpeditions(interaction.user.id, 8);
    const text = rows.length ? rows.map(e => { const loc = LOCATIONS[e.location_key]; let result = 'В пути'; try { const r = JSON.parse(e.result_json || 'null'); if (r) result = outcomeLabel(r.outcome); } catch {} return `${loc?.icon || '🗺️'} **${loc?.name || e.location_key}** • ${HERO_CLASSES[normalizeClassKey(e.class_key)]?.name || 'Класс'} — ${result}\n${ts(e.started_at, 'd')}`; }).join('\n\n') : 'Герой ещё не участвовал в экспедициях.';
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x9333EA).setTitle(`📜 Экспедиции: ${hero.name}`).setDescription(text)], flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('expedition').setDescription('Экспедиции героя между боями с мировым боссом')
    .addSubcommand(s => s.setName('locations').setDescription('Показать 3 доступные сегодня локации'))
    .addSubcommand(s => s.setName('start').setDescription('Отправить героя в экспедицию')
      .addStringOption(o => o.setName('location').setDescription('Ключ локации из /expedition locations').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('class').setDescription('Класс, который получит опыт').setRequired(true)
        .addChoices(...Object.entries(HERO_CLASSES).map(([value, c]) => ({ name: `${c.icon} ${c.name}`, value }))))
      .addStringOption(o => o.setName('tactic').setDescription('Тактика героя').setRequired(true)
        .addChoices(...Object.values(EXPEDITION_TACTICS).map(t => ({ name: `${t.icon} ${t.name}`, value:t.key })))))
    .addSubcommand(s => s.setName('status').setDescription('Проверить состояние текущей экспедиции'))
    .addSubcommand(s => s.setName('return').setDescription('Забрать героя после окончания экспедиции'))
    .addSubcommand(s => s.setName('history').setDescription('Последние экспедиции героя')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const offered = getDailyLocations(interaction.guildId || 'dm');
    return interaction.respond(offered.filter(l => `${l.name} ${l.key}`.toLowerCase().includes(focused)).slice(0,25).map(l => ({ name: `${l.icon} ${l.name} • ${l.difficulty}/5`, value: l.key })));
  },

  async execute(interaction) {
    if (interaction.channelId !== EXPEDITION_CHANNEL_ID) return interaction.reply({ content: `Команда доступна только в канале <#${EXPEDITION_CHANNEL_ID}>.`, flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    let hero = getHero(interaction.user.id);
    if (!hero) return interaction.reply(noHero());
    if (hero.status === 'wounded' && recoverHero(interaction.user.id)) hero = getHero(interaction.user.id);

    if (sub === 'locations') {
      const world = getDailyWorld(interaction.guildId || 'dm');
      const offered = world.locations;
      const active = getActiveExpedition(interaction.user.id);
      const window = expeditionWindow();
      const text = offered.map(l => {
        const chance = computeSuccessChance(hero, l);
        return `${l.icon} **${l.name}** · ${stars(l.difficulty)}\n${l.description}\n🎯 Твой шанс успеха: **${Math.round(chance)}%** · ⏳ **4 ч.** · ${l.dailyTheme.icon} **${l.dailyTheme.name}**\n${l.dailyTheme.description}\nКлюч: \`${l.key}\``;
      }).join('\n\n');
      const lockText = window.fits
        ? `✅ До World Boss достаточно времени. Поход на 4 часа доступен.`
        : `⚠️ До World Boss осталось менее 4 часов. Новые экспедиции закрыты.`;
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(window.fits ? 0x7C3AED : 0xEF4444).setTitle('🗺️ Экспедиции на сегодня').setDescription(`${world.weather.icon} **Погода: ${world.weather.name}**
${world.weather.description}

${text}

${lockText}`).setFooter({ text: active ? 'Твой герой уже находится в экспедиции.' : `Следующий World Boss: ${ts(nextBossAt(), 't')} по МСК.` })], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'start') {
      const result = startExpedition(interaction.user.id, interaction.options.getString('location'), interaction.guildId || 'dm', interaction.options.getString('class'), interaction.options.getString('tactic'));
      const errors = { busy:'❌ Герой сейчас недоступен.', active:'❌ Герой уже находится в экспедиции.', boss_active:'❌ Сейчас идёт регистрация или бой с мировым боссом. Дождись его окончания.', boss_window:`❌ До следующего World Boss недостаточно времени для 4-часовой экспедиции. Следующий бой ${ts(result.nextBossAt)}. Отправь героя после боя.`, not_offered:'❌ Эта локация сегодня недоступна. Посмотри `/expedition locations`.', invalid_class:'❌ Неизвестный класс.' };
      if (!result.ok) return interaction.reply({ content: errors[result.reason] || '❌ Не удалось начать экспедицию.', flags: MessageFlags.Ephemeral });
      let expeditionBuffs = {}; try { expeditionBuffs = JSON.parse(result.expedition.buffs_json || '{}') || {}; } catch {}
      const tactic = getExpeditionTactic(result.expedition.tactic_key);
      const activeEffects = expeditionBuffs.effects?.length ? `\n\n🧪 Активировано: ${expeditionBuffs.effects.map(e => `**${e.icon} ${e.name}**`).join(', ')}` : '';
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${result.location.icon} Экспедиция началась`).setDescription(`**${hero.name}** отправился в локацию **${result.location.name}** как **${HERO_CLASSES[result.expedition.class_key]?.icon || ''} ${HERO_CLASSES[result.expedition.class_key]?.name || result.expedition.class_key}**.\n🎯 Тактика: **${tactic.icon} ${tactic.name}**\n\nВернётся ${ts(result.expedition.returns_at)} (${ts(result.expedition.returns_at, 'f')}).\nПосле этого используй \`/expedition return\`.${activeEffects}`).addFields({ name:'Опасность', value:stars(result.location.difficulty), inline:true }, { name:'Ожидаемый шанс', value:`${Math.round(computeSuccessChance(hero, result.location, expeditionBuffs.bonuses || {}, tactic.key))}%`, inline:true }, { name:'Погода', value:`${result.location.weather?.icon || '🌤️'} ${result.location.weather?.name || 'Без изменений'}`, inline:true })] });
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
      const rewards = [`✨ **+${r.xp} XP героя**`, r.classXp ? `${HERO_CLASSES[r.classKey]?.icon || '📚'} **+${r.classXp} XP класса ${HERO_CLASSES[r.classKey]?.name || r.classKey}** → Lv.${r.classLevel}` : null, r.dust ? `💠 **+${r.dust} Dust**` : null, r.dustLost ? `💠 **−${r.dustLost} Dust**` : null, `🏅 **+${r.reputation} репутации**`, r.item ? `🎁 **${r.item.name}** [${r.item.rarity}]` : null, r.companion ? `🐾 **Новый питомец: ${r.companion.name}** [${r.companion.rarity}]` : null, materialText, r.chest ? `${r.chest.icon || '📦'} **${r.chest.name}**` : null, alchemyText, r.levelsGained ? `⬆️ Новый уровень героя!` : null, r.injuryHours ? `🩹 Ранение: восстановление ${r.injuryHours} ч.` : null, r.world ? `🌍 **+${r.world.reputationGain} репутации региона**` : null].filter(Boolean).join('\n');
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(r.outcome==='fail'?0xEF4444:r.outcome==='partial'?0xF59E0B:r.outcome==='great'?0xEAB308:0x22C55E).setTitle(`${result.location.icon} ${outcomeLabel(r.outcome)}`).setDescription(`${r.event}\n\n🎯 **Тактика:** ${r.tactic?.icon || '⚖️'} ${r.tactic?.name || 'Сбалансированно'}\n\n${rewards}`).addFields({name:'Расчёт',value:`Шанс: ${r.chance}% · Бросок: ${r.roll}`,inline:true},{name:'Локация',value:result.location.name,inline:true}).setFooter({text:'Исход зависит от уровня, характеристик, происхождения, сложности и небольшого случайного фактора.'})] });
    }

    if (sub === 'history') {
      const rows = getLatestExpeditions(interaction.user.id, 8);
      const text = rows.length ? rows.map(e => { const loc=LOCATIONS[e.location_key]; let result='В пути'; try { const r=JSON.parse(e.result_json||'null'); if(r) result=outcomeLabel(r.outcome); } catch(_){} return `${loc?.icon||'🗺️'} **${loc?.name||e.location_key}** • ${HERO_CLASSES[normalizeClassKey(e.class_key)]?.name || 'Класс'} — ${result}\n${ts(e.started_at,'d')}`; }).join('\n\n') : 'Герой ещё не участвовал в экспедициях.';
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x9333EA).setTitle(`📜 Экспедиции: ${hero.name}`).setDescription(text)], flags:MessageFlags.Ephemeral });
    }
  },
  handleComponent,
  ensureExpeditionHub,
  EXPEDITION_CHANNEL_ID,
  refreshExpeditionHubIfNeeded,
};
