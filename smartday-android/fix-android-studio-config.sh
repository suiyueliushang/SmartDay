#!/usr/bin/env bash
# 修复 Android Studio「Error running 'app'：Module not specified / Module: <no module>」
#
# 用法：
#   情况 A（推荐）：配置已修正，只是 IDE 还没重新同步 ——
#      直接在 Android Studio 的 Build / Sync 面板点一次 ↻（Sync Project with Gradle Files）即可。
#   情况 B：配置被 IDE 退出时回写覆盖了 ——
#      先完全退出 Android Studio，再执行本脚本，然后重新打开 IDE：
#        bash smartday-android/fix-android-studio-config.sh
#
# 原理：
#  1) 运行配置里的模块名过期 → 改为 IDE 真实模块名 android.app（新版不再有 .main 后缀）
#  2) gradleJvm / project-jdk-name 必须是 IDE「JDK 注册表」里的名字（本机为 jbr-21，不是磁盘目录名 jbr-21.0.11）
#     典型报错：Invalid Gradle JDK configuration found.
#               Undefined jdk.table.xml entry with the name:jbr-21.0.11
#
# 注意：IDE 在运行时若正常退出，会用内存里的旧配置回写这些文件，所以情况 B 必须**先关 IDE**再跑本脚本。

set -euo pipefail
IDEA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/android/.idea" && pwd)"

if tasklist 2>/dev/null | grep -qi "studio64.exe"; then
  echo "❌ 检测到 Android Studio 仍在运行（studio64.exe）。"
  echo "   请先完全退出 Android Studio（File → Exit），再执行本脚本。"
  exit 1
fi

echo "→ .idea 目录：$IDEA_DIR"

# 1) 运行配置模块名：android.app.main → android.app
if [ -f "$IDEA_DIR/workspace.xml" ]; then
  sed -i 's#<module name="android\.app\.main" />#<module name="android.app" />#' "$IDEA_DIR/workspace.xml"
  echo "✔ workspace.xml 运行配置模块名 → android.app"
  grep -n 'module name=' "$IDEA_DIR/workspace.xml" || true
else
  echo "⚠ 未找到 workspace.xml（尚未在 IDE 中打开过该工程？）"
fi

# 2) gradleJvm：任何旧值 → jbr-21
if [ -f "$IDEA_DIR/gradle.xml" ]; then
  sed -i 's#<option name="gradleJvm" value="[^"]*" />#<option name="gradleJvm" value="jbr-21" />#' "$IDEA_DIR/gradle.xml"
  echo "✔ gradle.xml gradleJvm → jbr-21"
fi

# 3) project-jdk-name：任何旧值 → jbr-21
if [ -f "$IDEA_DIR/misc.xml" ]; then
  sed -i 's#project-jdk-name="[^"]*"#project-jdk-name="jbr-21"#' "$IDEA_DIR/misc.xml"
  echo "✔ misc.xml project-jdk-name → jbr-21"
fi

echo ""
echo "✅ 修复完成。现在重新打开 Android Studio（选择该 android 目录），"
echo "   等待右下角 Gradle Sync 完成，运行配置的 Module 下拉框即可正常选择 app。"
