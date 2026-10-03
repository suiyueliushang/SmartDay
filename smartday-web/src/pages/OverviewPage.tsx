// ============================================================
// 概览面板：迷你日历 / 今日概览 / 纪念日与倒计时 / 本周统计
// ============================================================
import React, { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { MiniCalendar } from "@/components/calendar/MiniCalendar";
import { Modal, Field, Seg, Empty, useClickOutside } from "@/components/common";
import { todayStr, fmtDate, parseDate, addDays, fmtTime, diffDays, startOfWeek } from "@/lib/date";
import { eventOccurrencesInRange } from "@/lib/recurrence";
import { Anniversary, AnniversaryType, Task } from "@/types";
import { anniversaryDateInYear, nextAnniversaryDate } from "@/lib/reminderEngine";
import { navigate } from "@/lib/router";

export function OverviewPage() {
  const [selectedDay, setSelectedDay] = useState(todayStr());
  return (
    <div className="page page-wide">
      <div className="overview-grid">
        <div className="ov-stack">
          <MiniCard date={selectedDay} onSelect={setSelectedDay} />
          <TodayOverview />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <AnniversariesPanel />
          <WeeklyStats />
          <DaySummary date={selectedDay} />
        </div>
      </div>
    </div>
  );
}

// ---------------- 迷你日历 ----------------
function MiniCard(props: { date: string; onSelect: (d: string) => void }) {
  const diaries = useStore((s) => s.diaries);
  const [showAnniv, setShowAnniv] = useState(false);
  void showAnniv;
  return (
    <div className="card">
      <MiniCalendar date={props.date} onSelect={props.onSelect} selected={props.date} highlightEvents highlightDiaries />
      <div style={{ padding: "0 12px 12px", display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: "var(--text-muted)" }}>
        <span>📅 有日程</span><span>📝 有日记</span>
      </div>
    </div>
  );
}

// ---------------- 今日概览 ----------------
function TodayOverview() {
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const toggle = useStore((s) => s.toggleTaskComplete);
  const ui = useUiStore();
  const settings = useStore((s) => s.settings);
  const today = todayStr();

  const todayEvents = useMemo(() => {
    const dayStart = parseDate(today);
    const dayEnd = addDays(dayStart, 1);
    const list: Array<{ start: Date; title: string; allDay: boolean; loc?: string; id: string }> = [];
    for (const ev of events) {
      for (const occ of eventOccurrencesInRange(ev, dayStart, dayEnd)) {
        list.push({ start: parseDate(occ.start), title: occ.title, allDay: occ.allDay, loc: occ.location, id: occ.id });
      }
    }
    return list.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, today]);

  const todayTasks = tasks.filter((t) => t.dueDate === today);
  const overdueTasks = tasks.filter((t) => !t.completed && t.dueDate && parseDate(t.dueDate).getTime() < parseDate(today).getTime());

  return (
    <div className="card card-pad">
      <div className="card-title">☀️ 今日概览（{today}）</div>
      {!todayEvents.length && !todayTasks.length && !overdueTasks.length && (
        <div className="empty" style={{ padding: 18 }}>今天没有安排，享受自由时光 🎉</div>
      )}
      {todayEvents.map((ev) => (
        <div key={ev.id} className="today-item">
          <span className="t-time">{ev.allDay ? "全天" : fmtTime(ev.start)}</span>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
          <span className="t-title">{ev.title}</span>
          {ev.loc && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{ev.loc}</span>}
        </div>
      ))}
      {overdueTasks.slice(0, 5).map((t) => (
        <div key={t.id} className="today-item overdue">
          <span className="t-time">已过期</span>
          <span className="task-check" onClick={() => void toggle(t.id)} style={{ width: 16, height: 16 }} />
          <span className="t-title">{t.title}</span>
        </div>
      ))}
      {todayTasks.map((t) => (
        <div key={t.id} className="today-item">
          <span className="t-time">{t.dueTime ?? "今天"}</span>
          <span className="task-check" onClick={() => void toggle(t.id)} style={{ width: 16, height: 16 }} />
          <span className="t-title">{t.title}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------- 纪念日 ----------------
function AnniversariesPanel() {
  const anniversaries = useStore((s) => s.anniversaries);
  const create = useStore((s) => s.createAnniversary);
  const update = useStore((s) => s.updateAnniversary);
  const del = useStore((s) => s.deleteAnniversary);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [dragAnnivId, setDragAnnivId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "anniversary" as AnniversaryType, date: todayStr(), isLunar: false, remindDays: -1 });

  const today = new Date();
  const items = useMemo(() => {
    return anniversaries
      .map((a) => {
        const target = anniversaryDateInYear(a, today.getFullYear());
        const targetStr = fmtDate(target);
        const d = parseDate(targetStr);
        let days: number;
        if (a.type === "birthday") {
          if (d.getTime() < parseDate(todayStr()).getTime()) {
            const next = anniversaryDateInYear(a, today.getFullYear() + 1);
            days = diffDays(next, today);
          } else {
            days = diffDays(d, today);
          }
        } else {
          days = diffDays(d, today);
        }
        const isToday = days === 0;
        return { ...a, targetStr, days, isToday };
      })
      .sort((a, b) => a.days - b.days);
  }, [anniversaries, today]);

  const birthdaysToday = items.filter((i) => i.type === "birthday" && i.isToday);

  const openNew = () => { setEditId(null); setForm({ name: "", type: "anniversary", date: todayStr(), isLunar: false, remindDays: -1 }); setModalOpen(true); };
  const openEdit = (a: Anniversary) => { setEditId(a.id); setForm({ name: a.name, type: a.type, date: a.date, isLunar: a.isLunar, remindDays: a.remindDays }); setModalOpen(true); };
  const save = () => {
    if (!form.name.trim()) return;
    if (editId) void update(editId, { ...form, name: form.name.trim() });
    else void create({ ...form, name: form.name.trim() });
    setModalOpen(false);
  };

  const typeIcon: Record<AnniversaryType, string> = { countdown: "⏳", anniversary: "🎈", birthday: "🎂" };
  const typeName: Record<AnniversaryType, string> = { countdown: "倒计时", anniversary: "纪念日", birthday: "生日" };

  return (
    <div className="card card-pad">
      <div className="card-title">
        🎉 纪念日与倒计时
        <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={openNew}>＋ 添加</button>
      </div>

      {birthdaysToday.map((b) => (
        <div key={b.id} className="birthday-card" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 30 }}>🎂</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{b.name} 生日快乐！</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>愿你今天被幸福包围 ✨</div>
          </div>
        </div>
      ))}

      {!items.length && <div className="empty" style={{ padding: 16 }}>添加纪念日、倒计时或生日</div>}
      {items.map((a, idx) => (
        <div
          key={a.id}
          className="anniv-item" style={dragAnnivId === a.id ? { opacity: 0.4 } : undefined}
          onClick={() => openEdit(a)}
          title={a.date + (a.isLunar ? "（农历）" : "") + "（拖拽可排序）"}
          draggable
          onDragStart={(e) => { setDragAnnivId(a.id); e.dataTransfer.setData("text/plain", a.id); }}
          onDragEnd={() => setDragAnnivId(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const fromId = e.dataTransfer.getData("text/plain") || dragAnnivId;
            if (!fromId || fromId === a.id) return;
            const list = [...items];
            const from = list.findIndex((x) => x.id === fromId);
            const to = list.findIndex((x) => x.id === a.id);
            if (from < 0 || to < 0) return;
            list.splice(to, 0, list.splice(from, 1)[0]);
            list.forEach((x, i) => void update(x.id, { order: i }));
            setDragAnnivId(null);
            void idx;
          }}
        >
          <span className="a-ico">{typeIcon[a.type]}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5 }}>{a.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{typeName[a.type]} · {a.date}</div>
          </div>
          {a.isToday ? (
            <span className="a-days" style={{ color: "#e64980" }}>就是今天</span>
          ) : (
            <span className="a-days">{a.days >= 0 ? "还有 " + a.days + " 天" : "已过 " + Math.abs(a.days) + " 天"}</span>
          )}
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); if (window.confirm("删除「" + a.name + "」？")) void del(a.id); }}>🗑️</button>
        </div>
      ))}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "编辑纪念日" : "添加纪念日"} footer={
        <>
          <button className="btn" onClick={() => setModalOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </>
      }>
        <Field label="名称">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：认识纪念日 / 考试倒计时 / 妈妈生日" />
        </Field>
        <Field label="类型">
          <Seg<AnniversaryType>
            value={form.type}
            onChange={(t) => setForm({ ...form, type: t })}
            options={[
              { value: "countdown", label: "⏳ 倒计时" },
              { value: "anniversary", label: "🎈 纪念日" },
              { value: "birthday", label: "🎂 生日" },
            ]}
          />
        </Field>
        <div className="field-row">
          <Field label={form.type === "birthday" ? "生日日期" : "事件日期"}>
            <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          {form.type === "birthday" && (
            <Field label="农历生日">
              <label className="checkbox" style={{ marginTop: 22 }}>
                <input type="checkbox" checked={form.isLunar} onChange={(e) => setForm({ ...form, isLunar: e.target.checked })} />
                使用农历
              </label>
            </Field>
          )}
        </div>
        <Field label="提前提醒">
          <Seg<number>
            value={form.remindDays}
            onChange={(v) => setForm({ ...form, remindDays: v })}
            options={[
              { value: -1, label: "不提醒" },
              { value: 0, label: "当天" },
              { value: 1, label: "1 天前" },
              { value: 3, label: "3 天前" },
              { value: 7, label: "7 天前" },
            ]}
          />
        </Field>
      </Modal>
    </div>
  );
}

// ---------------- 本周统计 ----------------
function WeeklyStats() {
  const tasks = useStore((s) => s.tasks);
  const events = useStore((s) => s.events);
  const settings = useStore((s) => s.settings);
  const focusSessions = useStore((s) => s.focusSessions);
  const diaries = useStore((s) => s.diaries);

  const stats = useMemo(() => {
    const ws = startOfWeek(new Date(), settings.calendar.weekStart as 0 | 1);
    const we = addDays(ws, 7);
    const weekTasks = tasks.filter((t) => t.dueDate && parseDate(t.dueDate) >= ws && parseDate(t.dueDate) < we);
    const done = weekTasks.filter((t) => t.completed).length;
    const total = weekTasks.length;
    const overdue = tasks.filter((t) => !t.completed && t.dueDate && parseDate(t.dueDate) < parseDate(todayStr())).length;
    const weekEvents = events.filter((e) => parseDate(e.start) >= ws && parseDate(e.start) < we).length;
    const focusSec = focusSessions.filter((s) => s.status === "completed" && s.startedAt >= ws.getTime() && s.startedAt < we.getTime()).reduce((a, s) => a + (s.actualSeconds ?? 0), 0);
    // 连续写日记天数
    let diaryStreak = 0;
    let d = new Date();
    if (diaries.some((x) => x.date === fmtDate(d))) diaryStreak++;
    else d = addDays(d, -1);
    while (diaries.some((x) => x.date === fmtDate(d))) { diaryStreak++; d = addDays(d, -1); }
    // 连续完成天数
    let taskStreak = 0;
    let td = new Date();
    if (tasks.some((t) => t.completedAt && fmtDate(new Date(t.completedAt)) === fmtDate(td))) taskStreak++;
    else td = addDays(td, -1);
    while (tasks.some((t) => t.completedAt && fmtDate(new Date(t.completedAt)) === fmtDate(td))) { taskStreak++; td = addDays(td, -1); }
    return { done, total, overdue, weekEvents, focusSec, diaryStreak, taskStreak };
  }, [tasks, events, focusSessions, diaries, settings.calendar.weekStart]);

  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="card card-pad">
      <div className="card-title">📊 本周统计</div>
      <div className="stat-line"><span className="s-lbl">任务完成</span><span className="s-val">{stats.done}/{stats.total}</span></div>
      <div className="progress" style={{ marginBottom: 10 }}><div style={{ width: pct + "%" }} /></div>
      <div className="stat-line"><span className="s-lbl">本周日程</span><span className="s-val">{stats.weekEvents} 个</span></div>
      <div className="stat-line"><span className="s-lbl">过期任务</span><span className="s-val" style={{ color: stats.overdue ? "var(--danger)" : "var(--success)" }}>{stats.overdue ? "⚠️ " + stats.overdue + " 个" : "无 🎉"}</span></div>
      <div className="stat-line"><span className="s-lbl">本周专注</span><span className="s-val">{Math.round(stats.focusSec / 60)} 分钟</span></div>
      <div className="stat-line"><span className="s-lbl">连续完成</span><span className="s-val">🔥 {stats.taskStreak} 天</span></div>
      <div className="stat-line"><span className="s-lbl">连续写日记</span><span className="s-val">📝 {stats.diaryStreak} 天</span></div>
    </div>
  );
}

// ---------------- 当天汇总 ----------------
function DaySummary(props: { date: string }) {
  const diaries = useStore((s) => s.diaries);
  const tasks = useStore((s) => s.tasks);
  const ui = useUiStore();
  const diary = diaries.find((d) => d.date === props.date);
  const dayTasks = tasks.filter((t) => t.dueDate === props.date);

  return (
    <div className="card card-pad">
      <div className="card-title">🗓️ {props.date} 当天汇总</div>
      {diary ? (
        <div className="diary-entry" style={{ marginBottom: 8 }} onClick={() => navigate({ name: "diary", date: props.date })}>
          <div className="d-date">{diary.title || props.date}</div>
          <div className="d-preview">点击查看当天日记</div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 8 }}>
          这天还没有日记 <button className="btn btn-sm" onClick={() => navigate({ name: "diary", date: props.date })}>去写</button>
        </div>
      )}
      {dayTasks.length > 0 && (
        <div style={{ fontSize: 12.5 }}>
          <b>任务：</b>
          {dayTasks.map((t) => (
            <span key={t.id} className="chip" style={{ marginRight: 6, cursor: "pointer" }} onClick={() => ui.openTaskDetail(t.id)}>
              {t.completed ? "✅" : "☑️"} {t.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
