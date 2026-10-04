import { chromium } from "playwright";
import http from "node:http";

// 假 OneBot 服务：记录收到的请求并返回 200（带 CORS 头）
const received = [];
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    received.push({ method: req.method, url: req.url, auth: req.headers.authorization || '', body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', retcode: 0 }));
  });
});
await new Promise((r) => server.listen(5199, '127.0.0.1', r));

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });

await page.goto(BASE + '/#/settings/tab:push', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const hasTab = await page.locator('.settings-item').filter({ hasText: '推送' }).count();
// 配置：OneBot + 本地假服务 + 我的 QQ 号
const urlInput = page.locator('input[placeholder="http://127.0.0.1:3000"]');
await urlInput.fill('http://127.0.0.1:5199');
await page.locator('input[placeholder="如 10001"]').fill('10001');
await page.waitForTimeout(500);
// 开启外部推送
await page.locator('.settings-layout').filter({ hasText: '开启外部推送' }).locator('.switch, input[type=checkbox]').first().click().catch(async () => {
  await page.locator('button, .switch').filter({ hasText: '' }).first().click().catch(() => {});
});
await page.waitForTimeout(400);
await page.click('button:has-text("发送测试消息")');
await page.waitForTimeout(2000);

const uiResult = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('div')).find((d) => d.textContent && d.textContent.includes('推送测试') === false && (d.textContent.includes('✅') || d.textContent.includes('⚠️')) && d.children.length === 0);
  return el ? el.textContent.trim().slice(0, 120) : '';
});
console.log('=== 假服务收到 ===');
console.log(JSON.stringify(received, null, 1));
console.log('=== 页面结果提示 ===');
console.log(uiResult);
console.log('=== 判定 ===');
const req0 = received[0] || {};
let payload = null;
try { payload = JSON.parse(req0.body || '{}'); } catch { /* ignore */ }
console.log(JSON.stringify({
  pushTabExists: hasTab > 0,
  requestSent: received.length > 0,
  correctPath: (req0.url || '').startsWith('/send_private_msg'),
  correctUserId: payload && payload.user_id === 10001,
  messageHasTitle: !!(payload && String(payload.message || '').includes('SmartDay 推送测试')),
  uiShowsSuccess: uiResult.includes('✅'),
  errors,
}, null, 1));
await browser.close();
server.close();