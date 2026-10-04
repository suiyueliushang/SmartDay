import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 180)); });

const row = () => page.evaluate(() => {
  const tr = document.querySelector('.kbd-table tbody tr');
  if (!tr) return null;
  const td = Array.from(tr.querySelectorAll('td')).map((x) => x.innerText.trim());
  return { target: td[0], mode: td[1], duration: td[2], start: td[3], status: td[4] };
});
const totalStat = () => page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.focus-page .stat-card'));
  const c = cards.find((x) => x.innerText.includes('总专注时长'));
  return c ? c.innerText.replace(/\s+/g, ' ').trim() : '';
});

// 先建一个任务，便于验证"任务上的专注"时长统计
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.fill('.quick-add .input', '时长验证任务');
await page.press('.quick-add .input', 'Enter');
await page.waitForTimeout(700);
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.fill('.focus-page input[type=number] >> nth=0', '1');
await page.waitForTimeout(400);
const taskSelect = page.locator('.focus-page select.select').first();
const optCount = await taskSelect.locator('option').count();
if (optCount > 1) await taskSelect.selectOption({ index: 1 });
await page.waitForTimeout(400);
await page.click('.focus-page .card button:has-text("开始专注")');

// 等 8 秒，检查计时是否已在累计
await page.waitForTimeout(8000);
const during = await row();
console.log('=== 进行 8 秒后 ===');
console.log(JSON.stringify(during, null, 1));

// 等它到点自动完成（1 分钟番茄钟）
await page.waitForTimeout(58000);
const after = await row();
const total = await totalStat();
console.log('=== 到点完成后 ===');
console.log(JSON.stringify({ record: after, totalStat: total }, null, 1));

console.log('=== 判定 ===');
const notZero = (s) => !!s && !/^0\s*(秒|分钟|小时)$/.test(s) && /\d/.test(s);
console.log(JSON.stringify({
  duringNotZero: notZero(during && during.duration),
  afterCompleted: !!(after && after.status === '已完成' && after.mode === '番茄钟'),
  afterDurationNotZero: notZero(after && after.duration),
  statNotZero: !/总专注时长\s*0秒/.test(total),
  errors,
}, null, 1));
await browser.close();