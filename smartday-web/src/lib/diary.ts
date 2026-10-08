// ============================================================
// 日记口径统一（需求 W-1.4 / W-2.8 / W-4.2）
// 规则：某一天「有日记」= 传统日记记录里有该天 **或** 笔记中带「日记」标签且日期为该天。
// 迷你日历、月视图格子、概览当天汇总、连续写日记统计、侧栏笔记徽标、日历当天详情
// 必须全部走这里的函数，避免各处口径漂移。
// ============================================================
import { Diary, Note } from "@/types";

/** 笔记的日记标签名（唯一真源） */
export const DIARY_TAG = "日记";

/** 该笔记是否被标记为日记（带「日记」标签） */
export function isDiaryNote(n: Pick<Note, "tags">): boolean {
  return (n.tags ?? []).includes(DIARY_TAG);
}

/** 某天是否有日记（传统日记 ∪ 带标签笔记） */
export function hasDiaryOn(diaries: Diary[], notes: Note[], date: string): boolean {
  if (diaries.some((d) => d.date === date)) return true;
  return notes.some((n) => isDiaryNote(n) && n.date === date);
}

/** 收集一组日期内的「有日记」日期集合 */
export function collectDiaryDates(diaries: Diary[], notes: Note[]): Set<string> {
  const s = new Set<string>();
  for (const d of diaries) s.add(d.date);
  for (const n of notes) if (isDiaryNote(n) && n.date) s.add(n.date);
  return s;
}

/** 取某天的日记条目：优先带「日记」标签的笔记，其次传统日记记录 */
export function diaryEntryFor(
  diaries: Diary[],
  notes: Note[],
  date: string
): { kind: "note"; note: Note } | { kind: "diary"; diary: Diary } | null {
  const note = notes.find((n) => isDiaryNote(n) && n.date === date);
  if (note) return { kind: "note", note };
  const diary = diaries.find((d) => d.date === date);
  if (diary) return { kind: "diary", diary };
  return null;
}

/** 连续写日记天数（从指定日期往回数） */
export function diaryStreak(
  diaries: Diary[],
  notes: Note[],
  from: Date,
  fmt: (d: Date) => string,
  addDays: (d: Date, n: number) => Date
): number {
  let count = 0;
  let d = from;
  while (hasDiaryOn(diaries, notes, fmt(d))) {
    count++;
    d = addDays(d, -1);
  }
  return count;
}