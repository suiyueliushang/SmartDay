@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0smartday-web"
title SmartDay Web

echo ==========================================
echo   SmartDay Web - http://localhost:5173
echo ==========================================
echo.

if exist node_modules goto start
echo installing web dependencies ...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
:start
start "" http://localhost:5173
call npm run dev
goto end

:fail
echo.
echo [ERROR] Failed. See messages above.
pause
:end
endlocal
