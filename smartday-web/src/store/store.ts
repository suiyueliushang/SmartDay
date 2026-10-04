// ============================================================
// 全局数据仓库（zustand）：内存态 + IndexedDB 持久化
// ============================================================
import { create } from "zustand";
import { repos } from "@/db/indexeddb";
import {
  Settings, DEFAULT_SETTINGS, CalendarCategory, CalendarEvent, Task, TaskList, TaskGroup,
  Diary, Note, Anniversary, FocusSession, AppNotification, Priority, RepeatRule, BaseEntity,
} from "@/types";
import { uid } from "@/lib/id";
import { todayStr, fmtDate, parseDate, addDays } from "@/lib/date";
import { nextTaskDue } from "@/lib/recurrence";
import { broadcastDataChanged } from "@/lib/broadcast";
import { sendPushAll, activeChannels, migratePush, logPush } from "@/lib/push";
import { isQuietTime } from "@/lib/reminderEngine";

// ---------- 种子数据 ----------
function seedCategories(): CalendarCategory[] {
  const now = Date.now();
  const mk = (name: string, color: string, order: number, isDefault = false): CalendarCategory => ({
    id: uid(), name, color, isDefault, visible: true, order, createdAt: now, updatedAt: now,
  });
  return [mk("默认", "#4f6ef7", 0, true), mk("工作", "#f97316", 1), mk("生活", "#22c55e", 2)];
}
function seedLists(): TaskList[] {
  const now = Date.now();
  const mk = (name: string, builtin: TaskList["builtin"], order: number): TaskList => ({
    id: "list-" + builtin, name, builtin, order, createdAt: now, updatedAt: now,
  });
  const inbox: TaskList = { id: "list-inbox", name: "收件箱", builtin: null, order: 100, createdAt: now, updatedAt: now };
  return [
    mk("我的一天", "myday", 0),
    mk("重要", "important", 1),
    mk("计划内", "planned", 2),
    mk("全部", "all", 3),
    mk("已完成", "completed", 4),
    inbox,
  ];
}

interface Snapshot {
  events: CalendarEvent[];
  tasks: Task[];
}

interface DataState {
  ready: boolean;
  settings: Settings;
  categories: CalendarCategory[];
  events: CalendarEvent[];
  lists: TaskList[];
  groups: TaskGroup[];
  tasks: Task[];
  diaries: Diary[];
  notes: Note[];
  anniversaries: Anniversary[];
  focusSessions: FocusSession[];
  notifications: AppNotification[];
  reminderKeys: Set<string>;
  syncDirty: boolean;
  lastSyncAt: number | null;

  // undo/redo
  undoStack: Snapshot[];
  redoStack: Snapshot[];

  init(): Promise<void>;
  /** 从 IndexedDB 重新读取全部数据（跨窗口同步用，不触发广播） */
  reloadFromDb(): Promise<void>;
  pushUndo(): void;
  undo(): void;
  redo(): void;

  updateSettings(patch: Partial<Settings> | ((s: Settings) => Settings)): Promise<void>;

  createCategory(data: Partial<CalendarCategory>): Promise<void>;
  updateCategory(id: string, patch: Partial<CalendarCategory>): Promise<void>;
  deleteCategory(id: string): Promise<void>;

  createEvent(data: Partial<CalendarEvent>): Promise<void>;
  updateEvent(id: string, patch: Partial<CalendarEvent>): Promise<void>;
  updateEventBulk(events: CalendarEvent[]): Promise<void>;
  deleteEvent(id: string): Promise<void>;

  createList(data: Partial<TaskList>): Promise<TaskList>;
  updateList(id: string, patch: Partial<TaskList>): Promise<void>;
  deleteList(id: string, opts?: { deleteTasks?: boolean }): Promise<void>;
  createGroup(data: Partial<TaskGroup>): Promise<TaskGroup>;
  updateGroup(id: string, patch: Partial<TaskGroup>): Promise<void>;
  deleteGroup(id: string): Promise<void>;

  createTask(data: Partial<Task>): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(id: string): Promise<void>;
  toggleTaskComplete(id: string): Promise<void>;
  toggleTaskStar(id: string): Promise<void>;
  reorderTasks(orderedIds: string[]): Promise<void>;
  moveTaskToMyDay(id: string): Promise<void>;
  clearCompletedTasks(): Promise<void>;
  addToMyDayToday(): Promise<void>;

  upsertDiary(diary: Partial<Diary> & { date: string }): Promise<Diary>;
  deleteDiary(id: string): Promise<void>;
  upsertNote(note: Partial<Note>): Promise<Note>;
  deleteNote(id: string): Promise<void>;

  createAnniversary(data: Partial<Anniversary>): Promise<void>;
  updateAnniversary(id: string, patch: Partial<Anniversary>): Promise<void>;
  deleteAnniversary(id: string): Promise<void>;

  createFocusSession(s: Partial<FocusSession>): Promise<FocusSession>;
  updateFocusSession(id: string, patch: Partial<FocusSession>): Promise<void>;
  deleteFocusSession(id: string): Promise<void>;

  addNotifications(items: Omit<AppNotification, "id" | "createdAt" | "updatedAt">[]): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  removeNotification(id: string): Promise<void>;
  clearReadNotifications(): Promise<void>;
  logReminderKeys(keys: string[]): Promise<void>;
  cleanupOldNotifications(): Promise<void>;

  markSyncDirty(): void;
  resetAll(): Promise<void>;
}

/** 合并默认设置，兼容旧数据/缺字段 */
export function mergeSettings(raw?: Partial<Settings> | null): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    general: { ...DEFAULT_SETTINGS.general, ...(raw?.general ?? {}) },
    calendar: { ...DEFAULT_SETTINGS.calendar, ...(raw?.calendar ?? {}) },
    task: { ...DEFAULT_SETTINGS.task, ...(raw?.task ?? {}) },
    diary: { ...DEFAULT_SETTINGS.diary, ...(raw?.diary ?? {}) },
    reminder: { ...DEFAULT_SETTINGS.reminder, ...(raw?.reminder ?? {}) },
    focus: { ...DEFAULT_SETTINGS.focus, ...(raw?.focus ?? {}) },
    sync: { ...DEFAULT_SETTINGS.sync, ...(raw?.sync ?? {}) },
    // 旧版本是"单通道"配置（preset + 字段），这里自动迁移成 channels[]
    push: migratePush({ ...DEFAULT_SETTINGS.push, ...(raw?.push ?? {}) }),
  };
}

const withStamp = <T extends Partial<BaseEntity>>(d: T, now = Date.now()): T & { id: string; createdAt: number; updatedAt: number } => ({
  ...d,
  id: (d as { id?: string }).id ?? "",
  createdAt: d.createdAt ?? now,
  updatedAt: now,
});

export const useStore = create<DataState>()((set, get) => {
  const persist = async <T extends { id: string }>(store: keyof typeof repos, items: T[]) => {
    const repo = repos[store] as never;
    await (repo as { bulkPut: (i: T[]) => Promise<void> }).bulkPut(items);
  };
  const single = async (store: keyof typeof repos, item: object) => {
    const repo = repos[store] as never;
    await (repo as { put: (i: object) => Promise<void> }).put(item);
  };
  const remove = async (store: keyof typeof repos, id: string) => {
    const repo = repos[store] as never;
    await (repo as { delete: (i: string) => Promise<void> }).delete(id);
  };

  const markDirty = () => {
    set({ syncDirty: true, lastSyncAt: null });
    broadcastDataChanged("app");
  };

  const pushUndo = () => {
    const { events, tasks, undoStack, redoStack } = get();
    const snap: Snapshot = { events: JSON.parse(JSON.stringify(events)), tasks: JSON.parse(JSON.stringify(tasks)) };
    const stack = [...undoStack, snap].slice(-50);
    set({ undoStack: stack, redoStack: [] });
  };

  return {
    ready: false,
    settings: DEFAULT_SETTINGS,
    categories: [],
    events: [],
    lists: [],
    groups: [],
    tasks: [],
    diaries: [],
    notes: [],
    anniversaries: [],
    focusSessions: [],
    notifications: [],
    reminderKeys: new Set(),
    syncDirty: false,
    lastSyncAt: null,
    undoStack: [],
    redoStack: [],

    async init() {
      const [settingsRaw, categories, events, lists, groups, tasks, diaries, notes, anniversaries, focus, notifications, logs] =
        await Promise.all([
          repos.settings.get("settings"),
          repos.categories.getAll(),
          repos.events.getAll(),
          repos.lists.getAll(),
          repos.groups.getAll(),
          repos.tasks.getAll(),
          repos.diaries.getAll(),
          repos.notes.getAll(),
          repos.anniversaries.getAll(),
          repos.focus.getAll(),
          repos.notifications.getAll(),
          repos.reminderLog.getAll(),
        ]);
      const settings = mergeSettings(settingsRaw?.value as Settings | undefined);

      // 修复历史专注记录：旧版累计逻辑有缺陷（每 tick 只写 0.4 秒、完成时又被旧快照覆盖），
      // 导致已完成会话的 actualSeconds 恒为 0。这里用「起止时间差」复原，
      // 且仅在时间差合理（>0 且不超过计划时长+5 分钟）时修复，避免把挂机时长算成专注。
      let focusList = focus as FocusSession[];
      {
        let changed = 0;
        focusList = focusList.map((f) => {
          if (f.status !== "completed" || !f.endedAt) return f;
          if ((f.actualSeconds ?? 0) >= 1) return f;
          const wall = Math.round((f.endedAt - f.startedAt) / 1000 - (f.pausedSeconds ?? 0));
          const cap = (f.plannedMinutes ?? 0) * 60 + 300;
          if (wall <= 0 || (cap > 0 && wall > cap)) return f;
          changed++;
          return { ...f, actualSeconds: wall };
        });
        if (changed) {
          await repos.focus.bulkPut(focusList);
          console.info("[focus] 已修复 " + changed + " 条历史专注记录的时长");
        }
      }

      let cats = categories as CalendarCategory[];
      if (!cats.length) {
        cats = seedCategories();
        await repos.categories.bulkPut(cats);
      }
      // 同名分类去重：历史数据里可能出现两个「默认」，列表上看起来是两条重复项
      {
        const seen = new Map<string, CalendarCategory>();
        const dups: string[] = [];
        const ordered = [...cats].sort((a, b) => a.order - b.order);
        for (const c of ordered) {
          const key = c.name.trim();
          if (seen.has(key)) dups.push(c.id);
          else seen.set(key, c);
        }
        if (dups.length) {
          const keep = [...seen.values()][0];
          const fixedEvents = (events as CalendarEvent[]).map((e) =>
            dups.includes(e.categoryId) ? { ...e, categoryId: keep.id, updatedAt: Date.now() } : e
          );
          await repos.events.bulkPut(fixedEvents);
          for (const id of dups) await repos.categories.delete(id);
          cats = [...seen.values()];
          events.splice(0, events.length, ...fixedEvents);
        }
      }
      let ls = lists as TaskList[];
      if (!ls.length) {
        ls = seedLists();
        await repos.lists.bulkPut(ls);
      }
      set({
        ready: true,
        settings,
        categories: cats,
        events: events as CalendarEvent[],
        lists: ls,
        groups: groups as TaskGroup[],
        tasks: tasks as Task[],
        diaries: diaries as Diary[],
        notes: notes as Note[],
        anniversaries: anniversaries as Anniversary[],
        // 使用上面"修复历史专注记录"后的列表
        focusSessions: focusList,
        notifications: notifications as AppNotification[],
        reminderKeys: new Set((logs ?? []).map((l) => l.key)),
      });
    },

    pushUndo,
    undo() {
      const { undoStack, redoStack, events, tasks } = get();
      const last = undoStack[undoStack.length - 1];
      if (!last) return;
      const current: Snapshot = { events: JSON.parse(JSON.stringify(events)), tasks: JSON.parse(JSON.stringify(tasks)) };
      set({
        events: last.events,
        tasks: last.tasks,
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, current].slice(-50),
      });
      void persist("events", last.events);
      void persist("tasks", last.tasks);
      markDirty();
    },
    redo() {
      const { redoStack, undoStack, events, tasks } = get();
      const last = redoStack[redoStack.length - 1];
      if (!last) return;
      const current: Snapshot = { events: JSON.parse(JSON.stringify(events)), tasks: JSON.parse(JSON.stringify(tasks)) };
      set({
        events: last.events,
        tasks: last.tasks,
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, current].slice(-50),
      });
      void persist("events", last.events);
      void persist("tasks", last.tasks);
      markDirty();
    },

    async updateSettings(patch) {
      const next = typeof patch === "function" ? patch(get().settings) : { ...get().settings, ...patch };
      set({ settings: next });
      await single("settings", { id: "settings", value: next });
      markDirty();
    },

    // 跨窗口同步：从 IndexedDB 重新读取（不广播，避免回环）
    async reloadFromDb() {
      const [settingsRaw, categories, events, lists, groups, tasks, diaries, notes, anniversaries, focus, notifications, logs] =
        await Promise.all([
          repos.settings.get("settings"),
          repos.categories.getAll(),
          repos.events.getAll(),
          repos.lists.getAll(),
          repos.groups.getAll(),
          repos.tasks.getAll(),
          repos.diaries.getAll(),
          repos.notes.getAll(),
          repos.anniversaries.getAll(),
          repos.focus.getAll(),
          repos.notifications.getAll(),
          repos.reminderLog.getAll(),
        ]);
      set({
        settings: mergeSettings(settingsRaw?.value as Settings | undefined),
        categories: categories as CalendarCategory[],
        events: events as CalendarEvent[],
        lists: lists as TaskList[],
        groups: groups as TaskGroup[],
        tasks: tasks as Task[],
        diaries: diaries as Diary[],
        notes: notes as Note[],
        anniversaries: anniversaries as Anniversary[],
        focusSessions: focus as FocusSession[],
        notifications: notifications as AppNotification[],
        reminderKeys: new Set((logs ?? []).map((l) => l.key)),
      });
    },

    // ---------- 分类 ----------
    async createCategory(data) {
      const order = get().categories.reduce((m, c) => Math.max(m, c.order), -1) + 1;
      const cat = withStamp({ ...data, id: data.id ?? uid(), name: data.name ?? "未命名", order: data.order ?? order, visible: data.visible ?? true, color: data.color ?? "#64748b", isDefault: data.isDefault ?? false });
      set({ categories: [...get().categories, cat] });
      await single("categories", cat);
      markDirty();
    },
    async updateCategory(id, patch) {
      set({ categories: get().categories.map((c) => (c.id === id ? withStamp({ ...c, ...patch }) : c)) });
      const cat = get().categories.find((c) => c.id === id);
      if (cat) await single("categories", cat);
    },
    async deleteCategory(id) {
      const { categories } = get();
      const def = categories.find((c) => c.isDefault) ?? categories[0];
      if (!def || def.id === id) return;
      pushUndo();
      set({
        categories: categories.filter((c) => c.id !== id),
        events: get().events.map((e) => (e.categoryId === id ? withStamp({ ...e, categoryId: def.id }) : e)),
      });
      await remove("categories", id);
      await persist("events", get().events);
      markDirty();
    },

    // ---------- 事件 ----------
    async createEvent(data) {
      const ev = withStamp({
        ...data, id: data.id ?? uid(), title: data.title ?? "新事件", allDay: data.allDay ?? false,
        start: data.start ?? "", end: data.end ?? "",
        reminders: data.reminders ?? [],
        categoryId: data.categoryId ?? get().categories.find((c) => c.isDefault)?.id ?? get().categories[0]?.id,
      });
      set({ events: [...get().events, ev] });
      await single("events", ev);
      markDirty();
    },
    async updateEvent(id, patch) {
      set({ events: get().events.map((e) => (e.id === id ? withStamp({ ...e, ...patch }) : e)) });
      const ev = get().events.find((e) => e.id === id);
      if (ev) await single("events", ev);
      markDirty();
    },
    async updateEventBulk(events) {
      const map = new Map(events.map((e) => [e.id, e]));
      set({ events: get().events.map((e) => (map.has(e.id) ? withStamp({ ...e, ...map.get(e.id)! }) : e)) });
      await persist("events", get().events);
      markDirty();
    },
    async deleteEvent(id) {
      set({ events: get().events.filter((e) => e.id !== id) });
      await remove("events", id);
      markDirty();
    },

    // ---------- 清单 ----------
    async createList(data) {
      const order = get().lists.reduce((m, l) => Math.max(m, l.order), -1) + 1;
      const list: TaskList = withStamp({ ...data, id: data.id ?? uid(), name: data.name ?? "新清单", order: data.order ?? order, builtin: data.builtin ?? null });
      set({ lists: [...get().lists, list] });
      await single("lists", list);
      return list;
    },
    async updateList(id, patch) {
      set({ lists: get().lists.map((l) => (l.id === id ? withStamp({ ...l, ...patch }) : l)) });
      const l = get().lists.find((x) => x.id === id);
      if (l) await single("lists", l);
    },
    async deleteList(id, opts) {
      const list = get().lists.find((l) => l.id === id);
      if (!list || list.builtin) return;
      pushUndo();
      const { tasks } = get();
      if (opts?.deleteTasks) {
        set({ tasks: tasks.filter((t) => t.listId !== id), lists: get().lists.filter((l) => l.id !== id) });
        await persist("tasks", get().tasks);
      } else {
        const inbox = get().lists.find((l) => l.id === "list-inbox") ?? get().lists.find((l) => !l.builtin);
        if (!inbox) return;
        set({
          tasks: tasks.map((t) => (t.listId === id ? withStamp({ ...t, listId: inbox.id }) : t)),
          lists: get().lists.filter((l) => l.id !== id),
        });
        await persist("tasks", get().tasks);
      }
      await remove("lists", id);
      markDirty();
    },
    async createGroup(data) {
      const order = get().groups.reduce((m, g) => Math.max(m, g.order), -1) + 1;
      const g: TaskGroup = withStamp({ ...data, id: data.id ?? uid(), name: data.name ?? "新分组", order: data.order ?? order, collapsed: data.collapsed ?? false });
      set({ groups: [...get().groups, g] });
      await single("groups", g);
      return g;
    },
    async updateGroup(id, patch) {
      set({ groups: get().groups.map((g) => (g.id === id ? withStamp({ ...g, ...patch }) : g)) });
      const g = get().groups.find((x) => x.id === id);
      if (g) await single("groups", g);
    },
    async deleteGroup(id) {
      set({
        groups: get().groups.filter((g) => g.id !== id),
        lists: get().lists.map((l) => (l.groupId === id ? withStamp({ ...l, groupId: null }) : l)),
      });
      await remove("groups", id);
      await persist("lists", get().lists);
    },

    // ---------- 任务 ----------
    async createTask(data) {
      const pos = get().settings.task.newTaskPosition;
      const listId = data.listId ?? "list-inbox";
      const listTasks = get().tasks.filter((t) => t.listId === listId);
      const order = pos === "top"
        ? (listTasks.reduce((m, t) => Math.min(m, t.order), 0) - 1)
        : (listTasks.reduce((m, t) => Math.max(m, t.order), -1) + 1);
      const task: Task = withStamp({
        ...data,
        id: data.id ?? uid(),
        title: data.title ?? "",
        priority: data.priority ?? get().settings.task.newTaskPriority,
        listId,
        starred: data.starred ?? false,
        completed: data.completed ?? false,
        order,
        subtasks: data.subtasks ?? [],
        tags: data.tags ?? [],
        attachments: data.attachments ?? [],
      });
      set({ tasks: [...get().tasks, task] });
      await single("tasks", task);
      markDirty();
      return task;
    },
    async updateTask(id, patch) {
      set({ tasks: get().tasks.map((t) => (t.id === id ? withStamp({ ...t, ...patch }) : t)) });
      const t = get().tasks.find((x) => x.id === id);
      if (t) await single("tasks", t);
      markDirty();
    },
    async deleteTask(id) {
      set({ tasks: get().tasks.filter((t) => t.id !== id) });
      await remove("tasks", id);
      markDirty();
    },
    async toggleTaskComplete(id) {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      pushUndo();
      if (!task.completed) {
        // 完成：重复任务自动续期
        if (task.repeat && get().settings.task.autoRenewRepeatTasks && task.dueDate) {
          const next = nextTaskDue(task, new Date());
          const updated = withStamp({
            ...task,
            completed: true,
            completedAt: Date.now(),
            repeat: next ? task.repeat : null,
            dueDate: next ?? task.dueDate,
          });
          set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)) });
        } else {
          set({ tasks: get().tasks.map((t) => (t.id === id ? withStamp({ ...t, completed: true, completedAt: Date.now() }) : t)) });
        }
      } else {
        set({ tasks: get().tasks.map((t) => (t.id === id ? withStamp({ ...t, completed: false, completedAt: null }) : t)) });
      }
      const t = get().tasks.find((x) => x.id === id);
      if (t) await single("tasks", t);
      markDirty();
    },
    async toggleTaskStar(id) {
      set({ tasks: get().tasks.map((t) => (t.id === id ? withStamp({ ...t, starred: !t.starred }) : t)) });
      const t = get().tasks.find((x) => x.id === id);
      if (t) await single("tasks", t);
    },
    async reorderTasks(orderedIds) {
      const byId = new Map(get().tasks.map((t) => [t.id, t]));
      const next = orderedIds.map((id, i) => {
        const t = byId.get(id);
        return t ? withStamp({ ...t, order: i }) : null;
      }).filter(Boolean) as Task[];
      const changed = new Set(next.map((t) => t.id));
      const rest = get().tasks.filter((t) => !changed.has(t.id));
      const all = [...next, ...rest];
      set({ tasks: all });
      await persist("tasks", all);
    },
    async moveTaskToMyDay(id) {
      set({ tasks: get().tasks.map((t) => (t.id === id ? withStamp({ ...t, inMyDay: todayStr() }) : t)) });
      const t = get().tasks.find((x) => x.id === id);
      if (t) await single("tasks", t);
    },
    async clearCompletedTasks() {
      set({ tasks: get().tasks.filter((t) => !t.completed) });
      await persist("tasks", get().tasks);
      markDirty();
    },
    async addToMyDayToday() {
      // 每日重置逻辑在 bootstrap 中：把昨天的 inMyDay 清空
      const today = todayStr();
      set({ tasks: get().tasks.map((t) => (t.inMyDay && t.inMyDay !== today ? withStamp({ ...t, inMyDay: null }) : t)) });
    },

    // ---------- 日记 ----------
    async upsertDiary(diary) {
      const existing = get().diaries.find((d) => (d.id === diary.id || d.date === diary.date));
      let next: Diary;
      if (existing) {
        next = withStamp({ ...existing, ...diary, id: existing.id, date: existing.date });
        set({ diaries: get().diaries.map((d) => (d.id === existing.id ? next : d)) });
      } else {
        next = withStamp({ ...diary, id: diary.id ?? uid(), content: diary.content ?? "" });
        set({ diaries: [...get().diaries, next] });
      }
      await single("diaries", next);
      markDirty();
      return next;
    },
    async deleteDiary(id) {
      set({ diaries: get().diaries.filter((d) => d.id !== id) });
      await remove("diaries", id);
      markDirty();
    },

    // ---------- 笔记 ----------
    // 返回写入后的记录；新建时把生成的 id 交回调用方，调用方必须保存这个 id，
    // 否则每次自动保存都会被当作“新建” → 写一篇笔记列表里出现一堆重复项。
    async upsertNote(note) {
      let next: Note;
      if (note.id) {
        // 关键：与已有记录合并，保住 createdAt（调用方传入的是部分字段，
        // 若直接 withStamp，createdAt 会被重置成"现在"→ 创建时间丢失）
        const cur = get().notes.find((n) => n.id === note.id);
        next = withStamp({
          ...cur,
          ...note,
          id: note.id,
          createdAt: note.createdAt ?? cur?.createdAt,
        } as Note);
        set({ notes: get().notes.map((n) => (n.id === note.id ? next : n)) });
      } else {
        next = withStamp({ ...note, id: uid(), tags: note.tags ?? [], pinned: note.pinned ?? false } as Note);
        set({ notes: [next, ...get().notes] });
      }
      await single("notes", next);
      markDirty();
      return next;
    },
    async deleteNote(id) {
      set({ notes: get().notes.filter((n) => n.id !== id) });
      await remove("notes", id);
      markDirty();
    },

    // ---------- 纪念日 ----------
    async createAnniversary(data) {
      const order = get().anniversaries.reduce((m, a) => Math.max(m, a.order), -1) + 1;
      const a = withStamp({
        ...data, id: data.id ?? uid(), name: data.name ?? "未命名", type: data.type ?? "anniversary",
        date: data.date ?? todayStr(), isLunar: data.isLunar ?? false, remindDays: data.remindDays ?? -1,
        order: data.order ?? order,
      });
      set({ anniversaries: [...get().anniversaries, a] });
      await single("anniversaries", a);
      markDirty();
    },
    async updateAnniversary(id, patch) {
      set({ anniversaries: get().anniversaries.map((a) => (a.id === id ? withStamp({ ...a, ...patch }) : a)) });
      const a = get().anniversaries.find((x) => x.id === id);
      if (a) await single("anniversaries", a);
    },
    async deleteAnniversary(id) {
      set({ anniversaries: get().anniversaries.filter((a) => a.id !== id) });
      await remove("anniversaries", id);
      markDirty();
    },

    // ---------- 专注 ----------
    // 需求：同一时刻只允许一个进行中的专注。
    // 若已有 running 会话，直接把它返回给调用方，不再新建（避免并行计时/重复记录）。
    async createFocusSession(s) {
      const running = get().focusSessions.find((x) => x.status === "running");
      if (running) return running;
      const now = Date.now();
      const session: FocusSession = withStamp({
        ...s, id: s.id ?? uid(), status: "running", startedAt: now, actualSeconds: 0, pauseCount: 0, pausedSeconds: 0,
      } as FocusSession);
      set({ focusSessions: [...get().focusSessions, session] });
      await single("focus", session);
      return session;
    },
    async updateFocusSession(id, patch) {
      set({ focusSessions: get().focusSessions.map((f) => (f.id === id ? withStamp({ ...f, ...patch }) : f)) });
      const f = get().focusSessions.find((x) => x.id === id);
      if (f) await single("focus", f);
    },
    async deleteFocusSession(id) {
      set({ focusSessions: get().focusSessions.filter((f) => f.id !== id) });
      await remove("focus", id);
    },

    // ---------- 通知 ----------
    async addNotifications(items) {
      const now = Date.now();
      const list = items.map((i) => ({ ...i, id: uid(), createdAt: now, updatedAt: now } as AppNotification));
      set({ notifications: [...list, ...get().notifications].slice(0, 500) });
      await persist("notifications", get().notifications);

      // 外部推送（QQ 机器人 / 企业微信 / Server酱 …）：
      // 所有进入通知中心的通知都会再推一份，保证"每条提醒都能到手机"。
      const push = get().settings.push;
      if (list.length) {
        if (!push?.enabled || !activeChannels(push).length) {
          // 没开启（或没有任何已启用通道）也记一条，便于回答"这条为什么没推给我"
          for (const n of list) {
            logPush({
              at: now, title: n.title, ok: false,
              result: push?.enabled ? "没有已启用的通知通道（设置 → 推送）" : "推送未开启（设置 → 推送）",
              via: "none",
            });
          }
        } else {
          const quiet = isQuietTime(get().settings.reminder.quietStart, get().settings.reminder.quietEnd, new Date(now));
          if (!push.ignoreQuiet && quiet) {
            for (const n of list) logPush({ at: now, title: n.title, ok: false, result: "处于免打扰时段，已跳过（可开启「免打扰时段也推送」）", via: "none" });
          } else {
            // 多通道广播：QQ 机器人、邮箱、企业微信… 同时发
            for (const n of list) {
              void sendPushAll(push, { title: n.title, body: n.body }).then((r) => {
                if (!r.ok) console.warn("[push] " + r.message);
              });
            }
          }
        }
      }
    },
    async markNotificationRead(id) {
      set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true, updatedAt: Date.now() } : n)) });
      const n = get().notifications.find((x) => x.id === id);
      if (n) await single("notifications", n);
    },
    async markAllNotificationsRead() {
      const now = Date.now();
      set({ notifications: get().notifications.map((n) => ({ ...n, read: true, updatedAt: now })) });
      await persist("notifications", get().notifications);
    },
    async removeNotification(id) {
      set({ notifications: get().notifications.filter((n) => n.id !== id) });
      await remove("notifications", id);
    },
    async clearReadNotifications() {
      set({ notifications: get().notifications.filter((n) => !n.read) });
      await persist("notifications", get().notifications);
    },
    async logReminderKeys(keys) {
      const now = Date.now();
      const existing = get().reminderKeys;
      const next = new Set(existing);
      for (const k of keys) next.add(k);
      set({ reminderKeys: next });
      const entries = [...next].map((k) => ({ key: k, at: now }));
      await repos.reminderLog.bulkPut(entries);
      // 清理 7 天前的
      const cutoff = now - 7 * 86400000;
      for (const e of entries) {
        if (e.at < cutoff) await repos.reminderLog.delete(e.key);
      }
    },
    async cleanupOldNotifications() {
      const days = get().settings.reminder.retentionDays;
      if (days <= 0) return;
      const cutoff = Date.now() - days * 86400000;
      const keep = get().notifications.filter((n) => n.occurredAt > cutoff);
      if (keep.length !== get().notifications.length) {
        set({ notifications: keep });
        await persist("notifications", keep);
      }
    },

    markSyncDirty: markDirty,

    async resetAll() {
      for (const k of Object.keys(repos)) {
        await (repos[k as keyof typeof repos] as { clear: () => Promise<void> }).clear();
      }
      set({
        settings: DEFAULT_SETTINGS,
        categories: seedCategories(),
        events: [],
        lists: seedLists(),
        groups: [],
        tasks: [],
        diaries: [],
        notes: [],
        anniversaries: [],
        focusSessions: [],
        notifications: [],
        reminderKeys: new Set(),
        undoStack: [],
        redoStack: [],
      });
      await repos.categories.bulkPut(get().categories);
      await repos.lists.bulkPut(get().lists);
      await single("settings", { id: "settings", value: DEFAULT_SETTINGS });
    },
  };
});

export function useEntityCounts() {
  // 便捷：统计各类型数据量（数据管理页使用）
  return null;
}
