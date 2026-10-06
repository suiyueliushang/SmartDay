@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title SmartDay Desktop

echo ==========================================
echo   SmartDay Desktop - wallpaper calendar
echo ==========================================
echo.

rem NOTE: keep this file ASCII-only (non-ASCII text breaks cmd parsing).
rem NOTE: Electron cannot start from a OneDrive-synced folder (it crashes with
rem       0x80000003 / code -2147483645). So we mirror the app to local disk and
rem       run it from there. Your data lives in %APPDATA%\smartday-desktop and is
rem       NOT touched by the mirror.

set "LOCALROOT=%LOCALAPPDATA%\SmartDay"
set "LOCALDESK=%LOCALROOT%\smartday-desktop"

if exist "smartday-web\dist\index.html" goto webok
echo [1/4] building web bundle, first run only ...
pushd smartday-web
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
popd
:webok
echo [1/4] web bundle ready

if exist "smartday-desktop\node_modules\electron\dist\electron.exe" goto depok
echo [2/4] installing desktop dependencies ...
pushd smartday-desktop
call npm install --no-audit --no-fund
popd
:depok
if exist "smartday-desktop\node_modules\electron\dist\electron.exe" goto mkmirror
echo [2/4] electron binary missing, please run: cd smartday-desktop && npm install electron@33
goto fail
:mkmirror
echo [2/4] desktop dependencies ready

echo [3/4] mirroring app to local disk (incremental, first run may take a while) ...
if not exist "%LOCALROOT%" mkdir "%LOCALROOT%"
robocopy "%~dp0smartday-desktop" "%LOCALDESK%" /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 >nul
robocopy "%~dp0smartday-web\dist" "%LOCALROOT%\smartday-web\dist" /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 >nul
if not exist "%LOCALDESK%\node_modules\electron\dist\electron.exe" goto fail
echo [3/4] mirror ready: %LOCALDESK%

echo [4/4] starting SmartDay ...
echo       tray icon stays resident. Quit from tray menu.
pushd "%LOCALDESK%"
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_NO_ATTACH_CONSOLE="
"node_modules\electron\dist\electron.exe" . --open-main %*
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" (
  echo.
  echo [ERROR] electron exited with code %RC%
  goto fail
)
echo.
echo SmartDay exited ^(code 0^).
pause
goto end

:fail
echo.
echo [ERROR] Failed. See messages above.
pause
:end
endlocal
