import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initApp } from "./app/bootstrap";
import { useStore } from "./store/store";
import { useUiStore } from "./store/uiStore";

// 调试句柄（浏览器控制台 / 桌面端冒烟测试：__smartday.store.getState()）
(window as unknown as { __smartday: unknown }).__smartday = { store: useStore, ui: useUiStore };

// 初始化应用（主题、种子数据、提醒引擎）——不阻塞首屏渲染
void initApp();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
