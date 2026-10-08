import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 150)); });
await page.goto(BASE + "/#/tasks", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const now = Date.now();
  const t = new Date();
  const q = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + q(d.getMonth() + 1) + "-" + q(d.getDate());
  const off = (n) => { const x = new Date(t); x.setDate(x.getDate() + n); return ymd(x); };
  const lists = [
    { id: "tv-work", name: "工作", color: "#f59f00", order: 1, createdAt: now, updatedAt: now },
    { id: "tv-life", name: "生活", color: "#22c55e", order: 2, createdAt: now, updatedAt: now }
  ];
  const mk = (id, title, listId, pri, starred, due) => ({ id, title, listId, completed: false, completedAt: null, priority: pri, starred, dueDate: due, dueTime: null, remindAt: null, repeat: null, inMyDay: null, tags: [], subtasks: [], attachments: [], notes: "", order: 0, createdAt: now, updatedAt: now });
  const tasks = [
    mk("tv-1", "投标材料", "tv-work", "high", true, off(0)),
    mk("tv-2", "年度规划", "tv-work", "medium", true, off(10)),
    mk("tv-3", "回邮件", "tv-life", "low", false, off(1)),
    mk("tv-4", "整理桌面", "tv-life", "none", false, off(20))
  ];
  await new Promise((res, rej) => {
    const r = indexedDB.open("smartday-db");
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(["tasks", "lists"], "readwrite");
      for (const x of lists) tx.objectStore("lists").put(x);
      for (const x of tasks) tx.objectStore("tasks").put(x);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  });
}).catch((e) => console.error("seed error:", String(e).slice(0, 120)));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const snap = () => page.evaluate(() => ({
  boardCols: document.querySelectorAll(".board-col").length,
  boardCards: document.querySelectorAll(".board-card").length,
  quadrants: document.querySelectorAll(".quadrant").length,
  quadCounts: Array.from(document.querySelectorAll(".quadrant")).map((q) => q.querySelectorAll(".board-card").length),
  calCells: document.querySelectorAll(".task-cal-cell").length,
  calItems: document.querySelectorAll(".task-cal-item").length,
  tabs: Array.from(document.querySelectorAll(".task-toolbar .seg button")).map((b) => b.textContent.trim()),
}));
const click = async (label) => {
  await page.locator(".task-toolbar .seg button").filter({ hasText: label }).first().click({ timeout: 8000 });
  await page.waitForTimeout(700);
};
const s1 = await snap();
await click("看板"); const s2 = await snap();
await click("四象限"); const s3 = await snap();
await click("日历"); const s4 = await snap();
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const s5 = await snap();
const saved = await page.evaluate(() => localStorage.getItem("smartday.taskView"));
console.log("列表:", JSON.stringify(s1));
console.log("看板:", JSON.stringify(s2));
console.log("四象限:", JSON.stringify(s3));
console.log("日历:", JSON.stringify(s4));
console.log("刷新后:", JSON.stringify(s5), "saved=", saved);
console.log("=== 判定 ===");
console.log(JSON.stringify({
  fourTabs: s1.tabs.join("|") === "列表|看板|四象限|日历",
  boardColumns: s2.boardCols >= 2,
  boardCards: s2.boardCards >= 4,
  quadrants4: s3.quadrants === 4,
  quadrantCounts: s3.quadCounts,
  calendarGrid: s4.calCells === 42,
  calendarItems: s4.calItems >= 3,
  persisted: s5.calCells === 42 && saved === "calendar",
  errors,
}, null, 1));
await browser.close();