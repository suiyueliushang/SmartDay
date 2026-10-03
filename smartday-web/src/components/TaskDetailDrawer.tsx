// 任务详情抽屉：子步骤 / 标签 / 附件 / 提醒 / 重复 / 专注入口
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { Modal, Field, Switch } from "./common";
import { Subtask, Attachment, RepeatRule, Priority } from "@/types";
import { uid } from "@/lib/id";
import { fmtDuration } from "@/lib/date";
import { readFileAsDataUrl } from "@/lib/download";
import { PRIORITY_NAMES } from "./calendar/calendarData";

const MAX_ATTACH = 10 * 1024 * 1024;

export function TaskDetailDrawer() {
  const taskId = useUiStore((s) => s.taskDetailId);
  const close = useUiStore((s) => s.openTaskDetail);
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const lists = useStore((s) => s.lists);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const toggleComplete = useStore((s) => s.toggleTaskComplete);
  const focusSessions = useStore((s) => s.focusSessions);
  const openFocusPanel = useUiStore((s) => s.openFocusPanel);
  const showToast = useUiStore((s) => s.showToast);
  const settings = useStore((s) => s.settings);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setNewSubtask("");
    setConfirmDelete(false);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null;

  const focusStats = useMemo(() => {
    const sessions = focusSessions.filter((f) => f.targetId === task.id && f.status === "completed");
    return {
      count: sessions.length,
      seconds: sessions.reduce((a, s) => a + (s.actualSeconds ?? 0), 0),
    };
  }, [focusSessions, task.id]);

  const update = (patch: Partial<typeof task>) => void updateTask(task.id, patch);

  const addSubtask = () => {
    const t = newSubtask.trim();
    if (!t) return;
    const st: Subtask = { id: uid(), title: t, done: false, indent: 0, order: task.subtasks.length };
    update({ subtasks: [...task.subtasks, st] });
    setNewSubtask("");
  };

  const toggleSubtask = (id: string) => {
    update({ subtasks: task.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
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
    <Modal open onClose={() => close(null)} title={task.completed ? "任务（已完成）" : "任务详情"} width="lg">
      <div className="task-detail" style={{ width: "100%" }}>
        {/* 头部操作 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span
            className={"task-check" + (task.completed ? " done-pop" : "")}
            style={{ width: 22, height: 22, cursor: "pointer" }}
            onClick={() => void toggleComplete(task.id)}
          >✓</span>
          <input
            className="input"
            style={{ flex: 1, fontSize: 15, fontWeight: 650 }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && update({ title: title.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <button className={"star-btn" + (task.starred ? " on" : "")} onClick={() => void useStore.getState().toggleTaskStar(task.id)} title="重要">
            {task.starred ? "★" : "☆"}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => openFocusPanel({ id: task.id, type: "task", title: task.title }, "pomodoro")}>
            🎯 开始专注
          </button>
        </div>

        {/* 专注统计 */}
        <div style={{ display: "flex", gap: 16, padding: "8px 0", marginBottom: 8, color: "var(--text-secondary)", fontSize: 12.5 }}>
          <span>已专注 <b style={{ color: "var(--accent)" }}>{focusStats.count}</b> 次</span>
          <span>累计 <b style={{ color: "var(--accent)" }}>{fmtDuration(focusStats.seconds)}</b></span>
        </div>

        {/* 基本字段 */}
        <div className="detail-row">
          <span className="label">清单</span>
          <select className="select" value={task.listId} onChange={(e) => update({ listId: e.target.value })}>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="detail-row">
          <span className="label">优先级</span>
          <div style={{ display: "flex", gap: 5 }}>
            {(Object.keys(PRIORITY_NAMES) as Priority[]).map((p) => (
              <button key={p} className={"chip" + (task.priority === p ? " on" : "")} onClick={() => update({ priority: p })}>
                {PRIORITY_NAMES[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="detail-row">
          <span className="label">截止日期</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" type="date" style={{ width: 160 }} value={task.dueDate ?? ""} onChange={(e) => update({ dueDate: e.target.value || null })} />
            <input className="input" type="time" style={{ width: 110 }} value={task.dueTime ?? ""} onChange={(e) => update({ dueTime: e.target.value || null })} />
          </div>
        </div>
        <div className="detail-row">
          <span className="label">提醒时间</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input" type="datetime-local" style={{ width: 220 }}
              value={task.remindAt ? new Date(task.remindAt).toISOString().slice(0, 16) : ""}
              onChange={(e) => update({ remindAt: e.target.value ? new Date(e.target.value).getTime() : null })}
            />
            <button className="chip" onClick={() => {
              const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
              update({ remindAt: d.getTime() });
            }}>明早 9:00</button>
            <button className="chip" onClick={() => {
              const d = new Date(); d.setDate(d.getDate() + (7 - d.getDay() + 1) % 7 || 7); d.setHours(9, 0, 0, 0);
              const nextMon = new Date(); const diff = (1 - nextMon.getDay() + 7) % 7 || 7; nextMon.setDate(nextMon.getDate() + diff); nextMon.setHours(9, 0, 0, 0);
              update({ remindAt: nextMon.getTime() });
            }}>下周一</button>
          </div>
        </div>

        {/* 备注 */}
        <div style={{ margin: "10px 0" }}>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 5 }}>备注</div>
          <textarea
            className="textarea"
            rows={3}
            value={notes}
            placeholder="添加备注…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => update({ notes })}
          />
        </div>

        {/* 子步骤 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 5 }}>
            子步骤（{task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}）
          </div>
          {task.subtasks.map((s) => (
            <div key={s.id} className={"subtask" + (s.done ? " done" : "")}>
              {Array.from({ length: s.indent }).map((_, i) => <span key={i} className="indent-space" />)}
              <span className="mini-check" onClick={() => toggleSubtask(s.id)}>✓</span>
              <span style={{ flex: 1 }}>{s.title}</span>
              <button className="icon-btn" onClick={() => update({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}>🗑️</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input
              className="input" placeholder="添加子步骤（Tab 可缩进）"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSubtask();
                if (e.key === "Tab") {
                  e.preventDefault();
                  const t = newSubtask.trim();
                  if (!t) return;
                  const st: Subtask = { id: uid(), title: t, done: false, indent: 1, order: task.subtasks.length };
                  update({ subtasks: [...task.subtasks, st] });
                  setNewSubtask("");
                }
              }}
            />
            <button className="btn" onClick={addSubtask}>添加</button>
          </div>
        </div>

        {/* 标签 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 5 }}>标签</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {task.tags.map((tag) => (
              <span key={tag} className="tag-chip" onClick={() => update({ tags: task.tags.filter((t) => t !== tag) })}>
                #{tag} ✕
              </span>
            ))}
            <TagInput onAdd={(tag) => update({ tags: [...new Set([...task.tags, tag])] })} />
          </div>
        </div>

        {/* 附件 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 5 }}>附件（≤10MB）</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {(task.attachments ?? []).map((a) => (
              <span key={a.id} className="attach-chip">
                {a.type.startsWith("image/") ? "🖼️" : "📄"} {a.name}
                {a.dataUrl && a.type.startsWith("image/") && (
                  <img src={a.dataUrl} alt={a.name} style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
                )}
                <button className="icon-btn" onClick={() => update({ attachments: (task.attachments ?? []).filter((x) => x.id !== a.id) })}>✕</button>
              </span>
            ))}
            <label className="btn btn-sm" style={{ cursor: "pointer" }}>
              ＋ 附件
              <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void addAttachment(f); e.target.value = ""; }} />
            </label>
          </div>
        </div>

        {/* 重复 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 5 }}>重复规则</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["daily", "weekly", "custom", "monthly", "yearly"] as const).map((f) => (
              <button
                key={f}
                className={"chip" + (task.repeat?.freq === f ? " on" : "")}
                onClick={() => update({
                  repeat: task.repeat?.freq === f ? null : { freq: f, interval: 1, endType: "never", ...(f === "custom" ? { weekdays: [1, 3, 5] } : {}) },
                })}
              >
                {{ daily: "每天", weekly: "每周", custom: "工作日", monthly: "每月", yearly: "每年" }[f]}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>完成后自动续期（可在设置中关闭）</div>
        </div>

        {/* 删除 */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          {confirmDelete ? (
            <>
              <span style={{ fontSize: 12.5, color: "var(--danger)", alignSelf: "center" }}>确定删除？</span>
              <button className="btn btn-danger btn-sm" onClick={() => { void deleteTask(task.id); close(null); }}>确认删除</button>
              <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>取消</button>
            </>
          ) : (
            <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}>删除任务</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TagInput(props: { onAdd: (tag: string) => void }) {
  const [v, setV] = useState("");
  return (
    <input
      className="input" placeholder="+ 添加标签"
      style={{ width: 120, padding: "4px 9px", fontSize: 12 }}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim()) {
          props.onAdd(v.trim().replace(/^#/, ""));
          setV("");
        }
      }}
      onBlur={() => { if (v.trim()) { props.onAdd(v.trim().replace(/^#/, "")); setV(""); } }}
    />
  );
}
