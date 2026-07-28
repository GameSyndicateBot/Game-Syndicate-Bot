# GS CORE V19.2.8 — GS Blitz Question Rotation

- Added persistent history of recently shown questions per category.
- Exact duplicates are blocked even when generated as numbered variants.
- Near-duplicate wording is filtered using normalized token similarity.
- Current match has its own semantic-used set, so the same idea cannot return under another ID.
- Last 120 questions per category are remembered across matches and bot restarts.
- If a category is exhausted, the selector relaxes only cross-match history while still preventing duplicates inside the active match.
