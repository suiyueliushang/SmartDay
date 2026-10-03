// 核心逻辑冒烟测试：农历 / 重复事件 / ICS / Markdown / 日期工具
import { solarToLunar, lunarToSolar, getDayExtra, getSolarTerm } from "../src/lib/lunar";
import { getHolidayInfo, getDayInfo } from "../src/lib/holidays";
import { eventOccurrencesInRange, nextDateByRule } from "../src/lib/recurrence";
import { parseICS } from "../src/lib/exportImport";
import { renderMarkdown, countWords } from "../src/lib/markdown";
import { fmtDate, parseDate, addDays, diffDays, startOfWeek } from "../src/lib/date";
import type { CalendarEvent } from "../src/types";

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log("OK  ", name);
  else { failed++; console.log("FAIL", name, detail ?? ""); }
}

// --- 农历 ---
const springFestival2025 = lunarToSolar(2025, 1, 1, false);
check("2025春节=1月29日", springFestival2025?.getMonth() === 0 && springFestival2025?.getDate() === 29, String(springFestival2025));
const lunar = solarToLunar(2025, 1, 29);
check("2025-01-29 = 乙巳年正月初一", lunar.yearName === "乙巳" && lunar.monthName === "正月" && lunar.dayName === "初一", JSON.stringify(lunar));
check("2025-01-29 是春节", getDayExtra(2025, 1, 29).lunarFestival === "春节");
check("2024中秋 农历8月15=公历9月17", getDayExtra(2024, 9, 17).lunarFestival === "中秋节");
check("2024-10-01 法定假日", getHolidayInfo("2024-10-01").isHoliday === true);
check("2024-02-04 调休上班", getHolidayInfo("2024-02-04").isWorkday === true);
check("节气 2025-04-04=清明", getSolarTerm(2025, 4, 4) === "清明");
const dayInfo = getDayInfo(2025, 10, 1);
check("2025-10-01 国庆·中秋", dayInfo.holidayName === "国庆节·中秋节" || dayInfo.isHoliday);

// --- 重复事件 ---
const mkEvent = (start: string, end: string, repeat: CalendarEvent["repeat"]): CalendarEvent => ({
  id: "e1", title: "测试", allDay: false, start, end, categoryId: "c1", reminders: [], repeat,
  createdAt: 0, updatedAt: 0,
});
const daily = mkEvent("2025-01-01T09:00", "2025-01-01T10:00", { freq: "daily", interval: 1, endType: "count", endCount: 3 });
const dailyOcc = eventOccurrencesInRange(daily, parseDate("2025-01-01"), parseDate("2025-01-10"));
check("每天重复3次 -> 3个出现", dailyOcc.length === 3, String(dailyOcc.length));

const weeklyMonWedFri = mkEvent("2025-01-06T09:00", "2025-01-06T10:00", { freq: "custom", interval: 1, weekdays: [1, 3, 5], endType: "never" });
const occ2 = eventOccurrencesInRange(weeklyMonWedFri, parseDate("2025-01-06"), parseDate("2025-01-20"));
check("每周一三五 -> 6个出现(6,8,10,13,15,17)", occ2.length === 6, occ2.map(o => o.start.slice(0, 10)).join(","));

const biweekly = mkEvent("2025-01-06T09:00", "2025-01-06T10:00", { freq: "weekly", interval: 2, endType: "never" });
const occ3 = eventOccurrencesInRange(biweekly, parseDate("2025-01-06"), parseDate("2025-02-03"));
check("每2周周一 -> 1月6/20日 2个", occ3.length === 2, occ3.map(o => o.start.slice(0, 10)).join(","));

const next = nextDateByRule({ freq: "custom", interval: 1, weekdays: [1, 3, 5], endType: "never" }, "2025-01-08", parseDate("2025-01-08"));
check("周三完成后下次=周五(1月10)", next === "2025-01-10", String(next));

const monthly31 = mkEvent("2025-01-31T09:00", "2025-01-31T10:00", { freq: "monthly", interval: 1, endType: "count", endCount: 2 });
const occ4 = eventOccurrencesInRange(monthly31, parseDate("2025-01-01"), parseDate("2025-04-01"));
check("每月31日->1/31、2/28(夹取)", occ4.length === 2 && occ4[1].start.startsWith("2025-02-28"), occ4.map(o => o.start).join(","));

const withExc: CalendarEvent = { ...daily, exceptions: { "2025-01-02": { deleted: true } } };
const occ5 = eventOccurrencesInRange(withExc, parseDate("2025-01-01"), parseDate("2025-01-10"));
check("例外删除 1/2 -> 剩2个(1/1,1/3)", occ5.length === 2, occ5.map(o => o.start.slice(0, 10)).join(","));

// --- ICS ---
const ics = [
  "BEGIN:VCALENDAR", "VERSION:2.0",
  "BEGIN:VEVENT", "UID:abc", "DTSTART:20250601T090000", "DTEND:20250601T100000",
  "SUMMARY:会议", "LOCATION:会议室A", "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE",
  "END:VEVENT", "END:VCALENDAR",
].join("\r\n");
const parsed = parseICS(ics, "c1");
check("ICS 解析 1 个事件", parsed.length === 1, String(parsed.length));
check("ICS 标题/地点", parsed[0]?.title === "会议" && parsed[0]?.location === "会议室A");
check("ICS 重复规则 custom 周一三", parsed[0]?.repeat?.freq === "custom" && parsed[0]?.repeat?.interval === 2 && parsed[0]?.repeat?.weekdays?.join(",") === "1,3", JSON.stringify(parsed[0]?.repeat));

// --- Markdown ---
const BT3 = "`" + "`" + "`";
const md = renderMarkdown("# 标题\n\n**加粗**\n\n" + BT3 + "js\nconst a = 1;\n" + BT3);
check("Markdown 渲染包含 h1", md.includes("<h1"));
check("Markdown 渲染包含代码块", md.includes("code-block") && md.includes("hljs"));
check("Markdown 处理含脚本内容不崩溃", typeof renderMarkdown("<script>alert(1)</script>") === "string");
const wc = countWords("今天是 # 好日子\n第二行");
check("字数统计 >0", wc.chars > 0, JSON.stringify(wc));

// --- 日期 ---
check("diffDays 2025-01-01 -> 2025-01-10 = 9", diffDays(parseDate("2025-01-10"), parseDate("2025-01-01")) === 9);
check("startOfWeek(周三,周一) = 周一", fmtDate(startOfWeek(parseDate("2025-01-08"), 1)) === "2025-01-06");
check("addDays 跨月", fmtDate(addDays(parseDate("2025-01-31"), 1)) === "2025-02-01");

console.log(failed === 0 ? "\nALL PASSED" : "\nFAILED: " + failed);
process.exit(failed === 0 ? 0 : 1);
