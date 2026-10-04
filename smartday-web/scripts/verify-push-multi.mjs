import { chromium } from "playwright";
import http from "node:http";
const got = [];
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => { got.push({ url: req.url, body: b }); res.writeHead(200, { "Content-Type": "application/json" }); res.end("{\"status\":\"ok\"}"); });
});
await new Promise((r) => server.listen(5199, "127.0.0.1", r));
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 160)); });
await page.goto(BASE + "/#/settings/tab:push", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
// 添加两条通道：OneBot + 邮箱
await page.locator(".push-tile").filter({ hasText: "OneBot" }).first().click();
await page.waitForTimeout(600);
await page.locator(".push-tile").filter({ hasText: "邮箱通知" }).first().click();
await page.waitForTimeout(800);
await page.locator(".push-ch").first().locator("input[placeholder=\"http://127.0.0.1:3000\"]").fill("http://127.0.0.1:5199");
await page.locator(".push-ch").first().locator("input[placeholder=\"如 10001\"]").fill("2837644648");
// 邮箱通道：点「QQ 邮箱」自动填服务器
await page.locator(".push-ch").nth(1).locator("button").filter({ hasText: "QQ 邮箱" }).first().click();
await page.waitForTimeout(500);
const after = await page.evaluate(() => {
  const chs = Array.from(document.querySelectorAll(".push-ch"));
  const mail = chs.find((c) => c.innerText.includes("邮箱通知"));
  const mailHost = mail ? mail.querySelector("input[placeholder=\"smtp.qq.com\"]").value : "";
  const mailPort = mail ? mail.querySelector("input[type=number]").value : "";
  const state = document.querySelector(".push-status-card .ps-desc").innerText.replace(/\s+/g, " ");
  return { channelCount: chs.length, mailHost, mailPort, state };
});
// 点第一条通道的「发送测试」→ 假 OneBot 服务应收到
await page.locator(".push-ch").first().locator("button").filter({ hasText: "发送测试" }).first().click();
await page.waitForTimeout(2500);
const inline = await page.evaluate(() => { const el = document.querySelector(".push-inline-result"); return el ? el.innerText.replace(/\s+/g, " ").trim() : ""; });
// 停用邮箱通道 → 计数应变 1
await page.locator(".push-ch").nth(1).locator(".switch").first().click({ force: true });
await page.waitForTimeout(600);
const off = await page.evaluate(() => { const el = document.querySelector(".card-title"); return el ? el.innerText.replace(/\s+/g, " ") : ""; });
await page.locator(".settings-layout").screenshot({ path: ".smoke/push-multichannel.png" });
console.log(JSON.stringify({ after, inline, off, got }, null, 1));
let pl = {}; try { pl = JSON.parse(got[0] ? got[0].body : "{}"); } catch {}
console.log("=== 判定 ===");
console.log(JSON.stringify({
  twoChannels: after.channelCount === 2,
  mailPresetFilled: after.mailHost === "smtp.qq.com" && after.mailPort === "465",
  countShown: after.state.includes("2 条方式，2 条已启用"),
  onebotTestSent: got.length === 1 && pl.user_id === 2837644648,
  inlineSuccess: inline.includes("✅"),
  disableReflects: off.includes("已启用 1"),
  errors,
}, null, 1));
await browser.close(); server.close();