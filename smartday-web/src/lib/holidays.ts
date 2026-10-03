// ============================================================
// 法定节假日与调休上班日（内置 2024-2026，可在设置中更新）
// 来源：国务院办公厅节假日安排（2024/2025 官方；2026 为预估，待官方公布后更新）
// ============================================================

export interface HolidayItem {
  year: number;
  name: string; // 节日名
  days: string[]; // 放假日期 yyyy-MM-dd
  makeup: string[]; // 调休上班日 yyyy-MM-dd
}

export const HOLIDAYS: HolidayItem[] = [
  {
    year: 2024, name: "元旦", days: ["2023-12-30", "2023-12-31", "2024-01-01"], makeup: [],
  },
  {
    year: 2024, name: "春节", days: ["2024-02-10", "2024-02-11", "2024-02-12", "2024-02-13", "2024-02-14", "2024-02-15", "2024-02-16", "2024-02-17"], makeup: ["2024-02-04", "2024-02-18"],
  },
  {
    year: 2024, name: "清明节", days: ["2024-04-04", "2024-04-05", "2024-04-06"], makeup: ["2024-04-07"],
  },
  {
    year: 2024, name: "劳动节", days: ["2024-05-01", "2024-05-02", "2024-05-03", "2024-05-04", "2024-05-05"], makeup: ["2024-04-28", "2024-05-11"],
  },
  {
    year: 2024, name: "端午节", days: ["2024-06-08", "2024-06-09", "2024-06-10"], makeup: [],
  },
  {
    year: 2024, name: "中秋节", days: ["2024-09-15", "2024-09-16", "2024-09-17"], makeup: ["2024-09-14"],
  },
  {
    year: 2024, name: "国庆节", days: ["2024-10-01", "2024-10-02", "2024-10-03", "2024-10-04", "2024-10-05", "2024-10-06", "2024-10-07"], makeup: ["2024-09-29", "2024-10-12"],
  },
  {
    year: 2025, name: "元旦", days: ["2025-01-01"], makeup: [],
  },
  {
    year: 2025, name: "春节", days: ["2025-01-28", "2025-01-29", "2025-01-30", "2025-01-31", "2025-02-01", "2025-02-02", "2025-02-03", "2025-02-04"], makeup: ["2025-01-26", "2025-02-08"],
  },
  {
    year: 2025, name: "清明节", days: ["2025-04-04", "2025-04-05", "2025-04-06"], makeup: [],
  },
  {
    year: 2025, name: "劳动节", days: ["2025-05-01", "2025-05-02", "2025-05-03", "2025-05-04", "2025-05-05"], makeup: ["2025-04-27"],
  },
  {
    year: 2025, name: "端午节", days: ["2025-05-31", "2025-06-01", "2025-06-02"], makeup: [],
  },
  {
    year: 2025, name: "国庆节·中秋节", days: ["2025-10-01", "2025-10-02", "2025-10-03", "2025-10-04", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08"], makeup: ["2025-09-28", "2025-10-11"],
  },
  // 2026（预估，待国务院官方公布后替换；除夕/春节按农历推算）
  {
    year: 2026, name: "元旦", days: ["2026-01-01", "2026-01-02", "2026-01-03"], makeup: ["2026-01-04"],
  },
  {
    year: 2026, name: "春节", days: ["2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23"], makeup: ["2026-02-14", "2026-02-28"],
  },
  {
    year: 2026, name: "清明节", days: ["2026-04-04", "2026-04-05", "2026-04-06"], makeup: [],
  },
  {
    year: 2026, name: "劳动节", days: ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05"], makeup: ["2026-04-26"],
  },
  {
    year: 2026, name: "端午节", days: ["2026-06-19", "2026-06-20", "2026-06-21"], makeup: [],
  },
  {
    year: 2026, name: "中秋节", days: ["2026-09-25", "2026-09-26", "2026-09-27"], makeup: ["2026-09-27"],
  },
  {
    year: 2026, name: "国庆节", days: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"], makeup: ["2026-10-10"],
  },
];

/** 按年查询节假日安排 */
export function getHolidaysByYear(year: number): HolidayItem[] {
  return HOLIDAYS.filter((h) => h.year === year);
}

export interface HolidayInfo {
  isHoliday: boolean;
  isWorkday: boolean; // 调休上班
  name?: string;
}

const holidayMap = new Map<string, { name: string }>();
const makeupMap = new Map<string, boolean>();
for (const item of HOLIDAYS) {
  for (const d of item.days) holidayMap.set(d, { name: item.name });
  for (const d of item.makeup) makeupMap.set(d, true);
}

/** 查询某天是否为法定假日 / 调休上班日 */
export function getHolidayInfo(dateStr: string): HolidayInfo {
  const h = holidayMap.get(dateStr);
  if (h) return { isHoliday: true, isWorkday: false, name: h.name };
  if (makeupMap.has(dateStr)) return { isHoliday: false, isWorkday: true };
  return { isHoliday: false, isWorkday: false };
}

export interface DayExtraWithHoliday {
  /** 完整农历（如「八月十三」），用于表头等需要完整信息处 */
  lunarText: string;
  /** 简称：农历初一显示月份名（如「八月」「闰六月」），其余只显示日名（如「廿九」） */
  lunarShort: string;
  lunarFestival?: string;
  solarFestival?: string;
  term?: string;
  isHoliday: boolean;
  isWorkday: boolean;
  holidayName?: string;
  /** 当天显示的节日/节气名（法定假日 > 农历节日 > 公历节日 > 节气） */
  festivalText?: string;
}

import { getDayExtra } from "./lunar";

/** 汇总某天全部展示信息（农历 + 节日 + 节气 + 法定假日） */
export function getDayInfo(y: number, m: number, d: number): DayExtraWithHoliday {
  const extra = getDayExtra(y, m, d);
  const hol = getHolidayInfo(y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"));
  // 法定假日名优先显示；其次农历节日；再次公历节日；再节气
  const festivalText = hol.isHoliday ? hol.name : extra.lunarFestival ?? extra.solarFestival ?? extra.term;
  const lunarText = extra.lunar.monthName + extra.lunar.dayName;
  // 农历简称：初一显示月份（如「八月」），其余只显示日名（如「廿九」）
  const lunarShort = extra.lunar.day === 1 ? extra.lunar.monthName : extra.lunar.dayName;
  return {
    lunarText,
    lunarShort,
    lunarFestival: extra.lunarFestival,
    solarFestival: extra.solarFestival,
    term: extra.term,
    isHoliday: hol.isHoliday,
    isWorkday: hol.isWorkday,
    holidayName: hol.isHoliday ? hol.name : undefined,
    festivalText,
  };
}
