import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 180)); });

const probe = () => page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.focus-page .card'));
  const ana = cards.find((c) => c.innerText.includes('专注分析'));
  if (!ana) return { err: 'no-analysis-card' };
  const seg = Array.from(ana.querySelectorAll('.seg button')).map((b) => ({ t: b.textContent, on: b.className.includes('on') }));
  return {
    seg,
    periodLabel: (ana.querySelector('.fp-head b') || {}).textContent || '',
    heatInAnalysis: !!ana.querySelector('.fp-heat-block'),
    heatTitle: (ana.querySelector('.fp-heat-title') || {}).textContent || '',
    yearCells: ana.querySelectorAll('.gh-heat .gh-cell').length,
    monthCells: ana.querySelectorAll('.mh-grid .mh-cell').length,
    monthInMonth: ana.querySelectorAll('.mh-grid .mh-cell:not(.out)').length,
    monthHeads: ana.querySelectorAll('.mh-heads span').length,
    monthWidth: (() => { const w = ana.querySelector('.mh-wrap'); return w ? Math.round(w.getBoundingClientRect().width) : 0; })(),
    monthHeight: (() => { const w = ana.querySelector('.mh-wrap'); return w ? Math.round(w.getBoundingClientRect().height) : 0; })(),
    trendBars: ana.querySelectorAll('.fp-trend-col').length,
  };
});

await page.goto(BASE + '/#/focus', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log('=== 默认（年） ===');
console.log(JSON.stringify(await probe(), null, 1));

const clickPeriod = async (label) => {
  await page.locator('.focus-page .card .seg button').filter({ hasText: new RegExp('^' + label + '$') }).first().click();
  await page.waitForTimeout(700);
  return probe();
};
console.log('=== 月 ===');
const m = await clickPeriod('月');
console.log(JSON.stringify(m, null, 1));

// 月度翻页
const before = m.periodLabel;
await page.locator('.focus-page .card button').filter({ hasText: '◀' }).first().click();
await page.waitForTimeout(600);
const afterPrev = (await probe()).periodLabel;
console.log('月度翻页:', JSON.stringify({ before, afterPrev, changed: before !== afterPrev }));

// 点击月度热力图某格 → 跳到那天
await page.locator('.mh-grid .mh-cell:not(.out)').nth(9).click();
await page.waitForTimeout(700);
const picked = await probe();
console.log('=== 点热力图某格后 ===');
console.log(JSON.stringify({ periodLabel: picked.periodLabel, seg: picked.seg, heatInAnalysis: picked.heatInAnalysis, trendBars: picked.trendBars }, null, 1));

console.log('=== 周 / 天 应无热力图 ===');
const w = await clickPeriod('周');
const d = await clickPeriod('天');
console.log(JSON.stringify({ weekHeat: w.heatInAnalysis, weekBars: w.trendBars, dayHeat: d.heatInAnalysis, dayBars: d.trendBars }, null, 1));

console.log('=== 判定 ===');
console.log(JSON.stringify({
  hasFourPeriods: m.seg.length === 4,
  yearHeatInAnalysis: (await clickPeriod('年')).heatInAnalysis,
  monthHeatInAnalysis: m.heatInAnalysis,
  monthHasCells: m.monthInMonth >= 28 && m.monthHeads === 7,
  monthCompact: m.monthWidth <= 280 && m.monthHeight <= 260,
  monthCount: m.monthInMonth,
  noHeatForWeekDay: !w.heatInAnalysis && !d.heatInAnalysis,
  errors,
}, null, 1));
await browser.close();