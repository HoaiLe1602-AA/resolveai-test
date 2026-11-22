@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Dang khoi dong ResolveAI... (giu cua so nay mo)
start "" "http://localhost:3000/admin"
node server.js
pause
