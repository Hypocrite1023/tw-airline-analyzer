@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting TW Airline Analyzer at http://localhost:3001 ...
start "" http://localhost:3001
node server/index.js
pause
