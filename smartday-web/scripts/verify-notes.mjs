import { chromium } from "playwright";
const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
await page.goto(BASE + '/#/diary', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
// 1) 新建一篇 → 新建后应直接进入编辑态
await page.click('button:has-text("新建笔记")');
await page.waitForTimeout(500);
const afterNew = await page.locator('.md-input').count();
await page.locator('.md-input').first().click();
await page.locator('.md-input').first().type('阅读视图测试内容', { delay: 20 });
await page.waitForTimeout(1500);
// 2) 点「完成」→ 应回到阅读视图
await page.click('button:has-text("完成")');
await page.waitForTimeout(800);
const readerAfterFinish = await page.locator('.notes-reader').count();
const editorAfterFinish = await page.locator('.md-input').count();
// 3) 在左侧列表里点这篇 → 应进入阅读（不是编辑）
const cards = await page.locator('.note-card').count();
await page.click('.note-card >> nth=0');
await page.waitForTimeout(700);
const readerOnClick = await page.locator('.notes-reader').count();
const editorOnClick = await page.locator('.md-input').count();
// 4) 点「编辑」→ 才进入编辑
await page.click('button:has-text("✏️ 编辑")');
await page.waitForTimeout(600);
const editorAfterEdit = await page.locator('.md-input').count();
// 5) 列表折叠 / 展开
const widthExpanded = await page.evaluate(() => { const el = document.querySelector('.notes-split'); return el ? getComputedStyle(el).gridTemplateColumns : ''; });
await page.click('.notes-collapse');
await page.waitForTimeout(500);
const collapsed = await page.evaluate(() => ({ cls: document.querySelector('.notes-split').className, listVisible: document.querySelectorAll('.notes-list .note-card').length }));
await page.click('.notes-collapse');
await page.waitForTimeout(400);
const reopened = await page.locator('.notes-list .note-card').count();
console.log(JSON.stringify({
  editModeOnNew: afterNew > 0,
  finishGoesToReader: readerAfterFinish > 0 && editorAfterFinish === 0,
  listClickGoesToReader: cards > 0 && readerOnClick > 0 && editorOnClick === 0,
  editButtonOpensEditor: editorAfterEdit > 0,
  collapse: { widthExpanded, collapsedCls: collapsed.cls, hiddenWhenCollapsed: collapsed.listVisible === 0, reopened },
  errors,
}, null, 1));
await browser.close();