import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 140)); });
await page.goto(BASE + "/#/overview", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
// 造数据：今天既有一条传统 diary 记录，又有一条带「日记」标签的笔记（审计指出的重复场景）
const day = await page.evaluate(async () => {
  const now = Date.now();
  const t = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const d = t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate());
  const diaries = [{ id: "du-diary", date: d, title: "传统日记内容", content: "old", mood: "smile", createdAt: now, updatedAt: now }];
  const notes = [{ id: "du-note", title: "带标签的日记", content: "new", date: d, tags: ["日记"], pinned: false, createdAt: now, updatedAt: now }];
  await new Promise((res, rej) => {
    const req = indexedDB.open("smartday-db");
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["diaries", "notes"], "readwrite");
      for (const x of diaries) tx.objectStore("diaries").put(x);
      for (const x of notes) tx.objectStore("notes").put(x);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
  return d;
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2200);
// ① 概览迷你日历：今天应有 📝 标记（此前只认 diaries，标签笔记不显示）
const mini = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll(".mini-day"));
  const withDiary = cells.filter((c) => c.innerText.includes("📝"));
  return { cellCount: cells.length, diaryMarked: withDiary.length, texts: withDiary.slice(0, 2).map((c) => c.innerText.replace(/\s+/g, " ").slice(0, 30)) };
});
console.log("迷你日历:", JSON.stringify(mini));
// ② 日历月视图：今天格子应有 📝
await page.goto(BASE + "/#/calendar", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const month = await page.evaluate((dayNum) => {
  const cells = Array.from(document.querySelectorAll(".month-cell:not(.outside)"));
  const cell = cells.find((c) => ((c.querySelector(".cell-date") || {}).textContent || "").trim() === String(dayNum));
  return { found: !!cell, text: cell ? cell.innerText.replace(/\s+/g, " ").slice(0, 60) : "", hasDiary: cell ? cell.innerText.includes("📝") : false };
}, Number(day.slice(-2)));
console.log("月视图今天格:", JSON.stringify(month));
// ③ 点击该日 → 当天详情：日记只应出现一行，且优先显示带标签的笔记
await page.evaluate((dayNum) => {
  const cells = Array.from(document.querySelectorAll(".month-cell:not(.outside)"));
  const cell = cells.find((c) => ((c.querySelector(".cell-date") || {}).textContent || "").trim() === String(dayNum));
  if (cell) cell.click();
}, Number(day.slice(-2)));
await page.waitForTimeout(900);
const detail = await page.evaluate(() => {
  const el = document.querySelector(".day-detail");
  if (!el) return null;
  const rows = Array.from(el.querySelectorAll(".dd-item")).map((x) => x.innerText.replace(/\s+/g, " ").trim());
  const diaryRows = rows.filter((r) => r.includes("日记"));
  const title = el.innerText.match(/笔记\/日记\s*(\d+)/);
  return { rows, diaryRows, count: title ? Number(title[1]) : -1, full: el.innerText.replace(/\s+/g, " ").slice(0, 160) };
});
console.log("当天详情:", JSON.stringify(detail));
console.log("=== 判定 ===");
console.log(JSON.stringify({
  miniCalendarShowsTaggedDiary: mini.diaryMarked >= 1,
  monthCellShowsTaggedDiary: month.hasDiary,
  dayDetailSingleDiaryRow: detail ? detail.diaryRows.length === 1 : false,
  dayDetailPrefersTaggedNote: detail ? detail.full.includes("带标签的日记") : false,
  dayDetailCountMatches: detail ? detail.count === detail.rows.length : false,
  errors,
}, null, 1));
await browser.close();