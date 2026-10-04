import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const results = {};
const errors = [];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)); });

// ===== 1) 月视图：网格与日期必须正确 ===== 
await page.goto(BASE + '/#/calendar', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
results.monthGrid = await page.evaluate(() => {
  const rows = new Map();
  for (const c of document.querySelectorAll('.month-cell')) {
    const top = Math.round(c.getBoundingClientRect().top);
    if (!rows.has(top)) rows.set(top, []);
    rows.get(top).push((c.querySelector('.cell-date') || {}).textContent || '?');
  }
  const arr = [...rows.values()];
  return { rowCount: arr.length, firstRow: arr[0], allSeven: arr.every((r) => r.length === 7), weeknumCells: document.querySelectorAll('.month-weeknum').length };
});
// ===== 2) 日历：单击不弹窗，双击才编辑 ===== 
await page.click('.month-cell >> nth=10');
await page.waitForTimeout(500);
const modalAfterClick = await page.locator('.modal').count();
await page.dblclick('.month-cell >> nth=10');
await page.waitForTimeout(700);
const modalAfterDbl = await page.locator('.modal').count();
results.dblclickOnly = { afterSingle: modalAfterClick, afterDouble: modalAfterDbl, pass: modalAfterClick === 0 && modalAfterDbl > 0 };
if (modalAfterDbl > 0) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
// 顶栏不应再有日期
results.topbarNoDate = await page.evaluate(() => {
  const t = document.querySelector('.topbar');
  if (!t) return 'no-topbar';
  return !/\\d{4}\\s*[-/年]/.test(t.innerText);
});

// ===== 3) 任务详情：右侧抽屉，不再白屏 ===== 
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.fill('.quick-add .input', '验证任务甲');
await page.press('.quick-add .input', 'Enter');
await page.waitForTimeout(700);
await page.click('.task-item >> nth=0');
await page.waitForTimeout(800);
results.taskDrawer = await page.evaluate(() => ({
  hasShell: !!document.querySelector('.app-shell'),
  drawers: document.querySelectorAll('.side-drawer').length,
  hasListPanel: document.querySelectorAll('.nav-item').length > 0,
  title: (document.querySelector('.drawer-title') || {}).value || '',
}));
results.taskDrawer.pass = results.taskDrawer.hasShell && results.taskDrawer.drawers === 1 && results.taskDrawer.hasListPanel;
await page.click('.side-drawer .icon-btn >> nth=0');
await page.waitForTimeout(400);
results.drawerClosed = (await page.locator('.side-drawer').count()) === 0;

// ===== 4) 分组：可点开查看 + 分组内新建任务可见 ===== 
await page.fill('input[placeholder="新建分组…"]', '验证分组');
await page.press('input[placeholder="新建分组…"]', 'Enter');
await page.waitForTimeout(600);
await page.click('.group-title >> nth=0');
await page.waitForTimeout(600);
const groupHash = await page.evaluate(() => location.hash);
await page.fill('.quick-add .input', '分组内任务乙');
await page.press('.quick-add .input', 'Enter');
await page.waitForTimeout(800);
results.groupView = await page.evaluate(() => ({
  hash: location.hash,
  quickAddPlaceholder: (document.querySelector('.quick-add .input') || {}).placeholder || '',
  tasksShown: Array.from(document.querySelectorAll('.task-item .task-title')).map((e) => e.textContent).join('|'),
}));
results.groupView.pass = groupHash.includes('group:') && results.groupView.tasksShown.includes('分组内任务乙');

// ===== 5) 笔记：只应产生 1 篇（修复重复）；三种风格可切换 ===== 
await page.goto(BASE + '/#/diary', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.click('button:has-text("新建笔记")');
await page.waitForTimeout(500);
const ed = page.locator('.md-input').first();
await ed.click();
for (const chunk of ['第一段内容', '第二段内容', '第三段内容']) {
  await ed.type(chunk, { delay: 30 });
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(1200);
results.noteDedupe = await page.evaluate(() => ({
  cards: document.querySelectorAll('.note-card').length,
  titles: Array.from(document.querySelectorAll('.note-card .nc-title')).map((e) => e.textContent),
}));
results.noteDedupe.pass = results.noteDedupe.cards === 1;
await page.click('.seg button:has-text("卡片")');
await page.waitForTimeout(500);
const cards = await page.locator('.notes-card').count();
await page.click('.seg button:has-text("时间轴")');
await page.waitForTimeout(500);
const tl = await page.locator('.notes-timeline .tl-card').count();
await page.click('.seg button:has-text("分栏")');
await page.waitForTimeout(400);
results.notesStyles = { cards, timeline: tl, pass: cards > 0 && tl > 0 };

// ===== 6) 专注：默认不自动开始；无「倒计时」模式 ===== 
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
results.focusPage = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    hasCountdownMode: text.includes('倒计时') && text.includes('⏱️'),
    hasStartButton: text.includes('开始专注'),
    modeButtons: Array.from(document.querySelectorAll('.focus-mode-seg .chip')).map((b) => b.textContent),
    durationInputs: document.querySelectorAll('.focus-card input[type=number]').length,
  };
});
results.focusPage.pass = !results.focusPage.hasCountdownMode && results.focusPage.durationInputs >= 4 && results.focusPage.modeButtons.length === 3;

// ===== 7) 设置：不应再有「快捷键」 ===== 
await page.goto(BASE + '/#/settings', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
results.settingsTabs = await page.evaluate(() => ({
  items: Array.from(document.querySelectorAll('.settings-item')).map((e) => e.textContent),
}));
results.settingsTabs.pass = !results.settingsTabs.items.some((t) => t.includes('快捷键'));

console.log(JSON.stringify({ results, errors }, null, 1));
await browser.close();