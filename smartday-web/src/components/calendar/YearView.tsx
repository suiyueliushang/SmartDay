// 年视图：12 个月缩略
import React, { useMemo } from "react";
import { useStore } from "@/store/store";
import { useCalendarRange } from "./calendarData";
import { startOfMonth, addMonths, fmtDate, startOfWeek, addDays, todayStr, WEEKDAY_SHORT } from "@/lib/date";
import { getDayInfo } from "@/lib/holidays";
import { parseDateTime, parseDate } from "@/lib/date";

export function YearView(props: { year: number; onDay: (d: string) => void; onMonth: (m: string) => void }) {
  const settings = useStore((s) => s.settings);
  const start = new Date(props.year, 0, 1);
  const end = new Date(props.year + 1, 0, 1);
  const { expanded } = useCalendarRange(start, end);

  const eventDates = useMemo(() => {
    const s = new Set<string>();
    for (const ev of expanded) s.add(fmtDate(parseDateTime(ev.start)));
    return s;
  }, [expanded]);

  const months = Array.from({ length: 12 }, (_, i) => new Date(props.year, i, 1));
  const today = todayStr();

  return (
    <div className="year-grid">
      {months.map((m) => (
        <div key={m.getMonth()} className="year-month" onClick={() => props.onMonth(fmtDate(m))}>
          <h4 onClick={(e) => { e.stopPropagation(); props.onMonth(fmtDate(m)); }}>{m.getMonth() + 1}月</h4>
          <MiniMonth month={m} weekStart={settings.calendar.weekStart as 0 | 1} eventDates={eventDates} onDay={props.onDay} today={today} showLunar={settings.calendar.showLunar} />
        </div>
      ))}
    </div>
  );
}

function MiniMonth(props: { month: Date; weekStart: 0 | 1; eventDates: Set<string>; onDay: (d: string) => void; today: string; showLunar: boolean }) {
  const gridStart = startOfWeek(startOfMonth(props.month), props.weekStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="mini-grid">
      {WEEKDAY_SHORT.map((w, i) => (
        <div key={i} className="mini-day" style={{ height: 14, fontSize: 9, color: "var(--text-muted)", fontWeight: 600 }}>{w}</div>
      ))}
      {days.map((d, i) => {
        const ds = fmtDate(d);
        const inMonth = d.getMonth() === props.month.getMonth();
        const info = getDayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const cls = [
          "mini-day",
          !inMonth ? "" : info.isHoliday ? "holiday" : d.getDay() === 0 || d.getDay() === 6 ? "weekend" : "",
          ds === props.today ? "today" : "",
        ].filter(Boolean).join(" ");
        return (
          <div key={i} className={cls} onClick={() => props.onDay(ds)} title={ds + (props.showLunar ? " " + info.lunarText : "")}>
            {d.getDate()}
            {props.eventDates.has(ds) && <span className="dot" />}
          </div>
        );
      })}
    </div>
  );
}
