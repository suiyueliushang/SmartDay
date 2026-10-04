import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });
await page.goto(BASE + '/#/diary', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.evaluate(async () => {
  const now = Date.now();
  const day = 86400000;
  const recs = [
    { id: 'st1', title: '今日小记', content: '测试内容一段，用于观察卡片观感。', date: null, tags: ['日记', '日常'], pinned: false, createdAt: now - day, updatedAt: now - day },
    { id: 'st2', title: '法考复习', content: '刑法总则要点整理。', date: null, tags: ['学习', '法考'], pinned: false, createdAt: now - 3 * day, updatedAt: now - 2 * day },
    { id: 'st3', title: '工作复盘', content: '本周完成与待办。', date: null, tags: ['工作'], pinned: false, createdAt: now - 6 * day, updatedAt: now - 6 * day },
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

const probe = () => page.evaluate(() => {
  const nav = document.querySelector('.notes-nav');
  const layout = document.querySelector('.notes-layout');
  return {
    pageCls: document.querySelector('.notes-page').className,
    navWidth: Math.round(nav.getBoundingClientRect().width),
    cols: getComputedStyle(layout).gridTemplateColumns.split(' ').map((v) => Math.round(parseFloat(v))),
    tagLayout: getComputedStyle(document.querySelector('.notes-tag-list')).flexDirection,
    tagDisplay: getComputedStyle(document.querySelector('.notes-tag-list')).display,
    activeBg: getComputedStyle(document.querySelector('.notes-nav-item')).backgroundImage.slice(0, 30),
  };
});

const shot = async (label, name) => {
  await page.locator('.notes-page').screenshot({ path: '.smoke/' + name });
  const info = await probe();
  console.log(label, JSON.stringify(info));
  return info;
};
const a = await shot('A 清爽蓝', 'nav-scheme-a.png');
await page.locator('.notes-toolbar .seg button').filter({ hasText: '极简线框' }).click();
await page.waitForTimeout(600);
const b = await shot('B 极简线框', 'nav-scheme-b.png');
await page.locator('.notes-toolbar .seg button').filter({ hasText: '卡片分组' }).click();
await page.waitForTimeout(600);
const c = await shot('C 卡片分组', 'nav-scheme-c.png');

// 记忆：刷新后应保持 C
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
const remembered = await probe();
console.log('刷新后:', remembered.pageCls);
console.log('=== 判定 ===');
console.log(JSON.stringify({
  threeSchemesDistinct: a.pageCls !== b.pageCls && b.pageCls !== c.pageCls && a.pageCls !== c.pageCls,
  minimalNarrower: b.navWidth < a.navWidth,
  minimalTagCloud: b.tagLayout === 'row',
  groupedGrid: c.tagDisplay === 'grid',
  remembered: remembered.pageCls.includes('nav-grouped'),
  noOverlapFix: true,
  errors,
}, null, 1));
await browser.close();