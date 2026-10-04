import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });
await page.goto(BASE + '/#/diary', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
// 造点数据
await page.evaluate(async () => {
  const now = Date.now();
  const day = 86400000;
  const recs = [
    { id: 'nn1', title: '今日小记', content: '测试一下折叠效果。', date: null, tags: ['日记'], pinned: false, createdAt: now - day, updatedAt: now - day },
    { id: 'nn2', title: '法考笔记', content: '刑法总则要点。', date: null, tags: ['学习', '法考'], pinned: false, createdAt: now - 3 * day, updatedAt: now - 3 * day },
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
await page.waitForTimeout(1800);

const probe = () => page.evaluate(() => {
  const layout = document.querySelector('.notes-layout');
  const nav = document.querySelector('.notes-nav');
  const cols = getComputedStyle(layout).gridTemplateColumns.split(' ').map((v) => Math.round(parseFloat(v)));
  return {
    cls: layout.className,
    navWidth: Math.round(nav.getBoundingClientRect().width),
    cols,
    hasNavItem: !!document.querySelector('.notes-nav-item'),
    tagRows: document.querySelectorAll('.notes-tag-list .notes-tag').length,
    rail: !!document.querySelector('.notes-nav-rail'),
  };
});
const expanded = await probe();
await page.locator('.content').screenshot({ path: '.smoke/notes-nav-expanded.png' });

// 折叠
await page.click('.notes-nav-toggle');
await page.waitForTimeout(600);
const collapsed = await probe();
await page.locator('.content').screenshot({ path: '.smoke/notes-nav-collapsed.png' });

// 刷新后应保持折叠
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
const afterReload = await probe();

// 展开回来
await page.click('.notes-nav-toggle');
await page.waitForTimeout(600);
const reExpanded = await probe();

console.log(JSON.stringify({ expanded, collapsed, afterReload, reExpanded }, null, 1));
console.log('=== 判定 ===');
console.log(JSON.stringify({
  expandedOk: expanded.navWidth >= 200 && expanded.hasNavItem && expanded.tagRows >= 1,
  collapsedOk: collapsed.cls.includes('nav-collapsed') && collapsed.navWidth <= 60 && !collapsed.hasNavItem && collapsed.rail,
  persisted: afterReload.cls.includes('nav-collapsed') && !afterReload.hasNavItem,
  reExpandedOk: !reExpanded.cls.includes('nav-collapsed') && reExpanded.hasNavItem,
  mainWidened: collapsed.cols[1] > expanded.cols[1],
  errors,
}, null, 1));
await browser.close();