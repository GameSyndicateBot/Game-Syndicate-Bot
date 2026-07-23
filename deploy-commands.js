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

        if (!command?.data || typeof command.data.toJSON !== 'function') {
            console.log(`⚠️ Команда ${file} пропущена: нет корректного data`);
            continue;
        }

        const json = command.data.toJSON();
        const previousFile = commandNames.get(json.name);
        if (previousFile) {
            throw new Error(
                `Найдены две локальные команды /${json.name}: ${previousFile} и ${file}. ` +
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
    if (!value) throw new Error(`Не задана переменная окружения ${name}`);
    return value;
}

function normalizeGuildIds(values) {
    return [...new Set(values.map(value => value?.trim()).filter(Boolean))];
}

function resolveTargets(modeOrGuildId) {
    const raw = modeOrGuildId || 'prod';
    const mode = raw.toLowerCase();

    if (/^\d{17,20}$/.test(raw)) {
        return { label: `сервер ${raw}`, guildIds: [raw] };
    }

    const prodGuildId = process.env.PROD_GUILD_ID?.trim() || process.env.GUILD_ID?.trim();
    const devGuildId = process.env.DEV_GUILD_ID?.trim();

    switch (mode) {
        case 'dev':
            if (!devGuildId) throw new Error('Для deploy:dev укажи DEV_GUILD_ID.');
            return { label: 'DEV-сервер', guildIds: [devGuildId] };
        case 'prod':
            if (!prodGuildId) throw new Error('Для deploy:prod укажи PROD_GUILD_ID или GUILD_ID.');
            return { label: 'основной сервер', guildIds: [prodGuildId] };
        case 'all': {
            const guildIds = normalizeGuildIds([prodGuildId, devGuildId]);
            if (guildIds.length === 0) throw new Error('Укажи PROD_GUILD_ID/GUILD_ID и/или DEV_GUILD_ID.');
            return { label: 'все настроенные серверы', guildIds };
        }
        case 'global':
            return { label: 'глобально', global: true, guildIds: [] };
        case 'clean': {
            const guildIds = normalizeGuildIds([prodGuildId, devGuildId]);
            return { label: 'полная очистка команд', cleanOnly: true, clearGlobal: true, guildIds };
        }
        default:
            throw new Error(`Неизвестный режим "${raw}". Используй dev, prod, all, global, clean или ID сервера.`);
    }
}

async function clearGlobalCommands(rest, clientId) {
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('🧹 Глобальные команды удалены.');
}

async function clearGuildCommands(rest, clientId, guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    console.log(`🧹 Серверные команды удалены на сервере ${guildId}.`);
}

async function deploy() {
    const token = requireEnv('TOKEN');
    const clientId = requireEnv('CLIENT_ID');
    const commands = loadCommands();
    const target = resolveTargets(process.argv[2]);
    const rest = new REST({ version: '10' }).setToken(token);

    if (target.cleanOnly) {
        console.log('⚠️ ВНИМАНИЕ: запущен явный режим полной очистки команд.');
        if (target.clearGlobal) await clearGlobalCommands(rest, clientId);
        for (const guildId of target.guildIds) {
            await clearGuildCommands(rest, clientId, guildId);
        }
        console.log('✅ Очистка завершена.');
        return;
    }

    console.log(`🚀 Безопасное обновление ${commands.length} уникальных команд: ${target.label}...`);
    console.log('ℹ️ Существующие команды заранее не удаляются. Discord обновит набор одним PUT-запросом.');

    if (target.global) {
        const result = await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log(`✅ Глобально зарегистрировано команд: ${Array.isArray(result) ? result.length : commands.length}.`);
        return;
    }

    for (const guildId of target.guildIds) {
        const result = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        console.log(`✅ На сервере ${guildId} зарегистрировано команд: ${Array.isArray(result) ? result.length : commands.length}.`);
    }

    console.log('✅ Безопасная регистрация завершена.');
}

deploy().catch(error => {
    console.error('❌ Не удалось зарегистрировать команды:');

    const code = error?.code ?? error?.rawError?.code;
    const message = error?.rawError?.message || error?.message || String(error);
    console.error(message);

    if (code === 30034 || /Max number of daily application command creates/i.test(message)) {
        console.error('⏳ Достигнут дневной лимит Discord. Ничего не удаляй и не повторяй регистрацию много раз.');
    }

    process.exitCode = 1;
});
