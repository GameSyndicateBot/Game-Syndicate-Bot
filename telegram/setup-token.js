const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const envPath = path.join(__dirname, '..', '.env');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Вставь токен Telegram-бота от BotFather: ', (rawToken) => {
    const token = rawToken.trim();
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
        console.error('Токен выглядит некорректно. Изменения не внесены.');
        rl.close();
        process.exitCode = 1;
        return;
    }

    let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const line = `TELEGRAM_BOT_TOKEN=${token}`;

    if (/^TELEGRAM_BOT_TOKEN=.*$/m.test(env)) {
        env = env.replace(/^TELEGRAM_BOT_TOKEN=.*$/m, line);
    } else {
        if (env && !env.endsWith('\n')) env += '\n';
        env += `\n# Telegram BotFather token\n${line}\n`;
    }

    fs.writeFileSync(envPath, env, 'utf8');
    console.log('✅ TELEGRAM_BOT_TOKEN сохранён в корневом .env.');
    console.log('Теперь запусти: node index.js');
    rl.close();
});
