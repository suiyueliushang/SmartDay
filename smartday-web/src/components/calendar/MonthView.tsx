// 月视图：网格 + 农历节假日 + 事件/任务 + 拖拽调整
import React, { useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { useCalendarRange, eventColor, taskColor } from "./calendarData";
import { Menu, useContextMenu } from "../common";
import { parseDate, addMonths, startOfWeek, fmtDate, startOfMonth, addDays, todayStr, WEEKDAY_SHORT, parseDateTime } from "@/lib/date";
import { getDayInfo } from "@/lib/holidays";
import { CalendarEvent, Task } from "@/types";
import { navigate } from "@/lib/router";

export function MonthView(props: { month: string; onDateDoubleClick: (d: string) => void }) {
  const monthStart = startOfMonth(parseDate(props.month));
  const monthEnd = addMonths(monthStart, 1);
  const settings = useStore((s) => s.settings);
  const { expanded, dueTasks, categories } = useCalendarRange(monthStart, monthEnd);
  const diaries = useStore((s) => s.diaries);
  const updateEvent = useStore((s) => s.updateEvent);
  const updateTask = useStore((s) => s.updateTask);
  const ui = useUiStore();
  const [dragEventId, setDragEventId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const { pos, open: openMenu, close: closeMenu } = useContextMenu();
  const [ctxEvent, setCtxEvent] = useState<CalendarEvent | null>(null);
  const deleteEvent = useStore((s) => s.deleteEvent);

  const weekStart = settings.calendar.weekStart as 0 | 1;
  const gridStart = startOfWeek(monthStart, weekStart);
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);

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

  const openEvent = (ev: CalendarEvent) => {
    ui.openEventModal({ open: true, eventId: ev.parentId ?? ev.id });
  };
  const openTask = (t: Task) => {
    ui.openTaskDetail(t.id);
  };

  const dropEvent = (evId: string, dayStr: string) => {
    const ev = expanded.find((e) => e.id === evId);
    if (!ev) return;
    const s = parseDateTime(ev.start);
    const e = parseDateTime(ev.end);
    const dur = e.getTime() - s.getTime();
    const newStart = parseDate(dayStr);
    newStart.setHours(s.getHours(), s.getMinutes());
    const next = {
      start: fmtDate(newStart) + "T" + (s.getHours() < 10 ? "0" : "") + s.getHours() + ":" + (s.getMinutes() < 10 ? "0" : "") + s.getMinutes(),
      end: fmtDate(new Date(newStart.getTime() + dur)) + "T" + (e.getHours() < 10 ? "0" : "") + e.getHours() + ":" + (e.getMinutes() < 10 ? "0" : "") + e.getMinutes(),
    };
    if (ev.parentId) {
      // 拖拽重复事件的某次出现：改为例外覆盖
      const master = useStore.getState().events.find((x) => x.id === ev.parentId);
      if (master) {
        void updateEvent(master.id, {
          exceptions: {
            ...(master.exceptions ?? {}),
            [fmtDate(s)]: { ...ev, ...next },
          },
        });
      }
    } else {
      void updateEvent(ev.id, next);
    }
  };

  const dropTask = (taskId: string, dayStr: string) => {
    void updateTask(taskId, { dueDate: dayStr });
  };

  return (
    <div
      className={"month-grid" + (settings.calendar.showWeekNumbers ? " week-num" : "")}
      onDragOver={(e) => e.preventDefault()}
    >
      {settings.calendar.showWeekNumbers && <div className="month-head weeknum-cell"></div>}
      {WEEKDAY_SHORT.map((w, i) => (
        <div key={i} className={"month-head" + (i === 0 || i === 6 ? " weekend" : "")}>
          {settings.calendar.weekStart === 1 ? WEEKDAY_SHORT[(i + 1) % 7] : w}
        </div>
      ))}
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
      {cells.map((d, i) => {
        const ds = fmtDate(d);
        const inMonth = d.getMonth() === monthStart.getMonth();
        const info = getDayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const dayEvents = eventsByDay.get(ds) ?? [];
        const dayTasks = tasksByDay.get(ds) ?? [];
        const maxShow = 3;
        const visible = dayEvents.slice(0, maxShow);
        const rest = dayEvents.length - maxShow;
        const isToday = ds === today;

        let extraText = "";
        let extraCls = "";
        if (settings.calendar.showFestivals) {
          if (info.holidayName) { extraText = info.holidayName; extraCls = "festival"; }
          else if (info.lunarFestival) { extraText = info.lunarFestival; extraCls = "festival"; }
          else if (info.solarFestival) { extraText = info.solarFestival; extraCls = "festival"; }
          else if (info.term) { extraText = info.term; extraCls = "term"; }
          else if (info.isWorkday) { extraText = "班"; extraCls = "workday"; }
        }
        if (!extraText && settings.calendar.showLunar) {
          extraText = info.lunarText;
        }

        return (
          <div
            key={i}
            className={"month-cell" + (inMonth ? "" : " outside") + (isToday ? " today" : "")}
            onClick={() => {
              const now = new Date();
              const start = ds + "T" + (now.getHours() < 10 ? "0" : "") + now.getHours() + ":00";
              ui.openEventModal({ open: true, start, end: start });
            }}
            onDoubleClick={() => props.onDateDoubleClick(ds)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (dragEventId) { dropEvent(dragEventId, ds); setDragEventId(null); }
              if (dragTaskId) { dropTask(dragTaskId, ds); setDragTaskId(null); }
            }}
          >
            <div className="cell-top">
              <span className="cell-date">{d.getDate()}</span>
              <span className={"cell-extra " + extraCls}>{extraText}</span>
              <span className="cell-mark">
                {diaryDates.has(ds) && <span title="有日记">📝</span>}
                {info.isHoliday && <span title="法定假日">🎉</span>}
              </span>
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
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxEvent(ev); openMenu(e); }}
              >
                {!ev.allDay && <span style={{ fontSize: 10 }}>{fmtTimeShort(ev.start)}</span>}
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
                onClick={(e) => { e.stopPropagation(); openTask(t); }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>☑ {t.title}</span>
              </div>
            ))}
            {rest > 0 && (
              <div className="month-event more" onClick={(e) => { e.stopPropagation(); navigate({ name: "calendar", view: "day", date: ds }); }}>
                +{rest} 更多
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function fmtTimeShort(iso: string): string {
  const d = parseDateTime(iso);
  return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
}
