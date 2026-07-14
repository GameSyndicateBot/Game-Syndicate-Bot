const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    AttachmentBuilder,
} = require('discord.js');

const { normalizeServerNickname } = require('../utils/displayName');
const { db, getCardDust } = require('../database/db');
const { getUserCards, getUserCardByInventoryId } = require('../utils/cardSystem');
const { createAuctionPanel } = require('../images/auction/createAuctionPanel');
const { createAuctionHistoryCard } = require('../images/history/createAuctionHistoryCard');

const AUCTION_TTL_DAYS = 7;

db.exec(`
    CREATE TABLE IF NOT EXISTS card_auction_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT,
        message_id TEXT,
        seller_id TEXT NOT NULL,
        inventory_id INTEGER NOT NULL,
        price INTEGER NOT NULL,
        status TEXT DEFAULT 'active',
        buyer_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL,
        sold_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_auction_active_inventory
    ON card_auction_listings(inventory_id) WHERE status='active';
    CREATE INDEX IF NOT EXISTS idx_auction_status ON card_auction_listings(status, id);
`);

function rarityLabel(rarity) {
    const map = { common:'⚪ Common',rare:'🔵 Rare',epic:'🟣 Epic',legendary:'🟡 Legendary',mythic:'🔴 Mythic',exclusive:'💠 Exclusive',holographic:'🌈 Holographic',treasure:'💎 Treasure' };
    return map[rarity] ?? rarity;
}
function expiresAtSql() { return new Date(Date.now() + AUCTION_TTL_DAYS * 86_400_000).toISOString(); }
function getListing(id) { return db.prepare('SELECT * FROM card_auction_listings WHERE id=?').get(id); }
function ownedFromListing(listing) { return listing ? getUserCardByInventoryId(listing.seller_id, listing.inventory_id) : null; }
function cardLocked(inventoryId) {
    const a=db.prepare("SELECT 1 FROM card_auction_listings WHERE inventory_id=? AND status='active'").get(inventoryId);
    const t=db.prepare("SELECT 1 FROM card_trades WHERE status IN ('selecting','pending') AND (initiator_card_id=? OR target_card_id=?) AND expires_at>?").get(inventoryId,inventoryId,new Date().toISOString());
    return Boolean(a||t);
}
function sellableCards(userId) { return getUserCards(userId).filter(c=>c.rarity!=='treasure'&&!cardLocked(c.id)).slice(0,25); }
function options(cards) { return cards.map(c=>({label:`${c.code} • ${c.name}`.slice(0,100),value:String(c.id),description:`${rarityLabel(c.rarity).replace(/^\S+\s/,'')} • #${String(c.copy_number).padStart(6,'0')}`.slice(0,100),emoji:'🎴'})); }

async function resolveMemberName(client, guildId, userId) {
    try {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        return normalizeServerNickname(member.displayName || member.user.globalName || member.user.username || userId);
    } catch (_) {
        try {
            const user = await client.users.fetch(userId);
            return normalizeServerNickname(user.globalName || user.username || userId);
        } catch (_) {
            return userId;
        }
    }
}

async function renderListing(listing, client = null) {
    const owned = ownedFromListing(listing);
    const active = listing.status === 'active' && Date.parse(listing.expires_at) > Date.now();
    const statusLabel = listing.status === 'sold' ? 'ПРОДАНО'
        : listing.status === 'cancelled' ? 'СНЯТО С ПРОДАЖИ'
        : !active ? 'СРОК ИСТЁК'
        : 'АКТИВЕН';
    const statusColor = listing.status === 'sold' ? '#22C55E'
        : active ? '#C084FC' : '#EF4444';
    let sellerName = `ID ${listing.seller_id}`;
    if (client) {
        const user = await client.users.fetch(listing.seller_id).catch(() => null);
        if (user) sellerName = user.username;
    }
    const panel = await createAuctionPanel({
        id: listing.id,
        owned,
        price: listing.price,
        active,
        statusLabel,
        statusColor,
        ttlDays: AUCTION_TTL_DAYS,
        sellerId: listing.seller_id,
        sellerName,
    });
    const components = active && owned ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`auction_buy_${listing.id}`).setLabel(`Купить за ${listing.price}`).setEmoji('🛒').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`auction_cancel_${listing.id}`).setLabel('Снять с продажи').setStyle(ButtonStyle.Secondary),
    )] : [];
    return {
        content: `# 🏷️ Аукцион #${listing.id}
Продавец: <@${listing.seller_id}>`,
        embeds: [],
        files: [new AttachmentBuilder(panel, { name: `auction-${listing.id}.png` })],
        components,
    };
}

async function refresh(client,id){const l=getListing(id);if(!l?.channel_id||!l?.message_id)return;const c=await client.channels.fetch(l.channel_id).catch(()=>null);const m=c?await c.messages.fetch(l.message_id).catch(()=>null):null;if(m)await m.edit(await renderListing(l, client)).catch(()=>null);}

function buyListing(id,buyerId){
    return db.transaction(()=>{
        const l=getListing(id);if(!l||l.status!=='active')throw new Error('Объявление уже закрыто.');
        if(Date.parse(l.expires_at)<=Date.now()){db.prepare("UPDATE card_auction_listings SET status='expired' WHERE id=?").run(id);throw new Error('Срок объявления истёк.');}
        if(l.seller_id===buyerId)throw new Error('Нельзя купить собственную карточку.');
        const card=db.prepare('SELECT * FROM player_cards WHERE id=? AND user_id=?').get(l.inventory_id,l.seller_id);if(!card)throw new Error('Карточка больше не принадлежит продавцу.');
        if(card.rarity==='treasure')throw new Error('TREASURE нельзя продавать.');
        db.prepare("INSERT OR IGNORE INTO players(user_id,username) VALUES(?,?)").run(buyerId,'Unknown');
        db.prepare("INSERT OR IGNORE INTO players(user_id,username) VALUES(?,?)").run(l.seller_id,'Unknown');
        const balance=getCardDust(buyerId);if(balance<l.price)throw new Error(`Недостаточно GS Dust: нужно ${l.price}, у тебя ${balance}.`);
        const removed=db.prepare('UPDATE players SET card_dust=card_dust-? WHERE user_id=? AND card_dust>=?').run(l.price,buyerId,l.price);if(!removed.changes)throw new Error('Недостаточно GS Dust.');
        db.prepare('UPDATE players SET card_dust=COALESCE(card_dust,0)+? WHERE user_id=?').run(l.price,l.seller_id);
        db.prepare('UPDATE player_cards SET user_id=? WHERE id=? AND user_id=?').run(buyerId,l.inventory_id,l.seller_id);
        db.prepare("UPDATE card_auction_listings SET status='sold',buyer_id=?,sold_at=CURRENT_TIMESTAMP WHERE id=?").run(buyerId,id);
        return getListing(id);
    })();
}

module.exports={
    data:new SlashCommandBuilder().setName('auction').setDescription('Аукцион коллекционных карточек')
        .addSubcommand(s=>s.setName('sell').setDescription('Выставить карточку за GS Dust').addIntegerOption(o=>o.setName('цена').setDescription('Цена в GS Dust').setRequired(true).setMinValue(1).setMaxValue(10000000)))
        .addSubcommand(s=>s.setName('browse').setDescription('Посмотреть активные объявления'))
        .addSubcommand(s=>s.setName('my').setDescription('Мои объявления'))
        .addSubcommand(s=>s.setName('history').setDescription('История моих продаж и покупок'))
        .addSubcommand(s=>s.setName('cancel').setDescription('Снять объявление').addIntegerOption(o=>o.setName('номер').setDescription('Номер объявления').setRequired(true).setMinValue(1))),

    async execute(interaction){
        const sub=interaction.options.getSubcommand();
        if(sub==='sell'){
            const price=interaction.options.getInteger('цена',true);const cards=sellableCards(interaction.user.id);
            if(!cards.length)return interaction.reply({content:'❌ У тебя нет карточек, доступных для продажи.',ephemeral:true});
            const menu=new StringSelectMenuBuilder().setCustomId(`auction_sellpick_${price}`).setPlaceholder('Выбери карточку для продажи').addOptions(options(cards));
            return interaction.reply({content:`Выбери карточку. Цена: **${price.toLocaleString('ru-RU')} GS Dust**. Показываются последние 25 доступных экземпляров.`,components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true});
        }
        if(sub==='browse'){
            const rows=db.prepare("SELECT * FROM card_auction_listings WHERE status='active' AND expires_at>? ORDER BY id DESC LIMIT 25").all(new Date().toISOString());
            if(!rows.length)return interaction.reply({content:'На аукционе пока нет активных карточек.',ephemeral:true});
            const opts=rows.map(l=>{const c=ownedFromListing(l);return{label:`#${l.id} • ${c?.name??'Карточка'}`.slice(0,100),value:String(l.id),description:`${l.price} Dust • ${c?.rarity??'unknown'}`.slice(0,100),emoji:'🏷️'};});
            const menu=new StringSelectMenuBuilder().setCustomId('auction_view_select').setPlaceholder('Выбери объявление').addOptions(opts);
            return interaction.reply({content:`# 🏷️ Аукцион Game Syndicate\nТвой баланс: **${getCardDust(interaction.user.id)} GS Dust**`,components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true});
        }
        if(sub==='my'){
            const rows=db.prepare("SELECT * FROM card_auction_listings WHERE seller_id=? AND status='active' ORDER BY id DESC LIMIT 25").all(interaction.user.id);
            if(!rows.length)return interaction.reply({content:'У тебя нет активных объявлений.',ephemeral:true});
            return interaction.reply({content:rows.map(l=>`**#${l.id}** • ${ownedFromListing(l)?.name??'карточка'} • **${l.price} Dust**`).join('\n'),ephemeral:true});
        }
        if(sub==='history'){
            db.prepare("UPDATE card_auction_listings SET status='expired' WHERE status='active' AND expires_at<=?")
                .run(new Date().toISOString());

            const rows=db.prepare(`
                SELECT * FROM card_auction_listings
                WHERE seller_id=? OR buyer_id=?
                ORDER BY COALESCE(sold_at, created_at) DESC, id DESC
                LIMIT 15
            `).all(interaction.user.id,interaction.user.id);

            const userIds = new Set(rows.flatMap(row => [row.seller_id, row.buyer_id].filter(Boolean)));
            const names = new Map();
            for (const userId of userIds) {
                names.set(userId, await resolveMemberName(interaction.client, interaction.guildId, userId));
            }
            const dateFormat = new Intl.DateTimeFormat('ru-RU', {
                day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit',
            });
            const entries = rows.map(l => {
                const cardRow=db.prepare('SELECT * FROM player_cards WHERE id=?').get(l.inventory_id);
                const card=cardRow?getUserCardByInventoryId(cardRow.user_id,l.inventory_id):null;
                return {
                    id:l.id,
                    status:l.status,
                    card,
                    price:l.price,
                    sellerName:names.get(l.seller_id),
                    buyerName:l.buyer_id?names.get(l.buyer_id):null,
                    resultText:l.status==='cancelled'?'Снято продавцом':l.status==='expired'?'Срок истёк':'Без покупателя',
                    dateLabel:dateFormat.format(new Date(l.sold_at||l.created_at)),
                };
            });
            const image=await createAuctionHistoryCard({
                ownerName:normalizeServerNickname(interaction.member?.displayName||interaction.user.globalName||interaction.user.username),
                entries,
            });
            return interaction.reply({
                files:[new AttachmentBuilder(image,{name:'auction-history.png'})],
                ephemeral:true,
            });
        }
        if(sub==='cancel'){
            const id=interaction.options.getInteger('номер',true),l=getListing(id);if(!l||l.seller_id!==interaction.user.id||l.status!=='active')return interaction.reply({content:'❌ Активное объявление не найдено.',ephemeral:true});
            db.prepare("UPDATE card_auction_listings SET status='cancelled' WHERE id=?").run(id);await refresh(interaction.client,id);return interaction.reply({content:`✅ Объявление #${id} снято с продажи.`,ephemeral:true});
        }
    },

    async handleComponent(interaction){
        if(!interaction.customId.startsWith('auction_'))return false;
        const [,action,raw]=interaction.customId.split('_');
        if(action==='sellpick'){
            const price=Number(raw),inventoryId=Number(interaction.values[0]),owned=getUserCardByInventoryId(interaction.user.id,inventoryId);
            if(!owned||owned.rarity==='treasure'||cardLocked(inventoryId))return interaction.update({content:'❌ Эта карточка больше недоступна для продажи.',components:[]});
            let result;try{result=db.prepare(`INSERT INTO card_auction_listings(guild_id,seller_id,inventory_id,price,expires_at) VALUES(?,?,?,?,?)`).run(interaction.guildId,interaction.user.id,inventoryId,price,expiresAtSql());}catch(_){return interaction.update({content:'❌ Эта карточка уже выставлена или участвует в обмене.',components:[]});}
            const id=Number(result.lastInsertRowid),msg=await interaction.channel.send(await renderListing(getListing(id), interaction.client));db.prepare('UPDATE card_auction_listings SET channel_id=?,message_id=? WHERE id=?').run(msg.channelId,msg.id,id);
            await interaction.update({content:`✅ Карточка выставлена на аукцион. Объявление #${id}.`,components:[]});return true;
        }
        if(action==='view'){
            const id=Number(interaction.values[0]),l=getListing(id);if(!l)return interaction.update({content:'❌ Объявление не найдено.',components:[]});return interaction.update({...(await renderListing(l, interaction.client)),content:`# 🏷️ Аукцион #${l.id}\nТвой баланс: **${getCardDust(interaction.user.id)} GS Dust**`});
        }
        const id=Number(raw),l=getListing(id);if(!l)return interaction.reply({content:'❌ Объявление не найдено.',ephemeral:true});
        if(action==='buy'){
            try{buyListing(id,interaction.user.id);}catch(error){return interaction.reply({content:`❌ ${error.message}`,ephemeral:true});}
            await interaction.deferUpdate();await refresh(interaction.client,id);
            await interaction.followUp({content:`✅ Покупка завершена! Карточка перешла к тебе. Остаток: **${getCardDust(interaction.user.id)} GS Dust**.`,ephemeral:true});return true;
        }
        if(action==='cancel'){
            if(l.seller_id!==interaction.user.id)return interaction.reply({content:'❌ Снять объявление может только продавец.',ephemeral:true});
            if(l.status!=='active')return interaction.reply({content:'❌ Объявление уже закрыто.',ephemeral:true});
            db.prepare("UPDATE card_auction_listings SET status='cancelled' WHERE id=?").run(id);await interaction.deferUpdate();await refresh(interaction.client,id);return true;
        }
        return false;
    }
};
