// ============================================================
// 安卓端原生桥接（Capacitor）
// 职责：把 web 层的小组件数据 + 本地通知推送给原生层。
//
// 设计要点（100% 复用 web 端口径）：
//  - 农历/节日/节气/班休 计算全部用本仓库的 lunar.ts / holidays.ts
//  - 日记识别统一口径用 diary.ts（hasDiaryOn / collectDiaryDates）
//  - 原生小组件只做渲染，不做任何日期/农历计算
// ============================================================
import { useStore } from "@/store/store";
import { getDayInfo } from "@/lib/holidays";
import { collectDiaryDates } from "@/lib/diary";
import { fmtDate, WEEKDAY_NAMES, daysInMonth, startOfDay, endOfDay } from "@/lib/date";
import { eventOccurrencesInRange } from "@/lib/recurrence";

/** Capacitor 原生桥接对象（仅安卓端存在；网页端为 null）
 *  插件名与原生 `SmartDayBridgePlugin` 的 @CapacitorPlugin(name = "SmartDayBridge") 对齐。 */
interface NativeBridge {
  updateTodayWidget(data: { data: Record<string, unknown> }): Promise<void>;
  updateMonthWidget(data: { data: Record<string, unknown> }): Promise<void>;
  refreshWidgets(): Promise<void>;
  syncDiaryDates(data: { dates: string[] }): Promise<void>;
  scheduleNotification(data: {
    id: number;
    title: string;
    body: string;
    at: number;
    route: string;
  }): Promise<{ scheduled: boolean; exact: boolean }>;
  cancelNotification(data: { id: number }): Promise<void>;
  canScheduleExact(): Promise<{ exact: boolean; notifyPermission: boolean }>;
  startFocusService(data: { label: string; remain: string }): Promise<void>;
  updateFocusService(data: { label: string; remain: string }): Promise<void>;
  stopFocusService(): Promise<void>;
  navigate(data: { route: string }): Promise<void>;
}

function getBridge(): NativeBridge | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: { SmartDayBridge?: NativeBridge } } })
    .Capacitor;
  return cap?.Plugins?.SmartDayBridge ?? null;
}

/** 是否运行在安卓端（Capacitor 环境） */
export function isAndroid(): boolean {
  return getBridge() != null;
}

// ---------------- 今日小组件数据 ----------------
export interface WidgetScheduleItem {
  title: string;
  time: string;
  color: string;
  allDay: boolean;
}

export function buildTodayWidgetData(): Record<string, unknown> {
  const s = useStore.getState();
  const now = new Date();
  const today = fmtDate(now);

  // 当天事件（含重复事件展开）
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const dayEvents = s.events
    .flatMap((e) => eventOccurrencesInRange(e, dayStart, dayEnd))
    .sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));

  const schedules: WidgetScheduleItem[] = dayEvents.slice(0, 4).map((e) => {
    const cat = s.categories.find((c) => c.id === e.categoryId);
    const time = e.allDay ? "全天" : e.start.slice(11, 16);
    return {
      title: e.title,
      time,
      color: e.color || cat?.color || "#3F5FE0",
      allDay: e.allDay,
    };
  });

  // 今日任务
  const todayTasks = s.tasks.filter((t) => !t.completed && t.dueDate === today);
  const done = s.tasks.filter((t) => t.completed && t.dueDate === today).length;

  const dayInfo = getDayInfo(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY_NAMES[now.getDay()]}`;
  const lunarLabel = "农历" + dayInfo.lunarText;

  return {
    date: today,
    dateLabel,
    lunarLabel,
    festivals: dayInfo.festivalText ?? "",
    schedules,
    taskTotal: todayTasks.length + done,
    taskDone: done,
  };
}

// ---------------- 月历小组件数据 ----------------
export function buildMonthWidgetData(year: number, month: number): Record<string, unknown> {
  const s = useStore.getState();
  const diaryDates = collectDiaryDates(s.diaries, s.notes);

  // 当月 1 号是周几（0=周日，与原生端 firstDayOfWeek 对齐为 0=周日）
  const first = new Date(year, month - 1, 1);
  const firstDayOfWeek = first.getDay(); // 0=周日
  const totalDays = daysInMonth(year, month);
  const today = fmtDate(new Date());

  // 生成完整网格：前置空白 + 当月天数 + 尾部补齐到 7 的倍数
  const cells: Record<string, unknown>[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({
      dayOfMonth: 0, solarLabel: "", lunarLabel: "", festival: "",
      isWorkday: false, isRestDay: false, isWeekend: false, isToday: false, hasDiary: false,
    });
  }
  for (let d = 1; d <= totalDays; d++) {
    const info = getDayInfo(year, month, d);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    cells.push({
      dayOfMonth: d,
      solarLabel: String(d),
      lunarLabel: info.lunarShort,
      festival: info.festivalText ?? "",
      isWorkday: info.isWorkday,
      isRestDay: info.isHoliday && dow !== 0 && dow !== 6, // 工作日放假标「休」
      isWeekend: dow === 0 || dow === 6,
      isToday: dateStr === today,
      hasDiary: diaryDates.has(dateStr),
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({
      dayOfMonth: 0, solarLabel: "", lunarLabel: "", festival: "",
      isWorkday: false, isRestDay: false, isWeekend: false, isToday: false, hasDiary: false,
    });
  }

  return {
    year,
    month,
    title: `${year}年${month}月`,
    firstDayOfWeek,
    days: cells,
  };
}

// ---------------- 推送入口 ----------------
/** 推送今日 + 当月数据到原生小组件 */
export async function pushWidgetData() {
  const bridge = getBridge();
  if (!bridge) return;
  const now = new Date();
  try {
    await bridge.updateTodayWidget({ data: buildTodayWidgetData() });
    await bridge.updateMonthWidget({ data: buildMonthWidgetData(now.getFullYear(), now.getMonth() + 1) });
    pushDiaryDates();
  } catch (e) {
    console.warn("[androidBridge] pushWidgetData failed", e);
  }
}

/** 推送指定月份数据（小组件切月时原生层请求） */
export async function pushMonthWidget(year: number, month: number) {
  const bridge = getBridge();
  if (!bridge) return;
  try {
    await bridge.updateMonthWidget({ data: buildMonthWidgetData(year, month) });
  } catch (e) {
    console.warn("[androidBridge] pushMonthWidget failed", e);
  }
}

/**
 * 把「有日记」日期集合同步给原生（供原生兜底渲染读取），A-4.4 / A-A5。
 * 原生月历小组件在缓存缺失时用 LunarCalendar 兜底重算，其中日记标记从原生侧读取，
 * 保证「日记识别统一口径」在原生兜底路径同样生效。
 */
export function pushDiaryDates() {
  const dates = (() => {
    try {
      const s = useStore.getState();
      return [...collectDiaryDates(s.diaries, s.notes)];
    } catch {
      return [];
    }
  })();
  try {
    localStorage.setItem("smartday.diaryDates", JSON.stringify(dates));
  } catch {
    // localStorage 不可用时忽略
  }
  const bridge = getBridge();
  if (bridge) {
    bridge.syncDiaryDates({ dates }).catch(() => {
      // 忽略
    });
  }
}

/** 调度本地通知（供提醒引擎调用） */
export async function scheduleNativeNotification(
  id: number, title: string, body: string, atMillis: number, route: string
): Promise<{ scheduled: boolean; exact: boolean } | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  try {
    return await bridge.scheduleNotification({ id, title, body, at: atMillis, route });
  } catch (e) {
    console.warn("[androidBridge] scheduleNativeNotification failed", e);
    return null;
  }
}

export async function cancelNativeNotification(id: number): Promise<void> {
  const bridge = getBridge();
  if (!bridge) return;
  try {
    await bridge.cancelNotification({ id });
  } catch {
    // 忽略
  }
}

/** 精确闹钟是否可用（供设置页提示） */
export async function canScheduleExact(): Promise<boolean | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  try {
    const r = await bridge.canScheduleExact();
    return r.exact;
  } catch {
    return null;
  }
}

// ---------------- 专注前台服务（A-6） ----------------
/** 开启专注常驻通知 + 前台保活（后台计时不被系统杀进程） */
export async function startFocusService(label: string, remain = ""): Promise<void> {
  const bridge = getBridge();
  if (!bridge) return;
  try {
    await bridge.startFocusService({ label, remain });
  } catch (e) {
    console.warn("[androidBridge] startFocusService failed", e);
  }
}

/** 更新专注常驻通知文本（剩余时间等） */
export async function updateFocusService(label: string, remain = ""): Promise<void> {
  const bridge = getBridge();
  if (!bridge) return;
  try {
    await bridge.updateFocusService({ label, remain });
  } catch {
    // 忽略
  }
}

/** 结束专注前台服务 */
export async function stopFocusService(): Promise<void> {
  const bridge = getBridge();
  if (!bridge) return;
  try {
    await bridge.stopFocusService();
  } catch {
    // 忽略
  }
}
