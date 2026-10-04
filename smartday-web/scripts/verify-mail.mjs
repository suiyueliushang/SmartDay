// 用本地假 SMTP 服务器验证「邮箱通知」发送链路（走 mailer.cjs / nodemailer）
import net from "node:net";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mailer = require("../../smartday-desktop/electron/mailer.cjs");

const captured = [];
const server = net.createServer((sock) => {
  let inData = false;
  let buf = "";
  let body = [];
  sock.write("220 fake-smtp ready\r\n");
  sock.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (inData) {
        if (line === ".") { inData = false; captured.push(body.join("\n")); body = []; sock.write("250 OK queued\r\n"); }
        else body.push(line);
        continue;
      }
      const up = line.toUpperCase();
      if (up.startsWith("EHLO") || up.startsWith("HELO")) sock.write("250-fake\r\n250 AUTH LOGIN PLAIN\r\n");
      else if (up.startsWith("AUTH")) sock.write("235 2.7.0 accepted\r\n");
      else if (up.startsWith("MAIL FROM") || up.startsWith("RCPT TO")) sock.write("250 OK\r\n");
      else if (up.startsWith("DATA")) { inData = true; body = []; sock.write("354 End data with <CR><LF>.<CR><LF>\r\n"); }
      else if (up.startsWith("QUIT")) { sock.write("221 Bye\r\n"); sock.end(); }
      else sock.write("250 OK\r\n");
    }
  });
});
await new Promise((r) => server.listen(2525, "127.0.0.1", r));

const res = await mailer.sendMail(
  { host: "127.0.0.1", port: 2525, secure: "none", user: "me@qq.com", pass: "authcode", from: "me@qq.com", to: "me@qq.com" },
  { subject: "📅 事件提醒：项目评审会", text: "15:00 开始 · 会议室 A" }
);
console.log("发送结果:", JSON.stringify(res));
const raw = captured.join("\n");
console.log("=== 假服务器收到的邮件 ===");
console.log(raw.slice(0, 400));

console.log("=== 判定 ===");
console.log(JSON.stringify({
  sendOk: res.ok === true,
  hasMessageId: !!res.messageId,
  smtpReceived: captured.length > 0,
  hasSubjectEncoded: /Subject:/i.test(raw),
  hasTo: /To: *me@qq\.com/i.test(raw),
  hasBodyHint: raw.includes("15:00") || raw.includes("5:00") || /base64/i.test(raw),
}, null, 1));
server.close();