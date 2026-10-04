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
    case "qqbot":
      // 官方机器人需要先换 access_token，属于"两步请求"，在 sendPush 里单独处理
      return { error: "QQ 官方机器人走两步流程（见 sendQQBot）" };
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

interface HttpResult { ok: boolean; status?: number; data: string; error?: string; via: "desktop" | "http" }

/** 发一个 HTTP 请求：桌面端走主进程（无 CORS），否则浏览器 fetch */
async function httpRequest(url: string, init: RequestInit): Promise<HttpResult> {
  const api = window.desktopAPI;
  const method = (init.method as string) ?? "POST";
  const headers = (init.headers as Record<string, string>) ?? {};
  const body = typeof init.body === "string" ? init.body : undefined;
  if (api?.pushNotify) {
    try {
      const r = await api.pushNotify({ url, method, headers, body });
      return { ok: !!r?.ok, status: r?.status, data: String(r?.data ?? ""), error: r?.error, via: "desktop" };
    } catch (e) {
      return { ok: false, data: "", error: String((e as Error)?.message ?? e), via: "desktop" };
    }
  }
  try {
    const resp = await fetch(url, { ...init, mode: "cors" });
    const data = await resp.text().catch(() => "");
    return { ok: resp.ok, status: resp.status, data, error: resp.ok ? undefined : "HTTP " + resp.status, via: "http" };
  } catch (e) {
    return {
      ok: false, data: "",
      error: String((e as Error)?.message ?? e) + "（浏览器可能被 CORS 拦截，桌面端不受此限制）",
      via: "http",
    };
  }
}

/**
 * 官方 QQ 机器人：两步发送
 *  ① POST https://bots.qq.com/app/getAppAccessToken  { appId, clientSecret }  → access_token
 *  ② POST https://api.sgroup.qq.com/v2/(users|groups)/{openid}/messages
 *     Header: Authorization: QQBot {access_token}
 *  说明：平台对「主动消息」有额度限制，且目标 openid 需来自与该机器人的真实互动（用户先给机器人发过消息 / 群里有过互动）。
 */
async function sendQQBot(cfg: PushSettings, payload: PushPayload): Promise<PushResult> {
  const appId = (cfg.appId || "").trim();
  const secret = (cfg.appSecret || "").trim();
  const openid = (cfg.targetOpenid || "").trim();
  if (!appId) return { ok: false, message: "请填写 AppID", via: "none" };
  if (!secret) return { ok: false, message: "请填写 AppSecret", via: "none" };
  if (!openid) return { ok: false, message: "请填写目标 openid（单聊用户或群）", via: "none" };

  const tokenResp = await httpRequest("https://bots.qq.com/app/getAppAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId, clientSecret: secret }),
  });
  if (!tokenResp.ok) {
    return { ok: false, status: tokenResp.status, message: "获取 access_token 失败：" + (tokenResp.error ?? "") + " " + tokenResp.data.slice(0, 160), via: tokenResp.via };
  }
  let token = "";
  try {
    token = String(JSON.parse(tokenResp.data)?.access_token ?? "");
  } catch {
    /* 解析失败 */
  }
  if (!token) return { ok: false, status: tokenResp.status, message: "access_token 解析失败：" + tokenResp.data.slice(0, 160), via: tokenResp.via };

  const isGroup = cfg.targetType === "group";
  const url = isGroup
    ? "https://api.sgroup.qq.com/v2/groups/" + openid + "/messages"
    : "https://api.sgroup.qq.com/v2/users/" + openid + "/messages";
  const sendResp = await httpRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "QQBot " + token,
      "X-Union-Appid": appId,
    },
    body: JSON.stringify({ content: textOf(payload), msg_type: 0, msg_seq: Math.floor(Date.now() / 1000) % 100000 }),
  });
  if (!sendResp.ok) {
    const hint = /22009|频率|limit|quota/i.test(sendResp.data) ? "（可能是主动消息额度/频率限制）" : "";
    return { ok: false, status: sendResp.status, message: "发送失败：" + (sendResp.error ?? "") + " " + sendResp.data.slice(0, 200) + hint, via: sendResp.via };
  }
  return { ok: true, status: sendResp.status, message: "已发送（" + (isGroup ? "群" : "单聊") + "）", via: sendResp.via };
}

/** 发送一次推送（优先走桌面端主进程，避免 CORS） */
export async function sendPush(cfg: PushSettings, payload: PushPayload): Promise<PushResult> {
  if (!cfg.enabled) return { ok: false, message: "推送未开启", via: "none" };
  if (cfg.preset === "qqbot") return sendQQBot(cfg, payload);
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
