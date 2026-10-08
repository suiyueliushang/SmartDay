// ============================================================
// 备用构建：用 Rollup + esbuild 的 in-process transform（不 spawn service）
//
// 背景：本沙箱环境 esbuild 的 service 模式无法 load 系统 DLL（winmm.dll），
// 导致 vite build 失败；但 esbuild 的 transform() 走 in-process，可用。
// 本脚本因此绕开 vite，直接用 rollup 打包。
//
// 【多入口】与 vite.config.ts 的 rollupOptions.input 保持一致：
//   - main      → src/main.tsx          → dist/index.html      （网页端 / 安卓端 Capacitor）
//   - wallpaper → src/wallpaper/main.tsx → dist/wallpaper.html  （桌面端 Electron 壁纸窗口）
// 两个入口各自独立收集 CSS，避免主应用与壁纸的样式互相污染。
//
// 产物结构与 vite build 一致（dist/*.html + dist/assets/*）。
// 用法：node scripts/build-rollup.mjs
// ============================================================
import { rollup } from "rollup";
import esbuild from "esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist");
const SRC = path.join(ROOT, "src");

const tsxLoader = { ".ts": "ts", ".tsx": "tsx", ".jsx": "jsx", ".js": "js", ".mjs": "js" };

/**
 * 解析 CSS 中的 @import（含裸模块名，如 "highlight.js/styles/github.css"）。
 * 内联展开后递归处理，并把 hljs 等第三方样式一起打进产物 CSS，
 * 避免运行期 https://localhost/assets/highlight.js/... 404。
 */
function inlineCssImports(css, fromDir, seen = new Set()) {
  return css.replace(
    /@import\s+(?:url\(\s*)?["']([^"')]+)["']\s*\)?\s*;?/g,
    (full, spec) => {
      // 保留远程 URL 与 data: 引用
      if (/^(https?:)?\/\//.test(spec) || spec.startsWith("data:")) return full;
      // 解析目标路径：相对路径按当前文件目录；裸模块名走 node_modules
      let resolved = null;
      if (spec.startsWith(".") || spec.startsWith("/")) {
        resolved = path.resolve(fromDir, spec);
      } else {
        resolved = path.join(ROOT, "node_modules", spec);
      }
      const candidates = [resolved, resolved + ".css"];
      const file = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!file) {
        console.warn("[css] 未找到 @import 目标:", spec);
        return "";
      }
      if (seen.has(file)) return ""; // 防循环
      seen.add(file);
      const inner = fs.readFileSync(file, "utf8").replace(/@charset[^;]*;/g, "");
      return inlineCssImports(inner, path.dirname(file), seen);
    },
  );
}

/** esbuild transform 插件（in-process，不 spawn）。每个 bundle 建一个新实例以隔离 CSS。 */
function esbuildTransformPlugin(cssOutFile) {
  const cssChunks = [];
  const seenImports = new Set();
  return {
    name: "esbuild-transform",
    async transform(code, id) {
      // CSS 单独收集（先内联展开 @import）
      if (id.endsWith(".css")) {
        cssChunks.push(inlineCssImports(code, path.dirname(id), seenImports));
        return { code: "", map: null };
      }
      const ext = path.extname(id);
      const loader = tsxLoader[ext];
      if (!loader) return null;
      const result = await esbuild.transform(code, {
        loader,
        jsx: "automatic",
        target: "es2020",
        sourcefile: id,
        sourcemap: false,
        tsconfigRaw: {
          compilerOptions: {
            jsx: "react-jsx",
            target: "es2020",
            experimentalDecorators: true,
          },
        },
      });
      return { code: result.code, map: null };
    },
    buildEnd() {
      // 输出收集到的 CSS
      if (cssChunks.length) {
        fs.mkdirSync(path.dirname(cssOutFile), { recursive: true });
        fs.writeFileSync(cssOutFile, cssChunks.join("\n\n"));
      }
    },
  };
}

/** 把 process.env.NODE_ENV 等 Node 全局替换为浏览器可用常量（Vite 默认会做，此处手动补） */
function defineProcessPlugin() {
  const replacements = {
    "process.env.NODE_ENV": '"production"',
    "process.env": "({})",
    "process.platform": '"browser"',
    "process.version": '""',
  };
  return {
    name: "smartday-define-process",
    transform(code, id) {
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(id)) return null;
      let out = code;
      let changed = false;
      for (const [from, to] of Object.entries(replacements)) {
        if (out.includes(from)) {
          out = out.split(from).join(to);
          changed = true;
        }
      }
      return changed ? { code: out, map: null } : null;
    },
  };
}

/** @ → src 别名插件（node_modules 由 nodeResolve 处理） */
function aliasPlugin() {
  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".css", ".json"];
  return {
    name: "smartday-alias",
    resolveId(source, importer) {
      if (source.startsWith("@/")) {
        const base = path.join(SRC, source.slice(2));
        for (const e of exts) {
          if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
          const idx = path.join(base, "index" + e);
          if (fs.existsSync(idx) && fs.statSync(idx).isFile()) return idx;
        }
      }
      if (source.startsWith(".") && importer) {
        const base = path.resolve(path.dirname(importer), source);
        for (const e of exts) {
          if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
        }
      }
      return null;
    },
  };
}

/** 兜底解析插件：@ → src，扩展名补全，node_modules 解析 */
function resolvePlugin() {
  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".css", ".json"];
  const nm = path.join(ROOT, "node_modules");

  /** 从 startDir 起逐级向上找 node_modules 下的包 */
  function resolvePackage(id, fromDir) {
    // 分离包名与子路径：react / react/jsx-runtime / @scope/pkg/sub
    const parts = id.split("/");
    const pkgName = id.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    const subPath = id.slice(pkgName.length).replace(/^\//, "");

    let dir = fromDir;
    while (true) {
      const pkgDir = path.join(dir, "node_modules", pkgName);
      if (fs.existsSync(pkgDir)) {
        // 有子路径：直接解析文件
        if (subPath) {
          const base = path.join(pkgDir, subPath);
          for (const e of exts) {
            if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
          }
          // 可能是目录（如 react/jsx-runtime → react/jsx-runtime.js 已在上面命中）
          return null;
        }
        // 包主入口：读 package.json
        const pj = path.join(pkgDir, "package.json");
        if (fs.existsSync(pj)) {
          const meta = JSON.parse(fs.readFileSync(pj, "utf8"));
          const cand = meta.module || meta.es2015 || (meta.exports && typeof meta.exports === "string" ? meta.exports : null) || meta.main || "index.js";
          const p = path.join(pkgDir, cand);
          if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
          for (const e of exts) {
            if (fs.existsSync(p + e) && fs.statSync(p + e).isFile()) return p + e;
          }
        }
        return null;
      }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  return {
    name: "smartday-resolve",
    resolveId(source, importer) {
      const fromDir = importer ? path.dirname(importer) : SRC;
      if (source.startsWith("@/")) {
        const base = path.join(SRC, source.slice(2));
        for (const e of exts) {
          if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
          const idx = path.join(base, "index" + e);
          if (fs.existsSync(idx) && fs.statSync(idx).isFile()) return idx;
        }
      }
      if (source.startsWith(".") && importer) {
        const base = path.resolve(fromDir, source);
        for (const e of exts) {
          if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
        }
      }
      // 第三方包
      if (!source.startsWith(".") && !source.startsWith("/") && !source.startsWith("node:") && !source.startsWith("@/")) {
        const r = resolvePackage(source, fromDir);
        if (r) return r;
      }
      if (source.startsWith("node:")) return { id: source, external: true };
      return null;
    },
  };
}

/**
 * 构建单个入口。
 * @param {string} name      入口名（main / wallpaper），用于 JS 文件名前缀
 * @param {string} entryTs   入口 ts/tsx 绝对路径
 * @param {string} htmlFile  生成的 html 文件名（index.html / wallpaper.html）
 * @param {string} htmlTitle <title>
 * @param {string} mountId   挂载点 id（root / wallpaper-root）
 * @param {string} cssName   CSS 文件名（不含 .css）。主应用固定用 "style"，
 *                           以兼容安卓端 assets/public/index.html 里硬编码的 /assets/style.css。
 * @param {string} [htmlStyle] 额外的内联 <style>（壁纸页需要透明背景）
 */
async function buildEntry({ name, entryTs, htmlFile, htmlTitle, mountId, cssName, htmlStyle = "", icon = true }) {
  const cssFile = path.join(OUT, `assets/${cssName}.css`);

  const bundle = await rollup({
    input: entryTs,
    plugins: [
      aliasPlugin(),
      nodeResolve({ extensions: [".ts", ".tsx", ".js", ".jsx", ".json"], preferBuiltins: false }),
      defineProcessPlugin(),
      esbuildTransformPlugin(cssFile),
      commonjs({ transformMixedEsModules: true }),
    ],
    onwarn(w, warn) {
      if (w.code === "CIRCULAR_DEPENDENCY") return;
      if (w.code === "THIS_IS_UNDEFINED") return;
      warn(w);
    },
  });

  const { output } = await bundle.write({
    format: "esm",
    dir: path.join(OUT, "assets"),
    entryFileNames: `${name}-[hash].js`,
    chunkFileNames: "[name]-[hash].js",
    assetFileNames: "[name]-[hash][extname]",
    inlineDynamicImports: false,
    // 浏览器没有 Node 的 process：注入最小 shim，避免 "process is not defined"
    intro: `var process = (typeof globalThis!=='undefined' && globalThis.process) ? globalThis.process : { env: { NODE_ENV: 'production' }, platform: 'browser', version: '' };\n`,
  });

  // 找到入口文件名
  let jsFile = "";
  for (const o of output) {
    if (o.type === "chunk" && o.isEntry) jsFile = o.fileName;
  }

  // CSS：若该入口收集到了样式，引用 assets/<cssName>.css
  let cssHref = "";
  if (fs.existsSync(cssFile)) {
    cssHref = `<link rel="stylesheet" crossorigin href="/assets/${cssName}.css" />`;
  }

  const iconTag = icon
    ? `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%234f6ef7'/%3E%3Ctext x='50' y='68' font-size='52' text-anchor='middle' fill='white' font-family='sans-serif'%3E%E2%9C%85%3C/text%3E%3C/svg%3E" />`
    : "";

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${htmlTitle}</title>
    ${iconTag}${htmlStyle}
    <script type="module" crossorigin src="/assets/${jsFile}"></script>
    ${cssHref}
  </head>
  <body>
    <div id="${mountId}"></div>
  </body>
</html>
`;
  fs.writeFileSync(path.join(OUT, htmlFile), html);

  await bundle.close();
  console.log(`  [${name}] ${htmlFile}  ←  ${jsFile}${cssHref ? "  + " + cssName + ".css" : ""}`);
  return { name, jsFile, cssHref };
}

async function main() {
  // 全量写入一个全新的输出目录，避免任何删除操作（部分环境会拦截批量删除）。
  fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });

  const entries = [
    {
      name: "main",
      entryTs: path.join(SRC, "main.tsx"),
      htmlFile: "index.html",
      htmlTitle: "SmartDay · 智能日程与任务管理",
      mountId: "root",
      // 主应用 CSS 固定输出 assets/style.css —— 安卓端 assets/public/index.html 硬编码引用此名
      cssName: "style",
    },
    {
      name: "wallpaper",
      entryTs: path.join(SRC, "wallpaper/main.tsx"),
      htmlFile: "wallpaper.html",
      htmlTitle: "SmartDay 桌面日历",
      mountId: "wallpaper-root",
      cssName: "wallpaper",
      // 壁纸页必须透明背景（Electron 透明窗口）
      htmlStyle: `<style>html,body,#wallpaper-root{height:100%;margin:0;background:transparent !important;overflow:hidden;}</style>`,
      icon: false,
    },
  ];

  console.log("[build-rollup] 构建多入口 → dist/");
  for (const e of entries) {
    await buildEntry(e);
  }
  console.log("[build-rollup] 完成");
}

main().catch((e) => {
  console.error("[build-rollup] FAILED:", e.message);
  process.exit(1);
});
