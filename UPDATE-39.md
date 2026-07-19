# GS BUILD 39 — Commercial Stability

## Storage Recovery v2
- Storage startup logs now report `LOCAL`, `RECOVERY`, or `FRESH_INSTALL` instead of treating a new container as a bot failure.
- Recovery writes a machine-readable status file in the persistent directory.
- SQLite `-wal` and `-shm` sidecars are removed before replacing/restoring the database to avoid stale journal mismatches.
- A clean first installation without a Discord backup remains supported.

## SQLite hardening
- Main database uses WAL journal mode.
- `synchronous=NORMAL` for WAL-safe production performance.
- `busy_timeout=10000`, `foreign_keys=ON`, and `temp_store=MEMORY`.
- Backups remain consistent because they use `better-sqlite3`'s online `backup()` API.

## Production log cleanup
- Removed source grep output, SHA-256 dump, directory listing, and duplicate path diagnostics from normal container startup.
- Updated runtime build marker and concise storage/database/backup status messages.

No game economy, cards, achievements, Crocodile, trade, or auction rules were changed.
