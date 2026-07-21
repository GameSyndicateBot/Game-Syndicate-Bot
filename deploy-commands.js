require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

function loadCommands() {
    const commands = [];
    const commandNames = new Map();
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));

        if (!command.data || typeof command.data.toJSON !== 'function') {
            console.log(`⚠️ Команда ${file} пропущена: нет data`);
            continue;
        }

        const json = command.data.toJSON();
        const previousFile = commandNames.get(json.name);
        if (previousFile) {
            throw new Error(
                `Найдены две локальные команды с именем /${json.name}: ${previousFile} и ${file}. ` +
                'Удалите дубликат перед регистрацией.',
            );
        }

        commandNames.set(json.name, file);
        commands.push(json);
    }

    return commands;
}

function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Не задана переменная окружения ${name}`);
    }
    return value;
}

function normalizeGuildIds(values) {
    return [...new Set(values.map(value => value?.trim()).filter(Boolean))];
}

function resolveTargets(modeOrGuildId) {
    const mode = (modeOrGuildId || 'prod').toLowerCase();

    if (/^\d{17,20}$/.test(modeOrGuildId || '')) {
        return { label: `сервер ${modeOrGuildId}`, guildIds: [modeOrGuildId] };
    }

    const prodGuildId = process.env.PROD_GUILD_ID?.trim() || process.env.GUILD_ID?.trim();
    const devGuildId = process.env.DEV_GUILD_ID?.trim();

    switch (mode) {
        case 'dev':
            if (!devGuildId) throw new Error('Для deploy:dev укажи DEV_GUILD_ID.');
            return { label: 'DEV-сервер', guildIds: [devGuildId] };
        case 'prod':
            if (!prodGuildId) throw new Error('Для deploy:prod укажи PROD_GUILD_ID или GUILD_ID.');
            return { label: 'основной сервер', guildIds: [prodGuildId], clearGlobal: true };
        case 'all': {
            const guildIds = normalizeGuildIds([prodGuildId, devGuildId]);
            if (guildIds.length === 0) throw new Error('Укажи PROD_GUILD_ID/GUILD_ID и/или DEV_GUILD_ID.');
            return { label: 'все настроенные серверы', guildIds, clearGlobal: true };
        }
        case 'global':
            return { label: 'глобально', global: true, guildIds: [] };
        case 'clean': {
            const guildIds = normalizeGuildIds([prodGuildId, devGuildId]);
            return { label: 'полная очистка команд', cleanOnly: true, clearGlobal: true, guildIds };
        }
        default:
            throw new Error(`Неизвестный режим "${modeOrGuildId}". Используй dev, prod, all, global, clean или ID сервера.`);
    }
}

async function clearGlobalCommands(rest, clientId) {
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('🧹 Старые глобальные команды удалены.');
}

async function clearGuildCommands(rest, clientId, guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    console.log(`🧹 Старые серверные команды удалены на сервере ${guildId}.`);
}

async function deploy() {
    const token = requireEnv('TOKEN');
    const clientId = requireEnv('CLIENT_ID');
    const commands = loadCommands();
    const target = resolveTargets(process.argv[2]);
    const rest = new REST({ version: '10' }).setToken(token);

    if (target.cleanOnly) {
        if (target.clearGlobal) await clearGlobalCommands(rest, clientId);
        for (const guildId of target.guildIds) await clearGuildCommands(rest, clientId, guildId);
        console.log('✅ Все найденные регистрации команд очищены.');
        return;
    }

    console.log(`🚀 Регистрация ${commands.length} уникальных команд: ${target.label}...`);

    if (target.global) {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Глобальные команды зарегистрированы. Обновление может занять до часа.');
        return;
    }

    // Главная защита от дублей: на production используется только серверная регистрация.
    // Старый глобальный набор удаляется перед публикацией серверного набора.
    if (target.clearGlobal) await clearGlobalCommands(rest, clientId);

    for (const guildId of target.guildIds) {
        await clearGuildCommands(rest, clientId, guildId);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`✅ Один комплект команд зарегистрирован на сервере ${guildId}.`);
    }

    console.log('✅ Регистрация завершена без локальных дублей.');
}

deploy().catch(error => {
    console.error('❌ Не удалось зарегистрировать команды:');
    console.error(error?.rawError?.message || error?.message || error);
    process.exitCode = 1;
});
