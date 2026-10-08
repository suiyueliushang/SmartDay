// ============================================================
// 应用外壳：布局 + 路由 + 全局覆盖层（搜索/通知/事件弹窗/任务详情/专注/Toast）
// ============================================================
import React, { useEffect, useState } from "react";
import { useRoute } from "@/lib/router";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { useIsMobile } from "@/hooks/useIsMobile";
import { NotificationCenter } from "@/components/NotificationCenter";
import { SearchModal } from "@/components/SearchModal";
import { EventModal } from "@/components/EventModal";
import { TaskDetailDrawer } from "@/components/TaskDetailDrawer";
import { FocusPanel } from "@/components/FocusPanel";
import { TodayCalendarPage } from "@/pages/TodayCalendarPage";
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
  const openTaskDetail = useUiStore((s) => s.openTaskDetail);
  const isMobile = useIsMobile();
  // 切换左侧导航 / 功能标签时，自动关闭右侧任务详情抽屉
  useEffect(() => {
    if (useUiStore.getState().taskDetailId) useUiStore.getState().openTaskDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.name, route.listId, route.groupId, route.view, route.tab]);
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
      className={"app-shell" + (sidebarCollapsed ? " collapsed" : "") + (taskDetailId ? " drawer-open" : "") + (isMobile ? " mobile" : "")}
      style={navW ? ({ "--nav-w": navW + "px" } as React.CSSProperties) : undefined}
      onClick={(e) => {
        // 点击左侧空白区域关闭右侧任务详情（抽屉内部与按钮/输入等交互元素不关闭）
        if (!useUiStore.getState().taskDetailId) return;
        const t = e.target as HTMLElement;
        if (
          t.closest(".side-drawer") || t.closest("button") || t.closest("input") ||
          t.closest("select") || t.closest("textarea") || t.closest(".nav-item") ||
          t.closest(".task-item") || t.closest(".month-cell") || t.closest(".note-feed-card") ||
          // 需求 W-3.3：笔记页左侧导航项 / 标签、可排序元素等点击不误关抽屉
          t.closest(".notes-nav-item") || t.closest(".notes-tag") || t.closest(".notes-nav") ||
          t.closest(".sortable") || t.closest(".settings-item") || t.closest(".seg") ||
          t.closest(".task-check") || t.closest(".tab") || t.closest("[role='tab']") ||
          // 日历「当天详情」的条目（点它才打开的任务抽屉，不能同一次点击又把它关掉）
          t.closest(".dd-item") || t.closest(".day-detail") || t.closest(".agenda-day") ||
          t.closest(".today-item") || t.closest(".board-card")
        ) return;
        openTaskDetail(null);
      }}
    >
      {!isMobile && <Sidebar />}
      {/* 推拉调节：拖动改变左侧导航栏宽度（双击恢复默认），宽度会被记忆（移动端隐藏） */}
      {!isMobile && (
        <div
          className="nav-resizer"
          title="拖动调节导航栏宽度，双击恢复默认"
          onMouseDown={startNavDrag}
          onDoubleClick={() => { setNavW(0); localStorage.removeItem("smartday.navWidth"); }}
        />
      )}
      <div className="main">
        <Topbar />
        <main className="content">
          {/* 需求 C：今天 + 日历 合并为同一页（上半部今日概览，下半部内嵌日历） */}
          {route.name === "overview" && <TodayCalendarPage />}
          {route.name === "calendar" && <CalendarPage />}
          {route.name === "tasks" && <TasksPage />}
          {route.name === "diary" && <NotesPage />}
          {route.name === "focus" && <FocusPage />}
          {route.name === "settings" && <SettingsPage />}
        </main>
      </div>

      {/* 移动端底部导航（5 项：日历 / 任务 / 笔记 / 专注 / 设置） */}
      {isMobile && <MobileBottomNav />}

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
