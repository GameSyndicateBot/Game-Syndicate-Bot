# GS CORE STABLE 4 FIX

Safe Bothost compatibility update.

- Replaced Docker ENTRYPOINT with CMD invoking the same startup script through `/bin/sh`.
- Preserved unified build metadata, runtime fingerprint checks, WAL mode, backups, and storage recovery.
- No database schema, gameplay, Discord, Telegram, rewards, or server configuration changes.
