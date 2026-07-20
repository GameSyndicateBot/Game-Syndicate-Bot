# Game Syndicate Bot — Update 24

## Stability & Discord.js compatibility

- GS Game Lobby timer is now initialized only once even when Discord and Telegram runtimes connect separately.
- Removed deprecated `ephemeral: true` interaction responses and migrated private responses to `MessageFlags.Ephemeral`.
- Public Lucky Day response no longer passes the obsolete `ephemeral: false` option.
- Database recovery now distinguishes a missing database from an invalid SQLite file.
- An invalid persistent database is quarantined before Discord backup recovery instead of being silently overwritten.
- Achievement startup recalculation was audited: unlocks use `INSERT OR IGNORE`, and Dust rewards have a separate `(user_id, achievement_id)` primary-key ledger, preventing repeat rewards after restart.
- Gameplay, reward amounts, commands and database schema were not changed.

## Installation

Stop the bot, extract this archive over the existing project folder, replace files, and start the bot. Runtime `.env` and SQLite databases are intentionally not included in this update archive.
