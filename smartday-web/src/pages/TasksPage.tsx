// ============================================================
// 任务页：智能清单 + 自定义清单分组 + 排序筛选 + 快速创建
// ============================================================
import React, { useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { useRoute } from "@/lib/router";
import { Task, TaskList, BuiltinListType, Priority } from "@/types";
import { todayStr, fmtDate, parseDate, startOfWeek, diffDays } from "@/lib/date";
import { Modal, Field, Menu, useContextMenu } from "@/components/common";
import { PRIORITY_NAMES } from "@/components/calendar/calendarData";

type SortKey = "manual" | "importance" | "due" | "priority" | "createdAsc" | "createdDesc";
interface FilterState {
  status: "all" | "open" | "done";
  priorities: Priority[];
  dateFrom: string;
  dateTo: string;
}
const EMPTY_FILTER: FilterState = { status: "all", priorities: [], dateFrom: "", dateTo: "" };

export function TasksPage() {
  const route = useRoute();
  const activeList = route.listId ?? "list-all";
  const [sortKey, setSortKey] = useState<SortKey>("manual");
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <div className="page page-wide">
      <div className="tasks-layout">
        <ListPanel active={activeList} />
        <div className="task-main">
          <TaskToolbar listId={activeList} sortKey={sortKey} setSortKey={setSortKey} onFilter={() => setFilterOpen(!filterOpen)} filterActive={filterOpen} />
          <FilterBar filter={filter} setFilter={setFilter} open={filterOpen} />
          <QuickAdd listId={activeList} />
          <ListHeader listId={activeList} />
          <TaskListBox listId={activeList} sortKey={sortKey} filter={filter} />
          <MyDaySuggestions listId={activeList} />
        </div>
      </div>
    </div>
  );
}

// ---------------- 清单面板 ----------------
function ListPanel(props: { active: string }) {
  const lists = useStore((s) => s.lists);
  const groups = useStore((s) => s.groups);
  const tasks = useStore((s) => s.tasks);
  const updateList = useStore((s) => s.updateList);
  const deleteList = useStore((s) => s.deleteList);
  const createList = useStore((s) => s.createList);
  const createGroup = useStore((s) => s.createGroup);
  const [newListName, setNewListName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const { pos, open, close } = useContextMenu();
  const [menuList, setMenuList] = useState<TaskList | null>(null);

  const smartLists = lists.filter((l) => l.builtin);
  const customLists = lists.filter((l) => !l.builtin).sort((a, b) => a.order - b.order);

  const countFor = (list: TaskList): number => {
    const t = tasks.filter((x) => !x.completed);
    switch (list.builtin) {
      case "myday": return t.filter((x) => x.inMyDay === todayStr()).length;
      case "important": return t.filter((x) => x.starred).length;
      case "planned": return t.filter((x) => x.dueDate).length;
      case "all": return t.length;
      case "completed": return tasks.filter((x) => x.completed).length;
      default: return t.filter((x) => x.listId === list.id).length;
    }
  };

  const iconFor = (l: TaskList) => {
    if (!l.builtin) return <span className="list-ico">🗂️</span>;
    return ({
      myday: <span className="list-ico">☀️</span>,
      important: <span className="list-ico">⭐</span>,
      planned: <span className="list-ico">📅</span>,
      all: <span className="list-ico">📋</span>,
      completed: <span className="list-ico">✅</span>,
    }[l.builtin] ?? <span className="list-ico">🗂️</span>);
  };

  const go = (id: string) => {
    location.hash = "#/tasks" + (id === "list-all" ? "" : "/list:" + id);
  };

  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  return (
    <div className="task-list-panel" style={{ maxHeight: "calc(100vh - 130px)" }}>
      {smartLists.map((l) => (
        <div key={l.id} className={"list-item" + (props.active === l.id ? " active" : "")} onClick={() => go(l.id)}>
          {iconFor(l)}
          <span style={{ flex: 1 }}>{l.name}</span>
          <span className="count">{countFor(l)}</span>
        </div>
      ))}
      <div style={{ height: 10 }} />
      {sortedGroups.map((g) => (
        <React.Fragment key={g.id}>
          <div
            className={"group-title" + (g.collapsed ? " collapsed" : "")}
            onClick={() => void useStore.getState().updateGroup(g.id, { collapsed: !g.collapsed })}
            onContextMenu={(e) => {
              e.preventDefault();
              if (window.confirm("删除分组「" + g.name + "」？（其中的清单会移到未分组）")) {
                void useStore.getState().deleteGroup(g.id);
              }
            }}
          >
            <span className="arrow">▼</span>
            <span style={{ flex: 1 }}>{g.name}</span>
          </div>
          {!g.collapsed && customLists.filter((l) => l.groupId === g.id).map((l) => (
            <div
              key={l.id} className={"list-item" + (props.active === l.id ? " active" : "")} onClick={() => go(l.id)}
              onContextMenu={(e) => { open(e); setMenuList(l); }}
            >
              {iconFor(l)}<span style={{ flex: 1 }}>{l.name}</span><span className="count">{countFor(l)}</span>
            </div>
          ))}
        </React.Fragment>
      ))}
      {customLists.filter((l) => !l.groupId).map((l) => (
        <div
          key={l.id} className={"list-item" + (props.active === l.id ? " active" : "")} onClick={() => go(l.id)}
          onContextMenu={(e) => { open(e); setMenuList(l); }}
        >
          {iconFor(l)}<span style={{ flex: 1 }}>{l.name}</span><span className="count">{countFor(l)}</span>
        </div>
      ))}

      <div style={{ display: "flex", gap: 6, padding: "10px 6px 2px" }}>
        <input
          className="input" placeholder="新建清单…" style={{ flex: 1, padding: "6px 10px", fontSize: 12.5 }}
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newListName.trim()) {
              void createList({ name: newListName.trim() }).then((l) => go(l.id));
              setNewListName("");
            }
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, padding: "6px" }}>
        <input
          className="input" placeholder="新建分组…" style={{ flex: 1, padding: "6px 10px", fontSize: 12.5 }}
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newGroupName.trim()) { void createGroup({ name: newGroupName.trim() }); setNewGroupName(""); } }}
        />
      </div>

      {pos && menuList && (
        <Menu
          x={pos.x} y={pos.y} onClose={close}
          items={[
            { label: "📝 重命名", onClick: () => { const name = window.prompt("清单名称", menuList.name); if (name) void updateList(menuList.id, { name }); } },
            {
              label: "📦 移动到分组…", onClick: () => {
                const name = window.prompt("输入分组名（留空 = 移出分组）", groups.find((g) => g.id === menuList.groupId)?.name ?? "");
                if (name === null) return;
                if (!name) { void updateList(menuList.id, { groupId: null }); return; }
                const g = groups.find((x) => x.name === name);
                if (g) void updateList(menuList.id, { groupId: g.id });
                else void createGroup({ name }).then((ng) => void updateList(menuList.id, { groupId: ng.id }));
              },
            },
            { divider: true },
            { label: "🗑️ 删除清单（任务移回收件箱）", danger: true, onClick: () => void deleteList(menuList.id, { deleteTasks: false }) },
            { label: "🔥 删除清单并删除任务", danger: true, onClick: () => { if (window.confirm("将一并删除该清单下的所有任务，确定？")) void deleteList(menuList.id, { deleteTasks: true }); } },
          ]}
        />
      )}
    </div>
  );
}

// ---------------- 工具栏 ----------------
function TaskToolbar(props: { listId: string; sortKey: SortKey; setSortKey: (k: SortKey) => void; onFilter: () => void; filterActive: boolean }) {
  const lists = useStore((s) => s.lists);
  const list = lists.find((l) => l.id === props.listId);
  return (
    <div className="task-toolbar">
      <h2>{list?.name ?? "任务"}</h2>
      <select className="select" style={{ width: 150 }} value={props.sortKey} onChange={(e) => props.setSortKey(e.target.value as SortKey)}>
        <option value="manual">手动排序</option>
        <option value="importance">按重要性</option>
        <option value="due">按截止日期</option>
        <option value="priority">按优先级</option>
        <option value="createdAsc">按创建时间（旧→新）</option>
        <option value="createdDesc">按创建时间（新→旧）</option>
      </select>
      <button className={"btn btn-sm" + (props.filterActive ? " btn-primary" : "")} onClick={props.onFilter}>筛选</button>
    </div>
  );
}

// ---------------- 筛选栏 ----------------
function FilterBar(props: { filter: FilterState; setFilter: (f: FilterState) => void; open: boolean }) {
  const f = props.filter;
  const set = props.setFilter;
  if (!props.open) return null;
  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12.5 }}>状态</span>
        <select className="select" style={{ width: 110 }} value={f.status} onChange={(e) => set({ ...f, status: e.target.value as FilterState["status"] })}>
          <option value="all">全部</option>
          <option value="open">未完成</option>
          <option value="done">已完成</option>
        </select>
        <span style={{ fontSize: 12.5 }}>优先级</span>
        {(Object.keys(PRIORITY_NAMES) as Priority[]).map((p) => (
          <button
            key={p} className={"chip" + (f.priorities.includes(p) ? " on" : "")}
            onClick={() => set({ ...f, priorities: f.priorities.includes(p) ? f.priorities.filter((x) => x !== p) : [...f.priorities, p] })}
          >{PRIORITY_NAMES[p]}</button>
        ))}
        <span style={{ fontSize: 12.5 }}>截止</span>
        <input className="input" type="date" style={{ width: 130 }} value={f.dateFrom} onChange={(e) => set({ ...f, dateFrom: e.target.value })} />
        <span style={{ color: "var(--text-muted)" }}>至</span>
        <input className="input" type="date" style={{ width: 130 }} value={f.dateTo} onChange={(e) => set({ ...f, dateTo: e.target.value })} />
        <button className="btn btn-sm btn-ghost" onClick={() => set(EMPTY_FILTER)}>清除</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>💡 不同条件之间为“且”，同一条件内为“或”</div>
    </div>
  );
}

// ---------------- 快速创建 ----------------
function QuickAdd(props: { listId: string }) {
  const createTask = useStore((s) => s.createTask);
  const [text, setText] = useState("");
  return (
    <div className="quick-add">
      <input
        className="input" placeholder="快速添加任务，回车创建…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            void createTask({ title: text.trim(), listId: props.listId === "list-all" ? "list-inbox" : props.listId });
            setText("");
          }
        }}
      />
    </div>
  );
}

// ---------------- 清单头（我的一天 / 已完成） ----------------
function ListHeader(props: { listId: string }) {
  const lists = useStore((s) => s.lists);
  const clearCompleted = useStore((s) => s.clearCompletedTasks);
  const builtin = lists.find((l) => l.id === props.listId)?.builtin;
  if (builtin === "myday") {
    const quotes = ["把最重要的事，放在今天。", "今日事，今日毕。", "一点一滴，成就自己。", "专注当下，未来可期。"];
    const quote = quotes[new Date().getDate() % quotes.length];
    const d = new Date();
    return (
      <div style={{ margin: "4px 0 10px", fontSize: 12.5, color: "var(--text-muted)" }}>
        <b style={{ color: "var(--text-secondary)" }}>{d.getFullYear()}年{d.getMonth() + 1}月{d.getDate()}日</b>
        <span style={{ marginLeft: 8 }}>{["日", "一", "二", "三", "四", "五", "六"][d.getDay()] === "日" ? "星期日" : "星期" + ["日", "一", "二", "三", "四", "五", "六"][d.getDay()]}</span>
        <span style={{ marginLeft: 10 }}>✨ {quote}</span>
      </div>
    );
  }
  if (builtin === "completed") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={() => { if (window.confirm("清除所有已完成任务？")) void clearCompleted(); }}>
          清除所有已完成
        </button>
      </div>
    );
  }
  return null;
}

// ---------------- 我的一天建议 ----------------
function MyDaySuggestions(props: { listId: string }) {
  const tasks = useStore((s) => s.tasks);
  const moveToMyDay = useStore((s) => s.moveTaskToMyDay);
  const builtin = useStore((s) => s.lists.find((l) => l.id === props.listId)?.builtin);
  if (builtin !== "myday") return null;
  const inMyDay = new Set(tasks.filter((t) => t.inMyDay === todayStr()).map((t) => t.id));
  const suggestions = tasks
    .filter((t) => !t.completed && !inMyDay.has(t.id) && (t.dueDate === todayStr() || t.starred))
    .slice(0, 4);
  if (!suggestions.length) return null;
  return (
    <div className="card" style={{ marginTop: 14, padding: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 6 }}>💡 建议加入今天</div>
      {suggestions.map((t) => (
        <div key={t.id} className="list-item" style={{ cursor: "pointer" }} onClick={() => void moveToMyDay(t.id)}>
          <span style={{ flex: 1 }}>{t.title}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.dueDate === todayStr() ? "今天到期" : "重要"}</span>
          <button className="btn btn-sm">＋ 加入</button>
        </div>
      ))}
    </div>
  );
}

// ---------------- 任务列表 ----------------
function TaskListBox(props: { listId: string; sortKey: SortKey; filter: FilterState }) {
  const tasks = useStore((s) => s.tasks);
  const lists = useStore((s) => s.lists);
  const [dragId, setDragId] = useState<string | null>(null);

  const computed = useMemo(() => {
    let base = tasks;
    const smart = lists.find((l) => l.id === props.listId)?.builtin as BuiltinListType | undefined;
    switch (smart) {
      case "myday": base = tasks.filter((t) => t.inMyDay === todayStr()); break;
      case "important": base = tasks.filter((t) => t.starred && !t.completed); break;
      case "planned": base = tasks.filter((t) => t.dueDate && !t.completed); break;
      case "completed": base = tasks.filter((t) => t.completed); break;
      case "all": base = tasks.filter((t) => !t.completed); break;
      default: base = tasks.filter((t) => t.listId === props.listId);
    }
    // 筛选（多条件且、同类或）
    const f = props.filter;
    if (f.status === "open") base = base.filter((t) => !t.completed);
    if (f.status === "done") base = base.filter((t) => t.completed);
    if (f.priorities.length) base = base.filter((t) => f.priorities.includes(t.priority));
    if (f.dateFrom) base = base.filter((t) => t.dueDate && t.dueDate >= f.dateFrom);
    if (f.dateTo) base = base.filter((t) => t.dueDate && t.dueDate <= f.dateTo);

    const sorted = [...base];
    switch (props.sortKey) {
      case "importance": sorted.sort((a, b) => Number(b.starred) - Number(a.starred) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")); break;
      case "due": sorted.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.dueTime ?? "").localeCompare(b.dueTime ?? "")); break;
      case "priority": { const rank = { high: 0, medium: 1, low: 2, none: 3 }; sorted.sort((a, b) => rank[a.priority] - rank[b.priority]); break; }
      case "createdAsc": sorted.sort((a, b) => a.createdAt - b.createdAt); break;
      case "createdDesc": sorted.sort((a, b) => b.createdAt - a.createdAt); break;
      default: sorted.sort((a, b) => a.order - b.order);
    }
    if (smart === "planned") return { groups: groupPlanned(sorted), items: [] };
    if (smart === "completed") return { groups: groupCompleted(sorted), items: [] };
    if (smart === "all") return { groups: groupByList(sorted, lists), items: [] };
    return { groups: null, items: sorted };
  }, [tasks, props.listId, props.sortKey, props.filter, lists]);

  const reorder = (fromId: string, toId: string) => {
    if (props.sortKey !== "manual") return;
    const items = tasks.filter((t) => !t.completed && t.listId === props.listId).sort((a, b) => a.order - b.order);
    const from = items.findIndex((t) => t.id === fromId);
    const to = items.findIndex((t) => t.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    items.splice(to, 0, items.splice(from, 1)[0]);
    void useStore.getState().reorderTasks(items.map((t) => t.id));
  };

  return (
    <div className="task-list">
      {computed.groups
        ? computed.groups.map((g) => (
          <React.Fragment key={g.label}>
            <div className="agenda-day" style={{ marginTop: 10, fontSize: 12.5 }}>
              {g.label}
              {g.overdueCount ? <span className="badge red">{g.overdueCount} 过期</span> : null}
              <span className="line" />
            </div>
            {g.items.map((t) => (
              <TaskItem key={t.id} task={t} dragId={dragId} setDragId={setDragId} onDrop={(fromId) => reorder(fromId, t.id)} showList={props.listId === "list-all"} />
            ))}
          </React.Fragment>
        ))
        : computed.items.map((t) => (
          <TaskItem key={t.id} task={t} dragId={dragId} setDragId={setDragId} onDrop={(fromId) => reorder(fromId, t.id)} showList={false} />
        ))}
      {!computed.groups && !computed.items.length && (
        <div className="empty" style={{ padding: 28 }}>这里还没有任务 ✨</div>
      )}
    </div>
  );
}

// ---------------- 任务项 ----------------
function TaskItem(props: { task: Task; dragId: string | null; setDragId: (id: string | null) => void; onDrop: (fromId: string) => void; showList: boolean }) {
  const { task } = props;
  const toggle = useStore((s) => s.toggleTaskComplete);
  const star = useStore((s) => s.toggleTaskStar);
  const deleteTask = useStore((s) => s.deleteTask);
  const moveToMyDay = useStore((s) => s.moveTaskToMyDay);
  const lists = useStore((s) => s.lists);
  const updateTask = useStore((s) => s.updateTask);
  const ui = useUiStore();
  const { pos, open, close } = useContextMenu();

  const overdue = !!task.dueDate && !task.completed && parseDate(task.dueDate).getTime() < parseDate(todayStr()).getTime();
  const dueText = task.dueDate
    ? (fmtDate(parseDate(task.dueDate)) === todayStr() ? "今天" : task.dueDate.slice(5)) + (task.dueTime ? " " + task.dueTime : "")
    : "";

  return (
    <div
      className={"task-item" + (task.completed ? " done" : "") + (props.dragId === task.id ? " dragging" : "")}
      onClick={() => ui.openTaskDetail(task.id)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); open(e); }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); props.onDrop(task.id); }}
      draggable={!task.completed}
      onDragStart={(e) => { props.setDragId(task.id); e.dataTransfer.setData("text/plain", task.id); }}
      onDragEnd={() => props.setDragId(null)}
    >
      <span className={"task-check" + (task.completed ? " done-pop" : "")} onClick={(e) => { e.stopPropagation(); void toggle(task.id); }} title="完成">✓</span>
      <div className="task-body">
        <div className="task-title">
          {task.title}
          {task.subtasks.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>
              ({task.subtasks.filter((s) => s.done).length}/{task.subtasks.length})
            </span>
          )}
        </div>
        <div className="task-meta">
          <span className={"pri pri-" + task.priority}>{PRIORITY_NAMES[task.priority]}</span>
          {dueText && <span style={{ color: overdue ? "var(--danger)" : "inherit" }}>📅 {dueText}{overdue ? "（已过期）" : ""}</span>}
          {task.remindAt != null && <span>⏰ {new Date(task.remindAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
          {task.repeat && <span>🔁 {repeatLabel(task.repeat.freq)}</span>}
          {task.tags.map((t) => <span key={t} className="tag-chip" style={{ fontSize: 10 }}>#{t}</span>)}
          {props.showList && <span style={{ color: "var(--text-muted)" }}>{lists.find((l) => l.id === task.listId)?.name}</span>}
          {task.attachments?.length ? <span>📎</span> : null}
        </div>
      </div>
      <button className={"star-btn" + (task.starred ? " on" : "")} onClick={(e) => { e.stopPropagation(); void star(task.id); }} title="重要">
        {task.starred ? "★" : "☆"}
      </button>
      <span className="drag-handle" title="拖拽排序">⠿</span>

      {pos && (
        <Menu
          x={pos.x} y={pos.y} onClose={close}
          items={[
            {
              label: "📦 移动到清单…", onClick: () => {
                const name = window.prompt("目标清单名：\n" + lists.filter((l) => !l.builtin).map((l) => l.name).join(" / "));
                if (name) {
                  const target = lists.find((l) => l.name === name && !l.builtin);
                  if (target) void updateTask(task.id, { listId: target.id });
                  else void useStore.getState().createList({ name }).then((nl) => void updateTask(task.id, { listId: nl.id }));
                }
              },
            },
            {
              label: task.inMyDay === todayStr() ? "☀️ 从「我的一天」移除" : "☀️ 添加到我的一天",
              onClick: () => void (task.inMyDay === todayStr() ? updateTask(task.id, { inMyDay: null }) : moveToMyDay(task.id)),
            },
            { label: "🎯 开始专注", onClick: () => useUiStore.getState().openFocusPanel({ id: task.id, type: "task", title: task.title }) },
            { divider: true },
            { label: "🗑️ 删除", danger: true, onClick: () => { if (window.confirm("删除任务「" + task.title + "」？")) void deleteTask(task.id); } },
          ]}
        />
      )}
    </div>
  );
}

function repeatLabel(freq: string): string {
  return ({ daily: "每天", weekly: "每周", custom: "工作日", monthly: "每月", yearly: "每年" } as Record<string, string>)[freq] ?? "重复";
}

// ---------------- 分组逻辑 ----------------
function groupPlanned(items: Task[]): Array<{ label: string; items: Task[]; overdueCount?: number }> {
  const today = parseDate(todayStr());
  const groups: Array<{ label: string; items: Task[]; overdueCount: number }> = [
    { label: "已过期", items: [], overdueCount: 0 },
    { label: "今天", items: [], overdueCount: 0 },
    { label: "明天", items: [], overdueCount: 0 },
    { label: "本周", items: [], overdueCount: 0 },
    { label: "以后", items: [], overdueCount: 0 },
  ];
  for (const t of items) {
    const d = parseDate(t.dueDate!);
    const diff = diffDays(d, today);
    if (diff < 0) groups[0].items.push(t);
    else if (diff === 0) groups[1].items.push(t);
    else if (diff === 1) groups[2].items.push(t);
    else if (d.getTime() < startOfWeek(today, 1).getTime() + 7 * 86400000) groups[3].items.push(t);
    else groups[4].items.push(t);
  }
  return groups.filter((g) => g.items.length);
}

function groupCompleted(items: Task[]): Array<{ label: string; items: Task[]; overdueCount?: number }> {
  const today = parseDate(todayStr());
  const groups: Array<{ label: string; items: Task[] }> = [
    { label: "今天", items: [] },
    { label: "昨天", items: [] },
    { label: "更早", items: [] },
  ];
  for (const t of items) {
    const d = t.completedAt ? parseDate(fmtDate(new Date(t.completedAt))) : today;
    const diff = diffDays(today, d);
    if (diff === 0) groups[0].items.push(t);
    else if (diff === 1) groups[1].items.push(t);
    else groups[2].items.push(t);
  }
  return groups.filter((g) => g.items.length);
}

function groupByList(items: Task[], lists: TaskList[]): Array<{ label: string; items: Task[]; overdueCount?: number }> {
  const m = new Map<string, Task[]>();
  for (const t of items) {
    const name = lists.find((l) => l.id === t.listId)?.name ?? "未分类";
    if (!m.has(name)) m.set(name, []);
    m.get(name)!.push(t);
  }
  return [...m.entries()].map(([label, items]) => ({ label, items }));
}
