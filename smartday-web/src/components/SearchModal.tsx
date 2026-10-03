import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { useDebounced } from "./common";
import { markdownToText } from "@/lib/markdown";
import { navigate } from "@/lib/router";
import { fmtDate, fmtTime } from "@/lib/date";

interface Hit {
  type: "event" | "task" | "anniversary" | "diary" | "note";
  id: string;
  title: string;
  sub?: string;
  route: string;
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  );
}

const HISTORY_KEY = "smartday.searchHistory";

export function SearchModal() {
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 200);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const store = useStore();

  const history: string[] = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    } catch {
      return [];
    }
  }, [open]);

  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return [] as Hit[];
    const hits: Hit[] = [];
    for (const ev of store.events) {
      if ((ev.title + " " + (ev.description ?? "") + " " + (ev.location ?? "")).toLowerCase().includes(q)) {
        hits.push({ type: "event", id: ev.id, title: ev.title, sub: fmtDate(new Date(ev.start)) + " " + fmtTime(new Date(ev.start)), route: "#/calendar" });
      }
    }
    for (const t of store.tasks) {
      if ((t.title + " " + (t.notes ?? "") + " " + t.tags.join(" ")).toLowerCase().includes(q)) {
        hits.push({ type: "task", id: t.id, title: t.title, sub: t.completed ? "已完成" : (t.dueDate ?? ""), route: "#/tasks" });
      }
    }
    for (const a of store.anniversaries) {
      if (a.name.toLowerCase().includes(q)) {
        hits.push({ type: "anniversary", id: a.id, title: a.name, sub: a.date, route: "#/overview" });
      }
    }
    for (const d of store.diaries) {
      if ((d.title ?? "" + " " + d.content).toLowerCase().includes(q) || markdownToText(d.content).toLowerCase().includes(q)) {
        hits.push({ type: "diary", id: d.id, title: d.title || d.date, sub: d.date, route: "#/diary/date:" + d.date });
      }
    }
    for (const n of store.notes) {
      if ((n.title + " " + n.content + " " + n.tags.join(" ")).toLowerCase().includes(q)) {
        hits.push({ type: "note", id: n.id, title: n.title, sub: n.date ?? "独立笔记", route: "#/diary" });
      }
    }
    return hits.slice(0, 40);
  }, [debounced, store]);

  useEffect(() => {
    if (open) {
      setTerm("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setSelected(0), [debounced]);

  if (!open) return null;

  const saveHistory = () => {
    if (!term.trim()) return;
    const next = [term, ...history.filter((h) => h !== term)].slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const openHit = (h: Hit) => {
    saveHistory();
    setOpen(false);
    navigate({ name: "diary", date: h.type === "diary" ? h.sub : undefined });
    if (h.route.startsWith("#/diary")) location.hash = h.route;
    else location.hash = h.route;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) { openHit(results[selected]); }
  };

  const TYPE_ICON: Record<string, string> = { event: "📅", task: "✅", anniversary: "⏳", diary: "📝", note: "📄" };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal search-modal">
        <div className="search-input-box">
          <span>🔍</span>
          <input
            ref={inputRef}
            className="input"
            placeholder="搜索事件、任务、纪念日、日记与笔记…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {term && <button className="icon-btn" onClick={() => setTerm("")}>✕</button>}
        </div>
        {!debounced.trim() && history.length > 0 && (
          <div className="search-results">
            <div className="search-group-title">最近搜索</div>
            {history.map((h) => (
              <div key={h} className="search-hit" onClick={() => setTerm(h)}>🕘 <span className="s-title">{h}</span></div>
            ))}
          </div>
        )}
        <div className="search-results">
          {debounced.trim() && !results.length && <div className="empty" style={{ padding: 24 }}>没有找到相关内容</div>}
          {results.length > 0 && (
            <>
              <div className="search-group-title">找到 {results.length} 条结果</div>
              {results.map((h, i) => (
                <div key={h.type + h.id} className={"search-hit" + (i === selected ? " selected" : "")}
                  onMouseEnter={() => setSelected(i)} onClick={() => openHit(h)}>
                  <span className="s-type">{TYPE_ICON[h.type]}</span>
                  <span className="s-title">{highlight(h.title, debounced)}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{h.sub}</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="search-hint">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
