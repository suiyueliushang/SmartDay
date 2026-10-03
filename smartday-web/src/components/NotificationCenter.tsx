import React, { useMemo } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { useClickOutside } from "./common";
import { todayStr, fmtDate } from "@/lib/date";

export function NotificationCenter() {
  const open = useUiStore((s) => s.notifOpen);
  const setOpen = useUiStore((s) => s.setNotifOpen);
  const notifications = useStore((s) => s.notifications);
  const markRead = useStore((s) => s.markNotificationRead);
  const markAll = useStore((s) => s.markAllNotificationsRead);
  const remove = useStore((s) => s.removeNotification);
  const clearRead = useStore((s) => s.clearReadNotifications);
  const ref = useClickOutside(() => open && setOpen(false));
  const unread = notifications.filter((n) => !n.read).length;

  const grouped = useMemo(() => {
    const today = todayStr();
    const yesterday = fmtDate(new Date(Date.now() - 86400000));
    const groups: Array<{ label: string; items: typeof notifications }> = [];
    const add = (label: string, list: typeof notifications) => {
      if (list.length) groups.push({ label, items: list });
    };
    const byDay = (day: string) => notifications.filter((n) => fmtDate(new Date(n.occurredAt)) === day);
    add("今天", byDay(today));
    add("昨天", byDay(yesterday));
    add("更早", notifications.filter((n) => {
      const d = fmtDate(new Date(n.occurredAt));
      return d !== today && d !== yesterday;
    }));
    return groups;
  }, [notifications]);

  if (!open) return null;

  return (
    <div ref={ref} className="card notif-panel">
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
        <b style={{ flex: 1 }}>通知中心</b>
        {unread > 0 && <button className="btn btn-sm" onClick={() => void markAll()}>全部已读</button>}
        <button className="btn btn-sm btn-ghost" onClick={() => void clearRead()} disabled={!notifications.some((n) => n.read)}>清除已读</button>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {!notifications.length && <div className="empty" style={{ padding: 28 }}>暂无通知</div>}
        {grouped.map((g) => (
          <div key={g.label}>
            <div style={{ padding: "8px 14px 2px", fontSize: 11.5, color: "var(--text-muted)" }}>{g.label}</div>
            {g.items.map((n) => (
              <div
                key={n.id}
                className={"notif-item" + (n.read ? "" : " unread")}
                onClick={() => {
                  void markRead(n.id);
                  if (n.route) location.hash = n.route.replace(/^#\/?/, "#/");
                  setOpen(false);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void remove(n.id);
                }}
              >
                <div style={{ flex: 1 }}>
                  <div className="n-title">{n.title}</div>
                  <div className="n-body">{n.body}</div>
                  <div className="n-time">{new Date(n.occurredAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
