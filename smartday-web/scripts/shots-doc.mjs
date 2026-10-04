import { chromium } from "playwright";
import fs from "node:fs";
const OUT = ".docs-shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4173";
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(BASE + "/#/overview", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.evaluate(async () => {
  const now = Date.now();
  const t = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  const day = (off) => { const d = new Date(t); d.setDate(d.getDate() + off); return d; };
  const iso = (d, h, m) => ymd(d) + "T" + p(h) + ":" + p(m) + ":00";
  const ev = (id, title, d, h, m, dur, cat, color, loc) => ({ id, title, start: iso(d, h, m), end: iso(d, h, m + dur), allDay: false, categoryId: cat, color, location: loc || "", description: "", reminders: [{ minutes: 15 }], createdAt: now, updatedAt: now });
  const events = [
    ev("e1", "项目评审会", t, 9, 30, 60, "cat-work", "#f59f00", "会议室 A"),
    ev("e2", "国省道调研出发", t, 14, 0, 120, "cat-work", "#f59f00", "市局"),
    ev("e3", "晚间复盘", t, 21, 0, 30, "cat-life", "#22c55e", ""),
    ev("e4", "读书会", day(1), 19, 0, 90, "cat-life", "#22c55e", "线上"),
    ev("e5", "周例会", day(2), 10, 0, 60, "cat-work", "#f59f00", "会议室 B"),
    ev("e6", "家庭聚餐", day(3), 18, 0, 120, "cat-life", "#22c55e", ""),
    ev("e7", "体检预约", day(5), 8, 30, 60, "cat-default", "#4f6ef7", "市医院"),
  ];
  const task = (id, title, listId, list, done, due, pri, group, sub, myday) => ({ id, title, listId, completed: done, completedAt: done ? now : null, priority: pri, starred: id === "t1", dueDate: due, dueTime: null, remindAt: null, repeat: null, inMyDay: myday || null, tags: [], subtasks: sub || [], attachments: [], notes: "", order: 0, createdAt: now, updatedAt: now, groupId: group });
  const tasks = [
    task("t1", "撰写国情调研报告", "list-inbox", "收集箱", false, ymd(t), "high", "g1", [{ id: "s1", title: "整理访谈记录", completed: true }, { id: "s2", title: "撰写初稿", completed: false }], ymd(t)),
    task("t2", "整理会议纪要", "list-work", "工作", false, ymd(t), "medium", "g1", [], null),
    task("t3", "缴纳水电费", "list-life", "生活", false, ymd(day(1)), "low", "g2", [], null),
    task("t4", "准备读书会分享", "list-study", "学习", false, ymd(day(2)), "medium", "g2", [], null),
    task("t5", "提交周报", "list-work", "工作", true, ymd(day(-1)), "medium", "g1", [], null),
  ];
  const diaries = [{ id: "d1", date: ymd(t), title: "10月4日 星期六", content: "上午评审会顺利，下午整理了调研材料。\n\n今天的状态不错，专注了 3 个番茄。", mood: "smile", createdAt: now - 3600000, updatedAt: now }];
  const notes = [
    { id: "n1", title: "法考备考计划", content: "## 阶段划分\n- 一轮：精讲课 + 章节题\n- 二轮：真题 + 错题本\n- 三轮：模拟卷", date: null, tags: ["学习", "法考"], pinned: true, createdAt: now - 86400000 * 5, updatedAt: now - 3600000 },
    { id: "n2", title: "会议要点：国省道调研", content: "- 调研路线：G318 → 省道 203\n- 关注点：路面状况、排水、边坡\n- 输出：调研报告（10 月中旬）", date: ymd(t), tags: ["工作", "会议"], pinned: false, createdAt: now - 86400000 * 3, updatedAt: now - 7200000 },
    { id: "n3", title: "本周复盘", content: "完成 12 项任务，专注 6.5 小时。下周重点是报告初稿。", date: null, tags: ["复盘"], pinned: false, createdAt: now - 86400000 * 2, updatedAt: now - 86400000 },
    { id: "n4", title: "读书笔记：深度工作", content: "> 深度工作的能力正在消失，而它越来越稀缺。", date: null, tags: ["读书", "灵感"], pinned: false, createdAt: now - 86400000 * 8, updatedAt: now - 86400000 * 4 },
  ];
  const anniv = [
    { id: "a1", name: "回市局", type: "countdown", date: "2026-11-23", isLunar: false, remindDays: 3, order: 0, createdAt: now, updatedAt: now },
    { id: "a2", name: "母亲生日", type: "countdown", date: "2026-10-20", isLunar: false, remindDays: 1, order: 1, createdAt: now, updatedAt: now },
    { id: "a3", name: "结婚纪念日", type: "anniversary", date: "2024-05-01", isLunar: false, remindDays: 7, order: 2, createdAt: now, updatedAt: now },
  ];
  const lists = [
    { id: "list-inbox", name: "收集箱", color: "#4f6ef7", order: 0, createdAt: now, updatedAt: now },
    { id: "list-work", name: "工作", color: "#f59f00", order: 1, createdAt: now, updatedAt: now },
    { id: "list-life", name: "生活", color: "#22c55e", order: 2, createdAt: now, updatedAt: now },
    { id: "list-study", name: "学习", color: "#8b5cf6", order: 3, createdAt: now, updatedAt: now },
  ];
  const groups = [{ id: "g1", name: "工作", order: 0, createdAt: now, updatedAt: now }, { id: "g2", name: "个人", order: 1, createdAt: now, updatedAt: now }];
  const cats = [
    { id: "cat-default", name: "默认", color: "#4f6ef7", visible: true, isDefault: true, order: 0, createdAt: now, updatedAt: now },
    { id: "cat-work", name: "工作", color: "#f59f00", visible: true, isDefault: false, order: 1, createdAt: now, updatedAt: now },
    { id: "cat-life", name: "生活", color: "#22c55e", visible: true, isDefault: false, order: 2, createdAt: now, updatedAt: now },
  ];
  const focus = [];
  for (let i = 0; i < 90; i++) {
    const d = day(-i);
    const n = [2, 0, 3, 1, 4, 0, 0, 5, 2, 1][i % 10];
    for (let k = 0; k < n; k++) {
      const start = new Date(d); start.setHours(9 + k, 0, 0, 0);
      focus.push({ id: "f" + i + "-" + k, mode: "pomodoro", status: "completed", plannedMinutes: 25, actualSeconds: 1500, startedAt: start.getTime(), endedAt: start.getTime() + 1500000, targetId: k % 2 ? "t1" : "t2", targetType: "task", targetTitle: k % 2 ? "撰写国情调研报告" : "整理会议纪要", source: "focus-page", createdAt: start.getTime(), updatedAt: start.getTime() });
    }
  }
  const data = { events, tasks, diaries, notes, anniversaries: anniv, taskLists: lists, taskGroups: groups, categories: cats, focus };
  await new Promise((res, rej) => {
    const req = indexedDB.open("smartday-db");
    req.onsuccess = () => {
      const db = req.result;
      const stores = Object.keys(data).filter((s) => db.objectStoreNames.contains(s));
      const tx = db.transaction(stores, "readwrite");
      for (const s of stores) for (const item of data[s]) tx.objectStore(s).put(item);
      tx.oncomplete = () => { db.close(); res(null); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
});
const shot = async (name, hash, extra) => {
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
  if (extra) await extra();
  await page.screenshot({ path: OUT + "/" + name + ".png" });
  console.log("shot:", name);
};
await shot("01-overview", "/#/overview");
await shot("02-calendar", "/#/calendar", async () => {
  await page.evaluate(() => { const cells = Array.from(document.querySelectorAll(".month-cell:not(.outside)")); const c = cells.find((x) => (x.querySelector(".cell-date") || {}).textContent.trim() === String(new Date().getDate())); if (c) c.click(); });
  await page.waitForTimeout(900);
});
await shot("03-tasks", "/#/tasks");
await shot("04-notes", "/#/diary");
await shot("05-focus", "/#/focus");
await shot("06-settings", "/#/settings");
await shot("07-push", "/#/settings/tab:push");
await browser.close();
console.log("done");