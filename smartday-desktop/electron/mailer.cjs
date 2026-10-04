// ============================================================
// 邮件发送（SMTP）：仅在 Electron 主进程使用（nodemailer）
// 支持 465 SSL / 587 STARTTLS / 25 明文；QQ 邮箱用「授权码」当密码
// ============================================================
const nodemailer = require('nodemailer');

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
async function sendMail(cfg, msg) {
  try {
    if (!cfg || !cfg.host) return { ok: false, error: '未配置 SMTP 服务器' };
    const transport = buildTransport(cfg);
    const info = await transport.sendMail({
      from: String(cfg.from || cfg.user || '').trim(),
      to: String(cfg.to || cfg.user || '').trim(),
      subject: String(msg.subject || 'SmartDay 提醒'),
      text: String(msg.text || ''),
    });
    return { ok: true, messageId: info && info.messageId };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 300) };
  }
}

module.exports = { sendMail, buildTransport };
