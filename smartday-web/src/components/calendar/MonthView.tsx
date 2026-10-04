// 月视图：网格 + 农历/节日 + 事件/任务 + 拖拽调整 + 右键菜单
// 修复：勾选"显示周数"时表头有周数列、但日期行没有周数单元格 →
//       每行会被塞进 8 天，所有日期整体错位。现在每周行都补上周数单元格。
// 单元格显示对齐桌面日历：阳历 + 农历简称 + 节日（同行截断）+ 班/休 + 事件。
import React, { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { useCalendarRange, eventColor, taskColor } from "./calendarData";
import { parseDate, addMonths, startOfWeek, fmtDate, startOfMonth, addDays, todayStr, WEEKDAY_SHORT, parseDateTime, fmtTime, getWeekNumber } from "@/lib/date";
import { getDayInfo } from "@/lib/holidays";
import { CalendarEvent, Task } from "@/types";
import { Menu, useContextMenu } from "../common";

export function MonthView(props: { month: string; selected?: string; onDateDoubleClick: (d: string) => void }) {
  const monthStart = startOfMonth(parseDate(props.month));
  const monthEnd = addMonths(monthStart, 1);
  const settings = useStore((s) => s.settings);
  const { expanded, dueTasks, categories } = useCalendarRange(monthStart, monthEnd);
  const diaries = useStore((s) => s.diaries);
  const updateEvent = useStore((s) => s.updateEvent);
  const updateTask = useStore((s) => s.updateTask);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const ui = useUiStore();
  const [dragEventId, setDragEventId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const { pos, open: openMenu, close: closeMenu } = useContextMenu();
  const [ctxEvent, setCtxEvent] = useState<CalendarEvent | null>(null);

  const showWeekNumbers = settings.calendar.showWeekNumbers;
  const showLunar = settings.calendar.showLunar;
  const showFestivals = settings.calendar.showFestivals;
  const weekStart = settings.calendar.weekStart as 0 | 1;

  const gridStart = useMemo(() => startOfWeek(monthStart, weekStart), [monthStart, weekStart]);
  const weekCount = useMemo(() => {
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const lastWeekStart = startOfWeek(lastDay, weekStart);
    return Math.round((lastWeekStart.getTime() - gridStart.getTime()) / (7 * 86400000)) + 1;
  }, [monthStart, gridStart, weekStart]);
  const cells = useMemo(() => Array.from({ length: weekCount * 7 }, (_, i) => addDays(gridStart, i)), [gridStart, weekCount]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of expanded) {
      const d = fmtDate(parseDateTime(ev.start));
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(ev);
    }
    return m;
  }, [expanded]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of dueTasks) {
      if (!t.dueDate) continue;
      if (!m.has(t.dueDate)) m.set(t.dueDate, []);
      m.get(t.dueDate)!.push(t);
    }
    return m;
  }, [dueTasks]);

  const diaryDates = useMemo(() => new Set(diaries.map((d) => d.date)), [diaries]);
  const today = todayStr();

  const openEvent = (ev: CalendarEvent) => ui.openEventModal({ open: true, eventId: ev.parentId ?? ev.id });

  const dropEvent = (evId: string, dayStr: string) => {
    const ev = expanded.find((e) => e.id === evId);
    if (!ev) return;
    const s = parseDateTime(ev.start);
    const e = parseDateTime(ev.end);
    const dur = e.getTime() - s.getTime();
    const newStart = parseDate(dayStr);
    newStart.setHours(s.getHours(), s.getMinutes());
    const newEnd = new Date(newStart.getTime() + dur);
    const patch = { start: fmtDateTimeLocal(newStart), end: fmtDateTimeLocal(newEnd) };
    if (ev.parentId) {
      const master = useStore.getState().events.find((x) => x.id === ev.parentId);
      if (master) {
        void updateEvent(master.id, { exceptions: { ...(master.exceptions ?? {}), [fmtDate(s)]: { ...ev, ...patch } } });
      }
    } else {
      void updateEvent(ev.id, patch);
    }
  };

  const dropTask = (taskId: string, dayStr: string) => void updateTask(taskId, { dueDate: dayStr });

  return (
    <div
      className={"month-grid" + (showWeekNumbers ? " week-num" : "")}
      onDragOver={(e) => e.preventDefault()}
    >
      {showWeekNumbers && <div className="month-head weeknum-cell">周</div>}
      {Array.from({ length: 7 }, (_, i) => {
        const wd = weekStart === 1 ? (i + 1) % 7 : i;
        return (
          <div key={i} className={"month-head" + (wd === 0 || wd === 6 ? " weekend" : "")}>
            {WEEKDAY_SHORT[wd]}
          </div>
        );
      })}
      {cells.map((d, i) => {
        const ds = fmtDate(d);
        const inMonth = d.getMonth() === monthStart.getMonth();
        const info = getDayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const wd = d.getDay();
        const isWeekend = wd === 0 || wd === 6;
        const badge = info.isWorkday ? "班" : info.isHoliday && !isWeekend ? "休" : "";
        const dayEvents = eventsByDay.get(ds) ?? [];
        const dayTasks = tasksByDay.get(ds) ?? [];
        const isToday = ds === today;
        const maxShow = 3;
        const visible = dayEvents.slice(0, maxShow);
        const rest = dayEvents.length - maxShow;
        const festival = showFestivals ? info.festivalText ?? "" : "";
        const festivalIsFest = !!(info.holidayName || info.lunarFestival || info.solarFestival);
        const weekStartCell = i % 7 === 0;
        return (
          <React.Fragment key={ds}>
            {showWeekNumbers && weekStartCell && <div className="month-weeknum">W{getWeekNumber(d)}</div>}
            <div
              className={
                "month-cell" +
                (inMonth ? "" : " outside") +
                (isWeekend ? " weekend" : "") +
                (isToday ? " today" : "") +
                (info.isHoliday ? " holiday" : "") +
                (props.selected === ds ? " selected" : "")
              }
              onClick={() => ui.setActiveDate(ds)}
              onDoubleClick={() => props.onDateDoubleClick(ds)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragEventId) { dropEvent(dragEventId, ds); setDragEventId(null); }
                if (dragTaskId) { dropTask(dragTaskId, ds); setDragTaskId(null); }
              }}
              title={ds + " " + info.lunarText + (info.holidayName ? " " + info.holidayName : "") + (info.isWorkday ? "（调休上班）" : "")}
            >
              <div className="cell-top">
                <span className="cell-date">{d.getDate()}</span>
                {inMonth && showLunar && <span className="cell-lunar">{info.lunarShort}</span>}
                {inMonth && festival && <span className={"cell-fest" + (festivalIsFest ? " fest" : " term")}>{festival}</span>}
                {badge && <span className={"cell-badge" + (badge === "班" ? " work" : " off")}>{badge}</span>}
                <span className="cell-mark">{diaryDates.has(ds) && <span title="有日记">📝</span>}</span>
              </div>
              {visible.map((ev) => (
                <div
                  key={ev.id}
                  className="month-event"
                  style={{ background: eventColor(ev, categories) }}
                  draggable
                  onDragStart={(e) => { setDragEventId(ev.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => setDragEventId(null)}
                  onClick={(e) => { e.stopPropagation(); openEvent(ev); }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxEvent(ev); openMenu(e); }}
                >
                  {!ev.allDay && <span style={{ fontSize: 10 }}>{fmtTime(parseDateTime(ev.start))}</span>}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</span>
                </div>
              ))}
              {dayTasks.map((t) => (
                <div
                  key={t.id}
                  className="month-event task"
                  style={{ ["--priority-color" as string]: taskColor(t) }}
                  draggable
                  onDragStart={(e) => { setDragTaskId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => setDragTaskId(null)}
                  onClick={(e) => { e.stopPropagation(); ui.openTaskDetail(t.id); }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>☑ {t.title}</span>
                </div>
              ))}
              {rest > 0 && <div className="month-event more" onClick={(e) => e.stopPropagation()}>+{rest} 更多</div>}
            </div>
          </React.Fragment>
        );
      })}
      {pos && ctxEvent && (
        <Menu
          x={pos.x} y={pos.y} onClose={closeMenu}
          items={[
            { label: "✏️ 编辑事件", onClick: () => openEvent(ctxEvent) },
            {
              label: "🎯 开始专注", onClick: () => {
                ui.openFocusPanel({ id: ctxEvent.id, type: "event", title: ctxEvent.title, endAt: parseDateTime(ctxEvent.end).getTime() }, "event");
              },
            },
            { divider: true },
            { label: "🗑️ 删除", danger: true, onClick: () => { if (window.confirm("删除事件「" + ctxEvent.title + "」？")) void deleteEvent(ctxEvent.parentId ?? ctxEvent.id); } },
          ]}
        />
      )}
    </div>
  );
}

function fmtDateTimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}