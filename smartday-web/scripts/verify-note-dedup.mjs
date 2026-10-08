import { chromium } from "playwright";
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
await page.goto(BASE + "/#/diary", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const before = await page.evaluate(async () => {
  const r = await new Promise((res) => { const q = indexedDB.open("smartday-db"); q.onsuccess = () => res(q.result); });
  const tx = r.transaction("notes", "readonly");
  const n = await new Promise((res) => { const q = tx.objectStore("notes").count(); q.onsuccess = () => res(q.result); });
  r.close();
  return n;
});
// 新建一篇笔记，快速输入触发多次自动保存（含失焦），检查是否只创建一条
await page.locator("button").filter({ hasText: "新建笔记" }).first().click({ timeout: 8000 });
await page.waitForTimeout(800);
const titleInput = page.locator('input[placeholder="标题"]').first();
await titleInput.fill("去重测试笔记");
// 快速在正文输入，触发 800ms 防抖自动保存多次
const bodyBox = page.locator("textarea").first();
for (const s of ["第一段", "第二段", "第三段", "第四段"]) {
  await bodyBox.type(s, { delay: 30 });
  await page.waitForTimeout(500);
}
// 立刻点击「完成」触发一次 onBlur/save（与自动保存竞争）
await page.locator("button").filter({ hasText: "完成" }).first().click({ timeout: 8000 });
await page.waitForTimeout(2500);
const after = await page.evaluate(async () => {
  const r = await new Promise((res) => { const q = indexedDB.open("smartday-db"); q.onsuccess = () => res(q.result); });
  const tx = r.transaction("notes", "readonly");
  const all = await new Promise((res) => { const q = tx.objectStore("notes").getAll(); q.onsuccess = () => res(q.result); });
  r.close();
  return { total: all.length, mine: all.filter((n) => (n.title || "").includes("去重测试笔记")).length };
});
console.log("创建前 notes 总数:", before);
console.log("创建后:", JSON.stringify(after));
console.log("=== 判定 ===");
console.log(JSON.stringify({
  createdExactlyOne: after.mine === 1,
  totalIncreasedByOne: after.total === before + 1,
  errors,
}, null, 1));
await browser.close();