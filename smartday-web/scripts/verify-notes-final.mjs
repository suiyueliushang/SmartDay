import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });
await page.goto(BASE + '/#/diary', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(async () => {
  const now = Date.now();
  const day = 86400000;
  const recs = [
    { id: 'fa1', title: '今日小记', content: '采用清爽蓝方案后的效果。', date: null, tags: ['日记', '日常'], pinned: false, createdAt: now - day, updatedAt: now - day },
    { id: 'fa2', title: '法考复习', content: '刑法总则要点。', date: null, tags: ['学习', '法考'], pinned: false, createdAt: now - 3 * day, updatedAt: now - 2 * day },
    { id: 'fa3', title: '工作复盘', content: '本周完成与待办。', date: null, tags: ['工作'], pinned: false, createdAt: now - 6 * day, updatedAt: now - 6 * day },
  ];
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('notes', 'readwrite');
      for (const r of recs) tx.objectStore('notes').put(r);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const item = document.querySelector('.notes-nav-item');
  const cs = getComputedStyle(item);
  return {
    hasSwitcher: !!document.querySelector('.notes-toolbar .seg'),
    pageCls: document.querySelector('.notes-page').className,
    activeBg: cs.backgroundImage.slice(0, 34),
    color: cs.color,
    tagRows: document.querySelectorAll('.notes-tag-list .notes-tag').length,
    toggleInsideHead: !!document.querySelector('.notes-nav-head .notes-nav-toggle'),
    navWidth: Math.round(document.querySelector('.notes-nav').getBoundingClientRect().width),
  };
});
console.log(JSON.stringify(info, null, 1));
// 选中一个标签后：全部笔记应变回普通样式、标签高亮
await page.locator('.notes-tag').filter({ hasText: '学习' }).first().click();
await page.waitForTimeout(600);
const tagged = await page.evaluate(() => ({
  navItemActive: document.querySelector('.notes-nav-item').className.includes('active'),
  tagActive: (document.querySelector('.notes-tag.active .nt-name') || {}).textContent,
  toolbar: (document.querySelector('.notes-toolbar b') || {}).textContent,
}));
console.log('按标签筛选后:', JSON.stringify(tagged));
await page.locator('.notes-page').screenshot({ path: '.smoke/notes-final.png' });
console.log('=== 判定 ===');
console.log(JSON.stringify({
  switcherRemoved: !info.hasSwitcher,
  cleanRootClass: info.pageCls.trim().endsWith('notes-page'),
  gradientActive: info.activeBg.includes('linear-gradient'),
  toggleInHead: info.toggleInsideHead,
  tagFilterSwitchesActive: tagged.navItemActive === false && tagged.tagActive === '学习',
  errors,
}, null, 1));
await browser.close();