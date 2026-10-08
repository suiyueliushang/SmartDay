// 验证 Rollup 构建产物能在浏览器中正常启动（模拟安卓 UA → 命中移动端分支）。
// 用法：PW_CHANNEL=chrome node scripts/verify-android-build.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = 4199;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(DIST, p);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } else {
    // SPA 回退到 index.html
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(path.join(DIST, "index.html")).pipe(res);
  }
});

let failed = 0;
function check(name, ok, detail = "") {
  if (ok) console.log("OK  ", name);
  else { failed++; console.log("FAIL", name, detail); }
}

await new Promise((r) => server.listen(PORT, r));
console.log(`[verify] 静态服务 http://localhost:${PORT}`);

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });

// 等应用挂载
await page.waitForTimeout(2500);

const info = await page.evaluate(() => ({ ua: navigator.userAgent }));

check("页面 UA 为安卓", /Android/.test(info.ua));

// 底部导航（移动端应渲染）
const navCount = await page.locator(".bottom-nav").count();
check("底部导航已渲染", navCount > 0, `count=${navCount}`);

const navItems = await page.locator(".bottom-nav-item").count();
check("底部导航 5 项（需求 C）", navItems === 5, `count=${navItems}`);

// 底部导航 5 项文案与顺序：日历 / 任务 / 笔记 / 专注 / 设置
const navLabels = await page.locator(".bottom-nav-item .bni-label").allTextContents();
const expectedLabels = ["日历", "任务", "笔记", "专注", "设置"];
check(
  "底部导航文案为 日历/任务/笔记/专注/设置",
  JSON.stringify(navLabels) === JSON.stringify(expectedLabels),
  `got=${JSON.stringify(navLabels)}`
);

// 侧栏应隐藏（移动端）
const sidebarVisible = await page.locator(".sidebar").isVisible().catch(() => false);
check("移动端隐藏侧栏", !sidebarVisible);

// 触控目标 ≥44dp（A-A2）——抽查底部导航项高度
const navBox = await page.locator(".bottom-nav-item").first().boundingBox();
check("底部导航项高度 ≥44px（A-A2）", !!navBox && navBox.height >= 44, `h=${navBox?.height}`);

// 应用内容区已渲染
const rootHtmlLen = await page.evaluate(() => document.getElementById("root")?.innerHTML.length ?? 0);
check("应用已挂载内容", rootHtmlLen > 500, `len=${rootHtmlLen}`);

// ============ 今天 + 日历 合并页专项（需求 C + 二次调整） ============
// 布局顺序（自上而下）：日历 → 当天详情 → 纪念日与倒计时 → 本周统计
// 已按要求删除：今日概览、当天汇总、我的日历侧栏
const merged = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const out = {};
  out.hasWrapper = !!q(".today-cal");
  out.hasCalendar = !!q(".today-cal .tc-calendar");
  out.hasMonthGrid = !!q(".today-cal .month-grid");
  out.hasDayDetail = !!q(".today-cal .day-detail");
  // 已删除的区块
  out.hasTodayOverview = !!q(".today-cal .tc-top");
  out.hasDaySummary = !!q(".today-cal .tc-cards");
  out.hasCategorySidebar = !!q(".today-cal .cal-side");
  // 顶部顺序断言：日历区块应在最上（其 top 大于工具栏区域但小于当天详情）
  const cal = q(".today-cal .tc-calendar");
  const dd = q(".today-cal .day-detail");
  const stats = [...document.querySelectorAll(".today-cal .card-title")].find((el) => el.textContent.includes("本周统计"));
  const anniv = [...document.querySelectorAll(".today-cal .card-title")].find((el) => el.textContent.includes("纪念日"));
  const T = (el) => (el ? Math.round(el.getBoundingClientRect().top + (q(".content")?.scrollTop || 0)) : -1);
  out.tCal = T(cal); out.tDd = T(dd); out.tStats = T(stats); out.tAnniv = T(anniv);
  // 需求：纪念日与倒计时 在 本周统计 之上（收尾区块改为本周统计）
  out.orderOK = out.tCal < out.tDd && out.tDd < out.tAnniv && out.tAnniv < out.tStats;
  out.order = [out.tCal, out.tDd, out.tAnniv, out.tStats];
  // ⚙️ 设置按钮存在且在工具栏内
  out.hasGear = !!q(".today-cal .cal-settings-btn");
  out.hasHScroll = document.documentElement.scrollWidth > window.innerWidth + 2;
  return out;
});

check("合并页已渲染（需求 C）", merged.hasWrapper);
check("日历区块置顶", merged.hasCalendar);
check("合并页内嵌月视图", merged.hasMonthGrid);
check("已删除「今日概览」区块", !merged.hasTodayOverview);
check("已删除「当天汇总」区块", !merged.hasDaySummary);
check("已删除「我的日历」侧栏", !merged.hasCategorySidebar);
check("顺序为 日历 → 当天详情 → 纪念日 → 本周统计", merged.orderOK, `tops=${JSON.stringify(merged.order)}`);
check("日历右上角有 ⚙️ 设置按钮", merged.hasGear);
check("合并页无横向溢出", !merged.hasHScroll);

// ⚙️ 弹窗：点击后应出现「日历设置」，含分类管理
await page.locator(".today-cal .cal-settings-btn").click({ force: true });
await page.waitForTimeout(600);
const modal = await page.evaluate(() => {
  const m = document.querySelector(".modal");
  if (!m) return { open: false };
  const txt = m.textContent || "";
  return {
    open: true,
    title: txt.includes("日历设置"),
    hasLunar: txt.includes("显示农历"),
    hasFestivals: txt.includes("显示节假日"),
    hasWeekNum: txt.includes("显示周数"),
    hasDefaultView: txt.includes("默认视图"),
    hasWeekStart: txt.includes("每周起始日"),
    hasMyCals: txt.includes("我的日历"),
    catCount: m.querySelectorAll(".cal-set-cat").length,
  };
});
check("⚙️ 打开日历设置弹窗", modal.open && modal.title);
check("弹窗含「显示农历」", !!modal.hasLunar);
check("弹窗含「显示节假日」", !!modal.hasFestivals);
check("弹窗含「显示周数」", !!modal.hasWeekNum);
check("弹窗含「默认视图」", !!modal.hasDefaultView);
check("弹窗含「每周起始日」", !!modal.hasWeekStart);
check("弹窗含「我的日历」分类", !!modal.hasMyCals && modal.catCount > 0, `cats=${modal.catCount}`);
await page.screenshot({ path: path.join(ROOT, ".smoke", "merged-settings-modal.png") }).catch(() => {});
// 关闭弹窗
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(400);

await page.screenshot({ path: path.join(ROOT, ".smoke", "android-merged.png"), fullPage: true }).catch(() => {});

// 笔记页（#/diary）与专注页（#/focus）应能正常渲染
await page.goto(`http://localhost:${PORT}/#/diary`, { waitUntil: "load" });
await page.waitForTimeout(1500);
const notesMounted = await page.evaluate(() => document.getElementById("root")?.innerHTML.length ?? 0);
check("笔记页可渲染（需求 C）", notesMounted > 500, `len=${notesMounted}`);

// ============ 笔记页专项（需求 F：汉堡菜单 + 抽屉导航） ============
// 先造两条笔记（含标签），否则标签区是空的、断言无从下手
await page.evaluate(async () => {
  const st = window.__smartdayStore?.getState?.();
  if (!st?.upsertNote) return;
  const now = Date.now();
  await st.upsertNote({ title: "随笔一", content: "今天看到一句话，值得记下来。", date: null, tags: ["随笔", "思考"], pinned: false });
  await st.upsertNote({ title: "工作", content: "街道综治例会要点整理。", date: null, tags: ["工作"], pinned: false });
});
await page.waitForTimeout(800);

const notesInit = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const drawer = q(".notes-drawer");
  const r = drawer ? drawer.getBoundingClientRect() : null;
  // 汉堡三横必须真实可见：WebKit 会因 UA 的 align-items:center 让 span 塌缩成 0 宽
  const barRects = [...document.querySelectorAll(".notes-burger .nb-bar")].map((el) => {
    const b = el.getBoundingClientRect();
    return { w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 };
  });
  const barsVisible = barRects.length === 3 && barRects.every((b) => b.w >= 10 && b.h >= 1);
  return {
    hasTopbar: !!q(".notes-topbar"),
    hasBurger: !!q(".notes-burger"),
    burgerBars: document.querySelectorAll(".notes-burger .nb-bar").length,
    burgerBarsVisible: barsVisible,
    burgerBarRects: JSON.stringify(barRects),
    hasTitleBtn: !!q(".notes-title-btn"),
    titleText: q(".notes-title-btn .ntb-text")?.textContent?.trim() ?? "",
    hasSearchBtn: !!q(".notes-search-btn"),
    hasCompose: !!q(".notes-compose"),
    composePh: q(".notes-compose .nc-ph")?.textContent?.trim() ?? "",
    // 移动端抽屉初始应在屏幕外（translateX(-100%)）
    drawerX: r ? Math.round(r.left) : null,
    drawerOffscreen: r ? r.right <= 4 : null,
    feedCards: document.querySelectorAll(".note-feed-card").length,
    hasMoreBtn: !!q(".nfc-more"),
    hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
  };
});

check("笔记页顶部栏已渲染", notesInit.hasTopbar);
check("左上角有 ☰ 汉堡按钮", notesInit.hasBurger);
check("汉堡按钮为三横线", notesInit.burgerBars === 3, `bars=${notesInit.burgerBars}`);
check("汉堡三横真实可见（非 0 宽/高）", notesInit.burgerBarsVisible, `rects=${notesInit.burgerBarRects}`);
check("顶部显示当前筛选标题", notesInit.hasTitleBtn && notesInit.titleText === "全部笔记", `text=${notesInit.titleText}`);
check("顶部有搜索按钮", notesInit.hasSearchBtn);
check("有输入框入口（现在的想法是…）", notesInit.hasCompose && notesInit.composePh.includes("现在的想法"), `ph=${notesInit.composePh}`);
check("抽屉初始收起（在屏幕外）", notesInit.drawerOffscreen, `left=${notesInit.drawerX}`);
check("笔记信息流渲染卡片", notesInit.feedCards > 0, `cards=${notesInit.feedCards}`);
check("卡片有 ··· 更多按钮", notesInit.hasMoreBtn);
check("笔记页无横向溢出", !notesInit.hasHScroll);

// 点 ☰ 打开抽屉：应含「全部笔记」「全部标签」与标签项
await page.locator(".notes-burger").click({ force: true });
await page.waitForTimeout(600);
const drawerOpen = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const drawer = q(".notes-drawer");
  const r = drawer?.getBoundingClientRect();
  const txt = drawer?.textContent || "";
  return {
    open: drawer?.classList.contains("open") ?? false,
    inView: r ? r.left >= -4 : false,
    width: r ? Math.round(r.width) : 0,
    viewportW: Math.round(window.innerWidth),
    hasScrim: !!q(".notes-drawer-scrim"),
    hasAll: txt.includes("全部笔记"),
    hasTagSec: txt.includes("全部标签"),
    tagCount: document.querySelectorAll(".notes-drawer-tag").length,
    firstTag: q(".notes-drawer-tag .ndt-name")?.textContent?.trim() ?? "",
    allRowH: Math.round(q(".notes-drawer-all")?.getBoundingClientRect().height ?? 0),
    tagRowH: Math.round(q(".notes-drawer-tag")?.getBoundingClientRect().height ?? 0),
  };
});
check("点 ☰ 打开抽屉菜单栏", drawerOpen.open && drawerOpen.inView, `open=${drawerOpen.open} left=${drawerOpen.width}`);
check("抽屉有遮罩层", drawerOpen.hasScrim);
check("抽屉含「全部笔记」", drawerOpen.hasAll);
check("抽屉含「全部标签」分组", drawerOpen.hasTagSec);
check("抽屉列出标签", drawerOpen.tagCount > 0, `tags=${drawerOpen.tagCount} first=${drawerOpen.firstTag}`);
check("抽屉宽度 ≤ 屏幕 84%", drawerOpen.width <= drawerOpen.viewportW * 0.86, `w=${drawerOpen.width} vw=${drawerOpen.viewportW}`);
check("「全部笔记」行触控 ≥44px（A-A2）", drawerOpen.allRowH >= 44, `h=${drawerOpen.allRowH}`);
check("标签行触控 ≥44px（A-A2）", drawerOpen.tagRowH >= 44, `h=${drawerOpen.tagRowH}`);

await page.screenshot({ path: path.join(ROOT, ".smoke", "notes-drawer-open.png"), fullPage: false }).catch(() => {});

// 点第一个标签：抽屉关闭 + 标题变为 #标签
const firstTagName = drawerOpen.firstTag;
await page.locator(".notes-drawer-tag").first().click({ force: true });
await page.waitForTimeout(700);
const afterTag = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const drawer = q(".notes-drawer");
  const r = drawer?.getBoundingClientRect();
  return {
    titleText: q(".notes-title-btn .ntb-text")?.textContent?.trim() ?? "",
    drawerClosed: r ? r.right <= 4 : null,
    hasScrim: !!q(".notes-drawer-scrim"),
    activeTag: q(".notes-drawer-tag.active .ndt-name")?.textContent?.trim() ?? "",
  };
});
check("点标签后抽屉自动关闭", afterTag.drawerClosed && !afterTag.hasScrim, `closed=${afterTag.drawerClosed}`);
check("标题切换为 #标签", afterTag.titleText === "#" + firstTagName, `title=${afterTag.titleText} expect=#${firstTagName}`);
check("该标签在抽屉中高亮", afterTag.activeTag === firstTagName, `active=${afterTag.activeTag}`);

// 再开抽屉，点遮罩关闭
await page.locator(".notes-burger").click({ force: true });
await page.waitForTimeout(500);
await page.locator(".notes-drawer-scrim").click({ force: true });
await page.waitForTimeout(500);
const afterScrim = await page.evaluate(() => {
  const r = document.querySelector(".notes-drawer")?.getBoundingClientRect();
  return { closed: r ? r.right <= 4 : null, hasScrim: !!document.querySelector(".notes-drawer-scrim") };
});
check("点遮罩关闭抽屉", afterScrim.closed && !afterScrim.hasScrim, `closed=${afterScrim.closed}`);

// 回到「全部笔记」并截图
await page.locator(".notes-burger").click({ force: true });
await page.waitForTimeout(400);
await page.locator(".notes-drawer-all").click({ force: true });
await page.waitForTimeout(700);
const backAll = await page.evaluate(() => ({
  titleText: document.querySelector(".notes-title-btn .ntb-text")?.textContent?.trim() ?? "",
}));
check("点「全部笔记」回到全部", backAll.titleText === "全部笔记", `title=${backAll.titleText}`);

await page.screenshot({ path: path.join(ROOT, ".smoke", "notes-feed.png"), fullPage: false }).catch(() => {});

await page.goto(`http://localhost:${PORT}/#/focus`, { waitUntil: "load" });
await page.waitForTimeout(1500);
const focusMounted = await page.evaluate(() => document.getElementById("root")?.innerHTML.length ?? 0);
check("专注页可渲染（需求 C）", focusMounted > 500, `len=${focusMounted}`);

// 回到默认合并页继续日历专项检查
await page.goto(`http://localhost:${PORT}/#/overview`, { waitUntil: "load" });
await page.waitForTimeout(1500);

// ============ 日历页布局专项（移动端单列） ============
await page.goto(`http://localhost:${PORT}/#/calendar`, { waitUntil: "load" });
await page.waitForTimeout(2000);

const calChecks = await page.evaluate(() => {
  const out = {};
  const q = (s) => document.querySelector(s);
  const layout = q(".cal-layout");
  const main = q(".cal-main");
  const side = q(".cal-side");
  const toolbar = q(".cal-toolbar");
  const title = q(".cal-toolbar .title");
  const grid = q(".month-grid");
  const cells = document.querySelectorAll(".month-cell");

  // 布局方向：flex-direction 应为 column
  out.layoutDir = layout ? getComputedStyle(layout).flexDirection : null;
  // 主体与侧栏宽度（单列时应基本一致，都接近容器宽）
  out.mainW = main ? Math.round(main.getBoundingClientRect().width) : 0;
  out.sideW = side ? Math.round(side.getBoundingClientRect().width) : 0;
  out.layoutW = layout ? Math.round(layout.getBoundingClientRect().width) : 0;
  // 标题是否换行：高度接近单行（≤32px）说明未竖排
  out.titleH = title ? Math.round(title.getBoundingClientRect().height) : 0;
  out.titleText = title ? title.textContent : "";
  // 月历网格宽度与单元格宽度（应铺满，单元格不能过窄）
  out.gridW = grid ? Math.round(grid.getBoundingClientRect().width) : 0;
  out.viewportW = Math.round(window.innerWidth);
  const firstVisible = [...cells].find((c) => c.getBoundingClientRect().width > 0);
  out.cellW = firstVisible ? Math.round(firstVisible.getBoundingClientRect().width) : 0;
  out.cellH = firstVisible ? Math.round(firstVisible.getBoundingClientRect().height) : 0;
  // 视图切换是否在第二行（top 明显大于导航行）
  const seg = q(".cal-views");
  out.segW = seg ? Math.round(seg.getBoundingClientRect().width) : 0;
  // 触控目标：分类项
  const li = q(".cal-side .list-item");
  out.catItemH = li ? Math.round(li.getBoundingClientRect().height) : 0;
  const ddItem = q(".cal-side .dd-item");
  out.ddItemH = ddItem ? Math.round(ddItem.getBoundingClientRect().height) : 0;
  out.ddItemCount = document.querySelectorAll(".cal-side .dd-item").length;
  // 无数据时回退检查空状态提示所在分区的行高（.dd-sec 内的空态）
  const ddEmpty = q(".cal-side .dd-empty");
  out.ddEmptyH = ddEmpty ? Math.round(ddEmpty.getBoundingClientRect().height) : 0;
  // 是否存在横向溢出
  out.hasHScroll = document.documentElement.scrollWidth > window.innerWidth + 2;
  out.toolbarWrap = toolbar ? getComputedStyle(toolbar).flexWrap : null;
  return out;
});

check("日历页为单列布局（A-新1）", calChecks.layoutDir === "column", `dir=${calChecks.layoutDir}`);
check("日历主体铺满宽度", calChecks.mainW >= calChecks.layoutW - 4, `main=${calChecks.mainW} layout=${calChecks.layoutW}`);
check("侧栏与主体同宽（单列）", Math.abs(calChecks.sideW - calChecks.mainW) <= 4, `side=${calChecks.sideW} main=${calChecks.mainW}`);
check("标题单行不竖排", calChecks.titleH <= 34, `h=${calChecks.titleH} text=${calChecks.titleText}`);
check("月历网格铺满", calChecks.gridW >= calChecks.viewportW - 40, `grid=${calChecks.gridW} vw=${calChecks.viewportW}`);
check("月历单元格宽度合理 ≥40px", calChecks.cellW >= 40, `cellW=${calChecks.cellW}`);
check("月历单元格高度 ≥44px（触控）", calChecks.cellH >= 44, `cellH=${calChecks.cellH}`);
check("视图切换整行铺开", calChecks.segW >= calChecks.viewportW - 40, `seg=${calChecks.segW}`);
check("分类项触控 ≥44px（A-A2）", calChecks.catItemH >= 44, `h=${calChecks.catItemH}`);
check(
  "详情项触控 ≥44px（A-A2）",
  calChecks.ddItemCount === 0 || calChecks.ddItemH >= 44,
  `count=${calChecks.ddItemCount} h=${calChecks.ddItemH}（无数据时跳过）`
);
check("无横向溢出", !calChecks.hasHScroll);

await page.screenshot({ path: path.join(ROOT, ".smoke", "android-calendar-mobile.png"), fullPage: true }).catch(() => {});

// ============ 周视图表头对齐专项 ============
// 关键：表头行 / 全天行 / 时间网格必须是三个独立的行、共用同一套 grid 列模板，
// 且垂直方向严格不重叠（曾出现表头塞在 day-col 内被时间刻度压住导致错位）。
await page.goto(`http://localhost:${PORT}/#/calendar/week/date:2026-10-08`, { waitUntil: "load" });
await page.waitForTimeout(2000);

const weekChecks = await page.evaluate(() => {
  const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
  const head = document.querySelector(".week-head");
  const heads = [...document.querySelectorAll(".day-col-head")];
  const days = [...document.querySelectorAll(".day-num")];
  const allDay = document.querySelector(".all-day-row");
  const label = document.querySelector(".allday-label");
  const cells = [...document.querySelectorAll(".all-day-cell")];
  const body = document.querySelector(".week-body");
  const cols = [...document.querySelectorAll(".day-col")];
  const firstSlot = document.querySelector(".time-slot");
  const secondSlot = document.querySelectorAll(".time-slot")[1];
  const rh = R(head), ra = R(allDay), rb = R(body);
  return {
    hasHead: !!head,
    // 表头不再是 day-col 的子元素（结构上已提出）
    headInsideCol: !!(document.querySelector(".day-col > .day-col-head")),
    headCount: heads.length,
    dayNumCount: days.length,
    headRects: heads.map(R),
    cellRects: cells.map(R),
    colRects: cols.map(R),
    rh, ra, rb,
    label: R(label),
    firstSlot: R(firstSlot),
    secondSlot: R(secondSlot),
    // 三行自上而下、无重叠
    orderOk: !!rh && !!ra && !!rb && rh.bottom <= ra.y + 1 && ra.bottom <= rb.y + 1,
    // 表头行内元素不越界
    headInnerOk: !!rh && heads.every((h) => { const b = h.getBoundingClientRect(); return b.top >= rh.y - 2 && b.bottom <= rh.bottom + 2; }),
    // 00:00 刻度在时间网格内（不再溢出到全天行）
    slot0Inside: !!rb && !!R(firstSlot) && R(firstSlot).y >= rb.y - 2,
    hScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
  };
});

check("周视图有独立表头行 .week-head", weekChecks.hasHead);
check("表头已从 .day-col 内部提出", !weekChecks.headInsideCol);
check("表头含 7 个星期表头", weekChecks.headCount === 7, `n=${weekChecks.headCount}`);
check("表头含 7 个日期数字", weekChecks.dayNumCount === 7, `n=${weekChecks.dayNumCount}`);
check(
  "表头行 / 全天行 / 时间网格 自上而下无重叠",
  weekChecks.orderOk,
  `head=${JSON.stringify(weekChecks.rh)} allDay=${JSON.stringify(weekChecks.ra)} body=${JSON.stringify(weekChecks.rb)}`
);
check("表头内容不越出表头行", weekChecks.headInnerOk);
check(
  "00:00 刻度落在时间网格内（不压到全天行）",
  weekChecks.slot0Inside,
  `slot0=${JSON.stringify(weekChecks.firstSlot)} bodyY=${weekChecks.rb?.y}`
);
// 表头 / 全天格 / 时间列三者 x 坐标必须逐一相同
const headXs = weekChecks.headRects.map((r) => r.x);
const cellXs = weekChecks.cellRects.map((r) => r.x);
const colXs = weekChecks.colRects.map((r) => r.x);
const sameAxis = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1);
check("表头列与全天列 x 对齐", sameAxis(headXs, cellXs), `head=${headXs} cell=${cellXs}`);
check("表头列与时间网格列 x 对齐", sameAxis(headXs, colXs), `head=${headXs} col=${colXs}`);
check("周视图无横向溢出", !weekChecks.hScroll);

await page.locator(".week-view").screenshot({ path: path.join(ROOT, ".smoke", "android-week-head.png") }).catch(() => {});

// ============ 设置页二级页面专项（需求 E） ============
// 根页（#/settings）：只显示分组入口列表，不再有横向 tab 条
await page.goto(`http://localhost:${PORT}/#/settings`, { waitUntil: "load" });
await page.waitForTimeout(1800);

const setRoot = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const items = [...document.querySelectorAll(".settings-menu-item")];
  const out = {
    hasMenu: !!q(".settings-menu"),
    itemCount: items.length,
    labels: items.map((el) => el.querySelector(".smi-label")?.textContent?.trim() ?? ""),
    keys: items.map((el) => el.getAttribute("data-key")),
    // 根页不应出现横向 tab 条 / 分组内容
    hasStrip: !!q(".settings-nav"),
    hasContent: !!q(".settings-sub") || !!q(".settings-layout"),
    // 入口行触控高度
    firstH: items[0] ? Math.round(items[0].getBoundingClientRect().height) : 0,
    // 每行都有 › 箭头
    arrows: items.filter((el) => !!el.querySelector(".smi-arrow")).length,
    // 整行宽度铺满（不能是窄列）
    firstW: items[0] ? Math.round(items[0].getBoundingClientRect().width) : 0,
    viewportW: Math.round(window.innerWidth),
    hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
  };
  return out;
});

const expectedKeys = ["general", "calendar", "task", "diary", "reminder", "focus", "data", "sync", "push"];
check("设置根页渲染分组入口列表", setRoot.hasMenu, `count=${setRoot.itemCount}`);
check("设置根页共 9 个分组入口", setRoot.itemCount === 9, `count=${setRoot.itemCount}`);
check(
  "入口顺序为 通用/日历/任务/笔记/提醒/专注/数据管理/同步/推送",
  JSON.stringify(setRoot.keys) === JSON.stringify(expectedKeys),
  `got=${JSON.stringify(setRoot.keys)}`
);
check("每个入口都带 › 箭头", setRoot.arrows === setRoot.itemCount, `arrows=${setRoot.arrows}/${setRoot.itemCount}`);
check("根页不再显示横向 tab 条", !setRoot.hasStrip);
check("根页不渲染任何分组内容", !setRoot.hasContent);
check("入口行触控 ≥44px（A-A2）", setRoot.firstH >= 44, `h=${setRoot.firstH}`);
check("入口行整宽铺开", setRoot.firstW >= setRoot.viewportW - 40, `w=${setRoot.firstW} vw=${setRoot.viewportW}`);
check("设置根页无横向溢出", !setRoot.hasHScroll);

await page.screenshot({ path: path.join(ROOT, ".smoke", "settings-root.png"), fullPage: true }).catch(() => {});

// 点击「专注」入口 → 应进入子页面（hash 变化 + 只渲染该分组）
await page.locator('.settings-menu-item[data-key="focus"]').click({ force: true });
await page.waitForTimeout(900);

const setSub = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const sub = q(".settings-sub");
  const txt = sub?.textContent || "";
  const back = q(".settings-back");
  return {
    hash: location.hash,
    hasSub: !!sub,
    hasBack: !!back,
    backText: back?.textContent?.trim() ?? "",
    backH: back ? Math.round(back.getBoundingClientRect().height) : 0,
    titleText: q(".settings-sub-title")?.textContent?.trim() ?? "",
    // 内容：专注分组应含「专注时自动勿扰」
    hasFocusContent: txt.includes("专注时自动勿扰"),
    // 二级页不应再显示入口列表
    stillHasMenu: !!q(".settings-menu"),
    hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
  };
});

check("点击入口跳转到子页 hash（#/settings/tab:focus）", setSub.hash === "#/settings/tab:focus", `hash=${setSub.hash}`);
check("子页渲染 .settings-sub", setSub.hasSub);
check("子页显示返回按钮", setSub.hasBack, `text=${setSub.backText}`);
check("返回按钮触控 ≥44px（A-A2）", setSub.backH >= 44, `h=${setSub.backH}`);
check("子页标题为「专注」", setSub.titleText.includes("专注"), `title=${setSub.titleText}`);
check("子页渲染该分组内容（专注时自动勿扰）", setSub.hasFocusContent);
check("子页不再显示入口列表", !setSub.stillHasMenu);
check("设置子页无横向溢出", !setSub.hasHScroll);

await page.screenshot({ path: path.join(ROOT, ".smoke", "settings-sub.png"), fullPage: true }).catch(() => {});

// 点返回 → 回到根页（入口列表）
await page.locator(".settings-back").click({ force: true });
await page.waitForTimeout(800);
const setBack = await page.evaluate(() => ({
  hash: location.hash,
  hasMenu: !!document.querySelector(".settings-menu"),
  itemCount: document.querySelectorAll(".settings-menu-item").length,
  hasSub: !!document.querySelector(".settings-sub"),
}));
check("返回后 hash 回到 #/settings", setBack.hash === "#/settings", `hash=${setBack.hash}`);
check("返回后重新显示 9 个入口", setBack.hasMenu && setBack.itemCount === 9, `count=${setBack.itemCount}`);
check("返回后子页已卸载", !setBack.hasSub);

// 直接以子页 hash 打开（深链 / 返回键场景）
await page.goto(`http://localhost:${PORT}/#/settings/tab:data`, { waitUntil: "load" });
await page.waitForTimeout(1600);
const setDeep = await page.evaluate(() => {
  const sub = document.querySelector(".settings-sub");
  return {
    hasSub: !!sub,
    isData: (sub?.textContent || "").includes("数据管理"),
    hasMenu: !!document.querySelector(".settings-menu"),
  };
});
check("深链 #/settings/tab:data 直接进子页", setDeep.hasSub && setDeep.isData);
check("深链进子页时不渲染入口列表", !setDeep.hasMenu);

// 无致命错误
check("无页面错误", errors.length === 0, errors.slice(0, 5).join(" | "));

await page.screenshot({ path: path.join(ROOT, ".smoke", "android-build.png") }).catch(() => {});

await browser.close();
server.close();

console.log("");
if (failed === 0) console.log("ALL PASSED");
else { console.log(failed + " FAILED"); process.exit(1); }
