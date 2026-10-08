// 构建包装：把 esbuild 的临时目录指向项目内（.build-tmp），
// 规避部分 Windows 环境（Defender/安全软件）锁定系统 %TEMP% 导致
// 「[vite:esbuild-transpile] remove ...: Access is denied」构建失败的问题。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, ".build-tmp");
fs.mkdirSync(tmp, { recursive: true });

// 关键：让 esbuild 的临时文件落在项目内，而不是被锁定的系统 %TEMP%
const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp };

const runNode = (scriptPath, args) => {
  const r = spawnSync(process.execPath, [scriptPath, ...args], { cwd: root, stdio: "inherit", env });
  return r.status ?? 1;
};

const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
if (runNode(tscBin, ["-p", "tsconfig.json"]) !== 0) {
  console.error("[build] 类型检查失败");
  process.exit(1);
}

const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const code = runNode(viteBin, ["build", ...process.argv.slice(2)]);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 忽略清理失败 */ }
process.exit(code);