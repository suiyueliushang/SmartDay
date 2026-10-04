import { chromium } from "playwright";
import http from "node:http";

const got = [];
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => { got.push(body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}'); });
});
await new Promise((r) => server.listen(5199, '127.0.0.1', r));

const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

const openPushTab = async () => { await page.goto(BASE + '/#/settings/tab:push', { waitUntil: 'networkidle' }); await page.waitForTimeout(1400); };
const injectTask = async (id, title, offsetMs) => page.evaluate(async ({ id, title, offsetMs }) => {
  const now = Date.now();
  const t = {
    id, title, listId: 'list-inbox', completed: false, completedAt: null, priority: 'medium', starred: false,
    dueDate: null, dueTime: null, remindAt: now + offsetMs, repeat: null, inMyDay: null,
    tags: [], subtasks: [], attachments: [], notes: '', order: 0, createdAt: now, updatedAt: now,
  };
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => { const db = req.result; const tx = db.transaction('tasks', 'readwrite'); tx.objectStore('tasks').put(t); tx.oncomplete = () => { db.close(); res(null); }; tx.onerror = () => rej(tx.error); };
    req.onerror = () => rej(req.error);
  });
}, { id, title, offsetMs });
const readLog = () => page.evaluate(() => Array.from(document.querySelectorAll('.push-log-row')).map((r) => r.innerText.replace(/\s+/g, ' ').trim()).slice(0, 6));

// 1) 配置通道并开启
await openPushTab();
await page.locator('input[placeholder="http://127.0.0.1:3000"]').fill('http://127.0.0.1:5199');
await page.locator('input[placeholder="如 10001"]').fill('2837644648');
await page.waitForTimeout(300);
await page.locator('.push-status-card .switch, .push-status-card input[type=checkbox]').first().click().catch(() => {});
await page.waitForTimeout(500);

// 2) 任务自定义提醒 → 应推送
await injectTask('push-task-1', '学习', 2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
let hit = false;
for (let i = 0; i < 16; i++) { if (got.length) { hit = true; break; } await page.waitForTimeout(2000); }
console.log('=== 任务提醒推送 ===');
console.log(JSON.stringify(got, null, 1));

// 3) 关闭推送 → 再触发一次，记录里应写明「推送未开启」
await openPushTab();
// 关闭推送（并确认确实关掉了）
for (let i = 0; i < 3; i++) {
  const on = await page.evaluate(() => document.querySelector('.push-status-card').className.includes('on'));
  if (!on) break;
  await page.locator('.push-status-card .switch').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
}
const pushOff = await page.evaluate(() => !document.querySelector('.push-status-card').className.includes('on'));
console.log('推送已关闭 =', pushOff);
const before = got.length;
await injectTask('push-task-2', '学习2', 2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(6000);
await openPushTab();
const log = await readLog();
console.log('=== 推送记录（设置页） ===');
console.log(JSON.stringify(log, null, 1));

let p1 = {};
try { p1 = JSON.parse(got[0] || '{}'); } catch { /* ignore */ }
console.log('=== 判定 ===');
console.log(JSON.stringify({
  taskReminderPushed: hit,
  carriesTaskTitle: String(p1.message || '').includes('学习'),
  correctQQ: p1.user_id === 2837644648,
  pushOff,
  disabledSkipLogged: log.some((r) => r.includes('推送未开启')),
  noPushWhileDisabled: got.length === before,
  logShowsSuccess: log.some((r) => r.includes('已推送')),
  errors,
}, null, 1));
await browser.close();
server.close();