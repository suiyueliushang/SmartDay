@echo off
REM ============================================================
REM  SmartDay 安卓端一键构建（Windows）
REM  作用：自动挑选 JDK 17/21（避开 Android Studio 的 Java 25 不兼容），
REM        构建 web 产物 → 同步 → 打包 Debug APK。
REM ============================================================
setlocal

set "ROOT=%~dp0"
set "WEB=%ROOT%..\smartday-web"
set "ANDROID=%ROOT%android"

REM ---- 1) 选择 JDK（优先 JBR/MS 的 21，其次 17；不要用 24+） ----
set "JAVA_HOME="
for %%D in (
  "%USERPROFILE%\.jdks\jbr-21.0.11"
  "%USERPROFILE%\.jdks\ms-21.0.12.1"
  "%USERPROFILE%\.jdks\jbr-17"
) do (
  if exist "%%~D\bin\java.exe" (
    if not defined JAVA_HOME set "JAVA_HOME=%%~D"
  )
)
if not defined JAVA_HOME (
  echo [WARN] 未找到 JDK 21/17，将使用系统默认 java。
  echo        若报 "Unsupported class file major version"，请安装 JDK 21 或
  echo        在 Android Studio 中把 Gradle JDK 设为 17/21。
) else (
  echo [INFO] JAVA_HOME=%JAVA_HOME%
  set "PATH=%JAVA_HOME%\bin;%PATH%"
)

REM ---- 2) 构建网页端产物 ----
echo.
echo [1/3] 构建网页端...
pushd "%WEB%"
call npm run build
if errorlevel 1 (
  echo [ERROR] 网页端构建失败。
  popd & exit /b 1
)
popd

REM ---- 3) 复制到 www 并同步 ----
echo.
echo [2/3] 同步到原生工程...
pushd "%ROOT%"
call npm run build:web
if errorlevel 1 ( echo [ERROR] 复制 web 产物失败。 & popd & exit /b 1 )
call npx cap sync android
if errorlevel 1 ( echo [ERROR] cap sync 失败。 & popd & exit /b 1 )
popd

REM ---- 4) 打包 APK ----
echo.
echo [3/3] 打包 Debug APK...
pushd "%ANDROID%"
call gradlew.bat assembleDebug
if errorlevel 1 ( echo [ERROR] 打包失败。 & popd & exit /b 1 )
popd

echo.
echo [OK] 构建完成：
echo      %ANDROID%\app\build\outputs\apk\debug\app-debug.apk
endlocal
