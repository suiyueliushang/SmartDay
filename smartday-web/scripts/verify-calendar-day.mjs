import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1560, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });
await page.goto(BASE + '/#/calendar', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
// 造当天数据：1 事件 + 2 任务 + 1 日记 + 1 笔记
await page.evaluate(async () => {
  const now = Date.now();
  const t = new Date();
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const iso = (d, h, m) => ymd(d) + 'T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00';
  const day = ymd(t);
  const events = [{ id: 'dd-e1', title: '项目评审会', start: iso(t, 14, 0), end: iso(t, 15, 0), allDay: false, categoryId: 'cat-default', color: '#f59f00', location: '会议室 A', description: '', reminders: [], createdAt: now, updatedAt: now }];
  const tasks = [
    { id: 'dd-t1', title: '撰写国情调研报告', listId: 'list-inbox', completed: false, completedAt: null, priority: 'high', starred: true, dueDate: day, dueTime: '18:00', remindAt: null, repeat: null, inMyDay: day, tags: [], subtasks: [], attachments: [], notes: '', order: 0, createdAt: now, updatedAt: now },
    { id: 'dd-t2', title: '整理会议纪要', listId: 'list-inbox', completed: true, completedAt: now, priority: 'medium', starred: false, dueDate: day, dueTime: null, remindAt: null, repeat: null, inMyDay: null, tags: [], subtasks: [], attachments: [], notes: '', order: 1, createdAt: now, updatedAt: now },
  ];
  const diaries = [{ id: 'dd-d1', date: day, title: '10月4日 小记', content: '今天的事', mood: 'smile', createdAt: now, updatedAt: now }];
  const notes = [{ id: 'dd-n1', title: '当天灵感', content: '记一条灵感', date: day, tags: ['灵感'], pinned: false, createdAt: now, updatedAt: now }];
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

// 单击今天所在单元格
const clicked = await page.evaluate((dayNum) => {
  const cells = Array.from(document.querySelectorAll('.month-cell:not(.outside)'));
  const cell = cells.find((c) => ((c.querySelector('.cell-date') || {}).textContent || '').trim() === String(dayNum));
  if (!cell) return false;
  cell.click();
  return true;
}, new Date().getDate());
console.log('点击单元格:', clicked);
await page.waitForTimeout(900);
const card = await page.evaluate(() => {
  const el = document.querySelector('.day-detail');
  if (!el) return null;
  return {
    date: (el.querySelector('.dd-date') || {}).innerText || '',
    sections: Array.from(el.querySelectorAll('.dd-sec-title')).map((x) => x.innerText.replace(/\s+/g, ' ')),
    events: Array.from(el.querySelectorAll('.dd-sec:nth-of-type(1) .dd-item .dd-text')).map((x) => x.textContent),
    items: Array.from(el.querySelectorAll('.dd-item .dd-text')).map((x) => x.textContent),
    selectedCells: document.querySelectorAll('.month-cell.selected').length,
  };
});
console.log('=== 当天详情卡 ===');
console.log(JSON.stringify(card, null, 1));

// 点事件 → 打开事件弹窗
await page.locator('.day-detail .dd-item').filter({ hasText: '项目评审会' }).first().click();
await page.waitForTimeout(700);
const modalOpen = await page.locator('.modal').count();
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 点任务 → 打开任务详情抽屉
await page.locator('.day-detail .dd-item').filter({ hasText: '撰写国情调研报告' }).first().click();
await page.waitForTimeout(800);
const drawer = await page.locator('.side-drawer').count();
const drawerTitle = await page.evaluate(() => { const el = document.querySelector('.drawer-title'); return el ? el.value : ''; });
await page.click('.side-drawer .icon-btn');
await page.waitForTimeout(400);

// 点笔记 → 跳到笔记页并打开该笔记
await page.locator('.day-detail .dd-item').filter({ hasText: '当天灵感' }).first().click();
await page.waitForTimeout(1500);
const notesPage = await page.evaluate(() => ({
  hash: location.hash,
  readerTitle: (document.querySelector('.notes-reader .reader-title') || {}).innerText || '',
  hasOverlay: !!document.querySelector('.notes-editor-overlay'),
}));
console.log('=== 跳转笔记 ===');
console.log(JSON.stringify(notesPage, null, 1));

console.log('=== 判定 ===');
console.log(JSON.stringify({
  cardShown: !!card,
  hasThreeSections: !!card && card.sections.length === 3,
  listsDayItems: !!card && card.items.includes('项目评审会') && card.items.includes('撰写国情调研报告') && card.items.includes('当天灵感'),
  selectedHighlight: !!card && card.selectedCells === 1,
  eventOpensModal: modalOpen > 0,
  taskOpensDrawer: drawer > 0 && drawerTitle.includes('撰写国情调研报告'),
  noteJumpsToNotesPage: notesPage.hash.includes('diary') && notesPage.readerTitle.includes('当天灵感'),
  errors,
}, null, 1));
await browser.close();