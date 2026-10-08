// 迷你月历（概览面板 / 桌面预览复用）
import React, { useMemo } from "react";
import { useStore } from "@/store/store";
import { parseDate, addMonths, startOfWeek, fmtDate, startOfMonth, daysInMonth, addDays, todayStr, WEEKDAY_SHORT } from "@/lib/date";
import { getDayInfo } from "@/lib/holidays";
import { MOOD_ICONS } from "@/lib/moods";
import { collectDiaryDates } from "@/lib/diary";

export function MiniCalendar(props: {
  date: string;
  onSelect: (d: string) => void;
  selected?: string | null;
  highlightEvents?: boolean;
  highlightDiaries?: boolean;
}) {
  const monthStart = useMemo(() => startOfMonth(parseDate(props.date)), [props.date]);
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const diaries = useStore((s) => s.diaries);
  const notes = useStore((s) => s.notes);

  const eventDates = useMemo(() => {
    const s = new Set<string>();
    const start = startOfMonth(parseDate(props.date));
    const end = addMonths(start, 1);
    for (const ev of events) {
      const occs = expandForMini(ev, start, end);
      for (const o of occs) s.add(fmtDate(parseDate(o.start)));
    }
    return s;
  }, [events, props.date]);

  // 需求 W-1.4：日记标记必须同时认「传统日记」与「带『日记』标签的笔记」
  const diaryDates = useMemo(() => {
    const s = new Set<string>();
    const start = startOfMonth(parseDate(props.date));
    const end = addMonths(start, 1);
    for (const d of collectDiaryDates(diaries, notes)) {
      const t = parseDate(d);
      if (t >= start && t < end) s.add(d);
    }
    return s;
  }, [diaries, notes, props.date]);

  const moodByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of diaries) if (d.mood) m.set(d.date, MOOD_ICONS[d.mood]);
    return m;
  }, [diaries]);

  const weekStart = settings.calendar.weekStart as 0 | 1;
  const gridStart = startOfWeek(monthStart, weekStart);
  const total = 42;
  const cells = Array.from({ length: total }, (_, i) => addDays(gridStart, i));
  const today = todayStr();

  const prev = () => props.onSelect(fmtDate(addMonths(parseDate(props.date), -1)));
  const next = () => props.onSelect(fmtDate(addMonths(parseDate(props.date), 1)));

  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <button className="icon-btn" onClick={prev}>‹</button>
        <div className="m-title">{parseDate(props.date).getFullYear()}年{parseDate(props.date).getMonth() + 1}月</div>
        <button className="icon-btn" onClick={next}>›</button>
      </div>
      <div className="mini-grid">
        {WEEKDAY_SHORT.map((w, i) => (
          <div key={i} className="mini-day" style={{ color: "var(--text-muted)", height: 18, fontWeight: 600 }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          const ds = fmtDate(d);
          const isToday = ds === today;
          const inMonth = d.getMonth() === monthStart.getMonth();
          const info = getDayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
          const cls = [
            "mini-day",
            !inMonth ? "" : info.isHoliday ? "holiday" : d.getDay() === 0 || d.getDay() === 6 ? "weekend" : "",
            isToday ? "today" : "",
            props.selected === ds ? "selected" : "",
          ].filter(Boolean).join(" ");
          return (
            <div
              key={i}
              className={cls}
              onClick={() => props.onSelect(ds)}
              title={inMonth ? ds + " " + info.lunarText + (info.holidayName ? " " + info.holidayName : "") : ""}
            >
              {d.getDate()}
              {(props.highlightEvents && eventDates.has(ds)) && <span className="dot" />}
              {(props.highlightDiaries && diaryDates.has(ds)) && <span className="mood-mark">📝</span>}
              {moodByDate.get(ds) && <span className="mood-mark">{moodByDate.get(ds)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 迷你日历展开（限制范围，避免全量展开）
import { eventOccurrencesInRange } from "@/lib/recurrence";
function expandForMini(ev: import("@/types").CalendarEvent, start: Date, end: Date) {
  if (!ev.repeat) {
    const s = parseDate(ev.start);
    return s >= start && s < end ? [ev] : [];
  }
  return eventOccurrencesInRange(ev, start, end);
}
