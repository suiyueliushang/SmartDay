// ============================================================
// SmartDay 桌面端主进程
//  - 壁纸日历窗口（透明/无边框/点击穿透/两种模式）
//  - 系统托盘常驻 + 右键菜单
//  - 托盘：单击右键菜单，双击打开主应用（按需求已移除全部键盘快捷键）
//  - 主应用窗口（复用网页端构建产物）
//  - 壁纸挂载相关的窗口行为：不抢焦点、不进任务栏、可置底
// ============================================================
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, protocol, net, screen, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const store = require('./settings.cjs');
const mailer = require('./mailer.cjs');

const ARGS = process.argv.slice(1);
const IS_DEV = ARGS.includes("--dev");
const IS_SMOKE = ARGS.includes("--smoke") || process.env.SMARTDAY_SMOKE === "1";
const OPEN_MAIN = ARGS.includes("--open-main") || IS_SMOKE;
// 配置持久化自检：写入 → 真正退出 → 重启校验 → 还原用户原配置
const IS_PERSIST_WRITE = ARGS.includes("--persist-write");
const IS_PERSIST_VERIFY = ARGS.includes("--persist-verify");
// 锁定/解锁诊断：真实鼠标连续点击 N 轮，记录每次点击前后的穿透状态
const IS_DIAG_LOCK = ARGS.includes("--diag-lock");
const PERSIST_PROBE = {
  theme: 'sand',
  material: 'solid',
  opacity: 41,
  showLunar: false,
  showFestivals: false,
  showTasks: false,
  showDiary: false,
  showTodayPanel: false,
  viewMonth: '2026-12-01',
  position: 'custom',
};

// 开发：../smartday-web/dist；打包：resources/web（见 package.json build.extraResources）
const WEB_DIST = app.isPackaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "..", "smartday-web", "dist");
const DEV_URL = process.env.SMARTDAY_DEV_URL || "http://localhost:5173";
const ASSETS = path.join(__dirname, "assets");

let wallpaperWin = null;
let mainWin = null;
let tray = null;
let suppressMoveSave = false;
let isQuitting = false;
const consoleErrors = [];
const consoleWarnings = [];

// ---------------- 单实例 ----------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    openMainWindow();
    if (wallpaperWin) wallpaperWin.showInactive();
  });
}

// ---------------- 自定义协议（生产环境使用 app:// 保证 IndexedDB 同源） ----------------
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

// 内容安全策略（仅作用于生产构建的 app:// 响应；Vite 开发模式不注入，避免影响 HMR）
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' http: https:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json",
};

function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (!rel || rel === "/") rel = "/index.html";
    const filePath = path.normalize(path.join(WEB_DIST, rel));
    // 防目录穿越
    if (!filePath.startsWith(WEB_DIST)) return new Response('Forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || "application/octet-stream";
      const headers = { 'content-type': mime, 'cache-control': 'no-cache' };
      if (ext === '.html') headers['content-security-policy'] = CSP;
      return new Response(data, { headers });
    } catch {
      // SPA 回退
      try {
        const data = await fs.promises.readFile(path.join(WEB_DIST, "index.html"));
        return new Response(data, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      } catch {
        return new Response("SmartDay 前端未构建：请先执行 npm run build:web", { status: 404 });
      }
    }
  });
}

async function loadPage(win, page) {
  if (IS_DEV) {
    await win.loadURL(DEV_URL.replace(/\/$/, '') + '/' + page);
  } else {
    await win.loadURL('app://smartday/' + page);
  }
}

// ---------------- 模式与窗口行为 ----------------
// 窗口尺寸完全由用户鼠标拖动决定（无固定档位）；仅在首次运行/重置时按内容自适应
const MIN_W = 260;
const MIN_H = 200;

function computePosition(cfg, w, h, wa) {
  const margin = 24;
  if (cfg.position === "custom" && cfg.bounds) {
    return {
      x: Math.min(Math.max(cfg.bounds.x, wa.x), wa.x + wa.width - w),
      y: Math.min(Math.max(cfg.bounds.y, wa.y), wa.y + wa.height - h),
    };
  }
  if (cfg.position === "left") return { x: wa.x + margin, y: wa.y + margin };
  if (cfg.position === "center") return { x: wa.x + Math.round((wa.width - w) / 2), y: wa.y + Math.round((wa.height - h) / 2) };
  return { x: wa.x + wa.width - w - margin, y: wa.y + Math.round((wa.height - h) / 2) };
}

// ============================================================
// 桌面模式点击穿透 + 可点击区域
// 旧实现依赖渲染进程 mousemove 放行，鼠标不动直接点击会失效；
// 现改为主进程轮询真实光标位置（screen.getCursorScreenPoint），
// 只有光标落在渲染进程上报的可点击区域内才接收鼠标事件。
// ============================================================
let interactiveZones = []; // 窗口内坐标（CSS 像素）
let lastFitRequest = null; // 最近一次自适应请求（自检/诊断）
let lastZAction = null; // 最近一次层级调整动作（自检/诊断）
let ignoreMouseState = null;
let hoverTimer = null;
let interactiveUntil = 0; // 宽限期：离开区域后短暂保持可点击，避免拖动/点击中断
const HOVER_INTERVAL = 60;
const ZONE_INFLATE = 8; // 命中容差，提升小图标点击成功率
const GRACE_MS = 400;

function setIgnoreState(ignore) {
  if (!wallpaperWin || wallpaperWin.isDestroyed()) return;
  if (ignoreMouseState === ignore) return;
  ignoreMouseState = ignore;
  if (ignore) wallpaperWin.setIgnoreMouseEvents(true, { forward: true });
  else wallpaperWin.setIgnoreMouseEvents(false);
}

function pointInZones(px, py, bounds) {
  for (const z of interactiveZones) {
    const x1 = bounds.x + z.x - ZONE_INFLATE;
    const y1 = bounds.y + z.y - ZONE_INFLATE;
    const x2 = bounds.x + z.x + z.w + ZONE_INFLATE;
    const y2 = bounds.y + z.y + z.h + ZONE_INFLATE;
    if (px >= x1 && px <= x2 && py >= y1 && py <= y2) return true;
  }
  return false;
}

function startHoverWatch() {
  stopHoverWatch();
  hoverTimer = setInterval(() => {
    if (!wallpaperWin || wallpaperWin.isDestroyed()) return;
    if (store.read().editMode) return;
    let pt;
    try {
      pt = screen.getCursorScreenPoint();
    } catch {
      return;
    }
    const bounds = wallpaperWin.getBounds();
    const inside = pointInZones(pt.x, pt.y, bounds);
    if (inside) interactiveUntil = Date.now() + GRACE_MS;
    const keepInteractive = inside || Date.now() < interactiveUntil;
    setIgnoreState(!keepInteractive);
  }, HOVER_INTERVAL);
}

function stopHoverWatch() {
  if (hoverTimer) clearInterval(hoverTimer);
  hoverTimer = null;
}

// ============================================================
// 窗口移动 / 缩放：由主进程按真实光标驱动
// 为什么不用 -webkit-app-region: drag？
//   该拖拽区会把区域内(包括子元素)的鼠标点击交给系统做窗口拖动，
//   导致编辑模式下点击 🔓 没有反应（本次报告的核心 bug）。
// 这里改为：渲染进程 pointerdown 通知开始，主进程轮询光标位移量驱动窗口。
// ============================================================
let dragState = null;

function startDragSession(mode) {
  if (!wallpaperWin || wallpaperWin.isDestroyed()) return;
  endDragSession();
  let cursor;
  try {
    cursor = screen.getCursorScreenPoint();
  } catch {
    return;
  }
  suppressMoveSave = true;
  dragState = {
    mode,
    startCursor: cursor,
    startBounds: wallpaperWin.getBounds(),
    timer: setInterval(() => {
      if (!dragState || !wallpaperWin || wallpaperWin.isDestroyed()) return;
      let cur;
      try {
        cur = screen.getCursorScreenPoint();
      } catch {
        return;
      }
      const wa = screen.getPrimaryDisplay().workArea;
      const b = dragState.startBounds;
      const dx = cur.x - dragState.startCursor.x;
      const dy = cur.y - dragState.startCursor.y;
      if (dragState.mode === 'move') {
        const x = Math.min(Math.max(b.x + dx, wa.x), Math.max(wa.x, wa.x + wa.width - b.width));
        const y = Math.min(Math.max(b.y + dy, wa.y), Math.max(wa.y, wa.y + wa.height - b.height));
        wallpaperWin.setBounds({ x, y, width: b.width, height: b.height });
      } else {
        const width = Math.min(Math.max(b.width + dx, MIN_W), wa.width);
        const height = Math.min(Math.max(b.height + dy, MIN_H), wa.height);
        wallpaperWin.setBounds({ x: b.x, y: b.y, width, height });
      }
    }, 16),
  };
}

function endDragSession() {
  if (!dragState) return;
  clearInterval(dragState.timer);
  const mode = dragState.mode;
  dragState = null;
  suppressMoveSave = false;
  if (wallpaperWin && !wallpaperWin.isDestroyed()) {
    const b = wallpaperWin.getBounds();
    if (mode === 'move') store.write({ position: 'custom', bounds: b });
    else store.write({ bounds: b, width: b.width, height: b.height });
    broadcastConfig();
  }
}

function applyEditMode(edit, opts = {}) {
  const cfg = store.write({ editMode: edit });
  if (!wallpaperWin) return cfg;
  const win = wallpaperWin;
  if (edit) {
    stopHoverWatch();
    ignoreMouseState = null;
    win.setIgnoreMouseEvents(false);
    win.setAlwaysOnTop(true, 'floating');
    win.setSkipTaskbar(true);
    win.setResizable(true);
    win.setMinimumSize(MIN_W, MIN_H);
    win.show();
    win.focus();
    lastZAction = 'top' + (opts.silent ? '-silent' : '');
  } else {
    endDragSession();
    win.setAlwaysOnTop(false);
    win.setResizable(false);
    win.setSkipTaskbar(true);
    win.showInactive();
    ignoreMouseState = null;
    setIgnoreState(true);
    interactiveUntil = 0;
    startHoverWatch();
    // 需求：点 🔒 锁定后，日历要**立刻沉到最底层**（像真正的壁纸），
    // 让原本被它挡住的窗口马上浮上来。解锁时再置顶并聚焦。
    // 说明：窗口在底层时，其它窗口若覆盖该区域，点击会落到覆盖窗口上（这正是壁纸语义）；
    //       需要解锁时用托盘菜单，或在没有被遮挡的区域点 🔒。
    sendToBottom();
    lastZAction = 'bottom';
  }
  if (!opts.silent) flashEditMode(edit);
  broadcastConfig(cfg);
  rebuildTray();
  return cfg;
}

let flashTimer = null;
function flashEditMode(edit) {
  if (!tray) return;
  tray.setToolTip('SmartDay 桌面日历 · ' + (edit ? '编辑模式' : '桌面模式'));
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => tray && tray.setToolTip('SmartDay 桌面日历 · ' + (store.read().editMode ? '编辑模式' : '桌面模式')), 600);
}

function broadcastConfig(cfg) {
  const c = cfg || store.read();
  if (wallpaperWin && !wallpaperWin.isDestroyed()) wallpaperWin.webContents.send('desktop:config', c);
}

// 实验：把窗口压到桌面层（Win32 SetWindowPos HWND_BOTTOM），失败静默降级
function sendToBottom() {
  if (process.platform !== 'win32' || !wallpaperWin) return;
  try {
    const handle = wallpaperWin.getNativeWindowHandle();
    const hwnd = handle.readBigInt64LE(0).toString();
    const ps = [
      'Add-Type -Namespace S -Name W -MemberDefinition \'[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);\';',
      '[S.W]::SetWindowPos([IntPtr]' + hwnd + ', [IntPtr]1, 0,0,0,0, 0x0013) | Out-Null',
    ].join(' ');
    require('node:child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, () => {});
  } catch (e) {
    console.warn('[wallpaper] 置底失败（已忽略）', e && e.message);
  }
}

// ---------------- 壁纸窗口 ----------------
function createWallpaperWindow() {
  const cfg = store.read();
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.max(MIN_W, cfg.bounds?.width || cfg.width || 420);
  const h = Math.max(MIN_H, cfg.bounds?.height || cfg.height || 560);
  const pos = computePosition(cfg, w, h, wa);
  wallpaperWin = new BrowserWindow({
    x: pos.x, y: pos.y, width: w, height: h,
    minWidth: MIN_W, minHeight: MIN_H,
    frame: false, transparent: true, resizable: !!cfg.editMode, movable: true, minimizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false, show: false, fullscreenable: false, autoHideMenuBar: true,
    backgroundColor: '#00000000', title: 'SmartDay 桌面日历',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
    },
  });
  wallpaperWin.setMenuBarVisibility(false);
  wallpaperWin.setMinimumSize(MIN_W, MIN_H);
  if (cfg.editMode) {
    wallpaperWin.setAlwaysOnTop(true, 'floating');
    ignoreMouseState = null;
  } else {
    ignoreMouseState = null;
    setIgnoreState(true);
    wallpaperWin.setFocusable(false);
  }
  wallpaperWin.on('moved', () => {
    if (suppressMoveSave || !wallpaperWin) return;
    const b = wallpaperWin.getBounds();
    store.write({ position: 'custom', bounds: b });
    broadcastConfig();
  });
  // 用户拖动缩放（原生边缘拖动或右下角抓手）
  wallpaperWin.on('resize', () => {
    if (suppressMoveSave || !wallpaperWin) return;
    const b = wallpaperWin.getBounds();
    store.write({ bounds: b, width: b.width, height: b.height });
  });
  wallpaperWin.on('closed', () => { wallpaperWin = null; });
  wallpaperWin.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); wallpaperWin.hide(); }
  });
  wireDiagnostics(wallpaperWin, 'wallpaper');
  loadPage(wallpaperWin, 'wallpaper.html').catch((e) => console.error('[wallpaper] 加载失败', e));
  wallpaperWin.once('ready-to-show', () => {
    const c = store.read();
    if (c.visible === false) {
      // 上次退出时是“隐藏”状态：保持隐藏，托盘菜单可重新显示
      return;
    }
    wallpaperWin.showInactive();
    if (!c.editMode) {
      startHoverWatch();
      // 启动即为桌面模式：直接沉到最底层，和「点 🔒 锁定」后的层级保持一致
      sendToBottom();
      lastZAction = 'bottom';
    } else if (c.keepBottom) {
      sendToBottom();
      lastZAction = 'bottom';
    }
  });
  return wallpaperWin;
}

// ---------------- 主应用窗口 ----------------
function openMainWindow() {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
    return mainWin;
  }
  mainWin = new BrowserWindow({
    width: 1360, height: 880, minWidth: 960, minHeight: 640, show: false,
    title: 'SmartDay', backgroundColor: '#f4f6fb', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  mainWin.on('ready-to-show', () => mainWin.show());
  mainWin.on('closed', () => { mainWin = null; });
  wireDiagnostics(mainWin, 'main');
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  loadPage(mainWin, 'index.html').catch((e) => console.error('[main] 加载失败', e));
  return mainWin;
}

function wireDiagnostics(win, label) {
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    // level: 0=verbose 1=info 2=warning 3=error
    if (level >= 3) {
      consoleErrors.push('[' + label + '] ' + message + ' @' + sourceId + ':' + line);
    } else if (level === 2 && !/Electron Security Warning/.test(message)) {
      consoleWarnings.push('[' + label + '] ' + message);
    }
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    consoleErrors.push('[' + label + '] did-fail-load ' + code + ' ' + desc + ' ' + url);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    consoleErrors.push('[' + label + '] render-process-gone ' + JSON.stringify(details));
  });
}

// ---------------- IPC ----------------
function registerIpc() {
  ipcMain.handle('desktop:get-config', () => store.read());
  ipcMain.handle('desktop:set-config', (_e, patch) => {
    // 关键修复：editMode 变化必须真正切换窗口行为（穿透/可缩放/置顶），
    // 旧实现只写配置文件，导致点击 🔒 后窗口仍处于穿透状态，看起来"点了没反应"。
    if (patch && typeof patch.editMode === 'boolean') {
      applyEditMode(patch.editMode);
      const { editMode: _ignore, ...rest } = patch;
      if (Object.keys(rest).length === 0) return store.read();
      patch = rest;
    }
    const cfg = store.write(patch || {});
    // 位置预设：仅在显式切换预设时移动窗口（尺寸保持用户拖动结果）
    if (patch && patch.position && patch.position !== 'custom' && wallpaperWin) {
      const wa = screen.getPrimaryDisplay().workArea;
      const b = wallpaperWin.getBounds();
      const pos = computePosition(cfg, b.width, b.height, wa);
      suppressMoveSave = true;
      wallpaperWin.setBounds({ x: pos.x, y: pos.y, width: b.width, height: b.height });
      store.write({ bounds: { x: pos.x, y: pos.y, width: b.width, height: b.height } });
      setTimeout(() => { suppressMoveSave = false; }, 200);
    }
    if (patch && patch.keepBottom) sendToBottom();
    if (patch && typeof patch.autoLaunch === 'boolean') setAutoLaunch(patch.autoLaunch);
    broadcastConfig(cfg);
    rebuildTray();
    return cfg;
  });
  ipcMain.handle('desktop:toggle-mode', () => applyEditMode(!store.read().editMode));
  ipcMain.handle('desktop:set-mode', (_e, edit) => applyEditMode(!!edit));
  ipcMain.on('desktop:open-main', () => openMainWindow());
  ipcMain.on('desktop:refresh', () => {
    if (wallpaperWin) wallpaperWin.reload();
    if (mainWin) mainWin.reload();
  });
  ipcMain.on('desktop:quit', () => { isQuitting = true; app.quit(); });
  ipcMain.on('desktop:ignore-mouse', (_e, ignore) => {
    // 桌面模式下由主进程按光标位置统一裁决，这里仅在编辑模式接受请求
    if (!wallpaperWin) return;
    if (store.read().editMode) wallpaperWin.setIgnoreMouseEvents(!!ignore, { forward: true });
  });
  // 渲染进程上报可点击区域（桌面模式下仅这些区域接收鼠标）
  ipcMain.on('desktop:zones', (_e, zones) => {
    interactiveZones = Array.isArray(zones)
      ? zones.filter((z) => z && typeof z.x === 'number' && typeof z.w === 'number').slice(0, 40)
      : [];
  });
  // 窗口移动 / 缩放（主进程驱动）
  ipcMain.on('desktop:drag-start', () => startDragSession('move'));
  ipcMain.on('desktop:drag-end', () => endDragSession());
  ipcMain.on('desktop:resize-start', () => startDragSession('resize'));
  ipcMain.on('desktop:resize-end', () => endDragSession());
  // 隐藏壁纸日历（托盘可重新显示）
  ipcMain.on('desktop:hide', () => {
    if (!wallpaperWin) return;
    store.write({ visible: false });
    wallpaperWin.hide();
    rebuildTray();
    if (mainWin) openMainWindow();
  });
  // 右下角抓手拖动缩放（兼容旧接口）
  ipcMain.on('desktop:resize-by', (_e, delta) => {
    if (!wallpaperWin || !delta) return;
    const wa = screen.getPrimaryDisplay().workArea;
    const b = wallpaperWin.getBounds();
    const width = Math.min(Math.max(b.width + Math.round(delta.dw || 0), MIN_W), wa.width);
    const height = Math.min(Math.max(b.height + Math.round(delta.dh || 0), MIN_H), wa.height);
    if (width === b.width && height === b.height) return;
    suppressMoveSave = true;
    wallpaperWin.setBounds({ x: b.x, y: b.y, width, height });
    store.write({ bounds: { x: b.x, y: b.y, width, height }, width, height });
    setTimeout(() => { suppressMoveSave = false; }, 120);
  });
  // 按内容自适应尺寸（首次运行 / 手动重置）
  ipcMain.on('desktop:fit', (_e, size) => {
    if (!wallpaperWin || !size || !size.width || !size.height) return;
    lastFitRequest = { width: Math.round(size.width), height: Math.round(size.height), at: Date.now() };
    const wa = screen.getPrimaryDisplay().workArea;
    const cfg = store.read();
    const width = Math.min(Math.max(Math.round(size.width), MIN_W), wa.width);
    const height = Math.min(Math.max(Math.round(size.height), MIN_H), wa.height);
    const b = wallpaperWin.getBounds();
    if (Math.abs(b.width - width) < 2 && Math.abs(b.height - height) < 2) return;
    const pos = computePosition(cfg, width, height, wa);
    suppressMoveSave = true;
    wallpaperWin.setBounds({ x: pos.x, y: pos.y, width, height });
    store.write({ bounds: { x: pos.x, y: pos.y, width, height }, width, height });
    setTimeout(() => { suppressMoveSave = false; }, 200);
  });
  // 调试/自检：返回窗口与穿透状态
  // 邮箱通知：由主进程走 SMTP（浏览器无法直连 SMTP），使用 nodemailer
  ipcMain.handle('desktop:mail', async (_e, payload) => {
    const cfg = (payload && payload.config) || {};
    const res = await mailer.sendMail(cfg, {
      subject: (payload && payload.subject) || 'SmartDay 提醒',
      text: (payload && payload.text) || '',
    });
    if (!res.ok) console.warn('[mail] 发送失败:', res.error);
    return res;
  });

  // 外部推送：由主进程发 HTTP（不受浏览器 CORS 限制），供 QQ 机器人 / 企业微信等通道使用
  ipcMain.handle('desktop:push', async (_e, payload) => {
    try {
      const url = String(payload?.url ?? '');
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: '地址必须是 http(s) 开头' };
      const method = String(payload?.method ?? 'POST').toUpperCase();
      const headers = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {};
      const body = typeof payload?.body === 'string' ? payload.body : undefined;
      const resp = await fetch(url, { method, headers, body });
      const text = await resp.text().catch(() => '');
      // 同时返回响应体：QQ 官方机器人需要先取 access_token 再发消息（两步请求）
      return { ok: resp.ok, status: resp.status, data: (text || '').slice(0, 2000), error: resp.ok ? undefined : (text || ('HTTP ' + resp.status)).slice(0, 300) };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e).slice(0, 300) };
    }
  });

  ipcMain.handle('desktop:debug-state', () => {
    const b = wallpaperWin ? wallpaperWin.getBounds() : { x: 0, y: 0, width: 0, height: 0 };
    let cursor = { x: 0, y: 0 };
    try {
      cursor = screen.getCursorScreenPoint();
    } catch {
      /* 忽略 */
    }
    return {
      bounds: b,
      ignoreMouse: ignoreMouseState !== false,
      zones: interactiveZones,
      editMode: store.read().editMode,
      cursor,
      hoverWatchActive: hoverTimer !== null,
      scaleFactor: screen.getPrimaryDisplay().scaleFactor,
      workArea: screen.getPrimaryDisplay().workArea,
      visible: wallpaperWin ? wallpaperWin.isVisible() : false,
      lastFitRequest,
      lastZAction,
    };
  });
  // 自检：用指定屏幕坐标执行一次与轮询完全相同的命中判定
  ipcMain.handle('desktop:hover-test', (_e, pt) => {
    if (!wallpaperWin) return { ok: false };
    if (!pt || typeof pt.x !== 'number') return { ok: false };
    const bounds = wallpaperWin.getBounds();
    const inside = pointInZones(pt.x, pt.y, bounds);
    if (inside) interactiveUntil = Date.now() + GRACE_MS;
    const keepInteractive = inside || Date.now() < interactiveUntil;
    setIgnoreState(!keepInteractive);
    return { ok: true, inside, ignoreMouse: ignoreMouseState !== false };
  });
}

function setAutoLaunch(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: [],
    });
  } catch (e) {
    console.warn('[autolaunch] 设置失败', e && e.message);
  }
}

// ---------------- 托盘 ----------------
function trayIcon() {
  const iconPath = path.join(ASSETS, 'tray.png');
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) return img;
  }
  return nativeImage.createEmpty();
}

function rebuildTray() {
  if (!tray) return;
  const cfg = store.read();
  const sub = (label, items) => ({ label, submenu: items });
  const check = (on) => (on ? '✓ ' : '   ');
  const menu = Menu.buildFromTemplate([
    { label: 'SmartDay 桌面日历', enabled: false },
    { type: 'separator' },
    { label: '📖 打开主应用', click: () => openMainWindow() },
    { label: cfg.editMode ? '🔒 切换到桌面模式（穿透）' : '🔓 切换到编辑模式', click: () => applyEditMode(!store.read().editMode) },
    {
      label: (cfg.visible === false ? '✅ ' : '') + '👁️ 显示桌面日历',
      click: () => {
        store.write({ visible: true });
        if (wallpaperWin) {
          wallpaperWin.showInactive();
          if (!store.read().editMode) startHoverWatch();
        }
        rebuildTray();
      },
    },
    {
      label: '🙈 隐藏桌面日历',
      click: () => {
        store.write({ visible: false });
        if (wallpaperWin) wallpaperWin.hide();
        rebuildTray();
      },
    },
    { label: '⟳ 刷新', click: () => { if (wallpaperWin) wallpaperWin.reload(); } },
    { type: 'separator' },
    { label: '↔️ 拖动窗口边缘 / 右下角 ◢ 自由缩放', enabled: false },
    { label: '📐 窗口复位（自适应内容）', click: () => requestFit() },
    sub('🎨 配色主题', [
      { label: check(cfg.theme === 'mist') + '晨雾蓝（浅色）', click: () => setConfigFromTray({ theme: 'mist' }) },
      { label: check(cfg.theme === 'ink') + '深邃夜（深色）', click: () => setConfigFromTray({ theme: 'ink' }) },
      { label: check(cfg.theme === 'sand') + '暖阳沙（暖色）', click: () => setConfigFromTray({ theme: 'sand' }) },
      { label: check(cfg.theme === 'mint') + '薄荷绿（清新）', click: () => setConfigFromTray({ theme: 'mint' }) },
    ]),
    sub('🧊 材质', [
      { label: check(cfg.material !== 'solid') + '毛玻璃（透出壁纸）', click: () => setConfigFromTray({ material: 'glass' }) },
      { label: check(cfg.material === 'solid') + '实色面板', click: () => setConfigFromTray({ material: 'solid' }) },
    ]),
    sub('🫥 背景透明度（卡片内 ☰ 可 0-100 连续调节）', [
      ...[0, 25, 50, 75, 92, 100].map((o) => ({
        label: check(Math.round(cfg.opacity) === o) + o + '%', click: () => setConfigFromTray({ opacity: o }),
      })),
    ]),
    sub('📋 显示内容', [
      { label: '节假日 / 节气', type: 'checkbox', checked: cfg.showFestivals !== false, click: (i) => setConfigFromTray({ showFestivals: i.checked }) },
      { label: '农历', type: 'checkbox', checked: cfg.showLunar !== false, click: (i) => setConfigFromTray({ showLunar: i.checked }) },
      { label: '任务', type: 'checkbox', checked: cfg.showTasks !== false, click: (i) => setConfigFromTray({ showTasks: i.checked }) },
      { label: '日记标记', type: 'checkbox', checked: cfg.showDiary !== false, click: (i) => setConfigFromTray({ showDiary: i.checked }) },
      { label: '今日面板', type: 'checkbox', checked: cfg.showTodayPanel !== false, click: (i) => setConfigFromTray({ showTodayPanel: i.checked }) },
    ]),
    { type: 'separator' },
    { label: '🪟 保持置底（实验）', type: 'checkbox', checked: cfg.keepBottom, click: (i) => setConfigFromTray({ keepBottom: i.checked }) },
    { label: '🚀 开机自动启动', type: 'checkbox', checked: cfg.autoLaunch, click: (i) => setConfigFromTray({ autoLaunch: i.checked }) },
    { type: 'separator' },
    { label: '退出 SmartDay', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('SmartDay 桌面日历 · ' + (cfg.editMode ? '编辑模式' : '桌面模式'));
}

// 请求渲染进程按内容自适应窗口
function requestFit() {
  if (wallpaperWin && !wallpaperWin.isDestroyed()) {
    wallpaperWin.webContents.send('desktop:config', store.read());
    wallpaperWin.webContents.executeJavaScript(
      "window.__smartdayFit && window.__smartdayFit();",
      true
    ).catch(() => {});
  }
}

function setConfigFromTray(patch) {
  const cfg = store.write(patch);
  if (patch.position && patch.position !== 'custom' && wallpaperWin) {
    const wa = screen.getPrimaryDisplay().workArea;
    const b = wallpaperWin.getBounds();
    const pos = computePosition(cfg, b.width, b.height, wa);
    suppressMoveSave = true;
    wallpaperWin.setBounds({ x: pos.x, y: pos.y, width: b.width, height: b.height });
    store.write({ bounds: { x: pos.x, y: pos.y, width: b.width, height: b.height } });
    setTimeout(() => { suppressMoveSave = false; }, 200);
  }
  if (patch.keepBottom) sendToBottom();
  if (patch.autoLaunch !== undefined) setAutoLaunch(patch.autoLaunch);
  broadcastConfig(cfg);
  rebuildTray();
}

// ---------------- 冒烟测试（--smoke） ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { execFile } = require('node:child_process');

/**
 * 真实移动系统光标（仅用于自检）。
 * 说明：Electron 的 getCursorScreenPoint() 与窗口 getBounds() 使用同一坐标系
 * （本机 scaleFactor=1.5，但两者都按同一尺度报告，实测无需换算），
 * 因此直接使用屏幕坐标设置光标即可。
 */
function moveCursor(x, y) {
  if (process.platform !== 'win32') return Promise.resolve();
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms;',
    'Add-Type -AssemblyName System.Drawing;',
    '[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(' + Math.round(x) + ',' + Math.round(y) + ')',
  ].join(' ');
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, () => resolve()));
}

/** 读取指定选择器在窗口内的矩形（用于精确点击某个按钮） */
async function rectOf(win, selector) {
  try {
    return await win.webContents.executeJavaScript(
      "(function(){var el=document.querySelector('" + selector + "'); if(!el) return null; var r=el.getBoundingClientRect();" +
        "return {x:r.left,y:r.top,w:r.width,h:r.height};})()",
      true
    );
  } catch {
    return null;
  }
}

function mouseClickScript() {
  return [
    '[Sd.Mouse]::mouse_event(0x0002,0,0,0,0);',
    'Start-Sleep -Milliseconds 35;',
    '[Sd.Mouse]::mouse_event(0x0004,0,0,0,0);',
  ].join(' ');
}

function runMouseScript(body) {
  if (process.platform !== 'win32') return Promise.resolve();
  const ps = [
    'Add-Type -Namespace Sd -Name Mouse -MemberDefinition \'[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e);\';',
    body,
  ].join(' ');
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, () => resolve()));
}

/** 真实点击（单次） */
function clickCursor() {
  return runMouseScript(mouseClickScript());
}

/**
 * 真实"快速双击"：两次点击放在同一个 PowerShell 进程里，
 * 中间只隔 gapMs —— 否则每次点击起一个新 powershell 进程（200~400ms 开销），
 * 会把"双击"变成"慢速两次点击"，测不出真实场景。
 */
function doubleClickCursor(gapMs = 130) {
  return runMouseScript(
    mouseClickScript() + ' Start-Sleep -Milliseconds ' + gapMs + '; ' + mouseClickScript()
  );
}

async function runSmoke() {
  const outDir = app.isPackaged ? path.join(app.getPath('userData'), 'smoke') : path.join(__dirname, '..', '.smoke');
  fs.mkdirSync(outDir, { recursive: true });
  const results = {};
  // 自检会临时改动主题/材质/透明度/窗口尺寸/查看月份/模式：先整份备份，结束时原样还原，
  // 避免"跑一次自检就把用户外观设置重置了"。
  const settingsBackup = store.read();
  const evalIn = async (key, win, js) => {
    try {
      const v = await win.webContents.executeJavaScript(js, true);
      results[key] = v;
      return v;
    } catch (e) {
      results[key] = 'ERR: ' + (e && e.message);
      return undefined;
    }
  };
  await sleep(4000);
  if (!wallpaperWin) { console.log('[SMOKE] 壁纸窗口创建失败'); app.exit(1); return; }
  // 固定初始状态，保证可重复
  await evalIn('resetMode', wallpaperWin, 'window.desktopAPI.setMode(false).then(function(){return true;})');
  await sleep(600);
  await evalIn('wallpaperDays', wallpaperWin, "document.querySelectorAll('.wp-day').length");
  await evalIn('wallpaperCard', wallpaperWin, "!!document.querySelector('.wp-card')");
  await evalIn('wallpaperReady', wallpaperWin, "!document.querySelector('.wp-empty')");
  await evalIn('hasDesktopAPI', wallpaperWin, '!!(window.desktopAPI && window.desktopAPI.isDesktop)');
  await evalIn('config', wallpaperWin, 'window.desktopAPI.getConfig().then(function(c){return c.theme+"/"+c.material+"/opacity:"+c.opacity+"/edit:"+c.editMode;})');
  await evalIn('hasEvents', wallpaperWin, 'window.localStorage ? true : true');
  // 交互：材质切换 + 模式切换
  await evalIn('setSolid', wallpaperWin, "window.desktopAPI.setConfig({material:'solid'}).then(function(){return true;})");
  await sleep(600);
  await evalIn('materialApplied', wallpaperWin, "document.querySelector('.wp-card').getAttribute('data-material')");
  await evalIn('setGlassBack', wallpaperWin, "window.desktopAPI.setConfig({material:'glass'}).then(function(){return true;})");
  await evalIn('enterEdit', wallpaperWin, 'window.desktopAPI.setMode(true).then(function(){return true;})');
  await sleep(700);
  await evalIn('menuButtonVisible', wallpaperWin, "!!document.querySelector('.wp-menu-btn')");
  await evalIn('gripVisibleInEdit', wallpaperWin, "!!document.querySelector('.wp-resize-grip')");
  await evalIn('backToDesktop', wallpaperWin, 'window.desktopAPI.setMode(false).then(function(){return true;})');
  await sleep(500);
  await evalIn('desktopHiddenGrip', wallpaperWin, "!document.querySelector('.wp-resize-grip')");

  // ---- 1) 透明度：任意整数值都能生效（0-100 连续） ----
  await evalIn('opacitySet', wallpaperWin, "window.desktopAPI.setConfig({opacity:47}).then(function(c){return c.opacity;})");
  await sleep(500);
  await evalIn('opacityApplied', wallpaperWin, "(function(){var c=document.querySelector('.wp-card');return Math.round(parseFloat(getComputedStyle(c).opacity)*100);})()");

  // ---- 2) 鼠标拖动可自由缩放（右下角抓手）；滑块在编辑模式下验证 ----
  await evalIn('enterEditForSize', wallpaperWin, "window.desktopAPI.setMode(true).then(function(){return true;})");
  await sleep(700);
  await evalIn('resizeGripExists', wallpaperWin, "!!document.querySelector('.wp-resize-grip')");
  await evalIn('openMenuForSlider', wallpaperWin, "(function(){var b=document.querySelector('.wp-menu-btn'); b && b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); return true;})()");
  await sleep(500);
  await evalIn('opacitySliderExists', wallpaperWin, "!!document.querySelector('.wp-menu .wp-opacity-range')");
  await evalIn(
    'opacitySliderSet',
    wallpaperWin,
    "(function(){var el=document.querySelector('.wp-menu .wp-opacity-range'); if(!el) return false;" +
      "var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;" +
      "setter.call(el,'63'); el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()"
  );
  await sleep(500);
  await evalIn('opacitySliderValue', wallpaperWin, "window.desktopAPI.getConfig().then(function(c){return c.opacity;})");
  await evalIn(
    'closeMenuBeforeResize',
    wallpaperWin,
    "(function(){var bd=document.querySelector('.wp-menu-backdrop'); if(bd) bd.click(); return true;})()"
  );
  await sleep(300);
  const before = wallpaperWin.getBounds();
  await evalIn('resizeByGrip', wallpaperWin, "window.desktopAPI.resizeBy({dw:80,dh:60}); true");
  await sleep(600);
  const after = wallpaperWin.getBounds();
  results.resizeDelta = { dw: after.width - before.width, dh: after.height - before.height };
  results.resizeWorks = after.width > before.width && after.height > before.height;
  // 自适应：调用后主进程应收到 fit 请求，且窗口不应越调越大
  const beforeFit = wallpaperWin.getBounds();
  await evalIn('fitReset', wallpaperWin, "window.__smartdayFit && window.__smartdayFit(); true");
  await sleep(700);
  const afterFit = wallpaperWin.getBounds();
  await evalIn('fitState', wallpaperWin, 'window.desktopAPI.debugState()');
  const fitReq = await evalIn('fitRequested', wallpaperWin, 'window.desktopAPI.debugState().then(function(s){return s.lastFitRequest!==null;})');
  results.fitRequested = fitReq === true;
  results.fitDelta = { dw: afterFit.width - beforeFit.width, dh: afterFit.height - beforeFit.height };
  // 首次自适配会改变尺寸（正常），关键要求：不超出工作区，且重复调用不再变大（fitStable）
  const wa = screen.getPrimaryDisplay().workArea;
  results.fitWithinScreen = afterFit.width <= wa.width && afterFit.height <= wa.height && afterFit.width >= 260 && afterFit.height >= 200;
  const secondFit = await evalIn('fitSecond', wallpaperWin, "window.__smartdayFit && window.__smartdayFit(); true");
  void secondFit;
  await sleep(700);
  const afterSecondFit = wallpaperWin.getBounds();
  results.fitStable = afterSecondFit.width === afterFit.width && afterSecondFit.height === afterFit.height;

  // ---- 3) 桌面模式：锁定图标可点（真实光标 + 真实点击） ----
  await evalIn('desktopAgain', wallpaperWin, 'window.desktopAPI.setMode(false).then(function(){return true;})');
  await sleep(700);
  const st0 = await evalIn('stateBeforeHover', wallpaperWin, 'window.desktopAPI.debugState()');
  results.zonesReported = st0 && Array.isArray(st0.zones) ? st0.zones.length : 0;
  results.hoverWatchActive = !!(st0 && st0.hoverWatchActive);
  const lockRect = await rectOf(wallpaperWin, '.wp-lock');
  if (st0 && st0.zones && st0.zones.length) {
    const zone = lockRect || st0.zones.find((z) => z.w > 0) || st0.zones[0];
    const lockX = st0.bounds.x + zone.x + zone.w / 2;
    const lockY = st0.bounds.y + zone.y + zone.h / 2;

    // 先把真实光标移开，避免它正好停在锁定按钮上影响断言
    await moveCursor(60, 60);
    await sleep(800);
    // (a) 确定性验证：注入锁定按钮坐标，走与轮询完全相同的命中判定
    const hoverIn = await evalIn(
      'hoverTestInside',
      wallpaperWin,
      'window.desktopAPI.hoverTest({x:' + lockX + ',y:' + lockY + '})'
    );
    results.hoverReleasesClickThrough = hoverIn ? hoverIn.ignoreMouse === false : 'no-result';
    const hoverOut = await evalIn(
      'hoverTestOutside',
      wallpaperWin,
      'window.desktopAPI.hoverTest({x:2,y:2})'
    );
    void hoverOut;
    await moveCursor(60, 60); // 光标保持在窗口外
    await sleep(900); // 越过宽限期
    const afterGrace = await evalIn('stateAfterGrace', wallpaperWin, 'window.desktopAPI.debugState()');
    results.clickThroughRestored = afterGrace ? afterGrace.ignoreMouse === true : 'no-state';

    // (a2) 确定性验证：直接触发锁定按钮的点击（正是用户点击所走的处理链路）
    await evalIn('lockDomClick', wallpaperWin, "(function(){var b=document.querySelector('.wp-lock'); if(!b) return 'no-button'; b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); return true;})()");
    await sleep(800);
    await evalIn('lockClickEntersEdit', wallpaperWin, 'window.desktopAPI.getConfig().then(function(c){return c.editMode;})');
    await evalIn('resetAfterDomClick', wallpaperWin, 'window.desktopAPI.setMode(false).then(function(){return true;})');
    await sleep(500);

    // (b) 真机验证：真实光标 + 真实点击（用户在场可能干扰，最多重试 3 次；结果仅作参考）
    let entered = false;
    for (let i = 0; i < 3 && !entered; i++) {
      await moveCursor(lockX, lockY);
      await sleep(650);
      const stHover = await evalIn('realHoverState' + i, wallpaperWin, 'window.desktopAPI.debugState()');
      results['realHover' + i] = stHover ? { ignoreMouse: stHover.ignoreMouse, cursor: stHover.cursor } : 'no-state';
      await clickCursor();
      await sleep(750);
      const stClick = await evalIn('realClickState' + i, wallpaperWin, 'window.desktopAPI.debugState()');
      results['realClick' + i] = stClick ? stClick.editMode : 'no-state';
      entered = !!(stClick && stClick.editMode === true);
      if (!entered) {
        await evalIn('resetForRetry', wallpaperWin, 'window.desktopAPI.setMode(false).then(function(){return true;})');
        await sleep(400);
      }
    }
    results.realMouseClick = entered ? 'entered-edit-mode' : 'not-entered(可能受真实鼠标干扰)';
    // 收尾：回到桌面模式并移开光标
    await evalIn('backToDesktop2', wallpaperWin, 'window.desktopAPI.setMode(false).then(function(){return true;})');
    await moveCursor(4, 4);
    await sleep(300);
  } else {
    results.hoverReleasesClickThrough = 'no-zones';
    results.lockClickEntersEdit = 'no-zones';
    results.clickThroughRestored = 'no-zones';
  }
  // ============================================================
  // 4) 锁定/解锁往返（用户报告：解锁后点 🔓 无反应）
  //    真凶：编辑模式下卡片头部是系统拖拽区，点击被窗口拖动吞掉
  // ============================================================
  await evalIn('m4Reset', wallpaperWin, 'window.desktopAPI.setMode(false).then(function(){return true;})');
  await sleep(600);
  const pointerDown = "(function(){var b=document.querySelector('.wp-lock'); if(!b) return false; b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); return true;})()";
  await evalIn('m4ClickLock', wallpaperWin, pointerDown);
  await sleep(800);
  await evalIn('m4AfterLock', wallpaperWin, 'window.desktopAPI.getConfig().then(function(c){return c.editMode;})');
  await evalIn('m4ClickUnlock', wallpaperWin, pointerDown);
  await sleep(800);
  const afterUnlock = await wallpaperWin.webContents.executeJavaScript('window.desktopAPI.getConfig().then(function(c){return c.editMode;})', true);
  results.m4UnlockReturnsDesktop = afterUnlock === false;
  results.modeRoundTrip = results.m4AfterLock === true && results.m4UnlockReturnsDesktop === true;

  // 真实鼠标：编辑模式下点击 🔓 回到桌面模式（旧实现必失败）
  await evalIn('m4EditForRealClick', wallpaperWin, 'window.desktopAPI.setMode(true).then(function(){return true;})');
  await sleep(700);
  const stEdit = await evalIn('m4StateEdit', wallpaperWin, 'window.desktopAPI.debugState()');
  const lockRectEdit = await rectOf(wallpaperWin, '.wp-lock');
  if (stEdit && stEdit.zones && stEdit.zones.length) {
    const z = lockRectEdit || stEdit.zones.find((x) => x.w > 0) || stEdit.zones[0];
    await moveCursor(stEdit.bounds.x + z.x + z.w / 2, stEdit.bounds.y + z.y + z.h / 2);
    await sleep(500);
    await clickCursor();
    await sleep(800);
    const realUnlock = await wallpaperWin.webContents.executeJavaScript('window.desktopAPI.getConfig().then(function(c){return c.editMode;})', true);
    results.realMouseUnlockWorks = realUnlock === false;
  } else {
    results.realMouseUnlockWorks = 'no-zones';
  }

  // ============================================================
  // 5) ☰ 菜单 + 4 套配色主题 + 隐藏日历
  // ============================================================
  await evalIn('m5EnterEdit', wallpaperWin, 'window.desktopAPI.setMode(true).then(function(){return true;})');
  await sleep(600);
  await evalIn('m5OpenMenu', wallpaperWin, "(function(){var b=document.querySelector('.wp-menu-btn'); if(!b) return false; b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); return true;})()");
  await sleep(500);
  await evalIn('m5MenuOpen', wallpaperWin, "!!document.querySelector('.wp-menu')");
  await evalIn('m5MenuSections', wallpaperWin, "document.querySelectorAll('.wp-menu .wp-menu-sec').length");
  await evalIn('m5ThemeButtons', wallpaperWin, "document.querySelectorAll('.wp-theme-btn').length");
  await evalIn('m5HasOpacitySlider', wallpaperWin, "!!document.querySelector('.wp-menu .wp-opacity-range')");
  await evalIn('m5DisplayToggles', wallpaperWin, "document.querySelectorAll('.wp-menu .wp-toggle').length");
  // 菜单里不应再有「位置」「大小」
  await evalIn(
    'm5MenuNoPositionSize',
    wallpaperWin,
    "(function(){var m=document.querySelector('.wp-menu'); if(!m) return 'no-menu'; var t=m.textContent||'';" +
      "return !t.includes('位置') && !t.includes('大小');})()"
  );
  results.menuRemovedPositionSize = results.m5MenuNoPositionSize === true;
  await evalIn(
    'm5NoModeButton',
    wallpaperWin,
    "(function(){var m=document.querySelector('.wp-menu'); if(!m) return 'no-menu'; var t=m.textContent||'';" +
      "return !t.includes('进入编辑模式') && !t.includes('返回桌面模式') && !t.includes('编辑模式');})()"
  );
  results.menuRemovedModeButton = results.m5NoModeButton === true;

  // 主题切换：容器背景与单元格背景必须明显不同
  for (const theme of ['mist', 'ink', 'sand', 'mint']) {
    await evalIn('m5Set_' + theme, wallpaperWin, "window.desktopAPI.setConfig({theme:'" + theme + "'}).then(function(){return true;})");
    await sleep(450);
    await evalIn(
      'm5Colors_' + theme,
      wallpaperWin,
      "(function(){var card=document.querySelector('.wp-card');var day=document.querySelector('.wp-day');" +
        "var cs=getComputedStyle(card);var ds=getComputedStyle(day);" +
        "var cardBg=(cs.backgroundImage&&cs.backgroundImage!=='none')?cs.backgroundImage:cs.backgroundColor;" +
        "return {cardBg:cardBg, dayBg:ds.backgroundColor, distinct:cardBg!==ds.backgroundColor};})()"
    );
  }
  results.themesDistinct =
    ['mist', 'ink', 'sand', 'mint'].every((t) => results['m5Colors_' + t] && results['m5Colors_' + t].distinct === true);

  // 显示内容开关：关闭节假日 / 农历
  await evalIn('m5HideFest', wallpaperWin, "window.desktopAPI.setConfig({showFestivals:false,showLunar:false}).then(function(){return true;})");
  await sleep(600);
  await evalIn('m5FestCount', wallpaperWin, "document.querySelectorAll('.wp-day .wp-fest').length + document.querySelectorAll('.wp-day .wp-term').length");
  results.hideFestivalsWorks = results.m5FestCount === 0;
  await evalIn('m5RestoreFest', wallpaperWin, "window.desktopAPI.setConfig({showFestivals:true,showLunar:true,theme:'mist',material:'glass',opacity:92,showTasks:true,showDiary:true,showTodayPanel:true}).then(function(){return true;})");
  await sleep(400);

  // 隐藏桌面日历 → 托盘恢复
  await evalIn('m5CloseMenuClick', wallpaperWin, "(function(){var bd=document.querySelector('.wp-menu-backdrop'); if(bd){bd.click();} return true;})()");
  await sleep(400);
  await evalIn('m5MenuClosed', wallpaperWin, "!document.querySelector('.wp-menu')");
  await evalIn('m5Hide', wallpaperWin, 'window.desktopAPI.hideWallpaper(); true');
  await sleep(700);
  results.hiddenAfterHide = !wallpaperWin.isVisible();
  wallpaperWin.showInactive();
  await sleep(500);
  results.visibleRestored = wallpaperWin.isVisible();

  // ============================================================
  // 6) 单元格显示：阳历+农历同一行 / 班·休标注 / 周六周日列着色
  //    先确保回到“本月”，避免前面真实点击翻动了月份
  // ============================================================
  await evalIn(
    'm6ResetMonth',
    wallpaperWin,
    "window.__smartdayMonth && window.__smartdayMonth(new Date().toISOString().slice(0,10)); true"
  );
  await sleep(600);
  await evalIn('m6Title', wallpaperWin, "document.querySelector('.wp-title').textContent");
  await evalIn('m6DayCount', wallpaperWin, "document.querySelectorAll('.wp-day').length");
  await evalIn(
    'm6NumrowInline',
    wallpaperWin,
    "(function(){var r=document.querySelector('.wp-day:not(.outside) .wp-numrow'); if(!r) return 'no-numrow';" +
      "var n=r.querySelector('.wp-num'); var l=r.querySelector('.wp-lunar-inline'); if(!n||!l) return 'missing';" +
      "var a=n.getBoundingClientRect(), b=l.getBoundingClientRect();" +
      "return Math.abs(a.top-b.top)<=3 && b.left>=a.right-1;})()"
  );
  results.lunarInlineWithSolar = results.m6NumrowInline === true;
  await evalIn('m6RestCount', wallpaperWin, "document.querySelectorAll('.wp-day .wp-badge.off').length");
  await evalIn('m6WorkCount', wallpaperWin, "document.querySelectorAll('.wp-day .wp-badge.work').length");
  results.restBadgeShown = typeof results.m6RestCount === 'number' && results.m6RestCount > 0;
  results.workBadgeShown = typeof results.m6WorkCount === 'number' && results.m6WorkCount > 0;
  await evalIn(
    'm6WeekendTint',
    wallpaperWin,
    "(function(){var w=Array.prototype.slice.call(document.querySelectorAll('.wp-day.weekend')).filter(function(e){return !e.classList.contains('today') && !e.classList.contains('outside');})[0];" +
      "var d=Array.prototype.slice.call(document.querySelectorAll('.wp-day')).filter(function(e){return !e.classList.contains('weekend') && !e.classList.contains('outside');})[0];" +
      "if(!w||!d) return 'missing'; var wc=getComputedStyle(w).backgroundColor, dc=getComputedStyle(d).backgroundColor;" +
      "return {weekend:wc, weekday:dc, distinct: wc!==dc};})()"
  );
  results.weekendDistinct = !!(results.m6WeekendTint && results.m6WeekendTint.distinct === true);

  // ============================================================
  // 7) 表头按钮顺序（‹ › ☰ 🔒）/ 只显示本月 / 星期行更矮 / 月份可切换
  // ============================================================
  await evalIn(
    'm7Buttons',
    wallpaperWin,
    "Array.prototype.slice.call(document.querySelectorAll('.wp-actions .wp-icon-btn')).map(function(b){return b.className;})"
  );
  const cls = Array.isArray(results.m7Buttons) ? results.m7Buttons.join('|') : '';
  results.headerButtonOrder =
    cls.indexOf('wp-nav-prev') >= 0 &&
    cls.indexOf('wp-nav-prev') < cls.indexOf('wp-nav-next') &&
    cls.indexOf('wp-nav-next') < cls.indexOf('wp-menu-btn') &&
    cls.indexOf('wp-menu-btn') < cls.indexOf('wp-lock');

  await evalIn('m7EnterEdit', wallpaperWin, 'window.desktopAPI.setMode(true).then(function(){return true;})');
  await sleep(600);
  await evalIn(
    'm7ResetMonth',
    wallpaperWin,
    "window.__smartdayMonth && window.__smartdayMonth(new Date().toISOString().slice(0,10)); true"
  );
  await sleep(500);
  await evalIn('m7TitleBefore', wallpaperWin, "document.querySelector('.wp-title').textContent");
  await evalIn(
    'm7ClickNext',
    wallpaperWin,
    "(function(){var b=document.querySelector('.wp-nav-next'); b && b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); return true;})()"
  );
  await sleep(600);
  await evalIn('m7TitleAfter', wallpaperWin, "document.querySelector('.wp-title').textContent");
  results.monthNavWorks = !!results.m7TitleBefore && results.m7TitleBefore !== results.m7TitleAfter;
  await evalIn(
    'm7BackToNow',
    wallpaperWin,
    "(function(){var b=document.querySelector('.wp-nav-prev'); b && b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); return true;})()"
  );
  await sleep(500);

  await evalIn('m7DaysInMonth', wallpaperWin, "new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate()");
  await evalIn('m7NumberedCells', wallpaperWin, "document.querySelectorAll('.wp-day .wp-num').length");
  await evalIn('m7BlankCells', wallpaperWin, "document.querySelectorAll('.wp-day.blank').length");
  await evalIn('m7TotalCells', wallpaperWin, "document.querySelectorAll('.wp-day').length");
  results.onlyCurrentMonth =
    results.m7NumberedCells === results.m7DaysInMonth &&
    results.m7BlankCells === results.m7TotalCells - results.m7DaysInMonth;
  await evalIn(
    'm7HeaderHeight',
    wallpaperWin,
    "(function(){var h=document.querySelector('.wp-dw.weekend') || document.querySelectorAll('.wp-dw')[1];" +
      "var d=Array.prototype.slice.call(document.querySelectorAll('.wp-day')).filter(function(e){return !e.classList.contains('blank');})[0];" +
      "if(!h||!d) return 'missing'; var hh=h.getBoundingClientRect().height, dh=d.getBoundingClientRect().height;" +
      "return {header:Math.round(hh), day:Math.round(dh), ratio:+(hh/dh).toFixed(2)};})()"
  );
  results.weekdayHeaderShort = !!(results.m7HeaderHeight && typeof results.m7HeaderHeight === 'object' && results.m7HeaderHeight.ratio < 0.6);

  // ============================================================
  // 8) 🔒 制约：锁定态 ‹ › ☰ 不可点（仅锁定按钮可点）；锁定后不沉底
  // ============================================================
  const controls = "Array.prototype.slice.call(document.querySelectorAll('.wp-nav, .wp-menu-btn')).map(function(b){return b.disabled;})";
  await evalIn('m8EnterEdit', wallpaperWin, 'window.desktopAPI.setMode(true).then(function(){return true;})');
  await sleep(700);
  await evalIn('m8EditDisabled', wallpaperWin, controls);
  results.editModeControlsEnabled =
    Array.isArray(results.m8EditDisabled) && results.m8EditDisabled.every(function (v) { return v === false; });
  await evalIn('m8Lock', wallpaperWin, 'window.desktopAPI.setMode(false).then(function(){return true;})');
  await sleep(800);
  await evalIn('m8LockedDisabled', wallpaperWin, controls);
  results.lockedControlsDisabled =
    Array.isArray(results.m8LockedDisabled) && results.m8LockedDisabled.every(function (v) { return v === true; });
  await evalIn(
    'm8State',
    wallpaperWin,
    'window.desktopAPI.debugState().then(function(s){return {zones:s.zones.length, z:s.lastZAction, visible:s.visible, edit:s.editMode};})'
  );
  const st8 = results.m8State;
  results.lockedOnlyLockClickable = !!st8 && st8.zones === 1;
  // 需求：锁定后立即沉到最底层（z === 'bottom'），且窗口仍可见、仍处桌面模式
  results.lockSendsToBottom = !!st8 && st8.z === 'bottom' && st8.visible === true && st8.edit === false;

  // ============================================================
  // 9) 农历简称规则 / 节日与阳历农历同行 / 月份记忆
  // ============================================================
  await evalIn(
    'm9LunarTexts',
    wallpaperWin,
    "Array.prototype.slice.call(document.querySelectorAll('.wp-day .wp-lunar-inline')).map(function(e){return e.textContent;})"
  );
  const texts = Array.isArray(results.m9LunarTexts) ? results.m9LunarTexts : [];
  const monthRe = /^(闰)?(正|二|三|四|五|六|七|八|九|十|冬|腊)月$/;
  const dayRe = /^(初[一二三四五六七八九十]|十[一二三四五六七八九]|二十|廿[一二三四五六七八九]|三十)$/;
  results.lunarShortRule = texts.length > 0 && texts.every(function (t) { return monthRe.test(t) || dayRe.test(t); });
  results.lunarShortHasMonthForm = texts.some(function (t) { return monthRe.test(t); });
  results.lunarShortNoComposite = !texts.some(function (t) { return t.includes('月') && /[初廿]/.test(t); });

  await evalIn(
    'm9FestivalInline',
    wallpaperWin,
    "(function(){var f=document.querySelector('.wp-day .wp-numrow .wp-fest-inline'); if(!f) return 'none';" +
      "var row=f.parentElement; var num=row.querySelector('.wp-num');" +
      "var a=f.getBoundingClientRect(), b=num.getBoundingClientRect();" +
      "var cs=getComputedStyle(f);" +
      "return {sameRow: Math.abs(a.top-b.top)<=3, text:f.textContent, overflow:cs.overflow, ellipsis:cs.textOverflow};})()"
  );
  const fest = results.m9FestivalInline;
  results.festivalInlineSameRow = !!(fest && typeof fest === 'object' && fest.sameRow === true);
  results.festivalCanTruncate = !!(fest && typeof fest === 'object' && fest.overflow === 'hidden' && fest.ellipsis === 'ellipsis');

  await evalIn('m9SetMonth', wallpaperWin, "window.__smartdayMonth && window.__smartdayMonth('2026-12-15'); true");
  await sleep(600);
  await evalIn('m9ViewMonth', wallpaperWin, 'window.desktopAPI.getConfig().then(function(c){return c.viewMonth;})');
  results.viewMonthSaved =
    typeof results.m9ViewMonth === 'string' && results.m9ViewMonth.indexOf('2026-12') === 0;
  await evalIn(
    'm9MonthBack',
    wallpaperWin,
    "window.__smartdayMonth && window.__smartdayMonth(new Date().toISOString().slice(0,10)); true"
  );
  await sleep(400);
  // 主应用窗口
  if (mainWin) {
    await evalIn('mainShell', mainWin, "!!document.querySelector('.app-shell')");
    await evalIn('mainNav', mainWin, "document.querySelectorAll('.nav-item').length");
    await mainWin.webContents.executeJavaScript("location.hash = '#/calendar/date:" + new Date().toISOString().slice(0, 10) + "'");
    await sleep(900);
    await evalIn('mainCalendarCells', mainWin, "document.querySelectorAll('.month-cell').length");
    // ---- 跨窗口实时同步：主应用建任务 → 壁纸窗口应立即收到 ----
    await evalIn(
      'mainCreateTask',
      mainWin,
      "window.__smartday.store.getState().createTask({title:'桌面同步验证任务'}).then(function(){return true;})"
    );
    await sleep(1200);
    await evalIn(
      'wallpaperGotTask',
      wallpaperWin,
      "window.__smartday.store.getState().tasks.some(function(t){return t.title==='桌面同步验证任务';})"
    );
    await evalIn(
      'mainCleanup',
      mainWin,
      "window.__smartday.store.getState().deleteTask(window.__smartday.store.getState().tasks.filter(function(t){return t.title==='桌面同步验证任务';})[0].id).then(function(){return true;})"
    );
    await sleep(300);
  }
  // 截图
  try {
    const p1 = await wallpaperWin.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'wallpaper.png'), p1.toPNG());
    // 每种配色主题各截一张（供选择样例）
    for (const theme of ['mist', 'ink', 'sand', 'mint']) {
      await wallpaperWin.webContents.executeJavaScript(
        "window.desktopAPI.setConfig({theme:'" + theme + "',material:'solid',opacity:100}).then(function(){return true;})", true);
      await sleep(700);
      const shot = await wallpaperWin.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'theme-' + theme + '.png'), shot.toPNG());
    }
    // 编辑模式 + ☰ 菜单展开
    await wallpaperWin.webContents.executeJavaScript(
      "window.desktopAPI.setConfig({theme:'mist',material:'glass',opacity:92}).then(function(){return true;})", true);
    await wallpaperWin.webContents.executeJavaScript("window.desktopAPI.setMode(true).then(function(){return true;})", true);
    await sleep(800);
    await wallpaperWin.webContents.executeJavaScript(
      "(function(){var b=document.querySelector('.wp-menu-btn'); b && b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})); return true;})()", true);
    await sleep(600);
    const p3 = await wallpaperWin.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'wallpaper-menu.png'), p3.toPNG());
    await wallpaperWin.webContents.executeJavaScript(
      "(function(){var bd=document.querySelector('.wp-menu-backdrop'); if(bd) bd.click(); return true;})()", true);
    await wallpaperWin.webContents.executeJavaScript("window.desktopAPI.setMode(false).then(function(){return true;})", true);
    await sleep(400);
    if (mainWin) {
      const p2 = await mainWin.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, 'main.png'), p2.toPNG());
    }
    results.screenshots = 'ok';
  } catch (e) { results.screenshots = 'ERR ' + (e && e.message); }
  const failures = Object.entries(results).filter(([k, v]) => v === false || (typeof v === 'string' && v.startsWith('ERR')));
  console.log('===== SMOKE RESULTS =====');
  console.log(JSON.stringify(results, null, 2));
  console.log('===== CONSOLE ERRORS (' + consoleErrors.length + ') =====');
  consoleErrors.slice(0, 20).forEach((e) => console.log(e));
  console.log('===== CONSOLE WARNINGS (' + consoleWarnings.length + ') =====');
  consoleWarnings.slice(0, 10).forEach((e) => console.log(e));
  // 托盘双击 = 打开主应用（不再用于切换锁定/编辑模式）
  try {
    if (mainWin && !mainWin.isDestroyed()) mainWin.hide();
    await sleep(400);
    const wasHidden = mainWin && !mainWin.isDestroyed() ? !mainWin.isVisible() : true;
    if (tray) tray.emit('double-click');
    await sleep(900);
    results.trayDoubleClickOpensMain =
      !!mainWin && !mainWin.isDestroyed() && mainWin.isVisible() && wasHidden === true;
  } catch (e) {
    results.trayDoubleClickOpensMain = 'ERR ' + (e && e.message);
  }

  // 还原用户配置：自检临时改了 主题/材质/透明度/显示开关/尺寸/月份/模式，结束时整份写回
  try {
    store.write(settingsBackup);
    applyEditMode(!!settingsBackup.editMode, { silent: true });
    if (wallpaperWin && settingsBackup.bounds) {
      suppressMoveSave = true;
      wallpaperWin.setBounds(settingsBackup.bounds);
      setTimeout(() => {
        suppressMoveSave = false;
      }, 250);
    }
    if (wallpaperWin) {
      if (settingsBackup.visible === false) wallpaperWin.hide();
      else if (!wallpaperWin.isVisible()) wallpaperWin.showInactive();
    }
    const now = store.read();
    results.stateRestored =
      now.theme === settingsBackup.theme &&
      now.material === settingsBackup.material &&
      now.opacity === settingsBackup.opacity &&
      now.editMode === settingsBackup.editMode &&
      now.visible === settingsBackup.visible;
    results.restoredConfig = { theme: now.theme, material: now.material, opacity: now.opacity, editMode: now.editMode, visible: now.visible };
  } catch (e) {
    results.stateRestored = 'ERR ' + (e && e.message);
  }
  console.log('===== POST CHECKS =====');
  console.log('stateRestored: ' + results.stateRestored);
  console.log('trayDoubleClickOpensMain: ' + results.trayDoubleClickOpensMain);
  const ok =
    failures.length === 0 &&
    consoleErrors.length === 0 &&
    results.wallpaperDays >= 28 &&
    results.stateRestored === true &&
    results.trayDoubleClickOpensMain === true;
  console.log('===== RESULT: ' + (ok ? 'PASS' : 'FAIL') + ' =====');
  app.exit(ok ? 0 : 1);
}

// ============================================================
// 锁定/解锁诊断（--diag-lock）：真实鼠标连续点击，定位"点了没反应"
// ============================================================
async function runLockDiagnostics() {
  const report = { cycles: [], startup: null, config: store.read() };
  await sleep(4000);
  if (!wallpaperWin) {
    console.log('[DIAG] 壁纸窗口不存在');
    app.exit(1);
    return;
  }
  const win = wallpaperWin;
  const readState = async () => {
    try {
      return await win.webContents.executeJavaScript('window.desktopAPI.debugState()', true);
    } catch (e) {
      return { error: String(e && e.message) };
    }
  };
  const lockRect = await rectOf(win, '.wp-lock');
  report.lockRect = lockRect;
  const st0init = await readState();
  report.zonesAtStart = st0init.zones;

  // ---- 冷启动首击：先移开光标，再作为"第一次交互"点锁 ----
  await applyEditMode(false, { silent: true });
  await sleep(900);
  await moveCursor(30, 30);
  await sleep(700);
  const s0 = await readState();
  const lr = lockRect || { x: 800, y: 26, w: 30, h: 28 };
  const targetX = s0.bounds.x + lr.x + lr.w / 2;
  const targetY = s0.bounds.y + lr.y + lr.h / 2;
  report.target = { x: Math.round(targetX), y: Math.round(targetY), bounds: s0.bounds };
  report.startup = { beforeIgnore: s0.ignoreMouse };
  await moveCursor(targetX, targetY);
  await sleep(600);
  const s1 = await readState();
  report.startup.onHoverIgnore = s1.ignoreMouse;
  await clickCursor();
  await sleep(900);
  const s2 = await readState();
  report.startup.afterClickEditMode = s2.editMode;
  report.startup.pass = s2.editMode === true;
  await applyEditMode(false, { silent: true });
  await sleep(900);

  // ---- 连续 5 轮：点击 → 再点击 ----
  for (let i = 0; i < 5; i++) {
    const c = { i };
    const b0 = await readState();
    c.modeBefore = b0.editMode;
    c.ignoreBefore = b0.ignoreMouse;
    await moveCursor(targetX, targetY);
    await sleep(600);
    const b1 = await readState();
    c.ignoreOnHover = b1.ignoreMouse;
    await clickCursor();
    await sleep(900);
    const b2 = await readState();
    c.afterFirstClick = b2.editMode;
    await sleep(300);
    const c1 = await readState();
    c.ignoreBeforeSecond = c1.ignoreMouse;
    await clickCursor();
    await sleep(900);
    const c2 = await readState();
    c.afterSecondClick = c2.editMode;
    c.pass = c.afterFirstClick !== c.modeBefore;
    report.cycles.push(c);
    await sleep(200);
  }
  // ---- 双击场景：双击 🔒 应仍然进入编辑模式（不能自我抵消） ----
  await applyEditMode(false, { silent: true });
  await sleep(900);
  await moveCursor(targetX, targetY);
  await sleep(600);
  const d0 = await readState();
  await doubleClickCursor(130);
  await sleep(1000);
  const d1 = await readState();
  report.doubleClick = {
    modeBefore: d0.editMode,
    ignoreOnHover: d0.ignoreMouse,
    modeAfterDoubleClick: d1.editMode,
    pass: d1.editMode === true,
  };
  // ---- 慢速两次点击应各生效一次（防抖不会误吞） ----
  await applyEditMode(false, { silent: true });
  await sleep(900);
  await moveCursor(targetX, targetY);
  await sleep(600);
  await clickCursor();
  await sleep(800);
  const e1 = await readState();
  await moveCursor(targetX, targetY);
  await sleep(400);
  await clickCursor();
  await sleep(800);
  const e2 = await readState();
  report.slowDoubleClick = { afterFirst: e1.editMode, afterSecond: e2.editMode, pass: e1.editMode === true && e2.editMode === false };

  await applyEditMode(false, { silent: true });
  const failed = report.cycles.filter((c) => !c.pass);
  console.log('===== LOCK DIAG =====');
  console.log(JSON.stringify(report, null, 2));
  const allPass =
    report.startup.pass && failed.length === 0 && report.doubleClick.pass && report.slowDoubleClick.pass;
  console.log(
    '===== startup: ' + report.startup.pass +
      ' | failed cycles: ' + failed.length +
      ' | doubleClick: ' + report.doubleClick.pass +
      ' | slowDoubleClick: ' + report.slowDoubleClick.pass +
      ' | RESULT: ' + (allPass ? 'PASS' : 'FAIL') + ' ====='
  );
  app.exit(allPass ? 0 : 2);
}

// ---------------- 启动 ----------------
app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.smartday.desktop');
  registerAppProtocol();
  registerIpc();

  // ---- 配置持久化自检 ----
  if (IS_PERSIST_WRITE) {
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'persist-backup.json'), JSON.stringify(store.read(), null, 2), 'utf8');
    } catch (e) {
      console.warn('[PERSIST] 备份失败', e && e.message);
    }
    const after = store.write(PERSIST_PROBE);
    console.log('[PERSIST] wrote ' + JSON.stringify({ theme: after.theme, material: after.material, opacity: after.opacity, showLunar: after.showLunar, viewMonth: after.viewMonth }));
    console.log('[PERSIST] file=' + store.file());
    setTimeout(() => app.exit(0), 500);
    return;
  }
  if (IS_PERSIST_VERIFY) {
    const cfg = store.read();
    const bad = Object.keys(PERSIST_PROBE).filter((k) => cfg[k] !== PERSIST_PROBE[k]);
    console.log('[PERSIST] read ' + JSON.stringify({ theme: cfg.theme, material: cfg.material, opacity: cfg.opacity, showLunar: cfg.showLunar, viewMonth: cfg.viewMonth, position: cfg.position }));
    console.log('[PERSIST] ' + (bad.length === 0 ? 'PASS' : 'FAIL missing=' + bad.join(',')));
    // 还原用户原配置
    try {
      const backup = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'persist-backup.json'), 'utf8'));
      store.write(backup);
      console.log('[PERSIST] restored user config');
    } catch (e) {
      console.warn('[PERSIST] 还原失败', e && e.message);
    }
    setTimeout(() => app.exit(bad.length === 0 ? 0 : 1), 500);
    return;
  }

  createWallpaperWindow();
  if (IS_DIAG_LOCK) {
    void runLockDiagnostics();
    return;
  }
  if (OPEN_MAIN) openMainWindow();
  try {
    tray = new Tray(trayIcon());
    tray.setToolTip('SmartDay 桌面日历 · 桌面模式');
    // 双击托盘图标 = 打开主应用（按用户要求，不再用于切换锁定/编辑模式）
    tray.on('double-click', () => openMainWindow());
    rebuildTray();
  } catch (e) {
    console.error('[tray] 创建失败', e);
  }
  // 说明：按用户要求已移除全部键盘快捷键（含全局 Ctrl+Alt+D）。
  // 模式切换保留：单击卡片 🔒/🔓、托盘菜单「切换模式」。
  if (IS_SMOKE) void runSmoke();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWallpaperWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { isQuitting = true; });

