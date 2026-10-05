import React from "react";
import { useRoute, navigate, Route } from "@/lib/router";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { syncStatus } from "@/lib/syncClient";
import { todayStr } from "@/lib/date";

interface NavDef {
  name: Route["name"];
  label: string;
  ico: string;
  badge?: number | string;
  section: string;
}

export function Sidebar() {
  const route = useRoute();
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const syncDirty = useStore((s) => s.syncDirty);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  const incomplete = tasks.filter((t) => !t.completed).length;
  const todayDiary = useStore((s) => s.diaries.some((d) => d.date === todayStr()));
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);

  const navs: NavDef[] = [
    { name: "overview", label: "概览", ico: "📊", section: "工作台" },
    { name: "calendar", label: "日历", ico: "📅", section: "工作台" },
    { name: "tasks", label: "任务", ico: "✅", badge: incomplete || undefined, section: "工作台" },
    { name: "diary", label: "笔记", ico: "📝", badge: todayDiary ? "📝" : undefined, section: "记录" },
    { name: "focus", label: "专注助手", ico: "🎯", section: "记录" },
    { name: "settings", label: "设置", ico: "⚙️", section: "更多" },
  ];

  if (collapsed) return null;

  let lastSection = "";
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="logo">✅</span>
        <span>SmartDay</span>
      </div>
      <nav className="sidebar-nav">
        {navs.map((n) => {
          const sep = n.section !== lastSection ? <div className="nav-section">{n.section}</div> : null;
          lastSection = n.section;
          const active = route.name === n.name;
          return (
            <React.Fragment key={n.name}>
              {sep}
              <div className={"nav-item" + (active ? " active" : "")} onClick={() => navigate({ name: n.name })}>
                <span className="nav-ico">{n.ico}</span>
                <span>{n.label}</span>
                {n.badge != null && <span className="nav-badge">{n.badge}</span>}
              </div>
            </React.Fragment>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <span className={"sync-dot" + (syncDirty ? " pending" : settings.sync.enabled ? "" : " off")} />
        <span>{syncStatusText()}</span>
      </div>
    </aside>
  );

  function syncStatusText() {
    if (!settings.sync.enabled) return "本地模式";
    if (syncDirty) return "待同步…";
    return "云同步已开启";
  }
}
