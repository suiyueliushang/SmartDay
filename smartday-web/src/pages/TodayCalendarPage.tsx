// ============================================================
// 今天 + 日历 合并页（安卓端主页面）
// 布局（自上而下）：
//   1. 日历（工具栏 + 月视图）      —— 置顶
//   2. 当天详情（事件 / 任务 / 笔记）
//   3. 本周统计
//   4. 纪念日与倒计时               —— 收尾
// 日历显示设置（含「我的日历」分类管理）收纳进右上角 ⚙️ 弹窗。
// ============================================================
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { navigate, useRoute } from "@/lib/router";
import { parseDate, fmtDate, addMonths, addDays, todayStr, fmtDateTime } from "@/lib/date";
import { MonthView } from "@/components/calendar/MonthView";
import { WeekDayView } from "@/components/calendar/WeekDayView";
import { AgendaView } from "@/components/calendar/AgendaView";
import { YearView } from "@/components/calendar/YearView";
import { DayDetailCard } from "@/components/calendar/DayDetailCard";
import { Modal, Seg, Switch } from "@/components/common";
import { CalendarView, Settings, WeekStart } from "@/types";
import { WeeklyStats, AnniversariesPanel } from "@/pages/OverviewPage";

export function TodayCalendarPage() {
  const route = useRoute();
  const view = (route.view as CalendarView) || "month";
  const activeDate = useUiStore((s) => s.activeDate);
  const setActiveDate = useUiStore((s) => s.setActiveDate);
  const setCalendarView = useUiStore((s) => s.setCalendarView);
  const openEventModal = useUiStore((s) => s.openEventModal);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 路由中的 date 参数同步到 activeDate
  useEffect(() => {
    if (route.date) setActiveDate(route.date);
    if (route.view) setCalendarView(route.view as CalendarView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.date, route.view]);

  const title = useMemo(() => {
    const d = parseDate(activeDate);
    if (view === "month") return d.getFullYear() + "年" + (d.getMonth() + 1) + "月";
    if (view === "year") return d.getFullYear() + "年";
    if (view === "agenda") return "议程";
    if (view === "day") return d.getMonth() + 1 + "月" + d.getDate() + "日";
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月";
  }, [activeDate, view]);

  const nav = (dir: number) => {
    const d = parseDate(activeDate);
    if (view === "month" || view === "year" || view === "agenda") setActiveDate(fmtDate(addMonths(d, dir)));
    else setActiveDate(fmtDate(addDays(d, dir * 7)));
  };

  const switchView = (v: CalendarView) => {
    setCalendarView(v);
    navigate({ name: "overview", view: v, date: route.date || undefined });
  };

  return (
    <div className="page page-wide">
      <div className="today-cal">
        {/* ---------- 1. 日历（置顶） ---------- */}
        <section className="tc-calendar">
          <div className="cal-toolbar">
            <div className="cal-nav-group">
              <button className="btn btn-icon" onClick={() => nav(-1)} aria-label="上一页">‹</button>
              <button className="btn btn-sm" onClick={() => setActiveDate(todayStr())}>今天</button>
              <button className="btn btn-icon" onClick={() => nav(1)} aria-label="下一页">›</button>
            </div>
            <div className="title">{title}</div>
            <button
              className="btn btn-icon cal-settings-btn"
              onClick={() => setSettingsOpen(true)}
              aria-label="日历设置"
              title="日历设置"
            >⚙️</button>
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

          <div className="tc-cal-body">
            {view === "month" && (
              <MonthView
                month={activeDate}
                selected={activeDate}
                onDateDoubleClick={(d) => {
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
            {view === "year" && (
              <YearView
                year={parseDate(activeDate).getFullYear()}
                onDay={(d) => { setActiveDate(d); navigate({ name: "overview", view: "day", date: d }); }}
                onMonth={(m) => { setActiveDate(m); navigate({ name: "overview", view: "month", date: m }); }}
              />
            )}
            {view === "agenda" && <AgendaView />}
          </div>
        </section>

        {/* ---------- 2. 当天详情 ---------- */}
        <DayDetailCard date={activeDate} />

        {/* ---------- 3. 纪念日与倒计时 ---------- */}
        <AnniversariesPanel />

        {/* ---------- 4. 本周统计（收尾） ---------- */}
        <WeeklyStats />
      </div>

      <CalendarSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// ============================================================
// 日历设置弹窗：显示选项 + 「我的日历」分类管理
// ============================================================
function CalendarSettingsModal(props: { open: boolean; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const categories = useStore((s) => s.categories);
  const events = useStore((s) => s.events);
  const updateCategory = useStore((s) => s.updateCategory);
  const createCategory = useStore((s) => s.createCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const set = (patch: Partial<Settings["calendar"]>) =>
    void useStore.getState().updateSettings((s) => ({ ...s, calendar: { ...s.calendar, ...patch } }));
  const c = settings.calendar;

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#4f6ef7");

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) m[e.categoryId] = (m[e.categoryId] ?? 0) + 1;
    return m;
  }, [events]);

  return (
    <Modal open={props.open} onClose={props.onClose} title="日历设置" footer={
      <button className="btn btn-primary" onClick={props.onClose}>完成</button>
    }>
      <div className="cal-set-group">
        <div className="cal-set-title">显示</div>
        <label className="cal-set-row">
          <span>显示农历</span>
          <Switch checked={c.showLunar} onChange={(v) => set({ showLunar: v })} />
        </label>
        <label className="cal-set-row">
          <span>显示节假日<em>农历节日 / 公历节日 / 节气</em></span>
          <Switch checked={c.showFestivals} onChange={(v) => set({ showFestivals: v })} />
        </label>
        <label className="cal-set-row">
          <span>显示周数</span>
          <Switch checked={c.showWeekNumbers} onChange={(v) => set({ showWeekNumbers: v })} />
        </label>
        <label className="cal-set-row">
          <span>任务显示在日历中<em>有截止日期的任务自动显示</em></span>
          <Switch checked={c.showTasksInCalendar} onChange={(v) => set({ showTasksInCalendar: v })} />
        </label>
      </div>

      <div className="cal-set-group">
        <div className="cal-set-title">默认视图</div>
        <Seg<CalendarView>
          value={c.defaultView}
          onChange={(v) => set({ defaultView: v })}
          options={[
            { value: "month", label: "月" }, { value: "week", label: "周" }, { value: "day", label: "日" },
            { value: "year", label: "年" }, { value: "agenda", label: "议程" },
          ]}
        />
      </div>

      <div className="cal-set-group">
        <div className="cal-set-title">每周起始日</div>
        <Seg<WeekStart>
          value={c.weekStart}
          onChange={(v) => set({ weekStart: v })}
          options={[{ value: 1, label: "周一" }, { value: 0, label: "周日" }]}
        />
      </div>

      {/* 「我的日历」——分类显隐 + 设为默认（原日历页侧栏迁入） */}
      <div className="cal-set-group">
        <div className="cal-set-title">我的日历</div>
        {categories.map((cat) => (
          <div key={cat.id} className="cal-set-cat">
            <span className="cal-set-dot" style={{ background: cat.color }} />
            <span className="cal-set-cat-name">{cat.name}</span>
            <span className="cal-set-count">{counts[cat.id] ?? 0}</span>
            <button
              className={"btn btn-sm" + (cat.isDefault ? " btn-primary" : "")}
              onClick={() => {
                for (const x of categories) void updateCategory(x.id, { isDefault: cat.isDefault ? false : x.id === cat.id });
              }}
            >{cat.isDefault ? "默认" : "设为默认"}</button>
            <input
              type="checkbox"
              checked={cat.visible}
              onChange={() => void updateCategory(cat.id, { visible: !cat.visible })}
              style={{ accentColor: cat.color }}
              title="显示 / 隐藏"
            />
            <button
              className="icon-btn"
              onClick={() => { if (window.confirm("删除分类「" + cat.name + "」？")) void deleteCategory(cat.id); }}
              disabled={categories.length <= 1 && cat.isDefault}
              title="删除分类"
            >🗑️</button>
          </div>
        ))}
        <div className="field-row" style={{ marginTop: 8 }}>
          <input className="input" placeholder="新分类名称" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 44, height: 36, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elev)" }} />
          <button
            className="btn btn-primary"
            onClick={async () => {
              if (!newName.trim()) return;
              await createCategory({ name: newName.trim(), color: newColor });
              setNewName("");
            }}
          >添加</button>
        </div>
        <div className="cal-set-hint">💡 取消勾选 = 隐藏（非删除）</div>
      </div>
    </Modal>
  );
}
