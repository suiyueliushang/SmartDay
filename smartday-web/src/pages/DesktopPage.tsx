// ============================================================
// 桌面日历网页预览页：经典毛玻璃 / 日历清单 双样式
// 供后续 Electron/Tauri 封装为 Windows 壁纸日历（托盘/穿透/全局快捷键另行实现）
// ============================================================
import React, { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { parseDate, addMonths, fmtDate, startOfWeek, addDays, todayStr, parseDateTime, fmtTime, WEEKDAY_SHORT } from "@/lib/date";
import { getDayInfo } from "@/lib/holidays";
import { eventOccurrencesInRange } from "@/lib/recurrence";
import { DesktopStyle, DesktopSize, DesktopOpacity } from "@/types";

export function DesktopPage() {
  const [style, setStyle] = useState<DesktopStyle>("glass");
  const [size, setSize] = useState<DesktopSize>("medium");
  const [opacity, setOpacity] = useState<DesktopOpacity>(92);
  const [month, setMonth] = useState(() => fmtDate(new Date()));
  const [editMode, setEditMode] = useState(true);

  return (
    <div className="desktop-page">
      <div className="desktop-toolbar card card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>🖥️ 桌面日历预览</b>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>双样式实时预览（壁纸挂载 / 托盘常驻 / 点击穿透由桌面端封装实现）</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select className="select" style={{ width: 150 }} value={style} onChange={(e) => setStyle(e.target.value as DesktopStyle)}>
            <option value="glass">🎨 经典毛玻璃（默认）</option>
            <option value="list">🌊 日历清单</option>
          </select>
          <select className="select" style={{ width: 100 }} value={size} onChange={(e) => setSize(e.target.value as DesktopSize)}>
            <option value="small">小</option>
            <option value="medium">中</option>
            <option value="large">大</option>
            <option value="full">全宽</option>
          </select>
          <select className="select" style={{ width: 110 }} value={opacity} onChange={(e) => setOpacity(Number(e.target.value) as DesktopOpacity)}>
            {[30, 60, 80, 92].map((o) => <option key={o} value={o}>{o}% 透明度</option>)}
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={editMode} onChange={(e) => setEditMode(e.target.checked)} />
            {editMode ? "🔓 编辑模式" : "🔒 桌面模式（点击穿透）"}
          </label>
        </div>
      </div>

      <div className="desk-wrap" style={{ justifyContent: "center", display: "grid", placeItems: "start center", padding: 20 }}>
        <div
          style={{ opacity: opacity / 100 }}
          className={"desk-size-" + size}
        >
          {style === "glass"
            ? <GlassCalendar month={month} setMonth={setMonth} editMode={editMode} />
            : <ListCalendar month={month} setMonth={setMonth} editMode={editMode} />}
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", paddingBottom: 20 }}>
        {editMode ? "编辑模式：可点击事件、翻月、调整大小/透明度/位置" : "桌面模式：点击穿透到桌面，可正常操作桌面图标"}
        <br />切换方式（桌面端）：双击 🔒/🔓 图标 · 全局快捷键 Ctrl+Alt+D · 双击托盘图标
      </div>
    </div>
  );
}

// ---------------- 共用数据 ----------------
function useMonthData(month: string) {
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const diaries = useStore((s) => s.diaries);
  const categories = useStore((s) => s.categories);
  const start = parseDate(month);
  const end = addMonths(start, 1);
  const gridStart = startOfWeek(start, 1);

  const expanded = useMemo(() => {
    const list: Array<{ day: string; time?: string; title: string; color: string; id: string }> = [];
    for (const ev of events) {
      for (const occ of eventOccurrencesInRange(ev, gridStart, end)) {
        const s2 = parseDateTime(occ.start);
        list.push({
          day: fmtDate(s2),
          time: occ.allDay ? undefined : fmtTime(s2),
          title: occ.title,
          color: occ.color ?? categories.find((c) => c.id === occ.categoryId)?.color ?? "#4f6ef7",
          id: occ.id,
        });
      }
    }
    for (const t of tasks) {
      if (!t.completed && t.dueDate && parseDate(t.dueDate) >= gridStart && parseDate(t.dueDate) < end) {
        list.push({
          day: t.dueDate,
          time: t.dueTime ?? undefined,
          title: t.title,
          color: { high: "#e03131", medium: "#f97316", low: "#4f6ef7", none: "#94a3b8" }[t.priority],
          id: "t" + t.id,
        });
      }
    }
    const m = new Map<string, typeof list>();
    for (const item of list) {
      if (!m.has(item.day)) m.set(item.day, []);
      m.get(item.day)!.push(item);
    }
    return m;
  }, [events, tasks, categories, gridStart, end]);

  const diaryDates = useMemo(() => new Set(diaries.map((d) => d.date)), [diaries]);

  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  return { expanded, diaryDates, cells, start, end };
}

// ---------------- 毛玻璃样式 ----------------
function GlassCalendar(props: { month: string; setMonth: (m: string) => void; editMode: boolean }) {
  const { expanded, diaryDates, cells, start } = useMonthData(props.month);
  const ui = useUiStore();
  const today = todayStr();
  return (
    <div className="desk-glass">
      <div className="desk-head">
        <div style={{ fontWeight: 700, fontSize: 14 }}>{start.getFullYear()}年{start.getMonth() + 1}月</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {props.editMode && (
            <>
              <button className="icon-btn" onClick={() => props.setMonth(fmtDate(addMonths(parseDate(props.month), -1)))}>‹</button>
              <button className="icon-btn" onClick={() => props.setMonth(fmtDate(new Date()))}>今天</button>
              <button className="icon-btn" onClick={() => props.setMonth(fmtDate(addMonths(parseDate(props.month), 1)))}>›</button>
            </>
          )}
          <span style={{ fontSize: 18, cursor: "pointer" }} title={props.editMode ? "点击切换为桌面模式" : "点击切换为编辑模式"}>{props.editMode ? "🔓" : "🔒"}</span>
        </div>
      </div>
      <div className="desk-body">
        <div className="desk-grid">
          {WEEKDAY_SHORT.map((w, i) => <div key={i} className="dw">{w}</div>)}
          {cells.map((d, i) => {
            const ds = fmtDate(d);
            const info = getDayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
            const evs = (expanded.get(ds) ?? []).slice(0, 3);
            const inMonth = d.getMonth() === start.getMonth();
            return (
              <div key={i} className={"desk-day" + (inMonth ? "" : " outside") + (ds === today ? " today" : "")}
                title={ds + " " + info.lunarText}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="num">{d.getDate()}</span>
                  {diaryDates.has(ds) && <span style={{ fontSize: 8 }}>📝</span>}
                </div>
                {inMonth && info.holidayName && <span className="fest">{info.holidayName}</span>}
                {inMonth && !info.holidayName && info.term && <span className="term">{info.term}</span>}
                {evs.map((ev) => (
                  <span key={ev.id} className="ev" onClick={() => props.editMode && ui.openEventModal({ open: true, eventId: ev.id.split("@")[0] })}>
                    {ev.time ? ev.time + " " : ""}{ev.title}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <TodayPanel month={props.month} editMode={props.editMode} />
    </div>
  );
}

// ---------------- 日历清单样式 ----------------
function ListCalendar(props: { month: string; setMonth: (m: string) => void; editMode: boolean }) {
  const { expanded, diaryDates, cells, start } = useMonthData(props.month);
  const ui = useUiStore();
  const today = todayStr();
  const todayInfo = getDayInfo(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  return (
    <div className="desk-list">
      <div className="desk-head">
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{start.getFullYear()}年{start.getMonth() + 1}月</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>今天 {today.slice(5).replace("-", "月")}日 · {todayInfo.lunarText}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {props.editMode && (
            <>
              <button className="icon-btn" style={{ color: "#fff" }} onClick={() => props.setMonth(fmtDate(addMonths(parseDate(props.month), -1)))}>‹</button>
              <button className="icon-btn" style={{ color: "#fff" }} onClick={() => props.setMonth(fmtDate(new Date()))}>•</button>
              <button className="icon-btn" style={{ color: "#fff" }} onClick={() => props.setMonth(fmtDate(addMonths(parseDate(props.month), 1)))}>›</button>
            </>
          )}
          <span style={{ fontSize: 18, cursor: "pointer" }}>{props.editMode ? "🔓" : "🔒"}</span>
        </div>
      </div>
      <div className="desk-body">
        <div className="desk-grid">
          {WEEKDAY_SHORT.map((w, i) => <div key={i} className="dw">{w}</div>)}
          {cells.map((d, i) => {
            const ds = fmtDate(d);
            const info = getDayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
            const evs = (expanded.get(ds) ?? []).slice(0, 4);
            const inMonth = d.getMonth() === start.getMonth();
            return (
              <div key={i} className={"desk-day" + (inMonth ? "" : " outside") + (ds === today ? " today" : "")}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="num">{d.getDate()}</span>
                  {diaryDates.has(ds) && <span style={{ fontSize: 8 }}>📝</span>}
                </div>
                {inMonth && info.holidayName && <span className="fest">{info.holidayName}</span>}
                {inMonth && !info.holidayName && info.term && <span className="term">{info.term}</span>}
                {evs.map((ev) => (
                  <span key={ev.id} className="ev" onClick={() => props.editMode && ui.openEventModal({ open: true, eventId: ev.id.split("@")[0] })}>
                    {ev.time ? ev.time.slice(0, 5) + " " : ""}{ev.title}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(191,219,254,0.8)", fontSize: 11 }}>
        <b>今日日程</b>
        <TodayPanel month={props.month} editMode={props.editMode} />
      </div>
    </div>
  );
}

function TodayPanel(props: { month: string; editMode: boolean }) {
  const { expanded } = useMonthData(props.month);
  const today = todayStr();
  const items = (expanded.get(today) ?? []).slice(0, 4);
  const tasks = useStore((s) => s.tasks);
  const toggle = useStore((s) => s.toggleTaskComplete);
  const todayTasks = tasks.filter((t) => !t.completed && t.dueDate === today).slice(0, 3);
  if (!items.length && !todayTasks.length) return null;
  return (
    <div className="desk-today-panel">
      {items.map((ev) => (
        <div key={ev.id} className="desk-today-item">
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: ev.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5 }}>{ev.time ? ev.time.slice(0, 5) + " " : ""}{ev.title}</span>
        </div>
      ))}
      {todayTasks.map((t) => (
        <div key={t.id} className="desk-today-item">
          <span className="task-check" style={{ width: 12, height: 12, borderWidth: 1.5 }} onClick={(e) => { e.stopPropagation(); if (props.editMode) void toggle(t.id); }} />
          <span style={{ fontSize: 11.5, textDecoration: "none" }}>☑ {t.title}</span>
        </div>
      ))}
    </div>
  );
}
