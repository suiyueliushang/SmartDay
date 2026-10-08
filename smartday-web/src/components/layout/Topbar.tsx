import React from "react";
import { useRoute } from "@/lib/router";
import { useUiStore } from "@/store/uiStore";
import { useStore } from "@/store/store";
import { applyTheme } from "@/app/bootstrap";
import { navigate } from "@/lib/router";
import { useIsMobile } from "@/hooks/useIsMobile";
import { fmtDate } from "@/lib/date";

const TITLES: Record<string, string> = {
  // 需求 C：overview 路由承载「今天 + 日历」合并页
  overview: "日历",
  calendar: "日历",
  tasks: "任务",
  diary: "笔记",
  focus: "专注助手",
  settings: "设置",
};

export function Topbar() {
  const route = useRoute();
  const ui = useUiStore();
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);
  const theme = useStore((s) => s.settings.general.theme);
  const isMobile = useIsMobile();

  const openNewEvent = () => {
    const now = new Date();
    const start = fmtDate(now) + "T" + now.getHours().toString().padStart(2, "0") + ":00";
    ui.openEventModal({ open: true, start, end: start });
  };

  // 移动端：精简顶栏（标题 + ＋ + 搜索 + 主题 + 通知），无侧边栏折叠按钮
  if (isMobile) {
    return (
      <header className="topbar topbar-mobile">
        <div className="topbar-title">{TITLES[route.name] ?? "SmartDay"}</div>
        <div style={{ flex: 1 }} />
        <button className="btn-icon" onClick={openNewEvent} title="新建">＋</button>
        <button className="btn-icon" onClick={() => ui.setSearchOpen(true)} title="搜索">🔍</button>
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
        <button className="btn-icon" onClick={() => ui.setNotifOpen(!ui.notifOpen)} title="通知中心" style={{ position: "relative" }}>
          🔔
          {unread > 0 && (
            <span className="topbar-badge">{unread}</span>
          )}
        </button>
      </header>
    );
  }

  return (
    <header className="topbar">
      <button className="btn-icon" onClick={() => ui.toggleSidebar()} title="折叠/展开侧边栏">☰</button>
      <div className="topbar-title">{TITLES[route.name] ?? "SmartDay"}</div>
      <div className="topbar-search" onClick={() => ui.setSearchOpen(true)}>
        <span>🔍</span>
        <span>搜索事件、任务、笔记…</span>
      </div>
      <div style={{ flex: 1 }} />
      <button className="btn btn-sm" onClick={() => { navigate({ name: "tasks" }); }} title="新建任务">＋ 新建任务</button>
      <button className="btn btn-sm" onClick={openNewEvent} title="新建事件">＋ 事件</button>
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
          <span className="topbar-badge">{unread}</span>
        )}
      </button>
    </header>
  );
}
