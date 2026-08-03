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

const { closeDatabase, db } = require('./database/db');
const { startupStorageMaintenance } = require('./utils/sqliteFullRecovery');
startupStorageMaintenance(db);
const { protectInteractionResponses } = require('./utils/discordPayloadSafety');

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

require('./systems/hero/playerCorrectionService');
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

const { autoPublishCommunityCode } = require('./services/autoPublishCommunityCode');

client.once('clientReady', () => {
    console.log(`✅ Бот ${client.user.tag} запущен!`);

    // Slash-команды НЕ регистрируются при обычном запуске бота.
    // Для обновления команд используй отдельную команду: npm run deploy:prod
    // Это защищает сервер от случайного удаления команд и дневного лимита Discord.
    console.log('ℹ️ Автоматическая регистрация slash-команд при запуске отключена.');

    setTimeout(async () => {
        try { await autoPublishCommunityCode(client); } catch (e) { console.error('❌ Кодекс:', e); }
    }, 10000);

    // Восстанавливаем закрепляемую панель Гильдии после перезапуска.
    setTimeout(async () => {
        try {
            const guildCommand = client.commands.get('guild');
            if (guildCommand?.ensureGuildHub) await guildCommand.ensureGuildHub(client);
        } catch (error) {
            console.error('[Guild Hub] Ошибка автозапуска:', error);
        }
    }, 8000);

    // Запускаем планировщик групповых данжей и восстанавливаем их хаб.
    setTimeout(async () => {
        try {
            const dungeonSystem = require('./services/groupDungeonSystem');
            dungeonSystem.startScheduler(client);
            await dungeonSystem.ensureHub(client);
        } catch (error) {
            console.error('[Dungeon Hub] Ошибка автозапуска:', error);
        }
    }, 9000);

    // Восстанавливаем постоянный Expedition Hub и обновляем его при смене дня/окна World Boss.
    setTimeout(async () => {
        try {
            const expeditionCommand = client.commands.get('expedition');
            if (expeditionCommand?.refreshExpeditionHubIfNeeded) await expeditionCommand.refreshExpeditionHubIfNeeded(client);
        } catch (error) {
            console.error('[Expedition Hub] Ошибка автозапуска:', error);
        }
    }, 10000);

    setInterval(async () => {
        try {
            const expeditionCommand = client.commands.get('expedition');
            if (expeditionCommand?.refreshExpeditionHubIfNeeded) await expeditionCommand.refreshExpeditionHubIfNeeded(client);
        } catch (error) {
            console.error('[Expedition Hub] Ошибка автообновления:', error);
        }
    }, 60 * 1000);

    // Автоматически исправляем безопасные зависшие RPG-состояния:
    // дубли активных сессий, статус expedition без активной экспедиции и
    // просроченное восстановление после ранения.
    try {
        const { repairRpgStates } = require('./services/rpgStateRecovery');
        const repaired = repairRpgStates();
        console.log(
            `[RPG State Recovery] duplicate=${repaired.duplicateExpeditionsCancelled}, ` +
            `orphan=${repaired.orphanHeroesReleased}, ` +
            `recovered=${repaired.expiredRecoveriesReleased}, ` +
            `returned=${repaired.returnedExpeditionHeroesReleased}`
        );
    } catch (error) {
        console.error('[RPG State Recovery] Ошибка запуска:', error);
    }

    // V19.6.2 — единоразовые проверяемые восстановления по заявке владельца.
    try {
        const { applyTargetedRecoveryV1962 } = require('./services/targetedRecoveryV1962');
        applyTargetedRecoveryV1962();
    } catch (error) {
        console.error('[V19.6.2 Targeted Recovery] Ошибка:', error);
    }

    // V19.6.2 Extra — единоразовое восстановление 8-часовой экспедиции для 759026090038657034.
    try {
        const { applyTargetedRecoveryV1962Extra } = require('./services/targetedRecoveryV1962Extra');
        applyTargetedRecoveryV1962Extra();
        const { applyTargetedRecoveryV1963 } = require('./services/targetedRecoveryV1963');
        applyTargetedRecoveryV1963();
    } catch (error) {
        console.error('[V19.6.2 Extra Recovery] Ошибка:', error);
    }

    // Repeat the safe check every minute. This covers expeditions that finish
    // while the bot is already running and survives missed UI refreshes.
    setInterval(() => {
        try {
            const { repairRpgStates } = require('./services/rpgStateRecovery');
            const repaired = repairRpgStates();
            if (repaired.returnedExpeditionHeroesReleased || repaired.orphanHeroesReleased || repaired.expiredRecoveriesReleased || repaired.duplicateExpeditionsCancelled) {
                console.log(
                    `[RPG State Recovery] duplicate=${repaired.duplicateExpeditionsCancelled}, ` +
                    `orphan=${repaired.orphanHeroesReleased}, ` +
                    `recovered=${repaired.expiredRecoveriesReleased}, ` +
                    `returned=${repaired.returnedExpeditionHeroesReleased}`
                );
            }
        } catch (error) {
            console.error('[RPG State Recovery] Ошибка периодической проверки:', error);
        }
    }, 60 * 1000);

    // Пересчитываем пропущенные серии реакций и выдаём достижения
    // по уже накопленной статистике и коллекциям карточек.
    setTimeout(async () => {
        try {
            const { repairAchievementData } = require('./services/achievementDataRepair');
            repairAchievementData();

            // Сначала снимаем ошибочно выданные достижения за неполные
            // карточные коллекции и откатываем их XP/AP/Dust. Только после
            // строгой проверки запускаем обычную выдачу пропущенных наград.
            const { auditCollectionAchievements } = require('./services/collectionAchievementAudit');
            const audit = auditCollectionAchievements();
            console.log(
                `[Collection Achievements Audit] checked=${audit.checked}, ` +
                `revoked=${audit.revoked}, users=${audit.users}, ` +
                `dustRemoved=${audit.dustRemoved}`
            );

            const { backfillAchievements } = require('./services/achievementBackfill');
            await backfillAchievements(client);
        } catch (error) {
            console.error('[Achievements Backfill] Ошибка запуска:', error);
        }
    }, 15000);
});

client.on('interactionCreate', async interaction => {
    protectInteractionResponses(interaction);
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
            // Все модальные окна Гильдии (создание героя, рынок, обмены,
            // заказы и продажа экипировки) обрабатываются одной командой.
            // Раньше сюда пропускались только guild:create:modal:*, поэтому
            // guild:market:exchangeqty оставался без ответа и Discord показывал
            // «Что-то пошло не так». 
            if (interaction.customId.startsWith('guild:')) {
                const command = client.commands.get('guild');
                if (command?.handleModal) return await command.handleModal(interaction);
            }
            return;
        }

        if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isChannelSelectMenu() || interaction.isButton()) {

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

            if (interaction.customId.startsWith('dng_')) {
                const { handle } = require('./services/groupDungeonSystem');
                return await handle(interaction);
            }

            if (interaction.customId.startsWith('wb_')) {
                const { handle } = require('./services/worldBoss/worldBossSystem');
                return await handle(interaction);
            }

            if (interaction.customId.startsWith('quickevent_')) {
                const { handleQuickEventComponent } = require('./systems/quickEventSystem');
                return await handleQuickEventComponent(interaction);
            }

            if (interaction.customId.startsWith('guide:')) {
                const command = client.commands.get('guide');
                if (command?.handleComponent) return await command.handleComponent(interaction);
            }

            if (interaction.customId.startsWith('hero:')) {
                const command = client.commands.get('hero');
                if (command?.handleComponent) return await command.handleComponent(interaction);
            }

            if (interaction.customId.startsWith('expedition:')) {
                const command = client.commands.get('expedition');
                if (command?.handleComponent) return await command.handleComponent(interaction);
            }

            if (interaction.customId.startsWith('guild:')) {
                const command = client.commands.get('guild');
                if (command?.handleComponent) return await command.handleComponent(interaction);
            }

            if (interaction.customId.startsWith('alchemist:')) {
                const command = client.commands.get('alchemist');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('achievements_')) {
                const command = client.commands.get('achievements');
                if (command?.handleComponent) {
                    return await command.handleComponent(interaction);
                }
            }

            if (interaction.customId.startsWith('lottery:')) {
                const command = client.commands.get('lottery');
                if (command?.handleComponent) return await command.handleComponent(interaction);
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
