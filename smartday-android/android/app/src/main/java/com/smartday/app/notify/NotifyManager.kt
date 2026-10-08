package com.smartday.app.notify

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.smartday.app.MainActivity
import com.smartday.app.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * 本地精确通知（需求 A-7.2）
 *
 * - 精确到分钟：AlarmManager.setExactAndAllowWhileIdle
 * - 系统降级：未授权 SCHEDULE_EXACT_ALARM 时降级为 5 分钟窗口 setWindow，并提示用户授权
 * - 开机重排：BootReceiver 读取持久化队列，重排未来 24 小时提醒
 * - 点击直达：PendingIntent 携带 route，MainActivity 收到后交给 Web 层路由
 */
object NotifyManager {

    const val CHANNEL_REMINDER = "smartday_reminder"
    const val CHANNEL_FOCUS = "smartday_focus"
    private const val PREFS = "smartday_notify"
    private const val KEY_QUEUE = "pending_queue"
    /** 降级窗口（毫秒）：5 分钟 */
    private const val FALLBACK_WINDOW_MS = 5 * 60 * 1000L

    // ---------------- 通道初始化 ----------------
    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_REMINDER) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_REMINDER, "日程提醒", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "事件 / 任务 / 纪念日提醒"
                    enableVibration(true)
                }
            )
        }
        if (nm.getNotificationChannel(CHANNEL_FOCUS) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_FOCUS, "专注计时", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "进行中的专注会话常驻通知"
                }
            )
        }
    }

    // ---------------- 精确闹钟可用性 ----------------
    /** 是否可排定精确闹钟（供设置页 A-9.1 显示「精确闹钟授权状态」） */
    fun canScheduleExact(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            return am.canScheduleExactAlarms()
        }
        return true
    }

    /** 通知权限是否已授予（Android 13+ 需 POST_NOTIFICATIONS） */
    fun hasNotificationPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    // ---------------- 排定提醒 ----------------
    /**
     * 排定一条提醒。
     * @return Pair(是否成功排定, 是否精确)。未授权精确闹钟时用 setWindow 降级，返回 exact=false。
     */
    fun schedule(context: Context, id: Int, title: String, body: String, atMillis: Long, route: String): Pair<Boolean, Boolean> {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, NotificationReceiver::class.java).apply {
            action = NotificationReceiver.ACTION_FIRE
            putExtra(NotificationReceiver.EXTRA_ID, id)
            putExtra(NotificationReceiver.EXTRA_TITLE, title)
            putExtra(NotificationReceiver.EXTRA_BODY, body)
            putExtra(NotificationReceiver.EXTRA_ROUTE, route)
        }
        val pi = PendingIntent.getBroadcast(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 过去的时间点不排定
        if (atMillis <= System.currentTimeMillis()) {
            return Pair(false, false)
        }

        var exact = true
        try {
            if (canScheduleExact(context)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pi)
            } else {
                exact = false
                // 系统降级：5 分钟窗口，保证仍然能触发
                am.setWindow(AlarmManager.RTC_WAKEUP, atMillis, FALLBACK_WINDOW_MS, pi)
            }
        } catch (e: SecurityException) {
            exact = false
            try {
                am.setWindow(AlarmManager.RTC_WAKEUP, atMillis, FALLBACK_WINDOW_MS, pi)
            } catch (e2: Exception) {
                return Pair(false, false)
            }
        } catch (e: Exception) {
            return Pair(false, false)
        }

        // 持久化到队列，供开机重排（只留未来 24 小时内的）
        persist(context, id, title, body, atMillis, route)
        return Pair(true, exact)
    }

    fun cancel(context: Context, id: Int) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, NotificationReceiver::class.java).apply {
            action = NotificationReceiver.ACTION_FIRE
        }
        val pi = PendingIntent.getBroadcast(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        am.cancel(pi)
        removePersisted(context, id)
    }

    // ---------------- 立即显示通知 ----------------
    fun showNotification(context: Context, id: Int, title: String, body: String, route: String) {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("smartday_route", route)
        }
        val pi = PendingIntent.getActivity(
            context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(context, CHANNEL_REMINDER)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, n)
        } catch (e: SecurityException) {
            // 权限被撤销，忽略
        }
    }

    // ---------------- 开机重排（未来 24 小时） ----------------
    fun rescheduleFromBoot(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_QUEUE, null)
        val now = System.currentTimeMillis()
        val horizon = now + 24 * 60 * 60 * 1000L
        val keep = JSONArray()

        if (raw != null) {
            try {
                val arr = JSONArray(raw)
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    val at = o.optLong("at", 0L)
                    // 只重排「未来 24 小时内」的提醒
                    if (at in now..horizon) {
                        val ok = schedule(
                            context,
                            o.optInt("id"),
                            o.optString("title"),
                            o.optString("body"),
                            at,
                            o.optString("route"),
                        )
                        if (ok.first) {
                            keep.put(o)
                        }
                    }
                }
            } catch (e: Exception) {
                // 队列损坏时清空
            }
        }
        prefs.edit().putString(KEY_QUEUE, keep.toString()).apply()
    }

    // ---------------- 队列持久化 ----------------
    private fun persist(context: Context, id: Int, title: String, body: String, atMillis: Long, route: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = try {
            JSONArray(prefs.getString(KEY_QUEUE, "[]"))
        } catch (e: Exception) {
            JSONArray()
        }
        // 去重：同 id 覆盖
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optInt("id") != id) out.put(o)
        }
        out.put(JSONObject().apply {
            put("id", id)
            put("title", title)
            put("body", body)
            put("at", atMillis)
            put("route", route)
        })
        prefs.edit().putString(KEY_QUEUE, out.toString()).apply()
    }

    private fun removePersisted(context: Context, id: Int) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = try {
            JSONArray(prefs.getString(KEY_QUEUE, "[]"))
        } catch (e: Exception) {
            return
        }
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optInt("id") != id) out.put(o)
        }
        prefs.edit().putString(KEY_QUEUE, out.toString()).apply()
    }
}
