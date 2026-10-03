// 浏览器冒烟测试：启动 preview，逐页访问并收集控制台错误
import { chromium } from "playwright";

const BASE = process.env.PREVIEW_URL || 'http://localhost:4173';
const errors = [];
const pageErrors = [];

async function main() {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const routes = [
    '#/overview', '#/calendar', '#/calendar/week', '#/calendar/day', '#/calendar/year', '#/calendar/agenda',
    '#/tasks', '#/tasks/list:list-myday', '#/diary', '#/focus', '#/settings', '#/settings/tab:data', '#/settings/tab:sync', '#/desktop'
  ];

  for (const r of routes) {
    await page.goto(BASE + "/" + r, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(400);
    const title = await page.title();
    const bodyLen = (await page.content()).length;
    console.log("PAGE", r, "| title:", title, "| html:", bodyLen);
  }

  // 交互冒烟：新建任务
  await page.goto(BASE + "/#/tasks", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const addInput = page.locator('.quick-add .input');
  if (await addInput.count()) {
    await addInput.fill("浏览器冒烟任务");
    await addInput.press("Enter");
    await page.waitForTimeout(500);
  }
  const taskCount = await page.locator('.task-item').count();
  console.log("TASK items:", taskCount);

  // 新建事件
  await page.goto(BASE + "/#/calendar", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const cells = page.locator('.month-cell');
  if (await cells.count()) {
    await cells.first().click();
    await page.waitForTimeout(300);
    const titleInput = page.locator('.modal input.input').first();
    if (await titleInput.count()) {
      await titleInput.fill("浏览器冒烟事件");
      await page.locator('.modal .btn-primary').first().click();
      await page.waitForTimeout(500);
    }
  }

  // 写日记
  await page.goto(BASE + "/#/diary", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const mdInput = page.locator('.md-input').first();
  if (await mdInput.count()) {
    await mdInput.fill("# 测试日记\n\n**今天** 完成了冒烟测试。");
    await page.waitForTimeout(1500);
  }
  const diaryStatus = await page.locator('.md-statusbar .saving').textContent().catch(() => '');
  console.log("DIARY status:", diaryStatus);

  // 专注页
  await page.goto(BASE + "/#/focus", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const timerText = await page.locator('.timer-num').textContent().catch(() => '');
  console.log("TIMER:", timerText.trim().slice(0, 40));

  await browser.close();

  const fatal = [...pageErrors];
  const nonFatal = errors.filter((e) => !/favicon|net::ERR|404/.test(e));
  console.log("\n===== PAGE ERRORS =====");
  for (const e of fatal) console.log('PAGEERR:', e.slice(0, 300));
  console.log("===== CONSOLE ERRORS =====");
  for (const e of nonFatal.slice(0, 30)) console.log('CONSOLE:', e.slice(0, 300));
  console.log("\nRESULT:", fatal.length === 0 && nonFatal.length === 0 ? "PASS" : "FAIL (" + (fatal.length + nonFatal.length) + " errors)");
  process.exit(fatal.length === 0 && nonFatal.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });