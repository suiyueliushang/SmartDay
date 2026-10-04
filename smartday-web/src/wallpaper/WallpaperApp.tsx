// ============================================================
// 桌面壁纸日历主界面
//  - 配色主题：4 套（晨雾蓝 / 深邃夜 / 暖阳沙 / 薄荷绿），容器与单元格明确区分
//  - 材质：毛玻璃（透出壁纸）/ 实色面板
//  - 双模式：桌面模式（点击穿透，仅可点击区域响应）/ 编辑模式
//  - ☰ 菜单：位置 / 大小 / 透明度 / 显示内容 / 隐藏日历等
//  - 窗口移动与缩放：由主进程按真实光标驱动（不使用 app-region，
//    因为系统拖拽区会吞掉点击，导致编辑模式点 🔓 无反应）
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { getDayInfo } from "@/lib/holidays";
import { eventOccurrencesInRange } from "@/lib/recurrence";
import {
  parseDate, addMonths, addDays, fmtDate, fmtTime, startOfWeek, startOfMonth,
  todayStr, parseDateTime, WEEKDAY_SHORT, getWeekNumber,
} from "@/lib/date";
import {
  DesktopConfig, DEFAULT_DESKTOP_CONFIG, Rect, debugState, fitToContent, isDesktop,
  loadConfig, onConfigChange, reportZones, saveConfig, setEditMode,
  dragStart, dragEnd, resizeStart, resizeEnd, hideWallpaper,
} from "./desktopBridge";

export const THEMES: Array<{ value: DesktopConfig["theme"]; label: string; hint: string }> = [
  { value: "mist", label: "晨雾蓝", hint: "浅蓝底 + 白色单元格" },
  { value: "ink", label: "深邃夜", hint: "深色底 + 玻璃单元格" },
  { value: "sand", label: "暖阳沙", hint: "米杏底 + 暖白单元格" },
  { value: "mint", label: "薄荷绿", hint: "薄荷底 + 纯白单元格" },
];

export function WallpaperApp() {
  const ready = useStore((s) => s.ready);
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const diaries = useStore((s) => s.diaries);
  const categories = useStore((s) => s.categories);
  const appSettings = useStore((s) => s.settings);
  const toggleTask = useStore((s) => s.toggleTaskComplete);

  const [config, setConfig] = useState<DesktopConfig>(DEFAULT_DESKTOP_CONFIG);
  const [month, setMonth] = useState(() => fmtDate(new Date()));
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fittedRef = useRef(false);

  // ---------- 桌面配置 ----------
  useEffect(() => {
    void loadConfig().then(setConfig);
    return onConfigChange(setConfig);
  }, []);

  const updateConfig = useCallback(async (patch: Partial<DesktopConfig>) => {
    const next = await saveConfig(patch);
    setConfig(next);
    return next;
  }, []);

  // 模式切换（带 380ms 防抖）
  // 为什么需要防抖：原始需求是「双击 🔒 进入编辑」，用户习惯性双击时，
  // 第一次点击进编辑、第二次点击又切回桌面 —— 净效果就是“点了没反应”。
  // 这里把 380ms 内的第二次触发吞掉，于是：
  //   单击 🔒 → 进编辑；双击 🔒 → 也只进编辑（不会自我抵消）。
  const lastToggleRef = useRef(0);
  const toggleMode = useCallback(async (force?: boolean) => {
    const now = Date.now();
    // 500ms：覆盖人手速双击（通常 100~250ms）与偏慢的双击（~400ms）
    if (!force && now - lastToggleRef.current < 500) return;
    lastToggleRef.current = now;
    const next = await setEditMode(!config.editMode);
    setConfig((c) => ({ ...c, editMode: next }));
    if (!next) setMenuOpen(false);
  }, [config.editMode]);

  // 切换月份并记忆（重启后恢复到上次查看的月份）
  const changeMonth = useCallback((ds: string) => {
    setMonth(ds);
    void saveConfig({ viewMonth: ds });
  }, []);

  const restoreRef = useRef(false);
  useEffect(() => {
    if (restoreRef.current || !config.viewMonth) return;
    restoreRef.current = true;
    setMonth(config.viewMonth);
  }, [config.viewMonth]);

  // ---------- 可点击区域上报（桌面模式下仅这些区域接收鼠标） ----------
  useEffect(() => {
    if (!isDesktop()) return;
    const report = () => {
      // 桌面模式（🔒）下日历只是背景：仅锁定按钮可点，‹ › ☰ 全部穿透到桌面；
      // 编辑模式（🔓）下所有控件可点。
      const all = Array.from(document.querySelectorAll("[data-wp-interactive]"));
      const els = config.editMode ? all : all.filter((el) => el.classList.contains("wp-lock"));
      // 锁定态额外给锁定按钮 +16px 命中范围（并裁剪到窗口内）：
      // 避免"明明点在图标上、只差几像素却被穿透到桌面"的情况。
      const pad = config.editMode ? 0 : 16;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const zones: Rect[] = els
        .map((el) => {
          const r = el.getBoundingClientRect();
          const x = Math.max(0, Math.round(r.left) - pad);
          const y = Math.max(0, Math.round(r.top) - pad);
          const right = Math.min(vw, Math.round(r.right) + pad);
          const bottom = Math.min(vh, Math.round(r.bottom) + pad);
          return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
        })
        .filter((z) => z.w > 0 && z.h > 0);
      reportZones(zones);
    };
    report();
    const ro = new ResizeObserver(report);
    if (document.body) ro.observe(document.body);
    const iv = window.setInterval(report, 600);
    window.addEventListener("resize", report);
    return () => {
      ro.disconnect();
      window.clearInterval(iv);
      window.removeEventListener("resize", report);
    };
  }, [config.editMode, menuOpen, month, config.theme, config.material, config.opacity]);

  // ---------- 自适应尺寸 ----------
  const fitToNaturalSize = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    // 卡片默认 flex:1 会撑满窗口，直接量高度得到的是窗口高度；
    // 必须先取消 flex 拉伸，才能量到“内容自然高度”，否则每次自适应都会把窗口撑大一点。
    const prevHeight = card.style.height;
    const prevFlex = card.style.flex;
    const prevWidth = card.style.width;
    card.style.flex = "0 0 auto";
    card.style.height = "auto";
    card.style.width = "100%";
    const rect = card.getBoundingClientRect();
    card.style.height = prevHeight;
    card.style.flex = prevFlex;
    card.style.width = prevWidth;
    const width = Math.max(320, Math.min(720, Math.round(window.innerWidth || 420)));
    const height = Math.max(260, Math.ceil(rect.height) + 22);
    fitToContent({ width, height });
  }, []);

  useEffect(() => {
    (window as unknown as { __smartdayFit?: () => void }).__smartdayFit = fitToNaturalSize;
    return () => {
      delete (window as unknown as { __smartdayFit?: () => void }).__smartdayFit;
    };
  }, [fitToNaturalSize]);

  // 调试钩子：直接跳到指定月份（自检/排查用）
  useEffect(() => {
    (window as unknown as { __smartdayMonth?: (ds: string) => void }).__smartdayMonth = (ds: string) =>
      changeMonth(fmtDate(parseDate(ds)));
    return () => {
      delete (window as unknown as { __smartdayMonth?: (ds: string) => void }).__smartdayMonth;
    };
  }, [changeMonth]);

  useEffect(() => {
    if (!ready || fittedRef.current || config.bounds) return;
    fittedRef.current = true;
    const t = setTimeout(fitToNaturalSize, 500);
    return () => clearTimeout(t);
  }, [ready, config.bounds, fitToNaturalSize]);

  // ---------- 拖动移动 / 拖动缩放（主进程驱动） ----------
  const beginMove = (e: React.PointerEvent) => {
    if (!config.editMode) return;
    if ((e.target as HTMLElement).closest("[data-wp-interactive]")) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
    dragStart();
    const pointerId = e.pointerId;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      // 关键：显式释放指针捕获。若捕获未释放，之后所有指针事件都会被重定向到标题栏，
      // 表现为「🔒/🔓 按钮点了没反应」。pointerup 会自动释放，但事件丢失时必须兜底。
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        /* 忽略 */
      }
      dragEnd();
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("lostpointercapture", end);
      void debugState().then((st) => {
        if (st) void saveConfig({ width: st.bounds.width, height: st.bounds.height, bounds: st.bounds });
      });
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  };

  const beginResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
    resizeStart();
    const pointerId = e.pointerId;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        /* 忽略 */
      }
      resizeEnd();
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      el.removeEventListener("lostpointercapture", end);
      void debugState().then((st) => {
        if (st) void saveConfig({ width: st.bounds.width, height: st.bounds.height, bounds: st.bounds });
      });
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  };

  // Esc：关闭菜单 / 回到桌面模式
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuOpen) setMenuOpen(false);
      else if (config.editMode) void toggleMode(true); // Esc 是明确操作，绕过防抖
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, config.editMode, toggleMode]);

  // ---------- 数据 ----------
  const monthStart = useMemo(() => startOfMonth(parseDate(month)), [month]);
  const monthEnd = useMemo(() => addMonths(monthStart, 1), [monthStart]);
  const weekStart = appSettings.calendar.weekStart as 0 | 1;
  const gridStart = useMemo(() => startOfWeek(monthStart, weekStart), [monthStart, weekStart]);
  // 只展示本月：按本月实际跨越的周数生成单元格（5 或 6 行），非本月格子留空
  const weekCount = useMemo(() => {
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const lastWeekStart = startOfWeek(lastDay, weekStart);
    return Math.round((lastWeekStart.getTime() - gridStart.getTime()) / (7 * 86400000)) + 1;
  }, [monthStart, gridStart, weekStart]);
  const cells = useMemo(
    () => Array.from({ length: weekCount * 7 }, (_, i) => addDays(gridStart, i)),
    [gridStart, weekCount]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Array<{ id: string; label: string; color: string }>>();
    const colorOf = (ev: (typeof events)[number]) =>
      ev.color ?? categories.find((c) => c.id === ev.categoryId)?.color ?? "#4f6ef7";
    for (const ev of events) {
      for (const occ of eventOccurrencesInRange(ev, gridStart, monthEnd)) {
        const start = parseDateTime(occ.start);
        const ds = fmtDate(start);
        if (!map.has(ds)) map.set(ds, []);
        map.get(ds)!.push({
          id: occ.id,
          label: (occ.allDay ? "全天 " : fmtTime(start) + " ") + occ.title,
          color: colorOf(occ),
        });
      }
    }
    return map;
  }, [events, categories, gridStart, monthEnd]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      if (t.completed || !t.dueDate) continue;
      const d = parseDate(t.dueDate);
      if (d < gridStart || d >= monthEnd) continue;
      if (!map.has(t.dueDate)) map.set(t.dueDate, []);
      map.get(t.dueDate)!.push(t);
    }
    return map;
  }, [tasks, gridStart, monthEnd]);

  const diaryDates = useMemo(() => new Set(diaries.map((d) => d.date)), [diaries]);

  const today = todayStr();
  const todayInfo = getDayInfo(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const todayEvents = eventsByDay.get(today) ?? [];
  const todayTasks = tasksByDay.get(today) ?? [];

  const tiny = (typeof window !== "undefined" ? window.innerWidth : 420) < 380;
  const maxPerDay = tiny ? 1 : 2;

  if (!ready) {
    return (
      <div className="wp-root">
        <div className="wp-card" data-theme="mist" data-material="glass"><div className="wp-empty">加载中…</div></div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={"wp-root " + (config.editMode ? "wp-edit" : "wp-desktop")}>
      <div
        ref={cardRef}
        className="wp-card"
        data-theme={config.theme}
        data-material={config.material}
        style={{ opacity: config.opacity / 100 }}
      >
        {/* 头部：拖动区（主进程驱动，无 app-region） */}
        <div className={"wp-head" + (config.editMode ? " wp-draggable" : "")} onPointerDown={beginMove}>
          <div className="wp-head-text">
            <div
              className="wp-title"
              title="点击回到本月"
              onClick={() => changeMonth(fmtDate(new Date()))}
            >
              {monthStart.getFullYear()}年{monthStart.getMonth() + 1}月
            </div>
            <div className="wp-sub">
              今天 {today.slice(5).replace("-", "月")}日 · {todayInfo.lunarText}
              {todayInfo.holidayName ? " · " + todayInfo.holidayName : todayInfo.term ? " · " + todayInfo.term : ""}
            </div>
          </div>
          <div className="wp-actions">
            <button
              data-wp-interactive
              className="wp-icon-btn wp-nav wp-nav-prev"
              disabled={!config.editMode}
              title={config.editMode ? "上个月" : "锁定状态不可用（先点 🔒 解锁）"}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                changeMonth(fmtDate(addMonths(parseDate(month), -1)));
              }}
            >
              ‹
            </button>
            <button
              data-wp-interactive
              className="wp-icon-btn wp-nav wp-nav-next"
              disabled={!config.editMode}
              title={config.editMode ? "下个月" : "锁定状态不可用（先点 🔒 解锁）"}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                changeMonth(fmtDate(addMonths(parseDate(month), 1)));
              }}
            >
              ›
            </button>
            <button
              data-wp-interactive
              className={"wp-icon-btn wp-menu-btn" + (menuOpen ? " on" : "")}
              disabled={!config.editMode}
              title={config.editMode ? "菜单：配色 / 材质 / 透明度 / 显示内容" : "锁定状态不可用（先点 🔒 解锁）"}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setMenuOpen((v) => !v);
              }}
            >
              ☰
            </button>
            <button
              data-wp-interactive
              className="wp-icon-btn wp-lock"
              title={config.editMode ? "点击返回桌面模式（点击穿透）" : "点击进入编辑模式"}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void toggleMode();
              }}
              onClick={(e) => {
                // 兜底：若 pointerdown 未送达（捕获异常等），click 仍能触发；
                // 重复触发会被 toggleMode 内部的 380ms 防抖吞掉。
                e.stopPropagation();
                void toggleMode();
              }}
            >
              {config.editMode ? "🔓" : "🔒"}
            </button>
          </div>
        </div>

        {/* ☰ 菜单面板 */}
        {menuOpen && (
          <DesktopMenu
            config={config}
            editMode={config.editMode}
            onChange={(patch) => void updateConfig(patch)}
            onToggleMode={() => void toggleMode()}
            onFit={fitToNaturalSize}
            onHide={() => {
              setMenuOpen(false);
              hideWallpaper();
            }}
            onClose={() => setMenuOpen(false)}
          />
        )}

        {/* 月历 */}
        <div className="wp-body">
          <div
            className={"wp-grid" + (appSettings.calendar.showWeekNumbers ? "" : " no-weeknum")}
            style={{ gridTemplateRows: "auto repeat(" + weekCount + ", minmax(40px, 1fr))" }}
          >
            {appSettings.calendar.showWeekNumbers && <div className="wp-dw" />}
            {Array.from({ length: 7 }, (_, i) => {
              const wd = weekStart === 1 ? (i + 1) % 7 : i;
              return (
                <div key={i} className={"wp-dw" + (wd === 0 || wd === 6 ? " weekend" : "")}>
                  {WEEKDAY_SHORT[wd]}
                </div>
              );
            })}
            {cells.map((d, idx) => {
              const ds = fmtDate(d);
              const info = getDayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
              const inMonth = d.getMonth() === monthStart.getMonth();
              const dayEvents = eventsByDay.get(ds) ?? [];
              const dayTasks = tasksByDay.get(ds) ?? [];
              const isWeekStart = idx % 7 === 0;
              const wd = d.getDay();
              const isWeekend = wd === 0 || wd === 6;
              // 班：周末/节假日调休上班；休：工作日放假（周末本身不算“休”）
              const badge = info.isWorkday ? "班" : info.isHoliday && !isWeekend ? "休" : "";
              // 节日/节气：与阳历农历同一行显示，空间不足时截断
              const festivalName = config.showFestivals !== false ? info.festivalText ?? "" : "";
              // 只显示本月日期：非本月单元格留空（保留占位以对齐周列）
              if (!inMonth) {
                return (
                  <React.Fragment key={ds}>
                    {appSettings.calendar.showWeekNumbers && isWeekStart && <div className="wp-wk" />}
                    <div className="wp-day blank" />
                  </React.Fragment>
                );
              }
              return (
                <React.Fragment key={ds}>
                  {appSettings.calendar.showWeekNumbers && isWeekStart && <div className="wp-wk">W{getWeekNumber(d)}</div>}
                  <div
                    className={
                      "wp-day" +
                      (isWeekend ? " weekend" : "") +
                      (ds === today ? " today" : "") +
                      (info.isHoliday ? " holiday" : "") +
                      (config.editMode ? " clickable" : "")
                    }
                    title={
                      ds + " " + info.lunarText +
                      (info.holidayName ? " " + info.holidayName : "") +
                      (info.isWorkday ? "（调休上班）" : "") +
                      (info.isHoliday && !isWeekend ? "（放假）" : "")
                    }
                    onClick={() => {
                      if (!config.editMode) return;
                      if (isDesktop()) {
                        window.desktopAPI?.openMain();
                        localStorage.setItem("smartday.pendingRoute", "#/calendar/day/date:" + dateStrOf(ds));
                      }
                    }}
                  >
                    {/* 阳历 + 农历 + 节日 全部同一行（节日空间不足时自动截断） */}
                    <div className="wp-numrow">
                      <span className="wp-num">{d.getDate()}</span>
                      {config.showLunar !== false && <span className="wp-lunar-inline">{info.lunarShort}</span>}
                      {festivalName && (
                        <span
                          className={
                            "wp-fest-inline " +
                            (info.holidayName || info.lunarFestival || info.solarFestival ? "fest" : "term")
                          }
                          title={festivalName}
                        >
                          {festivalName}
                        </span>
                      )}
                      {badge && <span className={"wp-badge" + (badge === "班" ? " work" : " off")}>{badge}</span>}
                      {config.showDiary !== false && diaryDates.has(ds) && <span className="wp-diary" title="有日记">📝</span>}
                    </div>
                    {dayEvents.slice(0, maxPerDay).map((ev) => (
                      <span key={ev.id} className="wp-ev" style={{ borderColor: ev.color }}>
                        {ev.label}
                      </span>
                    ))}
                    {dayEvents.length > maxPerDay && <span className="wp-more">+{dayEvents.length - maxPerDay}</span>}
                    {config.showTasks !== false &&
                      dayTasks.slice(0, 2).map((t) => (
                        <span key={t.id} className="wp-ev task" title={"任务：" + t.title}>☑ {t.title}</span>
                      ))}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* 今日面板 */}
        {config.showTodayPanel !== false && (todayEvents.length > 0 || todayTasks.length > 0) && (
          <div className="wp-today">
            <div className="wp-today-title">今日 · {todayEvents.length} 个日程 · {todayTasks.length} 个任务</div>
            {todayEvents.slice(0, 4).map((ev) => (
              <div key={ev.id} className="wp-today-item">
                <span className="wp-dot" style={{ background: ev.color }} />
                <span className="wp-ellipsis">{ev.label}</span>
              </div>
            ))}
            {config.showTasks !== false &&
              todayTasks.slice(0, 4).map((t) => (
                <div key={t.id} className="wp-today-item">
                  <span
                    data-wp-interactive
                    className={"wp-check" + (t.completed ? " on" : "")}
                    title="勾选完成"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (config.editMode) void toggleTask(t.id);
                    }}
                  >
                    ✓
                  </span>
                  <span className="wp-ellipsis">☑ {t.title}</span>
                </div>
              ))}
          </div>
        )}

        {config.editMode && (
          <div className="wp-resize-grip" title="拖动调整窗口大小" onPointerDown={beginResize}>◢</div>
        )}
      </div>
    </div>
  );
}

function dateStrOf(ds: string): string {
  return ds;
}

// ============================================================
// ☰ 菜单
// ============================================================
function DesktopMenu(props: {
  config: DesktopConfig;
  editMode: boolean;
  onChange: (patch: Partial<DesktopConfig>) => void;
  onToggleMode: () => void;
  onFit: () => void;
  onHide: () => void;
  onClose: () => void;
}) {
  const c = props.config;
  return (
    <>
      <div className="wp-menu-backdrop" onClick={props.onClose} />
      <div className="wp-menu">
        <div className="wp-menu-sec">
          <div className="wp-menu-label">配色主题</div>
          <div className="wp-theme-grid">
            {THEMES.map((t) => (
              <button
                key={t.value}
                className={"wp-theme-btn" + (c.theme === t.value ? " on" : "")}
                data-swatch={t.value}
                title={t.label + " · " + t.hint}
                onClick={() => props.onChange({ theme: t.value })}
              >
                <span className="wp-swatch" data-swatch={t.value} />
                <span className="wp-theme-name">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="wp-menu-sec">
          <div className="wp-menu-label">材质</div>
          <div className="wp-seg">
            <button className={c.material !== "solid" ? "on" : ""} onClick={() => props.onChange({ material: "glass" })}>毛玻璃</button>
            <button className={c.material === "solid" ? "on" : ""} onClick={() => props.onChange({ material: "solid" })}>实色</button>
          </div>
        </div>

        <div className="wp-menu-sec">
          <div className="wp-menu-label">
            背景透明度 <span className="wp-menu-value">{Math.round(c.opacity)}%</span>
          </div>
          <input
            className="wp-opacity-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(c.opacity)}
            onChange={(e) => props.onChange({ opacity: Number(e.target.value) })}
          />
        </div>

        <div className="wp-menu-sec">
          <div className="wp-menu-label">显示内容</div>
          <Toggle label="节假日 / 节气" checked={c.showFestivals !== false} onChange={(v) => props.onChange({ showFestivals: v })} />
          <Toggle label="农历" checked={c.showLunar !== false} onChange={(v) => props.onChange({ showLunar: v })} />
          <Toggle label="任务" checked={c.showTasks !== false} onChange={(v) => props.onChange({ showTasks: v })} />
          <Toggle label="日记标记" checked={c.showDiary !== false} onChange={(v) => props.onChange({ showDiary: v })} />
          <Toggle label="今日面板" checked={c.showTodayPanel !== false} onChange={(v) => props.onChange({ showTodayPanel: v })} />
        </div>

        <div className="wp-menu-sec wp-menu-row">
          <button onClick={isDesktop() ? () => window.desktopAPI?.openMain() : undefined}>主应用</button>
          <button onClick={() => window.desktopAPI?.refresh()}>刷新</button>
          <button className="danger" onClick={props.onHide}>隐藏日历</button>
        </div>
      </div>
    </>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="wp-toggle">
      <span>{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
    </label>
  );
}
