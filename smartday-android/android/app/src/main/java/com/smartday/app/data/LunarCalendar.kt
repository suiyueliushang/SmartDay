package com.smartday.app.data

import java.util.Calendar

/**
 * 农历 / 节气 / 节日（1900-2100）
 *
 * 完整移植自网页端 `smartday-web/src/lib/lunar.ts`，保证小组件与 Web 端口径 100% 一致。
 * 小组件在 WebView 未就绪时也能独立渲染，不依赖 Web 层。
 */
object LunarCalendar {

    // 农历数据表：高 4 位 = 闰月月份（0 表示无闰月）；低 20 位每 4 位一组表示 1-12 月大小（1=30 天，0=29 天）
    // 下标 = 年份 - 1900
    private val lunarInfo = intArrayOf(
        0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
        0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
        0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
        0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
        0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
        0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
        0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
        0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
        0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
        0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
        0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
        0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
        0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
        0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
        0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
        0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
        0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
        0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
        0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
        0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
        0x0d520, // 2100
    )

    private val lunarMonthNames = arrayOf("正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊")
    private val lunarDayNames = arrayOf(
        "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
        "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
        "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
    )
    private val heavenlyStems = arrayOf("甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸")
    private val earthlyBranches = arrayOf("子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥")
    private val zodiacs = arrayOf("鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪")

    data class LunarDate(
        val year: Int,
        val month: Int, // 1-12（正月=1）
        val day: Int,
        val isLeap: Boolean,
        val yearName: String, // 如 甲辰
        val zodiac: String, // 生肖
        val monthName: String, // 如 正月 / 闰六月
        val dayName: String, // 初一
    )

    private fun leapMonth(y: Int): Int = lunarInfo[y - 1900] and 0xf

    private fun leapDays(y: Int): Int =
        if (leapMonth(y) != 0) (if ((lunarInfo[y - 1900] and 0x10000) != 0) 30 else 29) else 0

    private fun monthDays(y: Int, m: Int): Int =
        if ((lunarInfo[y - 1900] and (0x10000 shr m)) != 0) 30 else 29

    /** 农历 y 年总天数 */
    private fun lunarYearDays(y: Int): Int {
        var sum = 348
        var i = 0x8000
        while (i > 0x8) {
            if ((lunarInfo[y - 1900] and i) != 0) sum += 1
            i = i shr 1
        }
        return sum + leapDays(y)
    }

    private const val DAY_MS = 86400000L
    private const val BASE_OFFSET_DAYS = 0 // 1900-01-31 = 农历1900年正月初一

    /** 公历 -> 农历 */
    fun solarToLunar(sy: Int, sm: Int, sd: Int): LunarDate {
        val base = Calendar.getInstance().apply {
            clear(); set(1900, Calendar.JANUARY, 31)
        }.timeInMillis
        val target = Calendar.getInstance().apply {
            clear(); set(sy, sm - 1, sd)
        }.timeInMillis
        // 使用 Math.floor 保持与 JS Math.round 一致（两者在本场景下对整数日差等价）
        var offset = Math.floor((target - base).toDouble() / DAY_MS).toInt()
        var y = 1900
        while (offset >= 0) {
            val days = lunarYearDays(y)
            if (offset < days) break
            offset -= days
            y++
        }
        val lm = leapMonth(y)
        var isLeap = false
        var month = 1
        while (month <= 12) {
            var dm = monthDays(y, month)
            if (lm == month && offset >= dm) {
                isLeap = true
                offset -= dm
                dm = leapDays(y)
            }
            if (offset < dm) break
            offset -= dm
            month++
        }
        if (month > 12) month = 12
        val day = offset + 1
        val stemIdx = (y - 4) % 10
        val branchIdx = (y - 4) % 12
        return LunarDate(
            year = y,
            month = month,
            day = day,
            isLeap = isLeap,
            yearName = heavenlyStems[stemIdx] + earthlyBranches[branchIdx],
            zodiac = zodiacs[((y - 4) % 12 + 12) % 12],
            monthName = (if (isLeap) "闰" else "") + lunarMonthNames[month - 1] + "月",
            dayName = lunarDayNames[day - 1],
        )
    }

    // ---------------- 节气 ----------------
    private val sTermInfo = intArrayOf(
        0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551,
        218072, 240693, 263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210,
        440795, 462224, 483532, 504758,
    )
    val SOLAR_TERMS = arrayOf(
        "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满",
        "芒种", "夏至", "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降",
        "立冬", "小雪", "大雪", "冬至",
    )

    /** 返回节气在当月的日（1-31）。以 UTC 计算，与原 JS `Date.UTC` 口径一致 */
    fun solarTermDay(y: Int, n: Int): Int {
        val ms = 31556925974.7 * (y - 1900) + sTermInfo[n] * 60000.0 +
            utcMillis(1900, 0, 6, 2, 5)
        val cal = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply {
            timeInMillis = ms.toLong()
        }
        return cal.get(Calendar.DAY_OF_MONTH)
    }

    private fun utcMillis(y: Int, m: Int, d: Int, h: Int, min: Int): Long {
        val cal = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply {
            clear(); set(y, m, d, h, min)
        }
        return cal.timeInMillis
    }

    fun getSolarTerm(y: Int, m: Int, d: Int): String? {
        val idx = (m - 1) * 2
        for (i in 0 until 2) {
            if (solarTermDay(y, idx + i) == d) return SOLAR_TERMS[idx + i]
        }
        return null
    }

    // ---------------- 节日 ----------------
    private data class Festival(val m: Int, val d: Int, val name: String)

    private val lunarFestivals = listOf(
        Festival(1, 1, "春节"), Festival(1, 15, "元宵节"), Festival(2, 2, "龙抬头"),
        Festival(5, 5, "端午节"), Festival(7, 7, "七夕"), Festival(7, 15, "中元节"),
        Festival(8, 15, "中秋节"), Festival(9, 9, "重阳节"), Festival(12, 8, "腊八节"),
        Festival(12, 23, "小年"),
    )
    private val solarFestivals = listOf(
        Festival(1, 1, "元旦"), Festival(2, 14, "情人节"), Festival(3, 8, "妇女节"),
        Festival(3, 12, "植树节"), Festival(4, 1, "愚人节"), Festival(5, 1, "劳动节"),
        Festival(5, 4, "青年节"), Festival(6, 1, "儿童节"), Festival(7, 1, "建党节"),
        Festival(8, 1, "建军节"), Festival(9, 10, "教师节"), Festival(10, 1, "国庆节"),
        Festival(12, 24, "平安夜"), Festival(12, 25, "圣诞节"),
    )
    private data class WeekFestival(val m: Int, val week: Int, val dow: Int, val name: String)
    private val weekFestivals = listOf(
        WeekFestival(5, 2, 0, "母亲节"), // 5月第2个周日
        WeekFestival(6, 3, 0, "父亲节"), // 6月第3个周日
        WeekFestival(11, 4, 4, "感恩节"), // 11月第4个周四
    )

    data class DayExtra(
        val lunar: LunarDate,
        val lunarFestival: String?,
        val solarFestival: String?,
        val term: String?,
        val isHoliday: Boolean,
        val isWorkday: Boolean,
        val holidayName: String?,
    )

    private fun daysInMonth(y: Int, m: Int): Int {
        val cal = Calendar.getInstance().apply { clear(); set(y, m, 0) }
        return cal.get(Calendar.DAY_OF_MONTH)
    }

    /** 计算节日/节气（不含法定假日，法定假日见 HolidayData） */
    fun getDayExtra(y: Int, m: Int, d: Int): DayExtra {
        val lunar = solarToLunar(y, m, d)
        var lunarFestival: String? = null
        for (f in lunarFestivals) {
            if (lunar.month == f.m && lunar.day == f.d && !lunar.isLeap) lunarFestival = f.name
        }
        // 除夕：腊月最后一天
        if (lunar.month == 12) {
            val lastDay = monthDays(y, 12)
            if (lunar.day == lastDay) lunarFestival = "除夕"
        }
        var solarFestival: String? = null
        for (f in solarFestivals) {
            if (m == f.m && d == f.d) solarFestival = f.name
        }
        // 周计算节日
        val firstDay = Calendar.getInstance().apply { clear(); set(y, m - 1, 1) }.get(Calendar.DAY_OF_WEEK) - 1
        for (wf in weekFestivals) {
            if (m == wf.m) {
                val dayInMonth = (wf.week - 1) * 7 + ((wf.dow - firstDay + 7) % 7) + 1
                if (d == dayInMonth && dayInMonth <= daysInMonth(y, m)) {
                    solarFestival = solarFestival ?: wf.name
                }
            }
        }
        val term = getSolarTerm(y, m, d)
        return DayExtra(
            lunar = lunar,
            lunarFestival = lunarFestival,
            solarFestival = solarFestival,
            term = term,
            isHoliday = false,
            isWorkday = false,
            holidayName = null,
        )
    }
}
