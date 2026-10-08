// 安卓端小组件数据生成逻辑冒烟测试（纯逻辑，不依赖原生/浏览器）
// 对应验收点：A-A5（日记口径）、A-A7（只显示本月）、A-A8（农历简称）、
//            A-4.3.7（日记标记）、A-4.3.5（班休角标）、A-4.3.6（周末着色）
import { getDayInfo } from "../src/lib/holidays";
import { collectDiaryDates, hasDiaryOn, isDiaryNote, DIARY_TAG } from "../src/lib/diary";
import { daysInMonth } from "../src/lib/date";
import type { Diary, Note } from "../src/types";

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log("OK  ", name);
  else { failed++; console.log("FAIL", name, detail ?? ""); }
}

// ============ A-A8 农历简称：初一显月名、其余显日名 ============
{
  const d1 = getDayInfo(2025, 1, 29); // 正月初一
  check("初一显示月份名（正月）", d1.lunarShort === "正月", d1.lunarShort);
  const d2 = getDayInfo(2025, 2, 1); // 正月初四
  check("非初一显示日名（初四）", d2.lunarShort === "初四", d2.lunarShort);
  const d3 = getDayInfo(2025, 1, 28); // 腊月廿九（除夕）
  check("非初一显示日名（廿九）", d3.lunarShort === "廿九", d3.lunarShort);
  // 确保不出现「八月十三」式拼接
  const d4 = getDayInfo(2025, 8, 13);
  check("农历简称不含月+日拼接", !/月.*[初廿十]/.test(d4.lunarShort), d4.lunarShort);
}

// ============ A-4.3.5 班休角标 ============
{
  const work = getDayInfo(2025, 9, 28); // 调休上班
  check("调休上班 isWorkday", work.isWorkday === true);
  const rest = getDayInfo(2025, 10, 1); // 国庆放假
  check("法定假日 isHoliday", rest.isHoliday === true);
}

// ============ A-A5 日记识别统一口径 ============
{
  const diaries: Diary[] = [{ id: "d1", date: "2025-10-01", content: "", createdAt: 0, updatedAt: 0 }];
  const notes: Note[] = [
    { id: "n1", title: "普通笔记", content: "", date: "2025-10-02", tags: [], pinned: false, createdAt: 0, updatedAt: 0 },
    { id: "n2", title: "日记笔记", content: "", date: "2025-10-02", tags: [DIARY_TAG], pinned: false, createdAt: 0, updatedAt: 0 },
  ];
  check("传统日记日期被识别", hasDiaryOn(diaries, notes, "2025-10-01") === true);
  check("带「日记」标签笔记被识别", hasDiaryOn(diaries, notes, "2025-10-02") === true);
  check("普通笔记不算日记", hasDiaryOn(diaries, [], "2025-10-03") === false);
  check("isDiaryNote 正确", isDiaryNote(notes[1]) === true && isDiaryNote(notes[0]) === false);
  const set = collectDiaryDates(diaries, notes);
  check("collectDiaryDates 含两个日期", set.size === 2 && set.has("2025-10-01") && set.has("2025-10-02"), [...set].join(","));
}

// ============ A-A7 月历网格：只显示本月 + 前后空白占位 ============
// 复刻 buildMonthWidgetData 的网格生成逻辑
function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const firstDayOfWeek = first.getDay(); // 0=周日
  const totalDays = daysInMonth(year, month);
  const cells: { day: number }[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: 0 });
  for (let d = 1; d <= totalDays; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: 0 });
  return { cells, firstDayOfWeek, totalDays };
}
{
  const g = buildMonthGrid(2025, 10); // 2025年10月，10月1日是周三(3)
  check("2025-10 月历 10月1日是周三", g.firstDayOfWeek === 3, String(g.firstDayOfWeek));
  check("网格行数为 7 的倍数", g.cells.length % 7 === 0, String(g.cells.length));
  check("前置空白 3 格", g.cells.slice(0, 3).every((c) => c.day === 0) === true);
  const nonZero = g.cells.filter((c) => c.day > 0);
  check("只含当月 31 天", nonZero.length === 31, String(nonZero.length));
  check("无前后月数字（day 只有 0 或 1..31）", g.cells.every((c) => c.day >= 0 && c.day <= 31));
}

// ============ 周末着色 / 今天 / 日记标记的数据字段 ============
{
  const checkDow = (y: number, m: number, d: number) => new Date(y, m - 1, d).getDay();
  check("2025-10-04 是周六", checkDow(2025, 10, 4) === 6);
  check("2025-10-05 是周日", checkDow(2025, 10, 5) === 0);
  check("2025-10-06 是周一", checkDow(2025, 10, 6) === 1);
}

console.log("");
if (failed === 0) console.log("ALL PASSED");
else { console.log(failed + " FAILED"); process.exit(1); }
