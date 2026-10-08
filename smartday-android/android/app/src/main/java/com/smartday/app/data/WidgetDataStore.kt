package com.smartday.app.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * 小组件数据缓存（SharedPreferences）
 *
 * WebView 通过 SmartDayBridge 把算好的小组件数据（JSON）推到这里；
 * 小组件 Provider 渲染时直接读缓存，做到「零计算」——农历/节日/日记口径全部由 Web 层算好。
 * 若缓存缺失（如刚开机、应用从未打开过），Provider 会用 LunarCalendar/HolidayData 兜底渲染。
 */
class WidgetDataStore(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // ---------------- 今日日程（4×2） ----------------
    fun saveToday(data: JSONObject) {
        prefs.edit().putString(KEY_TODAY, data.toString()).apply()
    }

    fun loadToday(): JSONObject? = readJson(KEY_TODAY)

    // ---------------- 月历（4×3） ----------------
    fun saveMonth(data: JSONObject) {
        prefs.edit().putString(KEY_MONTH, data.toString()).apply()
    }

    fun loadMonth(): JSONObject? = readJson(KEY_MONTH)

    /** 记忆「查看的月份」（小组件切月后沿用，A-4.7） */
    fun saveViewMonth(year: Int, month: Int) {
        prefs.edit().putInt(KEY_VIEW_YEAR, year).putInt(KEY_VIEW_MONTH, month).apply()
    }

    fun loadViewYear(): Int = prefs.getInt(KEY_VIEW_YEAR, 0)

    fun loadViewMonth(): Int = prefs.getInt(KEY_VIEW_MONTH, 0)

    private fun readJson(key: String): JSONObject? {
        val raw = prefs.getString(key, null) ?: return null
        return try {
            JSONObject(raw)
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        private const val PREFS = "smartday_widget"
        private const val KEY_TODAY = "today_json"
        private const val KEY_MONTH = "month_json"
        private const val KEY_VIEW_YEAR = "view_year"
        private const val KEY_VIEW_MONTH = "view_month"

        // ---------------- 便捷解析 ----------------

        /** 解析今日日程中的日程列表 */
        fun parseSchedules(today: JSONObject?): List<ScheduleItem> {
            if (today == null) return emptyList()
            val arr: JSONArray = today.optJSONArray("schedules") ?: return emptyList()
            val out = ArrayList<ScheduleItem>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                out.add(
                    ScheduleItem(
                        title = o.optString("title", ""),
                        time = o.optString("time", ""),
                        color = o.optString("color", "#3F5FE0"),
                        allDay = o.optBoolean("allDay", false),
                    )
                )
            }
            return out
        }

        /** 解析月历单元格列表 */
        fun parseMonthCells(month: JSONObject?): List<MonthCell> {
            if (month == null) return emptyList()
            val arr: JSONArray = month.optJSONArray("days") ?: return emptyList()
            val out = ArrayList<MonthCell>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                out.add(
                    MonthCell(
                        dayOfMonth = o.optInt("dayOfMonth", 0),
                        solarLabel = o.optString("solarLabel", ""),
                        lunarLabel = o.optString("lunarLabel", ""),
                        festival = o.optString("festival", ""),
                        isWorkday = o.optBoolean("isWorkday", false),
                        isRestDay = o.optBoolean("isRestDay", false),
                        isWeekend = o.optBoolean("isWeekend", false),
                        isToday = o.optBoolean("isToday", false),
                        hasDiary = o.optBoolean("hasDiary", false),
                    )
                )
            }
            return out
        }
    }

    data class ScheduleItem(
        val title: String,
        val time: String,
        val color: String,
        val allDay: Boolean,
    )

    data class MonthCell(
        val dayOfMonth: Int, // 0 = 前后月空白占位
        val solarLabel: String,
        val lunarLabel: String,
        val festival: String,
        val isWorkday: Boolean, // 调休上班 → 橙色「班」
        val isRestDay: Boolean, // 工作日放假 → 红色「休」
        val isWeekend: Boolean,
        val isToday: Boolean,
        val hasDiary: Boolean,
    )
}
