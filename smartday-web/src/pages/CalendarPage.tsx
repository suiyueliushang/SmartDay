// 日历页：工具栏 + 五视图切换 + 分类侧栏
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { useRoute, navigate } from "@/lib/router";
import { parseDate, fmtDate, addMonths, addDays, todayStr, fmtDateTime } from "@/lib/date";
import { MonthView } from "@/components/calendar/MonthView";
import { WeekDayView } from "@/components/calendar/WeekDayView";
import { YearView } from "@/components/calendar/YearView";
import { AgendaView } from "@/components/calendar/AgendaView";
import { DayDetailCard } from "@/components/calendar/DayDetailCard";
import { CalendarView } from "@/types";
import { Modal, Seg } from "@/components/common";

export function CalendarPage() {
  const route = useRoute();
  const view = (route.view as CalendarView) || "month";
  const activeDate = useUiStore((s) => s.activeDate);
  const setActiveDate = useUiStore((s) => s.setActiveDate);
  const setCalendarView = useUiStore((s) => s.setCalendarView);
  const openEventModal = useUiStore((s) => s.openEventModal);
  const settings = useStore((s) => s.settings);
  const categories = useStore((s) => s.categories);
  const updateCategory = useStore((s) => s.updateCategory);
  const createCategory = useStore((s) => s.createCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const events = useStore((s) => s.events);
  const ui = useUiStore();

  // 路由中的 date 参数同步到 activeDate
  useEffect(() => {
    if (route.date) setActiveDate(route.date);
    if (route.view) setCalendarView(route.view as CalendarView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.date, route.view]);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("#4f6ef7");

  const title = useMemo(() => {
    const d = parseDate(activeDate);
    if (view === "month") return d.getFullYear() + "年" + (d.getMonth() + 1) + "月";
    if (view === "year") return d.getFullYear() + "年";
    if (view === "agenda") return "议程";
    if (view === "day") return d.getMonth() + 1 + "月" + d.getDate() + "日";
    // week
    const ws = settings.calendar.weekStart as 0 | 1;
    const first = new Date(d);
    const diff = (first.getDay() - ws + 7) % 7;
    first.setDate(first.getDate() - diff);
    const last = new Date(first);
    last.setDate(last.getDate() + 6);
    if (first.getMonth() === last.getMonth()) return first.getFullYear() + "年" + (first.getMonth() + 1) + "月" + first.getDate() + "日 - " + last.getDate() + "日";
    return first.getFullYear() + "年" + (first.getMonth() + 1) + "月" + first.getDate() + "日 - " + (last.getMonth() + 1) + "月" + last.getDate() + "日";
  }, [activeDate, view, settings.calendar.weekStart]);

  const nav = (dir: number) => {
    const d = parseDate(activeDate);
    if (view === "month") setActiveDate(fmtDate(addMonths(d, dir)));
    else if (view === "year") setActiveDate(fmtDate(new Date(d.getFullYear() + dir, d.getMonth(), 1)));
    else if (view === "agenda") setActiveDate(fmtDate(addDays(d, dir * 7)));
    else setActiveDate(fmtDate(addDays(d, dir * (view === "day" ? 1 : 7))));
  };

  const switchView = (v: CalendarView) => {
    setCalendarView(v);
    navigate({ name: "calendar", view: v, date: route.date || undefined });
  };

  return (
    <div className="page page-wide">
      <div className="cal-toolbar">
        <div className="cal-nav-group">
          <button className="btn btn-icon" onClick={() => nav(-1)}>‹</button>
          <button className="btn btn-sm" onClick={() => setActiveDate(todayStr())}>今天</button>
          <button className="btn btn-icon" onClick={() => nav(1)}>›</button>
        </div>
        <div className="title">{title}</div>
        <div className="cal-views">
          <Seg<CalendarView>
            value={view}
            onChange={switchView}
            options={[
              { value: "month", label: "月" },
              { value: "week", label: "周" },
              { value: "day", label: "日" },
              { value: "year", label: "年" },
              { value: "agenda", label: "议程" },
            ]}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 190, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <CategorySidebar
            onManage={() => setCatModalOpen(true)}
            onToggle={(id) => {
              const c = categories.find((x) => x.id === id);
              if (c) void updateCategory(id, { visible: !c.visible });
            }}
            onChangeDefault={(id) => {
              for (const c of categories) void updateCategory(c.id, { isDefault: c.id === id });
            }}
            counts={countByCategory(events)}
          />
          {/* 单击日期单元格 → 显示当天的事件 / 任务 / 笔记 */}
          {view === "month" && <DayDetailCard date={activeDate} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {view === "month" && (
            <MonthView
              month={activeDate}
              selected={activeDate}
              onDateDoubleClick={(d) => {
                // 需求：双击日期单元格才进入事件编辑（单击只选中，不弹窗）
                setActiveDate(d);
                const start = new Date(parseDate(d));
                start.setHours(9, 0, 0, 0);
                const end = new Date(start.getTime() + 3600000);
                openEventModal({ open: true, start: fmtDateTime(start), end: fmtDateTime(end) });
              }}
            />
          )}
          {view === "week" && <WeekDayView date={activeDate} isDay={false} />}
          {view === "day" && <WeekDayView date={activeDate} isDay />}
          {view === "year" && <YearView year={parseDate(activeDate).getFullYear()} onDay={(d) => { setActiveDate(d); navigate({ name: "calendar", view: "day", date: d }); }} onMonth={(m) => { setActiveDate(m); navigate({ name: "calendar", view: "month", date: m }); }} />}
          {view === "agenda" && <AgendaView />}
        </div>
      </div>

      {/* 分类管理弹窗 */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="日历分类">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {categories.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: "var(--bg)" }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color }} />
              <span style={{ flex: 1, fontWeight: c.isDefault ? 650 : 400, display: "flex", alignItems: "center", gap: 5 }}>
                {c.isDefault && <span title="默认分类（新建事件默认归到这里）" style={{ color: "var(--accent)" }}>★</span>}
                {c.name}
              </span>
              {/* 可设为默认，也可取消默认（取消后所有分类都不再是默认） */}
              <button
                className="btn btn-sm"
                onClick={() => {
                  for (const x of categories) void updateCategory(x.id, { isDefault: c.isDefault ? false : x.id === c.id });
                }}
              >
                {c.isDefault ? "取消默认" : "设为默认"}
              </button>
              <button className="icon-btn" onClick={() => void deleteCategory(c.id)} disabled={categories.length <= 1 && c.isDefault}>🗑️</button>
            </div>
          ))}
        </div>
        <div className="field-row">
          <input className="input" placeholder="新分类名称" value={catName} onChange={(e) => setCatName(e.target.value)} />
          <input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)} style={{ width: 44, height: 36, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elev)" }} />
          <button
            className="btn btn-primary"
            onClick={async () => {
              if (!catName.trim()) return;
              await createCategory({ name: catName.trim(), color: catColor });
              setCatName("");
            }}
          >添加</button>
        </div>
      </Modal>
    </div>
  );
}

function countByCategory(events: { categoryId: string }[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const e of events) m[e.categoryId] = (m[e.categoryId] ?? 0) + 1;
  return m;
}

function CategorySidebar(props: {
  onManage: () => void;
  onToggle: (id: string) => void;
  onChangeDefault: (id: string) => void;
  counts: Record<string, number>;
}) {
  const categories = useStore((s) => s.categories);
  return (
    <div className="card" style={{ padding: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 650, padding: "2px 6px 8px", display: "flex", alignItems: "center" }}>
        我的日历
        <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={props.onManage} title="管理分类">⚙️</button>
      </div>
      {categories.map((c) => (
        <div key={c.id} className="list-item" style={{ cursor: "default" }} title={c.visible ? "点击隐藏" : "点击显示"}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: c.color, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{c.name}</span>
          <span className="count">{props.counts[c.id] ?? 0}</span>
          <input
            type="checkbox"
            checked={c.visible}
            onChange={() => props.onToggle(c.id)}
            style={{ accentColor: c.color }}
            title="显示/隐藏"
          />
        </div>
      ))}
      <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px 6px 0", lineHeight: 1.5 }}>
        💡 取消勾选 = 隐藏（非删除）；右键分类可设为默认
      </div>
    </div>
  );
}
