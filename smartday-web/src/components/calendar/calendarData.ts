// 日历数据辅助：展开事件、任务上日历、分类可见性、优先级颜色
import { useStore } from "@/store/store";
import { CalendarEvent, Task, Priority } from "@/types";
import { eventOccurrencesInRange } from "@/lib/recurrence";
import { parseDate, fmtDate, startOfDay } from "@/lib/date";

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: "#e03131",
  medium: "#f97316",
  low: "#4f6ef7",
  none: "#94a3b8",
};
export const PRIORITY_NAMES: Record<Priority, string> = {
  high: "最高",
  medium: "高",
  low: "中",
  none: "低",
};

export function useCalendarRange(start: Date, end: Date) {
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const showTasks = useStore((s) => s.settings.calendar.showTasksInCalendar);

  const visibleCategoryIds = new Set(categories.filter((c) => c.visible).map((c) => c.id));

  const expanded: CalendarEvent[] = [];
  for (const ev of events) {
    if (!visibleCategoryIds.has(ev.categoryId)) continue;
    expanded.push(...eventOccurrencesInRange(ev, start, end));
  }
  expanded.sort((a, b) => a.start.localeCompare(b.start));

  const dueTasks = showTasks
    ? tasks
        .filter((t) => !t.completed && !!t.dueDate)
        .filter((t) => {
          if (!t.dueDate) return false;
          const d = parseDate(t.dueDate);
          return d < end && d >= start;
        })
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    : [];

  return { expanded, dueTasks, categories, visibleCategoryIds };
}

/** 某一天的事件（含任务） */
export function useDayItems(dateStr: string) {
  const dayStart = parseDate(dateStr);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const { expanded, dueTasks } = useCalendarRange(dayStart, dayEnd);
  return { events: expanded, tasks: dueTasks };
}

export function eventColor(ev: CalendarEvent, categories: ReturnType<typeof useStore.getState>["categories"]): string {
  if (ev.color) return ev.color;
  return categories.find((c) => c.id === ev.categoryId)?.color ?? "#4f6ef7";
}

export function taskColor(t: Task): string {
  return PRIORITY_COLORS[t.priority];
}
