import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
await page.goto(BASE + "/#/overview", { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const navText = await page.evaluate(() => document.querySelector(".sidebar").innerText.replace(/\s+/g, " ").trim());
const before = await page.evaluate(() => Math.round(document.querySelector(".sidebar").getBoundingClientRect().width));
const box = await page.locator(".nav-resizer").boundingBox();
await page.mouse.move(box.x + 3, box.y + 300);
await page.mouse.down();
await page.mouse.move(box.x + 90, box.y + 300, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);
const after = await page.evaluate(() => Math.round(document.querySelector(".sidebar").getBoundingClientRect().width));
const stored = await page.evaluate(() => localStorage.getItem("smartday.navWidth"));
// 刷新后应沿用
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1600);
const reloaded = await page.evaluate(() => Math.round(document.querySelector(".sidebar").getBoundingClientRect().width));
// 双击恢复默认
const box2 = await page.locator(".nav-resizer").boundingBox();
await page.mouse.dblclick(box2.x + 3, box2.y + 300);
await page.waitForTimeout(600);
const afterReset = await page.evaluate(() => Math.round(document.querySelector(".sidebar").getBoundingClientRect().width));
const storedAfterReset = await page.evaluate(() => localStorage.getItem("smartday.navWidth"));
// 旧路由 #/desktop 应回落到概览（且不再有桌面日历导航项）
await page.goto(BASE + "/#/desktop", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const desktopRoute = await page.evaluate(() => ({ hash: location.hash, hasOverview: !!document.querySelector(".overview-grid"), navHasDesktop: document.querySelector(".sidebar").innerText.includes("桌面日历") }));
await page.screenshot({ path: ".smoke/nav-resize.png" });
console.log(JSON.stringify({ before, after, stored, reloaded, afterReset, storedAfterReset, navText, desktopRoute, errors }, null, 1));
console.log("=== 判定 ===");
console.log(JSON.stringify({
  desktopNavRemoved: !navText.includes("桌面日历"),
  dragWorks: after > before + 60,
  persisted: stored === String(after),
  reloadUsesStored: Math.abs(reloaded - after) <= 1,
  doubleClickResets: afterReset < after && storedAfterReset === null && afterReset > 200,
  desktopRouteFallsBack: desktopRoute.hasOverview && !desktopRoute.navHasDesktop,
}, null, 1));
await browser.close();