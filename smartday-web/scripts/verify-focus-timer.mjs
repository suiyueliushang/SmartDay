import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 180)); });

const probe = () => page.evaluate(() => {
  const card = document.querySelector('.focus-page .card');
  if (!card) return { err: 'no-card' };
  const ring = card.querySelector('.timer-ring');
  const sel = card.querySelector('select.select');
  const rb = ring ? ring.getBoundingClientRect() : null;
  const sb = sel ? sel.getBoundingClientRect() : null;
  return {
    inCard: !!ring && !!sel,
    ringBelowTask: !!(rb && sb) && rb.top >= sb.bottom - 2,
    ringTop: rb ? Math.round(rb.top) : null,
    taskBottom: sb ? Math.round(sb.bottom) : null,
    strip: (card.querySelector('.fp-running-strip') || {}).innerText || '' ,
    timerText: ring ? ring.innerText.replace(/\s+/g, ' ').trim() : '',
    hasRunningControls: /暂停|提前完成|放弃/.test(card.innerText),
    hasStartBtn: /开始专注/.test(card.innerText),
  };
});

// A) 无会话时
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const idle = await probe();
console.log('=== 无会话 ===');
console.log(JSON.stringify(idle, null, 1));

// B) 从任务启动会话后
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.fill('.quick-add .input', '撰写国情调研报告');
await page.press('.quick-add .input', 'Enter');
await page.waitForTimeout(600);
await page.click('.task-item >> nth=0');
await page.waitForTimeout(600);
await page.click('.side-drawer button:has-text("开始专注")');
await page.waitForTimeout(600);
await page.click('.modal button:has-text("开始专注")');
await page.waitForTimeout(1500);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
const running = await probe();
console.log('=== 任务启动会话后（专注页）===');
console.log(JSON.stringify(running, null, 1));

console.log('=== 判定 ===');
console.log(JSON.stringify({
  idleTimerInCard: idle.inCard && idle.ringBelowTask,
  runningTimerStillInCard: running.inCard,
  runningTimerBelowTask: running.ringBelowTask,
  showsSourceStrip: /撰写国情调研报告/.test(running.strip),
  showsRunningControls: running.hasRunningControls,
  errors,
}, null, 1));
await browser.close();