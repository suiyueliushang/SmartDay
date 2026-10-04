// ============================================================
// 专注助手（2026-10 重新设计）
//  ① 开始专注：模式 / 番茄钟时长 / 关联任务 → 点「开始专注」才计时
//  ② 进行中的专注：不论是本页、任务抽屉还是浮层启动的，都会在这里显示并可结束
//     （同一时刻只允许一个进行中的专注：store 与计时器双重约束）
//  ③ 年度热力图：GitHub 贡献图样式（53 周 × 7 天，5 档色阶，可切换年份，点击查看当天）
//  ④ 分析：按 年 / 周 / 天 三个维度查看（趋势、指标、排行）
//  ⑤ 记录：完整历史（含来自任务的专注），可筛选、加备注、导出 CSV
// ============================================================
import React, { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { FocusTimer, FocusTarget } from "@/components/focus/FocusTimer";
import { Seg, Empty } from "@/components/common";
import { FocusMode } from "@/types";
import { useNow } from "@/hooks/useNow";
import { fmtDate, fmtDuration, addDays, todayStr, parseDate, startOfWeek, startOfDay } from "@/lib/date";
import { downloadText } from "@/lib/download";

const WEEKDAY_MON = ["一", "二", "三", "四", "五", "六", "日"];
const MODE_ICON: Record<string, string> = { pomodoro: "🍅", countdown: "⏱️", stopwatch: "▶️", event: "📅" };
const MODE_NAME: Record<string, string> = { pomodoro: "番茄钟", countdown: "倒计时", stopwatch: "正向计时", event: "事件倒计时" };

export function FocusPage() {
  return (
    <div className="page page-wide">
      <div className="focus-page">
        <StartFocusCard />
        {/* 热力图已并入「专注分析」：年视图显示全年，月视图显示当月 */}
        <AnalysisCard />
        <HistoryCard />
      </div>
    </div>
  );
}

// ---------------- ① 开始专注 ----------------
function StartFocusCard() {
  const sessions = useStore((s) => s.focusSessions);
  const tasks = useStore((s) => s.tasks);
  const focus = useStore((s) => s.settings.focus);
  const updateSettings = useStore((s) => s.updateSettings);
  const openFocusPanel = useUiStore((s) => s.openFocusPanel);

  const [mode, setMode] = useState<FocusMode>("pomodoro");
  const [taskId, setTaskId] = useState<string>("");
  const [ownId, setOwnId] = useState<string | null>(null);
  // 由本页计时器"接管"的会话（来自任务/事件/浮层启动）；用于同步模式与关联任务
  const [adoptedId, setAdoptedId] = useState<string | null>(null);

  const running = sessions.find((s) => s.status === "running") ?? null;
  const external = running && running.id !== ownId ? running : null;

  // 有外部会话时，把模式与关联任务同步成它的，让卡片内计时器正确接管
  React.useEffect(() => {
    if (!external) return;
    if (external.mode === "pomodoro" || external.mode === "stopwatch") setMode(external.mode);
    if (external.targetType === "task" && external.targetId) setTaskId(external.targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external?.id]);

  const openTasks = useMemo(
    () => tasks.filter((t) => !t.completed).sort((a, b) => a.order - b.order).slice(0, 200),
    [tasks]
  );
  const target: FocusTarget | null = useMemo(() => {
    const t = openTasks.find((x) => x.id === taskId);
    return t ? { id: t.id, type: "task", title: t.title } : null;
  }, [openTasks, taskId]);

  const plannedMinutes = mode === "pomodoro" ? focus.pomodoroMinutes : 0;
  const setNum = (patch: Partial<typeof focus>) => void updateSettings({ focus: { ...focus, ...patch } });
  const numInput = (
    label: string,
    key: "pomodoroMinutes" | "shortBreakMinutes" | "longBreakMinutes" | "longBreakInterval",
    min: number,
    max: number
  ) => (
    <label className="fp-num">
      {label}
      <input
        className="input" type="number" min={min} max={max} style={{ width: 66 }}
        value={focus[key]}
        onChange={(e) => setNum({ [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) } as Partial<typeof focus>)}
      />
    </label>
  );

  return (
    <div className="card card-pad">
      <div className="fp-head">
        <div className="card-title" style={{ margin: 0 }}>🎯 开始专注</div>
        <div style={{ flex: 1 }} />
        <span className="fp-hint">同一时刻只允许一个进行中的专注</span>
      </div>

      {/* 上半部：模式 / 时长 / 关联任务（固定区） */}
      <div className="fp-controls">
        <div className="focus-mode-seg">
          {([["pomodoro", "🍅 番茄钟"], ["stopwatch", "▶️ 正向计时"]] as Array<[FocusMode, string]>).map(([v, l]) => (
            <button key={v} className={"chip" + (mode === v ? " on" : "")} onClick={() => setMode(v)}>{l}</button>
          ))}
        </div>
        {mode === "pomodoro" && (
          <div className="fp-nums">
            {numInput("专注", "pomodoroMinutes", 1, 180)}
            {numInput("短休", "shortBreakMinutes", 1, 60)}
            {numInput("长休", "longBreakMinutes", 1, 120)}
            {numInput("每几轮长休", "longBreakInterval", 1, 12)}
          </div>
        )}
        <label className="fp-num" style={{ width: "100%" }}>
          关联任务
          <select className="select" style={{ flex: 1, minWidth: 180 }} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">不关联（自由专注）</option>
            {openTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
      </div>

      {/* 当前会话来源提示（含来自任务/事件的会话）；计时器始终在下方接管显示 */}
      {running && (
        <div className="fp-running-strip">
          <span style={{ fontSize: 15 }}>{MODE_ICON[running.mode] ?? "🎯"}</span>
          <span>正在专注：<b>{running.targetTitle ?? "自由专注"}</b></span>
          <span className="fp-tag">来自{running.targetType === "task" ? "任务" : running.targetType === "event" ? "事件" : "自由专注"}</span>
          <span className="fp-dim">
            {MODE_NAME[running.mode] ?? running.mode}
            {running.plannedMinutes > 0 ? " · 计划 " + running.plannedMinutes + " 分钟" : " · 正向计时"}
            {" · 开始于 " + new Date(running.startedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-sm"
            onClick={() =>
              openFocusPanel(
                running.targetId && running.targetTitle
                  ? { id: running.targetId, type: (running.targetType ?? "task") as "task" | "event", title: running.targetTitle }
                  : undefined,
                running.mode
              )
            }
          >打开浮层计时器</button>
        </div>
      )}

      {/* 计时器：始终位于「开始专注」卡片内、任务行的下方 */}
      <FocusTimer
        key={mode + plannedMinutes + taskId}
        mode={mode}
        plannedMinutes={plannedMinutes}
        target={target}
        onStarted={(id) => { setOwnId(id); setAdoptedId(null); }}
        onAdopted={setAdoptedId}
        onFinished={() => { setOwnId(null); setAdoptedId(null); }}
      />
    </div>
  );
}

// ---------------- 数据：按天聚合 ----------------
interface DayStat { sec: number; count: number }

function useDayStats() {
  const sessions = useStore((s) => s.focusSessions);
  return useMemo(() => {
    const map = new Map<string, DayStat>();
    for (const s of sessions) {
      if (s.status !== "completed") continue;
      const ds = fmtDate(new Date(s.startedAt));
      const cur = map.get(ds) ?? { sec: 0, count: 0 };
      cur.sec += s.actualSeconds ?? 0;
      cur.count += 1;
      map.set(ds, cur);
    }
    return map;
  }, [sessions]);
}

// ---------------- ② 热力图（供"专注分析"内嵌：年 / 月） ----------------
/** 年度热力图（GitHub 风格：列 = 周，行 = 周一..周日） */
function YearHeat(props: { year: number; byDay: Map<string, DayStat>; onPickDay: (d: string) => void }) {
  const year = props.year;
  const byDay = props.byDay;
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const first = new Date(year, 0, 1);
    const last = new Date(year, 11, 31);
    const start = startOfWeek(first, 1);
    const end = addDays(startOfWeek(last, 1), 6);
    const out: Array<Array<{ date: string; sec: number; count: number; inYear: boolean }>> = [];
    let cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const col: Array<{ date: string; sec: number; count: number; inYear: boolean }> = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(cursor, i);
        const ds = fmtDate(d);
        const rec = byDay.get(ds);
        col.push({ date: ds, sec: rec?.sec ?? 0, count: rec?.count ?? 0, inYear: d.getFullYear() === year });
      }
      out.push(col);
      cursor = addDays(cursor, 7);
    }
    return out;
  }, [year, byDay]);

  const thresholds = useMemo(() => {
    const vals = weeks.flat().filter((d) => d.inYear && d.sec > 0).map((d) => d.sec).sort((a, b) => a - b);
    const at = (p: number) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0);
    return [at(0.25), at(0.5), at(0.75)];
  }, [weeks]);

  const level = (sec: number): number => {
    if (sec <= 0) return 0;
    if (sec <= thresholds[0]) return 1;
    if (sec <= thresholds[1]) return 2;
    if (sec <= thresholds[2]) return 3;
    return 4;
  };

  const monthLabels = useMemo(() => {
    const labels: Array<{ col: number; text: string }> = [];
    let last = -1;
    weeks.forEach((col, i) => {
      const firstOfMonth = col.find((d) => d.inYear && d.date.endsWith("-01"));
      if (firstOfMonth) {
        const m = Number(firstOfMonth.date.slice(5, 7)) - 1;
        if (m !== last) { labels.push({ col: i, text: m + 1 + "月" }); last = m; }
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div className="gh-heat-wrap">
        <div className="gh-weekdays">
          {WEEKDAY_MON.map((w, i) => <span key={w} className={i % 2 === 0 ? "" : "dim"}>{w}</span>)}
        </div>
        <div className="gh-scroll">
          <div className="gh-months">
            {monthLabels.map((m) => (
              <span key={m.text + m.col} style={{ left: m.col * 14 + "px" }}>{m.text}</span>
            ))}
          </div>
          <div className="gh-heat">
            {weeks.map((col, i) => (
              <div key={i} className="gh-col">
                {col.map((d) => (
                  <div
                    key={d.date}
                    className={"gh-cell l" + level(d.sec) + (d.inYear ? "" : " out") + (selectedDay === d.date ? " sel" : "")}
                    title={d.date + "　" + (d.count ? d.count + " 次 · " + fmtDuration(d.sec) : "无专注") + "\n点击查看当天分析"}
                    onClick={() => { setSelectedDay(d.date); props.onPickDay(d.date); }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
  );
}

/** 月度热力图（7 列 = 周一..周日，格子显示日号） */
function MonthHeat(props: { anchor: string; byDay: Map<string, DayStat>; onPickDay: (d: string) => void }) {
  const d0 = parseDate(props.anchor);
  const ms = new Date(d0.getFullYear(), d0.getMonth(), 1);
  const me = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
  const gridStart = startOfWeek(ms, 1);
  const lastWeekStart = startOfWeek(addDays(me, -1), 1);
  const weeks = Math.round((lastWeekStart.getTime() - gridStart.getTime()) / (7 * 86400000)) + 1;
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const inMonth = cells.filter((c) => c.getMonth() === ms.getMonth());
  const th = heatLevels(inMonth.map((c) => props.byDay.get(fmtDate(c))?.sec ?? 0));
  return (
    <div className="mh-wrap">
      <div className="mh-heads">
        {WEEKDAY_MON.map((w, i) => (
          <span key={w} className={i >= 5 ? "wknd" : ""}>{w}</span>
        ))}
      </div>
      <div className="mh-grid">
        {cells.map((c) => {
          const ds = fmtDate(c);
          if (c.getMonth() !== ms.getMonth()) return <div key={ds} className="mh-cell out" />;
          const rec = props.byDay.get(ds);
          const sec = rec?.sec ?? 0;
          return (
            <div
              key={ds}
              className={"mh-cell l" + levelOf(sec, th)}
              title={ds + "　" + (rec?.count ? rec.count + " 次 · " + fmtDuration(sec) : "无专注") + "\n点击查看当天分析"}
              onClick={() => props.onPickDay(ds)}
            >
              <span className="mh-num">{c.getDate()}</span>
              {rec?.count ? <span className="mh-dot" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 相对色阶：按当前展示范围内的非零值取四分位 */
function heatLevels(values: number[]): number[] {
  const vals = values.filter((v) => v > 0).sort((a, b) => a - b);
  const at = (p: number) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0);
  return [at(0.25), at(0.5), at(0.75)];
}

function levelOf(sec: number, th: number[]): number {
  if (sec <= 0) return 0;
  if (sec <= th[0]) return 1;
  if (sec <= th[1]) return 2;
  if (sec <= th[2]) return 3;
  return 4;
}

function rangeUnit(period: Period): string {
  return period === "year" ? "年度" : period === "month" ? "月度" : period === "week" ? "周" : "天";
}

// ---------------- ③ 分析：年 / 月 / 周 / 天（含热力图） ----------------
type Period = "year" | "month" | "week" | "day";

function AnalysisCard() {
  const sessions = useStore((s) => s.focusSessions);
  const tasks = useStore((s) => s.tasks);
  const lists = useStore((s) => s.lists);
  const thisYear = new Date().getFullYear();
  const [period, setPeriod] = useState<Period>("year");
  const [year, setYear] = useState(thisYear);
  const [anchor, setAnchor] = useState<string>(todayStr());

  // 切换周期时把锚点归到"现在"
  const changePeriod = (p: Period) => {
    setPeriod(p);
    if (p === "year") setYear(thisYear);
    else setAnchor(todayStr());
  };

  const { start, end, label } = useMemo(() => {
    if (period === "year") {
      return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), label: year + " 年" };
    }
    if (period === "month") {
      const d = parseDate(anchor);
      const ms = new Date(d.getFullYear(), d.getMonth(), 1);
      const me = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      return { start: ms, end: me, label: ms.getFullYear() + " 年 " + (ms.getMonth() + 1) + " 月" };
    }
    if (period === "week") {
      const ws = startOfWeek(parseDate(anchor), 1);
      const we = addDays(ws, 7);
      return { start: ws, end: we, label: fmtDate(ws) + " ~ " + fmtDate(addDays(ws, 6)) + "（第 " + weekNo(ws) + " 周）" };
    }
    const d = parseDate(anchor);
    return { start: startOfDay(d), end: addDays(startOfDay(d), 1), label: anchor + " 星期" + WEEKDAY_MON[(d.getDay() + 6) % 7] };
  }, [period, year, anchor]);

  const step = (dir: 1 | -1) => {
    if (period === "year") { setYear(year + dir); return; }
    if (period === "month") {
      const d = parseDate(anchor);
      setAnchor(fmtDate(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
      return;
    }
    const days = period === "week" ? 7 : 1;
    setAnchor(fmtDate(addDays(parseDate(anchor), dir * days)));
  };

  const inRange = useMemo(
    () => sessions.filter((s) => s.status === "completed" && s.startedAt >= start.getTime() && s.startedAt < end.getTime()),
    [sessions, start, end]
  );
  const inRangeAll = useMemo(
    () => sessions.filter((s) => s.startedAt >= start.getTime() && s.startedAt < end.getTime()),
    [sessions, start, end]
  );

  const totalSec = inRange.reduce((a, s) => a + (s.actualSeconds ?? 0), 0);
  const activeDays = new Set(inRange.map((s) => fmtDate(new Date(s.startedAt)))).size;
  const avg = inRange.length ? totalSec / inRange.length : 0;
  const longest = inRange.reduce((a, s) => Math.max(a, s.actualSeconds ?? 0), 0);
  const completion = inRangeAll.length
    ? Math.round((inRange.length / inRangeAll.length) * 100)
    : 0;

  // 趋势：年 → 12 月；月 → 该月每天；周 → 7 天；天 → 24 小时
  const trend = useMemo(() => {
    if (period === "year") {
      const arr = Array.from({ length: 12 }, (_, m) => ({ label: m + 1 + "月", sec: 0 }));
      for (const s of inRange) arr[new Date(s.startedAt).getMonth()].sec += s.actualSeconds ?? 0;
      return arr;
    }
    if (period === "month") {
      const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      const arr = Array.from({ length: days }, (_, i) => ({ label: String(i + 1), sec: 0 }));
      for (const s of inRange) arr[new Date(s.startedAt).getDate() - 1].sec += s.actualSeconds ?? 0;
      return arr;
    }
    if (period === "week") {
      const arr = Array.from({ length: 7 }, (_, i) => ({ label: WEEKDAY_MON[i], sec: 0 }));
      for (const s of inRange) arr[(new Date(s.startedAt).getDay() + 6) % 7].sec += s.actualSeconds ?? 0;
      return arr;
    }
    const arr = Array.from({ length: 24 }, (_, h) => ({ label: String(h), sec: 0 }));
    for (const s of inRange) arr[new Date(s.startedAt).getHours()].sec += s.actualSeconds ?? 0;
    return arr;
  }, [inRange, period, start]);
  const maxTrend = Math.max(1, ...trend.map((x) => x.sec));
  const golden = trend.reduce((best, x) => (x.sec > best.sec ? x : best), trend[0]);

  const byTask = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of inRange) {
      const name = s.targetTitle || "自由专注";
      m.set(name, (m.get(name) ?? 0) + (s.actualSeconds ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [inRange]);
  const byList = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of inRange) {
      const t = s.targetType === "task" && s.targetId ? tasks.find((x) => x.id === s.targetId) : undefined;
      const name = t ? lists.find((l) => l.id === t.listId)?.name ?? "未分类" : "自由专注/其它";
      m.set(name, (m.get(name) ?? 0) + (s.actualSeconds ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [inRange, tasks, lists]);
  const maxTask = Math.max(1, ...byTask.map((x) => x[1]));
  const maxList = Math.max(1, ...byList.map((x) => x[1]));

  // ---- 热力图（年 / 月）+ 区间连续天数 ----
  const byDay = useDayStats();
  const streakDays = useMemo(() => {
    const days = new Set(inRange.map((s) => fmtDate(new Date(s.startedAt))));
    let best = 0;
    let cur = 0;
    const cursor = new Date(start);
    while (cursor.getTime() < end.getTime()) {
      if (days.has(fmtDate(cursor))) { cur++; best = Math.max(best, cur); } else cur = 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    return best;
  }, [inRange, start, end]);
  const pickDay = (d: string) => { setPeriod("day"); setAnchor(d); };
  const showHeat = period === "year" || period === "month";

  return (
    <div className="card card-pad">
      <div className="fp-head">
        <div className="card-title" style={{ margin: 0 }}>📊 专注分析</div>
        <Seg<Period>
          value={period}
          onChange={changePeriod}
          options={[
            { value: "year", label: "年" },
            { value: "month", label: "月" },
            { value: "week", label: "周" },
            { value: "day", label: "天" },
          ]}
        />
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => step(-1)} title={"上一个" + rangeUnit(period)}>◀</button>
        <b style={{ minWidth: 200, textAlign: "center", fontSize: 13 }}>{label}</b>
        <button className="btn btn-sm" onClick={() => step(1)} title={"下一个" + rangeUnit(period)}>▶</button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => { setYear(thisYear); setAnchor(todayStr()); }}
        >回到今天</button>
      </div>

      <div className="stats-grid" style={{ marginTop: 12 }}>
        <StatCard num={fmtDuration(totalSec)} lbl="总专注时长" />
        <StatCard num={String(inRange.length)} lbl="完成次数" />
        <StatCard num={fmtDuration(Math.round(avg))} lbl="平均每次" />
        <StatCard num={activeDays + " 天"} lbl="活跃天数" />
        <StatCard num={completion + "%"} lbl="完成率" />
        <StatCard num={fmtDuration(longest)} lbl="最长一次" />
      </div>

      {/* 热力图：年视图 = 全年；月视图 = 当月；周/天不显示 */}
      {showHeat && (
        <div className="fp-heat-block">
          <div className="fp-heat-head">
            <span className="fp-heat-title">
              🔥 专注热力图（{period === "year" ? year + " 年" : label}）
            </span>
            <span className="fp-heat-sum">
              共专注 <b>{fmtDuration(totalSec)}</b> · <b>{inRange.length}</b> 次 · 活跃 <b>{activeDays}</b> 天 · 最长连续 <b>{streakDays}</b> 天
            </span>
          </div>
          {period === "year"
            ? <YearHeat year={year} byDay={byDay} onPickDay={pickDay} />
            : <MonthHeat anchor={anchor} byDay={byDay} onPickDay={pickDay} />}
          <div className="fp-legend">
            <span>少</span>
            {[0, 1, 2, 3, 4].map((l) => <span key={l} className={"gh-cell l" + l} style={{ width: 11, height: 11 }} />)}
            <span>多</span>
            <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>点击任意格子 → 查看该天分析</span>
          </div>
        </div>
      )}

      <div className="fp-trend-title">
        {period === "year" ? "按月趋势" : period === "month" ? "按天趋势" : period === "week" ? "按天趋势" : "按时段分布（小时）"}
        {golden.sec > 0 && <span className="badge orange">{period === "day" ? "最专注 " + golden.label + ":00-" + (Number(golden.label) + 1) + ":00" : "最高 " + golden.label}</span>}
      </div>
      <div className="fp-trend">
        {trend.map((x) => (
          <div key={x.label} className="fp-trend-col" title={x.label + "：" + fmtDuration(x.sec)}>
            <div className="fp-trend-track">
              <div className="fp-trend-fill" style={{ height: Math.max(2, (x.sec / maxTrend) * 100) + "%" }} />
            </div>
            <span className="fp-trend-lbl">{x.label}</span>
          </div>
        ))}
      </div>

      <div className="fp-rank-grid">
        <div>
          <div className="fp-sub">🏆 按任务</div>
          {!byTask.length && <div className="empty">暂无数据</div>}
          {byTask.map(([name, sec]) => (
            <div key={name} className="bar-row">
              <span className="bar-name" title={name}>{name}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: (sec / maxTask) * 100 + "%" }} /></div>
              <span className="bar-val">{fmtDuration(sec)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="fp-sub">📂 按清单</div>
          {!byList.length && <div className="empty">暂无数据</div>}
          {byList.map(([name, sec]) => (
            <div key={name} className="bar-row">
              <span className="bar-name" title={name}>{name}</span>
              <div className="bar-track"><div className="bar-fill" style={{ background: "var(--success)", width: (sec / maxList) * 100 + "%" }} /></div>
              <span className="bar-val">{fmtDuration(sec)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function weekNo(d: Date): number {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const firstDay = new Date(target.getFullYear(), 0, 1);
  const days = Math.floor((target.getTime() - firstDay.getTime()) / 86400000);
  return Math.ceil((days + firstDay.getDay() + 1) / 7);
}

function StatCard(props: { num: string; lbl: string; color?: string }) {
  return (
    <div className="stat-card card" style={{ background: "var(--bg)" }}>
      <div className="num" style={{ color: props.color }}>{props.num}</div>
      <div className="lbl">{props.lbl}</div>
    </div>
  );
}

// ---------------- ④ 记录（含来自任务的专注） ----------------
function HistoryCard() {
  const sessions = useStore((s) => s.focusSessions);
  const updateSession = useStore((s) => s.updateFocusSession);
  const deleteSession = useStore((s) => s.deleteFocusSession);
  const [status, setStatus] = useState<"all" | "completed" | "abandoned">("all");
  const [targetKind, setTargetKind] = useState<"all" | "task" | "event" | "free">("all");
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return [...sessions]
      .sort((a, b) => b.startedAt - a.startedAt)
      .filter((s) => (status === "all" ? true : s.status === status))
      .filter((s) => {
        if (targetKind === "all") return true;
        if (targetKind === "free") return s.targetType == null;
        return s.targetType === targetKind;
      })
      .filter((s) => (kw ? ((s.targetTitle ?? "") + " " + (s.note ?? "")).toLowerCase().includes(kw) : true));
  }, [sessions, status, targetKind, q]);

  const exportCSV = () => {
    const rows = [
      ["目标", "类型", "模式", "计划分钟", "实际时长(秒)", "暂停次数", "状态", "开始时间", "结束时间", "备注"],
      ...list.map((s) => [
        s.targetTitle ?? "自由专注", s.targetType ?? "", MODE_NAME[s.mode] ?? s.mode, String(s.plannedMinutes ?? 0),
        String(Math.round(s.actualSeconds ?? 0)), String(s.pauseCount ?? 0), s.status,
        new Date(s.startedAt).toLocaleString(), s.endedAt ? new Date(s.endedAt).toLocaleString() : "", s.note ?? "",
      ]),
    ];
    downloadText(
      "smartday-focus-" + todayStr() + ".csv",
      "\uFEFF" + rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(",")).join("\r\n"),
      "text/csv;charset=utf-8"
    );
  };

  return (
    <div className="card card-pad">
      <div className="fp-head">
        <div className="card-title" style={{ margin: 0 }}>🗂️ 专注记录（{list.length}）</div>
        <div style={{ flex: 1 }} />
        <select className="select" style={{ width: 108 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">全部状态</option>
          <option value="completed">已完成</option>
          <option value="abandoned">已放弃</option>
        </select>
        <select className="select" style={{ width: 116 }} value={targetKind} onChange={(e) => setTargetKind(e.target.value as typeof targetKind)}>
          <option value="all">全部来源</option>
          <option value="task">任务</option>
          <option value="event">事件</option>
          <option value="free">自由专注</option>
        </select>
        <input className="input" style={{ width: 170 }} placeholder="筛选（目标/备注）" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-sm" onClick={exportCSV}>导出 CSV</button>
      </div>

      <div style={{ maxHeight: 380, overflowY: "auto", marginTop: 8 }}>
        {!list.length && <div className="empty">暂无记录</div>}
        <table className="kbd-table">
          <thead>
            <tr><th>目标</th><th>模式</th><th>时长</th><th>开始时间</th><th>状态</th><th>备注</th><th></th></tr>
          </thead>
          <tbody>
            {list.slice(0, 300).map((s) => (
              <tr key={s.id}>
                <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {MODE_ICON[s.mode]} {s.targetTitle ?? "自由专注"}
                  {s.targetType === "task" && <span className="fp-tag">任务</span>}
                </td>
                <td>{MODE_NAME[s.mode] ?? s.mode}</td>
                <td>{fmtDuration(s.actualSeconds ?? 0)}</td>
                <td>{new Date(s.startedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                <td>
                  <span className={"badge " + (s.status === "completed" ? "green" : s.status === "running" ? "orange" : "red")}>
                    {s.status === "completed" ? "已完成" : s.status === "running" ? "进行中" : "已放弃"}
                  </span>
                </td>
                <td>
                  {editId === s.id ? (
                    <input className="input" autoFocus style={{ padding: "3px 8px", fontSize: 12 }} value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onBlur={() => { void updateSession(s.id, { note }); setEditId(null); }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                  ) : (
                    <span style={{ cursor: "pointer", color: s.note ? "var(--text)" : "var(--text-muted)" }}
                      onClick={() => { setEditId(s.id); setNote(s.note ?? ""); }}>{s.note || "＋ 备注"}</span>
                  )}
                </td>
                <td><button className="icon-btn" onClick={() => void deleteSession(s.id)}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
