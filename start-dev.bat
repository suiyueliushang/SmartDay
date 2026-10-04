@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title SmartDay Dev

echo [dev] starting Vite dev server in a new window ...
start "SmartDay Vite" cmd /k "cd /d %~dp0smartday-web && npm run dev"
timeout /t 6 /nobreak >nul

echo [dev] starting Electron, loads http://localhost:5173 ...
pushd smartday-desktop
set ELECTRON_RUN_AS_NODE=
call npx electron . --dev --open-main
popd
endlocal
