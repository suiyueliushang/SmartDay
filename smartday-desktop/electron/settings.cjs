// 桌面端配置持久化（userData/desktop-settings.json）
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const DEFAULTS = {
  // 外观
  theme: "mist", // mist 晨雾蓝 | ink 深邃夜 | sand 暖阳沙 | mint 薄荷绿
  material: "glass", // glass 毛玻璃（透出壁纸）| solid 实色
  opacity: 92, // 0-100 连续值
  // 显示内容开关
  showFestivals: true, // 法定假日 / 节日 / 节气
  showLunar: true, // 农历
  showTasks: true, // 任务上日历
  showDiary: true, // 日记标记
  showTodayPanel: true, // 今日面板
  // 窗口/模式
  position: "right", // right | center | left | custom
  editMode: false,
  keepBottom: false, // 实验：保持置底（桌面层）
  autoLaunch: false, // 开机自启
  visible: true, // 壁纸日历是否显示
  // 位置与尺寸记忆（由鼠标拖动决定）
  viewMonth: null, // 上次查看的月份（yyyy-MM-dd）
  bounds: null, // { x, y, width, height }
  width: 420,
  height: 560,
};

function file() {
  return path.join(app.getPath("userData"), "desktop-settings.json");
}

function read() {
  try {
    const raw = fs.readFileSync(file(), "utf8");
    const cfg = { ...DEFAULTS, ...JSON.parse(raw) };
    // 兼容旧配置：style(glass|list) -> material
    if (!cfg.material && cfg.style) cfg.material = cfg.style === "list" ? "solid" : "glass";
    return cfg;
  } catch {
    return { ...DEFAULTS };
  }
}

function write(patch) {
  const next = { ...read(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(next, null, 2), "utf8");
  } catch (e) {
    console.error("[settings] 写入失败", e);
  }
  return next;
}

module.exports = { read, write, DEFAULTS, file };
