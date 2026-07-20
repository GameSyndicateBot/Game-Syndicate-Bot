# Audit Phase 1 — SQLite and hot paths

## Implemented

- Added indexes for active game-event lookup, active event participants, and daily-history ordering.
- Removed the auction-history N+1 query pattern: card rows are now loaded with one LEFT JOIN and hydrated in memory.
- Reworked `/refreshroles` so achievements are loaded once, grouped in memory, and stale rows are removed in one transaction instead of issuing one SELECT per player.
- Reworked event start/finish participant writes to reuse prepared statements and execute batches in transactions.
- Removed stale `.bak` source files from the release archive.

## Safety

- No economy formulas, reward values, card drop chances, command names, or user-facing game rules were changed.
- Existing SQLite journal and backup behavior was not changed.
