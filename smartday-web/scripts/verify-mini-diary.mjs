import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
await page.goto(BASE + "/#/overview", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const day = await page.evaluate(async () => {
  const now = Date.now();
  const t = new Date();
  const q = (n) => String(n).padStart(2, "0");
  const d = t.getFullYear() + "-" + q(t.getMonth() + 1) + "-" + q(t.getDate());
  await new Promise((res, rej) => {
    const r = indexedDB.open("smartday-db");
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(["notes"], "readwrite");
      tx.objectStore("notes").put({ id: "mu-1", title: "标签日记", content: "x", date: d, tags: ["日记"], pinned: false, createdAt: now, updatedAt: now });
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  });
  return d;
});
console.log("seed date:", day);
// 全新加载：数据已在库中
await page.goto(BASE + "/#/overview", { waitUntil: "networkidle" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3500);
const mini = await page.evaluate(() => {
  const days = Array.from(document.querySelectorAll(".mini-day"));
  const marked = days.filter((d) => d.innerText.includes("📝"));
  const today = days.find((d) => d.classList.contains("today"));
  return { dayCount: days.length, marked: marked.length, markedTexts: marked.map((d) => d.innerText.trim()).slice(0, 3), todayText: today ? today.innerText.trim() : null };
});
console.log("迷你日历:", JSON.stringify(mini));
// 对比：月视图同一数据
await page.goto(BASE + "/#/calendar", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const month = await page.evaluate((dayNum) => {
  const cells = Array.from(document.querySelectorAll(".month-cell:not(.outside)"));
  const c = cells.find((x) => ((x.querySelector(".cell-date") || {}).textContent || "").trim() === String(dayNum));
  return { hasDiary: c ? c.innerText.includes("📝") : false, text: c ? c.innerText.replace(/\s+/g, " ").slice(0, 50) : "" };
}, Number(day.slice(-2)));
console.log("月视图:", JSON.stringify(month));
console.log("=== 判定 ===");
console.log(JSON.stringify({
  miniCalendarShowsDiary: mini.marked >= 1,
  miniTodayCellText: mini.todayText,
  monthViewShowsDiary: month.hasDiary,
  consistent: (mini.marked >= 1) === month.hasDiary,
  errors,
}, null, 1));
await browser.close();