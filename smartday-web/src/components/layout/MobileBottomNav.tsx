// ============================================================
// 移动端底部导航（安卓端 / 窄屏）
// 需求 C：底部导航固定 5 项——日历 / 任务 / 笔记 / 专注 / 设置
//   其中「日历」= 今天 + 日历 合并页（route: overview）
// ============================================================
import React from "react";
import { useRoute, navigate, Route } from "@/lib/router";
import { useStore } from "@/store/store";

interface TabDef {
  name: Route["name"];
  label: string;
  ico: string;
  /** 该导航项同时匹配的其它路由（用于高亮） */
  alias?: Route["name"][];
  badge?: number | string;
}

export function MobileBottomNav() {
  const route = useRoute();
  const tasks = useStore((s) => s.tasks);
  const incomplete = tasks.filter((t) => !t.completed).length;

  const tabs: TabDef[] = [
    // 「日历」承载合并页：今天概览 + 日历
    { name: "overview", label: "日历", ico: "📅", alias: ["calendar"] },
    { name: "tasks", label: "任务", ico: "✅", badge: incomplete || undefined },
    { name: "diary", label: "笔记", ico: "📝" },
    { name: "focus", label: "专注", ico: "🎯" },
    { name: "settings", label: "设置", ico: "⚙️" },
  ];

  return (
    <nav className="bottom-nav" aria-label="主导航">
      {tabs.map((t) => {
        const active = route.name === t.name || (t.alias ?? []).includes(route.name);
        return (
          <button
            key={t.name}
            className={"bottom-nav-item" + (active ? " active" : "")}
            onClick={() => navigate({ name: t.name })}
            aria-label={t.label}
          >
            <span className="bni-ico">{t.ico}</span>
            <span className="bni-label">{t.label}</span>
            {t.badge != null && <span className="bni-badge">{t.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}
