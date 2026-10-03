// ============================================================
// 日期工具（全部基于本地时区）
// ============================================================

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function fmtDate(d: Date): string {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
export function fmtTime(d: Date): string {
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}
export function fmtDateTime(d: Date): string {
  return fmtDate(d) + "T" + fmtTime(d);
}
/** yyyy-MM-dd -> Date（本地 00:00） */
export function parseDate(s: string): Date {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, dd || 1);
}
/** yyyy-MM-ddTHH:mm -> Date */
export function parseDateTime(s: string): Date {
  const [d, t] = s.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm] = (t || "00:00").split(":").map(Number);
  return new Date(y || 1970, (m || 1) - 1, dd || 1, hh || 0, mm || 0);
}
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const day = Math.min(d.getDate(), daysInMonth(r.getFullYear(), r.getMonth() + 1));
  r.setDate(day);
  r.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return r;
}
export function addYears(d: Date, n: number): Date {
  const r = new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
  r.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return r;
}
export function startOfWeek(d: Date, weekStart: 0 | 1): Date {
  const r = startOfDay(d);
  const diff = (r.getDay() - weekStart + 7) % 7;
  return addDays(r, -diff);
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
/** m 为 1 基月份 */
export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
/** a - b 的天数差 */
export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}
export function todayStr(): string {
  return fmtDate(new Date());
}
/** ISO 周数 */
export function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
export const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"];
export const MONTH_NAMES = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
export function weekdayName(d: Date): string {
  return WEEKDAY_NAMES[d.getDay()];
}

export function timeToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return pad2(h) + ":" + pad2(m);
}

/** 秒 -> "1小时23分" / "5分30秒" */
export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "0分钟";
  const totalMin = Math.floor(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor(seconds % 60);
  if (h > 0) return h + "小时" + (m > 0 ? m + "分" : "");
  if (m > 0) return m + "分" + (s > 0 ? s + "秒" : "");
  return s + "秒";
}

/** 12/24 小时制格式化 */
export function fmtTimeWithFormat(d: Date, timeFormat: 12 | 24): string {
  if (timeFormat === 24) return fmtTime(d);
  const h = d.getHours();
  const hh = h % 12 === 0 ? 12 : h % 12;
  return pad2(hh) + ":" + pad2(d.getMinutes()) + (h < 12 ? " AM" : " PM");
}

/** 按日期格式模板格式化（yyyy MM dd HH mm ddd dddd M） */
export function fmtDateWithTemplate(d: Date, template: string): string {
  const tokens: Record<string, string> = {
    yyyy: String(d.getFullYear()),
    MM: pad2(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    dd: pad2(d.getDate()),
    d: String(d.getDate()),
    HH: pad2(d.getHours()),
    mm: pad2(d.getMinutes()),
    ddd: "周" + WEEKDAY_SHORT[d.getDay()],
    dddd: WEEKDAY_NAMES[d.getDay()],
  };
  return template.replace(/yyyy|MM|M|dd|d|HH|mm|dddd|ddd/g, (t) => tokens[t] ?? t);
}

export function clampDate(s: string): string {
  return fmtDate(parseDate(s));
}

/** 两个日期相差的完整天数（仅日期部分） */
export function daysBetween(a: string, b: string): number {
  return diffDays(parseDate(a), parseDate(b));
}
