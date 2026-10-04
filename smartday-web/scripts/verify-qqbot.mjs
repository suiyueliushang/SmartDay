import { chromium } from "playwright";

const BASE = 'http://localhost:4173';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const tokenReqs = [];
const msgReqs = [];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });

await page.route('https://bots.qq.com/**', async (route) => {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  tokenReqs.push({ method: req.method(), body: req.postData() });
  return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: 'FAKE_TOKEN_123', expires_in: 7200 }) });
});
await page.route('https://api.sgroup.qq.com/**', async (route) => {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  msgReqs.push({ url: req.url(), auth: req.headers()['authorization'] || '', appid: req.headers()['x-union-appid'] || '', body: req.postData() });
  return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'msg_1', timestamp: Date.now() }) });
});

await page.goto(BASE + '/#/settings/tab:push', { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
// 选择 QQ 官方机器人
await page.locator('.push-tile').filter({ hasText: 'QQ 官方机器人' }).first().click();
await page.waitForTimeout(600);
const labels = await page.evaluate(() => Array.from(document.querySelectorAll('.pf-label')).map((x) => x.textContent));
await page.locator('.push-field').filter({ hasText: 'AppID' }).first().locator('input').fill('1905726028');
await page.locator('.push-field').filter({ hasText: 'AppSecret' }).first().locator('input').fill('FAKE_SECRET_XYZ');
await page.locator('.push-field').filter({ hasText: '目标 openid' }).first().locator('input').fill('OPENID_ABC');
await page.waitForTimeout(500);
await page.click('button:has-text("发送测试消息")');
await page.waitForTimeout(2500);

const uiResult = await page.evaluate(() => {
  const el = document.querySelector('.push-result');
  return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
});
await page.locator('.settings-layout').screenshot({ path: '.smoke/push-qqbot.png' });
console.log('=== 字段 ===');
console.log(JSON.stringify(labels));
console.log('=== 第 1 步：取 access_token ===');
console.log(JSON.stringify(tokenReqs, null, 1));
console.log('=== 第 2 步：发消息 ===');
console.log(JSON.stringify(msgReqs, null, 1));
console.log('=== 页面结果 ===');
console.log(uiResult);

const t0 = tokenReqs[0] || {};
const m0 = msgReqs[0] || {};
let tb = {}; let mb = {};
try { tb = JSON.parse(t0.body || '{}'); } catch { /* ignore */ }
try { mb = JSON.parse(m0.body || '{}'); } catch { /* ignore */ }
console.log('=== 判定 ===');
console.log(JSON.stringify({
  fieldsAreAppIdSecretTarget: labels.join('|') === 'AppID|AppSecret|接收目标|目标 openid',
  tokenRequestSent: tokenReqs.length === 1 && !!tb.appId && !!tb.clientSecret,
  messageRequestSent: msgReqs.length === 1,
  messageUrlUsesOpenid: (m0.url || '').includes('/v2/users/OPENID_ABC/messages'),
  authHeaderUsesToken: (m0.auth || '') === 'QQBot FAKE_TOKEN_123',
  appIdHeaderForwarded: (m0.appid || '') === '1905726028',
  messageContentSent: String(mb.content || '').includes('SmartDay 推送测试'),
  uiShowsSuccess: uiResult.includes('发送成功'),
  errors,
}, null, 1));
await browser.close();