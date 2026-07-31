# GS CORE V19.7.4 — Private Gift Menu Fix

- The Gift button in the public Guild hub now opens a separate ephemeral response visible only to the invoking player.
- Selecting a recipient is acknowledged immediately with `deferUpdate()` and then edits the private gift menu, preventing Discord's interaction timeout.
- Recipient resolution supports both Discord user-select collections and raw selected values.
