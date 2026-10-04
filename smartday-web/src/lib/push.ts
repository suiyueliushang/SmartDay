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
import { PushChannel, PushPreset, PushSettings } from "@/types";

export interface PushPayload {
  title: string;
  body: string;
}

/** 推送记录（最近 30 条），用于回答"这条为什么没推给我" */
export interface PushLogEntry {
  at: number;
  title: string;
  ok: boolean;
  result: string;
  via: string;
}
const LOG_KEY = "smartday.pushLog";

export function readPushLog(): PushLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const list = raw ? (JSON.parse(raw) as PushLogEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearPushLog(): void {
  try { localStorage.removeItem(LOG_KEY); } catch { /* 忽略 */ }
}

/** 记录一次推送尝试（成功/失败/被跳过） */
export function logPush(entry: PushLogEntry): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify([entry, ...readPushLog()].slice(0, 30)));
  } catch {
    /* 忽略 */
  }
}

export interface PushResult {
  ok: boolean;
  status?: number;
  message: string;
  via: "desktop" | "http" | "none";
}

export const PUSH_PRESETS: Array<{ value: PushPreset; label: string; hint: string }> = [
  { value: "qqbot", label: "QQ 官方机器人", hint: "QQ 开放平台机器人：AppID + AppSecret + 目标 openid" },
  { value: "onebot", label: "QQ 机器人（自建 OneBot）", hint: "NapCat / Lagrange / go-cqhttp 等，填服务地址 + 你的 QQ 号即可私聊推送" },
  { value: "email", label: "邮箱通知（SMTP）", hint: "填发件邮箱的 SMTP 与授权码，把提醒发到你的邮箱（QQ 邮箱可在手机 QQ/微信收到提醒）" },
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

/** 常用邮箱服务商的 SMTP 预设（一键填入） */
export const MAIL_PRESETS: Array<{ label: string; host: string; port: number; secure: "ssl" | "starttls"; hint: string }> = [
  { label: "QQ 邮箱", host: "smtp.qq.com", port: 465, secure: "ssl", hint: "设置 → 账户 → 开启 SMTP 服务 → 生成「授权码」，密码填授权码（不是 QQ 密码）" },
  { label: "163 邮箱", host: "smtp.163.com", port: 465, secure: "ssl", hint: "设置 → POP3/SMTP/IMAP → 开启 → 获取授权码" },
  { label: "126 邮箱", host: "smtp.126.com", port: 465, secure: "ssl", hint: "同上，使用授权码" },
  { label: "Gmail", host: "smtp.gmail.com", port: 465, secure: "ssl", hint: "需开启两步验证并生成「应用专用密码」" },
  { label: "Outlook", host: "smtp.office365.com", port: 587, secure: "starttls", hint: "使用应用密码（如开启了两步验证）" },
  { label: "自定义 SMTP", host: "", port: 465, secure: "ssl", hint: "自己填服务器地址与端口" },
];

/** 新建一条通道（带默认值） */
export function defaultChannel(preset: PushPreset): PushChannel {
  const base: PushChannel = {
    id: "ch-" + Math.random().toString(36).slice(2, 10),
    preset,
    enabled: true,
    url: "",
    token: "",
    qq: "",
    group: "",
    appId: "",
    appSecret: "",
    targetType: "user",
    targetOpenid: "",
    bodyTemplate: '{"title":"{title}","content":"{body}"}',
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: "ssl",
    smtpUser: "",
    smtpPass: "",
    mailFrom: "",
    mailTo: "",
  };
  if (preset === "onebot") base.url = "http://127.0.0.1:3000";
  if (preset === "email") {
    base.smtpHost = "smtp.qq.com";
    base.smtpPort = 465;
    base.smtpSecure = "ssl";
  }
  return base;
}

/** 把用户已填好的旧单通道配置迁移成 channels[] */
export function migratePush(cfg: PushSettings): PushSettings {
  if (cfg.channels?.length) return cfg;
  if (!cfg.preset) return { ...cfg, channels: [] };
  const ch = defaultChannel(cfg.preset);
  return {
    ...cfg,
    channels: [{
      ...ch,
      enabled: true,
      url: cfg.url ?? ch.url,
      token: cfg.token ?? "",
      qq: cfg.qq ?? "",
      group: cfg.group ?? "",
      appId: cfg.appId ?? "",
      appSecret: cfg.appSecret ?? "",
      targetType: cfg.targetType ?? "user",
      targetOpenid: cfg.targetOpenid ?? "",
      bodyTemplate: cfg.bodyTemplate || ch.bodyTemplate,
    }],
  };
}

/** 当前启用的通道（总开关打开且通道自身启用） */
export function activeChannels(cfg: PushSettings): PushChannel[] {
  if (!cfg?.enabled) return [];
  return (migratePush(cfg).channels ?? []).filter((c) => c.enabled);
}

function textOf(p: PushPayload): string {
  return p.body ? p.title + "\n" + p.body : p.title;
}

/** 依据通道配置拼出一次 HTTP 请求 */
export function buildPushRequest(cfg: PushChannel, payload: PushPayload): { url: string; init: RequestInit } | { error: string } {
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
async function sendQQBot(cfg: PushChannel, payload: PushPayload): Promise<PushResult> {
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
  if (!token) {
    const raw = tokenResp.data.slice(0, 200);
    // 平台常见错误码给出人话提示（HTTP 200 但返回错误码）
    const hint = /100016/.test(raw)
      ? "（AppID 或 AppSecret 无效：请到后台重新复制**完整**密钥——密钥可能只完整显示一次或已脱敏）"
      : /100007/.test(raw)
        ? "（access_token 相关错误，请检查 AppID/Secret 与机器人状态）"
        : "";
    return { ok: false, status: tokenResp.status, message: "获取 access_token 失败" + hint + "：" + raw, via: tokenResp.via };
  }

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
/** 通过单条通道发送（带记录） */
export async function sendChannel(ch: PushChannel, payload: PushPayload): Promise<PushResult> {
  const r = await sendPushInner(ch, payload);
  logPush({
    at: Date.now(),
    title: payload.title,
    ok: r.ok,
    result: (ch.label || presetLabel(ch.preset)) + "：" + r.message,
    via: r.via,
  });
  return r;
}

/**
 * 通过所有已启用通道发送（可同时 QQ 机器人 + 邮箱 + …）
 * 只要有一条成功就算整体成功。
 */
export async function sendPushAll(cfg: PushSettings, payload: PushPayload): Promise<PushResult> {
  const list = activeChannels(cfg);
  if (!list.length) {
    logPush({ at: Date.now(), title: payload.title, ok: false, result: "没有已启用的通知通道（设置 → 推送 添加并打开）", via: "none" });
    return { ok: false, message: "没有已启用的通知通道", via: "none" };
  }
  const results = await Promise.all(list.map((ch) => sendChannel(ch, payload)));
  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    return {
      ok: okCount > 0,
      message: "成功 " + okCount + "/" + results.length + " 条通道；失败：" + failed.map((f) => f.message).join("；").slice(0, 200),
      via: results[0].via,
    };
  }
  return { ok: true, message: "已通过 " + okCount + " 条通道发送", via: results[0].via };
}

/**
 * 邮箱通道：浏览器无法直连 SMTP，必须由桌面端主进程发送（nodemailer）。
 */
async function sendEmail(cfg: PushChannel, payload: PushPayload): Promise<PushResult> {
  if (!cfg.smtpHost) return { ok: false, message: "请填写 SMTP 服务器（如 smtp.qq.com）", via: "none" };
  if (!cfg.smtpUser) return { ok: false, message: "请填写发件邮箱账号", via: "none" };
  if (!cfg.smtpPass) return { ok: false, message: "请填写邮箱授权码（不是登录密码）", via: "none" };
  const to = (cfg.mailTo || cfg.smtpUser).trim();
  const api = window.desktopAPI;
  if (!api?.mailSend) {
    return { ok: false, message: "邮箱通知需要在桌面端发送（浏览器无法直连 SMTP）；请用桌面端，或改用 QQ 机器人/Server酱 等通道", via: "none" };
  }
  try {
    const r = await api.mailSend({
      host: cfg.smtpHost.trim(),
      port: Number(cfg.smtpPort) || 465,
      secure: cfg.smtpSecure,
      user: cfg.smtpUser.trim(),
      pass: cfg.smtpPass,
      from: (cfg.mailFrom || cfg.smtpUser).trim(),
      to,
      subject: payload.title,
      text: textOf(payload),
    });
    return r?.ok
      ? { ok: true, message: "邮件已发送到 " + to, via: "desktop" }
      : { ok: false, message: "邮件发送失败：" + (r?.error ?? "未知错误"), via: "desktop" };
  } catch (e) {
    return { ok: false, message: "邮件发送异常：" + String((e as Error)?.message ?? e), via: "desktop" };
  }
}

async function sendPushInner(cfg: PushChannel, payload: PushPayload): Promise<PushResult> {
  if (!cfg.enabled) return { ok: false, message: "该通道未启用", via: "none" };
  if (cfg.preset === "email") return sendEmail(cfg, payload);
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

/** 设置页「测试」按钮：测单条通道 */
export async function testChannel(ch: PushChannel): Promise<PushResult> {
  return sendChannel({ ...ch, enabled: true }, {
    title: "SmartDay 推送测试",
    body: "这条消息来自 SmartDay 的推送测试。看到它就说明通道已打通 ✅",
  });
}
