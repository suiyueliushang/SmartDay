// 提醒检查引擎：定期扫描事件/任务/纪念日，生成应触发的通知
import { CalendarEvent, Task, Anniversary, Settings, AppNotification, NotificationType } from "@/types";
import { eventOccurrencesInRange } from "./recurrence";
import { parseDateTime, parseDate, addDays, fmtDate, fmtTime, timeToMinutes, startOfDay } from "./date";
import { uid } from "./id";

export interface ReminderCandidate {
  type: NotificationType;
  title: string;
  body: string;
  route: string;
  refId: string;
  /** 去重键 */
  key: string;
  occurredAt: number;
}

function routeFor(type: NotificationType, refId: string): string {
  if (type === "event") return "#/calendar";
  if (type === "task") return "#/tasks";
  if (type === "anniversary") return "#/overview";
  return "#/diary";
}

/**
 * 检查当前时刻需要触发的提醒。
 * 每次调用生成 “过去 60 秒内应触发” 的候选；由上层去重后写入通知中心。
 */
export function checkReminders(
  events: CalendarEvent[],
  tasks: Task[],
  anniversaries: Anniversary[],
  now: Date,
  settings: Settings
): ReminderCandidate[] {
  const out: ReminderCandidate[] = [];
  const startWindow = now.getTime() - 60 * 1000;
  const endWindow = now.getTime() + 5 * 1000;
  const inWindow = (t: number) => t > startWindow && t <= endWindow;

  // ---- 事件提醒（含重复事件的每次出现）----
  const rangeStart = new Date(now.getTime() - 60 * 1000 - 24 * 3600 * 1000);
  const rangeEnd = new Date(now.getTime() + 2 * 3600 * 1000);
  for (const ev of events) {
    const occs = eventOccurrencesInRange(ev, rangeStart, rangeEnd);
    for (const occ of occs) {
      const start = parseDateTime(occ.start);
      for (const r of ev.reminders) {
        const triggerAt = start.getTime() - r.minutes * 60000;
        if (inWindow(triggerAt)) {
          const timeText = occ.allDay ? "全天" : fmtTime(start);
          out.push({
            type: "event",
            title: "📅 事件提醒：" + occ.title,
            body: (occ.allDay ? "全天事件" : timeText + " 开始") + (occ.location ? " · " + occ.location : ""),
            route: routeFor("event", occ.id),
            refId: occ.id,
            key: "event:" + occ.id + ":" + Math.floor(triggerAt / 60000),
            occurredAt: now.getTime(),
          });
        }
      }
    }
  }

  // ---- 任务：到期 / 过期 / 自定义提醒 ----
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayStr = fmtDate(now);
  for (const task of tasks) {
    if (task.completed) continue;
    // 自定义提醒时间
    if (task.remindAt != null && task.remindAt > 0) {
      if (inWindow(task.remindAt)) {
        out.push({
          type: "task",
          title: "⏰ 任务提醒：" + task.title,
          body: "自定义提醒时间到",
          route: "#/tasks",
          refId: task.id,
          key: "task-remind:" + task.id + ":" + Math.floor(task.remindAt / 60000),
          occurredAt: now.getTime(),
        });
      }
    }
    // 截止日当天 9:00 / 自定义截止时间
    if (task.dueDate) {
      const due = parseDate(task.dueDate);
      const dueMin = task.dueTime ? timeToMinutes(task.dueTime) : 9 * 60;
      const isToday = fmtDate(due) === todayStr;
      if (isToday && nowMin >= dueMin && nowMin < dueMin + 5) {
        const triggerAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(dueMin / 60), dueMin % 60).getTime();
        if (inWindow(triggerAt) || Math.abs(triggerAt - now.getTime()) < 5 * 60000) {
          out.push({
            type: "task",
            title: "✅ 任务到期：" + task.title,
            body: "截止 " + fmtDate(due) + (task.dueTime ? " " + task.dueTime : " 9:00"),
            route: "#/tasks",
            refId: task.id,
            key: "task-due:" + task.id + ":" + todayStr,
            occurredAt: now.getTime(),
          });
        }
      }
      // 过期未完成：每天早上 9:00 提醒一次
      if (settings.task.overdueReminder && nowMin >= 9 * 60 && nowMin < 9 * 60 + 5 && due.getTime() < startOfDay(now).getTime()) {
        out.push({
          type: "task",
          title: "⏳ 任务已过期：" + task.title,
          body: "已于 " + fmtDate(due) + " 到期，请尽快处理",
          route: "#/tasks",
          refId: task.id,
          key: "task-overdue:" + task.id + ":" + todayStr,
          occurredAt: now.getTime(),
        });
      }
    }
  }

  // ---- 纪念日 ----
  for (const ann of anniversaries) {
    if (ann.remindDays < 0) continue;
    const reminderTarget = nextAnniversaryDate(ann);
    if (!reminderTarget) continue;
    const target = parseDate(reminderTarget);
    const remindAt = addDays(target, -ann.remindDays);
    const isToday = fmtDate(remindAt) === todayStr;
    if (isToday) {
      const triggerAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0).getTime();
      if (now.getTime() >= triggerAt && now.getTime() - triggerAt < 5 * 60000) {
        const days = Math.round((target.getTime() - startOfDay(now).getTime()) / 86400000);
        out.push({
          type: "anniversary",
          title: "🎂 " + ann.name,
          body: days === 0 ? "就是今天！" : (days > 0 ? "还有 " + days + " 天" : "已过 " + Math.abs(days) + " 天"),
          route: "#/overview",
          refId: ann.id,
          key: "ann:" + ann.id + ":" + fmtDate(target) + ":" + ann.remindDays,
          occurredAt: now.getTime(),
        });
      }
    }
  }
  return out;
}

/** 计算纪念日下一次出现的日期（生日按年重复） */
export function nextAnniversaryDate(ann: Anniversary): string {
  const d = parseDate(ann.date);
  if (ann.type !== "birthday") return ann.date;
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (thisYear.getTime() >= startOfDay(now).getTime()) return fmtDate(thisYear);
  const nextYear = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return fmtDate(nextYear);
}

/** 计算某纪念日在指定年份的出现日期（支持农历生日） */
export function anniversaryDateInYear(ann: Anniversary, year: number): Date {
  if (ann.isLunar) {
    const [lm, ld] = ann.date.split("-").slice(1).map(Number);
    const d = lunarToSolarCached(year, lm, ld);
    return d;
  }
  const [m, dd] = ann.date.split("-").slice(1).map(Number);
  return new Date(year, m - 1, dd);
}

import { lunarToSolar } from "./lunar";
function lunarToSolarCached(y: number, m: number, d: number): Date {
  const r = lunarToSolar(y, m, d, false);
  return r ?? new Date(y, m - 1, d);
}

/** 生成一条系统通知实体 */
export function candidateToNotification(c: ReminderCandidate): AppNotification {
  return {
    id: uid(),
    type: c.type,
    title: c.title,
    body: c.body,
    read: false,
    route: c.route,
    refId: c.refId,
    occurredAt: c.occurredAt,
    createdAt: c.occurredAt,
    updatedAt: c.occurredAt,
  };
}
