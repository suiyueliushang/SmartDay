// 重复事件展开与重复任务续期
import { CalendarEvent, RepeatRule, Task } from "@/types";
import { parseDateTime, parseDate, addDays, addMonths, addYears, fmtDateTime, fmtDate, diffDays } from "./date";

function applyException(occ: CalendarEvent, event: CalendarEvent): CalendarEvent | null {
  if (!event.exceptions) return occ;
  const exc = event.exceptions[fmtDate(parseDateTime(occ.start))];
  if (!exc) return occ;
  if ("deleted" in exc) return null;
  const base = parseDateTime(occ.start);
  const excStart = parseDateTime(exc.start);
  const excEnd = parseDateTime(exc.end);
  const dur = excEnd.getTime() - excStart.getTime();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), excStart.getHours(), excStart.getMinutes());
  return {
    ...occ,
    ...exc,
    id: exc.id,
    start: fmtDateTime(start),
    end: fmtDateTime(new Date(start.getTime() + dur)),
    parentId: event.id,
    repeat: null,
  };
}

function makeOccurrence(event: CalendarEvent, base: Date, durMs: number): CalendarEvent {
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours(), base.getMinutes());
  const end = new Date(start.getTime() + durMs);
  return {
    ...event,
    id: event.id + "@" + fmtDateTime(start),
    start: fmtDateTime(start),
    end: fmtDateTime(end),
    parentId: event.id,
    repeat: null,
  };
}

/** 展开事件在 [rangeStart, rangeEnd) 内的所有出现 */
export function eventOccurrencesInRange(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const s = parseDateTime(event.start);
  const e = parseDateTime(event.end);
  if (!event.repeat) {
    return s < rangeEnd && e > rangeStart ? [event] : [];
  }
  const rule = event.repeat;
  const durMs = Math.max(e.getTime() - s.getTime(), 0);
  const occs: CalendarEvent[] = [];
  const endDateLimit = rule.endType === "date" && rule.endDate ? parseDate(rule.endDate) : null;
  const maxCount = rule.endType === "count" ? (rule.endCount ?? Infinity) : Infinity;
  let count = 0;
  const interval = Math.max(1, rule.interval || 1);
  const baseDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());

  if (rule.freq === "daily") {
    let cur = new Date(s);
    while (cur < rangeEnd && count < maxCount && (!endDateLimit || cur <= endDateLimit)) {
      if (cur >= rangeStart) {
        const occ = makeOccurrence(event, cur, durMs);
        const withExc = applyException(occ, event);
        if (withExc) occs.push(withExc);
        count++;
      }
      cur = addDays(cur, interval);
    }
  } else if (rule.freq === "weekly" || rule.freq === "custom") {
    const weekdays: number[] =
      rule.freq === "custom" && rule.weekdays && rule.weekdays.length
        ? [...rule.weekdays].sort((a, b) => a - b)
        : [s.getDay()];
    // 以事件所在周为第 0 周，按“周块”推进，避免跨周偏移误差
    const w0 = new Date(s.getFullYear(), s.getMonth(), s.getDate() - s.getDay());
    let w = 0;
    outer: while (w < 4000) {
      const weekStart = addDays(w0, w * interval * 7);
      if (endDateLimit && weekStart > endDateLimit) break;
      if (weekStart >= rangeEnd) break;
      for (const wd of weekdays) {
        const cand = addDays(weekStart, wd);
        if (cand < baseDay || cand < rangeStart) continue;
        if (cand >= rangeEnd) break outer;
        if (endDateLimit && cand > endDateLimit) break outer;
        if (count >= maxCount) break outer;
        const occ = makeOccurrence(event, cand, durMs);
        const withExc = applyException(occ, event);
        if (withExc) occs.push(withExc);
        count++;
      }
      w++;
    }
  } else if (rule.freq === "monthly") {
    let cur = new Date(s);
    while (cur < rangeEnd && count < maxCount && (!endDateLimit || cur <= endDateLimit)) {
      if (cur >= rangeStart) {
        const occ = makeOccurrence(event, cur, durMs);
        const withExc = applyException(occ, event);
        if (withExc) occs.push(withExc);
        count++;
      }
      cur = addMonths(cur, interval);
    }
  } else if (rule.freq === "yearly") {
    let cur = new Date(s);
    while (cur < rangeEnd && count < maxCount && (!endDateLimit || cur <= endDateLimit)) {
      if (cur >= rangeStart) {
        const occ = makeOccurrence(event, cur, durMs);
        const withExc = applyException(occ, event);
        if (withExc) occs.push(withExc);
        count++;
      }
      cur = addYears(cur, interval);
    }
  }
  return occs;
}

/** 计算重复规则的下一个日期（严格晚于 after 的日期部分） */
export function nextDateByRule(rule: RepeatRule, baseDate: string, after: Date): string | null {
  const base = parseDate(baseDate);
  const interval = Math.max(1, rule.interval || 1);
  const endDateLimit = rule.endType === "date" && rule.endDate ? parseDate(rule.endDate) : null;
  const maxCount = rule.endType === "count" ? (rule.endCount ?? Infinity) : Infinity;
  let count = 0;

  if (rule.freq === "daily") {
    let cur = addDays(base, interval);
    let guard = 0;
    while (guard++ < 5000) {
      if (endDateLimit && cur > endDateLimit) return null;
      if (count >= maxCount) return null;
      if (cur > after) return fmtDate(cur);
      count++;
      cur = addDays(cur, interval);
    }
    return null;
  }
  if (rule.freq === "weekly" || rule.freq === "custom") {
    const weekdays: number[] =
      rule.freq === "custom" && rule.weekdays && rule.weekdays.length
        ? [...rule.weekdays].sort((a, b) => a - b)
        : [base.getDay()];
    const w0 = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay());
    for (let w = 0; w < 1000; w++) {
      const weekStart = addDays(w0, w * interval * 7);
      if (endDateLimit && weekStart > endDateLimit) return null;
      for (const wd of weekdays) {
        const cand = addDays(weekStart, wd);
        if (cand <= base) continue;
        if (endDateLimit && cand > endDateLimit) return null;
        if (count >= maxCount) return null;
        count++;
        if (cand > after) return fmtDate(cand);
      }
    }
    return null;
  }
  if (rule.freq === "monthly") {
    let cur = addMonths(base, interval);
    let guard = 0;
    while (guard++ < 3000) {
      if (endDateLimit && cur > endDateLimit) return null;
      if (count >= maxCount) return null;
      if (cur > after) return fmtDate(cur);
      count++;
      cur = addMonths(cur, interval);
    }
    return null;
  }
  if (rule.freq === "yearly") {
    let cur = addYears(base, interval);
    let guard = 0;
    while (guard++ < 500) {
      if (endDateLimit && cur > endDateLimit) return null;
      if (count >= maxCount) return null;
      if (cur > after) return fmtDate(cur);
      count++;
      cur = addYears(cur, interval);
    }
    return null;
  }
  return null;
}

/** 任务完成后按规则自动续期：返回新的截止日期（保留原时间） */
export function nextTaskDue(task: Task, after: Date): string | null {
  if (!task.repeat || !task.dueDate) return null;
  return nextDateByRule(task.repeat, task.dueDate, after);
}
