// 周视图 / 日视图（时间轴布局，支持拖拽、框选创建、重叠分列、调整时长）
import React, { useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { useCalendarRange, eventColor } from "./calendarData";
import { Menu, useContextMenu } from "../common";
import {
  parseDate, startOfWeek, fmtDate, addDays, parseDateTime, fmtDateTime, todayStr,
  timeToMinutes, fmtTime, WEEKDAY_SHORT,
} from "@/lib/date";
import { CalendarEvent, Task } from "@/types";

const HOUR_H = 46; // 每小时像素

export function WeekDayView(props: { date: string; isDay: boolean }) {
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const updateEvent = useStore((s) => s.updateEvent);
  const ui = useUiStore();
  const [now] = useState(() => new Date());
  const { pos, open: openMenu, close: closeMenu } = useContextMenu();
  const [ctxEvent, setCtxEvent] = useState<CalendarEvent | null>(null);
  const deleteEvent = useStore((s) => s.deleteEvent);

  const weekStart = settings.calendar.weekStart as 0 | 1;
  const days = useMemo(() => {
    if (props.isDay) return [parseDate(props.date)];
    const ws = startOfWeek(parseDate(props.date), weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [props.date, props.isDay, weekStart]);

  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);
  const { expanded, categories } = useCalendarRange(rangeStart, rangeEnd);

  const [workStart, workEnd] = settings.calendar.workHours;
  const totalHours = 24;

  const dayEvents = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const d of days) m.set(fmtDate(d), []);
    for (const ev of expanded) {
      const ds = fmtDate(parseDateTime(ev.start));
      if (m.has(ds)) m.get(ds)!.push(ev);
    }
    for (const v of m.values()) v.sort((a, b) => a.start.localeCompare(b.start));
    return m;
  }, [expanded, days]);

  const dayTasks = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const d of days) m.set(fmtDate(d), []);
    for (const t of tasks) {
      if (t.completed || !t.dueDate || !m.has(t.dueDate)) continue;
      m.get(t.dueDate)!.push(t);
    }
    return m;
  }, [tasks, days]);

  const dayAllDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const [ds, list] of dayEvents) {
      m.set(ds, list.filter((e) => e.allDay));
    }
    return m;
  }, [dayEvents]);

  const nowLineTop = ((now.getHours() + now.getMinutes() / 60) / 24) * 24 * HOUR_H;

  const openEvent = (ev: CalendarEvent) => ui.openEventModal({ open: true, eventId: ev.parentId ?? ev.id });

  const createAt = (day: Date, minutes: number) => {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
    const dur = settings.calendar.defaultEventDuration;
    const end = new Date(start.getTime() + dur * 60000);
    ui.openEventModal({ open: true, start: fmtDateTime(start), end: fmtDateTime(end) });
  };

  const dragRef = useRef<{ id: string } | null>(null);
  const onDragStartEv = (e: React.DragEvent, ev: CalendarEvent) => {
    dragRef.current = { id: ev.id };
    e.dataTransfer.setData("text/plain", ev.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const [selection, setSelection] = useState<{ day: Date; top: number; height: number } | null>(null);
  const selectStart = useRef<{ y: number } | null>(null);
  const onMouseDownSlot = (e: React.MouseEvent, day: Date, colEl: HTMLDivElement) => {
    if (e.button !== 0) return;
    const rect = colEl.getBoundingClientRect();
    selectStart.current = { y: e.clientY - rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!selectStart.current) return;
      const top = Math.min(selectStart.current.y, ev.clientY - rect.top);
      const height = Math.abs(ev.clientY - rect.top - selectStart.current.y);
      setSelection({ day, top, height });
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setSelection(null);
      if (!selectStart.current) return;
      const h = Math.abs(ev.clientY - rect.top - selectStart.current.y);
      if (h >= 8) {
        const startMin = Math.round((Math.min(selectStart.current.y, ev.clientY - rect.top) / HOUR_H) * 60);
        createAt(day, startMin);
      }
      selectStart.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const dropOnDay = (e: React.DragEvent, day: Date, colEl: HTMLDivElement) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const ev = expanded.find((x) => x.id === id);
    if (!ev) return;
    const rect = colEl.getBoundingClientRect();
    const minutes = Math.max(0, Math.round(((e.clientY - rect.top) / HOUR_H) * 60));
    const s = parseDateTime(ev.start);
    const eDate = parseDateTime(ev.end);
    const dur = eDate.getTime() - s.getTime();
    const newStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
    const newEnd = new Date(newStart.getTime() + dur);
    const patch = { start: fmtDateTime(newStart), end: fmtDateTime(newEnd) };
    if (ev.parentId) {
      const master = events.find((x) => x.id === ev.parentId);
      if (master) {
        void updateEvent(master.id, { exceptions: { ...(master.exceptions ?? {}), [fmtDate(s)]: { ...ev, ...patch } } });
      }
    } else {
      void updateEvent(ev.id, patch);
    }
    dragRef.current = null;
  };

  const resizeRef = useRef<{ ev: CalendarEvent; startY: number; origEnd: number } | null>(null);
  const onResizeStart = (e: React.MouseEvent, ev: CalendarEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const origEnd = parseDateTime(ev.end).getTime();
    resizeRef.current = { ev, startY: e.clientY, origEnd };
    const onMove = (ev2: MouseEvent) => {
      if (!resizeRef.current) return;
      const deltaMin = Math.round(((ev2.clientY - resizeRef.current.startY) / HOUR_H) * 60);
      const newEnd = new Date(resizeRef.current.origEnd + deltaMin * 60000);
      if (newEnd > parseDateTime(resizeRef.current.ev.start)) {
        void updateEvent(resizeRef.current.ev.id, { end: fmtDateTime(newEnd) });
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      resizeRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const totalH = totalHours * HOUR_H;

  return (
    <div className={"week-view" + (props.isDay ? " day-only" : "")}>
      {/* ① 表头行：星期 + 日期（独立成行，与全天行 / 时间网格共用同一套 grid 列模板 → 保证列对齐） */}
      <div className="week-head">
        <div className="wh-corner" />
        {days.map((d) => {
          const ds = fmtDate(d);
          const weekday = d.getDay();
          return (
            <div
              key={"head-" + ds}
              className={"day-col-head" + (ds === todayStr() ? " today" : "")}
              onClick={() => {
                ui.setActiveDate(ds);
                location.hash = "#/calendar/" + (props.isDay ? "day" : "week") + "/date:" + ds;
              }}
            >
              <div className="weekday">{props.isDay ? "今天" : WEEKDAY_SHORT[weekday]}</div>
              <div className="day-num">{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* ② 全天行 */}
      <div className="all-day-row">
        <div className="allday-label">全天</div>
        {days.map((d) => {
          const ds = fmtDate(d);
          const list = dayAllDay.get(ds) ?? [];
          return (
            <div
              key={ds}
              className="all-day-cell"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => dropOnDay(e, d, e.currentTarget)}
              onClick={() => createAt(d, 0)}
            >
              {list.map((ev) => (
                <div
                  key={ev.id}
                  className="month-event"
                  style={{ background: eventColor(ev, categories), maxWidth: "100%" }}
                  draggable
                  onDragStart={(e) => onDragStartEv(e, ev)}
                  onClick={(e) => { e.stopPropagation(); openEvent(ev); }}
                >
                  {ev.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* ③ 时间网格：顶部即 00:00 */}
      <div className="week-body" style={{ height: totalH }}>
        <div className="time-gutter">
          {Array.from({ length: totalHours + 1 }, (_, i) => (
            <div
              key={i}
              className={"time-slot" + (i === 0 ? " first" : "")}
              style={{ top: i * HOUR_H }}
            >
              {(i < 10 ? "0" + i : i) + ":00"}
            </div>
          ))}
        </div>

        {days.map((d, di) => {
          void di;
          const ds = fmtDate(d);
          const weekday = d.getDay();
          const isWorkday = settings.calendar.workdays.includes(weekday);
          return (
            <div
              key={ds}
              className={"day-col" + (isWorkday ? "" : " workoff")}
              style={{ height: totalH }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => dropOnDay(e, d, e.currentTarget)}
              onMouseDown={(e) => onMouseDownSlot(e, d, e.currentTarget)}
            >
              <div
                style={{
                  position: "absolute", left: 0, right: 0, top: workStart * HOUR_H,
                  height: (workEnd - workStart) * HOUR_H, background: "transparent", pointerEvents: "none",
                }}
              />

              {Array.from({ length: totalHours + 1 }, (_, i) => (
                <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * HOUR_H, borderTop: "1px solid var(--border)", pointerEvents: "none" }} />
              ))}

              {layoutEvents((dayEvents.get(ds) ?? []).filter((e) => !e.allDay), HOUR_H).map((it) => (
                <div
                  key={it.ev.id}
                  className="week-event"
                  style={{
                    top: it.top, height: it.height, left: it.left, width: it.width,
                    background: eventColor(it.ev, categories),
                  }}
                  draggable
                  onDragStart={(e) => onDragStartEv(e, it.ev)}
                  onClick={(e) => { e.stopPropagation(); openEvent(it.ev); }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxEvent(it.ev); openMenu(e); }}
                  title={it.ev.title}
                >
                  <div style={{ overflow: "hidden" }}>
                    <span className="ev-time">{fmtTime(parseDateTime(it.ev.start))}</span>
                    {it.height > 40 && <span> {it.ev.title}</span>}
                  </div>
                  {it.ev.location && it.height > 55 && <div style={{ fontSize: 10, opacity: 0.8, overflow: "hidden", whiteSpace: "nowrap" }}>{it.ev.location}</div>}
                  <div
                    onMouseDown={(e) => onResizeStart(e, it.ev)}
                    style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 6, cursor: "ns-resize", background: "rgba(255,255,255,0.25)" }}
                  />
                </div>
              ))}

              {(dayTasks.get(ds) ?? []).slice(0, 3).map((t) => (
                <div
                  key={t.id}
                  className="month-event task"
                  style={{ position: "absolute", top: 0, right: 4, zIndex: 4, ["--priority-color" as string]: taskColor(t) }}
                  onClick={(e) => { e.stopPropagation(); ui.openTaskDetail(t.id); }}
                >
                  {"☑ " + t.title}
                </div>
              ))}

              {ds === todayStr() && <div className="now-line" style={{ top: nowLineTop }} />}

              {selection && selection.day.getTime() === d.getTime() && (
                <div style={{ position: "absolute", left: 0, right: 0, top: selection.top, height: selection.height, background: "var(--accent-soft)", border: "1.5px solid var(--accent)", borderRadius: 6, pointerEvents: "none" }} />
              )}
            </div>
          );
        })}
      </div>

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

      {props.isDay && <TodayTasksPanel date={props.date} />}
    </div>
  );
}

// ---------- 重叠事件分列布局 ----------
interface LayoutItem {
  ev: CalendarEvent;
  top: number;
  height: number;
  left: string;
  width: string;
}
export function layoutEvents(events: CalendarEvent[], hourH: number): LayoutItem[] {
  const sorted = [...events].sort((a, b) => {
    const s1 = timeToMinutes(fmtTime(parseDateTime(a.start)));
    const s2 = timeToMinutes(fmtTime(parseDateTime(b.start)));
    return s1 - s2 || b.end.localeCompare(a.end);
  });
  const items: Array<{ ev: CalendarEvent; top: number; height: number; col: number }> = [];
  const colEnds: number[] = [];
  for (const ev of sorted) {
    const s = parseDateTime(ev.start);
    const e = parseDateTime(ev.end);
    const startMin = s.getHours() * 60 + s.getMinutes();
    const endMin = Math.max(startMin + 15, e.getHours() * 60 + e.getMinutes());
    let col = colEnds.findIndex((c) => c <= startMin);
    if (col < 0) col = colEnds.length;
    items.push({ ev, top: (startMin / 60) * hourH, height: Math.max(14, ((endMin - startMin) / 60) * hourH), col });
    colEnds[col] = endMin;
  }
  const n = Math.max(1, ...items.map((i) => i.col + 1));
  return items.map((it) => ({
    ev: it.ev,
    top: it.top,
    height: it.height,
    left: "calc(" + (it.col * 100) / n + "% + 2px)",
    width: "calc(" + 100 / n + "% - 4px)",
  }));
}

// ---------- 今日任务面板 ----------
function TodayTasksPanel(props: { date: string }) {
  const tasks = useStore((s) => s.tasks);
  const toggle = useStore((s) => s.toggleTaskComplete);
  const ui = useUiStore();
  const todayTasks = tasks.filter((t) => !t.completed && t.dueDate === props.date);
  if (!todayTasks.length) return null;
  return (
    <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 8 }}>今日任务</div>
      {todayTasks.map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}
          onClick={() => ui.openTaskDetail(t.id)}>
          <span className="task-check" onClick={(e) => { e.stopPropagation(); void toggle(t.id); }} style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
        </div>
      ))}
    </div>
  );
}

function taskColor(t: Task): string {
  return { high: "#e03131", medium: "#f97316", low: "#4f6ef7", none: "#94a3b8" }[t.priority];
}
