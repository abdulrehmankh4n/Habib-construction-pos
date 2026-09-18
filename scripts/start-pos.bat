@echo off
title Construction POS server
cd /d "%~dp0.."
echo Starting Construction POS...
echo.
echo Keep this window open while the shop is using the system.
echo Press Ctrl+C to stop.
echo.
call npm start
pause
