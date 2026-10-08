package com.smartday.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.smartday.app.MainActivity
import com.smartday.app.R
import com.smartday.app.data.WidgetDataStore
import com.smartday.app.data.HolidayData
import java.util.Calendar

/**
 * 今日日程小组件（4×2）A-4.2 / A-4.3.9
 *
 * 内容：日期 + 农历 + 当天前 4 条日程 + 任务完成数。
 * 数据来源：Web 层推送的缓存（WidgetDataStore）；缓存缺失时用原生 LunarCalendar 兜底。
 * 点击：头部 → 打开「今天」页；日程条目 → 打开对应日期。
 */
class CalendarWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) render(context, mgr, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            refreshAll(context)
        }
    }

    companion object {
        const val ACTION_REFRESH = "com.smartday.app.WIDGET_TODAY_REFRESH"

        /** 刷新所有今日小组件实例（供桥接/数据变更调用） */
        fun refreshAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val cn = ComponentName(context, CalendarWidgetProvider::class.java)
            val ids = mgr.getAppWidgetIds(cn)
            for (id in ids) render(context, mgr, id)
        }

        fun render(context: Context, mgr: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_today)
            val store = WidgetDataStore(context)
            val today = store.loadToday()

            // ---- 日期 / 农历 ----
            val dateLabel: String
            val lunarLabel: String
            if (today != null && today.optString("dateLabel").isNotEmpty()) {
                dateLabel = today.optString("dateLabel")
                lunarLabel = today.optString("lunarLabel")
            } else {
                // 兜底：用原生农历计算
                val cal = Calendar.getInstance()
                val y = cal.get(Calendar.YEAR)
                val m = cal.get(Calendar.MONTH) + 1
                val d = cal.get(Calendar.DAY_OF_MONTH)
                val info = HolidayData.getDayInfo(y, m, d)
                val wd = arrayOf("周日", "周一", "周二", "周三", "周四", "周五", "周六")[cal.get(Calendar.DAY_OF_WEEK) - 1]
                dateLabel = "${m}月${d}日 $wd"
                lunarLabel = "农历" + info.lunarText
            }
            views.setTextViewText(R.id.today_date, dateLabel)
            views.setTextViewText(R.id.today_lunar, lunarLabel)

            // ---- 任务完成数 ----
            val taskTotal = today?.optInt("taskTotal", 0) ?: 0
            val taskDone = today?.optInt("taskDone", 0) ?: 0
            if (taskTotal > 0) {
                views.setViewVisibility(R.id.today_task_summary, android.view.View.VISIBLE)
                views.setTextViewText(R.id.today_task_summary, "任务 $taskDone/$taskTotal")
            } else {
                views.setViewVisibility(R.id.today_task_summary, android.view.View.GONE)
            }

            // ---- 日程列表（RemoteViewsService） ----
            val schedules = WidgetDataStore.parseSchedules(today)
            if (schedules.isEmpty()) {
                views.setViewVisibility(R.id.today_list, android.view.View.GONE)
                views.setViewVisibility(R.id.today_empty, android.view.View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.today_list, android.view.View.VISIBLE)
                views.setViewVisibility(R.id.today_empty, android.view.View.GONE)
                val listIntent = Intent(context, TodayWidgetService::class.java).apply {
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                    data = Uri.parse(toUri("todaylist://$widgetId"))
                }
                views.setRemoteAdapter(R.id.today_list, listIntent)
                // 点条目 → 打开应用（交给 Web 层路由到当天详情）
                val itemIntent = Intent(context, MainActivity::class.java).apply {
                    putExtra("smartday_route", "#/overview")
                }
                val itemPi = PendingIntent.getActivity(
                    context, 1000 + widgetId, itemIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )
                views.setPendingIntentTemplate(R.id.today_list, itemPi)
            }

            // ---- 点击头部 → 打开「今天」页 ----
            val headIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("smartday_route", "#/overview")
            }
            val headPi = PendingIntent.getActivity(
                context, 2000 + widgetId, headIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.today_header, headPi)

            mgr.updateAppWidget(widgetId, views)
            mgr.notifyAppWidgetViewDataChanged(widgetId, R.id.today_list)
        }

        private fun toUri(s: String) = s
    }
}
