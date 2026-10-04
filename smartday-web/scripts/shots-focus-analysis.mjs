import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 注入一年的示例专注数据（仅用于截图展示）
await page.evaluate(async () => {
  const now = Date.now();
  const titles = ['撰写国情调研报告', '开发桌面日历', '读书笔记', '需求评审', '自由专注'];
  const recs = [];
  for (let d = 0; d < 365; d++) {
    const day = new Date();
    day.setDate(day.getDate() - d);
    if (day.getDay() === 0 && d % 3 !== 0) continue;
    const n = 1 + (d % 4);
    for (let k = 0; k < n; k++) {
      const mins = [15, 25, 45, 60, 90][(d + k) % 5];
      const start = new Date(day);
      start.setHours(9 + ((d + k) % 9), (d * 7 + k * 11) % 60, 0, 0);
      const startedAt = start.getTime();
      recs.push({
        id: 'demo-' + d + '-' + k,
        mode: k % 3 === 0 ? 'stopwatch' : 'pomodoro',
        plannedMinutes: mins, actualSeconds: mins * 60, pauseCount: 0, pausedSeconds: 0,
        targetId: null, targetType: null, targetTitle: titles[(d + k) % titles.length],
        note: '', status: 'completed', startedAt, endedAt: startedAt + mins * 60000,
        createdAt: startedAt, updatedAt: startedAt,
      });
    }
  }
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('focus', 'readwrite');
      const store = tx.objectStore('focus');
      for (const r of recs) store.put(r);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const shotCard = async (name) => {
  const card = await page.locator('.focus-page .card').filter({ hasText: '专注分析' }).first();
  await card.screenshot({ path: '.smoke/' + name });
};
await shotCard('focus-analysis-year.png');
await page.locator('.focus-page .card .seg button').filter({ hasText: /^月$/ }).first().click();
await page.waitForTimeout(900);
await shotCard('focus-analysis-month.png');
const summary = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.focus-page .card'));
  const ana = cards.find((c) => c.innerText.includes('专注分析'));
  return { heatTitle: (ana.querySelector('.fp-heat-title') || {}).textContent, sum: (ana.querySelector('.fp-heat-sum') || {}).innerText };
});
console.log(JSON.stringify(summary, null, 1));
await browser.close();