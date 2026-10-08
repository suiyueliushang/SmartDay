# SmartDay 安卓端（smartday-android）

按《[安卓端需求文档.md](../安卓端需求文档.md)》实现的安卓端：**Capacitor 复用网页端全部业务逻辑** + **原生桌面日历小组件** + **本地精确通知** + **专注前台服务**。

> 设计原则：Web 层负责全部业务/口径计算（农历、节假日、重复事件、日记识别统一口径），
> 原生层只做「渲染 + 系统能力」，从而保证三端口径 100% 一致。

---

## 一、架构

```
smartday-android/
├── capacitor.config.json          # Capacitor 配置（appId=com.smartday.app）
├── www/                           # Web 产物（由 scripts/build-web.mjs 从 smartday-web/dist 复制）
├── scripts/build-web.mjs          # 复制网页端构建产物到 www/
└── android/                       # 原生工程（Gradle + Kotlin）
    └── app/src/main/
        ├── java/com/smartday/app/
        │   ├── MainActivity.kt                 # Capacitor 壳 + Deep Link 路由 + WebView 加固
        │   ├── bridge/SmartDayBridgePlugin.kt  # Web ⇄ 原生桥接（SmartDayBridge）
        │   ├── data/
        │   │   ├── LunarCalendar.kt            # 农历/节气/节日（移植 lunar.ts）
        │   │   ├── HolidayData.kt              # 法定节假日/调休（移植 holidays.ts）+ getDayInfo
        │   │   ├── DiaryRules.kt               # 日记识别统一口径（A-4.4）
        │   │   └── WidgetDataStore.kt          # 小组件数据缓存（SharedPreferences）
        │   ├── widget/
        │   │   ├── CalendarWidgetProvider.kt   # 今日日程小组件（4×2）
        │   │   ├── TodayWidgetService.kt       # 今日日程列表数据源（可滚动）
        │   │   └── MonthWidgetProvider.kt      # 月历小组件（4×3，切月/回到今天）
        │   ├── notify/
        │   │   ├── NotifyManager.kt            # 精确闹钟 + 5 分钟降级 + 队列持久化
        │   │   ├── NotificationReceiver.kt     # 到点弹通知
        │   │   └── BootReceiver.kt             # 开机重排未来 24 小时提醒
        │   └── focus/FocusForegroundService.kt # 专注常驻通知 + 前台保活
        ├── res/layout/                         # widget_today / widget_month / widget_month_cell …
        ├── res/drawable/                       # 单元格底色 / 班休角标 / 通知图标
        └── res/xml/                            # widget_today_info / widget_month_info
```

### 数据流（关键）

```
应用内数据变更
  → Web store 变更 → androidBridge.pushWidgetData()
  → 原生 SmartDayBridge.updateTodayWidget / updateMonthWidget
  → WidgetDataStore（缓存 JSON）→ Provider 刷新（即时）
系统定时（updatePeriodMillis=30 分钟）→ Provider.onUpdate（兜底）
点小组件 → PendingIntent → MainActivity（smartday_route）→ window.__smartdayNavigate → Web 路由
```

---

## 二、构建与运行

### 前置要求

- **Node.js ≥ 18**
- **JDK 17 / 21**（不要用 24+；Gradle 8.14.3 不支持 Java 25）
- **Android SDK**（platform 36 / build-tools 36），设置 `ANDROID_HOME` 或 `local.properties`
- Android Studio（可选，推荐用于跑模拟器）

### 步骤

```bash
# 1) 先构建网页端（在 smartday-web/ 下）
cd ../smartday-web
npm install
npm run build          # 产出 dist/

# 2) 复制产物到 www/，并同步到原生工程
cd ../smartday-android
npm install
npm run build:web      # 复制 smartday-web/dist → www/
npx cap sync android

# 3) 构建 APK
cd android
./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

### 用 Android Studio

1. `npm run build:web && npx cap sync android`
2. Android Studio → **Open** → 选择 `smartday-android/android`
3. 等待 Gradle Sync → 点 ▶ Run

> **务必**：`local.properties` 里的 SDK 路径、以及 Gradle JDK 设为 17/21
> （File → Settings → Build Tools → Gradle → Gradle JDK）。

---

## 三、桌面小组件怎么用（A-4）

1. 长按手机桌面 → **小组件** → 找到 **SmartDay**
2. 拖出 **今日日程**（4×2）或 **月历**（4×3）到桌面
3. 两种小组件可同时添加多个、不同位置、自由缩放（Android 12+ 重排大小）

| 小组件 | 内容 | 交互 |
|--------|------|------|
| 今日日程 4×2 | 日期 + 农历 + 当天前 4 条日程 + 任务完成数 | 点头部 → 打开「今天」页；点日程 → 打开应用 |
| 月历 4×3 | 完整月历（农历/节日/班休/日记标记） | ‹ › 切月、点标题回到本月、点日期 → 打开对应日期 |

**单元格规则**（对齐桌面端 D-4 / 网页端 W-2.7）：
- 只显示本月日期，前后月留空白；行数按本月实际周数自适应（5/6 行）
- 每格「阳历日号 + 农历简称 + 节日/节气」同一行，节日名超长截断
- 农历简称：**初一显月名**、其余显日名（不拼接）
- 调休上班标橙「班」、工作日放假标红「休」；周末本身不标「休」
- 周六、周日两列着色；今天高亮底色 + 描边；写过日记带 📝

---

## 四、权限说明（A-13）

| 权限 | 用途 | 被拒后的行为 |
|------|------|--------------|
| `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` | 精确到分钟提醒 | 自动降级为 **5 分钟窗口**，设置页提示授权 |
| `POST_NOTIFICATIONS` | 展示通知（Android 13+） | 通知不弹，提醒仍写入应用内通知中心 |
| `RECEIVE_BOOT_COMPLETED` | 开机重排提醒（A-A13） | 重启后需打开一次应用才会重排 |
| `FOREGROUND_SERVICE(_SHORT_SERVICE)` | 专注会话保活（A-A14） | 后台计时可能被系统冻结 |

> 所有数据存本机；小组件只展示本地数据，不额外上传。

---

## 五、与网页端的关系

- **复用**：`smartday-web/` 的全部业务逻辑与数据层（事件/任务/笔记/专注/纪念日模型与口径）
- **新增**（本端独有）：
  - `smartday-web/src/lib/androidBridge.ts` — 小组件数据生成 + 推送 + 本地通知/专注服务桥接
  - `smartday-web/src/hooks/useIsMobile.ts` — 移动端检测（UA 优先）
  - `smartday-web/src/components/layout/MobileBottomNav.tsx` — 底部导航 4 项（今天/日历/任务/设置）
- **边界**：安卓端不做系统托盘 / 开机自启 / 点击穿透；邮箱 SMTP 不能直发（需桌面端或自建服务中转）

---

## 六、验收对照（A-A1 ~ A-A17）

| 编号 | 验收点 | 实现位置 |
|------|--------|---------|
| A-A1 | 底部导航 4 项 | `MobileBottomNav.tsx` |
| A-A2 | 触控目标 ≥44dp | `smartday-web/src/index.css`（移动端块） |
| A-A3 | 单击日期弹当天详情 | `CalendarPage` / `DayDetailCard`（BottomSheet） |
| A-A4 | 双击日期新建事件 | `MonthView.tsx` |
| A-A5 | 日记识别统一口径 | `diary.ts` + `DiaryRules.kt` + `androidBridge` |
| A-A6 | 今日日程小组件 | `CalendarWidgetProvider.kt` |
| A-A7 | 月历只显示本月 | `androidBridge.buildMonthWidgetData` / `MonthWidgetProvider` |
| A-A8 | 农历简称初一显月名 | `HolidayData.getDayInfo` / `LunarCalendar` |
| A-A9 | 小组件切月与回到今天 | `MonthWidgetProvider`（ACTION_PREV/NEXT/TODAY + 记忆月份） |
| A-A10 | 数据即时刷新 | `pushWidgetData`（store 订阅）+ `updatePeriodMillis` 兜底 |
| A-A11 | 小组件点击直达 | `PendingIntent` + `MainActivity.smartday_route` + `__smartdayNavigate` |
| A-A12 | 通知精确/降级 | `NotifyManager.schedule`（setExactAndAllowWhileIdle / setWindow 5 分钟） |
| A-A13 | 开机重排提醒 | `BootReceiver` + `NotifyManager.rescheduleFromBoot`（未来 24 小时） |
| A-A14 | 专注后台运行 | `FocusForegroundService` + Web 层按实际时间修正 |
| A-A15 | 专注单会话约束 | Web store 层拦截（三处共同保证） |
| A-A16 | 邮箱 SMTP 提示 | 设置页「推送」分组（复用网页端提示文案） |
| A-A17 | 数据互导 | 三端备份 JSON 格式一致（复用 `exportImport.ts`） |

---

## 七、构建产物与验证结果

最近一次构建（2026-10-07）：

| 项目 | 结果 |
|------|------|
| APK 路径 | `android/app/build/outputs/apk/debug/app-debug.apk` |
| APK 大小 | **5.3 MB** |
| Web 产物 | `assets/public/assets/main-YwD6zdJW.js`（2.42 MB）+ `style.css`（74 KB） |
| 编译工具链 | Gradle 8.14.3 + AGP 8.5.2 + Kotlin 1.9.24 + JDK 21 |
| 原生类 | 13 个 Kotlin 源文件全部编入 dex（已解包核对） |

验证清单：

- **APK 内容核对**（解包 `classes.dex`）：`SmartDayBridgePlugin` / `CalendarWidgetProvider` /
  `MonthWidgetProvider` / `TodayWidgetService` / `FocusForegroundService` / `NotifyManager` /
  `BootReceiver` / `NotificationReceiver` / `LunarCalendar` / `HolidayData` / `WidgetDataStore` /
  `DiaryRules` 全部存在。
- **小组件数据逻辑冒烟**（`smartday-web/scripts/smoke-android.ts`，19 项）：农历简称口径、
  班休角标、日记统一口径、月历网格（只含本月 / 前置空白 / 周末判定）—— **ALL PASSED**。
- **移动端 UI 验证**（`smartday-web/scripts/verify-android-build.mjs`，7 项）：底部导航 4 项、
  ≥44px 触控目标、侧栏在移动端隐藏、无页面错误 —— **ALL PASSED**。

---

## 八、已知环境限制

- 本仓库的开发沙箱中，**esbuild 无法读取磁盘文件**（`winapi error #5`），
  故 `vite build` 需在**正常 Windows 终端**执行（见「构建步骤」第 1 步）。
  沙箱内可用 `node scripts/build-rollup.mjs` 走 Rollup 备用构建链产出等价产物。
- Android 命令行构建要求 **JDK ≤ 21**；Android Studio 自带的 JBR 若为 25 需手动切换 Gradle JDK。
- `local.properties` 中的 Windows 路径需转义反斜杠：`sdk.dir=C\:\\Users\\...\\Android\\Sdk`。
