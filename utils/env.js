const DISCORD_ID_RE = /^\d{17,20}$/;

function optionalDiscordId(name, fallback = '') {
    const raw = String(process.env[name] ?? fallback ?? '').trim();
    if (!raw) return '';

    if (!DISCORD_ID_RE.test(raw)) {
        console.warn(`⚠️ ${name} содержит некорректный Discord ID и будет проигнорирован.`);
        return '';
    }

    return raw;
}

function discordIdList(name, fallback = []) {
    const raw = String(process.env[name] ?? '').trim();
    const values = raw
        ? raw.split(',').map(value => value.trim()).filter(Boolean)
        : [...fallback];

    const valid = [];
    for (const value of values) {
        if (DISCORD_ID_RE.test(value)) valid.push(value);
        else console.warn(`⚠️ ${name}: значение «${value}» не является Discord ID и пропущено.`);
    }

    return valid;
}

function optionalUrl(name, fallback = '') {
    const raw = String(process.env[name] ?? fallback ?? '').trim();
    if (!raw) return '';

    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
        return raw;
    } catch {
        console.warn(`⚠️ ${name} содержит некорректную ссылку и будет проигнорирован.`);
        return '';
    }
}

module.exports = {
    optionalDiscordId,
    discordIdList,
    optionalUrl,
};
