// 构建包装：优先复用 smartday-web 的生产产物（dist/），复制到本项目 www/。
// Capacitor 只需要静态文件，无需在此重复打包。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");           // smartday-android/
const repoRoot = path.resolve(projectRoot, "..");        // calendar-dsh/
const webDist = path.join(repoRoot, "smartday-web", "dist");
const www = path.join(projectRoot, "www");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(path.join(webDist, "index.html"))) {
  console.error(
    `[build-web] 未找到网页端构建产物：${webDist}\n` +
    `请先在 smartday-web/ 执行 npm run build（或 npm run build:raw）。`
  );
  process.exit(1);
}

// 清空并复制
fs.rmSync(www, { recursive: true, force: true });
copyDir(webDist, www);

// 确保入口存在
if (!fs.existsSync(path.join(www, "index.html"))) {
  console.error("[build-web] 复制后仍缺少 index.html");
  process.exit(1);
}

console.log(`[build-web] 已复制网页端产物 → ${www}`);
