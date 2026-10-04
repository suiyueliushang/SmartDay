import { chromium } from "playwright";
const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
await page.goto(BASE + '/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
// 建一个清单，再建一个任务在收件箱
await page.fill('input[placeholder="新建清单…"]', '拖拽目标清单');
await page.press('input[placeholder="新建清单…"]', 'Enter');
await page.waitForTimeout(600);
await page.click('.list-item:has-text("全部") >> nth=0').catch(() => {});
await page.waitForTimeout(400);
await page.fill('.quick-add .input', '待归类任务丙');
await page.press('.quick-add .input', 'Enter');
await page.waitForTimeout(700);
// 用真实 DragEvent + DataTransfer 走一遍组件里的拖拽处理
const dropped = await page.evaluate(() => {
  const item = [...document.querySelectorAll('.task-item')].find((el) => el.textContent.includes('待归类任务丙'));
  const target = [...document.querySelectorAll('.list-item')].find((el) => el.textContent.includes('拖拽目标清单'));
  if (!item || !target) return 'missing' + (item ? '' : '-item') + (target ? '' : '-target');
  const dt = new DataTransfer();
  item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  return dt.getData('application/x-smartday-task');
});
await page.waitForTimeout(800);
// 切到目标清单，确认任务真的在里面
await page.click('.list-item:has-text("拖拽目标清单") >> nth=0');
await page.waitForTimeout(700);
const inList = await page.evaluate(() => Array.from(document.querySelectorAll('.task-item .task-title')).map((e) => e.textContent).join('|'));
console.log(JSON.stringify({ droppedTaskId: dropped, targetListTasks: inList, pass: inList.includes('待归类任务丙'), errors }, null, 1));
await browser.close();