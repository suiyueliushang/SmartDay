// 移动端适配浏览器冒烟测试
// 对应验收点：A-A1（底部导航 4 项）、A-A2（触控目标 ≥44dp）、
//            移动端隐藏侧栏、底部导航点击切换路由
// 需要先起 vite preview（dist 已存在）
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:4173";
const PW_CHANNEL = process.env.PW_CHANNEL;

const browser = await chromium.launch({ channel: PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // iPhone 尺寸

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log("OK  ", name);
  else { failed++; console.log("FAIL", name, detail ?? ""); }
}

await page.goto(BASE + "/#/overview", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// A-A1 底部导航 4 项
const navInfo = await page.evaluate(() => {
  const nav = document.querySelector(".bottom-nav");
  if (!nav) return { exists: false };
  const items = [...nav.querySelectorAll(".bottom-nav-item")];
  return {
    exists: true,
    count: items.length,
    labels: items.map((i) => i.querySelector(".bni-label")?.textContent?.trim()),
    itemHeights: items.map((i) => i.getBoundingClientRect().height),
    itemWidths: items.map((i) => i.getBoundingClientRect().width),
  };
});
check("移动端显示底部导航", navInfo.exists === true);
check("底部导航 4 项", navInfo.count === 4, JSON.stringify(navInfo.labels));
check("导航项标签正确（今天/日历/任务/设置）",
  JSON.stringify(navInfo.labels) === JSON.stringify(["今天", "日历", "任务", "设置"]),
  JSON.stringify(navInfo.labels));

// A-A2 触控目标 ≥44dp（在 390px 宽、设备像素比约 3 下，44dp ≈ 132px 视口；这里用 >=40px 的保守阈值，因为 CSS 用 min-height 48px）
check("底部导航触控目标 ≥44px", navInfo.itemHeights.every((h) => h >= 44), JSON.stringify(navInfo.itemHeights));

// 移动端隐藏侧栏
const sidebarHidden = await page.evaluate(() => {
  const sb = document.querySelector(".sidebar");
  return !sb || sb.getBoundingClientRect().width === 0 || getComputedStyle(sb).display === "none";
});
check("移动端隐藏侧栏", sidebarHidden === true);

// 底部导航点击切换路由
await page.locator(".bottom-nav-item", { hasText: "日历" }).click();
await page.waitForTimeout(600);
const routeAfterClick = await page.evaluate(() => location.hash);
check("点击「日历」切换到日历路由", routeAfterClick.includes("calendar"), routeAfterClick);

await page.locator(".bottom-nav-item", { hasText: "任务" }).click();
await page.waitForTimeout(600);
const route2 = await page.evaluate(() => location.hash);
check("点击「任务」切换到任务路由", route2.includes("tasks"), route2);

// 激活态高亮
const activeLabel = await page.evaluate(() => {
  const active = document.querySelector(".bottom-nav-item.active .bni-label");
  return active?.textContent?.trim();
});
check("当前激活项为「任务」", activeLabel === "任务", activeLabel);

// 桌面端（宽屏）不显示底部导航
const desktop = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await desktop.goto(BASE + "/#/overview", { waitUntil: "networkidle" });
await desktop.waitForTimeout(1200);
const desktopNav = await desktop.evaluate(() => ({
  bottomNav: !!document.querySelector(".bottom-nav"),
  sidebar: !!document.querySelector(".sidebar"),
}));
check("桌面端不显示底部导航", desktopNav.bottomNav === false);
check("桌面端显示侧栏", desktopNav.sidebar === true);

console.log("");
if (failed === 0) console.log("ALL PASSED");
else { console.log(failed + " FAILED"); process.exit(1); }
await browser.close();
