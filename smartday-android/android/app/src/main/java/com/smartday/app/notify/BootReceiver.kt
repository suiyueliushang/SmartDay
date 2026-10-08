package com.smartday.app.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 开机 / 重启自动重排提醒（A-7.2 / A-A13）
 *
 * 监听 BOOT_COMPLETED / LOCKED_BOOT_COMPLETED / MY_PACKAGE_REPLACED：
 * 重启后自动重新排定「未来 24 小时」内的提醒。
 * 注意：此阶段设备可能仍处于锁定直启状态，只能使用 directBootAware 的持久化数据
 * （SharedPreferences 在用户解锁前不可用），因此这里做 try-catch 保护，失败则等待
 * 用户打开应用时由 Web 层重新推送。
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            try {
                NotifyManager.rescheduleFromBoot(context)
            } catch (e: Exception) {
                // 直启阶段数据不可用，等应用启动后由 Web 层补推
            }
        }
    }
}
