package com.smartday.app.data

/**
 * 日记识别统一口径（需求 A-4.4 / A-A5）
 *
 * 与网页端 `smartday-web/src/lib/diary.ts` 完全一致：
 * 某一天「有日记」= 传统日记记录里有该天 或 笔记中带「日记」标签且日期为该天。
 * 小组件 📝 标记、日历当天详情、概览当天汇总、连续写日记统计都必须走这里。
 *
 * Web 层推送到小组件的 month 数据里已带 `hasDiary` 字段；
 * 本对象供原生兜底渲染与将来本地校验使用，保证口径不漂移。
 */
object DiaryRules {

    /** 笔记的日记标签名（唯一真源） */
    const val DIARY_TAG = "日记"

    /** 该条笔记是否被标记为日记（带「日记」标签） */
    fun isDiaryNote(tags: List<String>?): Boolean = tags?.contains(DIARY_TAG) == true

    /** 某天是否有日记（传统日记 ∪ 带标签笔记） */
    fun hasDiaryOn(diaryDates: Collection<String>, noteDates: Collection<String>, date: String): Boolean {
        if (diaryDates.contains(date)) return true
        return noteDates.contains(date)
    }

    /** 收集「有日记」日期集合 */
    fun collectDiaryDates(diaryDates: Collection<String>, taggedNoteDates: Collection<String>): Set<String> {
        val s = HashSet<String>()
        s.addAll(diaryDates)
        s.addAll(taggedNoteDates.filter { it.isNotEmpty() })
        return s
    }
}
