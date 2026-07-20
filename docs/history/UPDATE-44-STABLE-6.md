# GS CORE STABLE 6

## Startup race fix

- Telegram `/game` waits up to 15 seconds for the Discord client to become ready.
- If Discord is still starting, the command returns a clear retry message instead of a stack trace.
- Lobby rows are inserted only after Discord readiness and channel availability checks, preventing orphaned open lobbies after startup failures.
- Other Telegram commands and polling remain unchanged.
- No database migrations or gameplay changes.
