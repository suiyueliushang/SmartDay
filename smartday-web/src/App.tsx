// ============================================================
// 应用外壳：布局 + 路由 + 全局覆盖层（搜索/通知/事件弹窗/任务详情/专注/Toast）
// ============================================================
import React, { useState } from "react";
import { useRoute } from "@/lib/router";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { NotificationCenter } from "@/components/NotificationCenter";
import { SearchModal } from "@/components/SearchModal";
import { EventModal } from "@/components/EventModal";
import { TaskDetailDrawer } from "@/components/TaskDetailDrawer";
import { FocusPanel } from "@/components/FocusPanel";
import { OverviewPage } from "@/pages/OverviewPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { TasksPage } from "@/pages/TasksPage";
import { NotesPage } from "@/pages/NotesPage";
import { FocusPage } from "@/pages/FocusPage";
import { SettingsPage } from "@/pages/SettingsPage";

export default function App() {
  const route = useRoute();
  const ready = useStore((s) => s.ready);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toast = useUiStore((s) => s.toast);
  const taskDetailId = useUiStore((s) => s.taskDetailId);
  // 导航栏宽度：可拖动调节，记忆在 localStorage，下次打开沿用（0 = 用默认宽度）
  const [navW, setNavW] = useState<number>(() => Number(localStorage.getItem("smartday.navWidth")) || 0);
  const startNavDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const el = document.querySelector(".sidebar") as HTMLElement | null;
    const base = navW || el?.getBoundingClientRect().width || 236;
    const move = (ev: MouseEvent) => {
      const w = Math.min(420, Math.max(150, Math.round(base + ev.clientX - startX)));
      setNavW(w);
      localStorage.setItem("smartday.navWidth", String(w));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.classList.remove("nav-resizing");
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.classList.add("nav-resizing");
  };
  // 说明：本应用已按需求移除全部键盘快捷键（含 Ctrl+K 等）。

  if (!ready) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div>SmartDay 正在加载本地数据…</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={"app-shell" + (sidebarCollapsed ? " collapsed" : "") + (taskDetailId ? " drawer-open" : "")}
      style={navW ? ({ "--nav-w": navW + "px" } as React.CSSProperties) : undefined}
    >
      <Sidebar />
      {/* 推拉调节：拖动改变左侧导航栏宽度（双击恢复默认），宽度会被记忆 */}
      <div
        className="nav-resizer"
        title="拖动调节导航栏宽度，双击恢复默认"
        onMouseDown={startNavDrag}
        onDoubleClick={() => { setNavW(0); localStorage.removeItem("smartday.navWidth"); }}
      />
      <div className="main">
        <Topbar />
        <main className="content">
          {route.name === "overview" && <OverviewPage />}
          {route.name === "calendar" && <CalendarPage />}
          {route.name === "tasks" && <TasksPage />}
          {route.name === "diary" && <NotesPage />}
          {route.name === "focus" && <FocusPage />}
          {route.name === "settings" && <SettingsPage />}
        </main>
      </div>

      {/* 全局覆盖层 */}
      <SearchModal />
      <NotificationCenter />
      <EventModal />
      <TaskDetailDrawer />
      <FocusPanel />
      {toast && (
        <div className={"toast " + toast.type}>
          {toast.type === "success" ? "✅" : toast.type === "error" ? "⚠️" : "💡"} {toast.text}
        </div>
      )}
    </div>
  );
}
