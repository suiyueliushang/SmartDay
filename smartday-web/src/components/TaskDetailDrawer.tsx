// ============================================================
// 任务详情：右侧抽屉面板（不再是弹窗）
// 修复：旧实现把 useMemo 写在 `if (!task) return null` 之后，
//       导致渲染的 Hook 数量变化 → React error #310 → 整个应用白屏。
//       现在所有 Hook 一律前置，任何 return 都在 Hook 之后。
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { Subtask, Attachment, Priority, Task } from "@/types";
import { uid } from "@/lib/id";
import { fmtDuration, fmtDate, addDays } from "@/lib/date";
import { readFileAsDataUrl } from "@/lib/download";
import { PRIORITY_NAMES } from "./calendar/calendarData";

const MAX_ATTACH = 10 * 1024 * 1024;

export function TaskDetailDrawer() {
  const taskId = useUiStore((s) => s.taskDetailId);
  const closeDrawer = useUiStore((s) => s.openTaskDetail);
  const tasks = useStore((s) => s.tasks);
  const lists = useStore((s) => s.lists);
  const focusSessions = useStore((s) => s.focusSessions);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const toggleComplete = useStore((s) => s.toggleTaskComplete);
  const toggleStar = useStore((s) => s.toggleTaskStar);
  const createList = useStore((s) => s.createList);
  const openFocusPanel = useUiStore((s) => s.openFocusPanel);
  const showToast = useUiStore((s) => s.showToast);

  // Hook 必须全部在组件顶层、任何条件 return 之前
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const task: Task | undefined = useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setNewSubtask("");
    setConfirmDelete(false);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusStats = useMemo(() => {
    const sessions = focusSessions.filter((f) => f.targetId === taskId && f.status === "completed");
    return { count: sessions.length, seconds: sessions.reduce((a, s) => a + (s.actualSeconds ?? 0), 0) };
  }, [focusSessions, taskId]);

  const subtaskStats = useMemo(() => {
    const list = task?.subtasks ?? [];
    return { done: list.filter((s) => s.done).length, total: list.length };
  }, [task?.subtasks]);

  const listName = useMemo(() => lists.find((l) => l.id === task?.listId)?.name ?? "收件箱", [lists, task?.listId]);

  if (!task) return null;

  const update = (patch: Partial<Task>) => void updateTask(task.id, patch);
  const setDue = (offsetDays: number, time?: string) => {
    const d = addDays(new Date(), offsetDays);
    update({ dueDate: fmtDate(d), dueTime: time ?? task.dueTime ?? null });
  };

  const addSubtask = (indent = 0) => {
    const t = newSubtask.trim();
    if (!t) return;
    const st: Subtask = { id: uid(), title: t, done: false, indent, order: task.subtasks.length };
    update({ subtasks: [...task.subtasks, st] });
    setNewSubtask("");
  };

  const addAttachment = async (file: File) => {
    if (file.size > MAX_ATTACH) {
      showToast("附件不能超过 10MB", "error");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    const att: Attachment = { id: uid(), name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl };
    update({ attachments: [...(task.attachments ?? []), att] });
  };

  return (
    <aside className="side-drawer" aria-label="任务详情">
      <div className="side-drawer-head">
        <span className={"task-check" + (task.completed ? " done" : "")} style={{ width: 20, height: 20, flexShrink: 0 }} title="完成" onClick={() => void toggleComplete(task.id)}>✓</span>
        <input ref={titleRef} className="drawer-title" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && update({ title: title.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <button className={"star-btn" + (task.starred ? " on" : "")} title="重要" onClick={() => void toggleStar(task.id)}>{task.starred ? "★" : "☆"}</button>
        <button className="icon-btn" title="关闭详情" onClick={() => closeDrawer(null)}>✕</button>
      </div>

      <div className="side-drawer-body">
        <div className="drawer-stats">
          <span>清单：<b>{listName}</b></span>
          <span>已专注 <b>{focusStats.count}</b> 次</span>
          <span>累计 <b>{fmtDuration(focusStats.seconds)}</b></span>
          {subtaskStats.total > 0 && <span>子步骤 <b>{subtaskStats.done}/{subtaskStats.total}</b></span>}
        </div>

        <button className="btn btn-primary drawer-focus-btn" onClick={() => openFocusPanel({ id: task.id, type: "task", title: task.title }, "pomodoro")}>🎯 开始专注</button>

        <div className="detail-row">
          <span className="label">清单</span>
          <select className="select" value={task.listId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__new__") {
                const name = window.prompt("新清单名称");
                if (name) void createList({ name }).then((l) => update({ listId: l.id }));
                return;
              }
              update({ listId: v });
            }}>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="__new__">＋ 新建清单…</option>
          </select>
        </div>

        <div className="detail-row">
          <span className="label">优先级</span>
          <div className="chip-row">
            {(Object.keys(PRIORITY_NAMES) as Priority[]).map((p) => (
              <button key={p} className={"chip" + (task.priority === p ? " on" : "")} onClick={() => update({ priority: p })}>{PRIORITY_NAMES[p]}</button>
            ))}
          </div>
        </div>

        <div className="detail-row">
          <span className="label">截止</span>
          <div className="chip-row">
            <input className="input" type="date" style={{ width: 140 }} value={task.dueDate ?? ""} onChange={(e) => update({ dueDate: e.target.value || null })} />
            <input className="input" type="time" style={{ width: 104 }} value={task.dueTime ?? ""} onChange={(e) => update({ dueTime: e.target.value || null })} />
          </div>
        </div>
        <div className="chip-row" style={{ marginBottom: 10 }}>
          <button className="chip" onClick={() => setDue(0)}>今天</button>
          <button className="chip" onClick={() => setDue(1, "09:00")}>明天 9:00</button>
          <button className="chip" onClick={() => setDue(((8 - new Date().getDay()) % 7) || 7, "09:00")}>下周一</button>
          {task.dueDate && <button className="chip" onClick={() => update({ dueDate: null, dueTime: null })}>清除</button>}
        </div>

        <div className="detail-row">
          <span className="label">提醒</span>
          <div className="chip-row">
            <input className="input" type="datetime-local" style={{ width: 190 }}
              value={task.remindAt ? new Date(task.remindAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}
              onChange={(e) => update({ remindAt: e.target.value ? new Date(e.target.value).getTime() : null })} />
            {task.remindAt && <button className="chip" onClick={() => update({ remindAt: null })}>清除</button>}
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">备注</div>
          <textarea className="textarea" rows={3} value={notes} placeholder="添加备注…" onChange={(e) => setNotes(e.target.value)} onBlur={() => update({ notes })} />
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">子步骤（{subtaskStats.done}/{subtaskStats.total}）</div>
          {task.subtasks.map((s) => (
            <div key={s.id} className={"subtask" + (s.done ? " done" : "")}>
              {Array.from({ length: s.indent }).map((_, i) => <span key={i} className="indent-space" />)}
              <span className="mini-check" onClick={() => update({ subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })}>✓</span>
              <span style={{ flex: 1 }}>{s.title}</span>
              <button className="icon-btn" title="删除子步骤" onClick={() => update({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}>✕</button>
            </div>
          ))}
          <div className="chip-row" style={{ marginTop: 6 }}>
            <input className="input" placeholder="添加子步骤，回车确认（Tab 缩进）" value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSubtask(0);
                if (e.key === "Tab") { e.preventDefault(); addSubtask(1); }
              }} />
            <button className="btn btn-sm" onClick={() => addSubtask(0)}>添加</button>
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">标签</div>
          <div className="chip-row">
            {task.tags.map((tag) => (
              <span key={tag} className="tag-chip" onClick={() => update({ tags: task.tags.filter((t) => t !== tag) })}>#{tag} ✕</span>
            ))}
            <input className="input" style={{ width: 130 }} placeholder="+ 标签"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const el = e.target as HTMLInputElement;
                  const v = el.value.trim().replace(/^#/, "");
                  if (v) { update({ tags: Array.from(new Set([...task.tags, v])) }); el.value = ""; }
                }
              }} />
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">附件（单个 ≤10MB）</div>
          <div className="chip-row">
            {(task.attachments ?? []).map((a) => (
              <span key={a.id} className="attach-chip">
                {a.type.startsWith("image/") ? "🖼️" : "📄"} {a.name}
                <button className="icon-btn" onClick={() => update({ attachments: (task.attachments ?? []).filter((x) => x.id !== a.id) })}>✕</button>
              </span>
            ))}
            <label className="btn btn-sm" style={{ cursor: "pointer" }}>
              ＋ 附件
              <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void addAttachment(f); e.target.value = ""; }} />
            </label>
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-title">重复</div>
          <div className="chip-row">
            {(["daily", "weekly", "custom", "monthly", "yearly"] as const).map((f) => (
              <button key={f} className={"chip" + (task.repeat?.freq === f ? " on" : "")}
                onClick={() => update({ repeat: task.repeat?.freq === f ? null : { freq: f, interval: 1, endType: "never", ...(f === "custom" ? { weekdays: [1, 3, 5] } : {}) } })}>
                {{ daily: "每天", weekly: "每周", custom: "工作日", monthly: "每月", yearly: "每年" }[f]}
              </button>
            ))}
          </div>
          <div className="drawer-hint">完成后按规则自动续期（可在设置中关闭）</div>
        </div>
      </div>

      <div className="side-drawer-foot">
        {confirmDelete ? (
          <>
            <span style={{ fontSize: 12.5, color: "var(--danger)", alignSelf: "center" }}>确定删除？</span>
            <button className="btn btn-sm btn-danger" onClick={() => { void deleteTask(task.id); closeDrawer(null); }}>确认删除</button>
            <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>取消</button>
          </>
        ) : (
          <>
            <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}>删除任务</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={() => void toggleComplete(task.id)}>{task.completed ? "标记未完成" : "标记完成"}</button>
          </>
        )}
      </div>
    </aside>
  );
}