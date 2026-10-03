// ============================================================
// 跨窗口/跨标签实时同步（BroadcastChannel）
// 桌面端：主应用窗口 ⇄ 壁纸日历窗口 共享同一 IndexedDB，
// 数据变更后广播通知，对端重新从 IndexedDB 读取并刷新；
// 另由 60 秒兜底轮询保证极端情况下也能同步（见 bootstrap）。
// ============================================================
const CHANNEL_NAME = "smartday-sync";

interface SyncMessage {
  type: "data-changed" | "hello";
  source: string;
  at: number;
}

let channel: BroadcastChannel | null = null;
let channelFailed = false;

function getChannel(): BroadcastChannel | null {
  if (channelFailed) return null;
  if (channel) return channel;
  try {
    if (typeof BroadcastChannel === "undefined") {
      channelFailed = true;
      return null;
    }
    channel = new BroadcastChannel(CHANNEL_NAME);
    return channel;
  } catch {
    channelFailed = true;
    return null;
  }
}

/** 本窗口发生过数据变更时广播 */
export function broadcastDataChanged(source = "app") {
  try {
    const msg: SyncMessage = { type: "data-changed", source, at: Date.now() };
    getChannel()?.postMessage(msg);
  } catch {
    // 忽略：不支持时依赖轮询兜底
  }
}

/** 监听其他窗口的数据变更 */
export function onDataChanged(cb: (source: string) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (e: MessageEvent<SyncMessage>) => {
    if (e.data && e.data.type === "data-changed") cb(e.data.source);
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
