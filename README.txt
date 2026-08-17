GAME SYNDICATE V20.3.7

Это update-патч. Распаковать в КОРЕНЬ GitHub-репозитория с заменой файлов,
закоммитить и нажать обновление на хосте.

Ключевой фикс:
старый Dockerfile останавливал сборку, потому что проверял V5,
а automaticBackups.js уже был V7. Теперь оба используют V8.

НЕ добавляйте в GitHub свежие runtime базы:
database/database.sqlite
database/*.sqlite-wal
database/*.sqlite-shm
telegram/data/*.sqlite*

Рабочая база хоста находится в /app/shared/database.sqlite.
