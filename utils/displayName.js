function normalizeServerNickname(name, fallback = 'Участник') {
    const value = String(name || fallback).trim();
    const plain = value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zа-яё0-9]/gi, '')
        .toLowerCase();

    // Единое читаемое имя для Рафа на всех панелях.
    const rafaelAliases = new Set([
        'raf',
        'raff',
        'rafael',
        'rafaeljustus',
        'rafjustus',
        'раф',
        'рафаэль',
        'рафаел',
    ]);

    // Discord/server nicknames such as RAFAEL_JUSTUS normalize to rafaeljustus.
    if (rafaelAliases.has(plain) || plain.startsWith('rafaeljustus')) {
        return 'Rafael';
    }

    return value;
}

const FIXED_DISPLAY_NAMES_BY_ID = new Map([
    ['561961056197672991', 'Rafael'],
]);

function getServerDisplayName(member, user) {
    const userId = String(user?.id || member?.id || '');
    if (FIXED_DISPLAY_NAMES_BY_ID.has(userId)) {
        return FIXED_DISPLAY_NAMES_BY_ID.get(userId);
    }

    return normalizeServerNickname(
        member?.displayName ||
        member?.nickname ||
        user?.globalName ||
        user?.username ||
        user?.id
    );
}

function attachServerDisplayName(user, member) {
    if (!user) return user;

    const name = getServerDisplayName(member, user);

    try {
        Object.defineProperty(user, 'gsDisplayName', {
            value: name,
            writable: true,
            configurable: true,
            enumerable: false,
        });
    } catch (_) {
        user.gsDisplayName = name;
    }

    return user;
}

function getDisplayName(user) {
    const userId = String(user?.id || '');
    if (FIXED_DISPLAY_NAMES_BY_ID.has(userId)) {
        return FIXED_DISPLAY_NAMES_BY_ID.get(userId);
    }

    return normalizeServerNickname(
        user?.gsDisplayName || user?.displayName || user?.globalName || user?.username || user?.id
    );
}

module.exports = {
    normalizeServerNickname,
    getServerDisplayName,
    attachServerDisplayName,
    getDisplayName,
};
