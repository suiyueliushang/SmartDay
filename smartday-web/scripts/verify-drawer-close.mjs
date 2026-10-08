import { chromium } from "playwright";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
await page.goto("http://localhost:4173/#/tasks", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const now = Date.now();
  const t = { id: "dw-1", title: "撰写国情调研报告", listId: "list-inbox", completed: false, completedAt: null, priority: "medium", starred: false, dueDate: null, dueTime: null, remindAt: null, repeat: null, inMyDay: null, tags: [], subtasks: [], attachments: [], notes: "", order: 0, createdAt: now, updatedAt: now };
  await new Promise((res, rej) => { const req = indexedDB.open("smartday-db"); req.onsuccess = () => { const db = req.result; const tx = db.transaction("tasks", "readwrite"); tx.objectStore("tasks").put(t); tx.oncomplete = () => { db.close(); res(null); }; tx.onerror = () => rej(tx.error); }; req.onerror = () => rej(req.error); });
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const openDrawer = async () => {
  await page.locator(".task-item").filter({ hasText: "撰写国情调研报告" }).first().click({ timeout: 8000 });
  await page.waitForTimeout(900);
  return page.evaluate(() => !!document.querySelector(".side-drawer"));
};
const a = await openDrawer();
// ① 点击左侧空白区域（任务列表下方空白，避开导航栏/任务列表/抽屉）
await page.mouse.click(700, 700);
await page.waitForTimeout(700);
const b = await page.evaluate(() => !!document.querySelector(".side-drawer"));
// ② 切换左侧导航（切到日历，应关闭抽屉）
const c1 = await openDrawer();
await page.locator(".nav-item").filter({ hasText: "日历" }).first().click();
await page.waitForTimeout(900);
const c2 = await page.evaluate(() => !!document.querySelector(".side-drawer"));
// ③ 点抽屉内部不应关闭（回到任务页重新打开）
await page.goto("http://localhost:4173/#/tasks", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const d1 = await openDrawer();
await page.locator(".side-drawer").first().click({ position: { x: 40, y: 60 } });
await page.waitForTimeout(600);
const d2 = await page.evaluate(() => !!document.querySelector(".side-drawer"));
console.log("=== 判定 ===");
console.log(JSON.stringify({ openWorks: a, blankClickCloses: b === false, navSwitchCloses: c2 === false, insideDoesNotClose: d2 === true, errors }, null, 1));
await browser.close();