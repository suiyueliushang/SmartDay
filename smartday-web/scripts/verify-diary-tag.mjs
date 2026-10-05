import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
await page.goto(BASE + "/#/diary", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.evaluate(async () => {
  const now = Date.now();
  const t = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const day = t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate());
  const notes = [
    { id: "dt-1", title: "今天的心情", content: "带日记标签的笔记", date: day, tags: ["日记"], pinned: false, createdAt: now, updatedAt: now },
    { id: "dt-2", title: "工作纪要", content: "普通笔记", date: day, tags: ["工作"], pinned: false, createdAt: now, updatedAt: now },
  ];
  await new Promise((res, rej) => {
    const req = indexedDB.open("smartday-db");
    req.onsuccess = () => { const db = req.result; const tx = db.transaction("notes", "readwrite"); for (const n of notes) tx.objectStore("notes").put(n); tx.oncomplete = () => { db.close(); res(null); }; tx.onerror = () => rej(tx.error); };
    req.onerror = () => rej(req.error);
  });
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const list = await page.evaluate(() => Array.from(document.querySelectorAll(".note-feed-card")).map((c) => ({ t: (c.querySelector(".nfc-title-row") || {}).innerText || "", diary: c.innerText.includes("📔 日记") })));
const localDay = await page.evaluate(() => { const t = new Date(); const p = (n) => String(n).padStart(2, "0"); return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate()); });
await page.goto(BASE + "/#/diary/date:" + localDay, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const opened = await page.evaluate(() => ({ reader: (document.querySelector(".reader-title") || {}).innerText || "", overlay: !!document.querySelector(".notes-editor-overlay") }));
await page.goto(BASE + "/#/calendar", { waitUntil: "networkidle" });
await page.waitForTimeout(1800);
await page.evaluate(() => { const cells = Array.from(document.querySelectorAll(".month-cell:not(.outside)")); const c = cells.find((x) => ((x.querySelector(".cell-date") || {}).textContent || "").trim() === String(new Date().getDate())); if (c) c.click(); });
await page.waitForTimeout(900);
const daySec = await page.evaluate(() => { const el = document.querySelector(".day-detail"); return el ? el.innerText.replace(/\s+/g, " ") : ""; });
console.log(JSON.stringify({ list, opened, daySec: daySec.slice(0, 240) }, null, 1));
console.log("=== 判定 ===");
const diaryRow = list.find((x) => x.diary);
console.log(JSON.stringify({
  listBadgeShown: !!diaryRow,
  badgeOnlyOnTagged: list.filter((x) => x.diary).length === 1,
  openByDatePrefersTagged: opened.reader.includes("今天的心情"),
  dayDetailShowsDiary: daySec.includes("日记") && daySec.includes("今天的心情"),
  dayDetailNoDuplicate: daySec.split("工作纪要").length - 1 <= 1,
  errors,
}, null, 1));
await browser.close();