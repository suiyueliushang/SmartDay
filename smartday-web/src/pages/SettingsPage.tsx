// ============================================================
// 设置页：通用/日历/任务/日记/提醒/专注/数据管理/同步/快捷键
// ============================================================
import React, { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useRoute } from "@/lib/router";
import { Switch, Seg } from "@/components/common";
import { ThemeMode, CalendarView, WeekStart, TimeFormat, Priority, Settings, FocusSession } from "@/types";
import { applyTheme } from "@/app/bootstrap";
import { repos } from "@/db/indexeddb";
import { exportFullBackup, validateBackup, exportICS, exportTasksCSV, exportDiariesMarkdown, exportNotesMarkdown, parseICS } from "@/lib/exportImport";
import { readFileAsText } from "@/lib/download";
import { syncNow, syncStatus } from "@/lib/syncClient";
import { todayStr } from "@/lib/date";
import { downloadText } from "@/lib/download";
import { useUiStore } from "@/store/uiStore";

type TabKey = "general" | "calendar" | "task" | "diary" | "reminder" | "focus" | "data" | "sync" | "shortcuts";

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "general", label: "通用", icon: "⚙️" },
  { key: "calendar", label: "日历", icon: "📅" },
  { key: "task", label: "任务", icon: "✅" },
  { key: "diary", label: "日记", icon: "📝" },
  { key: "reminder", label: "提醒", icon: "🔔" },
  { key: "focus", label: "专注", icon: "🎯" },
  { key: "data", label: "数据管理", icon: "💾" },
  { key: "sync", label: "同步", icon: "☁️" },
  { key: "shortcuts", label: "快捷键", icon: "⌨️" },
];

export function SettingsPage() {
  const route = useRoute();
  const [tab, setTab] = useState<TabKey>((route.tab as TabKey) || "general");
  return (
    <div className="page page-wide">
      <div className="settings-layout">
        <div className="settings-nav">
          {TABS.map((t) => (
            <div key={t.key} className={"settings-item" + (tab === t.key ? " active" : "")} onClick={() => { setTab(t.key); location.hash = "#/settings/tab:" + t.key; }}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
        <div style={{ minWidth: 0 }}>
          {tab === "general" && <GeneralTab />}
          {tab === "calendar" && <CalendarTab />}
          {tab === "task" && <TaskTab />}
          {tab === "diary" && <DiaryTab />}
          {tab === "reminder" && <ReminderTab />}
          {tab === "focus" && <FocusTab />}
          {tab === "data" && <DataTab />}
          {tab === "sync" && <SyncTab />}
          {tab === "shortcuts" && <ShortcutsTab />}
        </div>
      </div>
    </div>
  );
}

function Row(props: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div>
        <div className="s-label">{props.label}</div>
        {props.desc && <div className="s-desc">{props.desc}</div>}
      </div>
      <div className="s-ctrl">{props.children}</div>
    </div>
  );
}

// ---------------- 通用 ----------------
function GeneralTab() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const set = (patch: Partial<Settings>) => void update(patch);
  return (
    <Card title="通用设置">
      <Row label="主题" desc="亮色 / 暗色 / 跟随系统">
        <Seg<ThemeMode>
          value={settings.general.theme}
          onChange={(t) => { set({ general: { ...settings.general, theme: t } }); applyTheme(t); }}
          options={[
            { value: "light", label: "☀️ 亮色" },
            { value: "dark", label: "🌙 暗色" },
            { value: "system", label: "跟随系统" },
          ]}
        />
      </Row>
      <Row label="语言">
        <select className="select" style={{ width: 160 }} value={settings.general.language} onChange={(e) => set({ general: { ...settings.general, language: e.target.value } })}>
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </Row>
      <Row label="日期格式">
        <select className="select" style={{ width: 160 }} value={settings.general.dateFormat} onChange={(e) => set({ general: { ...settings.general, dateFormat: e.target.value } })}>
          <option value="yyyy-MM-dd">2025-08-19</option>
          <option value="yyyy年MM月dd日">2025年08月19日</option>
          <option value="MM/dd/yyyy">08/19/2025</option>
        </select>
      </Row>
      <Row label="时间制">
        <Seg<TimeFormat>
          value={settings.general.timeFormat}
          onChange={(t) => set({ general: { ...settings.general, timeFormat: t } })}
          options={[{ value: 24, label: "24 小时" }, { value: 12, label: "12 小时" }]}
        />
      </Row>
      <Row label="时区">
        <select className="select" style={{ width: 180 }} value={settings.general.timezone} onChange={(e) => set({ general: { ...settings.general, timezone: e.target.value } })}>
          <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
          <option value="UTC">UTC</option>
        </select>
      </Row>
    </Card>
  );
}

// ---------------- 日历 ----------------
function CalendarTab() {
  const settings = useStore((s) => s.settings);
  const set = (patch: Partial<Settings["calendar"]>) => void useStore.getState().updateSettings((s) => ({ ...s, calendar: { ...s.calendar, ...patch } }));
  const c = settings.calendar;
  return (
    <Card title="日历设置">
      <Row label="默认视图">
        <Seg<CalendarView>
          value={c.defaultView}
          onChange={(v) => set({ defaultView: v })}
          options={[
            { value: "month", label: "月" }, { value: "week", label: "周" }, { value: "day", label: "日" },
            { value: "year", label: "年" }, { value: "agenda", label: "议程" },
          ]}
        />
      </Row>
      <Row label="每周起始日">
        <Seg<WeekStart>
          value={c.weekStart}
          onChange={(v) => set({ weekStart: v })}
          options={[{ value: 1, label: "周一" }, { value: 0, label: "周日" }]}
        />
      </Row>
      <Row label="显示农历"><Switch checked={c.showLunar} onChange={(v) => set({ showLunar: v })} /></Row>
      <Row label="显示节假日" desc="农历节日 / 公历节日 / 节气"><Switch checked={c.showFestivals} onChange={(v) => set({ showFestivals: v })} /></Row>
      <Row label="显示周数"><Switch checked={c.showWeekNumbers} onChange={(v) => set({ showWeekNumbers: v })} /></Row>
      <Row label="任务显示在日历中" desc="有截止日期的任务自动显示（颜色跟随优先级）">
        <Switch checked={c.showTasksInCalendar} onChange={(v) => set({ showTasksInCalendar: v })} />
      </Row>
      <Row label="工作日" desc="周视图非工作日灰底">
        <div style={{ display: "flex", gap: 5 }}>
          {["日", "一", "二", "三", "四", "五", "六"].map((w, i) => (
            <button
              key={i} className={"chip" + (c.workdays.includes(i) ? " on" : "")}
              onClick={() => set({ workdays: c.workdays.includes(i) ? c.workdays.filter((x) => x !== i) : [...c.workdays, i].sort() })}
            >{w}</button>
          ))}
        </div>
      </Row>
      <Row label="工作时段">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input className="input" type="time" style={{ width: 100 }} value={String(c.workHours[0]).padStart(2, "0") + ":00"} onChange={(e) => set({ workHours: [Number(e.target.value.slice(0, 2)), c.workHours[1]] })} />
          <span style={{ color: "var(--text-muted)" }}>至</span>
          <input className="input" type="time" style={{ width: 100 }} value={String(c.workHours[1]).padStart(2, "0") + ":00"} onChange={(e) => set({ workHours: [c.workHours[0], Number(e.target.value.slice(0, 2))] })} />
        </div>
      </Row>
      <Row label="默认事件时长">
        <input className="input" type="number" min={5} max={480} style={{ width: 100 }} value={c.defaultEventDuration}
          onChange={(e) => set({ defaultEventDuration: Math.max(5, Number(e.target.value) || 60) })} />
      </Row>
      <Row label="默认提醒">
        <div style={{ display: "flex", gap: 5 }}>
          {[15, 60, 1440].map((m) => (
            <button
              key={m} className={"chip" + (c.defaultReminders.includes(m) ? " on" : "")}
              onClick={() => set({ defaultReminders: c.defaultReminders.includes(m) ? c.defaultReminders.filter((x) => x !== m) : [...c.defaultReminders, m].sort((a, b) => a - b) })}
            >{m < 60 ? m + "分钟" : m < 1440 ? m / 60 + "小时" : m / 1440 + "天"}</button>
          ))}
        </div>
      </Row>
    </Card>
  );
}

// ---------------- 任务 ----------------
function TaskTab() {
  const settings = useStore((s) => s.settings);
  const set = (patch: Partial<Settings["task"]>) => void useStore.getState().updateSettings((s) => ({ ...s, task: { ...s.task, ...patch } }));
  const t = settings.task;
  const noteTags = useStore((s) => s.settings.diary.noteTags);
  void noteTags;
  return (
    <Card title="任务设置">
      <Row label="新任务默认优先级">
        <Seg<Priority>
          value={t.newTaskPriority}
          onChange={(v) => set({ newTaskPriority: v })}
          options={[
            { value: "high", label: "🔴 最高" }, { value: "medium", label: "🟠 高" },
            { value: "low", label: "🔵 中" }, { value: "none", label: "⚪ 低" },
          ]}
        />
      </Row>
      <Row label="新任务位置">
        <Seg<"top" | "bottom">
          value={t.newTaskPosition}
          onChange={(v) => set({ newTaskPosition: v })}
          options={[{ value: "top", label: "顶部" }, { value: "bottom", label: "底部" }]}
        />
      </Row>
      <Row label="完成音效"><Switch checked={t.completionSound} onChange={(v) => set({ completionSound: v })} /></Row>
      <Row label="完成动画"><Switch checked={t.completionAnimation} onChange={(v) => set({ completionAnimation: v })} /></Row>
      <Row label="过期任务提醒" desc="每天早上 9:00 提醒一次"><Switch checked={t.overdueReminder} onChange={(v) => set({ overdueReminder: v })} /></Row>
      <Row label="重复任务自动续期" desc="完成后按规则自动生成下一个"><Switch checked={t.autoRenewRepeatTasks} onChange={(v) => set({ autoRenewRepeatTasks: v })} /></Row>
    </Card>
  );
}

// ---------------- 日记 ----------------
function DiaryTab() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const set = (patch: Partial<Settings["diary"]>) => void update((s) => ({ ...s, diary: { ...s.diary, ...patch } }));
  const d = settings.diary;
  return (
    <Card title="日记设置">
      <Row label="编辑器默认模式">
        <Seg<"edit" | "split" | "preview">
          value={d.editorMode}
          onChange={(v) => set({ editorMode: v })}
          options={[{ value: "edit", label: "仅编辑" }, { value: "split", label: "左右分屏" }, { value: "preview", label: "仅预览" }]}
        />
      </Row>
      <Row label="自动保存间隔">
        <input className="input" type="number" min={200} max={5000} step={100} style={{ width: 110 }} value={d.autoSaveIntervalMs}
          onChange={(e) => set({ autoSaveIntervalMs: Math.max(200, Number(e.target.value) || 800) })} />
      </Row>
      <Row label="心情记录" desc="日记页显示心情选择，时间线中展示"><Switch checked={d.showMood} onChange={(v) => set({ showMood: v })} /></Row>
      <Row label="标题格式" desc="支持 M 月 / d 日 / dddd 星期">
        <input className="input" style={{ width: 200 }} value={d.titleFormat}
          onChange={(e) => set({ titleFormat: e.target.value })} />
      </Row>
      <Row label="笔记标签管理">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 320 }}>
          {d.noteTags.map((t) => (
            <span key={t} className="tag-chip" onClick={() => set({ noteTags: d.noteTags.filter((x) => x !== t) })}>#{t} ✕</span>
          ))}
          <TagAdd onAdd={(t) => set({ noteTags: [...new Set([...d.noteTags, t])] })} />
        </div>
      </Row>
    </Card>
  );
}

function TagAdd(props: { onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  return (
    <input
      className="input" style={{ width: 110, padding: "4px 9px", fontSize: 12 }} placeholder="+ 标签"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { props.onAdd(v.trim()); setV(""); } }}
    />
  );
}

// ---------------- 提醒 ----------------
function ReminderTab() {
  const settings = useStore((s) => s.settings);
  const set = (patch: Partial<Settings["reminder"]>) => void useStore.getState().updateSettings((s) => ({ ...s, reminder: { ...s.reminder, ...patch } }));
  const r = settings.reminder;
  return (
    <Card title="提醒设置">
      <Row label="启用通知"><Switch checked={r.enableNotifications} onChange={(v) => {
        set({ enableNotifications: v });
        if (v && "Notification" in window && Notification.permission === "default") {
          void Notification.requestPermission();
        }
      }} /></Row>
      <Row label="提示音"><Switch checked={r.sound} onChange={(v) => set({ sound: v })} /></Row>
      <Row label="全天事件默认提醒">
        <select className="select" style={{ width: 150 }} value={r.allDayDefaultRemind} onChange={(e) => set({ allDayDefaultRemind: Number(e.target.value) })}>
          <option value={0}>不提醒</option>
          <option value={9 * 60}>当天 9:00</option>
          <option value={8 * 60}>当天 8:00</option>
          <option value={18 * 60}>前一天 18:00</option>
        </select>
      </Row>
      <Row label="免打扰时段" desc="此期间不弹通知（记录到通知中心）">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input className="input" type="time" style={{ width: 100 }} value={r.quietStart} onChange={(e) => set({ quietStart: e.target.value })} />
          <span style={{ color: "var(--text-muted)" }}>至</span>
          <input className="input" type="time" style={{ width: 100 }} value={r.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} />
        </div>
      </Row>
      <Row label="通知保留">
        <select className="select" style={{ width: 150 }} value={r.retentionDays} onChange={(e) => set({ retentionDays: Number(e.target.value) })}>
          <option value={7}>7 天</option>
          <option value={15}>15 天</option>
          <option value={30}>30 天</option>
          <option value={-1}>永久保留</option>
        </select>
      </Row>
    </Card>
  );
}

// ---------------- 专注 ----------------
function FocusTab() {
  const settings = useStore((s) => s.settings);
  const set = (patch: Partial<Settings["focus"]>) => void useStore.getState().updateSettings((s) => ({ ...s, focus: { ...s.focus, ...patch } }));
  const f = settings.focus;
  return (
    <Card title="专注设置">
      <Row label="专注时长"><input className="input" type="number" min={1} max={180} style={{ width: 100 }} value={f.pomodoroMinutes}
        onChange={(e) => set({ pomodoroMinutes: Math.max(1, Number(e.target.value) || 25) })} /></Row>
      <Row label="短休息时长"><input className="input" type="number" min={1} max={60} style={{ width: 100 }} value={f.shortBreakMinutes}
        onChange={(e) => set({ shortBreakMinutes: Math.max(1, Number(e.target.value) || 5) })} /></Row>
      <Row label="长休息时长"><input className="input" type="number" min={1} max={120} style={{ width: 100 }} value={f.longBreakMinutes}
        onChange={(e) => set({ longBreakMinutes: Math.max(1, Number(e.target.value) || 15) })} /></Row>
      <Row label="长休息间隔" desc="每 N 个番茄后长休息"><input className="input" type="number" min={1} max={12} style={{ width: 100 }} value={f.longBreakInterval}
        onChange={(e) => set({ longBreakInterval: Math.max(1, Number(e.target.value) || 4) })} /></Row>
      <Row label="专注时自动勿扰"><Switch checked={f.autoDnd} onChange={(v) => set({ autoDnd: v })} /></Row>
      <Row label="完成音效"><Switch checked={f.completionSound} onChange={(v) => set({ completionSound: v })} /></Row>
      <Row label="放弃计入统计"><Switch checked={f.countAbandoned} onChange={(v) => set({ countAbandoned: v })} /></Row>
    </Card>
  );
}

// ---------------- 数据管理 ----------------
function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="card-title">{props.title}</div>
      {props.children}
    </div>
  );
}

function DataTab() {
  const s = useStore();
  const showToast = useUiStore((s) => s.showToast);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");

  const counts = useMemo(() => ({
    事件: s.events.length,
    任务: s.tasks.length,
    清单: s.lists.length,
    日记: s.diaries.length,
    笔记: s.notes.length,
    纪念日: s.anniversaries.length,
    专注记录: s.focusSessions.length,
    通知: s.notifications.length,
  }), [s.events, s.tasks, s.lists, s.diaries, s.notes, s.anniversaries, s.focusSessions, s.notifications]);

  const totalSize = useMemo(() => {
    try {
      return new Blob([JSON.stringify(s)]).size;
    } catch {
      return 0;
    }
  }, [s]);

  const doImport = async () => {
    if (!importFile) return;
    const text = await readFileAsText(importFile);
    if (importFile.name.endsWith(".ics")) {
      const events = parseICS(text, s.categories.find((c) => c.isDefault)?.id ?? "");
      if (importMode === "replace") {
        for (const e of s.events) await repos.events.delete(e.id);
      }
      await repos.events.bulkPut(events as never[]);
      useStore.setState({ events: importMode === "replace" ? events : [...s.events, ...events] });
      showToast("已导入 " + events.length + " 个事件", "success");
    } else {
      let data: unknown;
      try { data = JSON.parse(text); } catch { showToast("JSON 解析失败", "error"); return; }
      if (!validateBackup(data)) { showToast("不是有效的 SmartDay 备份文件", "error"); return; }
      if (confirmReplace || window.confirm("导入将覆盖当前全部数据，确定继续？")) {
        for (const k of Object.keys(repos)) await (repos[k as keyof typeof repos] as { clear: () => Promise<void> }).clear();
        await repos.events.bulkPut(data.events as never[]);
        await repos.tasks.bulkPut(data.tasks as never[]);
        await repos.lists.bulkPut(data.lists as never[]);
        await repos.groups.bulkPut(data.groups as never[]);
        await repos.categories.bulkPut(data.categories as never[]);
        await repos.diaries.bulkPut(data.diaries as never[]);
        await repos.notes.bulkPut(data.notes as never[]);
        await repos.anniversaries.bulkPut(data.anniversaries as never[]);
        await repos.focus.bulkPut(data.focus as never[]);
        if (data.settings) await repos.settings.put({ id: "settings", value: data.settings });
        useStore.setState({
          events: data.events, tasks: data.tasks, lists: data.lists, groups: data.groups,
          categories: data.categories, diaries: data.diaries, notes: data.notes,
          anniversaries: data.anniversaries, focusSessions: data.focus as FocusSession[],
          settings: data.settings ?? s.settings,
        });
        showToast("导入成功！", "success");
      }
    }
    setImportFile(null);
  };

  return (
    <Card title="数据管理">
      <div style={{ marginBottom: 18 }}>
        <div className="s-label" style={{ fontWeight: 650, marginBottom: 8 }}>导出</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => exportFullBackup({ categories: s.categories, events: s.events, lists: s.lists, groups: s.groups, tasks: s.tasks, diaries: s.diaries, notes: s.notes, anniversaries: s.anniversaries, focus: s.focusSessions, settings: s.settings })}>
            💾 全量备份 JSON
          </button>
          <button className="btn" onClick={() => exportICS(s.events)}>📅 日历 ICS</button>
          <button className="btn" onClick={() => exportTasksCSV(s.tasks, s.lists)}>✅ 任务 CSV</button>
          <button className="btn" onClick={() => exportDiariesMarkdown(s.diaries)}>📝 日记 Markdown</button>
          <button className="btn" onClick={() => exportNotesMarkdown(s.notes)}>📄 笔记 Markdown</button>
          <button className="btn" onClick={() => downloadText("smartday-tasks-" + todayStr() + ".json", JSON.stringify({ lists: s.lists, groups: s.groups, tasks: s.tasks }, null, 2), "application/json")}>
            ✅ 任务 JSON
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div className="s-label" style={{ fontWeight: 650, marginBottom: 8 }}>导入</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file" accept=".json,.ics" style={{ fontSize: 12.5 }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }}
          />
          {importFile && importFile.name.endsWith(".ics") && (
            <Seg<"merge" | "replace">
              value={importMode}
              onChange={setImportMode}
              options={[{ value: "merge", label: "合并到现有数据" }, { value: "replace", label: "替换现有事件" }]}
            />
          )}
          <button className="btn btn-primary" onClick={() => void doImport()} disabled={!importFile}>开始导入</button>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div className="s-label" style={{ fontWeight: 650, marginBottom: 8 }}>数据统计</div>
        <div className="data-stat-grid">
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} className="data-stat"><div className="n">{v}</div><div className="l">{k}</div></div>
          ))}
          <div className="data-stat"><div className="n">{(totalSize / 1024).toFixed(1)} KB</div><div className="l">数据总大小</div></div>
        </div>
      </div>

      <div>
        <div className="s-label" style={{ fontWeight: 650, marginBottom: 8 }}>维护</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-sm" onClick={() => { if (window.confirm("清除所有已完成任务？")) void s.clearCompletedTasks(); }}>清除已完成任务</button>
          <button className="btn btn-sm" onClick={() => void s.clearReadNotifications()}>清除已读通知</button>
          <button className="btn btn-sm btn-danger" onClick={() => setConfirmReset(true)}>重置所有数据</button>
        </div>
      </div>

      {confirmReset && (
        <div style={{ marginTop: 12, padding: 12, background: "var(--danger-soft)", borderRadius: 8, fontSize: 13 }}>
          ⚠️ 重置将删除本地全部数据（事件/任务/日记/专注记录等），且不可撤销！
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-danger btn-sm" onClick={() => { void s.resetAll(); setConfirmReset(false); }}>确认重置</button>
            <button className="btn btn-sm" onClick={() => setConfirmReset(false)}>取消</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------- 同步 ----------------
function SyncTab() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const syncDirty = useStore((s) => s.syncDirty);
  const [status, setStatus] = useState<{ ok: boolean; message: string; pushed: number; pulled: number; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const showToast = useUiStore((s) => s.showToast);
  const cfg = settings.sync;

  const set = (patch: Partial<Settings["sync"]>) => void update((s) => ({ ...s, sync: { ...s.sync, ...patch } }));

  const doSync = async () => {
    setBusy(true);
    const r = await syncNow();
    setStatus(r);
    setBusy(false);
    if (!r.ok && r.message !== "未开启云同步") showToast(r.message, "error");
  };

  return (
    <Card title="多端云同步">
      <Row label="开启云同步" desc="登录同一账号后三端自动同步；不开启完全不影响本地功能">
        <Switch checked={cfg.enabled} onChange={(v) => set({ enabled: v })} />
      </Row>
      <Row label="服务器地址">
        <input className="input" style={{ width: 260 }} placeholder="https://your-server.com" value={cfg.serverUrl}
          onChange={(e) => set({ serverUrl: e.target.value })} />
      </Row>
      <Row label="登录令牌">
        <input className="input" style={{ width: 260 }} type="password" placeholder="输入令牌" value={cfg.token}
          onChange={(e) => set({ token: e.target.value })} />
      </Row>
      <Row label="自动同步间隔">
        <select className="select" style={{ width: 160 }} value={cfg.autoSyncIntervalSec} onChange={(e) => set({ autoSyncIntervalSec: Number(e.target.value) })}>
          <option value={180}>3 分钟</option>
          <option value={900}>15 分钟</option>
          <option value={1800}>30 分钟</option>
          <option value={3600}>1 小时</option>
        </select>
      </Row>

      <div style={{ marginTop: 16, padding: 14, background: "var(--bg)", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <b>同步状态</b>
          <span className={"sync-dot" + (syncDirty ? " pending" : cfg.enabled ? "" : " off")} />
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            {!cfg.enabled ? "未开启" : syncDirty ? "有本地修改待上传" : "已同步"}
          </span>
          <button className="btn btn-sm btn-primary" style={{ marginLeft: "auto" }} onClick={() => void doSync()} disabled={busy || !cfg.enabled || !cfg.serverUrl}>
            {busy ? "同步中…" : "立即同步"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 3 }}>
          <span>上次同步：{cfg.lastSyncAt ? new Date(cfg.lastSyncAt).toLocaleString() : "从未"}</span>
          {status && <span>最近一次：{status.ok ? "✅ " + status.message + "（推送 " + status.pushed + "，拉取 " + status.pulled + "）" : "⚠️ " + status.message}</span>}
          <span>设备 ID：{syncStatus().deviceId}</span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.7 }}>
        💡 客户端同步引擎已实现（增量传输 + 后写优先 LWW + 离线重试）；服务端可自建（接口约定见《需求文档.md》5.10.5），官方云服务为规划项。
        未开启同步时，可用「数据管理 → 导出/导入 JSON」跨端迁移。
      </div>
    </Card>
  );
}

// ---------------- 快捷键 ----------------
const SHORTCUTS: Array<[string, string, string]> = [
  ["全局", "Ctrl/Cmd + K", "全局搜索"],
  ["全局", "Ctrl/Cmd + N", "新建任务"],
  ["全局", "Ctrl/Cmd + Shift + N", "新建日历事件"],
  ["全局", "Ctrl/Cmd + ,", "打开设置"],
  ["全局", "Ctrl/Cmd + Z / Shift+Z", "撤销 / 重做"],
  ["全局", "Ctrl/Cmd + B", "切换侧边栏"],
  ["日历", "T", "回到今天"],
  ["日历", "M / W / D / Y / A", "切换 月 / 周 / 日 / 年 / 议程视图"],
  ["日历", "← / →", "上一期 / 下一期"],
  ["任务", "Enter / Esc", "确认创建编辑 / 取消关闭"],
  ["任务", "Space / S", "切换完成 / 切换重要"],
  ["任务", "↑ / ↓", "选择上一个/下一个任务"],
  ["任务", "Tab", "编辑子步骤时缩进层级"],
  ["桌面端", "Ctrl+Alt+D", "切换穿透/编辑模式（双击托盘图标亦可）"],
];

function ShortcutsTab() {
  return (
    <Card title="快捷键速查">
      <table className="kbd-table">
        <thead><tr><th>分类</th><th>快捷键</th><th>功能</th></tr></thead>
        <tbody>
          {SHORTCUTS.map(([cat, key, desc]) => (
            <tr key={key + desc}>
              <td>{cat}</td>
              <td><kbd>{key}</kbd></td>
              <td>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
        规则：输入框内不触发快捷键（Ctrl 组合键除外）；快捷键冲突时提示。
      </div>
    </Card>
  );
}
