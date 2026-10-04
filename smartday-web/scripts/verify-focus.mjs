import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 180)); });

// ===== 1) 从【任务】启动专注 =====
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.fill('.quick-add .input', '专注验证任务甲');
await page.press('.quick-add .input', 'Enter');
await page.waitForTimeout(700);
await page.click('.task-item >> nth=0');
await page.waitForTimeout(700);
await page.click('.side-drawer button:has-text("开始专注")');
await page.waitForTimeout(700);
await page.click('.modal button:has-text("开始专注")');
await page.waitForTimeout(1800);
const panelRunning = await page.locator('.modal button:has-text("暂停")').count();

// ===== 2) 到专注页：应显示进行中，且不能再次开始 =====
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const running = await page.evaluate(() => {
  // 改版后：不再有独立的"进行中"横幅，改为「来源细条 + 卡片内计时器接管」
  const card = document.querySelector('.focus-page .card');
  const strip = card ? card.querySelector('.fp-running-strip') : null;
  const ring = card ? card.querySelector('.timer-ring') : null;
  return {
    has: !!strip && !!ring,
    text: strip ? strip.innerText.replace(/\s+/g, ' ').slice(0, 120) : '',
    timerText: ring ? ring.innerText.replace(/\s+/g, ' ').trim() : '',
  };
});
const r1 = { panelRunning, runningCard: running.has, runningText: running.text, timerText: running.timerText };
console.log('=== 任务专注到专注页 ===');
console.log(JSON.stringify(r1, null, 1));

// ===== 3) 结束该专注 =====
await page.click('.focus-page .card button:has-text("提前完成")');
await page.waitForTimeout(1200);
const afterFinish = await page.evaluate(() => ({
  runningStrip: !!document.querySelector('.fp-running-strip'),
  startUi: !!document.querySelector('.focus-mode-seg'),
  startBtn: /开始专注/.test(document.body.innerText),
}));
console.log('=== 结束后 ===');
console.log(JSON.stringify(afterFinish, null, 1));

// ===== 4) 热力图 =====
const heat = await page.evaluate(() => ({
  cells: document.querySelectorAll('.gh-cell').length,
  months: Array.from(document.querySelectorAll('.gh-months span')).map((e) => e.textContent),
  legend: document.querySelectorAll('.fp-legend .gh-cell').length,
  summary: (document.querySelector('.fp-heat-sum') || {}).innerText || '',
}));
console.log('=== 热力图 ===');
console.log(JSON.stringify(heat, null, 1));

// ===== 5) 点击热力图某天，分析切到「天」=====
await page.click('.gh-cell >> nth=200');
await page.waitForTimeout(900);
const afterPick = await page.evaluate(() => {
  const seg = Array.from(document.querySelectorAll('.seg button')).map((b) => ({ t: b.textContent, on: b.className.includes('on') }));
  const labels = Array.from(document.querySelectorAll('.focus-page b')).map((b) => b.textContent);
  return { seg, trendBars: document.querySelectorAll('.fp-trend-col').length, labels, metrics: document.querySelectorAll('.stat-card').length };
});
console.log('=== 点击热力图后 ===');
console.log(JSON.stringify(afterPick, null, 1));

// ===== 6) 年 / 周 / 天 切换 =====
const periods = {};
for (const pair of [['年', 12], ['周', 7], ['天', 24]]) {
  await page.locator('.seg button').filter({ hasText: pair[0] }).last().click();
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => ({ bars: document.querySelectorAll('.fp-trend-col').length, labels: Array.from(document.querySelectorAll('.focus-page b')).map((b) => b.textContent) }));
  info.expect = pair[1];
  periods[pair[0]] = info;
}
console.log('=== 年/周/天 ===');
console.log(JSON.stringify(periods, null, 1));

// ===== 7) 年度切换 =====
await page.locator('.focus-page .btn').filter({ hasText: '◀' }).first().click();
await page.waitForTimeout(600);
console.log('=== 切到上一年 ===');
console.log(await page.evaluate(() => Array.from(document.querySelectorAll('.focus-page b')).map((b) => b.textContent).join(' | ')));
console.log('=== 错误 ===');
console.log(errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none');
await browser.close();