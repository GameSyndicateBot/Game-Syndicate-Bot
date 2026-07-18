require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

function loadCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));

        if (!command.data || typeof command.data.toJSON !== 'function') {
            console.log(`⚠️ Команда ${file} пропущена: нет data`);
            continue;
        }

        commands.push(command.data.toJSON());
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
        return {
            label: `сервер ${modeOrGuildId}`,
            guildIds: [modeOrGuildId],
        };
    }

    const prodGuildId = process.env.PROD_GUILD_ID?.trim() || process.env.GUILD_ID?.trim();
    const devGuildId = process.env.DEV_GUILD_ID?.trim();

    switch (mode) {
        case 'dev':
            if (!devGuildId) {
                throw new Error('Для deploy:dev укажи DEV_GUILD_ID в переменных окружения.');
            }
            return { label: 'DEV-сервер', guildIds: [devGuildId] };

        case 'prod':
            if (!prodGuildId) {
                throw new Error('Для deploy:prod укажи PROD_GUILD_ID или старую переменную GUILD_ID.');
            }
            return { label: 'основной сервер', guildIds: [prodGuildId] };

        case 'all': {
            const guildIds = normalizeGuildIds([prodGuildId, devGuildId]);
            if (guildIds.length === 0) {
                throw new Error('Для deploy:all укажи PROD_GUILD_ID/GUILD_ID и DEV_GUILD_ID.');
            }
            return { label: 'все настроенные серверы', guildIds };
        }

        case 'global':
            return { label: 'глобально', global: true, guildIds: [] };

        default:
            throw new Error(
                `Неизвестный режим "${modeOrGuildId}". Используй dev, prod, all, global или ID сервера.`,
            );
    }
}

async function deploy() {
    const token = requireEnv('TOKEN');
    const clientId = requireEnv('CLIENT_ID');
    const commands = loadCommands();
    const target = resolveTargets(process.argv[2]);
    const rest = new REST({ version: '10' }).setToken(token);

    console.log(`🚀 Регистрация ${commands.length} команд: ${target.label}...`);

    if (target.global) {
        await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log('✅ Глобальные команды зарегистрированы. Обновление в Discord может занять до часа.');
        return;
    }

    for (const guildId of target.guildIds) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
        console.log(`✅ Команды зарегистрированы на сервере ${guildId}`);
    }

    console.log('✅ Регистрация команд завершена!');
}

deploy().catch(error => {
    console.error('❌ Не удалось зарегистрировать команды:');
    console.error(error?.rawError?.message || error?.message || error);
    process.exitCode = 1;
});
