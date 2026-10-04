import { chromium } from "playwright";
import http from "node:http";

const got = [];
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => { got.push({ url: req.url, body }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}'); });
});
await new Promise((r) => server.listen(5199, '127.0.0.1', r));

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 160)); });

// 1) 配置推送（OneBot + 本地假服务）
await page.goto(BASE + '/#/settings/tab:push', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.locator('input[placeholder="http://127.0.0.1:3000"]').fill('http://127.0.0.1:5199');
await page.locator('input[placeholder="如 10001"]').fill('2837644648');
await page.waitForTimeout(400);
// 打开「开启外部推送」（状态条上的开关）
await page.locator('.push-status-card .switch, .push-status-card input[type=checkbox]').first().click().catch(() => {});
await page.waitForTimeout(600);
const enabled = await page.evaluate(() => document.querySelector('.push-status-card').className.includes('on'));

// 2) 注入一条 15 分钟后开始、提前 15 分钟提醒的事件
await page.evaluate(async () => {
  const now = Date.now();
  const p = (n) => String(n).padStart(2, '0');
  const fmt = (d) => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00';
  const start = new Date(now + 15 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const ev = {
    id: 'push-test-event', title: '推送端到端验证会议', start: fmt(start), end: fmt(end), allDay: false,
    categoryId: 'cat-default', color: '#4f6ef7', location: '会议室', description: '', reminders: [{ minutes: 15 }],
    createdAt: now, updatedAt: now,
  };
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('events', 'readwrite');
      tx.objectStore('events').put(ev);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});

// 3) 重新加载，让提醒引擎开始扫描（每 30 秒一拍）
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
let pushed = null;
for (let i = 0; i < 22; i++) {
  if (got.length) { pushed = got[0]; break; }
  await page.waitForTimeout(2000);
}

// 4) 通知中心是否也有这条通知
const notif = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('通知中心'));
  if (btn) btn.click();
  return null;
});
await page.waitForTimeout(800);
const centerText = await page.evaluate(() => (document.querySelector('.notif-panel, .notification-panel, .modal') || {}).innerText || '');

console.log('=== 开关已开启 ===');
console.log(enabled);
console.log('=== 外部通道收到的请求 ===');
console.log(JSON.stringify(got, null, 1));
console.log('=== 通知中心片段 ===');
console.log(centerText.replace(/\s+/g, ' ').slice(0, 200));
let payload = null;
try { payload = JSON.parse((pushed && pushed.body) || '{}'); } catch { /* ignore */ }
console.log('=== 判定 ===');
console.log(JSON.stringify({
  pushEnabled: enabled,
  pushedToChannel: !!pushed,
  correctApi: !!pushed && (pushed.url || '').startsWith('/send_private_msg'),
  correctQQ: !!payload && payload.user_id === 2837644648,
  carriesEventTitle: !!(payload && String(payload.message || '').includes('推送端到端验证会议')),
  notificationCenterHasIt: centerText.includes('推送端到端验证会议'),
  errors,
}, null, 1));
await browser.close();
server.close();