# SmartDay · 个人日程与任务管理工具

基于《SmartDay需求概述.md》生成的完整实现，包含 **网页端** 与 **桌面端（Windows 壁纸日历）**；移动端按约定暂不生成。

## 两个工程

| 工程 | 说明 | 技术栈 |
|------|------|--------|
| [`smartday-web/`](smartday-web) | 网页端（客户端）完整功能：日历 / 任务 / 概览 / 日记笔记 / 专注 / 提醒 / 搜索 / 设置 / 数据管理 / 云同步骨架 | React 18 + Vite + TypeScript + zustand + IndexedDB |
| [`smartday-desktop/`](smartday-desktop) | 桌面端：壁纸日历（双样式 / 双模式 / 点击穿透 / 托盘 / Ctrl+Alt+D / 开机自启 / 实时同步）+ 主应用窗口 | Electron 33（复用网页端构建产物） |

两端共享同一套业务与数据层：桌面端通过 `app://smartday` 同源协议让主应用窗口与壁纸窗口共用同一份 IndexedDB，
并用 BroadcastChannel 实时同步（60 秒兜底轮询）。

## 快速开始

```bash
# 网页端
cd smartday-web
npm install
npm run dev            # http://localhost:5173

# 桌面端（先构建网页端）
cd ../smartday-desktop
npm install && npm run make-icons
npm start              # 启动桌面日历 + 主应用窗口
npm run smoke          # 桌面端自动化冒烟（渲染/双模式/跨窗口同步/截图）
```

详细文档：[网页端 README](smartday-web/README.md) · [桌面端 README](smartday-desktop/README.md)

## 验证状态

- 网页端：TypeScript 严格检查通过、Vite 生产构建通过、24 项核心逻辑冒烟通过、真实浏览器 14 个路由零报错。
- 桌面端：生产与开发两种模式冒烟均 PASS（壁纸 42 日期格 / 双样式切换 / 双模式切换 / 主应用 7 导航项 / **主应用建任务后壁纸窗口即时收到** / 零控制台错误与警告）。
