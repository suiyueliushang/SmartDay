import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
await page.goto(BASE + "/#/tasks", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const tabs = await page.evaluate(() => Array.from(document.querySelectorAll(".task-toolbar .seg button")).map((b) => b.textContent.trim()));
console.log("视图标签:", JSON.stringify(tabs));
const out = [];
for (const [label, file] of [["列表", "tv-list"], ["看板", "tv-board"], ["四象限", "tv-quadrants"], ["日历", "tv-calendar"]]) {
  try {
    await page.locator(".task-toolbar .seg button").filter({ hasText: label }).first().click({ timeout: 5000 });
    await page.waitForTimeout(700);
    await page.locator(".content").screenshot({ path: ".smoke/" + file + ".png" });
    out.push({ label, ok: true });
  } catch (e) { out.push({ label, ok: false, err: String(e).slice(0, 80) }); }
}
console.log("截图:", JSON.stringify(out));
console.log("errors:", JSON.stringify(errors));
await browser.close();