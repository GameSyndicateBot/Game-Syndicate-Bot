const { SlashCommandBuilder, EmbedBuilder, MessageFlags, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const path = require('path');
const { getHero } = require('../systems/hero/heroService');
const { getEffectiveHero } = require('../systems/hero/itemService');
const { LOCATIONS } = require('../systems/hero/expeditionData');
const { getDailyWorld, getDailyLocations, getExpeditionStartPreview, getActiveExpedition, getLatestExpeditions, getExpeditionCooldown, cancelExpedition, startExpedition, resolveExpedition, recoverHero, computeSuccessChance, nextBossAt, expeditionWindow, availableExpeditionDurations, activeWorldBoss, getWorldStats, getWorldActivity, EXPEDITION_TACTICS, getExpeditionTactic, rewardPreview } = require('../systems/hero/expeditionService');
const { createExpeditionHubCard } = require('../images/hero/createExpeditionHubCard');
const { HERO_CLASSES } = require('../systems/hero/heroData');
const { getAllClassProgress, getClassProgress, normalizeClassKey } = require('../systems/hero/classProgressService');
const { getOrCreatePlayer } = require('../database/db');
const { checkAchievements } = require('../utils/checkAchievements');

function ts(value, style = 'R') { return `<t:${Math.floor(new Date(value).getTime() / 1000)}:${style}>`; }
function cooldownTimer(value) { return `${ts(value, 'R')} (до ${ts(value, 'T')})`; }
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
function outcomeLabel(key) { return ({ great:'🌟 Великолепный успех', success:'✅ Успех', partial:'⚠️ Частичный успех', fail:'❌ Провал' })[key] || key; }
function noHero() { return { content: '❌ Сначала создай героя в постоянном **Guild Hub**.', flags: MessageFlags.Ephemeral }; }

function offeredLocation(guildId, locationKey) {
  return getDailyLocations(guildId || 'global').find(location => location.key === locationKey) || null;
}


async function checkExpeditionAchievements(interaction) {
  try {
    const player = getOrCreatePlayer(interaction.user);
    await checkAchievements({
      message: { author: interaction.user, guild: interaction.guild },
      player,
      member: interaction.member,
    });
  } catch (error) {
    console.error('[Expedition Achievements] Не удалось проверить достижения:', error);
  }
}



const EXPEDITION_CHANNEL_ID = '1529566430301782017';
const HUB_MARKER = '🗺️ **EXPEDITION HUB • GAME SYNDICATE**';
let lastAutoHubSignature = null;
let lastHubMessageId = null;

function hubRows(world, locked) {
  const buttons = world.locations.slice(0, 3).map((location, index) =>
    new ButtonBuilder()
      .setCustomId(`expedition:start:${location.key}`)
      .setLabel(location.name)
      .setEmoji('🗺️')
      .setStyle(index === 0 ? ButtonStyle.Success : index === 1 ? ButtonStyle.Primary : ButtonStyle.Danger)
      .setDisabled(locked)
  );
  return [
    new ActionRowBuilder().addComponents(...buttons),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('expedition:status').setLabel('Моя экспедиция').setEmoji('🧭').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('expedition:return').setLabel('Забрать результат').setEmoji('🎁').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('expedition:history').setLabel('История').setEmoji('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('expedition:map').setLabel('Карта').setEmoji('🗺️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('expedition:refresh').setLabel('Обновить хаб').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function locationChoiceRows(world) {
  return [new ActionRowBuilder().addComponents(...world.locations.slice(0,3).map((location,index)=>
    new ButtonBuilder().setCustomId(`expedition:start:${location.key}`).setLabel(location.name).setEmoji('🗺️').setStyle(index===0?ButtonStyle.Success:index===1?ButtonStyle.Primary:ButtonStyle.Danger)
  ))];
}
function durationMenu(locationKey,classKey) {
  const now=new Date();
  const options=[2,4,8].map(hours=>{const w=expeditionWindow(now,hours);const hourLabel=hours===2?'2 часа':hours===4?'4 часа':'8 часов';return {label:hourLabel,value:String(hours),emoji:hours===2?'🕑':hours===4?'🕓':'🕗',description:w.fits?`Доступно до World Boss · награды x${hours===2?'0.6':hours===4?'1.0':'1.8'}`:`Недоступно: не успеет до World Boss`,default:false};});
  const allowed=options.filter((_,i)=>expeditionWindow(now,[2,4,8][i]).fits);
  if(!allowed.length)return null;
  return new StringSelectMenuBuilder().setCustomId(`expedition:duration:${locationKey}:${classKey}`).setPlaceholder('Выбери длительность похода').addOptions(allowed);
}
function bossLabel(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date) + ' МСК';
}

async function hubPayload(guildId = 'global') {
  const world = getDailyWorld(guildId);
  const now = new Date();
  const durations = availableExpeditionDurations(now);
  const boss = nextBossAt(now);
  const bossActive = Boolean(activeWorldBoss());
  const locked = bossActive || durations.length === 0;
  const lockReason = bossActive
    ? 'World Boss уже начался или идёт регистрация.'
    : 'До World Boss осталось менее 2 часов — герой не успеет вернуться.';
  const stats=getWorldStats(guildId); const activity=getWorldActivity(guildId,5);
  const buffer = await createExpeditionHubCard({
    world,
    nextBossLabel: bossLabel(boss),
    locked,
    lockReason,
    availableDurations: durations,
    stats,
    activity
  });
  return {
    content: `${HUB_MARKER}\nВыбери одну из трёх локаций. Перед отправкой выбери длительность: **2, 4 или 8 часов**. Личные результаты открываются только тебе. В каталоге **${world.totalCatalog || Object.keys(LOCATIONS).length} локаций** с редкостью и особыми условиями появления.`,
    files: [new AttachmentBuilder(buffer, { name: 'gs-expedition-hub.png' })],
    components: hubRows(world, locked),
  };
}



function expeditionHubErrorInfo(error) {
  return {
    code: error?.code ?? error?.rawError?.code ?? null,
    status: error?.status ?? null,
    message: String(error?.message || error || 'Неизвестная ошибка').slice(0, 500),
  };
}

async function sendExpeditionHub(channel, payload) {
  try {
    return await channel.send(payload);
  } catch (error) {
    const info = expeditionHubErrorInfo(error);
    console.error('[Expedition Hub] Отправка полной панели не удалась:', info);

    // Если Discord/хостинг временно не принимает вложение, не оставляем канал пустым:
    // создаём рабочий хаб без картинки, сохраняя кнопки и весь функционал.
    if (Array.isArray(payload.files) && payload.files.length) {
      const fallbackPayload = {
        content: `${payload.content}\n\n⚠️ Изображение хаба временно не загрузилось, но кнопки и экспедиции работают.`,
        components: payload.components,
      };
      try {
        const message = await channel.send(fallbackPayload);
        message.expeditionHubFallback = true;
        return message;
      } catch (fallbackError) {
        fallbackError.fullPayloadError = info;
        throw fallbackError;
      }
    }
    throw error;
  }
}

async function rebuildExpeditionHub(client) {
  try {
    const channel = await client.channels.fetch(EXPEDITION_CHANNEL_ID);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      return { ok: false, reason: 'channel_unavailable', errorInfo: { message: 'Канал не найден или не поддерживает отправку сообщений.' } };
    }

    // Сначала создаём новый хаб. Старый удаляем только после успешной отправки.
    // Так канал больше не останется пустым, если Canvas/вложение/Discord API даст ошибку.
    const payload = await hubPayload(channel.guildId || 'global');
    const created = await sendExpeditionHub(channel, payload);

    const recent = await channel.messages.fetch({ limit: 100 }).catch(error => {
      console.warn('[Expedition Hub] Новый хаб создан, но список старых сообщений получить не удалось:', error?.message || error);
      return null;
    });

    let deleted = 0;
    if (recent) {
      const hubs = recent.filter(m =>
        m.id !== created.id &&
        m.author.id === client.user.id &&
        m.content.startsWith(HUB_MARKER)
      );
      for (const message of hubs.values()) {
        try {
          await message.delete();
          deleted += 1;
        } catch (error) {
          console.warn('[Expedition Hub] Не удалось удалить старый хаб:', message.id, error?.message || error);
        }
      }
    }

    lastHubMessageId = created.id;
    lastAutoHubSignature = currentHubSignature(channel.guildId || 'global');
    console.log(`[Expedition Hub] Публичный хаб пересоздан: ${created.id}; удалено старых: ${deleted}`);
    return {
      ok: true,
      message: created,
      deleted,
      fallback: Boolean(created.expeditionHubFallback),
    };
  } catch (error) {
    const errorInfo = expeditionHubErrorInfo(error);
    console.error('[Expedition Hub] Не удалось пересоздать публичный хаб:', errorInfo, error);
    return { ok: false, reason: 'rebuild_failed', error, errorInfo };
  }
}
async function ensureExpeditionHub(client) {
  try {
    const channel = await client.channels.fetch(EXPEDITION_CHANNEL_ID);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') return null;

    const recent = await channel.messages.fetch({ limit: 50 }).catch(error => {
      console.warn('[Expedition Hub] Не удалось прочитать историю канала, будет создан новый хаб:', error?.message || error);
      return null;
    });
    const existing = recent?.find(m => m.author.id === client.user.id && m.content.startsWith(HUB_MARKER));
    const payload = await hubPayload(channel.guildId || 'global');

    if (existing) {
      try {
        await existing.edit(payload);
        lastHubMessageId = existing.id;
        return existing;
      } catch (editError) {
        console.warn('[Expedition Hub] Старый хаб не удалось обновить, создаём новый:', editError?.message || editError);
      }
    }

    const created = await sendExpeditionHub(channel, payload);
    lastHubMessageId = created.id;
    return created;
  } catch (error) {
    console.error('[Expedition Hub] Не удалось создать/обновить панель:', expeditionHubErrorInfo(error), error);
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


function formatExpeditionHistoryEntry(e, index) {
  const loc = LOCATIONS[e.location_key];
  let r = null;
  try { r = JSON.parse(e.result_json || 'null'); } catch (_) {}
  const classKey = normalizeClassKey(e.class_key);
  const cls = HERO_CLASSES[classKey];
  const started = ts(e.started_at, 'f');
  const returned = e.returns_at ? ts(e.returns_at, 'f') : null;
  if (!r) {
    return `### ${index + 1}. ${loc?.icon || '🗺️'} ${loc?.name || e.location_key}
👤 **Класс:** ${cls?.icon || '📚'} ${cls?.name || 'Неизвестный класс'}
⏳ **Статус:** в пути
🚪 **Начало:** ${started}${returned ? `
🏁 **Возвращение:** ${returned}` : ''}`;
  }

  const materials = Array.isArray(r.materials) && r.materials.length
    ? r.materials.map(m => `${m.icon || '📦'} ${m.name} ×${m.quantity}`).join(', ')
    : 'нет';
  const trophies = Array.isArray(r.miniboss?.loot) && r.miniboss.loot.length
    ? r.miniboss.loot.map(x => `${x.icon || '📦'} ${x.name} ×${x.quantity}`).join(', ')
    : null;
  const rewards = [
    `✨ ${Number(r.xp || 0)} XP героя`,
    r.classXp ? `${cls?.icon || '📚'} ${r.classXp} XP класса${r.classLevel ? ` → Lv.${r.classLevel}` : ''}` : null,
    r.dust ? `💠 ${r.dust} GS Dust` : null,
    r.miniboss?.dust ? `👑 ${r.miniboss.dust} GS Dust за мини-босса` : null,
    r.dustLost ? `💠 потеряно ${r.dustLost} GS Dust` : null,
    r.reputation ? `🏅 ${r.reputation} репутации` : null,
  ].filter(Boolean).join(' · ');

  const finds = [
    `📦 **Материалы:** ${materials}`,
    r.item ? `🎁 **Экипировка:** ${r.item.name} [${r.item.rarity}]` : null,
    trophies ? `🏺 **Трофеи мини-босса:** ${trophies}` : null,
    r.chest ? `${r.chest.icon || '🎁'} **Сундук:** ${r.chest.name}` : null,
    r.companion ? `🐾 **Питомец:** ${r.companion.name} [${r.companion.rarity || 'обычный'}]` : null,
    r.treasureMapReward ? `🗺️ **Тайник по карте:** ${r.treasureMapReward.type==='item'?`${r.treasureMapReward.name} [${r.treasureMapReward.rarity}]`:r.treasureMapReward.type==='dust'?`${r.treasureMapReward.dust} GS Dust`:`${r.treasureMapReward.icon||'📦'} ${r.treasureMapReward.name} ×${r.treasureMapReward.quantity}`}` : null,
  ].filter(Boolean).join('\n');

  const details = [
    `🎯 **Тактика:** ${r.tactic?.icon || '⚖️'} ${r.tactic?.name || 'Сбалансированно'}`,
    Number.isFinite(Number(r.chance)) ? `🎲 **Расчёт:** шанс ${r.chance}% · бросок ${r.roll}` : null,
    r.event ? `📖 **Событие:** ${r.event}` : null,
    r.injuryHours ? `🩹 **Ранение:** ${r.injuryHours} ч.` : '❤️ **Ранение:** нет',
    r.world?.reputationGain ? `🌍 **Регион:** +${r.world.reputationGain} репутации` : null,
  ].filter(Boolean).join('\n');

  return `### ${index + 1}. ${loc?.icon || '🗺️'} ${loc?.name || e.location_key} — ${outcomeLabel(r.outcome)}
👤 **Класс:** ${cls?.icon || '📚'} ${cls?.name || 'Неизвестный класс'}
🕒 **Начало:** ${started}${returned ? `
🏁 **Завершение:** ${returned}` : ''}
${details}
💰 **Награды:** ${rewards || 'нет'}
${finds}`;
}

function expeditionHistoryEmbeds(hero, rows) {
  if (!rows.length) return [new EmbedBuilder().setColor(0x9333EA).setTitle(`📜 Экспедиции: ${hero.name}`).setDescription('Герой ещё не участвовал в экспедициях.')];
  const entries = rows.map(formatExpeditionHistoryEntry);
  const pages = [];
  let current = '';
  for (const entry of entries) {
    if ((current + '\n\n' + entry).length > 3900) {
      pages.push(current);
      current = entry;
    } else {
      current = current ? `${current}\n\n${entry}` : entry;
    }
  }
  if (current) pages.push(current);
  return pages.slice(0, 10).map((description, i) => new EmbedBuilder()
    .setColor(0x9333EA)
    .setTitle(i === 0 ? `📜 Подробная история: ${hero.name}` : `📜 История: ${hero.name} • продолжение`)
    .setDescription(description)
    .setFooter({ text: `Показаны последние ${rows.length} экспедиций · страница ${i + 1}/${pages.length}` }));
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

  if (action === 'map') {
    const mapPath = path.join(__dirname, '..', 'images', 'hero', 'cartography', 'expedition-world-map.png');
    return interaction.reply({
      files: [new AttachmentBuilder(mapPath, { name: 'game-syndicate-expedition-world-map.png' })],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'refresh') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await ensureExpeditionHub(interaction.client);
    return interaction.editReply(message ? '✅ Expedition Hub обновлён.' : '❌ Не удалось обновить хаб.');
  }

  if (action === 'start') {
    const locationKey = parts[2];
    const location = offeredLocation(interaction.guildId, locationKey);
    const progress = getAllClassProgress(interaction.user.id);
    const menu = new StringSelectMenuBuilder().setCustomId(`expedition:class:${locationKey}`).setPlaceholder('Выбери класс для этой экспедиции')
      .addOptions(progress.map(row => { const c=HERO_CLASSES[row.class_key]; return { label:`${c.name} • Lv.${row.level}`, value:row.class_key, emoji:c.icon, description:`Опыт ${row.xp} • прокачивается только выбранный класс` }; }));
    return interaction.reply({ embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle(`${location?.icon||'🗺️'} Кто отправится в экспедицию?`).setDescription(`Локация: **${location?.name||locationKey}**

Можно выбрать любой класс. После возвращения опыт получит именно он.`)], components:[new ActionRowBuilder().addComponents(menu)], flags:MessageFlags.Ephemeral });
  }

  if (action === 'locations') {
    const world=getDailyWorld(interaction.guildId || 'global');
    return interaction.update({content:'🗺️ **Выберите другую локацию.**',embeds:[],components:locationChoiceRows(world)});
  }

  if (action === 'class') {
    const locationKey=parts[2];
    const classKey=normalizeClassKey(interaction.values?.[0]);
    const location=offeredLocation(interaction.guildId, locationKey);
    const menu=durationMenu(locationKey,classKey);
    if(!menu)return interaction.update({content:`❌ До следующего World Boss недостаточно времени даже для 2-часовой экспедиции.`,embeds:[],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('expedition:locations').setLabel('Вернуться к локациям').setEmoji('⬅️').setStyle(ButtonStyle.Secondary))]});
    return interaction.update({embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle(`⏳ ${location?.name || 'Длительность экспедиции'}`).setDescription(`Класс: **${HERO_CLASSES[classKey]?.icon || ''} ${HERO_CLASSES[classKey]?.name || classKey}**

🕑 **2 часа** — безопаснее и быстрее, награды около 60–70%.
🕓 **4 часа** — стандартный поход.
🕗 **8 часов** — лучшие награды и редкая добыча, но выше риск.

Показываются только варианты, которые завершатся до следующего World Boss.`)],components:[new ActionRowBuilder().addComponents(menu),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('expedition:locations').setLabel('Вернуться к локациям').setEmoji('⬅️').setStyle(ButtonStyle.Secondary))]});
  }

  if (action === 'duration') {
    const locationKey=parts[2], classKey=normalizeClassKey(parts[3]), durationHours=Number(interaction.values?.[0]||4);
    const location=offeredLocation(interaction.guildId, locationKey);
    const chances=Object.values(EXPEDITION_TACTICS).map(t=>{
      const exact=getExpeditionStartPreview(interaction.user.id, locationKey, interaction.guildId || 'global', t.key, durationHours, classKey);
      return {t,chance:Number(exact.chance||0),preview:rewardPreview(location,t.key,durationHours),exact};
    });
    const tacticMenu=new StringSelectMenuBuilder().setCustomId(`expedition:tactic:${locationKey}:${classKey}:${durationHours}`).setPlaceholder('Выбери тактику героя').addOptions(chances.map(({t,chance,preview})=>({label:`${t.name} — ${chance}%`,value:t.key,emoji:t.icon,description:`XP ${preview.heroXp[0]}–${preview.heroXp[1]} · класс ${preview.classXp[0]}–${preview.classXp[1]} · Dust ${preview.dust[0]}–${preview.dust[1]}`.slice(0,100)})));
    const sample=chances[0]?.exact?.expeditionStats||{};
    const sources=sample.loadoutSnapshot||{};
    const score=x=>Math.round(Object.values(x||{}).reduce((sum,value)=>sum+(Number(value)||0),0));
    const sourceText=[
      `⚔️ Экипировка: **${score(sources.equipment)} ед. бонусов**`,
      `🔷 Артефакты: **${score(sources.artifacts)} ед. бонусов**`,
      `🐾 Питомцы: **${score(sources.pets)} ед. бонусов**`,
      `🐎 Маунт: **${score(sources.mount)} ед. бонусов**`,
      `✨ Редкая добыча: **${Number(sample.rareLootBonus||0)>=0?'+':''}${Number(sample.rareLootBonus||0)}%**`,
      `🎁 Награды: **+${Number(sample.rewardPercent||0)}%**`,
      `❤️ Защита от ранений: **+${Number(sample.injuryResistance||0)}%**`,
    ].join('\n');
    const preview=chances.map(({t,chance,preview:p})=>`${t.icon} **${t.name}: ${chance}%**\n✨ Герой: **${p.heroXp[0]}–${p.heroXp[1]} XP** · 📚 Класс: **${p.classXp[0]}–${p.classXp[1]} XP** · 💠 **${p.dust[0]}–${p.dust[1]} Dust**`).join('\n\n');
    return interaction.update({embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle(`🎯 ${location?.name} · ${durationHours} ч.`).setDescription(`Класс: **${HERO_CLASSES[classKey]?.icon||''} ${HERO_CLASSES[classKey]?.name||classKey}**
Опасность: ${stars(location?.difficulty||1)}

${sourceText}

${preview}

🔒 Итоговый шанс успеха ограничен **80%**. Учитываются только надетые предметы, два активных артефакта, активные питомцы и надетый маунт.

Материалы, предметы, сундуки и мини-боссы зависят от исхода, сложности и выбранной тактики.`)],components:[new ActionRowBuilder().addComponents(tacticMenu),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`expedition:classback:${locationKey}`).setLabel('Назад к классам').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('expedition:locations').setLabel('К локациям').setEmoji('🗺️').setStyle(ButtonStyle.Secondary))]});
  }

  if (action === 'classback') {
    const locationKey=parts[2], location=LOCATIONS[locationKey], progress=getAllClassProgress(interaction.user.id);
    const menu=new StringSelectMenuBuilder().setCustomId(`expedition:class:${locationKey}`).setPlaceholder('Выбери класс').addOptions(progress.map(row=>{const c=HERO_CLASSES[row.class_key];return {label:`${c.name} • Lv.${row.level}`,value:row.class_key,emoji:c.icon,description:`Опыт ${row.xp} • этот класс получит XP`};}));
    return interaction.update({embeds:[new EmbedBuilder().setColor(0x7C3AED).setTitle(`${location?.icon||'🗺️'} Кто отправится?`).setDescription(`Локация: **${location?.name||locationKey}**`)],components:[new ActionRowBuilder().addComponents(menu),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('expedition:locations').setLabel('К локациям').setEmoji('⬅️').setStyle(ButtonStyle.Secondary))]});
  }

  if (action === 'tactic') {
    const locationKey=parts[2];
    const classKey=normalizeClassKey(parts[3]);
    const durationHours=Number(parts[4]||4);
    const tacticKey=interaction.values?.[0] || 'balanced';
    const tactic=getExpeditionTactic(tacticKey);
    const result = startExpedition(interaction.user.id, locationKey, interaction.guildId || 'global', classKey, tacticKey, durationHours);
    const errors = {
      busy: '❌ Герой сейчас недоступен.', dungeon_active: '❌ Герой сейчас находится в активном подземелье.', active: '❌ Герой уже находится в экспедиции.',
      boss_active: '❌ Сейчас идёт регистрация или бой с World Boss.',
      boss_window: `❌ Выбранная длительность не помещается до World Boss. Герой не успеет вернуться к бою ${result.nextBossAt ? ts(result.nextBossAt) : ''}.`,
      not_offered: '❌ Эта локация сегодня уже недоступна. Обнови хаб.',
      cooldown: result.cooldownUntil
        ? `⏳ **Герой восстанавливается после прерванной экспедиции.**\n\nНовые экспедиции пока недоступны.\n🕐 Осталось: **${cooldownTimer(result.cooldownUntil)}**`
        : '⏳ После отмены герой ещё не готов к новой экспедиции.',
    };
    if (!result.ok) return interaction.reply({ content: errors[result.reason] || '❌ Не удалось начать экспедицию.', flags: MessageFlags.Ephemeral });
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${result.location.icon} Экспедиция началась`)
        .setDescription(`**${hero.name}** отправился в **${result.location.name}** как **${HERO_CLASSES[result.expedition.class_key]?.icon || ''} ${HERO_CLASSES[result.expedition.class_key]?.name || result.expedition.class_key}**.\n🎯 Тактика: **${tactic.icon} ${tactic.name}**\n\nДлительность: **${Number(result.expedition.duration_hours||4)} ч.**\nВозвращение ${ts(result.expedition.returns_at)}. После этого нажми **«Забрать результат»**.`)
        .addFields(
          { name: 'Опасность', value: stars(result.location.difficulty), inline: true },
          { name: 'Шанс успеха', value: `${Number(result.chance)}% / 80%`, inline: true },
          { name: 'Комплект зафиксирован', value: 'Вещи, артефакты, питомцы и маунт сохранены на момент отправки.', inline: false },
        )],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'status') {
    const active = getActiveExpedition(interaction.user.id);
    if (!active) return interaction.reply({ content: 'ℹ️ Активной экспедиции нет. Герой свободен.', flags: MessageFlags.Ephemeral });
    const loc = LOCATIONS[active.location_key];
    const tactic = getExpeditionTactic(active.tactic_key);
    const ready = Date.now() >= new Date(active.returns_at).getTime();
    return interaction.reply({ content: ready ? `✅ **${hero.name}** вернулся из локации **${loc?.name || active.location_key}**. Нажми **«Забрать результат»**.` : `⏳ **${hero.name}** исследует **${loc?.name || active.location_key}** и вернётся ${ts(active.returns_at)}.\n🎯 Тактика: **${tactic.icon} ${tactic.name}**`, components: ready?[]:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('expedition:cancel:confirm').setLabel('Прервать экспедицию').setEmoji('🚫').setStyle(ButtonStyle.Danger))], flags: MessageFlags.Ephemeral });
  }

  if (action === 'cancel' && parts[2] === 'confirm') {
    return interaction.update({content:'⚠️ **Прервать текущую экспедицию?**\n\n❌ Вся найденная добыча и использованные расходники будут потеряны.\n⏳ После прерывания новые экспедиции будут недоступны **1 час**.\n\nПосле подтверждения бот покажет живой таймер до следующего доступного похода.',embeds:[],components:[new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('expedition:cancel:apply').setLabel('Да, отменить').setEmoji('🚫').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('expedition:status').setLabel('Нет').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
    )]});
  }
  if (action === 'cancel' && parts[2] === 'apply') {
    const r=cancelExpedition(interaction.user.id);
    if(!r.ok) return interaction.update({content:'ℹ️ Активной экспедиции уже нет.',embeds:[],components:[]});
    return interaction.update({content:`🚫 **Экспедиция прервана.**\n\n❌ Награды не выданы.\n⏳ Новые экспедиции недоступны в течение 1 часа.\n🕐 Осталось: **${cooldownTimer(r.cooldownUntil)}**`,embeds:[],components:[]});
  }

  if (action === 'return') {
    const result = resolveExpedition(interaction.user.id);
    if (!result.ok) {
      const text = result.reason === 'not_ready' ? `⏳ Герой ещё в пути. Длительность: **${Number(result.expedition.duration_hours||4)} ч.**\nВозвращение ${ts(result.expedition.returns_at)}.` : '❌ Завершённой экспедиции пока нет.';
      return interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    }
    const r = result.result;
    await checkExpeditionAchievements(interaction);
    const rewards = [`✨ **+${r.xp} XP героя**`, r.classXp ? `${HERO_CLASSES[r.classKey]?.icon || '📚'} **+${r.classXp} XP класса ${HERO_CLASSES[r.classKey]?.name || r.classKey}** → Lv.${r.classLevel}` : null, r.dust ? `💠 **+${r.dust} Dust**` : null, r.miniboss?.dust ? `👑 **+${r.miniboss.dust} Dust за мини-босса**` : null, `🏅 **+${r.reputation} репутации**`, r.item ? `🎁 **${r.item.name}** [${r.item.rarity}]` : null, r.miniboss?.loot?.length ? `🏺 **Трофеи:** ${r.miniboss.loot.map(x=>`${x.icon||'📦'} ${x.name} ×${x.quantity}`).join(', ')}` : null, r.companion ? `🐾 **Новый питомец: ${r.companion.name}**` : null, r.treasureMapReward ? `🗺️ **Тайник по карте:** ${r.treasureMapReward.type==='item'?`${r.treasureMapReward.name} [${r.treasureMapReward.rarity}]`:r.treasureMapReward.type==='dust'?`${r.treasureMapReward.dust} Dust`:`${r.treasureMapReward.name} ×${r.treasureMapReward.quantity}`}` : null, r.injuryHours ? `🩹 **Ранение:** восстановление ${r.injuryHours} ч. · готов ${ts(new Date(Date.now()+r.injuryHours*3600000))}` : null].filter(Boolean).join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(r.outcome === 'fail' ? 0xEF4444 : r.outcome === 'partial' ? 0xF59E0B : 0x22C55E).setTitle(`${result.location.icon} ${outcomeLabel(r.outcome)}`).setDescription(`${r.event}\n\n🎯 **Тактика:** ${r.tactic?.icon || '⚖️'} ${r.tactic?.name || 'Сбалансированно'}\n\n${rewards}`)], flags: MessageFlags.Ephemeral });
  }

  if (action === 'history') {
    const page=Math.max(0,Number(parts[2]||0));
    const all=getLatestExpeditions(interaction.user.id,1000);const pageSize=8,totalPages=Math.max(1,Math.ceil(all.length/pageSize));const safe=Math.min(page,totalPages-1);const rows=all.slice(safe*pageSize,safe*pageSize+pageSize);
    const buttons=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`expedition:history:${Math.max(0,safe-1)}`).setLabel('Назад').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(safe===0),
      new ButtonBuilder().setCustomId(`expedition:history:${Math.min(totalPages-1,safe+1)}`).setLabel('Далее').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(safe>=totalPages-1)
    );
    const payload={embeds:expeditionHistoryEmbeds(hero,rows),components:totalPages>1?[buttons]:[],flags:MessageFlags.Ephemeral};
    return parts[2]!==undefined?interaction.update(payload):interaction.reply(payload);
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
      .addIntegerOption(o => o.setName('duration').setDescription('Длительность экспедиции').setRequired(true).addChoices({name:'2 часа',value:2},{name:'4 часа',value:4},{name:'8 часов',value:8}))
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
        const chance = computeSuccessChance(hero, l, {}, 'balanced', 4);
        return `${l.icon} **${l.name}** · ${stars(l.difficulty)}\n${l.description}\n🎯 Твой шанс успеха: **${Math.round(chance)}%** · ⏳ **4 ч.** · ${l.dailyTheme.icon} **${l.dailyTheme.name}**\n${l.dailyTheme.description}\nКлюч: \`${l.key}\``;
      }).join('\n\n');
      const lockText = window.fits
        ? `✅ До World Boss достаточно времени. Поход на 4 часа доступен.`
        : `⚠️ Выбранная длительность не помещается до World Boss. Новые экспедиции закрыты.`;
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(window.fits ? 0x7C3AED : 0xEF4444).setTitle('🗺️ Экспедиции на сегодня').setDescription(`${world.weather.icon} **Погода: ${world.weather.name}**
${world.weather.description}

${text}

${lockText}`).setFooter({ text: active ? 'Твой герой уже находится в экспедиции.' : `Следующий World Boss: ${ts(nextBossAt(), 't')} по МСК.` })], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'start') {
      const result = startExpedition(interaction.user.id, interaction.options.getString('location'), interaction.guildId || 'dm', interaction.options.getString('class'), interaction.options.getString('tactic'), interaction.options.getInteger('duration'));
      const errors = { busy:'❌ Герой сейчас недоступен.', dungeon_active:'❌ Герой сейчас находится в активном подземелье.', active:'❌ Герой уже находится в экспедиции.', boss_active:'❌ Сейчас идёт регистрация или бой с мировым боссом. Дождись его окончания.', boss_window:`❌ До следующего World Boss недостаточно времени для 4-часовой экспедиции. Следующий бой ${ts(result.nextBossAt)}. Отправь героя после боя.`, not_offered:'❌ Эта локация сегодня недоступна. Посмотри `/expedition locations`.', invalid_class:'❌ Неизвестный класс.' };
      if (!result.ok) return interaction.reply({ content: errors[result.reason] || '❌ Не удалось начать экспедицию.', flags: MessageFlags.Ephemeral });
      let expeditionBuffs = {}; try { expeditionBuffs = JSON.parse(result.expedition.buffs_json || '{}') || {}; } catch {}
      const tactic = getExpeditionTactic(result.expedition.tactic_key);
      const activeEffects = expeditionBuffs.effects?.length ? `\n\n🧪 Активировано: ${expeditionBuffs.effects.map(e => `**${e.icon} ${e.name}**`).join(', ')}` : '';
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B5CF6).setTitle(`${result.location.icon} Экспедиция началась`).setDescription(`**${hero.name}** отправился в локацию **${result.location.name}** как **${HERO_CLASSES[result.expedition.class_key]?.icon || ''} ${HERO_CLASSES[result.expedition.class_key]?.name || result.expedition.class_key}**.\n🎯 Тактика: **${tactic.icon} ${tactic.name}**\n\nВернётся ${ts(result.expedition.returns_at)} (${ts(result.expedition.returns_at, 'f')}).\nПосле этого используй \`/expedition return\`.${activeEffects}`).addFields({ name:'Опасность', value:stars(result.location.difficulty), inline:true }, { name:'Ожидаемый шанс', value:`${Number(result.chance || Math.round(computeSuccessChance(getEffectiveHero(hero), result.location, expeditionBuffs.bonuses || {}, tactic.key, result.expedition.duration_hours || 4)))}%`, inline:true }, { name:'Погода', value:`${result.location.weather?.icon || '🌤️'} ${result.location.weather?.name || 'Без изменений'}`, inline:true })] });
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
        if (result.reason === 'not_ready') return interaction.reply({ content:`⏳ Экспедиция ещё не завершена. Длительность: **${Number(result.expedition.duration_hours||4)} ч.**\nВозвращение ${ts(result.expedition.returns_at)}.`, flags:MessageFlags.Ephemeral });
        return interaction.reply({ content:'❌ У тебя нет завершённой активной экспедиции.', flags:MessageFlags.Ephemeral });
      }
      const r = result.result;
      await checkExpeditionAchievements(interaction);
      const materialText = Array.isArray(r.materials) && r.materials.length ? r.materials.map(m => `${m.icon || '📦'} **${m.name} ×${m.quantity}**`).join('\n') : null;
      const alchemyText = Array.isArray(r.alchemy) && r.alchemy.length ? `🧪 **Сработало:** ${r.alchemy.map(e => `${e.icon} ${e.name}`).join(', ')}` : null;
      const rewards = [`✨ **+${r.xp} XP героя**`, r.classXp ? `${HERO_CLASSES[r.classKey]?.icon || '📚'} **+${r.classXp} XP класса ${HERO_CLASSES[r.classKey]?.name || r.classKey}** → Lv.${r.classLevel}` : null, r.dust ? `💠 **+${r.dust} Dust**` : null, r.miniboss?.dust ? `👑 **+${r.miniboss.dust} Dust за мини-босса**` : null, r.dustLost ? `💠 **−${r.dustLost} Dust**` : null, `🏅 **+${r.reputation} репутации**`, r.item ? `🎁 **${r.item.name}** [${r.item.rarity}]` : null, r.miniboss?.loot?.length ? `🏺 **Трофеи мини-босса:** ${r.miniboss.loot.map(x=>`${x.icon||'📦'} ${x.name} ×${x.quantity}`).join(', ')}` : null, r.companion ? `🐾 **Новый питомец: ${r.companion.name}** [${r.companion.rarity}]` : null, r.treasureMapReward ? `🗺️ **Тайник по карте:** ${r.treasureMapReward.type==='item'?`${r.treasureMapReward.name} [${r.treasureMapReward.rarity}]`:r.treasureMapReward.type==='dust'?`${r.treasureMapReward.dust} Dust`:`${r.treasureMapReward.name} ×${r.treasureMapReward.quantity}`}` : null, materialText, r.chest ? `${r.chest.icon || '📦'} **${r.chest.name}**` : null, alchemyText, r.levelsGained ? `⬆️ Новый уровень героя!` : null, r.injuryHours ? `🩹 **Ранение:** восстановление ${r.injuryHours} ч. · готов ${ts(new Date(Date.now()+r.injuryHours*3600000))}` : null, r.world ? `🌍 **+${r.world.reputationGain} репутации региона**` : null, r.miniboss?.aftermath ? `🌍 ${r.miniboss.aftermath.description}` : null].filter(Boolean).join('\n');
      return interaction.reply({ embeds:[new EmbedBuilder().setColor(r.outcome==='fail'?0xEF4444:r.outcome==='partial'?0xF59E0B:r.outcome==='great'?0xEAB308:0x22C55E).setTitle(`${result.location.icon} ${outcomeLabel(r.outcome)}`).setDescription(`${r.event}\n\n🎯 **Тактика:** ${r.tactic?.icon || '⚖️'} ${r.tactic?.name || 'Сбалансированно'}\n\n${rewards}`).addFields({name:'Расчёт',value:`Шанс: ${r.chance}% · Бросок: ${r.roll}`,inline:true},{name:'Локация',value:result.location.name,inline:true}).setFooter({text:'Исход зависит от уровня, характеристик, происхождения, сложности и небольшого случайного фактора.'})] });
    }

    if (sub === 'history') {
      const rows = getLatestExpeditions(interaction.user.id, 8);
      return interaction.reply({ embeds: expeditionHistoryEmbeds(hero, rows), flags:MessageFlags.Ephemeral });
    }
  },
  handleComponent,
  ensureExpeditionHub,
  EXPEDITION_CHANNEL_ID,
  refreshExpeditionHubIfNeeded,
  rebuildExpeditionHub,
};
