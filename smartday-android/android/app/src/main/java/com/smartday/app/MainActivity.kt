package com.smartday.app

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.getcapacitor.BridgeActivity
import com.smartday.app.bridge.SmartDayBridgePlugin
import com.smartday.app.notify.NotifyManager

/**
 * 应用主入口（Capacitor 壳）
 *
 * - 注册 SmartDayBridgePlugin（Web ⇄ 原生）
 * - 处理小组件/通知点击带来的 Deep Link（smartday_route → Web 层路由）
 * - WebView 移动端加固（视口、字号）
 * - 状态栏避让：保证网页内容不会画到系统状态栏下方（修复文字重叠）
 */
class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // 注册自定义插件（必须在 super.onCreate 之前）
        registerPlugin(SmartDayBridgePlugin::class.java)
        super.onCreate(savedInstanceState)

        applyStatusBar()
        NotifyManager.ensureChannels(this)
        hardenWebView()
        applyWindowInsets()
        handleRoute(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleRoute(intent)
    }

    /**
     * 状态栏配置：不透明实色 + 深色图标。
     *
     * 背景：网页用 `viewport-fit=cover` 尝试做全屏沉浸，但 Android 侧没有把
     * 状态栏做成「不透明且占位」，导致 WebView 顶栏被画到状态栏底下、
     * 与状态栏图标/时间重叠。
     * 这里统一收口：状态栏给实色（浅底配深色图标），且**不允许**布局延伸到状态栏。
     */
    private fun applyStatusBar() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        val barColor = Color.parseColor("#FFFFFF")
        window.statusBarColor = barColor
        window.navigationBarColor = barColor
        // 浅色底 → 深色前景图标
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.setSystemBarsAppearance(
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            )
        } else {
            @Suppress("DEPRECATION")
            var flags = window.decorView.systemUiVisibility
            flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = flags
        }
    }

    /**
     * 给 Capacitor 的 WebView 容器消费系统栏 insets，
     * 让网页内容从状态栏下方开始（顶部）并且不被手势条遮挡（底部）。
     *
     * 说明：Web 层同时有 `env(safe-area-inset-*)` 的兜底样式；
     * 但 WebView 的 safe-area 取值依赖原生容器是否传递 insets，
     * 这里用 padding 的方式双保险，确保任何机型都不会重叠。
     */
    private fun applyWindowInsets() {
        val webView: WebView = bridge?.webView ?: return
        val parent = webView.parent as? ViewGroup ?: return
        ViewCompat.setOnApplyWindowInsetsListener(parent) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.updatePadding(top = bars.top, bottom = bars.bottom, left = bars.left, right = bars.right)
            // 不再继续向下分发，避免 WebView 内部再次叠加
            WindowInsetsCompat.CONSUMED
        }
        ViewCompat.requestApplyInsets(parent)
    }

    /**
     * 处理小组件/通知带来的 route（如 "#/calendar?date=2026-10-07"）。
     * 通过注入 JS 调用 Web 层 navigate，实现「点小组件日期 → 打开应用对应日期」。
     */
    private fun handleRoute(intent: Intent?) {
        val route = intent?.getStringExtra("smartday_route") ?: return
        if (route.isEmpty()) return
        val safe = route.replace("'", "\\'")
        val js = "(function(){try{" +
            "if(window.__smartdayNavigate){window.__smartdayNavigate('$safe');}" +
            "else{location.hash='$safe';}" +
            "}catch(e){}})();"
        val wv: WebView = bridge?.webView ?: return
        wv.postDelayed({ wv.evaluateJavascript(js, null) }, 350)
    }

    /** 移动端 WebView 加固：单指缩放关闭、视口自适应、字号不放大 */
    private fun hardenWebView() {
        val webView: WebView = bridge?.webView ?: return
        val s: WebSettings = webView.settings
        s.useWideViewPort = true
        s.loadWithOverviewMode = false
        s.textZoom = 100
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.setSupportZoom(false)
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
    }
}

