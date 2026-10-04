import { chromium } from "playwright";
const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + '/#/diary', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
// 切到笔记 tab
await page.click('.seg button:has-text("笔记")');
await page.waitForTimeout(500);
await page.click('button:has-text("新笔记")');
await page.waitForTimeout(500);
const ed = page.locator('.md-input').first();
await ed.click();
for (const ch of ['测', '试', '笔', '记', '内', '容']) {
  await ed.type(ch);
  await page.waitForTimeout(160);
}
await page.waitForTimeout(1200);
const info = await page.evaluate(() => ({
  cards: document.querySelectorAll('.note-card').length,
  titles: Array.from(document.querySelectorAll('.note-card .n-title')).map((e) => e.textContent).slice(0, 8),
  titlesInSelect: Array.from(document.querySelectorAll('.note-card')).length,
}));
console.log('笔记卡片数:', info.cards);
console.log('标题样例:', JSON.stringify(info.titles));
// 再看日记侧是否也重复
await page.click('.seg button:has-text("日记")');
await page.waitForTimeout(400);
const diaryCount = await page.evaluate(() => document.querySelectorAll('.diary-entry').length);
console.log('日记条目数:', diaryCount);
console.log('pageerrors:', errs.length);
await browser.close();