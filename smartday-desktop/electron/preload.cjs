// 预加载脚本：向渲染进程暴露受控的桌面能力
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAPI", {
  isDesktop: true,
  getConfig: () => ipcRenderer.invoke("desktop:get-config"),
  setConfig: (patch) => ipcRenderer.invoke("desktop:set-config", patch),

  // 模式
  toggleMode: () => ipcRenderer.invoke("desktop:toggle-mode"),
  setMode: (edit) => ipcRenderer.invoke("desktop:set-mode", edit),
  openMain: () => ipcRenderer.send("desktop:open-main"),
  refresh: () => ipcRenderer.send("desktop:refresh"),
  quit: () => ipcRenderer.send("desktop:quit"),

  // 窗口
  hideWallpaper: () => ipcRenderer.send("desktop:hide"),
  dragStart: () => ipcRenderer.send("desktop:drag-start"),
  dragEnd: () => ipcRenderer.send("desktop:drag-end"),
  resizeStart: () => ipcRenderer.send("desktop:resize-start"),
  resizeEnd: () => ipcRenderer.send("desktop:resize-end"),
  resizeBy: (delta) => ipcRenderer.send("desktop:resize-by", delta),
  fitToContent: (size) => ipcRenderer.send("desktop:fit", size),

  // 点击穿透
  setIgnoreMouse: (ignore) => ipcRenderer.send("desktop:ignore-mouse", ignore),
  reportZones: (zones) => ipcRenderer.send("desktop:zones", zones),
  debugState: () => ipcRenderer.invoke("desktop:debug-state"),
  hoverTest: (pt) => ipcRenderer.invoke("desktop:hover-test", pt),

  onConfig: (cb) => {
    ipcRenderer.on("desktop:config", (_e, cfg) => cb(cfg));
  },
  onFocusDay: (cb) => {
    ipcRenderer.on("desktop:focus-day", (_e, date) => cb(date));
  },
});
