// 议程视图：未来事件 + 到期任务按时间列出
import React, { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useCalendarRange, eventColor, PRIORITY_NAMES } from "./calendarData";
import { parseDateTime, fmtDate, fmtTime, parseDate, addDays, startOfDay, todayStr } from "@/lib/date";
import { useUiStore } from "@/store/uiStore";
import { Seg } from "../common";

type Range = "7" | "30" | "all";

export function AgendaView() {
  const [range, setRange] = useState<Range>("7");
  const [limit, setLimit] = useState(20);
  const settings = useStore((s) => s.settings);
  const ui = useUiStore();

  const now = new Date();
  const daysAhead = range === "7" ? 7 : range === "30" ? 30 : 3650;
  const end = addDays(startOfDay(now), daysAhead);
  const { expanded, categories } = useCalendarRange(startOfDay(now), end);

  const tasks = useStore((s) => s.tasks);
  const dueTasks = tasks
    .filter((t) => !t.completed && t.dueDate)
    .map((t) => ({ t, d: parseDate(t.dueDate!) }))
    .filter((x) => x.d < end)
    .sort((a, b) => a.d.getTime() - b.d.getTime());

  interface Item {
    key: string;
    date: Date;
    time?: string;
    kind: "event" | "task";
    title: string;
    sub?: string;
    color: string;
    overdue: boolean;
    onClick: () => void;
  }

  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    for (const ev of expanded) {
      const s = parseDateTime(ev.start);
      if (s < now) continue;
      list.push({
        key: ev.id,
        date: s,
        time: ev.allDay ? "全天" : fmtTime(s),
        kind: "event",
        title: ev.title,
        sub: ev.location,
        color: eventColor(ev, categories),
        overdue: false,
        onClick: () => ui.openEventModal({ open: true, eventId: ev.parentId ?? ev.id }),
      });
    }
    for (const x of dueTasks) {
      const t = x.t;
      const overdue = x.d.getTime() < startOfDay(now).getTime();
      list.push({
        key: t.id,
        date: x.d,
        time: overdue ? "已过期" : (t.dueTime ?? "全天"),
        kind: "task",
        title: t.title,
        sub: (t.priority !== "none" ? PRIORITY_NAMES[t.priority] : "") + (t.tags.length ? " · " + t.tags.join("、") : ""),
        color: { high: "#e03131", medium: "#f97316", low: "#4f6ef7", none: "#94a3b8" }[t.priority],
        overdue,
        onClick: () => ui.openTaskDetail(t.id),
      });
    }
    list.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.time ?? "").localeCompare(b.time ?? ""));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, dueTasks, categories]);

  const visible = items.slice(0, limit);

  const grouped = useMemo(() => {
    const g: Array<{ day: string; items: Item[] }> = [];
    for (const it of visible) {
      const ds = fmtDate(it.date);
      const last = g[g.length - 1];
      if (last && last.day === ds) last.items.push(it);
      else g.push({ day: ds, items: [it] });
    }
    return g;
  }, [visible]);

  return (
    <div>
      <div className="cal-toolbar">
        <Seg<Range>
          value={range}
          onChange={(v) => { setRange(v); setLimit(20); }}
          options={[
            { value: "7", label: "未来 7 天" },
            { value: "30", label: "未来 30 天" },
            { value: "all", label: "全部" },
          ]}
        />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>共 {items.length} 项</span>
      </div>
      <div className="agenda-list">
        {!visible.length && <div className="empty">近期没有日程与到期任务 🎉</div>}
        {grouped.map((g) => {
          const d = parseDate(g.day);
          const isToday = g.day === todayStr();
          return (
            <React.Fragment key={g.day}>
              <div className="agenda-day">
                {isToday ? "今天" : d.getMonth() + 1 + "月" + d.getDate() + "日"}
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{["周日","周一","周二","周三","周四","周五","周六"][d.getDay()]}</span>
                <span className="line" />
              </div>
              {g.items.map((it) => (
                <div
                  key={it.key}
                  className={"agenda-item" + (it.kind === "task" ? " task" : "") + (it.overdue ? " overdue" : "")}
                  onClick={it.onClick}
                >
                  <span className="dot" style={{ background: it.color }} />
                  <span className="time">{it.time}</span>
                  <span className="title">{it.title}</span>
                  <span className="meta">{it.sub}</span>
                </div>
              ))}
            </React.Fragment>
          );
        })}
        {visible.length < items.length && (
          <div style={{ textAlign: "center", padding: 14 }}>
            <button className="btn btn-sm" onClick={() => setLimit((l) => l + 20)}>加载更多（还有 {items.length - visible.length} 项）</button>
          </div>
        )}
      </div>
    </div>
  );
}
