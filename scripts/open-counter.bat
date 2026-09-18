@echo off
REM Opens the POS in a clean app window (no tabs, no address bar).
REM Change the address below to the server computer's address, e.g. http://192.168.1.10:3000
set POS_URL=http://localhost:3000

start "" msedge --app=%POS_URL% --start-maximized 2>nul
if errorlevel 1 start "" chrome --app=%POS_URL% --start-maximized
