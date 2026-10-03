// ============================================================
// 数据导入导出：JSON 全量 / ICS 日历 / CSV 任务 / Markdown 日记笔记
// ============================================================
import { CalendarEvent, Task, TaskList, TaskGroup, Diary, Note, Anniversary, Settings, CalendarCategory, RepeatRule } from "@/types";
import { pad2, parseDateTime, parseDate, fmtDate, timeToMinutes } from "./date";
import { downloadText } from "./download";
import { uid } from "./id";

// ---------------- 通用 ----------------
export interface FullBackup {
  version: 1;
  app: "smartday";
  exportedAt: string;
  categories: CalendarCategory[];
  events: CalendarEvent[];
  lists: TaskList[];
  groups: TaskGroup[];
  tasks: Task[];
  diaries: Diary[];
  notes: Note[];
  anniversaries: Anniversary[];
  focus: unknown[];
  settings: Settings | null;
}

function icsEscape(s: string): string {
  return (s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function icsDateTime(d: Date): string {
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "T" + pad2(d.getHours()) + pad2(d.getMinutes()) + "00";
}
function icsDateOnly(d: Date): string {
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
}
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const BYDAY_TO_WD: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function rruleToIcs(rule: RepeatRule): string {
  const freqMap: Record<string, string> = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };
  let s = "FREQ=" + (freqMap[rule.freq] ?? "DAILY");
  if ((rule.interval || 1) > 1) s += ";INTERVAL=" + rule.interval;
  if (rule.freq === "custom" && rule.weekdays?.length) s += ";BYDAY=" + rule.weekdays.map((w) => BYDAY[w]).join(",");
  if (rule.endType === "count" && rule.endCount) s += ";COUNT=" + rule.endCount;
  else if (rule.endType === "date" && rule.endDate) s += ";UNTIL=" + icsDateOnly(parseDate(rule.endDate));
  return s;
}
/** 按 75 字节折叠 ICS 行 */
function foldIcs(line: string): string {
  const out: string[] = [];
  let cur = line;
  while (cur.length > 75) {
    out.push(cur.slice(0, 75));
    cur = " " + cur.slice(75);
  }
  out.push(cur);
  return out.join("\r\n");
}

// ---------------- JSON 全量 ----------------
export function exportFullBackup(data: Omit<FullBackup, "version" | "app" | "exportedAt">) {
  const backup: FullBackup = { version: 1, app: "smartday", exportedAt: new Date().toISOString(), ...data };
  downloadText("smartday-backup-" + fmtDate(new Date()) + ".json", JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
}

export function validateBackup(raw: unknown): raw is FullBackup {
  if (!raw || typeof raw !== "object") return false;
  const b = raw as FullBackup;
  return b.app === "smartday" && Array.isArray(b.events) && Array.isArray(b.tasks);
}

// ---------------- ICS ----------------
export function exportICS(events: CalendarEvent[]) {
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SmartDay//SmartDay//CN", "CALSCALE:GREGORIAN"];
  for (const ev of events) {
    if (ev.parentId) continue; // 只导出主事件（重复规则随主事件）
    const s = parseDateTime(ev.start);
    const e = parseDateTime(ev.end);
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + ev.id);
    lines.push("DTSTAMP:" + icsDateTime(new Date()) + "Z");
    if (ev.allDay) {
      lines.push("DTSTART;VALUE=DATE:" + icsDateOnly(s));
      lines.push("DTEND;VALUE=DATE:" + icsDateOnly(e));
    } else {
      lines.push("DTSTART:" + icsDateTime(s));
      lines.push("DTEND:" + icsDateTime(e));
    }
    lines.push("SUMMARY:" + icsEscape(ev.title));
    if (ev.location) lines.push("LOCATION:" + icsEscape(ev.location));
    if (ev.description) lines.push("DESCRIPTION:" + icsEscape(ev.description));
    if (ev.repeat) lines.push("RRULE:" + rruleToIcs(ev.repeat));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  downloadText("smartday-calendar-" + fmtDate(new Date()) + ".ics", lines.map(foldIcs).join("\r\n"), "text/calendar;charset=utf-8");
}

function icsUnescape(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
function parseIcsDate(v: string): { date: Date; allDay: boolean } {
  const clean = v.trim();
  if (clean.includes("T")) {
    const dt = clean.replace("Z", "");
    const y = Number(dt.slice(0, 4)), mo = Number(dt.slice(4, 6)) - 1, d = Number(dt.slice(6, 8));
    const h = Number(dt.slice(9, 11) || 0), mi = Number(dt.slice(11, 13) || 0);
    return { date: new Date(y, mo, d, h, mi), allDay: false };
  }
  const y = Number(clean.slice(0, 4)), mo = Number(clean.slice(4, 6)) - 1, d = Number(clean.slice(6, 8));
  return { date: new Date(y, mo, d), allDay: true };
}
function parseRrule(s: string): RepeatRule | null {
  const parts: Record<string, string> = {};
  for (const kv of s.split(";")) {
    const idx = kv.indexOf("=");
    if (idx > 0) parts[kv.slice(0, idx).toUpperCase()] = kv.slice(idx + 1);
  }
  const freq = parts.FREQ?.toUpperCase();
  const rule: RepeatRule = { freq: "daily", interval: Number(parts.INTERVAL) || 1, endType: "never" };
  if (freq === "WEEKLY") rule.freq = "weekly";
  else if (freq === "MONTHLY") rule.freq = "monthly";
  else if (freq === "YEARLY") rule.freq = "yearly";
  else rule.freq = "daily";
  if (parts.BYDAY) {
    rule.freq = "custom";
    rule.weekdays = parts.BYDAY.split(",").map((d) => BYDAY_TO_WD[d.toUpperCase()]).filter((i) => i !== undefined) as number[];
  }
  if (parts.COUNT) { rule.endType = "count"; rule.endCount = Number(parts.COUNT) || undefined; }
  else if (parts.UNTIL) {
    const until = parts.UNTIL.replace("Z", "");
    rule.endType = "date";
    rule.endDate = until.slice(0, 4) + "-" + until.slice(4, 6) + "-" + until.slice(6, 8);
  }
  return rule;
}

/** 解析 ICS 文本 -> 事件列表 */
export function parseICS(text: string, defaultCategoryId: string): CalendarEvent[] {
  const unfolded = text.replace(/\r\n[ \t]/g, "").split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let current: Partial<CalendarEvent> | null = null;
  const now = Date.now();
  for (const rawLine of unfolded) {
    const line = rawLine.trim();
    if (line === "BEGIN:VEVENT") {
      current = { id: uid(), title: "", allDay: false, start: "", end: "", categoryId: defaultCategoryId, reminders: [], createdAt: now, updatedAt: now };
    } else if (line === "END:VEVENT") {
      if (current && current.title && current.start && current.end) {
        events.push(current as CalendarEvent);
      }
      current = null;
    } else if (current) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const prop = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const propName = prop.split(";")[0].toUpperCase();
      switch (propName) {
        case "SUMMARY": current.title = icsUnescape(value); break;
        case "DESCRIPTION": current.description = icsUnescape(value); break;
        case "LOCATION": current.location = icsUnescape(value); break;
        case "UID": current.id = value || uid(); break;
        case "DTSTART": {
          const r = parseIcsDate(value);
          current.allDay = r.allDay;
          current.start = r.allDay ? fmtDate(r.date) + "T00:00" : fmtDateTimeStr(r.date);
          break;
        }
        case "DTEND": {
          const r = parseIcsDate(value);
          current.end = r.allDay ? fmtDate(r.date) + "T00:00" : fmtDateTimeStr(r.date);
          break;
        }
        case "RRULE": current.repeat = parseRrule(value); break;
      }
    }
  }
  return events;
}
function fmtDateTimeStr(d: Date): string {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

// ---------------- CSV（任务） ----------------
function csvCell(s: string): string {
  const str = s ?? "";
  return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}
export function exportTasksCSV(tasks: Task[], lists: TaskList[]) {
  const listName = (id: string) => lists.find((l) => l.id === id)?.name ?? "";
  const PRIORITY = { high: "最高", medium: "高", low: "中", none: "低" } as const;
  const rows = [
    ["标题", "备注", "截止日期", "截止时间", "优先级", "清单", "标签", "状态", "完成时间"],
    ...tasks.map((t) => [
      t.title, t.notes ?? "", t.dueDate ?? "", t.dueTime ?? "",
      PRIORITY[t.priority] ?? "低", listName(t.listId), t.tags.join("、"),
      t.completed ? "已完成" : "未完成", t.completedAt ? new Date(t.completedAt).toLocaleString() : "",
    ]),
  ];
  const csv = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  downloadText("smartday-tasks-" + fmtDate(new Date()) + ".csv", csv, "text/csv;charset=utf-8");
}

// ---------------- Markdown（日记/笔记） ----------------
const MOOD_ICONS: Record<string, string> = { happy: "😄", smile: "😊", neutral: "😐", sad: "😢", angry: "😡" };
export function exportDiariesMarkdown(diaries: Diary[]) {
  const md = diaries
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => {
      const head = [
        "# " + (d.title || d.date),
        "",
        "> 日期：" + d.date + (d.mood ? "　心情：" + (MOOD_ICONS[d.mood] ?? d.mood) : ""),
        "",
        d.content.trim(),
      ].join("\n");
      return head;
    })
    .join("\n\n---\n\n");
  downloadText("smartday-diaries-" + fmtDate(new Date()) + ".md", md, "text/markdown;charset=utf-8");
}
export function exportNotesMarkdown(notes: Note[]) {
  const md = notes
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((n) => {
      const head = [
        "# " + (n.pinned ? "📌 " : "") + n.title,
        "",
        "> " + (n.date ? "写于 " + n.date : "独立笔记") + (n.tags.length ? "　标签：" + n.tags.join("、") : ""),
        "",
        n.content.trim(),
      ].join("\n");
      return head;
    })
    .join("\n\n---\n\n");
  downloadText("smartday-notes-" + fmtDate(new Date()) + ".md", md, "text/markdown;charset=utf-8");
}
