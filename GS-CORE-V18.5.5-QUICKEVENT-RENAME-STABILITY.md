# GS CORE V18.5.5 — Quick Event & Rename Stability

- Fixed economy log INSERT mismatch that broke Dust spending, including hero rename.
- Hero rename now defers the modal response and performs payment + rename atomically.
- Quick Event answers now bind to the newest active round in the actual channel.
- Stale duplicate active rounds are expired automatically.
- Correct answers receive a check reaction before winner rendering.
- Added anagram letter-set fallback.
- Removed empty event stubs and transient cache/log files.
