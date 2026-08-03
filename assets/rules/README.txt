GAME SYNDICATE — КОДЕКС СООБЩЕСТВА

Добавлено:
- commands/publish-code.js
- data/communityCode.json
- assets/rules/

Команда публикации: /publish-code
Доступ: только пользователям с правом Administrator.
Канал публикации: 1493230619218542733.

Баннеры положить в assets/rules/ с именами:
01_welcome.png
02_acceptance.png
03_rules_1.png
04_rules_2.png
05_rules_3.png
06_rules_4.png
07_punishments.png
08_rights.png
09_staff.png
10_responsibility.png
11_final_provisions.png
12_final.png

Если конкретного баннера нет, команда не ломается: пропускает изображение и публикует Embed.

После загрузки проекта на хост зарегистрировать новую slash-команду:
npm run deploy:prod

Затем перезапустить бота и один раз выполнить /publish-code.
Внимание: повторный запуск команды повторно опубликует весь Кодекс.
