import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 注入一条旧版 bug 留下的坏记录：已完成但 actualSeconds = 0，起止差 8 分钟
await page.evaluate(async () => {
  const now = Date.now();
  const rec = {
    id: 'legacy-0s-' + now,
    mode: 'pomodoro', plannedMinutes: 25, actualSeconds: 0, pauseCount: 0, pausedSeconds: 0,
    targetId: null, targetType: null, targetTitle: '历史坏记录（8分钟）',
    note: '', status: 'completed', startedAt: now - 8 * 60 * 1000, endedAt: now,
    createdAt: now, updatedAt: now,
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

// 重新加载：init 时应自动用起止时间差复原成 8 分钟
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const fixed = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.kbd-table tbody tr'));
  const tr = rows.find((r) => r.innerText.includes('历史坏记录'));
  return tr ? Array.from(tr.querySelectorAll('td')).map((x) => x.innerText.trim()).slice(1, 5) : null;
});
console.log('=== 注入 0 秒坏记录后重新加载 ===');
console.log(JSON.stringify({ mode_duration_start_status: fixed }, null, 1));
const ok = !!fixed && /分|秒/.test(fixed[1]) && !/^0\s*(秒|分钟|小时)$/.test(fixed[1]);
console.log('修复成功:', ok, '| errors:', errors.length);
await browser.close();