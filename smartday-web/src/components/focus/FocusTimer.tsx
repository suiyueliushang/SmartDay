// ============================================================
// 专注计时器核心（四模式复用）：番茄钟/倒计时/正向/事件倒计时
// 支持 暂停/恢复/提前完成/放弃、后台运行时间修正、提示音、勿扰
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { FocusMode, FocusSession, FocusStatus } from "@/types";
import { playReminderSound } from "@/app/bootstrap";
import { fmtDuration } from "@/lib/date";

export interface FocusTarget {
  id: string;
  type: "task" | "event";
  title: string;
}

export function FocusTimer(props: {
  mode: FocusMode;
  plannedMinutes?: number;
  endAt?: number;
  target?: FocusTarget | null;
  onFinished?: (session: FocusSession | null) => void;
  /** 用户在本组件点「开始专注」后回调 */
  onStarted?: (id: string) => void;
  /** 本组件接管了别处已在进行中的会话时回调（与 onStarted 区分） */
  onAdopted?: (id: string) => void;
}) {
  const settings = useStore((s) => s.settings);
  const createSession = useStore((s) => s.createFocusSession);
  const updateSession = useStore((s) => s.updateFocusSession);
  const showToast = useUiStore((s) => s.showToast) ?? (() => {});
  // 本组件启动的会话 id：用于区分「别的入口（如任务）正在专注」并阻止并行
  const [mySessionId, setMySessionId] = useState<string | null>(null);
  const otherRunning = useStore((s) => s.focusSessions.some((x) => x.status === "running" && x.id !== mySessionId));

  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [round, setRound] = useState(0);
  // 不再进入页面就自动计时：必须点「开始专注」才启动
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);

  const sessionRef = useRef<FocusSession | null>(null);
  const [remaining, setRemaining] = useState(() => focusSecondsFor("focus", 0, settings, props));
  const [elapsed, setElapsed] = useState(0);
  const pauseStartRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const finishedRef = useRef(false);
  // 本次专注的**累计实际秒数**（唯一真相）
  // 修复前：每 400ms 都写 (snapshot.actualSeconds + delta)，而 snapshot 永远是最初的 0，
  // 于是每次只写 0.4 秒、从不累加；完成时又用旧快照覆盖 → 记录全是 0 秒。
  const accRef = useRef(0);

  const isCountdown = props.mode === "pomodoro" || props.mode === "countdown" || props.mode === "event";

  const totalSeconds = useMemo(() => focusSecondsFor(phase, round, settings, props), [phase, round, settings, props]);

  // 挂载时若已有进行中的会话（可能来自任务抽屉 / 事件 / 浮层），本计时器直接"接管"它：
  // 这样专注页的计时器始终留在「开始专注」卡片里（任务下方），不会因为有别处的会话而消失。
  useEffect(() => {
    const running = useStore.getState().focusSessions.find((x) => x.status === "running");
    if (!running) return;
    sessionRef.current = running;
    setMySessionId(running.id);
    props.onAdopted?.(running.id);
    finishedRef.current = false;
    setRunning(true);
    setPaused(false);
    startedAtRef.current = running.startedAt;
    lastTickRef.current = Date.now();
    // 接管已记录的累计时长，避免从头开始算
    accRef.current = running.actualSeconds ?? 0;
    const elapsed = Math.max(0, Math.round((Date.now() - running.startedAt) / 1000 - (running.pausedSeconds ?? 0)));
    if ((running.plannedMinutes ?? 0) > 0) setRemaining(Math.max(0, running.plannedMinutes * 60 - elapsed));
    else setElapsed(elapsed);
    // 仅首次挂载时接管
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleComplete = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (sessionRef.current) {
      const s = sessionRef.current;
      // 关键：以累计值为准写入，避免用旧快照把 actualSeconds 覆盖成 0
      const finished: FocusSession = { ...s, actualSeconds: accRef.current, status: "completed" as FocusStatus, endedAt: Date.now() };
      void updateSession(s.id, finished);
      sessionRef.current = null;
      if (settings.focus.completionSound) playReminderSound();
      // 到时间提醒：系统通知 + 页面提示
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("专注结束", { body: settings.focus.pomodoroMinutes + " 分钟专注已完成，休息一下", icon: "/icon.png" });
        }
      } catch {
        /* 忽略通知失败 */
      }
    }
    if (props.mode === "pomodoro") {
      if (phase === "focus") {
        showToast("🍅 第 " + (round + 1) + " 个番茄完成，开始休息！", "success");
        const nextRound = round + 1;
        setRound(nextRound);
        setPhase("break");
        setRemaining(nextRound % settings.focus.longBreakInterval === 0 ? settings.focus.longBreakMinutes * 60 : settings.focus.shortBreakMinutes * 60);
        startedAtRef.current = null;
        lastTickRef.current = Date.now();
        finishedRef.current = false;
        setRunning(true);
        setPaused(false);
      } else {
        showToast("休息结束，开始下一个专注！", "success");
        setPhase("focus");
        setRemaining(settings.focus.pomodoroMinutes * 60);
        startedAtRef.current = null;
        lastTickRef.current = Date.now();
        finishedRef.current = false;
        setRunning(true);
        setPaused(false);
        startFocus();
      }
      return;
    }
    showToast("🎉 专注完成：" + fmtDuration(remaining), "success");
    setRunning(false);
    if (props.onFinished) props.onFinished(sessionRef.current);
  };

  // 主计时循环
  useEffect(() => {
    if (!running || paused) return;
    startedAtRef.current = startedAtRef.current ?? Date.now();
    lastTickRef.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      if (isCountdown) {
        setRemaining((r) => {
          const next = Math.max(0, r - delta);
          if (next <= 0) handleComplete();
          return next;
        });
      } else {
        setElapsed((e) => e + delta);
      }
      if (sessionRef.current) {
        const s = sessionRef.current;
        // 番茄钟的「休息」阶段不计入专注时长
        const counting = !(props.mode === "pomodoro" && phase === "break");
        if (counting) {
          accRef.current += delta;
          s.actualSeconds = accRef.current; // 保持快照同步，其它分支才能拿到真实值
          void updateSession(s.id, { actualSeconds: Math.round(accRef.current * 10) / 10 });
        }
      }
    }, 400);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused, isCountdown, phase, round]);

  // 事件倒计时：实时同步目标时间
  useEffect(() => {
    if (props.mode === "event" && props.endAt) {
      const iv = setInterval(() => {
        const r = Math.max(0, Math.round((props.endAt! - Date.now()) / 1000));
        setRemaining(r);
        if (r <= 0 && !finishedRef.current) handleComplete();
      }, 500);
      return () => clearInterval(iv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, props.endAt]);

  const startFocus = () => {
    if (sessionRef.current) return;
    // 同时只允许一个进行中的专注：别的入口已在专注时不启动
    if (otherRunning) {
      showToast("已有进行中的专注，请先在专注助手页结束它", "error");
      return;
    }
    finishedRef.current = false;
    void createSession({
      mode: props.mode,
      plannedMinutes: props.mode === "stopwatch" ? 0 : props.mode === "pomodoro" ? settings.focus.pomodoroMinutes : (props.plannedMinutes ?? 25),
      targetId: props.target?.id ?? null,
      targetType: props.target?.type ?? null,
      targetTitle: props.target?.title,
      status: "running",
      round: phase === "focus" ? round + 1 : undefined,
    }).then((s) => {
      sessionRef.current = s;
      accRef.current = s.actualSeconds ?? 0;
      setMySessionId(s.id);
      props.onStarted?.(s.id);
      startedAtRef.current = Date.now();
      lastTickRef.current = Date.now();
    });
  };

  // 卸载（切换页面/关闭浮层）时把累计时长落盘，避免"实际专注了却只记了不到 1 秒"
  useEffect(() => {
    return () => {
      const s = sessionRef.current;
      if (s && s.status === "running") {
        void useStore.getState().updateFocusSession(s.id, { actualSeconds: Math.round(accRef.current * 10) / 10 });
      }
    };
  }, []);

  const pause = () => {
    setPaused(true);
    pauseStartRef.current = Date.now();
    const s = sessionRef.current;
    if (s) void updateSession(s.id, { pauseCount: (s.pauseCount ?? 0) + 1 });
  };
  const resume = () => {
    pauseStartRef.current = null;
    lastTickRef.current = Date.now();
    setPaused(false);
  };

  const finishEarly = () => {
    if (sessionRef.current) {
      const s = sessionRef.current;
      void updateSession(s.id, { actualSeconds: accRef.current, status: "completed", endedAt: Date.now() });
      sessionRef.current = null;
    }
    finishedRef.current = true;
    setRunning(false);
    if (props.onFinished) props.onFinished(null);
    showToast("已提前完成", "info");
  };

  const abandon = () => {
    const s = sessionRef.current;
    if (s) {
      const count = settings.focus.countAbandoned;
      void updateSession(s.id, { status: count ? "completed" : "abandoned", endedAt: Date.now(), actualSeconds: count ? accRef.current : 0 });
      sessionRef.current = null;
    }
    finishedRef.current = true;
    setRunning(false);
    if (props.onFinished) props.onFinished(null);
    showToast("已放弃本次专注", "info");
  };

  const display = isCountdown ? Math.ceil(remaining) : Math.floor(elapsed);
  const progress = totalSeconds > 0 ? Math.min(1, (totalSeconds - Math.max(0, remaining)) / totalSeconds) : 0;
  const mm = String(Math.floor(display / 60)).padStart(2, "0");
  const ss = String(display % 60).padStart(2, "0");
  const R = 88;
  const C = 2 * Math.PI * R;

  const phaseLabel = props.mode === "pomodoro"
    ? (phase === "focus" ? "专注中" : round % settings.focus.longBreakInterval === 0 ? "长休息" : "短休息")
    : props.mode === "event" ? "事件倒计时" : props.mode === "countdown" ? "倒计时" : "正向计时";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
      <div className="timer-ring">
        <svg width="210" height="210" viewBox="0 0 210 210">
          <circle className="ring-bg" cx="105" cy="105" r={R} fill="none" strokeWidth="10" />
          <circle
            className="ring-fg"
            cx="105" cy="105" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            stroke={phase === "break" ? "var(--success)" : "var(--accent)"}
          />
        </svg>
        <div className="timer-num">
          <span className="phase-label">{phaseLabel}{paused ? "（已暂停）" : ""}</span>
          <span style={{ marginTop: 30 }}>{mm}:{ss}</span>
        </div>
      </div>

      {props.mode === "pomodoro" && (
        <div className="pomodoro-progress">
          {Array.from({ length: Math.min(8, round) }, () => "🍅").join("")}
          {Array.from({ length: Math.max(0, settings.focus.longBreakInterval - round) }, () => "🟤").join("")}
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}> {Math.min(round, 8)}/{settings.focus.longBreakInterval}</span>
        </div>
      )}

      {props.target && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          🎯 {props.target.title}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {running && !paused && <button className="btn" onClick={pause}>⏸ 暂停</button>}
        {paused && <button className="btn btn-primary" onClick={resume}>▶ 继续</button>}
        {!running && (
          <button
            className="btn btn-primary"
            disabled={otherRunning}
            title={otherRunning ? "已有进行中的专注，请先结束它" : "开始专注"}
            onClick={() => { setRunning(true); setPaused(false); void startFocus(); }}
          >
            ▶ 开始专注
          </button>
        )}
        {running && <button className="btn" onClick={finishEarly}>⏹ 提前完成</button>}
        {running && <button className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={abandon}>放弃</button>}
      </div>
    </div>
  );
}

function focusSecondsFor(
  phase: "focus" | "break",
  round: number,
  settings: ReturnType<typeof useStore.getState>["settings"],
  props: { mode: FocusMode; plannedMinutes?: number; endAt?: number }
): number {
  if (props.mode === "event") {
    if (props.endAt) return Math.max(0, Math.round((props.endAt - Date.now()) / 1000));
    return (props.plannedMinutes ?? 25) * 60;
  }
  if (props.mode === "pomodoro") {
    if (phase === "focus") return settings.focus.pomodoroMinutes * 60;
    return (round > 0 && round % settings.focus.longBreakInterval === 0 ? settings.focus.longBreakMinutes : settings.focus.shortBreakMinutes) * 60;
  }
  if (props.mode === "countdown") return (props.plannedMinutes ?? 25) * 60;
  return 0;
}
