package com.smartday.app

import com.smartday.app.data.DiaryRules
import com.smartday.app.data.HolidayData
import com.smartday.app.data.LunarCalendar
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 安卓端原生数据层单元测试（纯 JVM，无需模拟器）。
 *
 * 覆盖验收点：
 *  - A-A8  农历简称：初一显月名，其余显日名，不拼接
 *  - A-4.3.5 班休角标：调休上班 / 法定放假
 *  - A-4.3.6 周末判定
 *  - A-A5  日记识别统一口径（DiaryRules）
 *
 * 与网页端 scripts/smoke-android.ts 的断言一一对应，确保网页端与安卓端口径一致。
 */
class DataLayerTest {

    // ============ A-A8 农历简称 ============

    @Test
    fun `正月初一显示月份名而非日名`() {
        // 2025-01-29 是乙巳年正月初一
        assertEquals("正月", HolidayData.getDayInfo(2025, 1, 29).lunarShort)
    }

    @Test
    fun `非初一显示日名`() {
        // 2025-02-01 是正月初四
        assertEquals("初四", HolidayData.getDayInfo(2025, 2, 1).lunarShort)
        // 2025-01-28 是腊月廿九
        assertEquals("廿九", HolidayData.getDayInfo(2025, 1, 28).lunarShort)
    }

    @Test
    fun `农历简称不含月日拼接`() {
        // 不应出现「八月十三」这类拼接形式（简称里不应同时含「月」和日名）
        val s = HolidayData.getDayInfo(2025, 8, 13).lunarShort
        assertFalse("农历简称不应拼接月与日: $s", Regex("月.*[初廿十]").containsMatchIn(s))
    }

    @Test
    fun `农历转换基本正确性`() {
        // 2025-10-06 为农历八月十五（中秋）
        val cal = LunarCalendar.solarToLunar(2025, 10, 6)
        assertEquals(8, cal.month)
        assertEquals(15, cal.day)
    }

    // ============ A-4.3.5 班休角标 ============

    @Test
    fun `调休上班日被标记为工作日`() {
        // 2025-09-28 为国庆调休上班日
        assertTrue("2025-09-28 应为调休上班", HolidayData.getDayInfo(2025, 9, 28).isWorkday)
    }

    @Test
    fun `法定假日被标记为放假`() {
        // 2025-10-01 国庆
        assertTrue("2025-10-01 应为法定假日", HolidayData.getDayInfo(2025, 10, 1).isHoliday)
    }

    // ============ A-4.3.6 周末判定 ============

    @Test
    fun `周六周日判定正确`() {
        // 2025-10-04 周六 / 2025-10-05 周日 / 2025-10-06 周一
        assertTrue(isWeekend(2025, 10, 4))
        assertTrue(isWeekend(2025, 10, 5))
        assertFalse(isWeekend(2025, 10, 6))
    }

    // ============ A-A5 日记识别统一口径 ============

    @Test
    fun `日记标签常量与网页端一致`() {
        assertEquals("日记", DiaryRules.DIARY_TAG)
    }

    @Test
    fun `带日记标签的笔记被识别为日记`() {
        assertTrue(DiaryRules.isDiaryNote(listOf("工作", "日记")))
        assertTrue(DiaryRules.isDiaryNote(listOf("日记")))
    }

    @Test
    fun `普通标签笔记不算日记`() {
        assertFalse(DiaryRules.isDiaryNote(listOf("工作", "生活")))
        assertFalse(DiaryRules.isDiaryNote(emptyList()))
        assertFalse(DiaryRules.isDiaryNote(null))
    }

    @Test
    fun `hasDiaryOn 传统日记与标签笔记都算日记`() {
        val diaryDates = listOf("2025-10-01")
        val noteDates = listOf("2025-10-02")
        assertTrue(DiaryRules.hasDiaryOn(diaryDates, noteDates, "2025-10-01"))
        assertTrue(DiaryRules.hasDiaryOn(diaryDates, noteDates, "2025-10-02"))
        assertFalse(DiaryRules.hasDiaryOn(diaryDates, noteDates, "2025-10-03"))
    }

    @Test
    fun `collectDiaryDates 合并两类来源`() {
        val set = DiaryRules.collectDiaryDates(listOf("2025-10-01"), listOf("2025-10-02", "2025-10-01"))
        assertEquals(2, set.size)
        assertTrue(set.contains("2025-10-01"))
        assertTrue(set.contains("2025-10-02"))
    }

    // ============ 辅助 ============

    /** 与网页端 `new Date(y, m-1, d).getDay()` 等价的周末判定（0=周日, 6=周六） */
    private fun isWeekend(year: Int, month: Int, day: Int): Boolean {
        val cal = java.util.Calendar.getInstance()
        cal.set(year, month - 1, day)
        val dow = cal.get(java.util.Calendar.DAY_OF_WEEK)
        return dow == java.util.Calendar.SATURDAY || dow == java.util.Calendar.SUNDAY
    }
}
