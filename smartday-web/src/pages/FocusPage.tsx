// 专注助手页：计时 + 多维统计 + 历史记录
import React, { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { FocusTimer } from "@/components/focus/FocusTimer";
import { Seg, Empty } from "@/components/common";
import { FocusSession, FocusMode } from "@/types";
import { startOfDay, addDays, todayStr, fmtDate, fmtDuration, startOfWeek, parseDate } from "@/lib/date";
import { downloadText } from "@/lib/download";

type RangeKey = "today" | "week" | "month" | "custom";

export function FocusPage() {
  return (
    <div className="page page-wide">
      <div className="focus-layout">
        <FocusCard />
        <StatsArea />
      </div>
    </div>
  );
}

// ---------- 左侧：自由专注 ----------
function FocusCard() {
  const [mode, setMode] = useState<FocusMode>("pomodoro");
  const [minutes, setMinutes] = useState(25);
  const sessions = useStore((s) => s.focusSessions);
  const running = sessions.some((s) => s.status === "running");

  return (
    <div className="card focus-card">
      <h3 style={{ alignSelf: "flex-start", fontSize: 15 }}>开始专注</h3>
      <div className="focus-mode-seg">
        {([
          ["pomodoro", "🍅 番茄钟"],
          ["countdown", "⏱️ 倒计时"],
          ["stopwatch", "▶️ 正向"],
        ] as Array<[FocusMode, string]>).map(([v, l]) => (
          <button key={v} className={"chip" + (mode === v ? " on" : "")} onClick={() => setMode(v)}>{l}</button>
        ))}
      </div>
      {mode === "countdown" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input className="input" type="number" min={1} max={180} value={minutes} style={{ width: 90 }}
            onChange={(e) => setMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 25)))} />
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>分钟</span>
        </div>
      )}
      {running && (
        <div style={{ fontSize: 12.5, color: "var(--warning)", background: "var(--warning-soft)", padding: "6px 12px", borderRadius: 8 }}>
          ⚠️ 已有进行中的专注会话，请先结束它
        </div>
      )}
      <FocusTimer key={mode + minutes} mode={mode} plannedMinutes={minutes} target={null} onFinished={() => {}} />
    </div>
  );
}

// ---------- 右侧：统计 ----------
function StatsArea() {
  const sessions = useStore((s) => s.focusSessions);
  const tasks = useStore((s) => s.tasks);
  const lists = useStore((s) => s.lists);
  const [range, setRange] = useState<RangeKey>("today");
  const [customStart, setCustomStart] = useState(fmtDate(addDays(new Date(), -6)));
  const [customEnd, setCustomEnd] = useState(todayStr());

  const completed = useMemo(() => sessions.filter((s) => s.status === "completed"), [sessions]);

  const inRange = useMemo(() => {
    const start = range === "today" ? startOfDay(new Date()) : range === "week" ? startOfWeek(new Date(), 1) : range === "month" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : parseDate(customStart);
    const end = range === "custom" ? addDays(parseDate(customEnd), 1) : addDays(start, range === "today" ? 1 : range === "week" ? 7 : 31);
    return completed.filter((s) => s.startedAt >= start.getTime() && s.startedAt < end.getTime());
  }, [completed, range, customStart, customEnd]);

  const totalSec = inRange.reduce((a, s) => a + (s.actualSeconds ?? 0), 0);
  const avgMin = inRange.length ? totalSec / 60 / inRange.length : 0;
  const prevSec = useMemo(() => {
    const span = range === "today" ? 1 : range === "week" ? 7 : range === "month" ? 31 : Math.max(1, Math.round((parseDate(customEnd).getTime() - parseDate(customStart).getTime()) / 86400000) + 1);
    const start = range === "today" ? addDays(new Date(), -1) : range === "week" ? addDays(startOfWeek(new Date(), 1), -7) : range === "month" ? addDays(new Date(new Date().getFullYear(), new Date().getMonth(), 1), -31) : addDays(parseDate(customStart), -span);
    const end = addDays(start, span);
    return completed.filter((s) => s.startedAt >= start.getTime() && s.startedAt < end.getTime()).reduce((a, s) => a + (s.actualSeconds ?? 0), 0);
  }, [completed, range, customStart, customEnd]);
  const comparePct = prevSec > 0 ? Math.round(((totalSec - prevSec) / prevSec) * 100) : 0;

  const streak = useMemo(() => calcStreak(completed), [completed]);

  // 每日趋势（最近 14 天）
  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      m.set(fmtDate(d), 0);
    }
    for (const s of completed) {
      const ds = fmtDate(new Date(s.startedAt));
      if (m.has(ds)) m.set(ds, m.get(ds)! + (s.actualSeconds ?? 0));
    }
    return [...m.entries()].map(([d, v]) => ({ d, v }));
  }, [completed]);
  const maxDaily = Math.max(1, ...daily.map((x) => x.v));

  // 按清单（任务）/ 标签
  const byList = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of completed) {
      if (!s.targetId || s.targetType !== "task") continue;
      const t = tasks.find((x) => x.id === s.targetId);
      const name = t ? (lists.find((l) => l.id === t.listId)?.name ?? "未分类") : "已删除任务";
      m.set(name, (m.get(name) ?? 0) + (s.actualSeconds ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [completed, tasks, lists]);
  const maxList = Math.max(1, ...byList.map((x) => x[1]));

  // 热力图（12 周）
  const heat = useMemo(() => {
    const weeks: Array<{ date: string; seconds: number }[]> = [];
    const today = startOfWeek(new Date(), 1);
    for (let w = 11; w >= 0; w--) {
      const weekStart = addDays(today, -w * 7);
      const days: Array<{ date: string; seconds: number }> = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        const ds = fmtDate(d);
        const sec = completed.filter((s) => fmtDate(new Date(s.startedAt)) === ds).reduce((a, s) => a + (s.actualSeconds ?? 0), 0);
        days.push({ date: ds, seconds: sec });
      }
      weeks.push(days);
    }
    return weeks;
  }, [completed]);
  const maxHeat = Math.max(1, ...heat.flat().map((x) => x.seconds));
  const heatLevel = (sec: number) => {
    if (sec <= 0) return "";
    const ratio = sec / maxHeat;
    if (ratio < 0.25) return "l1";
    if (ratio < 0.5) return "l2";
    if (ratio < 0.75) return "l3";
    return "l4";
  };

  // 时段分布
  const hourly = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, i) => ({ hour: i, seconds: 0 }));
    for (const s of completed) {
      const h = new Date(s.startedAt).getHours();
      arr[h].seconds += s.actualSeconds ?? 0;
    }
    return arr;
  }, [completed]);
  const maxHour = Math.max(1, ...hourly.map((x) => x.seconds));
  const goldenHour = hourly.reduce((best, x) => (x.seconds > best.seconds ? x : best), hourly[0]);

  // Top 5
  const top = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of completed) {
      const name = s.targetTitle || "自由专注";
      m.set(name, (m.get(name) ?? 0) + (s.actualSeconds ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [completed]);
  const maxTop = Math.max(1, ...top.map((x) => x[1]));

  const history = useMemo(() => [...completed].sort((a, b) => b.startedAt - a.startedAt), [completed]);
  const [histFilter, setHistFilter] = useState("");
  const [histStatus, setHistStatus] = useState<"all" | "completed" | "abandoned">("all");
  const [histTarget, setHistTarget] = useState<"all" | "task" | "event" | "free">("all");

  const exportCSV = () => {
    const rows = [
      ["目标", "类型", "模式", "计划分钟", "实际时长(秒)", "暂停次数", "状态", "开始时间", "结束时间", "备注"],
      ...history.map((s) => [
        s.targetTitle ?? "自由专注", s.targetType ?? "", s.mode, String(s.plannedMinutes ?? 0), String(Math.round(s.actualSeconds ?? 0)),
        String(s.pauseCount ?? 0), s.status, new Date(s.startedAt).toLocaleString(), s.endedAt ? new Date(s.endedAt).toLocaleString() : "",
        s.note ?? "",
      ]),
    ];
    downloadText("smartday-focus-" + todayStr() + ".csv", "\uFEFF" + rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      {/* 范围选择 */}
      <div className="card card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Seg<RangeKey>
            value={range}
            onChange={setRange}
            options={[
              { value: "today", label: "今日" },
              { value: "week", label: "本周" },
              { value: "month", label: "本月" },
              { value: "custom", label: "自定义" },
            ]}
          />
          {range === "custom" && (
            <>
              <input className="input" type="date" style={{ width: 140 }} value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span style={{ color: "var(--text-muted)" }}>至</span>
              <input className="input" type="date" style={{ width: 140 }} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>完成率 {(inRange.length + 1) / (sessions.length + 1) > 0 ? Math.round((inRange.length / Math.max(1, inRange.length)) * 100) : 0}%</span>
        </div>

        <div className="stats-grid" style={{ marginTop: 14 }}>
          <StatCard num={fmtDuration(totalSec)} lbl="总专注时长" />
          <StatCard num={String(inRange.length)} lbl="完成次数" />
          <StatCard num={avgMin.toFixed(0) + " 分"} lbl="平均时长" />
          <StatCard num={streak + " 天"} lbl="连续专注" />
          <StatCard num={(comparePct >= 0 ? "↑" : "↓") + Math.abs(comparePct) + "%"} lbl="较上一周期" color={comparePct >= 0 ? "var(--success)" : "var(--danger)"} />
        </div>
      </div>

      {/* 每日趋势 */}
      <div className="card card-pad">
        <div className="card-title">📈 每日趋势（最近 14 天）</div>
        <div className="bar-row" style={{ marginTop: 8 }}>
          {daily.map((x) => (
            <div key={x.d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }} title={x.d + " " + fmtDuration(x.v)}>
              <div style={{ width: "80%", background: "var(--bg-active)", borderRadius: 4, height: 60, display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", background: "var(--accent)", borderRadius: 4, height: Math.max(2, (x.v / maxDaily) * 100) + "%" }} />
              </div>
              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{x.d.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 按清单 */}
        <div className="card card-pad">
          <div className="card-title">📂 时间花在哪（按清单）</div>
          {!byList.length && <div className="empty">暂无数据</div>}
          {byList.map(([name, sec]) => (
            <div key={name} className="bar-row">
              <span className="bar-name">{name}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: (sec / maxList) * 100 + "%" }} /></div>
              <span className="bar-val">{fmtDuration(sec)}</span>
            </div>
          ))}
        </div>

        {/* Top 5 */}
        <div className="card card-pad">
          <div className="card-title">🏆 专注 Top 5</div>
          {top.map(([name, sec], i) => (
            <div key={name} className="bar-row">
              <span style={{ width: 20, color: i < 3 ? "#f59f00" : "var(--text-muted)", fontWeight: 700 }}>{i + 1}</span>
              <span className="bar-name">{name}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: (sec / maxTop) * 100 + "%" }} /></div>
              <span className="bar-val">{fmtDuration(sec)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* 热力图 */}
        <div className="card card-pad">
          <div className="card-title">🔥 专注热力图（最近 12 周）</div>
          <div className="heat-grid">
            {heat.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {week.map((d) => (
                  <div key={d.date} className={"heat-cell " + heatLevel(d.seconds)} title={d.date + "：" + fmtDuration(d.seconds)} />
                ))}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
            少 <span className="heat-cell l1" style={{ width: 12, height: 12 }} /><span className="heat-cell l2" style={{ width: 12, height: 12 }} /><span className="heat-cell l3" style={{ width: 12, height: 12 }} /><span className="heat-cell l4" style={{ width: 12, height: 12 }} /> 多
          </div>
        </div>

        {/* 时段分布 */}
        <div className="card card-pad">
          <div className="card-title">🕐 时段分布{goldenHour.seconds > 0 && <span className="badge orange">黄金时段：{goldenHour.hour}:00-{goldenHour.hour + 1}:00</span>}</div>
          <div className="hour-bar">
            {hourly.map((x) => (
              <div key={x.hour} className="hour-col">
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                  <div className="hour-fill" style={{ height: Math.max(1, (x.seconds / maxHour) * 80) + "%", background: x.hour === goldenHour.hour && goldenHour.seconds > 0 ? "#f59f00" : "var(--accent)" }} title={x.hour + ":00 " + fmtDuration(x.seconds)} />
                </div>
                <span className="hour-label">{x.hour % 12 === 0 ? 12 : x.hour % 12}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 历史记录 */}
      <div className="card card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div className="card-title" style={{ margin: 0, flex: 1 }}>🗂️ 历史记录（{history.length}）</div>
          <select className="select" style={{ width: 100, padding: "5px 10px" }} value={histStatus} onChange={(e) => setHistStatus(e.target.value as typeof histStatus)}>
            <option value="all">全部状态</option>
            <option value="completed">已完成</option>
            <option value="abandoned">已放弃</option>
          </select>
          <select className="select" style={{ width: 110, padding: "5px 10px" }} value={histTarget} onChange={(e) => setHistTarget(e.target.value as typeof histTarget)}>
            <option value="all">全部目标</option>
            <option value="task">任务</option>
            <option value="event">事件</option>
            <option value="free">自由专注</option>
          </select>
          <input className="input" placeholder="筛选（目标/备注）" style={{ width: 170, padding: "5px 10px" }} value={histFilter} onChange={(e) => setHistFilter(e.target.value)} />
          <button className="btn btn-sm" onClick={exportCSV}>导出 CSV</button>
        </div>
        <HistoryTable sessions={history} filter={histFilter} status={histStatus} target={histTarget} />
      </div>
    </div>
  );
}

function StatCard(props: { num: string; lbl: string; color?: string }) {
  return (
    <div className="stat-card card" style={{ background: "var(--bg)" }}>
      <div className="num" style={{ color: props.color }}>{props.num}</div>
      <div className="lbl">{props.lbl}</div>
    </div>
  );
}

function calcStreak(sessions: FocusSession[]): number {
  const days = new Set(sessions.filter((s) => s.status === "completed").map((s) => fmtDate(new Date(s.startedAt))));
  let streak = 0;
  let d = new Date();
  if (!days.has(fmtDate(d))) d = addDays(d, -1);
  while (days.has(fmtDate(d))) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

function HistoryTable(props: {
  sessions: FocusSession[];
  filter: string;
  status: "all" | "completed" | "abandoned";
  target: "all" | "task" | "event" | "free";
}) {
  const updateSession = useStore((s) => s.updateFocusSession);
  const deleteSession = useStore((s) => s.deleteFocusSession);
  const [editId, setEditId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const filtered = props.sessions.filter((s) => {
    const q = props.filter.toLowerCase();
    if (q && !((s.targetTitle ?? "") + " " + (s.note ?? "")).toLowerCase().includes(q)) return false;
    if (props.status === "abandoned" && s.status !== "abandoned") return false;
    if (props.status === "completed" && s.status !== "completed") return false;
    if (props.target === "task" && s.targetType !== "task") return false;
    if (props.target === "event" && s.targetType !== "event") return false;
    if (props.target === "free" && s.targetType != null) return false;
    return true;
  });

  const MODE_ICON: Record<string, string> = { pomodoro: "🍅", countdown: "⏱️", stopwatch: "▶️", event: "📅" };

  return (
    <div style={{ maxHeight: 360, overflowY: "auto" }}>
      {!filtered.length && <div className="empty">暂无记录</div>}
      <table className="kbd-table">
        <thead>
          <tr><th>目标</th><th>模式</th><th>时长</th><th>开始时间</th><th>备注</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.slice(0, 200).map((s) => (
            <tr key={s.id}>
              <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {MODE_ICON[s.mode]} {s.targetTitle ?? "自由专注"}
              </td>
              <td>{{ pomodoro: "番茄钟", countdown: "倒计时", stopwatch: "正向", event: "事件" }[s.mode]}</td>
              <td>{fmtDuration(s.actualSeconds ?? 0)}</td>
              <td>{new Date(s.startedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
              <td>
                {editId === s.id ? (
                  <input className="input" autoFocus style={{ padding: "3px 8px", fontSize: 12 }} value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={() => { void updateSession(s.id, { note }); setEditId(null); }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                ) : (
                  <span style={{ cursor: "pointer", color: s.note ? "var(--text)" : "var(--text-muted)" }} onClick={() => { setEditId(s.id); setNote(s.note ?? ""); }}>
                    {s.note || "＋ 备注"}
                  </span>
                )}
              </td>
              <td><button className="icon-btn" onClick={() => void deleteSession(s.id)}>🗑️</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
