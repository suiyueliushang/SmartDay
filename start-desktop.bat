@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title SmartDay Desktop

echo ==========================================
echo   SmartDay Desktop - wallpaper calendar
echo ==========================================
echo.

if exist "smartday-web\dist\index.html" goto webok
echo [1/3] building web bundle, first run only ...
pushd smartday-web
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
popd
:webok
echo [1/3] web bundle ready

if exist "smartday-desktop\node_modules\electron\dist\electron.exe" goto depok
echo [2/3] installing desktop dependencies ...
pushd smartday-desktop
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
if exist "node_modules\electron\dist\electron.exe" goto depdone
echo       fetching electron binary ...
node node_modules\electron\install.js
:depdone
popd
:depok
echo [2/3] desktop dependencies ready

echo [3/3] starting SmartDay ...
echo       tray icon stays resident. Quit from tray menu.
pushd smartday-desktop
set ELECTRON_RUN_AS_NODE=
call npx electron . --open-main
popd
goto end

:fail
echo.
echo [ERROR] Failed. See messages above.
pause
:end
endlocal
