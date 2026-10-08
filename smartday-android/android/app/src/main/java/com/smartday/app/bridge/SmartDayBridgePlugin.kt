package com.smartday.app.bridge

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.smartday.app.data.WidgetDataStore
import com.smartday.app.focus.FocusForegroundService
import com.smartday.app.notify.NotifyManager
import com.smartday.app.widget.CalendarWidgetProvider
import com.smartday.app.widget.MonthWidgetProvider
import org.json.JSONObject

/**
 * Web ⇄ 原生桥接插件（对应 web 端 `src/lib/androidBridge.ts` 的 window.Capacitor.Plugins.SmartDayBridge）
 *
 * Web 层负责所有业务/农历/节日/日记口径计算，把结果 JSON 推给原生；
 * 原生只做：缓存 + 小组件刷新 + 本地通知/前台服务，从而与 Web 端口径 100% 一致。
 */
@CapacitorPlugin(name = "SmartDayBridge")
class SmartDayBridgePlugin : Plugin() {

    // ---------------- 今日日程小组件 ----------------
    @PluginMethod
    fun updateTodayWidget(call: PluginCall) {
        val data = call.getObject("data") ?: JSONObject()
        WidgetDataStore(context).saveToday(data)
        CalendarWidgetProvider.refreshAll(context)
        call.resolve()
    }

    // ---------------- 月历小组件 ----------------
    @PluginMethod
    fun updateMonthWidget(call: PluginCall) {
        val data = call.getObject("data") ?: JSONObject()
        val store = WidgetDataStore(context)
        store.saveMonth(data)
        // 记忆查看的月份（A-4.7）
        val y = data.optInt("year", 0)
        val m = data.optInt("month", 0)
        if (y > 0 && m > 0) store.saveViewMonth(y, m)
        MonthWidgetProvider.refreshAll(context)
        call.resolve()
    }

    // ---------------- 强制刷新全部小组件 ----------------
    @PluginMethod
    fun refreshWidgets(call: PluginCall) {
        CalendarWidgetProvider.refreshAll(context)
        MonthWidgetProvider.refreshAll(context)
        call.resolve()
    }

    /**
     * 同步「有日记」日期集合（A-4.4 / A-A5）。
     * Web 层算出统一口径的日期集合后推送过来，供原生月历小组件兜底渲染时使用，
     * 保证「日记识别统一口径」在 WebView 未就绪的原生兜底路径同样生效。
     */
    @PluginMethod
    fun syncDiaryDates(call: PluginCall) {
        val arr = call.getArray("dates")
        val set = HashSet<String>()
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val s = arr.optString(i, "")
                if (s.isNotEmpty()) set.add(s)
            }
        }
        context.getSharedPreferences("smartday_diary", android.content.Context.MODE_PRIVATE)
            .edit().putStringSet("dates", set).apply()
        call.resolve()
    }

    // ---------------- 排定本地通知 ----------------
    @PluginMethod
    fun scheduleNotification(call: PluginCall) {
        val id = call.getInt("id") ?: 0
        val title = call.getString("title") ?: "SmartDay 提醒"
        val body = call.getString("body") ?: ""
        val at = call.getLong("at") ?: 0L
        val route = call.getString("route") ?: ""

        NotifyManager.ensureChannels(context)
        val result = NotifyManager.schedule(context, id, title, body, at, route)

        val ret = JSObject()
        ret.put("scheduled", result.first)
        ret.put("exact", result.second)
        call.resolve(ret)
    }

    @PluginMethod
    fun cancelNotification(call: PluginCall) {
        val id = call.getInt("id") ?: 0
        NotifyManager.cancel(context, id)
        call.resolve()
    }

    /** 精确闹钟是否可用（设置页 A-9.1 显示授权状态） */
    @PluginMethod
    fun canScheduleExact(call: PluginCall) {
        val ret = JSObject()
        ret.put("exact", NotifyManager.canScheduleExact(context))
        ret.put("notifyPermission", NotifyManager.hasNotificationPermission(context))
        call.resolve(ret)
    }

    // ---------------- 专注前台服务（A-6） ----------------
    @PluginMethod
    fun startFocusService(call: PluginCall) {
        val label = call.getString("label") ?: "专注中"
        val remain = call.getString("remain") ?: ""
        FocusForegroundService.start(context, label, remain)
        call.resolve()
    }

    @PluginMethod
    fun updateFocusService(call: PluginCall) {
        val label = call.getString("label") ?: "专注中"
        val remain = call.getString("remain") ?: ""
        FocusForegroundService.update(context, label, remain)
        call.resolve()
    }

    @PluginMethod
    fun stopFocusService(call: PluginCall) {
        FocusForegroundService.stop(context)
        call.resolve()
    }

    // ---------------- 内部跳转（小组件点击直达） ----------------
    @PluginMethod
    fun navigate(call: PluginCall) {
        val route = call.getString("route") ?: ""
        val i = Intent(context, com.smartday.app.MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("smartday_route", route)
        }
        context.startActivity(i)
        call.resolve()
    }
}
