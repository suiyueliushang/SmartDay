// ============================================================
// 事件创建/编辑弹窗（含重复规则、多组提醒、创建为任务）
// ============================================================
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { Modal, Field, Switch, Seg } from "./common";
import { CalendarEvent, RepeatFreq, RepeatRule, Reminder } from "@/types";
import { fmtDate, fmtDateTime, parseDateTime, addDays, todayStr, pad2, fmtTime } from "@/lib/date";
import { uid } from "@/lib/id";

const WEEKDAYS = [
  { v: 0, l: "日" }, { v: 1, l: "一" }, { v: 2, l: "二" }, { v: 3, l: "三" },
  { v: 4, l: "四" }, { v: 5, l: "五" }, { v: 6, l: "六" },
];
const COLORS = ["#4f6ef7", "#f97316", "#22c55e", "#e03131", "#8b5cf6", "#0ea5e9", "#f59f00", "#ec4899", "#64748b", "#14b8a6"];

export function EventModal() {
  const modal = useUiStore((s) => s.eventModal);
  const close = useUiStore((s) => s.closeEventModal);
  const categories = useStore((s) => s.categories);
  const events = useStore((s) => s.events);
  const createEvent = useStore((s) => s.createEvent);
  const updateEvent = useStore((s) => s.updateEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const createTask = useStore((s) => s.createTask);
  const settings = useStore((s) => s.settings);
  const showToast = useUiStore((s) => s.showToast);
  const openFocusPanel = useUiStore((s) => s.openFocusPanel);

  const existing = modal.eventId ? events.find((e) => e.id === modal.eventId) : undefined;
  const isOccurrence = !!(existing && existing.parentId);
  const master = existing?.parentId ? events.find((e) => e.id === existing!.parentId) : existing;

  // 表单状态
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(todayStr());
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(todayStr());
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [color, setColor] = useState("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const [createAsTask, setCreateAsTask] = useState(false);
  const [scope, setScope] = useState<"this" | "following" | "all">("all");
  const [showScope, setShowScope] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!modal.open) return;
    const ev = modal.eventId ? events.find((e) => e.id === modal.eventId) : undefined;
    if (ev) {
      const s = parseDateTime(ev.start);
      const e = parseDateTime(ev.end);
      setTitle(ev.title);
      setAllDay(ev.allDay);
      setStartDate(fmtDate(s));
      setStartTime(fmtTime(s));
      setEndDate(fmtDate(e));
      setEndTime(fmtTime(e));
      setLocation(ev.location ?? "");
      setDescription(ev.description ?? "");
      setCategoryId(ev.categoryId);
      setColor(ev.color ?? "");
      setReminders(ev.reminders?.length ? ev.reminders : []);
      setRepeat(ev.repeat ?? null);
      setCreateAsTask(false);
      setShowScope(!!ev.repeat && !ev.parentId);
      setScope("all");
    } else {
      const s = modal.start ? parseDateTime(modal.start) : new Date();
      const defaultDur = settings.calendar.defaultEventDuration;
      const e = modal.end ? parseDateTime(modal.end) : new Date(s.getTime() + defaultDur * 60000);
      setTitle("");
      setAllDay(modal.allDay ?? false);
      setStartDate(fmtDate(s));
      setStartTime(fmtTime(s));
      setEndDate(fmtDate(e));
      setEndTime(fmtTime(e));
      setLocation("");
      setDescription("");
      setCategoryId(modal.categoryId ?? settings.calendar.defaultCategoryId ?? categories[0]?.id ?? "");
      setColor("");
      setReminders(settings.calendar.defaultReminders.map((m) => ({ minutes: m })));
      setRepeat(null);
      setCreateAsTask(false);
      setShowScope(false);
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal.open, modal.eventId, modal.start]);

  const save = async () => {
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    const startStr = allDay ? startDate + "T00:00" : startDate + "T" + (startTime || "09:00");
    let endStr = allDay ? endDate + "T00:00" : endDate + "T" + (endTime || startTime || "10:00");
    if (parseDateTime(endStr) < parseDateTime(startStr)) {
      setError("结束时间不能早于开始时间");
      return;
    }
    const payload = {
      title: title.trim(),
      allDay,
      start: startStr,
      end: allDay ? fmtDate(addDays(parseDateTime(endStr), 1)) + "T00:00" : endStr,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      categoryId: categoryId || categories[0]?.id,
      color: color || undefined,
      reminders,
      repeat,
    };

    if (existing && existing.parentId) {
      // 编辑重复事件的单次出现：更新该出现（例外覆盖）
      await updateEvent(existing.parentId, {
        exceptions: {
          ...(master?.exceptions ?? {}),
          [fmtDate(parseDateTime(existing.start))]: { ...existing, ...payload },
        },
      });
    } else if (existing) {
      if (scope === "this" && existing.repeat) {
        // 仅此事件：写入例外
        await updateEvent(existing.id, {
          exceptions: {
            ...(existing.exceptions ?? {}),
            [fmtDate(parseDateTime(existing.start))]: { ...existing, ...payload },
          },
        });
      } else if (scope === "following") {
        // 后续事件：从该日期起重新开始系列（起点改为此事件日期+时间）
        const s = parseDateTime(payload.start as string);
        const e = parseDateTime(payload.end as string);
        const dur = e.getTime() - s.getTime();
        const newMaster: Partial<CalendarEvent> = {
          ...payload,
          start: payload.start,
          end: payload.end,
        };
        if (repeat) newMaster.repeat = repeat;
        await updateEvent(existing.id, newMaster);
        showToast("已修改后续所有重复事件", "success");
      } else {
        await updateEvent(existing.id, payload);
      }
    } else {
      await createEvent(payload);
      if (createAsTask) {
        const s = parseDateTime(startStr);
        await createTask({
          title: title.trim(),
          notes: description.trim() || undefined,
          dueDate: fmtDate(s),
          dueTime: allDay ? undefined : fmtTime(s),
          priority: settings.task.newTaskPriority,
        });
      }
    }
    close();
  };

  const remove = async () => {
    if (!existing) return;
    if (existing.repeat && !existing.parentId) {
      // 询问范围：仅此事件（例外删除）/ 全部
      const s = parseDateTime(existing.start);
      if (scope === "this") {
        await updateEvent(existing.id, {
          exceptions: { ...(existing.exceptions ?? {}), [fmtDate(s)]: { deleted: true } },
        });
        close();
        return;
      }
    }
    await deleteEvent(existing.id);
    close();
  };

  const openRepeatEditor = repeat != null;

  return (
    <Modal
      open={modal.open}
      onClose={close}
      title={existing ? (isOccurrence ? "编辑这次事件" : "编辑事件") : "新建事件"}
      footer={
        <>
          {existing && (
            <button className="btn btn-danger" onClick={() => void remove()} style={{ marginRight: "auto" }}>
              删除
            </button>
          )}
          {existing && (
            <button
              className="btn"
              onClick={() => {
                openFocusPanel(
                  { id: existing.id, type: "event", title: existing.title, endAt: parseDateTime(existing.end).getTime() },
                  "event"
                );
                close();
              }}
            >
              🎯 开始专注
            </button>
          )}
          <button className="btn" onClick={close}>取消</button>
          <button className="btn btn-primary" onClick={() => void save()}>保存</button>
        </>
      }
    >
      {showScope && (
        <div style={{ marginBottom: 12, padding: 10, background: "var(--accent-soft)", borderRadius: 8, fontSize: 12.5 }}>
          <div style={{ fontWeight: 650, marginBottom: 6 }}>这是一个重复事件，修改范围：</div>
          <Seg
            value={scope}
            onChange={(v) => setScope(v)}
            options={[
              { value: "all", label: "全部事件" },
              { value: "this", label: "仅此事件" },
              { value: "following", label: "所有后续事件" },
            ]}
          />
        </div>
      )}

      <Field label="标题 *">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="事件标题" autoFocus />
      </Field>

      <div className="field-row">
        <Field label="全天">
          <Switch checked={allDay} onChange={setAllDay} />
        </Field>
        <Field label="日历分类">
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="field-row">
        <Field label="开始">
          <div style={{ display: "flex", gap: 6 }}>
            <input className="input" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setEndDate(e.target.value); }} style={{ flex: 1.4 }} />
            {!allDay && <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ flex: 1 }} />}
          </div>
        </Field>
        <Field label="结束">
          <div style={{ display: "flex", gap: 6 }}>
            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ flex: 1.4 }} />
            {!allDay && <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ flex: 1 }} />}
          </div>
        </Field>
      </div>

      <Field label="地点">
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="地点（可选）" />
      </Field>
      <Field label="描述">
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述（可选）" rows={2} />
      </Field>

      <Field label="颜色（不选则跟随分类）">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            className="icon-btn"
            style={{ width: 24, height: 24, borderRadius: "50%", background: "transparent", border: "1.5px dashed var(--border-strong)" }}
            onClick={() => setColor("")}
            title="跟随分类"
          >↺</button>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 24, height: 24, borderRadius: "50%", background: c, border: color === c ? "2.5px solid var(--text)" : "2px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="提醒（可多组）">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {reminders.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>提前</span>
              <input
                className="input" type="number" min={0} max={10080} style={{ width: 90 }}
                value={r.minutes}
                onChange={(e) => setReminders(reminders.map((x, j) => (j === i ? { minutes: Number(e.target.value) || 0 } : x)))}
              />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>分钟</span>
              <button className="icon-btn" onClick={() => setReminders(reminders.filter((_, j) => j !== i))}>🗑️</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[15, 60, 24 * 60, 7 * 24 * 60].map((m) => (
              <button key={m} className="chip" onClick={() => setReminders([...reminders, { minutes: m }])}>
                +{m < 60 ? m + "分钟" : m < 1440 ? m / 60 + "小时" : m / 1440 + "天"}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <Field label="重复">
        {!openRepeatEditor ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="chip" onClick={() => setRepeat({ freq: "daily", interval: 1, endType: "never" })}>每天</button>
            <button className="chip" onClick={() => setRepeat({ freq: "weekly", interval: 1, endType: "never" })}>每周</button>
            <button className="chip" onClick={() => setRepeat({ freq: "monthly", interval: 1, endType: "never" })}>每月</button>
            <button className="chip" onClick={() => setRepeat({ freq: "yearly", interval: 1, endType: "never" })}>每年</button>
            <button className="chip" onClick={() => setRepeat({ freq: "custom", interval: 1, weekdays: [1, 2, 3, 4, 5], endType: "never" })}>工作日</button>
            <button className="chip" onClick={() => setRepeat({ freq: "custom", interval: 1, weekdays: [1], endType: "never" })}>自定义…</button>
            {existing && !existing.repeat && (
              <button className="chip" onClick={() => setRepeat(null)} style={{ opacity: 0.6 }}>不重复</button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
            <div className="field-row">
              <Field label="频率">
                <select
                  className="select"
                  value={repeat!.freq === "custom" ? "custom" : repeat!.freq}
                  onChange={(e) => {
                    const f = e.target.value as RepeatFreq;
                    setRepeat(f === "custom" ? { freq: "custom", interval: 1, weekdays: [1], endType: repeat!.endType } : { ...repeat!, freq: f });
                  }}
                >
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                  <option value="yearly">每年</option>
                  <option value="custom">自定义</option>
                </select>
              </Field>
              <Field label="间隔">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input className="input" type="number" min={1} value={repeat!.interval} style={{ width: 70 }}
                    onChange={(e) => setRepeat({ ...repeat!, interval: Math.max(1, Number(e.target.value) || 1) })} />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {repeat!.freq === "daily" ? "天" : repeat!.freq === "weekly" ? "周" : repeat!.freq === "monthly" ? "个月" : "年"}
                  </span>
                </div>
              </Field>
            </div>
            {repeat!.freq === "custom" && (
              <Field label="每周重复日">
                <div style={{ display: "flex", gap: 5 }}>
                  {WEEKDAYS.map((w) => (
                    <button
                      key={w.v}
                      className={"chip" + (repeat!.weekdays?.includes(w.v) ? " on" : "")}
                      onClick={() => {
                        const cur = repeat!.weekdays ?? [];
                        const next = cur.includes(w.v) ? cur.filter((x) => x !== w.v) : [...cur, w.v];
                        setRepeat({ ...repeat!, weekdays: next.length ? next : [w.v] });
                      }}
                    >{w.l}</button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="结束条件">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  className="select" style={{ width: 130 }}
                  value={repeat!.endType}
                  onChange={(e) => setRepeat({ ...repeat!, endType: e.target.value as RepeatRule["endType"] })}
                >
                  <option value="never">永不</option>
                  <option value="date">指定日期</option>
                  <option value="count">次数之后</option>
                </select>
                {repeat!.endType === "date" && (
                  <input className="input" type="date" value={repeat!.endDate ?? ""}
                    onChange={(e) => setRepeat({ ...repeat!, endDate: e.target.value })} />
                )}
                {repeat!.endType === "count" && (
                  <input className="input" type="number" min={1} style={{ width: 90 }} value={repeat!.endCount ?? 10}
                    onChange={(e) => setRepeat({ ...repeat!, endCount: Math.max(1, Number(e.target.value) || 1) })} />
                )}
                <button className="icon-btn" onClick={() => setRepeat(null)}>✕ 移除</button>
              </div>
            </Field>
          </div>
        )}
      </Field>

      {!existing && (
        <Field label="同时创建为任务">
          <Switch checked={createAsTask} onChange={setCreateAsTask} />
        </Field>
      )}

      {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{error}</div>}
    </Modal>
  );
}
