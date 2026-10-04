import { chromium } from "playwright";
const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
await page.goto(BASE + '/#/diary', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.evaluate(async () => {
  const day = 86400000;
  const now = Date.now();
  const mk = (id, title, content, tags, daysAgo, editDaysAgo) => ({
    id, title, content, date: null, tags, pinned: false,
    createdAt: now - daysAgo * day, updatedAt: now - editDaysAgo * day,
  });
  const recs = [
    mk('nw1', '群众工作技巧', '今天跟着师父去村里走访，记录几点心得：\n\n1. 先听后说，别急着表态；\n2. 把政策换成人话讲；\n3. 有承诺就一定要兑现。', ['工作', '群众工作技巧'], 1, 0),
    mk('nw2', '法考复习计划', '## 本周目标\n\n- 刑法总则 第 1~4 章\n- 民法 合同编 复习\n- 真题 2019 年卷一', ['法考', '学习'], 3, 3),
    mk('nw3', '思考', '看到一句话：制度的意义在于让好人不必冒险，让坏人无处遁形。\n\n记下来提醒自己。', ['思考', '日常'], 8, 8),
    mk('nw4', '词汇积累', '逡巡（qūn xún）：有所顾虑而徘徊不前。\n\n例句：他在门口逡巡良久。', ['词汇积累'], 15, 15),
    mk('nw5', '理财笔记', '把每个月收入的 20% 先存起来，剩下的再做预算。', ['理财', '生活'], 40, 12),
  ];
  await new Promise((res, rej) => {
    const req = indexedDB.open('smartday-db');
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('notes', 'readwrite');
      for (const r of recs) tx.objectStore('notes').put(r);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.locator('.content').screenshot({ path: '.smoke/notes-feed.png' });
// 阅读视图截图
await page.locator('.note-feed-card').first().click();
await page.waitForTimeout(900);
await page.locator('.notes-editor-panel').screenshot({ path: '.smoke/notes-reader.png' });
console.log('shots done');
await browser.close();