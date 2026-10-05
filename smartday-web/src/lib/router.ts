// 极简 Hash 路由：无第三方依赖，支持浏览器前进/后退
import { useEffect, useState } from "react";

export type RouteName = "overview" | "calendar" | "tasks" | "diary" | "focus" | "settings" | "desktop";

export interface Route {
  name: RouteName;
  /** 日历视图：month/week/day/year/agenda */
  view?: string;
  /** 任务清单 id */
  listId?: string;
  /** 任务分组 id（查看分组下的全部任务） */
  groupId?: string;
  /** 日记日期 yyyy-MM-dd */
  date?: string;
  /** 设置分组 */
  tab?: string;
  /** 任务 id（打开任务详情） */
  taskId?: string;
}

export function encodeRoute(route: Route): string {
  const parts: string[] = [route.name];
  if (route.view) parts.push(route.view);
  if (route.listId) parts.push("list:" + route.listId);
  if (route.groupId) parts.push("group:" + route.groupId);
  if (route.date) parts.push("date:" + route.date);
  if (route.tab) parts.push("tab:" + route.tab);
  if (route.taskId) parts.push("task:" + route.taskId);
  return "#/" + parts.join("/");
}

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  const parts = clean.split("/").filter(Boolean);
  const name = (parts[0] || "overview") as RouteName;
  const route: Route = { name: ["overview","calendar","tasks","diary","focus","settings"].includes(name) ? name : "overview" };
  for (const p of parts.slice(1)) {
    if (p.startsWith("list:")) route.listId = p.slice(5);
    else if (p.startsWith("group:")) route.groupId = p.slice(6);
    else if (p.startsWith("date:")) route.date = p.slice(5);
    else if (p.startsWith("tab:")) route.tab = p.slice(4);
    else if (p.startsWith("task:")) route.taskId = p.slice(5);
    else if (!route.view) route.view = p;
  }
  return route;
}

export function navigate(route: Route) {
  const target = encodeRoute(route);
  if (location.hash === target) return;
  location.hash = target;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
