import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 180)); });

await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 造一条「自由专注」的已完成记录
await page.evaluate(async () => {
  const now = Date.now();
  const rec = {
    id: 'free-to-bind',
    mode: 'pomodoro', plannedMinutes: 25, actualSeconds: 600, pauseCount: 0, pausedSeconds: 0,
    targetId: null, targetType: null, targetTitle: undefined,
    note: '', status: 'completed', startedAt: now - 600000, endedAt: now, createdAt: now, updatedAt: now,
  };
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('focus', 'readwrite');
      tx.objectStore('focus').put(rec);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// 建两个任务，供改绑
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
for (const t of ['撰写国情调研报告', '开发桌面日历']) {
  await page.fill('.quick-add .input', t);
  await page.press('.quick-add .input', 'Enter');
  await page.waitForTimeout(400);
}
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);

const rowInfo = () => page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.kbd-table tbody tr'));
  const tr = rows.find((r) => r.innerText.includes('自由专注') || r.innerText.includes('撰写国情调研报告'));
  return tr ? { target: tr.querySelector('td') ? tr.querySelector('td').innerText.replace(/\s+/g, ' ').trim() : '' } : null;
});
const before = await rowInfo();

// 点击目标列 → 选择任务
const targetCell = page.locator('.kbd-table tbody tr').filter({ hasText: '自由专注' }).first().locator('td').first();
await targetCell.click();
await page.waitForTimeout(400);
const hasSelect = await page.locator('.kbd-table select.select').count();
await page.locator('.kbd-table select.select').first().selectOption({ label: '撰写国情调研报告' });
await page.waitForTimeout(900);
const after = await rowInfo();

// 刷新后是否持久化
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const persisted = await rowInfo();

console.log('=== 目标列改绑 ===');
console.log(JSON.stringify({ before, selectAppeared: hasSelect > 0, after, persisted }, null, 1));
console.log('=== 判定 ===');
console.log(JSON.stringify({
  selectAppeared: hasSelect > 0,
  boundAfter: !!after && after.target.includes('撰写国情调研报告'),
  tagShown: !!after && after.target.includes('任务'),
  persisted: !!persisted && persisted.target.includes('撰写国情调研报告'),
  errors,
}, null, 1));
await browser.close();