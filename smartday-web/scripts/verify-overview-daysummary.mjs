import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });
await page.goto(BASE + '/#/overview', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.evaluate(async () => {
  const now = Date.now();
  const today = new Date();
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const iso = (d, h, m) => ymd(d) + 'T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
  const events = [{ id: 'ov2-e1', title: '项目评审会', start: iso(today, 14, 0), end: iso(today, 15, 0), allDay: false, categoryId: 'cat-default', color: '#f59f00', location: '会议室 A', description: '', reminders: [], createdAt: now, updatedAt: now }];
  const diaries = [{ id: 'ov2-d1', date: ymd(today), title: '10月4日 0404', content: '今天记录', mood: 'smile', createdAt: now, updatedAt: now }];
  const anniv = [{ id: 'ov2-a1', name: '回市局', type: 'countdown', date: '2026-11-23', isLunar: false, remindDays: 3, order: 0, createdAt: now, updatedAt: now }];
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['events', 'diaries', 'anniversaries'], 'readwrite');
      for (const e of events) tx.objectStore('events').put(e);
      for (const d of diaries) tx.objectStore('diaries').put(d);
      for (const a of anniv) tx.objectStore('anniversaries').put(a);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const info = await page.evaluate(() => {
  const grid = document.querySelector('.overview-grid');
  const left = grid.children[0];
  const right = grid.children[1];
  const find = (root, kw) => Array.from(root.querySelectorAll('.card')).findIndex((c) => c.innerText.includes(kw));
  return {
    leftTop: Math.round(left.getBoundingClientRect().top),
    leftBottom: Math.round(left.getBoundingClientRect().bottom),
    rightBottom: Math.round(right.getBoundingClientRect().bottom),
    leftCards: Array.from(left.querySelectorAll('.card .card-title, .card b')).slice(0, 6).map((e) => e.textContent.trim().slice(0, 20)),
    daySummaryInLeft: find(left, '当天汇总') >= 0,
    daySummaryInRight: find(right, '当天汇总') >= 0,
    daySummaryIsLastInLeft: find(left, '当天汇总') === left.querySelectorAll('.card').length - 1,
  };
});
console.log(JSON.stringify(info, null, 1));
await page.locator('.content').screenshot({ path: '.smoke/overview-daysummary-left.png' });
console.log('=== 判定 ===');
console.log(JSON.stringify({ inLeft: info.daySummaryInLeft, notInRight: !info.daySummaryInRight, isBottomOfLeft: info.daySummaryIsLastInLeft, errors }, null, 1));
await browser.close();