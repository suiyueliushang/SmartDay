// 桌面端日历页回归检查：确认 cal-layout 改造未破坏桌面左右两栏布局。
// 用法：PW_CHANNEL=chrome node scripts/verify-calendar-desktop.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = 4201;

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
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

await page.goto(`http://localhost:${PORT}/#/calendar`, { waitUntil: "load" });
await page.waitForTimeout(2000);

const r = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const layout = q(".cal-layout");
  const main = q(".cal-main");
  const side = q(".cal-side");
  const grid = q(".month-grid");
  const firstCell = [...document.querySelectorAll(".month-cell")].find((c) => c.getBoundingClientRect().width > 0);
  return {
    mobile: document.querySelector(".app-shell.mobile") !== null,
    dir: layout ? getComputedStyle(layout).flexDirection : null,
    mainW: main ? Math.round(main.getBoundingClientRect().width) : 0,
    sideW: side ? Math.round(side.getBoundingClientRect().width) : 0,
    gridW: grid ? Math.round(grid.getBoundingClientRect().width) : 0,
    cellW: firstCell ? Math.round(firstCell.getBoundingClientRect().width) : 0,
    catCount: document.querySelectorAll(".cal-side .list-item").length,
    hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
  };
});

check("桌面端未命中移动分支", !r.mobile);
check("桌面端为横向两栏", r.dir === "row", `dir=${r.dir}`);
check("侧栏保持 210px", Math.abs(r.sideW - 210) <= 2, `sideW=${r.sideW}`);
check("主体宽度显著大于侧栏", r.mainW > r.sideW * 2, `mainW=${r.mainW} sideW=${r.sideW}`);
check("月历单元格宽度合理", r.cellW >= 60, `cellW=${r.cellW}`);
check("我的日历分类已渲染", r.catCount >= 1, `count=${r.catCount}`);
check("无横向溢出", !r.hasHScroll);
check("无页面错误", errors.length === 0, errors.slice(0, 3).join(" | "));

await page.screenshot({ path: path.join(ROOT, ".smoke", "calendar-desktop.png") }).catch(() => {});
await browser.close();
server.close();

console.log("");
if (failed === 0) console.log("ALL PASSED");
else { console.log(failed + " FAILED"); process.exit(1); }
