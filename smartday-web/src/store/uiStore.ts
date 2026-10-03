// UI 状态：日历游标、弹窗、搜索、通知中心、专注弹层等
import { create } from "zustand";
import { CalendarView, FocusMode } from "@/types";
import { todayStr } from "@/lib/date";

export interface EventModalState {
  open: boolean;
  eventId?: string;
  /** 预设日期/时间（新建时） */
  start?: string;
  end?: string;
  allDay?: boolean;
  categoryId?: string;
}

interface UiState {
  // 日历
  activeDate: string; // yyyy-MM-dd（当前日历聚焦日期）
  calendarView: CalendarView;
  setActiveDate: (d: string) => void;
  setCalendarView: (v: CalendarView) => void;

  // 弹窗
  eventModal: EventModalState;
  openEventModal: (s: Partial<EventModalState> & { open: true }) => void;
  closeEventModal: () => void;

  taskDetailId: string | null;
  openTaskDetail: (id: string | null) => void;

  focusPanelOpen: boolean;
  focusTarget: { id: string; type: "task" | "event"; title: string; endAt?: number } | null;
  focusMode: FocusMode;
  openFocusPanel: (target?: { id: string; type: "task" | "event"; title: string; endAt?: number }, mode?: FocusMode) => void;
  closeFocusPanel: () => void;

  // 全局
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  notifOpen: boolean;
  setNotifOpen: (v: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  toast: { id: number; text: string; type: "info" | "success" | "error" } | null;
  showToast: (text: string, type?: "info" | "success" | "error") => void;
}

export const useUiStore = create<UiState>()((set) => ({
  activeDate: todayStr(),
  calendarView: "month",
  setActiveDate: (d) => set({ activeDate: d }),
  setCalendarView: (v) => set({ calendarView: v }),

  eventModal: { open: false },
  openEventModal: (s) => set({ eventModal: { ...s } }),
  closeEventModal: () => set({ eventModal: { open: false } }),

  taskDetailId: null,
  openTaskDetail: (id) => set({ taskDetailId: id }),

  focusPanelOpen: false,
  focusTarget: null,
  focusMode: "pomodoro",
  openFocusPanel: (target, mode) => set({ focusPanelOpen: true, focusTarget: target ?? null, focusMode: mode ?? "pomodoro" }),
  closeFocusPanel: () => set({ focusPanelOpen: false }),

  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),
  notifOpen: false,
  setNotifOpen: (v) => set({ notifOpen: v }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  toast: null,
  showToast: (text, type = "info") => {
    const id = Date.now() + Math.random();
    set({ toast: { id, text, type } });
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), 2600);
  },
}));
