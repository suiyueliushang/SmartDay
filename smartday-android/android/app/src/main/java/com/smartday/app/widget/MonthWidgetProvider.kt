package com.smartday.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.widget.RemoteViews
import com.smartday.app.MainActivity
import com.smartday.app.R
import com.smartday.app.data.HolidayData
import com.smartday.app.data.WidgetDataStore
import java.util.Calendar

/**
 * 月历小组件（4×3）A-4.2 / A-4.3
 *
 * 单元格规则（对齐桌面端 D-4 与网页端 W-2.7）：
 *  - 只显示本月日期，前后月留空白占位；行数按本月实际周数自适应（5/6 行）
 *  - 每格「阳历日号 + 农历简称 + 节日/节气」同一行，空间不足截断
 *  - 农历简称：初一显月名，其余显日名
 *  - 调休上班标橙「班」、工作日放假标红「休」；周末本身不标「休」
 *  - 周六周日两列着色，表头周六日文字标红
 *  - 今天高亮底色；写过日记带 📝
 *  - 切月（‹ ›）、点标题回到今天、查看月份被记忆
 */
class MonthWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) render(context, mgr, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_PREV -> shiftMonth(context, -1)
            ACTION_NEXT -> shiftMonth(context, 1)
            ACTION_TODAY -> resetToToday(context)
            ACTION_REFRESH -> refreshAll(context)
        }
    }

    companion object {
        const val ACTION_PREV = "com.smartday.app.WIDGET_MONTH_PREV"
        const val ACTION_NEXT = "com.smartday.app.WIDGET_MONTH_NEXT"
        const val ACTION_TODAY = "com.smartday.app.WIDGET_MONTH_TODAY"
        const val ACTION_REFRESH = "com.smartday.app.WIDGET_MONTH_REFRESH"

        private const val COLS = 7
        private const val MAX_ROWS = 6

        fun refreshAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val cn = ComponentName(context, MonthWidgetProvider::class.java)
            for (id in mgr.getAppWidgetIds(cn)) render(context, mgr, id)
        }

        /** 切月：改查看月份并重绘（A-4.7 记忆查看月份） */
        private fun shiftMonth(context: Context, delta: Int) {
            val store = WidgetDataStore(context)
            val (curY, curM) = currentViewMonth(store)
            var y = curY
            var m = curM + delta
            if (m < 1) { m = 12; y -= 1 }
            if (m > 12) { m = 1; y += 1 }
            store.saveViewMonth(y, m)
            pushRequestToWeb(context, y, m)
            refreshAll(context)
        }

        private fun resetToToday(context: Context) {
            val cal = Calendar.getInstance()
            val y = cal.get(Calendar.YEAR)
            val m = cal.get(Calendar.MONTH) + 1
            WidgetDataStore(context).saveViewMonth(y, m)
            pushRequestToWeb(context, y, m)
            refreshAll(context)
        }

        /** 切月时通知 Web 层生成该月数据（Web 层收到后回推 updateMonthWidget） */
        private fun pushRequestToWeb(context: Context, year: Int, month: Int) {
            // 本地兜底：立刻用原生农历生成一份该月数据，避免等待 WebView 唤醒
            val fallback = buildMonthJsonFromNative(context, year, month)
            WidgetDataStore(context).saveMonth(fallback)
            // 同时尝试打开应用让 Web 层补推（静默，不弹界面优先用缓存渲染）
        }

        private fun currentViewMonth(store: WidgetDataStore): Pair<Int, Int> {
            val y = store.loadViewYear()
            val m = store.loadViewMonth()
            if (y > 0 && m in 1..12) return Pair(y, m)
            val cal = Calendar.getInstance()
            return Pair(cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1)
        }

        fun render(context: Context, mgr: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_month)
            val store = WidgetDataStore(context)
            val (viewY, viewM) = currentViewMonth(store)

            // 优先用 Web 推送的缓存（口径一致）；若缓存月份与查看月份不符，用原生兜底重建
            var monthJson = store.loadMonth()
            val cachedY = monthJson?.optInt("year", 0) ?: 0
            val cachedM = monthJson?.optInt("month", 0) ?: 0
            if (monthJson == null || cachedY != viewY || cachedM != viewM) {
                monthJson = buildMonthJsonFromNative(context, viewY, viewM)
            }

            // 标题 + 头部按钮
            views.setTextViewText(R.id.month_title, "${viewY}年${viewM}月")
            views.setOnClickPendingIntent(R.id.month_prev, broadcast(context, ACTION_PREV, 10))
            views.setOnClickPendingIntent(R.id.month_next, broadcast(context, ACTION_NEXT, 11))
            views.setOnClickPendingIntent(R.id.month_title, broadcast(context, ACTION_TODAY, 12))

            // 单元格
            val cells = WidgetDataStore.parseMonthCells(monthJson)
            views.removeAllViews(R.id.month_grid)

            if (cells.isEmpty()) {
                mgr.updateAppWidget(widgetId, views)
                return
            }

            val rows = (cells.size + COLS - 1) / COLS
            for (i in 0 until rows * COLS) {
                val cell = if (i < cells.size) cells[i] else null
                val cellView = RemoteViews(context.packageName, R.layout.widget_month_cell)
                renderCell(context, cellView, cell, widgetId, i, viewY, viewM)
                views.addView(R.id.month_grid, cellView)
            }

            mgr.updateAppWidget(widgetId, views)
        }

        private fun renderCell(
            context: Context,
            cellView: RemoteViews,
            cell: WidgetDataStore.MonthCell?,
            widgetId: Int,
            index: Int,
            viewYear: Int,
            viewMonth: Int,
        ) {
            val col = index % COLS
            val isWeekend = col == 0 || col == 6

            if (cell == null || cell.dayOfMonth == 0) {
                // 前后月空白占位：不显示数字/农历/事件（A-4.3.1）
                cellView.setViewVisibility(R.id.cell_solar, View.INVISIBLE)
                cellView.setViewVisibility(R.id.cell_lunar, View.INVISIBLE)
                cellView.setViewVisibility(R.id.cell_festival, View.GONE)
                cellView.setViewVisibility(R.id.cell_badge, View.GONE)
                cellView.setViewVisibility(R.id.cell_diary, View.GONE)
                cellView.setInt(R.id.cell_root, "setBackgroundResource", android.R.color.transparent)
                return
            }

            // 阳历日号
            cellView.setViewVisibility(R.id.cell_solar, View.VISIBLE)
            cellView.setTextViewText(R.id.cell_solar, cell.solarLabel)
            cellView.setTextColor(
                R.id.cell_solar,
                if (cell.isToday) Color.WHITE else if (isWeekend) 0xFFD93025.toInt() else 0xFF1F2A44.toInt()
            )

            // 农历简称
            cellView.setViewVisibility(R.id.cell_lunar, View.VISIBLE)
            cellView.setTextViewText(R.id.cell_lunar, cell.lunarLabel)
            cellView.setTextColor(
                R.id.cell_lunar,
                if (cell.isToday) 0xE6FFFFFF.toInt() else 0xFF7A879E.toInt()
            )

            // 节日 / 节气（同一行，截断）
            if (cell.festival.isNotEmpty()) {
                cellView.setViewVisibility(R.id.cell_festival, View.VISIBLE)
                cellView.setTextViewText(R.id.cell_festival, cell.festival)
                cellView.setTextColor(
                    R.id.cell_festival,
                    if (cell.isToday) 0xFFFFF3B0.toInt() else 0xFFD93025.toInt()
                )
            } else {
                cellView.setViewVisibility(R.id.cell_festival, View.GONE)
            }

            // 班 / 休 角标（周末本身不标休）
            if (cell.isWorkday) {
                cellView.setViewVisibility(R.id.cell_badge, View.VISIBLE)
                cellView.setTextViewText(R.id.cell_badge, "班")
                cellView.setInt(R.id.cell_badge, "setBackgroundResource", R.drawable.badge_work)
            } else if (cell.isRestDay) {
                cellView.setViewVisibility(R.id.cell_badge, View.VISIBLE)
                cellView.setTextViewText(R.id.cell_badge, "休")
                cellView.setInt(R.id.cell_badge, "setBackgroundResource", R.drawable.badge_rest)
            } else {
                cellView.setViewVisibility(R.id.cell_badge, View.GONE)
            }

            // 📝 日记标记
            cellView.setViewVisibility(R.id.cell_diary, if (cell.hasDiary) View.VISIBLE else View.GONE)

            // 底色：今天 > 周末 > 平日
            val bg = when {
                cell.isToday -> R.drawable.cell_today
                isWeekend -> R.drawable.cell_weekend
                else -> R.drawable.cell_normal
            }
            cellView.setInt(R.id.cell_root, "setBackgroundResource", bg)

            // 点击日期格 → 打开应用对应日期（A-4.3.9 / A-A11）
            val dateStr = String.format("%04d-%02d-%02d", viewYear, viewMonth, cell.dayOfMonth)
            val dayIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("smartday_route", "#/calendar/date:$dateStr")
            }
            val pi = PendingIntent.getActivity(
                context, 3000 + widgetId * 100 + index, dayIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            cellView.setOnClickPendingIntent(R.id.cell_root, pi)
        }

        /** 用原生农历/节假日生成某月数据（兜底口径与 Web 完全一致） */
        fun buildMonthJsonFromNative(context: Context, year: Int, month: Int): org.json.JSONObject {
            val diaryDates = loadDiaryDates(context)
            val firstDayOfWeek = firstDow(year, month)
            val totalDays = daysInMonth(year, month)
            val todayStr = todayString()
            val arr = org.json.JSONArray()

            for (i in 0 until firstDayOfWeek) {
                arr.put(emptyCell())
            }
            for (d in 1..totalDays) {
                val info = HolidayData.getDayInfo(year, month, d)
                val dow = dowOf(year, month, d)
                val dateStr = String.format("%04d-%02d-%02d", year, month, d)
                val o = org.json.JSONObject()
                o.put("dayOfMonth", d)
                o.put("solarLabel", d.toString())
                o.put("lunarLabel", info.lunarShort)
                o.put("festival", info.festivalText ?: "")
                o.put("isWorkday", info.isWorkday)
                o.put("isRestDay", info.isHoliday && dow != 0 && dow != 6)
                o.put("isWeekend", dow == 0 || dow == 6)
                o.put("isToday", dateStr == todayStr)
                o.put("hasDiary", diaryDates.contains(dateStr))
                arr.put(o)
            }
            while (arr.length() % 7 != 0) {
                arr.put(emptyCell())
            }

            val root = org.json.JSONObject()
            root.put("year", year)
            root.put("month", month)
            root.put("title", "${year}年${month}月")
            root.put("firstDayOfWeek", firstDayOfWeek)
            root.put("days", arr)
            return root
        }

        private fun emptyCell(): org.json.JSONObject = org.json.JSONObject().apply {
            put("dayOfMonth", 0)
            put("solarLabel", "")
            put("lunarLabel", "")
            put("festival", "")
            put("isWorkday", false)
            put("isRestDay", false)
            put("isWeekend", false)
            put("isToday", false)
            put("hasDiary", false)
        }

        /** 原生兜底时读取本地日记日期（由 Web 层推送缓存，见 WidgetDataStore） */
        private fun loadDiaryDates(context: Context): Set<String> {
            val prefs = context.getSharedPreferences("smartday_diary", Context.MODE_PRIVATE)
            val raw = prefs.getStringSet("dates", emptySet()) ?: emptySet()
            return raw
        }

        private fun broadcast(context: Context, action: String, reqCode: Int): PendingIntent {
            val intent = Intent(context, MonthWidgetProvider::class.java).apply { this.action = action }
            return PendingIntent.getBroadcast(
                context, reqCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        // ---- 日期工具 ----
        private fun firstDow(y: Int, m: Int): Int =
            Calendar.getInstance().apply { clear(); set(y, m - 1, 1) }.get(Calendar.DAY_OF_WEEK) - 1

        private fun dowOf(y: Int, m: Int, d: Int): Int =
            Calendar.getInstance().apply { clear(); set(y, m - 1, d) }.get(Calendar.DAY_OF_WEEK) - 1

        private fun daysInMonth(y: Int, m: Int): Int =
            Calendar.getInstance().apply { clear(); set(y, m, 0) }.get(Calendar.DAY_OF_MONTH)

        private fun todayString(): String {
            val c = Calendar.getInstance()
            return String.format("%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
        }
    }
}
