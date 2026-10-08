# SmartDay · 智能日程与任务管理

> 把「看日历、记日程、管任务、写日记、专注做事」五件事合到一处 —— 一套业务内核，三种形态运行。

<p>
<img alt="platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20Web%20%7C%20Android-4f6ef7?style=flat-square">
<img alt="version" src="https://img.shields.io/badge/version-v1.3.5-10b981?style=flat-square">
<img alt="react" src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=white">
<img alt="vite" src="https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&logoColor=white">
<img alt="typescript" src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white">
<img alt="electron" src="https://img.shields.io/badge/Electron-33-47848f?style=flat-square&logo=electron&logoColor=white">
<img alt="capacitor" src="https://img.shields.io/badge/Capacitor-6-119eff?style=flat-square&logo=capacitor&logoColor=white">
</p>

SmartDay 是一款**本地优先（local-first）**的个人日程与任务管理工具。核心业务逻辑（农历、节假日、重复事件、日记识别口径、专注计时）只写一份，放在 Web 层，三个平台端各自只负责「渲染 + 系统能力」，从而保证三端行为与口径完全一致。

---

## 三种形态

| 形态 | 目录 | 干什么用 | 技术栈 |
|------|------|---------|--------|
| 🌐 **网页版** | [`smartday-web/`](smartday-web) | 浏览器里的完整功能，日常办公首选 | React 18 + Vite + TypeScript + zustand + IndexedDB |
| 🖥️ **桌面日历版** | [`smartday-desktop/`](smartday-desktop) | 日历直接「贴」在 Windows 桌面背景上，开机就能看到今天有什么安排 | Electron 33（复用网页端构建产物） |
| 📱 **安卓版** | [`smartday-android/`](smartday-android) | 手机使用，支持桌面小组件与本地精确提醒 | Capacitor + Kotlin 原生插件 |

> **数据同步现状**：三端**各自独立存储在本机**（网页端存浏览器 IndexedDB/localStorage，桌面端存 `%APPDATA%\smartday-desktop`，安卓端存应用私有目录），**互不联网**。
> 跨设备互通目前用 **「设置 → 数据管理 → 导出/导入全部数据(JSON)」** 整体搬迁；云同步的客户端引擎已经就绪，服务端接口约定见需求文档（官方云服务为规划项）。

---

## 功能一览

| 模块 | 说明 |
|------|------|
| 📅 **日历** | 年 / 月 / 周 / 日 / 议程五种视图；新建·重复事件（每天·每周·每月·每年·自定义间隔）；拖拽改期与调整时长；单击看当天事件/任务/笔记，双击新建 |
| ✅ **任务** | 智能清单 + 自定义清单分组；子步骤、标签、附件、多组提醒；四象限 / 看板 / 列表多视图；拖拽归类 |
| 📊 **概览** | 迷你日历、今日日程与任务、纪念日倒计时、本周统计，左右两栏等宽 |
| 📝 **笔记** | 日记与笔记**合并为一个页面**；Markdown 实时预览、阅读/编辑分离；给笔记打上「日记」标签即视为当天日记 |
| 🎯 **专注助手** | 番茄钟 / 正向计时两模式；手动开始、单会话约束；年 / 周 / 天多维分析 + GitHub 风格年度热力图 |
| 🖥️ **桌面日历** | 4 套配色主题 × 2 种材质；0–100 连续透明度；点击穿透（锁定）/ 编辑双模式；☰ 菜单；托盘常驻；开机自启 |
| 🔔 **提醒通知** | 应用内通知中心 + 多通道外部推送（浏览器 / QQ 机器人 / 邮箱 SMTP / Server酱 / PushPlus / 企业微信·钉钉·飞书群机器人 / 自定义 Webhook），可同时启用多条、支持免打扰与推送记录 |
| 🔍 **全局搜索** | `Ctrl + K` 一键检索事件、任务、纪念日、日记笔记 |
| ⚙️ **设置** | 主题、日历/任务/笔记/专注偏好、数据管理、同步设置；左侧导航栏宽度可拖拽调节并自动记忆（150–420px） |
| 💾 **数据管理** | 全量备份 JSON、日历 ICS、任务 CSV、日记 Markdown 的导入导出 |

---

## 快速开始

### 方式一：双击启动脚本（推荐，零命令）

| 脚本 | 作用 |
|------|------|
| **`start-desktop.bat`** | 启动桌面端：壁纸日历 + 主应用窗口 + 托盘常驻（首次会自动构建网页端） |
| **`start-web.bat`** | 启动网页端开发服务器并打开浏览器（http://localhost:5173） |
| **`start-dev.bat`** | 开发模式：Vite 热更新 + Electron（改代码即时生效） |

> 退出桌面端：**右键托盘图标 → 退出 SmartDay**（直接关窗口只是隐藏到托盘，程序仍在运行）。
>
> ⚠️ `start-desktop.bat` 会把程序**镜像到 `%LOCALAPPDATA%\SmartDay\` 再从本地磁盘运行** —— 因为 Electron 无法从 OneDrive 同步目录启动（会以 `0x80000003` 崩溃）。镜像只复制代码，**你的数据在 `%APPDATA%\smartday-desktop` 中，不受影响**。

### 方式二：命令行

```bash
# ---------- 网页端 ----------
cd smartday-web
npm install              # 首次
npm run dev              # 开发服务器 → http://localhost:5173
npm run build            # 生产构建 → dist/（内部先做 tsc 类型检查，再 vite build）
npm run preview          # 预览构建产物 → http://localhost:4173
npm run typecheck        # TypeScript 严格检查

# ---------- 桌面端 ----------
cd ../smartday-desktop
npm install              # 首次
npm run build:web        # 若没构建过网页端，先执行这步（调用 ../smartday-web 的 build）
npm start                # 启动（等价于 electron . --open-main）
npm run dev              # 开发模式（需另开终端跑网页端 npm run dev）
npm run smoke            # 自动化自检（渲染/主题/双模式/真实鼠标点击/跨窗口同步/持久化）
npm run dist             # 打包 Windows 安装包 + 免安装版 → release/

# ---------- 安卓端 ----------
cd ../smartday-android
npm install
npm run build:web        # 复制 smartday-web/dist → www/
npx cap sync android     # 同步到原生工程
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

### 环境要求

- **Node.js ≥ 18**（验证于 Node 24 / npm 11），Windows 10/11。
- **安卓构建**：JDK **17 或 21**（不要用 24+，Gradle 8.14.3 不支持 Java 25）；Android SDK platform 36 / build-tools 36。
- 若桌面端报 `app is undefined`：说明环境里残留 `ELECTRON_RUN_AS_NODE`，清空后再启动（启动脚本已内置处理）。
- 桌面端为**单实例**：已有实例时再次启动只会唤起主窗口。

---

## 项目结构

```
calendar-dsh/
├── smartday-web/            # 网页端（业务内核所在，被另外两端复用）
│   ├── src/
│   │   ├── pages/           # 概览 / 日历 / 今天 / 任务 / 笔记 / 专注 / 设置
│   │   ├── components/      # 事件弹窗 / 任务抽屉 / Markdown 编辑器 / 通知中心 / 日历子组件 …
│   │   ├── store/           # zustand 状态（业务唯一出入口）
│   │   ├── lib/             # 农历·节假日·重复规则·日记口径·提醒引擎·同步客户端·Markdown …
│   │   ├── db/              # IndexedDB 持久层
│   │   └── wallpaper/       # 桌面壁纸窗口的独立入口
│   ├── scripts/             # 构建（多入口 Rollup）、冒烟、逐项 UI 验证脚本
│   └── vite.config.ts       # 双入口：index.html（主应用）+ wallpaper.html（壁纸窗口）
│
├── smartday-desktop/        # 桌面端（Electron）
│   └── electron/            # 主进程 / 托盘 / 壁纸窗口 / 邮件 / 单实例锁
│
├── smartday-android/        # 安卓端（Capacitor + Kotlin）
│   ├── www/                 # Web 产物中转目录（由 smartday-web/dist 复制，可再生）
│   └── android/app/src/main/java/com/smartday/app/
│       ├── bridge/          # Web ⇄ 原生桥接
│       ├── widget/          # 今日日程 / 月历 桌面小组件
│       ├── notify/          # 精确闹钟 + 开机重排
│       └── focus/           # 专注前台保活服务
│
├── releases/                # 归档的 APK 与源码包
└── *.md                     # 各端需求文档（见下方「文档」）
```

> **重要**：`smartday-web/dist` 是**三端共用**的构建产物。改动任何一个平台后重新构建 `dist`，都会影响另外两个平台的运行结果，重新构建后记得同步到安卓 `www/` 与桌面镜像目录。

---

## 文档

| 文档 | 内容 |
|------|------|
| [SmartDay 需求概述](SmartDay需求概述.md) | 产品是什么、能做什么，各模块功能总览（人话版） |
| [网页端需求文档](网页端需求文档.md) | 网页端逐条需求 + 20 条可自动化验收标准（W-A1~W-A20） |
| [桌面端需求文档](桌面端需求文档.md) | 壁纸日历的单元格规则、主题材质、双模式交互 |
| [安卓端需求文档](安卓端需求文档.md) | 小组件、通知、专注服务与各项验收标准（A-A1~A-A17） |
| [推送通知设置](推送通知设置.md) | 把提醒发到 QQ / 微信 / 邮箱的完整配置步骤 |
| [更新日志](CHANGELOG.md) | 逐版本变更记录 |
| [功能介绍文档](SmartDay功能介绍文档.docx) | 含真实运行截图的对外说明（Word） |

各端目录下另有独立 README：[网页端](smartday-web/README.md) · [桌面端](smartday-desktop/README.md) · [安卓端](smartday-android/README.md)。

---

## 验证状态

| 端 | 验证方式 | 状态 |
|----|---------|------|
| 网页端 | TypeScript 严格检查 · 生产构建 · 核心逻辑冒烟 · 真实浏览器多路由零报错 | ✅ |
| 桌面端 | `npm run smoke` 全项 PASS（渲染 / 4 主题分色 / 锁定·编辑双模式 / 真实鼠标点击解锁 / 自由缩放 / 0–100 透明度 / 跨窗口同步 / 零控制台错误）；设置持久化经**两阶段真重启**校验 | ✅ |
| 安卓端 | APK 解包核对原生类 · 19 项小组件数据冒烟 · 逐项移动端 UI 断言 · 模拟器实测 | ✅ |

---

## 数据与隐私

- **全部数据存在本机**，不依赖任何服务器即可完整使用；离线可用。
- 桌面端数据目录：`%APPDATA%\smartday-desktop\`（`desktop-settings.json` + Chromium 存储），**不在代码仓库内**。
- 网页端数据：浏览器 localStorage + IndexedDB，**不在代码仓库内**。
- 外部推送为**可选**功能，仅在你自己配置通道后才会把提醒内容发往所选的第三方服务；SMTP 邮箱密码等敏感配置仅存本机。

---

## 许可

本项目为个人自用项目，暂未附带开源许可证。如需复用代码请先与作者联系。
