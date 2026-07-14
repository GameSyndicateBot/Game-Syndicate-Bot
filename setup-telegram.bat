@echo off
chcp 65001 >nul
title Game Syndicate - Telegram Setup
cd /d "%~dp0"

echo ==============================================
echo   GAME SYNDICATE - TELEGRAM BOT SETUP
echo ==============================================
echo.
echo [1/3] Настраиваю официальный npm registry...
call npm config set registry https://registry.npmjs.org/
if errorlevel 1 goto error

echo.
echo [2/3] Устанавливаю зависимости...
call npm install
if errorlevel 1 goto error

echo.
echo [3/3] Сохраняю токен Telegram BotFather...
call npm run telegram:setup
if errorlevel 1 goto error

echo.
echo ==============================================
echo   ГОТОВО. Теперь запусти: node index.js
echo ==============================================
pause
exit /b 0

:error
echo.
echo ==============================================
echo   ОШИБКА. Проверь интернет и повтори запуск.
echo ==============================================
pause
exit /b 1
