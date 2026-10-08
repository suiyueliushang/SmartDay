import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(DIST, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(path.join(DIST, "index.html")).pipe(res);
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const args = process.argv.slice(2);
const mobile = args.includes("--mobile");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const ctx = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1000, height: 900 },
  deviceScaleFactor: mobile ? 2 : 2,
  isMobile: mobile,
  hasTouch: mobile,
  userAgent: mobile
    ? "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
    : undefined,
});
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/#/calendar/week/date:2026-10-08`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const out = path.join(ROOT, ".smoke", mobile ? "week-fixed-mobile.png" : "week-fixed-desktop.png");
await page.locator(".week-view").screenshot({ path: out });
console.log("saved", out);
await browser.close();
server.close();
