# Game Syndicate V20.3.3 — Backup + scheduler fixes

## Backup
- `/backup create` no longer tries to upload a huge raw SQLite file in one Discord request.
- Backup is compressed as `.sqlite.gz`.
- If compressed file is still too large, it is split into ~20 MB parts and uploaded sequentially.
- Temporary gzip/part files are removed after upload.
- Discord retention counts backup sets instead of individual multipart messages.
- Local SQLite backup behavior remains unchanged.

## Lucky Day
- Removed immediate catch-up draw on bot startup.
- If the bot starts/restarts after 12:00 MSK, today's missed Lucky Day is not fired by that restart.
- If the bot was already running before 12:00, the normal 12:00 draw still happens.

## Weekly Lottery
- Removed startup draw tick.
- An overdue open round found during restart is not drawn immediately.
- Its tickets/prize pool remain intact and its draw time is moved to the next Saturday 21:00 MSK.
- A process can only execute a lottery deadline that was still in the future when that process started.
