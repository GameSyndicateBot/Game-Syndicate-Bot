const { startScheduler } = require('./utils/scheduler');
const { startAutoEvents } = require('./systems/quickEventSystem');
require('dotenv').config();

const { buildInfo } = require('./utils/buildInfo');
console.log(`🏷️ Runtime: ${buildInfo.name}`);
console.log(`🆔 Runtime build ID: ${buildInfo.buildId}`);
console.log(`🧭 Runtime entry: ${__filename}`);
console.log(`🗄️ Runtime database: ${process.env.DATABASE_PATH || '/app/shared/database.sqlite'}`);

const { startTelegramBot } = require('./telegram/startTelegramBot');

const fs = require('fs');
const path = require('path');
const {
    Client,
    Collection,
    GatewayIntentBits,
    Partials,
    MessageFlags
} = require('discord.js');

const { closeDatabase } = require('./database/db');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
    ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);

    // В папке commands могут оставаться служебные/устаревшие файлы после
    // обновления поверх старой сборки. Они не являются slash-командами.
    if (!command?.data || typeof command.execute !== 'function') {
        continue;
    }

    client.commands.set(command.data.name, command);
}

client.once('ready', () => {
    startScheduler(client); startScheduler(client); startScheduler(client);
    startAutoEvents(client);
    console.log(`✅ Бот ${client.user.tag} запущен!`);
});

client.on('interactionCreate', async interaction => {
    try {
        // Все визуальные панели используют серверный ник участника.
        const { attachServerDisplayName } = require('./utils/displayName');
        if (interaction.user) {
            attachServerDisplayName(interaction.user, interaction.member);
        }
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'game_create_modal') {
                const command = client.commands.get('game');
                if (command?.handleModal) return await command.handleModal(interaction);
            }
            return;
        }

        if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isButton()) {

            if (interaction.customId.startsWith('control:')) {
                const command = client.commands.get('control');
                if (command?.handleComponent) return await command.handleComponent(interaction);
            }

            if (interaction.customId.startsWith('game_copy:')) {
                const { handleGameLobbyButton } = require('./systems/gameLobbySystem');
                return await handleGameLobbyButton(interaction);
            }

            if (interaction.customId.startsWith('xg_')) {
                const { handleDiscord } = require('./telegram/crossGatherings');
                return await handleDiscord(interaction);
            }

            if (interaction.customId.startsWith('gs_')) {
                const command = client.commands.get('gs');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('quickevent_')) {
                const { handleQuickEventComponent } = require('./systems/quickEventSystem');
                return await handleQuickEventComponent(interaction);
            }

            if (interaction.customId.startsWith('achievements_')) {
                const command = client.commands.get('achievements');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('daily_')) {
                const command = client.commands.get('daily');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('top_')) {
                const command = client.commands.get('top');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('cards_')) {
                const command = client.commands.get('cards');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('cardshop_')) {
                const command = client.commands.get('cardshop');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('dust_')) {
                const command = client.commands.get('dust');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('pack_')) {
                const command = client.commands.get('pack');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('packs_')) {
                const command = client.commands.get('packs');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }


            if (interaction.customId.startsWith('trade_')) {
                const command = client.commands.get('trade');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('auction_')) {
                const command = client.commands.get('auction');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        await command.execute(interaction);
    } catch (error) {
        console.error(error);

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: 'Произошла ошибка.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        } else {
            await interaction.reply({
                content: 'Произошла ошибка.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    }
});

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(`./events/${file}`);

    // Служебные и устаревшие файлы не считаются Discord-событиями.
    if (!event?.name || typeof event.execute !== 'function') {
        continue;
    }

    client.on(event.name, (...args) => event.execute(...args));
}

startTelegramBot(client).catch(error => {
    console.error('❌ Ошибка запуска Telegram-бота:', error);
});

let shuttingDown = false;

function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`🛑 Получен ${signal}. Завершаю работу и фиксирую SQLite WAL...`);

    try {
        client.destroy();
    } catch (_) {}

    try {
        closeDatabase();
        console.log('✅ SQLite WAL зафиксирован, база закрыта.');
    } catch (error) {
        console.error('❌ Ошибка закрытия SQLite:', error);
    }

    process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

client.login(process.env.TOKEN);


client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === 'boss') {
        const { startQuickEvent } = require('./systems/quickEventSystem');
        await startQuickEvent(client);
        message.reply('🔥 Босс запущен');
    }
});
