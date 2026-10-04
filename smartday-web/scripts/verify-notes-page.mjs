import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 180)); });

await page.goto(BASE + '/#/diary', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 造一篇 30 天前创建、带标签的笔记（用于验证创建时间不被编辑重置）
const old = Date.now() - 30 * 86400000;
await page.evaluate(async (oldTs) => {
  const rec = {
    id: 'note-old', title: '历史笔记', content: '这条笔记是很久以前写的。\n\n第二段内容。',
    date: null, tags: ['工作', '思考'], pinned: false, createdAt: oldTs, updatedAt: oldTs,
  };
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('notes', 'readwrite');
      tx.objectStore('notes').put(rec);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
}, old);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const layout = await page.evaluate(() => {
  const nav = document.querySelector('.notes-nav');
  return {
    navItems: nav.querySelectorAll('.notes-nav-item').length,
    navItemText: (nav.querySelector('.notes-nav-item') || {}).innerText || '',
    sectionTitle: (nav.querySelector('.notes-nav-sec') || {}).textContent || '',
    tagCount: nav.querySelectorAll('.notes-tag-list .notes-tag').length,
    tags: Array.from(nav.querySelectorAll('.notes-tag .nt-name')).map((e) => e.textContent),
    cards: document.querySelectorAll('.note-feed-card').length,
    firstCardMeta: (document.querySelector('.note-feed-card .nfc-time') || {}).innerText || '',
  };
});
console.log('=== 布局 ===');
console.log(JSON.stringify(layout, null, 1));

// 点标签筛选
await page.locator('.notes-tag').filter({ hasText: '工作' }).first().click();
await page.waitForTimeout(600);
const filtered = await page.evaluate(() => ({
  title: (document.querySelector('.notes-toolbar b') || {}).textContent,
  cards: document.querySelectorAll('.note-feed-card').length,
  activeTag: (document.querySelector('.notes-tag.active .nt-name') || {}).textContent,
}));
console.log('=== 按标签筛选 ===');
console.log(JSON.stringify(filtered, null, 1));

// 编辑这篇笔记 → 创建时间必须保持不变
await page.locator('.note-feed-card').first().hover();
await page.locator('.note-feed-card').first().locator('button[title="编辑"]').click();
await page.waitForTimeout(700);
const editorMeta = await page.evaluate(() => {
  const el = document.querySelector('.notes-editor-panel');
  return el ? el.innerText.split('\n').slice(0, 4).join(' | ').slice(0, 160) : '';
});
const md = page.locator('.notes-editor-panel .md-input').first();
await md.click();
await md.type('（补充一段）', { delay: 20 });
await page.waitForTimeout(1600);
await page.click('.notes-editor-panel button:has-text("完成")');
await page.waitForTimeout(1200);
const afterEdit = await page.evaluate(() => {
  const card = document.querySelector('.note-feed-card');
  const meta = card.querySelector('.nfc-time');
  const parts = Array.from(meta.querySelectorAll('span')).map((s) => s.textContent.trim());
  return { meta: parts.filter((t) => t.includes('创建') || t.includes('修改')).join(' | '), body: card.querySelector('.nfc-body').innerText.slice(0, 40) };
});
console.log('=== 编辑后 ===');
console.log(JSON.stringify({ editorMeta, afterEdit }, null, 1));

const todayStr = new Date().toISOString().slice(0, 10);
const oldStr = new Date(old).toISOString().slice(0, 10);
console.log('=== 判定 ===');
console.log(JSON.stringify({
  onlyTwoNavSections: layout.navItems === 1 && layout.sectionTitle === '全部标签',
  tagsListed: layout.tagCount >= 2,
  cardShowsBothTimes: /创建/.test(layout.firstCardMeta) && /修改/.test(layout.firstCardMeta),
  tagFilterWorks: filtered.activeTag === '工作' && filtered.cards === 1,
  createdPreserved: afterEdit.meta.includes(oldStr),
  modifiedUpdated: afterEdit.meta.includes(todayStr),
  contentSaved: afterEdit.body.includes('补充一段'),
  errors,
}, null, 1));
await browser.close();