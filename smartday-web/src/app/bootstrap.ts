// 应用引导：初始化数据、应用主题、启动提醒引擎与同步兜底、每日重置
import { useStore } from "@/store/store";
import { getDB } from "@/db/indexeddb";
import { checkReminders, candidateToNotification } from "@/lib/reminderEngine";
import { repos } from "@/db/indexeddb";
import { todayStr, fmtDate } from "@/lib/date";
import { navigate } from "@/lib/router";
import { renderMarkdown } from "@/lib/markdown";
import { onDataChanged } from "@/lib/broadcast";

let inited = false;

export interface InitOptions {
  /** main = 主应用窗口；wallpaper = 桌面壁纸日历窗口（被动显示，不触发提醒/同步/清理） */
  role?: "main" | "wallpaper";
}

export async function initApp(options: InitOptions = {}) {
  if (inited) return;
  inited = true;
  const role = options.role ?? "main";

  const store = useStore;
  await store.getState().init();
  applyTheme(store.getState().settings.general.theme);

  // 跨窗口实时同步（两种窗口都参与）
  startCrossWindowSync(role);

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

function isQuietTime(start: string, end: string, now: Date): boolean {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const sMin = (sh || 0) * 60 + (sm || 0);
  const eMin = (eh || 0) * 60 + (em || 0);
  if (sMin === eMin) return false;
  if (sMin < eMin) return cur >= sMin && cur < eMin;
  return cur >= sMin || cur < eMin; // 跨天
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
