package com.smartday.app.data

/**
 * 法定节假日与调休上班日（内置 2024-2026，可在设置中更新）
 *
 * 完整移植自网页端 `smartday-web/src/lib/holidays.ts`。
 * 来源：国务院办公厅节假日安排（2024/2025 官方；2026 为预估，待官方公布后更新）。
 */
object HolidayData {

    data class HolidayItem(
        val year: Int,
        val name: String, // 节日名
        val days: List<String>, // 放假日期 yyyy-MM-dd
        val makeup: List<String>, // 调休上班日 yyyy-MM-dd
    )

    val HOLIDAYS: List<HolidayItem> = listOf(
        HolidayItem(2024, "元旦", listOf("2023-12-30", "2023-12-31", "2024-01-01"), emptyList()),
        HolidayItem(
            2024, "春节",
            listOf("2024-02-10", "2024-02-11", "2024-02-12", "2024-02-13", "2024-02-14", "2024-02-15", "2024-02-16", "2024-02-17"),
            listOf("2024-02-04", "2024-02-18"),
        ),
        HolidayItem(2024, "清明节", listOf("2024-04-04", "2024-04-05", "2024-04-06"), listOf("2024-04-07")),
        HolidayItem(
            2024, "劳动节",
            listOf("2024-05-01", "2024-05-02", "2024-05-03", "2024-05-04", "2024-05-05"),
            listOf("2024-04-28", "2024-05-11"),
        ),
        HolidayItem(2024, "端午节", listOf("2024-06-08", "2024-06-09", "2024-06-10"), emptyList()),
        HolidayItem(2024, "中秋节", listOf("2024-09-15", "2024-09-16", "2024-09-17"), listOf("2024-09-14")),
        HolidayItem(
            2024, "国庆节",
            listOf("2024-10-01", "2024-10-02", "2024-10-03", "2024-10-04", "2024-10-05", "2024-10-06", "2024-10-07"),
            listOf("2024-09-29", "2024-10-12"),
        ),
        HolidayItem(2025, "元旦", listOf("2025-01-01"), emptyList()),
        HolidayItem(
            2025, "春节",
            listOf("2025-01-28", "2025-01-29", "2025-01-30", "2025-01-31", "2025-02-01", "2025-02-02", "2025-02-03", "2025-02-04"),
            listOf("2025-01-26", "2025-02-08"),
        ),
        HolidayItem(2025, "清明节", listOf("2025-04-04", "2025-04-05", "2025-04-06"), emptyList()),
        HolidayItem(
            2025, "劳动节",
            listOf("2025-05-01", "2025-05-02", "2025-05-03", "2025-05-04", "2025-05-05"),
            listOf("2025-04-27"),
        ),
        HolidayItem(2025, "端午节", listOf("2025-05-31", "2025-06-01", "2025-06-02"), emptyList()),
        HolidayItem(
            2025, "国庆节·中秋节",
            listOf("2025-10-01", "2025-10-02", "2025-10-03", "2025-10-04", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08"),
            listOf("2025-09-28", "2025-10-11"),
        ),
        // 2026（预估，待国务院官方公布后替换；除夕/春节按农历推算）
        HolidayItem(2026, "元旦", listOf("2026-01-01", "2026-01-02", "2026-01-03"), listOf("2026-01-04")),
        HolidayItem(
            2026, "春节",
            listOf("2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23"),
            listOf("2026-02-14", "2026-02-28"),
        ),
        HolidayItem(2026, "清明节", listOf("2026-04-04", "2026-04-05", "2026-04-06"), emptyList()),
        HolidayItem(
            2026, "劳动节",
            listOf("2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05"),
            listOf("2026-04-26"),
        ),
        HolidayItem(2026, "端午节", listOf("2026-06-19", "2026-06-20", "2026-06-21"), emptyList()),
        HolidayItem(2026, "中秋节", listOf("2026-09-25", "2026-09-26", "2026-09-27"), listOf("2026-09-27")),
        HolidayItem(
            2026, "国庆节",
            listOf("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"),
            listOf("2026-10-10"),
        ),
    )

    private val holidayMap = HashMap<String, String>()
    private val makeupMap = HashSet<String>()

    init {
        for (item in HOLIDAYS) {
            for (d in item.days) holidayMap[d] = item.name
            for (d in item.makeup) makeupMap.add(d)
        }
    }

    data class HolidayInfo(val isHoliday: Boolean, val isWorkday: Boolean, val name: String?)

    /** 查询某天是否为法定假日 / 调休上班日 */
    fun getHolidayInfo(dateStr: String): HolidayInfo {
        val h = holidayMap[dateStr]
        if (h != null) return HolidayInfo(true, false, h)
        if (makeupMap.contains(dateStr)) return HolidayInfo(false, true, null)
        return HolidayInfo(false, false, null)
    }

    /**
     * 汇总某天全部展示信息（农历 + 节日 + 节气 + 法定假日）
     * 对齐网页端 getDayInfo。
     */
    data class DayInfo(
        /** 完整农历（如「八月十三」） */
        val lunarText: String,
        /** 简称：初一显示月份名（如「八月」），其余只显示日名（如「廿九」） */
        val lunarShort: String,
        val lunarFestival: String?,
        val solarFestival: String?,
        val term: String?,
        val isHoliday: Boolean,
        val isWorkday: Boolean,
        val holidayName: String?,
        /** 当天显示的节日/节气名（法定假日 > 农历节日 > 公历节日 > 节气） */
        val festivalText: String?,
    )

    fun getDayInfo(y: Int, m: Int, d: Int): DayInfo {
        val extra = LunarCalendar.getDayExtra(y, m, d)
        val dateStr = y.toString() + "-" + pad2(m) + "-" + pad2(d)
        val hol = getHolidayInfo(dateStr)
        val festivalText = if (hol.isHoliday) hol.name
        else extra.lunarFestival ?: extra.solarFestival ?: extra.term
        val lunarText = extra.lunar.monthName + extra.lunar.dayName
        // 农历简称：初一显示月份（如「八月」），其余只显示日名（如「廿九」）
        val lunarShort = if (extra.lunar.day == 1) extra.lunar.monthName else extra.lunar.dayName
        return DayInfo(
            lunarText = lunarText,
            lunarShort = lunarShort,
            lunarFestival = extra.lunarFestival,
            solarFestival = extra.solarFestival,
            term = extra.term,
            isHoliday = hol.isHoliday,
            isWorkday = hol.isWorkday,
            holidayName = if (hol.isHoliday) hol.name else null,
            festivalText = festivalText,
        )
    }

    fun pad2(n: Int): String = if (n < 10) "0$n" else n.toString()
}
