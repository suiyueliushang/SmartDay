// 取证脚本：复现 任务详情白屏 / 月视图错位 / 笔记重复
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_URL || 'http://localhost:4173';
const errors = [];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e)));

// ---------- 1) 月视图网格对齐 ----------
await page.goto(BASE + '/#/calendar', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const grid = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('.month-cell'));
  const heads = Array.from(document.querySelectorAll('.month-head')).map((h) => h.textContent.trim());
  const rows = new Map();
  for (const c of cells) {
    const top = Math.round(c.getBoundingClientRect().top);
    if (!rows.has(top)) rows.set(top, []);
    rows.get(top).push(c.querySelector('.cell-date') ? c.querySelector('.cell-date').textContent.trim() : '?');
  }
  const gridEl = document.querySelector('.month-grid');
  return {
    headers: heads,
    columns: getComputedStyle(gridEl).gridTemplateColumns,
    rowCount: rows.size,
    firstThreeRows: Array.from(rows.values()).slice(0, 3),
  };
});
console.log('=== 月视图 ===');
console.log(JSON.stringify(grid, null, 1));

// ---------- 2) 任务详情是否白屏 ----------
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.fill('.quick-add .input', '取证任务A');
await page.press('.quick-add .input', 'Enter');
await page.waitForTimeout(600);
const beforeClick = await page.evaluate(() => document.querySelectorAll('.task-item').length);
await page.click('.task-item');
await page.waitForTimeout(900);
const afterClick = await page.evaluate(() => ({
  bodyText: (document.body.innerText || '').slice(0, 120),
  hasApp: !!document.querySelector('.app-shell'),
  hasSidebar: document.querySelectorAll('.nav-item').length,
  hasModal: !!document.querySelector('.modal'),
}));
console.log('=== 任务详情 ===');
console.log('任务数:', beforeClick, '| 点击后:', JSON.stringify(afterClick));

// ---------- 3) 笔记重复 ----------
await page.goto(BASE + '/#/diary', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const tabNotes = page.locator('.seg button', { hasText: '笔记' });
if (await tabNotes.count()) await tabNotes.first().click();
await page.waitForTimeout(400);
const newBtn = page.locator('button', { hasText: '新笔记' });
if (await newBtn.count()) await newBtn.first().click();
await page.waitForTimeout(400);
const editor = page.locator('.md-input').first();
if (await editor.count()) {
  await editor.click();
  await editor.type('这是一篇测试笔记', { delay: 60 });
  await page.waitForTimeout(1200);
}
const noteCount = await page.evaluate(() => document.querySelectorAll('.note-card').length);
console.log('=== 笔记 ===');
console.log('输入 8 个字后左侧笔记卡片数:', noteCount);

console.log('=== 错误 ===');
for (const e of errors.slice(0, 15)) console.log(e.slice(0, 400));
console.log(errors.length === 0 ? '（无错误）' : '(' + errors.length + ' 条)');
await browser.close();