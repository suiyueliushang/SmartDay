package com.smartday.app.focus

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.smartday.app.MainActivity
import com.smartday.app.R
import com.smartday.app.notify.NotifyManager

/**
 * 专注会话前台服务（需求 A-6 / A-A14）
 *
 * 进行中的专注以「常驻通知」呈现（可在锁屏/通知栏直接点开应用），
 * 前台服务保证后台计时不被系统杀进程；回到前台由 Web 层按实际经过时间修正。
 *
 * 注：真正的计时状态由 Web 层 store 持有，本服务只负责「保活 + 常驻通知」，
 * 避免原生与 Web 双份计时导致漂移。
 */
class FocusForegroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        if (action == ACTION_STOP) {
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }

        val label = intent?.getStringExtra(EXTRA_LABEL) ?: "专注中"
        val remainText = intent?.getStringExtra(EXTRA_REMAIN) ?: ""
        startForeground(NOTIFY_ID, buildNotification(label, remainText))
        return START_STICKY
    }

    private fun buildNotification(label: String, remainText: String): Notification {
        NotifyManager.ensureChannels(this)
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("smartday_route", "#/focus")
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val text = if (remainText.isNotEmpty()) "$remainText · $label" else label
        return NotificationCompat.Builder(this, NotifyManager.CHANNEL_FOCUS)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle("🎯 专注进行中")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .build()
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    companion object {
        const val ACTION_START = "com.smartday.app.FOCUS_START"
        const val ACTION_STOP = "com.smartday.app.FOCUS_STOP"
        const val EXTRA_LABEL = "label"
        const val EXTRA_REMAIN = "remain"
        private const val NOTIFY_ID = 99001

        fun start(context: Context, label: String, remainText: String) {
            val i = Intent(context, FocusForegroundService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_LABEL, label)
                putExtra(EXTRA_REMAIN, remainText)
            }
            startCompat(context, i)
        }

        fun update(context: Context, label: String, remainText: String) {
            start(context, label, remainText)
        }

        fun stop(context: Context) {
            val i = Intent(context, FocusForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            try {
                context.startService(i)
            } catch (e: Exception) {
                // 服务未启动时忽略
            }
        }

        private fun startCompat(context: Context, intent: Intent) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                // 后台启动限制时忽略
            }
        }
    }
}
