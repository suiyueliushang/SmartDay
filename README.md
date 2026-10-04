# SmartDay · 个人日程与任务管理工具

基于《SmartDay需求概述.md》生成的完整实现，包含 **网页端** 与 **桌面端（Windows 壁纸日历）**；移动端按约定暂不生成。

## 怎么运行（选一种）

### 方式一：双击启动脚本（推荐，零命令）

| 脚本 | 作用 |
|------|------|
| **`start-desktop.bat`** | 启动桌面端：壁纸日历 + 主应用窗口 + 托盘常驻（首次会自动构建网页端） |
| **`start-web.bat`** | 启动网页端开发服务器并打开浏览器（http://localhost:5173） |
| **`start-dev.bat`** | 开发模式：Vite 热更新 + Electron（改代码即时生效） |

> 退出桌面端：**右键托盘图标 → 退出 SmartDay**（直接关窗口只是隐藏到托盘，程序仍在运行）。

### 方式二：命令行

```bash
# 网页端（浏览器使用）
cd smartday-web
npm install            # 首次
npm run dev            # 开发服务器 → http://localhost:5173
npm run build          # 生产构建到 dist/
npm run preview        # 预览构建产物 → http://localhost:4173

# 桌面端（壁纸日历，需先有网页端构建产物）
cd ../smartday-desktop
npm install            # 首次
npm run build:web      # 若没构建过网页端，先执行这步
npm start              # 启动（等价于 electron . --open-main）
npm run dev            # 开发模式（需另开终端跑网页端 npm run dev）

# 自检与打包
npm run smoke          # 桌面端自动化自检（渲染/主题/双模式/真实鼠标点击/跨窗口同步/持久化）
npm run persist:write && npm run persist:verify   # 设置持久化两阶段重启校验
npm run dist           # 打包 Windows 安装包 + 免安装版 → release/
```

### 环境要求

- **Node.js ≥ 18**（当前验证于 Node 24 / npm 11）；Windows 10/11。
- 若命令行报 `app is undefined`：说明环境里被注入了 `ELECTRON_RUN_AS_NODE=1`，执行 `set ELECTRON_RUN_AS_NODE=` 后再启动（启动脚本已内置处理）。
- 桌面端同一时刻只允许一个实例（单实例锁）：已有实例时再次启动会直接唤起主窗口。

## 两个工程

| 工程 | 说明 | 技术栈 |
|------|------|--------|
| [`smartday-web/`](smartday-web) | 网页端（客户端）完整功能：日历 / 任务 / 概览 / 日记笔记 / 专注 / 提醒 / 搜索 / 设置 / 数据管理 / 云同步骨架 | React 18 + Vite + TypeScript + zustand + IndexedDB |
| [`smartday-desktop/`](smartday-desktop) | 桌面端：壁纸日历（4 主题 × 2 材质 / 锁定·编辑双模式 / 点击穿透 / ☰ 菜单 / 托盘 / Ctrl+Alt+D / 开机自启 / 实时同步 / 设置持久化）+ 主应用窗口 | Electron 33（复用网页端构建产物） |

两端共享同一套业务与数据层：桌面端通过 `app://smartday` 同源协议让主应用窗口与壁纸窗口共用同一份 IndexedDB，
并用 BroadcastChannel 实时同步（60 秒兜底轮询）。

## 文档

- 需求：[需求概述](SmartDay需求概述.md) · [桌面端需求文档](桌面端需求文档.md)
- 使用与自检：[网页端 README](smartday-web/README.md) · [桌面端 README](smartday-desktop/README.md)
- 版本记录：[CHANGELOG.md](CHANGELOG.md)

## 验证状态

- 网页端：TypeScript 严格检查通过、Vite 生产构建通过、24 项核心逻辑冒烟通过、真实浏览器 14 个路由零报错。
- 桌面端：`npm run smoke` 全项 PASS（只显示本月 / 阳历农历节日同行 / 农历简称 / 班·休角标 / 周末着色 / 4 主题分色 / 表头按钮顺序 / 锁定态控件禁用 / 真实鼠标点击解锁 / 锁定不沉底 / 自由缩放 / 0-100 连续透明度 / 跨窗口同步 / 零控制台错误）；设置持久化经两阶段真重启校验 PASS。
