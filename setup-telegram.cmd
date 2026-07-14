@echo off
chcp 65001 >nul
title GS Telegram Setup

echo ==========================================
echo GS Telegram Bot setup - no npm install
echo ==========================================
echo.
echo This version uses built-in Node.js fetch.
echo The grammy package is not required.
echo.
node telegram\setup-token.js
echo.
echo After saving the token, run:
echo node index.js
echo.
pause
