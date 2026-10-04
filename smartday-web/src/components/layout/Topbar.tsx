import React from "react";
import { useRoute } from "@/lib/router";
import { useUiStore } from "@/store/uiStore";
import { useStore } from "@/store/store";
import { applyTheme } from "@/app/bootstrap";
import { navigate } from "@/lib/router";
import { fmtDateWithTemplate, todayStr, fmtDate } from "@/lib/date";

const TITLES: Record<string, string> = {
  overview: "概览",
  calendar: "日历",
  tasks: "任务",
  diary: "日记与笔记",
  focus: "专注助手",
  settings: "设置",
  desktop: "桌面日历",
};

export function Topbar() {
  const route = useRoute();
  const ui = useUiStore();
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);
  const theme = useStore((s) => s.settings.general.theme);
  const dateFormat = useStore((s) => s.settings.general.dateFormat);

  return (
    <header className="topbar">
      <button className="btn-icon" onClick={() => ui.toggleSidebar()} title="切换侧边栏 (Ctrl+B)">☰</button>
      <div className="topbar-title">{TITLES[route.name] ?? "SmartDay"}</div>
      <div className="topbar-search" onClick={() => ui.setSearchOpen(true)}>
        <span>🔍</span>
        <span>搜索事件、任务、日记…</span>
        <kbd>Ctrl K</kbd>
      </div>
      <div style={{ flex: 1 }} />
      <button className="btn btn-sm" onClick={() => { navigate({ name: "tasks" }); }} title="新建任务 (Ctrl+N)">＋ 新建任务</button>
      <button className="btn btn-sm" onClick={() => {
        const now = new Date();
        const start = fmtDate(now) + "T" + now.getHours().toString().padStart(2, "0") + ":00";
        ui.openEventModal({ open: true, start, end: start });
      }} title="新建事件 (Ctrl+Shift+N)">＋ 事件</button>
      <button
        className={"btn-icon" + (theme !== "light" ? " active" : "")}
        onClick={() => {
          const next = theme === "dark" ? "light" : "dark";
          void useStore.getState().updateSettings((s) => ({ ...s, general: { ...s.general, theme: next } }));
          applyTheme(next);
        }}
        title="切换主题"
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
      <button className="btn-icon" onClick={() => {
        ui.setNotifOpen(!ui.notifOpen);
        if ("Notification" in window && Notification.permission === "default") {
          void Notification.requestPermission();
        }
      }} title="通知中心" style={{ position: "relative" }}>
        🔔
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 1, right: 1, background: "var(--danger)", color: "#fff",
            borderRadius: 10, fontSize: 10, minWidth: 16, height: 16, display: "grid", placeItems: "center",
            padding: "0 3px", fontWeight: 700,
          }}>{unread}</span>
        )}
      </button>
    </header>
  );
}
