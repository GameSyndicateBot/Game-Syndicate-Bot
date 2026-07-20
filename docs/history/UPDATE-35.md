# Game Syndicate Bot 35

- GS emoji registrations moved into the main backed-up SQLite database.
- Existing registrations are migrated from the old Telegram database when available.
- Known Telegram members receive an emoji automatically; /gsregister now changes it.
- /gs deletes the command message, posts the call to Discord channel 1526531339149512754 with @everyone, and removes both Telegram and Discord call messages after 5 minutes.
- Royal Button redesigned as a 2-minute total-hold event with a 1-second capture cooldown and ignored owner repeat clicks.
- Invalid command/event helper files are silently skipped by loaders; obsolete files are absent from this archive.

- The /gs call contains no join buttons; it is a plain @everyone announcement with the game name.
