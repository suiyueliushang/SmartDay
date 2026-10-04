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
import { PUSH_PRESETS, testPush, PushResult } from "@/lib/push";
import { PushPreset } from "@/types";

/** 通道图标（用于通道卡片） */
const PUSH_ICONS: Record<PushPreset, string> = {
  onebot: "🐧",
  qqbot: "🤖",
  wecom: "🏢",
  dingtalk: "📌",
  feishu: "🕊️",
  serverchan: "📨",
  pushplus: "📲",
  custom: "🔗",
};

// 说明：按需求已移除全部快捷键，因此不再有「快捷键」设置分组
type TabKey = "general" | "calendar" | "task" | "diary" | "reminder" | "focus" | "data" | "sync" | "push";

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "general", label: "通用", icon: "⚙️" },
  { key: "calendar", label: "日历", icon: "📅" },
  { key: "task", label: "任务", icon: "✅" },
  { key: "diary", label: "笔记", icon: "📝" },
  { key: "reminder", label: "提醒", icon: "🔔" },
  { key: "focus", label: "专注", icon: "🎯" },
  { key: "data", label: "数据管理", icon: "💾" },
  { key: "sync", label: "同步", icon: "☁️" },
  { key: "push", label: "推送", icon: "📲" },
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
          {tab === "push" && <PushTab />}
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
      <Row label="时长设置" desc="专注时长 / 短休 / 长休 / 长休间隔 已移到「专注助手」页面顶部">
        <button className="btn btn-sm" onClick={() => { location.hash = "#/focus"; }}>前往专注助手 →</button>
      </Row>
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
// ---------------- 外部推送（QQ 机器人等） ----------------
function PushTab() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const showToast = useUiStore((s) => s.showToast);
  const cfg = settings.push;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);
  const set = (patch: Partial<Settings["push"]>) => void update((s) => ({ ...s, push: { ...s.push, ...patch } }));
  const preset = PUSH_PRESETS.find((p) => p.value === cfg.preset);

  const runTest = async () => {
    setBusy(true);
    const r = await testPush(cfg);
    setResult(r);
    setBusy(false);
    showToast(r.ok ? "测试消息已发出，请查看 QQ/微信" : r.message, r.ok ? "success" : "error");
  };

  return (
    <div className="push-tab">
      {/* 状态总览 */}
      <div className={"push-status-card" + (cfg.enabled ? " on" : "")}>
        <span className="ps-ico">{cfg.enabled ? "🔔" : "🔕"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ps-title">外部推送{cfg.enabled ? "已开启" : "未开启"}</div>
          <div className="ps-desc">
            开启后，提醒触发时（除浏览器通知外）会通过下面的通道再发一条消息给我
          </div>
        </div>
        <Switch checked={cfg.enabled} onChange={(v) => set({ enabled: v })} />
      </div>

      {/* 通道选择：卡片网格 */}
      <div className="card card-pad">
        <div className="card-title">选择通道</div>
        <div className="push-tiles">
          {PUSH_PRESETS.map((p) => (
            <button
              key={p.value}
              className={"push-tile" + (cfg.preset === p.value ? " on" : "")}
              onClick={() => set({ preset: p.value })}
              title={p.hint}
            >
              <span className="pt-ico">{PUSH_ICONS[p.value]}</span>
              <span className="pt-name">{p.label}</span>
            </button>
          ))}
        </div>
        {preset && <div className="push-hint">💡 {preset.hint}</div>}

        <div className="push-fields">
          {cfg.preset === "onebot" && (
            <>
              <PField label="OneBot 服务地址" desc="自建 QQ 机器人的 HTTP 地址（NapCat / Lagrange / go-cqhttp）">
                <input className="input" value={cfg.url} onChange={(e) => set({ url: e.target.value })} placeholder="http://127.0.0.1:3000" />
              </PField>
              <PField label="我的 QQ 号" desc="接收私聊消息的 QQ 号（需先把机器人加为好友）">
                <input className="input" value={cfg.qq} onChange={(e) => set({ qq: e.target.value })} placeholder="如 10001" />
              </PField>
              <PField label="发到群（可选）" desc="填了群号就发群消息，忽略上面的 QQ 号">
                <input className="input" value={cfg.group} onChange={(e) => set({ group: e.target.value })} placeholder="群号，可留空" />
              </PField>
              <PField label="access_token（可选）" desc="OneBot 里设置过 token 才需要填">
                <input className="input" type="password" value={cfg.token} onChange={(e) => set({ token: e.target.value })} placeholder="可留空" />
              </PField>
            </>
          )}
          {cfg.preset === "qqbot" && (
            <>
              <PField label="AppID" desc="QQ 开放平台 → 机器人 → 开发设置 → AppID 接入凭证">
                <input className="input" value={cfg.appId} onChange={(e) => set({ appId: e.target.value })} placeholder="如 1905726028" />
              </PField>
              <PField label="AppSecret" desc="同一页面复制；AppSecret 只在创建时完整显示，泄露请到平台重置">
                <input className="input" type="password" value={cfg.appSecret} onChange={(e) => set({ appSecret: e.target.value })} />
              </PField>
              <PField label="接收目标" desc="单聊：填你的用户 openid；群：填群的 group_openid">
                <select className="select" value={cfg.targetType} onChange={(e) => set({ targetType: e.target.value as "user" | "group" })}>
                  <option value="user">单聊（user openid）</option>
                  <option value="group">群（group_openid）</option>
                </select>
              </PField>
              <PField label="目标 openid" desc="openid 来自与该机器人的真实互动（给机器人发过消息 / 群里 @ 过它）。一键获取：node scripts/qqbot-openid.mjs <AppID> <AppSecret>">
                <input className="input" value={cfg.targetOpenid} onChange={(e) => set({ targetOpenid: e.target.value })} placeholder="openid 或 group_openid" />
              </PField>
            </>
          )}
          {(cfg.preset === "wecom" || cfg.preset === "dingtalk" || cfg.preset === "feishu") && (
            <PField label="Webhook 地址" desc="群机器人 Webhook，粘贴完整地址即可" wide>
              <input className="input" value={cfg.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://..." />
            </PField>
          )}
          {cfg.preset === "serverchan" && (
            <PField label="SendKey" desc="Server 酱 → 发送消息 → 复制 SendKey（SCT 开头）" wide>
              <input className="input" type="password" value={cfg.token} onChange={(e) => set({ token: e.target.value })} />
            </PField>
          )}
          {cfg.preset === "pushplus" && (
            <PField label="PushPlus token" desc="pushplus.plus 登录后复制 token" wide>
              <input className="input" type="password" value={cfg.token} onChange={(e) => set({ token: e.target.value })} />
            </PField>
          )}
          {cfg.preset === "custom" && (
            <>
              <PField label="Webhook 地址" wide>
                <input className="input" value={cfg.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://your-endpoint" />
              </PField>
              <PField label="请求体模板" desc="占位符 {title} 与 {body} 会被替换" wide>
                <input className="input" value={cfg.bodyTemplate} onChange={(e) => set({ bodyTemplate: e.target.value })} />
              </PField>
              <PField label="Bearer Token（可选）" desc="会作为 Authorization 头带上">
                <input className="input" type="password" value={cfg.token} onChange={(e) => set({ token: e.target.value })} />
              </PField>
            </>
          )}
        </div>

        <div className="setting-row" style={{ marginTop: 4 }}>
          <div>
            <div className="s-label">免打扰时段也推送</div>
            <div className="s-desc">关闭时，设置的免打扰时段内不推送（默认关闭）</div>
          </div>
          <div className="s-ctrl">
            <Switch checked={cfg.ignoreQuiet} onChange={(v) => set({ ignoreQuiet: v })} />
          </div>
        </div>

        <div className="push-test">
          <button className="btn btn-primary" disabled={busy} onClick={() => void runTest()}>
            {busy ? "发送中…" : "📤 发送测试消息"}
          </button>
          <span className="push-test-hint">保存配置后点一下，立即向目标发一条测试消息</span>
        </div>
        {result && (
          <div className={"push-result " + (result.ok ? "ok" : "fail")}>
            <b>{result.ok ? "✅ 发送成功" : "⚠️ 发送失败"}</b>
            {result.status ? "（HTTP " + result.status + "）" : ""}　{result.message}
            {result.via === "http" ? "　· 浏览器直连，如失败请改用桌面端" : result.via === "desktop" ? "　· 经桌面端主进程发送（无 CORS 限制）" : ""}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="card-title">使用说明</div>
        <ul className="push-tips">
          <li><b>发到我的 QQ（推荐）</b>：自建 OneBot 机器人（NapCat / Lagrange / go-cqhttp）→ 通道选「QQ 机器人」，填服务地址 + 我的 QQ 号即可私聊推送。</li>
          <li><b>不想折腾 QQ</b>：Server 酱 / PushPlus（微信收消息）、企业微信、钉钉、飞书群机器人，配置最简单也最稳定。</li>
          <li><b>官方 QQ 机器人</b>：需开放平台资质，且主动推送受平台限制，一般只能被动回复。</li>
          <li><b>跨域</b>：桌面端由主进程发请求（无 CORS 限制）；纯浏览器如遇跨域失败，请改用桌面端。</li>
          <li>详细步骤见项目根目录 <b>推送通知设置.md</b>。</li>
        </ul>
      </div>
    </div>
  );
}

/** 表单字段：标签在上、控件在下、说明在底（比 Row 更适合窄列与长说明） */
function PField(props: { label: string; desc?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={"push-field" + (props.wide ? " wide" : "")}>
      <span className="pf-label">{props.label}</span>
      {props.children}
      {props.desc && <span className="pf-desc">{props.desc}</span>}
    </label>
  );
}

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

// （原「快捷键」设置分组已按需求整体移除）
