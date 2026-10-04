// ============================================================
// SmartDay 领域模型类型定义
// ============================================================

export type ID = string;

// ---------- 通用 ----------
export interface BaseEntity {
  id: ID;
  createdAt: number;
  updatedAt: number;
}

export type Priority = "high" | "medium" | "low" | "none"; // 最高🔴/高🟠/中🔵/低⚪

// ---------- 日历分类 ----------
export interface CalendarCategory extends BaseEntity {
  name: string;
  color: string; // hex
  isDefault: boolean;
  visible: boolean; // 侧边栏是否显示
  order: number;
}

// ---------- 重复规则 ----------
export type RepeatFreq = "daily" | "weekly" | "monthly" | "yearly" | "custom";
export interface RepeatRule {
  freq: RepeatFreq;
  /** 间隔，如每 2 周 -> interval=2 */
  interval: number;
  /** 自定义：每周几 [0-6]，如 [1,3,5] 表示周一三五 */
  weekdays?: number[];
  /** 自定义：每月第几日 */
  monthday?: number;
  /** 结束条件 */
  endType: "never" | "date" | "count";
  endDate?: string; // yyyy-MM-dd
  endCount?: number;
}

// ---------- 日历事件 ----------
export interface Reminder {
  /** 提前多少分钟触发 */
  minutes: number;
}

export interface CalendarEvent extends BaseEntity {
  title: string;
  allDay: boolean;
  start: string; // ISO datetime
  end: string; // ISO datetime
  location?: string;
  description?: string;
  categoryId: ID;
  color?: string; // 覆盖分类颜色
  repeat?: RepeatRule | null;
  reminders: Reminder[];
  /** 重复实例的父事件 id（编辑单次出现时创建） */
  parentId?: ID;
  /** 是否为任务（"创建为任务"联动） */
  linkedTaskId?: ID;
  /** 重复例外：dateStr -> 覆盖事件（{deleted:true} 表示当天删除） */
  exceptions?: Record<string, CalendarEvent | { deleted: true }>;
}

// ---------- 任务 ----------
export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
  /** Tab 缩进层级 0..n */
  indent: number;
  order: number;
}

export interface Attachment {
  id: ID;
  name: string;
  type: string; // mime
  size: number; // bytes, <= 10MB
  /** DataURL 或对象存储 key */
  dataUrl?: string;
}

export interface Task extends BaseEntity {
  title: string;
  notes?: string;
  dueDate?: string | null; // yyyy-MM-dd
  dueTime?: string | null; // HH:mm
  remindAt?: number | null; // 自定义提醒时间戳
  repeat?: RepeatRule | null;
  priority: Priority;
  listId: ID;
  starred: boolean;
  completed: boolean;
  completedAt?: number | null;
  order: number;
  /** 我的一天：加入日期 yyyy-MM-dd（当天手动加入；每天凌晨自动清空重置） */
  inMyDay?: string | null;
  subtasks: Subtask[];
  tags: string[];
  attachments: Attachment[];
  /** 自定义清单删除时是否保留到默认清单 */
  archived?: boolean;
}

// ---------- 任务清单 ----------
export type BuiltinListType = "important" | "planned" | "all" | "completed" | "myday";
export interface TaskList extends BaseEntity {
  name: string;
  builtin?: BuiltinListType | null;
  groupId?: ID | null;
  color?: string;
  order: number;
  collapsed?: boolean;
}

export interface TaskGroup extends BaseEntity {
  name: string;
  order: number;
  collapsed: boolean;
}

// ---------- 日记 ----------
export type Mood = "happy" | "smile" | "neutral" | "sad" | "angry"; // 😄😊😐😢😡
export interface Diary extends BaseEntity {
  date: string; // yyyy-MM-dd（一天一篇，唯一）
  title?: string;
  content: string; // markdown
  mood?: Mood | null;
}

export interface Note extends BaseEntity {
  title: string;
  content: string; // markdown
  /** 关联日期（写于某天），可为空作为独立笔记 */
  date?: string | null;
  tags: string[];
  pinned: boolean;
}

// ---------- 纪念日 ----------
export type AnniversaryType = "countdown" | "anniversary" | "birthday";
export interface Anniversary extends BaseEntity {
  name: string;
  type: AnniversaryType;
  /** 事件日期 yyyy-MM-dd（生日可用农历日期） */
  date: string;
  isLunar: boolean;
  /** 提醒：-1=不提醒, 0=当天, 1/3/7=提前 N 天 */
  remindDays: number;
  color?: string;
  order: number;
}

// ---------- 专注 ----------
export type FocusMode = "pomodoro" | "countdown" | "stopwatch" | "event";
export type FocusStatus = "running" | "paused" | "completed" | "abandoned";
export interface FocusSession extends BaseEntity {
  mode: FocusMode;
  /** 计划时长（分钟）；正向计时为 0 */
  plannedMinutes: number;
  actualSeconds: number;
  /** 暂停次数与累计暂停秒数 */
  pauseCount: number;
  pausedSeconds: number;
  /** 关联目标（任务 id / 事件 id / null=自由专注） */
  targetId?: ID | null;
  targetType?: "task" | "event" | null;
  targetTitle?: string;
  note?: string;
  status: FocusStatus;
  startedAt: number;
  endedAt?: number | null;
  /** 番茄轮次 */
  round?: number;
}

// ---------- 通知 ----------
export type NotificationType = "event" | "task" | "anniversary" | "diary" | "system";
export interface AppNotification extends BaseEntity {
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  /** 点击跳转路由 */
  route?: string;
  refId?: ID;
  occurredAt: number;
}

// ---------- 设置 ----------
export type ThemeMode = "light" | "dark" | "system";
export type CalendarView = "month" | "week" | "day" | "year" | "agenda";
export type WeekStart = 0 | 1; // 0=周日 1=周一
export type TimeFormat = 12 | 24;
export interface CalendarSettings {
  defaultView: CalendarView;
  weekStart: WeekStart;
  showLunar: boolean;
  showFestivals: boolean;
  showWeekNumbers: boolean;
  workdays: number[]; // 每周工作日 [0-6]
  workHours: [number, number]; // 工作时段
  defaultEventDuration: number; // 分钟
  defaultCategoryId?: ID;
  defaultReminders: number[]; // 默认提前分钟
  showTasksInCalendar: boolean;
}
export interface TaskSettings {
  newTaskPriority: Priority;
  newTaskPosition: "top" | "bottom";
  completionSound: boolean;
  completionAnimation: boolean;
  overdueReminder: boolean;
  autoRenewRepeatTasks: boolean;
}
export interface DiarySettings {
  editorMode: "edit" | "split" | "preview";
  autoSaveIntervalMs: number;
  showMood: boolean;
  titleFormat: string; // 如 "M月d日 星期X"
  /** 笔记标签管理 */
  noteTags: string[];
}
export interface ReminderSettings {
  defaultRemindMinutes: number[];
  allDayDefaultRemind: number; // 全天事件默认提前分钟
  enableNotifications: boolean;
  sound: boolean;
  quietStart: string; // "23:00"
  quietEnd: string; // "07:00"
  retentionDays: number; // 7/15/30/-1(永久)
}
export interface FocusSettings {
  pomodoroMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number; // 每 N 个番茄
  autoDnd: boolean;
  completionSound: boolean;
  countAbandoned: boolean;
}
export interface SyncSettings {
  enabled: boolean;
  serverUrl: string;
  token: string;
  autoSyncIntervalSec: number;
  lastSyncAt?: number | null;
  pendingPush?: number;
  deviceId?: string;
}
/** 外部推送通道（QQ 机器人 / 企业微信 / 钉钉 / 飞书 / 推送服务 / 自定义 Webhook） */
export type PushPreset = "onebot" | "qqbot" | "wecom" | "dingtalk" | "feishu" | "serverchan" | "pushplus" | "custom";
export interface PushSettings {
  enabled: boolean;
  preset: PushPreset;
  /** 目标地址：OneBot 服务地址（如 http://127.0.0.1:3000）或各类 Webhook 地址 */
  url: string;
  /** 令牌：OneBot access_token / Server酱 SendKey / PushPlus token / 自定义 Bearer */
  token: string;
  /** OneBot：私聊目标 QQ 号 */
  qq: string;
  /** OneBot：群号（填了优先发群，否则发私聊） */
  group: string;
  /** 官方 QQ 机器人：机器人 Token 与频道 ID */
  appToken: string;
  channelId: string;
  /** 自定义 Webhook 请求体模板，{title} / {body} 会被替换 */
  bodyTemplate: string;
  /** 免打扰时段也继续推送 */
  ignoreQuiet: boolean;
}
export interface GeneralSettings {
  theme: ThemeMode;
  language: string;
  dateFormat: string;
  timeFormat: TimeFormat;
  timezone: string;
}
export interface Settings {
  general: GeneralSettings;
  calendar: CalendarSettings;
  task: TaskSettings;
  diary: DiarySettings;
  reminder: ReminderSettings;
  focus: FocusSettings;
  sync: SyncSettings;
  push: PushSettings;
  shortcuts?: Record<string, string>;
}
export const DEFAULT_SETTINGS: Settings = {
  general: { theme: "system", language: "zh-CN", dateFormat: "yyyy-MM-dd", timeFormat: 24, timezone: "Asia/Shanghai" },
  calendar: {
    defaultView: "month",
    weekStart: 1,
    showLunar: true,
    showFestivals: true,
    showWeekNumbers: true,
    workdays: [1, 2, 3, 4, 5],
    workHours: [9, 18],
    defaultEventDuration: 60,
    defaultReminders: [15],
    showTasksInCalendar: true,
  },
  task: {
    newTaskPriority: "none",
    newTaskPosition: "top",
    completionSound: true,
    completionAnimation: true,
    overdueReminder: true,
    autoRenewRepeatTasks: true,
  },
  diary: {
    editorMode: "split",
    autoSaveIntervalMs: 800,
    showMood: true,
    titleFormat: "M月d日 dddd",
    noteTags: ["读书", "灵感", "会议", "学习"],
  },
  reminder: {
    defaultRemindMinutes: [15],
    allDayDefaultRemind: 9 * 60,
    enableNotifications: true,
    sound: true,
    quietStart: "23:00",
    quietEnd: "07:00",
    retentionDays: 30,
  },
  focus: {
    pomodoroMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakInterval: 4,
    autoDnd: true,
    completionSound: true,
    countAbandoned: false,
  },
  sync: { enabled: false, serverUrl: "", token: "", autoSyncIntervalSec: 900 },
  push: {
    enabled: false,
    preset: "onebot",
    url: "http://127.0.0.1:3000",
    token: "",
    qq: "",
    group: "",
    appToken: "",
    channelId: "",
    bodyTemplate: '{"title":"{title}","content":"{body}"}',
    ignoreQuiet: false,
  },
};

// ---------- 桌面日历（网页预览页配置，供后续桌面封装） ----------
export type DesktopStyle = "glass" | "list";
export type DesktopSize = "small" | "medium" | "large" | "full";
export type DesktopOpacity = 30 | 60 | 80 | 92;
export interface DesktopSettings {
  style: DesktopStyle;
  size: DesktopSize;
  opacity: DesktopOpacity;
  position: "right" | "center" | "left";
  editMode: boolean;
}
export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  style: "glass",
  size: "medium",
  opacity: 92,
  position: "right",
  editMode: false,
};

// ---------- 全局搜索 ----------
export interface SearchHistory {
  term: string;
  at: number;
}

// ---------- 专注统计 ----------
export interface FocusStats {
  today: number; // 秒
  week: number;
  month: number;
  total: number;
  completedCount: number;
  averageMinutes: number;
  streakDays: number;
  completionRate: number;
  prevCompare: number; // 与上一周期对比 %
}

export interface FocusDailyPoint {
  date: string;
  seconds: number;
}

export interface FocusByTarget {
  name: string;
  seconds: number;
}

export interface FocusHourly {
  hour: number;
  seconds: number;
}
