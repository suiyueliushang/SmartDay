// ============================================================
// 外部推送通道：把提醒发到 QQ / 企业微信 / 钉钉 / 飞书 / 推送服务
// ------------------------------------------------------------
// 支持的通道：
//   1. onebot   —— 自建 QQ 机器人（NapCat / Lagrange / go-cqhttp 等，OneBot v11 HTTP）
//                  可发私聊（需 QQ 号）或群消息（需群号）——「发到我的 QQ」用这个
//   2. qqbot    —— QQ 开放平台官方机器人（频道/群），需机器人 Token + 频道 ID
//   3. wecom    —— 企业微信群机器人 Webhook
//   4. dingtalk —— 钉钉群机器人 Webhook
//   5. feishu   —— 飞书群机器人 Webhook
//   6. serverchan —— Server 酱（微信推送，SendKey）
//   7. pushplus —— PushPlus（微信推送，token）
//   8. custom   —— 自定义 Webhook（自定义请求体模板）
// 说明：浏览器里直接请求第三方地址可能被 CORS 拦截；桌面端会走主进程发送（无 CORS 限制）。
// ============================================================
import { PushPreset, PushSettings } from "@/types";

export interface PushPayload {
  title: string;
  body: string;
}

export interface PushResult {
  ok: boolean;
  status?: number;
  message: string;
  via: "desktop" | "http" | "none";
}

export const PUSH_PRESETS: Array<{ value: PushPreset; label: string; hint: string }> = [
  { value: "onebot", label: "QQ 机器人（自建 OneBot）", hint: "NapCat / Lagrange / go-cqhttp 等，填服务地址 + 你的 QQ 号即可私聊推送" },
  { value: "qqbot", label: "QQ 官方机器人（频道/群）", hint: "QQ 开放平台机器人，填机器人 Token 与频道 ID；主动消息受平台限制" },
  { value: "wecom", label: "企业微信群机器人", hint: "群设置 → 群机器人 → 添加 → 复制 Webhook 地址" },
  { value: "dingtalk", label: "钉钉群机器人", hint: "群设置 → 智能群助手 → 添加机器人 → 复制 Webhook" },
  { value: "feishu", label: "飞书群机器人", hint: "群设置 → 群机器人 → 添加 → 复制 Webhook 地址" },
  { value: "serverchan", label: "Server 酱（微信）", hint: "填 SendKey，推送到微信「Server酱」服务号" },
  { value: "pushplus", label: "PushPlus（微信）", hint: "填 token，推送到微信「PushPlus 推送加」" },
  { value: "custom", label: "自定义 Webhook", hint: "自己填地址与请求体模板，{title} / {body} 会被替换" },
];

export function presetLabel(p: PushPreset): string {
  return PUSH_PRESETS.find((x) => x.value === p)?.label ?? p;
}

function textOf(p: PushPayload): string {
  return p.body ? p.title + "\n" + p.body : p.title;
}

/** 依据通道配置拼出一次 HTTP 请求 */
export function buildPushRequest(cfg: PushSettings, payload: PushPayload): { url: string; init: RequestInit } | { error: string } {
  const text = textOf(payload);
  const json = (body: unknown, headers: Record<string, string> = {}) => ({
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const base = (cfg.url || "").replace(/\/+$/, "");

  switch (cfg.preset) {
    case "onebot": {
      if (!base) return { error: "请填写 OneBot 服务地址，例如 http://127.0.0.1:3000" };
      const headers: Record<string, string> = {};
      if (cfg.token) headers.Authorization = "Bearer " + cfg.token;
      if (cfg.group && cfg.group.trim()) {
        const gid = Number(cfg.group.trim());
        if (!Number.isFinite(gid)) return { error: "群号必须是数字" };
        const r = json({ group_id: gid, message: text, auto_escape: false }, headers);
        return { url: base + "/send_group_msg", init: { method: "POST", ...r } };
      }
      const qq = Number((cfg.qq || "").trim());
      if (!Number.isFinite(qq) || qq <= 0) return { error: "请填写接收私聊的 QQ 号（或填群号改发群）" };
      const r = json({ user_id: qq, message: text, auto_escape: false }, headers);
      return { url: base + "/send_private_msg", init: { method: "POST", ...r } };
    }
    case "qqbot": {
      const api = base || "https://api.sgroup.qq.com";
      if (!cfg.appToken) return { error: "请填写机器人 Token" };
      if (!cfg.channelId) return { error: "请填写频道 ID" };
      const r = json({ content: text });
      return {
        url: api + "/channels/" + cfg.channelId.trim() + "/messages",
        init: { method: "POST", ...r, headers: { ...(r.headers as Record<string, string>), Authorization: "QQBot " + cfg.appToken } },
      };
    }
    case "wecom": {
      if (!base) return { error: "请填写企业微信机器人 Webhook 地址" };
      const r = json({ msgtype: "text", text: { content: text } });
      return { url: base, init: { method: "POST", ...r } };
    }
    case "dingtalk": {
      if (!base) return { error: "请填写钉钉机器人 Webhook 地址" };
      const r = json({ msgtype: "text", text: { content: text } });
      return { url: base, init: { method: "POST", ...r } };
    }
    case "feishu": {
      if (!base) return { error: "请填写飞书机器人 Webhook 地址" };
      const r = json({ msg_type: "text", content: { text } });
      return { url: base, init: { method: "POST", ...r } };
    }
    case "serverchan": {
      if (!cfg.token) return { error: "请填写 Server 酱 SendKey" };
      const form = new URLSearchParams({ title: payload.title, desp: payload.body });
      return {
        url: "https://sctapi.ftqq.com/" + cfg.token.trim() + ".send",
        init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() },
      };
    }
    case "pushplus": {
      if (!cfg.token) return { error: "请填写 PushPlus token" };
      const r = json({ token: cfg.token.trim(), title: payload.title, content: payload.body || payload.title, template: "markdown" });
      return { url: "https://www.pushplus.plus/send", init: { method: "POST", ...r } };
    }
    case "custom":
    default: {
      if (!base) return { error: "请填写 Webhook 地址" };
      const tpl = cfg.bodyTemplate || '{"title":"{title}","content":"{body}"}';
      const raw = tpl.split("{title}").join(payload.title).split("{body}").join(payload.body ?? "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.token) headers.Authorization = "Bearer " + cfg.token;
      return { url: base, init: { method: "POST", headers, body: raw } };
    }
  }
}

/** 发送一次推送（优先走桌面端主进程，避免 CORS） */
export async function sendPush(cfg: PushSettings, payload: PushPayload): Promise<PushResult> {
  if (!cfg.enabled) return { ok: false, message: "推送未开启", via: "none" };
  const built = buildPushRequest(cfg, payload);
  if ("error" in built) return { ok: false, message: built.error, via: "none" };
  const { url, init } = built;

  // 1) 桌面端：交给主进程发（无 CORS 限制）
  const api = window.desktopAPI;
  if (api?.pushNotify) {
    try {
      const r = await api.pushNotify({
        url,
        method: (init.method as string) ?? "POST",
        headers: (init.headers as Record<string, string>) ?? {},
        body: typeof init.body === "string" ? init.body : undefined,
      });
      return { ok: !!r?.ok, status: r?.status, message: r?.ok ? "已发送（桌面端）" : "桌面端发送失败：" + (r?.error ?? r?.status ?? "未知错误"), via: "desktop" };
    } catch (e) {
      return { ok: false, message: "桌面端发送异常：" + String((e as Error)?.message ?? e), via: "desktop" };
    }
  }

  // 2) 浏览器：直接 fetch（可能被 CORS 拦截）
  try {
    const resp = await fetch(url, { ...init, mode: "cors" });
    return {
      ok: resp.ok,
      status: resp.status,
      message: resp.ok ? "已发送" : "HTTP " + resp.status + "（若为 CORS/权限问题，请用桌面端或检查地址与令牌）",
      via: "http",
    };
  } catch (e) {
    return { ok: false, message: "发送失败：" + String((e as Error)?.message ?? e) + "（浏览器可能被 CORS 拦截，桌面端不受此限制）", via: "http" };
  }
}

/** 设置页「测试推送」用 */
export async function testPush(cfg: PushSettings): Promise<PushResult> {
  return sendPush({ ...cfg, enabled: true }, {
    title: "SmartDay 推送测试",
    body: "这条消息来自 SmartDay 的推送测试。看到它就说明通道已打通 ✅",
  });
}
