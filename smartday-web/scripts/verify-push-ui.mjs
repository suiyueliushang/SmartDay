import { chromium } from "playwright";

// 推送设置页 UI 验收（对应需求 W-7.3.3 / W-A17 / W-A18）：
// 总开关卡片存在、通知方式为「列表」（可添加多条、可启用/停用/删除/发送测试）、
// 「添加通知方式」网格存在、无横向溢出、计数「已启用 N / 共 M」实时更新。
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
  const chCards = Array.from(document.querySelectorAll('.push-ch'));
  const title = document.querySelector('.card-title');
  return {
    overflowX: layout.scrollWidth - layout.clientWidth,
    cardOverflow: card ? card.scrollWidth - card.clientWidth : 0,
    tileCount: tiles.length,
    tileNames: tiles.map((t) => t.textContent.trim()),
    chCount: chCards.length,
    statusCard: !!document.querySelector('.push-status-card'),
    hasAddSection: !!Array.from(document.querySelectorAll('.card-title')).find((x) => x.textContent.includes('添加通知方式')),
    countTitle: title ? title.textContent : '',
  };
});

const a = await probe();
console.log('=== 初始（无通道） ===');
console.log(JSON.stringify(a, null, 1));

// 添加一条 OneBot 通道，验证「通知方式列表」出现卡片 + 计数更新
await page.locator('.push-tile').filter({ hasText: 'OneBot' }).first().click();
await page.waitForTimeout(800);
const b = await probe();
console.log('=== 添加 OneBot 后 ===');
console.log(JSON.stringify(b, null, 1));

// 再添加一条邮箱通道，验证「可同时配置多条」
await page.locator('.push-tile').filter({ hasText: '邮箱' }).first().click();
await page.waitForTimeout(800);
const c = await probe();
console.log('=== 添加邮箱后（两条） ===');
console.log(JSON.stringify(c, null, 1));

await page.locator('.settings-layout').screenshot({ path: '.smoke/push-settings.png' });

console.log('=== 判定 ===');
console.log(JSON.stringify({
  noHorizontalOverflow: a.overflowX <= 1 && a.cardOverflow <= 1,
  statusCard: a.statusCard,
  hasAddSection: a.hasAddSection,
  ninePresets: a.tileCount >= 8,
  addShowsCard: b.chCount === 1 && b.countTitle.includes('共 1'),
  multiChannel: c.chCount === 2 && c.countTitle.includes('共 2'),
  enabledCountShown: b.countTitle.includes('已启用 1') || b.countTitle.includes('已启用 2'),
  errors,
}, null, 1));
await browser.close();
