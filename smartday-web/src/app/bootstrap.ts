// 应用引导：初始化数据、应用主题、启动提醒引擎与同步兜底、每日重置
import { useStore } from "@/store/store";
import { getDB } from "@/db/indexeddb";
import { checkReminders, candidateToNotification, isQuietTime } from "@/lib/reminderEngine";
import { repos } from "@/db/indexeddb";
import { todayStr, fmtDate } from "@/lib/date";
import { navigate } from "@/lib/router";
import { renderMarkdown } from "@/lib/markdown";
import { onDataChanged } from "@/lib/broadcast";
import { isAndroid, pushWidgetData, scheduleNativeNotification } from "@/lib/androidBridge";

let inited = false;

export interface InitOptions {
  /** main = 主应用窗口；wallpaper = 桌面壁纸日历窗口（被动显示，不触发提醒/同步/清理） */
  role?: "main" | "wallpaper";
}

/**
 * 安卓端 Deep Link 入口：原生 MainActivity 通过注入 JS 调用本函数，
 * 把「小组件点击 / 通知点击」带来的 route 交给 Web 路由（A-4.3.9 / A-4.7 / A-7.2）。
 * 接受两种形式：`#/calendar/date:2026-10-07` 或 `calendar/date:2026-10-07`。
 */
function installNativeNavigation() {
  (window as unknown as { __smartdayNavigate?: (route: string) => void }).__smartdayNavigate = (
    route: string
  ) => {
    if (!route) return;
    const hash = route.startsWith("#") ? route : "#/" + route.replace(/^\/+/, "");
    if (location.hash === hash) {
      // hash 未变化时 hashchange 不触发，手动派发一次
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      return;
    }
    location.hash = hash;
  };
  // 同时暴露 store：供原生层调试、以及自动化校验脚本造数据/读取状态
  (window as unknown as { __smartdayStore?: typeof useStore }).__smartdayStore = useStore;
}

export async function initApp(options: InitOptions = {}) {
  if (inited) return;
  inited = true;
  const role = options.role ?? "main";

  const store = useStore;
  await store.getState().init();
  applyTheme(store.getState().settings.general.theme);

  // 调试/自动化入口：始终暴露 store 与路由（原生层调试、校验脚本造数据均可用）
  (window as unknown as { __smartdayStore?: typeof useStore }).__smartdayStore = store;

  // 安卓端：注册原生 Deep Link 导航入口
  if (isAndroid()) {
    installNativeNavigation();
  }

  // 跨窗口实时同步（两种窗口都参与）
  startCrossWindowSync(role);

  // 安卓端：初始化时推送一次小组件数据，并订阅数据变更持续刷新
  if (isAndroid()) {
    void pushWidgetData();
    onDataChanged(() => {
      void pushWidgetData();
    });
  }

  // 壁纸窗口只做展示：提醒、云同步、每日重置、通知清理都由主应用窗口负责
  if (role === "main") {
    void dailyResetIfNeeded();
    startReminderLoop();
    startAutoSyncLoop();
    void cleanupLoop();
  }
}

// ---------------- 跨窗口实时同步（桌面端：主应用 ⇄ 壁纸日历窗口） ----------------
function startCrossWindowSync(role: "main" | "wallpaper") {
  // 1) 其他窗口发生数据变更 → 立即重读 IndexedDB 并刷新
  onDataChanged(() => {
    void useStore.getState().reloadFromDb();
  });
  // 2) 兜底轮询（广播不可用/漏消息时仍能同步）；壁纸窗口 60 秒刷新一次
  setInterval(() => {
    void useStore.getState().reloadFromDb();
  }, role === "wallpaper" ? 60000 : 120000);
}

// ---------------- 主题 ----------------
export function applyTheme(mode: "light" | "dark" | "system") {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

// ---------------- 每日重置（我的一天 / 通知清理） ----------------
async function dailyResetIfNeeded() {
  try {
    const db = await getDB();
    const meta = await db.get("meta", "lastMydayReset");
    const today = todayStr();
    if (!meta || meta.value !== today) {
      await useStore.getState().addToMyDayToday();
      await db.put("meta", { id: "lastMydayReset", value: today });
    }
  } catch {
    // 忽略
  }
}

// ---------------- 提醒引擎 ----------------
function startReminderLoop() {
  const tick = async () => {
    try {
      const s = useStore.getState();
      const settings = s.settings;
      if (!settings.reminder.enableNotifications) return;
      const now = new Date();
      const candidates = checkReminders(s.events, s.tasks, s.anniversaries, now, settings);
      if (!candidates.length) return;
      const fresh = candidates.filter((c) => !s.reminderKeys.has(c.key));
      if (!fresh.length) return;
      await s.addNotifications(fresh.map(candidateToNotification));
      await s.logReminderKeys(fresh.map((c) => c.key));

      // 免打扰时段检查
      const quiet = isQuietTime(settings.reminder.quietStart, settings.reminder.quietEnd, now);

      // 说明：外部推送已统一收敛到「通知中心」（store.addNotifications），
      // 所有通知（含提醒引擎产生的）都会自动再推一份，这里不再重复推送。

      if (!quiet) {
        for (const c of fresh) {
          try {
            if ("Notification" in window && Notification.permission === "granted") {
              const n = new Notification(c.title, { body: c.body, tag: c.key });
              n.onclick = () => {
                window.focus();
                if (c.route) location.hash = c.route.replace(/^#\/?/, "#/");
                n.close();
              };
            }
            if (settings.reminder.sound) playReminderSound();
            // 安卓端：同步调度一条本地通知（精确到分钟，系统限制时原生层自动降级）
            if (isAndroid()) {
              void scheduleNativeNotification(hashStr(c.key), c.title, c.body, Date.now(), c.route);
            }
          } catch {
            // 通知不可用时静默
          }
        }
      }
    } catch (e) {
      console.warn("reminder loop error", e);
    }
  };
  tick();
  setInterval(tick, 30000);
}

export function playReminderSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    play(880, 0, 0.35);
    play(1174.66, 0.18, 0.4);
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // 音频不可用
  }
}

// ---------------- 云同步兜底（接口骨架） ----------------
function startAutoSyncLoop() {
  let lastRun = Date.now();
  const tick = async () => {
    const s = useStore.getState();
    const cfg = s.settings.sync;
    if (!cfg.enabled || !cfg.serverUrl) return;
    const interval = Math.max(30, cfg.autoSyncIntervalSec || 900) * 1000;
    if (Date.now() - lastRun < interval) return;
    lastRun = Date.now();
    // 客户端同步引擎骨架：此处通过 syncClient 执行（见 lib/syncClient.ts）
    const { syncNow } = await import("@/lib/syncClient");
    void syncNow();
  };
  setInterval(tick, 30000);
  // 网络恢复时同步
  window.addEventListener("online", () => tick());
  // 打开应用时同步
  setTimeout(() => tick(), 4000);
}

// ---------------- 定期清理 ----------------
function cleanupLoop() {
  setInterval(() => {
    void useStore.getState().cleanupOldNotifications();
  }, 3600 * 1000 * 6);
  void useStore.getState().cleanupOldNotifications();
}

export { renderMarkdown };

/** 字符串稳定 hash（用于生成本地通知 id） */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  }
  return h;
}
