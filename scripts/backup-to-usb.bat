@echo off
REM Copies today's database backups to a USB drive. Change E: to your drive letter.
set TARGET=E:\pos-backups
cd /d "%~dp0.."
if not exist "%TARGET%" mkdir "%TARGET%"
xcopy /Y /I "data\backups\*.db" "%TARGET%"
echo.
echo Backups copied to %TARGET%
pause
