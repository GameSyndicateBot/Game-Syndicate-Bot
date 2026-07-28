const {SlashCommandBuilder,EmbedBuilder,MessageFlags}=require('discord.js');
const {getHero}=require('../systems/hero/heroService');
const {listCompanions,activateCompanion,MAX_ACTIVE_PETS}=require('../systems/hero/companionService');
const {COMPANIONS,RARITY_LABELS}=require('../systems/hero/companionData');
function bonusText(r){const d=COMPANIONS[r.companion_key]||{};return Object.entries(d.bonuses||{}).map(([k,v])=>`${k==='expedition_success'?'успех экспедиций':k==='rare_find'?'редкая добыча':k==='world_boss_damage'?'урон по боссу':'защита от босса'} +${v}%`).join(' · ')||'Без пассивного бонуса';}
module.exports={data:new SlashCommandBuilder().setName('companion').setDescription('Питомцы и маунты героя')
 .addSubcommand(s=>s.setName('list').setDescription('Показать питомцев и маунта'))
 .addSubcommand(s=>s.setName('activate').setDescription('Активировать или убрать питомца/маунта').addIntegerOption(o=>o.setName('id').setDescription('ID питомца или маунта').setMinValue(1).setRequired(true)).addIntegerOption(o=>o.setName('slot').setDescription('Слот питомца 1–3 (для маунта не нужен)').setMinValue(1).setMaxValue(3))),
 async execute(interaction){
  if(!getHero(interaction.user.id))return interaction.reply({content:'❌ Сначала создай героя.',flags:MessageFlags.Ephemeral});
  const sub=interaction.options.getSubcommand();
  if(sub==='activate'){
    const r=activateCompanion(interaction.user.id,interaction.options.getInteger('id'),interaction.options.getInteger('slot'));
    const text=!r.ok?(r.reason==='max_active'?`❌ Уже активно ${MAX_ACTIVE_PETS} питомца. Сначала убери одного повторным выбором.`:'❌ Питомец или маунт не найден.'):
      r.kind==='mount'?(r.active?`✅ Маунт **${r.companion.name}** выбран отдельно от питомцев.`:`✅ Маунт **${r.companion.name}** убран.`):
      (r.active?`✅ **${r.companion.name}** активирован в слоте ${r.slot}/${MAX_ACTIVE_PETS}.`:`✅ **${r.companion.name}** убран из активных питомцев.`);
    return interaction.reply({content:text,flags:MessageFlags.Ephemeral});
  }
  const rows=listCompanions(interaction.user.id);
  const pets=rows.filter(r=>r.companion_kind!=='mount');
  const mounts=rows.filter(r=>r.companion_kind==='mount');
  const format=r=>{const kind=r.companion_kind==='mount'?'🐎 МАУНТ':'🐾 ПИТОМЕЦ';const state=r.active_mount?'🟣 АКТИВЕН':r.active_slot?`🟢 АКТИВЕН · слот ${r.active_slot}`:'⚪ Не активен';return `**${kind}** · ${state}\n**#${r.id} ${(COMPANIONS[r.companion_key]?.icon)||(r.companion_kind==='mount'?'🐎':'🐾')} ${r.name}** · ${RARITY_LABELS[r.rarity]||r.rarity}\n${bonusText(r)}`;};
  const text=[`**Активные питомцы:** до ${MAX_ACTIVE_PETS}\n**Активный маунт:** 1 отдельный слот`,pets.length?'\n### 🐾 Питомцы\n'+pets.map(format).join('\n\n'):'\nПитомцев пока нет.',mounts.length?'\n### 🐎 Маунты\n'+mounts.map(format).join('\n\n'):''].join('\n');
  return interaction.reply({embeds:[new EmbedBuilder().setColor(0xA855F7).setTitle('🐾 Питомцы и маунты героя').setDescription(text.slice(0,4000)).setFooter({text:'Повторный выбор активного спутника снимает его. Маунт не занимает слот питомца.'})],flags:MessageFlags.Ephemeral});
 }};
