import { chromium } from "playwright";
const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });
await page.goto(BASE + '/#/overview', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
// 造点数据让概览页有内容
await page.evaluate(async () => {
  const now = Date.now();
  const today = new Date();
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const iso = (d, h, m) => ymd(d) + 'T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
  const events = [
    { id: 'ov-e1', title: '开发桌面日历', start: iso(today, 0, 0), end: iso(today, 23, 59), allDay: true, categoryId: 'cat-default', color: '#4f6ef7', location: '', description: '', reminders: [], createdAt: now, updatedAt: now },
    { id: 'ov-e2', title: '项目评审会', start: iso(today, 14, 0), end: iso(today, 15, 0), allDay: false, categoryId: 'cat-default', color: '#f59f00', location: '会议室 A', description: '', reminders: [], createdAt: now, updatedAt: now },
  ];
  const tasks = [
    { id: 'ov-t1', title: '撰写国情调研报告', listId: 'list-inbox', completed: false, completedAt: null, priority: 'high', starred: true, dueDate: ymd(today), dueTime: '18:00', remindAt: null, repeat: null, inMyDay: ymd(today), tags: [], subtasks: [], attachments: [], notes: '', order: 0, createdAt: now, updatedAt: now },
    { id: 'ov-t2', title: '整理会议纪要', listId: 'list-inbox', completed: true, completedAt: now, priority: 'medium', starred: false, dueDate: ymd(today), dueTime: null, remindAt: null, repeat: null, inMyDay: null, tags: [], subtasks: [], attachments: [], notes: '', order: 1, createdAt: now, updatedAt: now },
  ];
  const anniv = [{ id: 'ov-a1', name: '回市局', type: 'countdown', date: '2026-11-23', isLunar: false, remindDays: 3, order: 0, createdAt: now, updatedAt: now }];
  const diaries = [{ id: 'ov-d1', date: ymd(today), title: '10月4日 0404', content: '今天的记录', mood: 'smile', createdAt: now, updatedAt: now }];
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['events', 'tasks', 'anniversaries', 'diaries'], 'readwrite');
      for (const e of events) tx.objectStore('events').put(e);
      for (const t of tasks) tx.objectStore('tasks').put(t);
      for (const a of anniv) tx.objectStore('anniversaries').put(a);
      for (const d of diaries) tx.objectStore('diaries').put(d);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
const m = await page.evaluate(() => {
  const grid = document.querySelector('.overview-grid');
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').map((v) => Math.round(parseFloat(v)));
  const kids = Array.from(grid.children).map((k) => Math.round(k.getBoundingClientRect().width));
  const miniGrid = document.querySelector('.mini-grid');
  return { cols, kids, equal: cols.length === 2 && cols[0] === cols[1], kidEqual: kids.length === 2 && kids[0] === kids[1], miniWidth: miniGrid ? Math.round(miniGrid.getBoundingClientRect().width) : 0 };
});
console.log('=== 两列宽度 ===');
console.log(JSON.stringify(m, null, 1));
await page.locator('.content').screenshot({ path: '.smoke/overview-equal.png' });
console.log('errors:', errors.length);
await browser.close();