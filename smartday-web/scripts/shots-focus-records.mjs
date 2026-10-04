import { chromium } from "playwright";
const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
// 建任务
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
for (const t of ['撰写国情调研报告', '开发桌面日历']) {
  await page.fill('.quick-add .input', t);
  await page.press('.quick-add .input', 'Enter');
  await page.waitForTimeout(350);
}
// 造几条记录（含自由专注）
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(async () => {
  const now = Date.now();
  const mk = (id, title, type, mins, back) => ({
    id, mode: 'pomodoro', plannedMinutes: mins, actualSeconds: mins * 60, pauseCount: 0, pausedSeconds: 0,
    targetId: null, targetType: type, targetTitle: title, note: '', status: 'completed',
    startedAt: now - back, endedAt: now - back + mins * 60000, createdAt: now, updatedAt: now,
  });
  const recs = [mk('shot-1', '撰写国情调研报告', 'task', 25, 3600000), mk('shot-2', undefined, null, 18, 7200000), mk('shot-3', '开发桌面日历', 'task', 45, 86400000)];
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('focus', 'readwrite');
      for (const r of recs) tx.objectStore('focus').put(r);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const card = page.locator('.focus-page .card').filter({ hasText: '专注记录' }).first();
await card.screenshot({ path: '.smoke/focus-records.png' });
// 打开一条「自由专注」的改绑下拉，再截一张
await page.locator('.kbd-table tbody tr').filter({ hasText: '自由专注' }).first().locator('td').first().click();
await page.waitForTimeout(500);
await card.screenshot({ path: '.smoke/focus-records-rebind.png' });
console.log('shots done');
await browser.close();