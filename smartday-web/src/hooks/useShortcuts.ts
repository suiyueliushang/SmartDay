// 全局快捷键（附录：快捷键速查）
import { useEffect } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { navigate, Route } from "@/lib/router";
import { todayStr, fmtDate } from "@/lib/date";

const MODIFIER = /mac/i.test(navigator.platform || "") ? "metaKey" : "ctrlKey";

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const ctrl = e.ctrlKey || e.metaKey;
      const ui = useUiStore.getState();

      // Ctrl 组合键在输入框内也生效
      if (ctrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.setSearchOpen(!ui.searchOpen);
        return;
      }
      if (ctrl && e.key === ",") {
        e.preventDefault();
        navigate({ name: "settings" });
        return;
      }
      if (ctrl && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (e.shiftKey) {
          const now = new Date();
          const start = fmtDate(now) + "T" + (now.getHours() < 10 ? "0" : "") + now.getHours() + ":00";
          useUiStore.getState().openEventModal({ open: true, start, end: start });
        } else {
          navigate({ name: "tasks" });
        }
        return;
      }
      if (ctrl && e.key.toLowerCase() === "b") {
        e.preventDefault();
        ui.toggleSidebar();
        return;
      }
      if (inInput) return; // 输入框内：Ctrl+Z 等交给原生
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        const s = useStore.getState();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }

      const route = parseRoute();
      const view = (route as Route).view;

      switch (e.key.toLowerCase()) {
        case "t":
          if (route.name === "calendar") {
            useUiStore.getState().setActiveDate(todayStr());
          }
          break;
        case "m": navigate({ name: "calendar", view: "month" }); break;
        case "w": navigate({ name: "calendar", view: "week" }); break;
        case "d": navigate({ name: "calendar", view: "day" }); break;
        case "y": navigate({ name: "calendar", view: "year" }); break;
        case "a": navigate({ name: "calendar", view: "agenda" }); break;
        case "arrowleft":
          if (route.name === "calendar") navigate({ name: "calendar", view: view || "month" });
          break;
        case "arrowright":
          if (route.name === "calendar") navigate({ name: "calendar", view: view || "month" });
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function parseRoute(): Route {
  const clean = location.hash.replace(/^#\/?/, "");
  const parts = clean.split("/").filter(Boolean);
  const name = parts[0] || "overview";
  const route: Route = { name: name as Route["name"] };
  for (const p of parts.slice(1)) {
    if (p.startsWith("list:")) route.listId = p.slice(5);
    else if (p.startsWith("date:")) route.date = p.slice(5);
    else if (p.startsWith("tab:")) route.tab = p.slice(4);
    else if (p.startsWith("task:")) route.taskId = p.slice(5);
    else if (!route.view) route.view = p;
  }
  return route;
}
