import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1560, height: 1020 } });
await page.goto(BASE + '/#/calendar', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.evaluate(async () => {
  const now = Date.now();
  const t = new Date();
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const iso = (d, h, m) => ymd(d) + 'T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
  const day = ymd(t);
  const events = [
    { id: 'sd-e1', title: '项目评审会', start: iso(t, 14, 0), end: iso(t, 15, 0), allDay: false, categoryId: 'cat-default', color: '#f59f00', location: '会议室 A', description: '', reminders: [], createdAt: now, updatedAt: now },
    { id: 'sd-e2', title: '晚间复盘', start: iso(t, 21, 0), end: iso(t, 21, 30), allDay: false, categoryId: 'cat-default', color: '#4f6ef7', location: '', description: '', reminders: [], createdAt: now, updatedAt: now },
  ];
  const tasks = [
    { id: 'sd-t1', title: '撰写国情调研报告', listId: 'list-inbox', completed: false, completedAt: null, priority: 'high', starred: true, dueDate: day, dueTime: '18:00', remindAt: null, repeat: null, inMyDay: day, tags: [], subtasks: [], attachments: [], notes: '', order: 0, createdAt: now, updatedAt: now },
    { id: 'sd-t2', title: '整理会议纪要', listId: 'list-inbox', completed: true, completedAt: now, priority: 'medium', starred: false, dueDate: day, dueTime: null, remindAt: null, repeat: null, inMyDay: null, tags: [], subtasks: [], attachments: [], notes: '', order: 1, createdAt: now, updatedAt: now },
  ];
  const diaries = [{ id: 'sd-d1', date: day, title: '10月4日 小记', content: '今天的事', mood: 'smile', createdAt: now, updatedAt: now }];
  const notes = [{ id: 'sd-n1', title: '当天灵感', content: '记一条灵感', date: day, tags: ['灵感'], pinned: false, createdAt: now, updatedAt: now }];
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['events', 'tasks', 'diaries', 'notes'], 'readwrite');
      for (const e of events) tx.objectStore('events').put(e);
      for (const x of tasks) tx.objectStore('tasks').put(x);
      for (const x of diaries) tx.objectStore('diaries').put(x);
      for (const x of notes) tx.objectStore('notes').put(x);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.evaluate((dayNum) => {
  const cells = Array.from(document.querySelectorAll('.month-cell:not(.outside)'));
  const cell = cells.find((c) => (((c.querySelector('.cell-date') || {}).textContent) || '').trim() === String(dayNum));
  if (cell) cell.click();
}, new Date().getDate());
await page.waitForTimeout(900);
await page.locator('.content').screenshot({ path: '.smoke/calendar-day-detail.png' });
await page.locator('.day-detail').screenshot({ path: '.smoke/calendar-day-card.png' });
console.log('shots done');
await browser.close();