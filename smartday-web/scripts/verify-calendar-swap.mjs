import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1560, height: 1020 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });
await page.goto(BASE + '/#/calendar', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.evaluate(async () => {
  const now = Date.now();
  const t = new Date();
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const iso = (d, h, m) => ymd(d) + 'T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
  const day = ymd(t);
  const events = [{ id: 'sw-e1', title: '项目评审会', start: iso(t, 14, 0), end: iso(t, 15, 0), allDay: false, categoryId: 'cat-default', color: '#f59f00', location: '会议室 A', description: '', reminders: [], createdAt: now, updatedAt: now }];
  const tasks = [{ id: 'sw-t1', title: '撰写国情调研报告', listId: 'list-inbox', completed: false, completedAt: null, priority: 'high', starred: true, dueDate: day, dueTime: '18:00', remindAt: null, repeat: null, inMyDay: day, tags: [], subtasks: [], attachments: [], notes: '', order: 0, createdAt: now, updatedAt: now }];
  const diaries = [{ id: 'sw-d1', date: day, title: '10月4日 小记', content: '今天的事', mood: 'smile', createdAt: now, updatedAt: now }];
  const notes = [{ id: 'sw-n1', title: '当天灵感', content: '记一条灵感', date: day, tags: ['灵感'], pinned: false, createdAt: now, updatedAt: now }];
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
// 单击日期
await page.evaluate((dayNum) => {
  const cells = Array.from(document.querySelectorAll('.month-cell:not(.outside)'));
  const cell = cells.find((c) => (((c.querySelector('.cell-date') || {}).textContent) || '').trim() === String(dayNum));
  if (cell) cell.click();
}, new Date().getDate());
await page.waitForTimeout(900);
const info = await page.evaluate(() => {
  const row = document.querySelector('.month-cell') ? document.querySelector('.month-cell').closest('div[style*="flex"]') : null;
  const grid = document.querySelector('.month-grid');
  const nav = document.querySelector('.task-list-panel') || null;
  const cat = Array.from(document.querySelectorAll('.card')).find((c) => c.innerText.includes('我的日历'));
  const detail = document.querySelector('.day-detail');
  const gb = grid.getBoundingClientRect();
  const cb = cat.getBoundingClientRect();
  const db = detail.getBoundingClientRect();
  return {
    gridLeft: Math.round(gb.left),
    catLeft: Math.round(cb.left),
    detailLeft: Math.round(db.left),
    gridRight: Math.round(gb.right),
    catWidth: Math.round(cb.width),
    gridOnLeft: gb.left < cb.left,
    detailOnRight: db.left > gb.left,
    footerButtons: detail.querySelectorAll('.dd-foot, .dd-foot button').length,
    hintStillThere: detail.innerText.includes('单击日期查看当天内容'),
    cardItems: Array.from(detail.querySelectorAll('.dd-item .dd-text')).map((x) => x.textContent),
  };
});
console.log(JSON.stringify(info, null, 1));
await page.locator('.content').screenshot({ path: '.smoke/calendar-swapped.png' });
console.log('=== 判定 ===');
console.log(JSON.stringify({
  gridOnLeft: info.gridOnLeft,
  sidebarOnRight: info.detailOnRight,
  noFooterButtons: info.footerButtons === 0,
  hintKept: info.hintStillThere,
  stillLists: info.cardItems.length >= 3,
  errors,
}, null, 1));
await browser.close();