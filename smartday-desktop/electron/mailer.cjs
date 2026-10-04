// ============================================================
// 邮件发送（SMTP）：仅在 Electron 主进程使用（nodemailer）
// 支持 465 SSL / 587 STARTTLS / 25 明文；QQ 邮箱用「授权码」当密码
// 入参兼容两种形状：
//   ① sendMail(config, { subject, text })            —— 直接调用
//   ② sendMail({ host, port, …, subject, text })     —— 渲染进程 IPC 平铺字段
//   ③ sendMail({ config: {…}, subject, text })       —— 包裹形式
// ============================================================
const nodemailer = require('nodemailer');

/** 归一化入参：返回 { config, subject, text } */
function normalizeMail(payload, msg) {
  if (msg) return { config: payload || {}, subject: msg.subject, text: msg.text };
  const src = (payload && payload.config) || payload || {};
  return { config: src, subject: src.subject, text: src.text };
}

function buildTransport(cfg) {
  const secure = cfg.secure === 'ssl';
  const opts = {
    host: String(cfg.host || '').trim(),
    port: Number(cfg.port) || (secure ? 465 : 587),
    secure,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 25000,
  };
  if (cfg.user) opts.auth = { user: String(cfg.user).trim(), pass: String(cfg.pass || '') };
  if (cfg.secure === 'starttls') opts.requireTLS = true;
  return nodemailer.createTransport(opts);
}

/** 发送一封邮件；返回 { ok, messageId } 或 { ok:false, error } */
async function sendMail(payload, msg) {
  const n = normalizeMail(payload, msg);
  const cfg = n.config;
  try {
    if (!cfg || !String(cfg.host || '').trim()) return { ok: false, error: '未配置 SMTP 服务器（host 为空）' };
    if (!String(cfg.user || '').trim()) return { ok: false, error: '未配置发件邮箱（user 为空）' };
    const transport = buildTransport(cfg);
    const info = await transport.sendMail({
      from: String(cfg.from || cfg.user || '').trim(),
      to: String(cfg.to || cfg.user || '').trim(),
      subject: String(n.subject || 'SmartDay 提醒'),
      text: String(n.text || ''),
    });
    return { ok: true, messageId: info && info.messageId };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 300) };
  }
}

module.exports = { sendMail, buildTransport, normalizeMail };
