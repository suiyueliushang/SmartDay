// ============================================================
// 桌面端能力桥接：
//  - Electron 中通过 preload 暴露的 window.desktopAPI 通信
//  - 普通浏览器中降级为 localStorage，便于开发调试预览
// ============================================================
export type WpMaterial = "glass" | "solid";
export type WpTheme = "mist" | "ink" | "sand" | "mint";
export type WpPosition = "right" | "center" | "left" | "custom";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DesktopConfig {
  /** 配色主题 */
  theme: WpTheme;
  /** 材质：毛玻璃（透出壁纸）/ 实色面板 */
  material: WpMaterial;
  /** 背景透明度：0-100 连续值 */
  opacity: number;
  /** 显示内容 */
  showFestivals: boolean;
  showLunar: boolean;
  showTasks: boolean;
  showDiary: boolean;
  showTodayPanel: boolean;
  /** 窗口/模式 */
  position: WpPosition;
  editMode: boolean;
  keepBottom: boolean;
  autoLaunch: boolean;
  visible: boolean;
  /** 上次查看的月份（yyyy-MM-dd），重启后恢复 */
  viewMonth: string | null;
  /** 尺寸（由鼠标拖动决定） */
  width: number;
  height: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export const MIN_OPACITY = 0;
export const MAX_OPACITY = 100;

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = {
  theme: "mist",
  material: "glass",
  opacity: 92,
  showFestivals: true,
  showLunar: true,
  showTasks: true,
  showDiary: true,
  showTodayPanel: true,
  position: "right",
  editMode: false,
  keepBottom: false,
  autoLaunch: false,
  visible: true,
  viewMonth: null,
  width: 420,
  height: 560,
  bounds: null,
};

export interface DebugState {
  bounds: { x: number; y: number; width: number; height: number };
  ignoreMouse: boolean;
  zones: Rect[];
  editMode: boolean;
  cursor: { x: number; y: number };
  hoverWatchActive?: boolean;
  scaleFactor?: number;
}

interface DesktopAPI {
  isDesktop: true;
  getConfig(): Promise<DesktopConfig>;
  setConfig(patch: Partial<DesktopConfig>): Promise<DesktopConfig>;
  toggleMode(): Promise<boolean>;
  setMode(edit: boolean): Promise<boolean>;
  openMain(): void;
  refresh(): void;
  quit(): void;
  hideWallpaper(): void;
  dragStart(): void;
  dragEnd(): void;
  resizeStart(): void;
  resizeEnd(): void;
  setIgnoreMouse(ignore: boolean): void;
  reportZones(zones: Rect[]): void;
  resizeBy(delta: { dw: number; dh: number }): void;
  fitToContent(size: { width: number; height: number }): void;
  debugState(): Promise<DebugState>;
  hoverTest(pt: { x: number; y: number }): Promise<{ ok: boolean; inside?: boolean; ignoreMouse?: boolean }>;
  /** 外部推送：由主进程发 HTTP（避开浏览器 CORS） */
  pushNotify(payload: { url: string; method?: string; headers?: Record<string, string>; body?: string }): Promise<{ ok: boolean; status?: number; data?: string; error?: string }>;
  /** 邮箱通知：由主进程走 SMTP（浏览器无法直连 SMTP） */
  mailSend(payload: {
    host: string; port: number; secure: "ssl" | "starttls" | "none";
    user: string; pass: string; from: string; to: string; subject: string; text: string;
  }): Promise<{ ok: boolean; messageId?: string; error?: string }>;
  onConfig(cb: (c: DesktopConfig) => void): void;
  onFocusDay(cb: (date: string) => void): void;
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI;
  }
}

const LS_KEY = "smartday.desktopConfig";

export const isDesktop = (): boolean => typeof window !== "undefined" && !!window.desktopAPI;

function normalize(raw: Partial<DesktopConfig> & { style?: string }): DesktopConfig {
  const merged = { ...DEFAULT_DESKTOP_CONFIG, ...raw } as DesktopConfig & { style?: string };
  // 兼容旧字段 style: glass|list
  if (raw.style && !raw.material) merged.material = raw.style === "list" ? "solid" : "glass";
  delete merged.style;
  merged.opacity = Math.max(MIN_OPACITY, Math.min(MAX_OPACITY, Math.round(Number(merged.opacity) || 0)));
  if (!["mist", "ink", "sand", "mint"].includes(merged.theme)) merged.theme = "mist";
  if (!["glass", "solid"].includes(merged.material)) merged.material = "glass";
  return merged;
}

export async function loadConfig(): Promise<DesktopConfig> {
  if (isDesktop()) {
    try {
      return normalize(await window.desktopAPI!.getConfig());
    } catch {
      /* 回退 */
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<DesktopConfig>);
  } catch {
    /* 忽略 */
  }
  return { ...DEFAULT_DESKTOP_CONFIG };
}

export async function saveConfig(patch: Partial<DesktopConfig>): Promise<DesktopConfig> {
  if (isDesktop()) {
    try {
      return normalize(await window.desktopAPI!.setConfig(patch));
    } catch {
      /* 回退 */
    }
  }
  const next = normalize({ ...(await loadConfig()), ...patch });
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* 忽略 */
  }
  return next;
}

export function onConfigChange(cb: (c: DesktopConfig) => void): () => void {
  if (isDesktop()) {
    window.desktopAPI!.onConfig((raw) => cb(normalize(raw)));
    return () => {};
  }
  const handler = (e: StorageEvent) => {
    if (e.key === LS_KEY) void loadConfig().then(cb);
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function setIgnoreMouse(ignore: boolean) {
  if (isDesktop()) window.desktopAPI!.setIgnoreMouse(ignore);
}

/** 切换 桌面模式 / 编辑模式（真正改变窗口行为） */
export async function setEditMode(edit: boolean): Promise<boolean> {
  if (isDesktop()) {
    try {
      await window.desktopAPI!.setMode(edit);
      const cfg = await window.desktopAPI!.getConfig();
      return !!cfg.editMode;
    } catch {
      return edit;
    }
  }
  const next = await saveConfig({ editMode: edit });
  return next.editMode;
}

/** 上报可点击区域（桌面模式下生效） */
export function reportZones(zones: Rect[]) {
  if (isDesktop()) window.desktopAPI!.reportZones(zones);
}

/** 拖动窗口移动（主进程按真实光标驱动） */
export function dragStart() {
  if (isDesktop()) window.desktopAPI!.dragStart();
}
export function dragEnd() {
  if (isDesktop()) window.desktopAPI!.dragEnd();
}

/** 兼容接口：按增量调整窗口尺寸 */
export function resizeBy(dw: number, dh: number) {
  if (isDesktop()) window.desktopAPI!.resizeBy({ dw, dh });
}

/** 拖动右下角缩放窗口 */
export function resizeStart() {
  if (isDesktop()) window.desktopAPI!.resizeStart();
}
export function resizeEnd() {
  if (isDesktop()) window.desktopAPI!.resizeEnd();
}

/** 按内容自适应窗口 */
export function fitToContent(size: { width: number; height: number }) {
  if (isDesktop()) window.desktopAPI!.fitToContent?.(size);
}

/** 隐藏桌面日历（托盘可恢复） */
export function hideWallpaper() {
  if (isDesktop()) window.desktopAPI!.hideWallpaper();
}

export async function debugState(): Promise<DebugState | null> {
  if (!isDesktop()) return null;
  try {
    return await window.desktopAPI!.debugState();
  } catch {
    return null;
  }
}
