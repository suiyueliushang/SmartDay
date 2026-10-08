// 调试：输出移动端下 DOM 的结构与关键类名
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PORT = 4201;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

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
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
  isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push("PAGEERROR " + e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
await page.waitForTimeout(3500);

const dump = await page.evaluate(() => {
  const shell = document.querySelector(".app-shell");
  const root = document.getElementById("root");
  const classes = new Set();
  document.querySelectorAll("*").forEach((el) => {
    if (el.className && typeof el.className === "string") {
      el.className.split(/\s+/).forEach((c) => c && classes.add(c));
    }
  });
  const bn = document.querySelector(".bottom-nav");
  return {
    shellClass: shell?.className ?? "(no shell)",
    rootLen: root?.innerHTML.length ?? 0,
    rootSnippet: (root?.innerHTML ?? "").slice(0, 400),
    hasBottomNav: !!bn,
    bottomNavDisplay: bn ? getComputedStyle(bn).display : null,
    someClasses: [...classes].filter((c) => /nav|shell|mobile|topbar|content|sidebar/i.test(c)).slice(0, 40),
  };
});

console.log("=== shell ===", dump.shellClass);
console.log("=== hasBottomNav ===", dump.hasBottomNav, "display=", dump.bottomNavDisplay);
console.log("=== rootLen ===", dump.rootLen);
console.log("=== 相关类名 ===", dump.someClasses.join(", "));
console.log("=== root 片段 ===\n", dump.rootSnippet);
console.log("=== 控制台 ===\n", logs.slice(0, 20).join("\n"));

await browser.close();
server.close();
