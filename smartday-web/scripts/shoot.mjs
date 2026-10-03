import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [name, hash] of [
  ['overview', '#/overview'],
  ['calendar-month', '#/calendar'],
  ['tasks', '#/tasks'],
  ['diary', '#/diary'],
  ['focus', '#/focus'],
  ['desktop-glass', '#/desktop'],
]) {
  await page.goto('http://localhost:4173/' + hash, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'scripts/shots/' + name + '.png', fullPage: false });
  console.log('shot:', name);
}
// 桌面日历清单样式
await page.goto('http://localhost:4173/#/desktop', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('select').first().selectOption('list');
await page.waitForTimeout(500);
await page.screenshot({ path: 'scripts/shots/desktop-list.png' });
await browser.close();
console.log('DONE');