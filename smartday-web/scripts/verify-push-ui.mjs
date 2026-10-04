import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });
await page.goto(BASE + '/#/settings/tab:push', { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);

const probe = () => page.evaluate(() => {
  const layout = document.querySelector('.settings-layout');
  const card = document.querySelector('.settings-layout .card');
  const tiles = Array.from(document.querySelectorAll('.push-tile'));
  const rows = new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top)));
  const desc = document.querySelector('.push-hint');
  return {
    overflowX: layout.scrollWidth - layout.clientWidth,
    cardOverflow: card ? card.scrollWidth - card.clientWidth : 0,
    tileCount: tiles.length,
    tileRows: rows.size,
    widestTile: tiles.length ? Math.round(Math.max.apply(null, tiles.map((t) => t.getBoundingClientRect().width))) : 0,
    hintWidth: desc ? Math.round(desc.getBoundingClientRect().width) : 0,
    hintHeight: desc ? Math.round(desc.getBoundingClientRect().height) : 0,
    fieldCount: document.querySelectorAll('.push-field').length,
    statusCard: !!document.querySelector('.push-status-card'),
    testBtn: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('发送测试消息')),
  };
});
const a = await probe();
console.log('=== 默认（OneBot） ===');
console.log(JSON.stringify(a, null, 1));
await page.locator('.settings-layout').screenshot({ path: '.smoke/push-settings.png' });

// 切换到「企业微信群机器人」，检查参数区随通道变化
await page.locator('.push-tile').filter({ hasText: '企业微信' }).first().click();
await page.waitForTimeout(600);
const b = await probe();
const fieldLabels = await page.evaluate(() => Array.from(document.querySelectorAll('.pf-label')).map((x) => x.textContent));
console.log('=== 切换到企业微信 ===');
console.log(JSON.stringify({ ...b, fieldLabels }, null, 1));

console.log('=== 判定 ===');
console.log(JSON.stringify({
  noHorizontalOverflow: a.overflowX <= 1 && a.cardOverflow <= 1,
  eightTiles: a.tileCount === 8,
  tilesWrap: a.tileRows >= 2,
  tilesReasonableWidth: a.widestTile >= 150 && a.widestTile <= 420,
  hintNotSqueezed: a.hintWidth > 200 && a.hintHeight < 80,
  fieldsShownForOnebot: a.fieldCount === 4,
  fieldsSwitchWithPreset: b.fieldCount === 1 && fieldLabels.join() === 'Webhook 地址',
  statusCardAndTest: a.statusCard && a.testBtn,
  errors,
}, null, 1));
await browser.close();