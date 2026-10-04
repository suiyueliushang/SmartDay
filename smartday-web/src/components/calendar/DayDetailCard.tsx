// ============================================================
// 当天详情卡：单击日历日期单元格后，在左侧栏显示这一天的事件 / 任务 / 笔记
// ============================================================
import React, { useMemo } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { eventOccurrencesInRange } from "@/lib/recurrence";
import { getDayInfo } from "@/lib/holidays";
import { parseDate, fmtTime, addDays, todayStr } from "@/lib/date";

const WEEK_FULL = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function DayDetailCard(props: { date: string }) {
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const diaries = useStore((s) => s.diaries);
  const notes = useStore((s) => s.notes);
  const categories = useStore((s) => s.categories);
  const toggleTask = useStore((s) => s.toggleTaskComplete);
  const createTask = useStore((s) => s.createTask);
  const ui = useUiStore();

  const date = props.date;
  const d = useMemo(() => parseDate(date), [date]);
  const info = useMemo(() => getDayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate()), [d]);

  const colorOf = (categoryId?: string, fallback?: string) =>
    fallback ?? categories.find((c) => c.id === categoryId)?.color ?? "var(--accent)";

  // 当天事件（含重复事件展开）
  const dayEvents = useMemo(() => {
    const start = parseDate(date);
    const end = addDays(start, 1);
    const list: Array<{ id: string; parentId?: string; title: string; allDay: boolean; start: number; color: string; location?: string }> = [];
    for (const ev of events) {
      for (const occ of eventOccurrencesInRange(ev, start, end)) {
        list.push({
          id: occ.id, parentId: ev.id, title: occ.title, allDay: occ.allDay,
          start: new Date(occ.start).getTime(), color: colorOf(ev.categoryId, ev.color), location: occ.location,
        });
      }
    }
    return list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
  }, [events, date, categories]);

  // 当天任务：到期日 = 该天，或加入了「我的一天」
  const dayTasks = useMemo(
    () => tasks
      .filter((t) => t.dueDate === date || t.inMyDay === date)
      .sort((a, b) => Number(a.completed) - Number(b.completed) || a.order - b.order),
    [tasks, date]
  );

  const dayDiary = useMemo(() => diaries.find((x) => x.date === date), [diaries, date]);
  const dayNotes = useMemo(() => notes.filter((n) => n.date === date).sort((a, b) => b.updatedAt - a.updatedAt), [notes, date]);

  const openNote = (id: string) => {
    // 交给笔记页打开指定笔记（读取后即清除，避免下次误开）
    localStorage.setItem("smartday.pendingNote", id);
    location.hash = "#/diary";
  };
  const openDiary = () => { location.hash = "#/diary/date:" + date; };

  const addTask = () => {
    const title = window.prompt("添加到 " + date + " 的任务：", "");
    if (!title || !title.trim()) return;
    void createTask({ title: title.trim(), dueDate: date, listId: "list-inbox" });
  };
  const addEvent = () => {
    const start = new Date(d);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 3600000);
    const p = (n: number) => String(n).padStart(2, "0");
    const fmt = (x: Date) => x.getFullYear() + "-" + p(x.getMonth() + 1) + "-" + p(x.getDate()) + "T" + p(x.getHours()) + ":" + p(x.getMinutes());
    ui.openEventModal({ open: true, start: fmt(start), end: fmt(end) });
  };

  const isToday = date === todayStr();

  return (
    <div className="card day-detail">
      <div className="dd-head">
        <div className="dd-date">
          {d.getMonth() + 1}月{d.getDate()}日 <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>{WEEK_FULL[d.getDay()]}</span>
          {isToday && <span className="badge orange" style={{ marginLeft: 6 }}>今天</span>}
        </div>
        <div className="dd-sub">
          {info.lunarShort}
          {info.festivalText ? " · " + info.festivalText : ""}
          {info.isWorkday ? " · 调休上班" : info.isHoliday ? " · 放假" : ""}
        </div>
      </div>

      <div className="dd-sec">
        <div className="dd-sec-title">📅 事件 <span className="nn-count">{dayEvents.length}</span></div>
        {!dayEvents.length && <div className="dd-empty">这一天没有事件</div>}
        {dayEvents.map((ev) => (
          <div
            key={ev.id}
            className="dd-item"
            title={ev.title + (ev.location ? " @ " + ev.location : "")}
            onClick={() => ui.openEventModal({ open: true, eventId: ev.parentId ?? ev.id })}
          >
            <span className="dd-time">{ev.allDay ? "全天" : fmtTime(new Date(ev.start))}</span>
            <span className="dd-dot" style={{ background: ev.color }} />
            <span className="dd-text">{ev.title}</span>
          </div>
        ))}
      </div>

      <div className="dd-sec">
        <div className="dd-sec-title">✅ 任务 <span className="nn-count">{dayTasks.length}</span></div>
        {!dayTasks.length && <div className="dd-empty">这一天没有任务</div>}
        {dayTasks.map((t) => (
          <div key={t.id} className={"dd-item" + (t.completed ? " done" : "")} onClick={() => ui.openTaskDetail(t.id)} title={t.title}>
            <span
              className={"task-check" + (t.completed ? " done" : "")}
              style={{ width: 15, height: 15, flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); void toggleTask(t.id); }}
            />
            <span className="dd-text">{t.title}</span>
            {t.inMyDay === date && <span className="dd-time">我的一天</span>}
          </div>
        ))}
      </div>

      <div className="dd-sec">
        <div className="dd-sec-title">📝 笔记 <span className="nn-count">{dayNotes.length + (dayDiary ? 1 : 0)}</span></div>
        {!dayDiary && !dayNotes.length && <div className="dd-empty">这一天还没有笔记</div>}
        {dayDiary && (
          <div className="dd-item" onClick={openDiary} title={dayDiary.title || dayDiary.date}>
            <span className="dd-time">日记</span>
            <span className="dd-dot" style={{ background: "var(--success)" }} />
            <span className="dd-text">{dayDiary.title || dayDiary.date}</span>
          </div>
        )}
        {dayNotes.map((n) => (
          <div key={n.id} className="dd-item" onClick={() => openNote(n.id)} title={n.title}>
            <span className="dd-dot" style={{ background: "var(--accent)" }} />
            <span className="dd-text">{n.title || "无标题笔记"}</span>
          </div>
        ))}
      </div>

      <div className="dd-foot">
        <button className="btn btn-sm" onClick={addEvent} title="在这一天新建事件">＋ 事件</button>
        <button className="btn btn-sm" onClick={addTask} title="在这一天新建任务">＋ 任务</button>
        <button className="btn btn-sm" onClick={openDiary} title="写下这一天的日记">写日记</button>
      </div>
      <div className="dd-empty" style={{ padding: "0 12px 10px" }}>
        提示：单击日期查看当天内容，双击日期可直接新建事件
      </div>
    </div>
  );
}
