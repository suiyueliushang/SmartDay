package com.smartday.app.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 提醒触发接收器（A-7.2）
 * AlarmManager 到点后触发，这里弹出通知（点击直达由 MainActivity 处理 route）。
 */
class NotificationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_FIRE) return
        val id = intent.getIntExtra(EXTRA_ID, 0)
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "SmartDay 提醒"
        val body = intent.getStringExtra(EXTRA_BODY) ?: ""
        val route = intent.getStringExtra(EXTRA_ROUTE) ?: ""
        NotifyManager.showNotification(context, id, title, body, route)
    }

    companion object {
        const val ACTION_FIRE = "com.smartday.app.NOTIFY_FIRE"
        const val EXTRA_ID = "id"
        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
        const val EXTRA_ROUTE = "route"
    }
}
