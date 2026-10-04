// ============================================================
// 应用外壳：布局 + 路由 + 全局覆盖层（搜索/通知/事件弹窗/任务详情/专注/Toast）
// ============================================================
import React from "react";
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
import { DesktopPage } from "@/pages/DesktopPage";

export default function App() {
  const route = useRoute();
  const ready = useStore((s) => s.ready);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toast = useUiStore((s) => s.toast);
  const taskDetailId = useUiStore((s) => s.taskDetailId);
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
    <div className={"app-shell" + (sidebarCollapsed ? " collapsed" : "") + (taskDetailId ? " drawer-open" : "")}>
      <Sidebar />
      <div className="main">
        <Topbar />
        <main className="content">
          {route.name === "overview" && <OverviewPage />}
          {route.name === "calendar" && <CalendarPage />}
          {route.name === "tasks" && <TasksPage />}
          {route.name === "diary" && <NotesPage />}
          {route.name === "focus" && <FocusPage />}
          {route.name === "settings" && <SettingsPage />}
          {route.name === "desktop" && <DesktopPage />}
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
