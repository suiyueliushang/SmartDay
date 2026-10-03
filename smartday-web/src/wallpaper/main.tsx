import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";
import "./wallpaper.css";
import { WallpaperApp } from "./WallpaperApp";
import { initApp } from "../app/bootstrap";
import { useStore } from "../store/store";
import { useUiStore } from "../store/uiStore";

// 调试句柄
(window as unknown as { __smartday: unknown }).__smartday = { store: useStore, ui: useUiStore };

// 壁纸窗口：只加载数据做展示，不触发提醒/云同步/清理
void initApp({ role: "wallpaper" });

ReactDOM.createRoot(document.getElementById("wallpaper-root")!).render(
  <React.StrictMode>
    <WallpaperApp />
  </React.StrictMode>
);
