package com.smartday.app.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.smartday.app.R
import com.smartday.app.data.WidgetDataStore

/**
 * 今日日程列表数据源（RemoteViewsService）
 * 让 4×2 小组件内的日程列表可滚动（超出 4 条也能滑）。
 */
class TodayWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        TodayViewsFactory(applicationContext)
}

class TodayViewsFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    private var items: List<WidgetDataStore.ScheduleItem> = emptyList()

    override fun onCreate() {
        load()
    }

    override fun onDataSetChanged() {
        load()
    }

    private fun load() {
        val today = WidgetDataStore(context).loadToday()
        // 最多展示 4 条主要日程（A-4.2），其余可通过滚动查看
        items = WidgetDataStore.parseSchedules(today)
    }

    override fun onDestroy() {
        items = emptyList()
    }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_schedule_item)
        if (position !in items.indices) return views
        val it = items[position]
        views.setTextViewText(R.id.item_time, it.time)
        views.setTextViewText(R.id.item_title, it.title)
        views.setInt(R.id.item_color, "setBackgroundColor", parseColor(it.color))

        // 点击条目 → 打开应用（填充模板 Intent 的 route）
        val fill = Intent().apply {
            putExtra("smartday_route", "#/overview")
            putExtra("smartday_title", it.title)
        }
        views.setOnClickFillInIntent(R.id.item_title, fill)
        views.setOnClickFillInIntent(R.id.item_time, fill)
        return views
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = false

    private fun parseColor(hex: String): Int {
        return try {
            if (hex.startsWith("#")) {
                val h = hex.removePrefix("#")
                when (h.length) {
                    6 -> (0xFF000000.toInt()) or h.toLong(16).toInt()
                    8 -> h.toLong(16).toInt()
                    else -> 0xFF3F5FE0.toInt()
                }
            } else {
                0xFF3F5FE0.toInt()
            }
        } catch (e: Exception) {
            0xFF3F5FE0.toInt()
        }
    }
}
