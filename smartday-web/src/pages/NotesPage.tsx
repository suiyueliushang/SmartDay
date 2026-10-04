// ============================================================
// 笔记页（2026-10 按参考设计重做）
//  - 左侧导航：只有「全部笔记」与「全部标签」两项（标签带条数）
//  - 右侧：笔记信息流，每条显示 **创建时间** 与 **最后修改时间**、标签与正文
//  - 点击卡片进入阅读（渲染好的 Markdown），点「编辑」才进入编辑
//  - 日记与自由笔记统一在此列表；新建笔记改为"首次保存才落库"，不会产生重复项
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { useRoute } from "@/lib/router";
import { Note, Diary, Mood } from "@/types";
import { todayStr } from "@/lib/date";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { renderMarkdown, countWords } from "@/lib/markdown";

const MOODS: Array<{ key: Mood; icon: string; label: string }> = [
  { key: "happy", icon: "😄", label: "很好" },
  { key: "smile", icon: "😊", label: "不错" },
  { key: "neutral", icon: "😐", label: "一般" },
  { key: "sad", icon: "😢", label: "低落" },
  { key: "angry", icon: "😡", label: "烦躁" },
];
const moodIcon = (m?: Mood | null) => MOODS.find((x) => x.key === m)?.icon ?? "";
const DIARY_TAG = "日记";
const NAV_KEY = "smartday.notesNavCollapsed";


interface Row {
  kind: "note" | "diary";
  id: string;
  title: string;
  content: string;
  date: string | null;
  tags: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  mood?: Mood | null;
}

type Target = { kind: "note"; id: string | null; date: string | null } | { kind: "diary"; date: string };

/** 统一日期时间格式：2026-10-04 15:20 */
function fmtDT(ts?: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function strip(md: string): string {
  return (md || "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>\-]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function NotesPage() {
  const route = useRoute();
  const notes = useStore((s) => s.notes);
  const diaries = useStore((s) => s.diaries);
  const deleteNote = useStore((s) => s.deleteNote);
  const deleteDiary = useStore((s) => s.deleteDiary);
  const showToast = useUiStore((s) => s.showToast);

  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string>(""); // "" = 全部笔记
  const [active, setActive] = useState<Target | null>(null);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [overlay, setOverlay] = useState(false);
  // 左侧导航可折叠（状态会被记忆）
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem(NAV_KEY) === "1");
  const toggleNav = () => {
    const next = !navCollapsed;
    setNavCollapsed(next);
    localStorage.setItem(NAV_KEY, next ? "1" : "0");
  };

  // 从日历/桌面日历点「今天有日记」进来：#/diary/date:yyyy-MM-dd
  useEffect(() => {
    if (route.date) {
      setActive({ kind: "diary", date: route.date });
      setMode("read");
      setOverlay(true);
    }
  }, [route.date]);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (const n of notes) {
      list.push({
        kind: "note", id: n.id, title: n.title || "无标题笔记", content: n.content,
        date: n.date ?? null, tags: n.tags, pinned: n.pinned,
        createdAt: n.createdAt, updatedAt: n.updatedAt, mood: null,
      });
    }
    for (const d of diaries) {
      list.push({
        kind: "diary", id: d.id, title: d.title || d.date, content: d.content,
        date: d.date, tags: [DIARY_TAG], pinned: false,
        createdAt: d.createdAt, updatedAt: d.updatedAt, mood: d.mood,
      });
    }
    const kw = q.trim().toLowerCase();
    return list
      .filter((r) => (tag ? r.tags.includes(tag) : true))
      .filter((r) => (kw ? (r.title + " " + strip(r.content)).toLowerCase().includes(kw) : true))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, diaries, q, tag]);

  /** 全部标签 + 每类条数（日记作为内置标签一起列出） */
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) for (const t of n.tags) m.set(t, (m.get(t) ?? 0) + 1);
    if (diaries.length) m.set(DIARY_TAG, diaries.length);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [notes, diaries]);

  const newNote = () => {
    setActive({ kind: "note", id: null, date: todayStr() });
    setMode("edit");
    setOverlay(true);
  };

  const open = (r: Row, next: "read" | "edit") => {
    setActive(r.kind === "note" ? { kind: "note", id: r.id, date: r.date } : { kind: "diary", date: r.date ?? todayStr() });
    setMode(next);
    setOverlay(true);
  };

  const remove = (r: Row) => {
    if (r.kind === "note") {
      if (window.confirm("删除笔记「" + r.title + "」？")) void deleteNote(r.id);
    } else {
      if (window.confirm("删除 " + r.date + " 的日记？")) void deleteDiary(r.id);
    }
    showToast("已删除", "success");
  };

  const closePane = () => { setOverlay(false); setActive(null); setMode("read"); };

  const pane = active ? (
    mode === "read"
      ? <NoteReader target={active} onEdit={() => setMode("edit")} onClose={closePane} onDeleted={closePane} onTag={(t) => { setTag(t); closePane(); }} />
      : <NoteEditor target={active} onClose={closePane} onFinish={() => setMode("read")} onCreated={(id) => setActive({ kind: "note", id, date: null })} />
  ) : null;

  return (
    <div className="page page-wide notes-page">
      <div className={"notes-layout" + (navCollapsed ? " nav-collapsed" : "")}>
        {/* 左侧：全部笔记 + 全部标签（只有这两项，可折叠） */}
        <aside className="card notes-nav">
          <div className="notes-nav-head">
            {!navCollapsed && <span className="nnh-title">📓 笔记</span>}
            <button
              className="notes-nav-toggle"
              title={navCollapsed ? "展开导航" : "折叠导航"}
              onClick={toggleNav}
            >{navCollapsed ? "»" : "«"}</button>
          </div>
          {navCollapsed ? (
            <div className="notes-nav-rail" title={tag ? "#" + tag : "全部笔记"} onClick={toggleNav}>
              📋
              {tag && <span className="nav-rail-dot" />}
            </div>
          ) : (
            <>
              <div className="notes-nav-card">
                <div className={"notes-nav-item" + (tag === "" ? " active" : "")} onClick={() => setTag("")}>
                  <span className="nn-ico">📋</span>
                  <span className="nn-label">全部笔记</span>
                  <span className="nn-count">{notes.length + diaries.length}</span>
                </div>
              </div>
              <div className="notes-nav-card">
                <div className="notes-nav-sec">全部标签</div>
                <div className="notes-tag-list">
                  {!tags.length && <div className="nn-empty">还没有标签</div>}
                  {tags.map(([t, n]) => (
                    <div key={t} className={"notes-tag" + (tag === t ? " active" : "")} onClick={() => setTag(tag === t ? "" : t)}>
                      <span className="nt-hash">#</span>
                      <span className="nt-name">{t}</span>
                      <span className="nn-count">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* 右侧：笔记信息流 */}
        <div className="notes-main">
          <div className="notes-toolbar">
            <b style={{ fontSize: 14 }}>{tag ? "#" + tag : "全部笔记"}</b>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>共 {rows.length} 条</span>
            <div className="spacer" />
            <input className="input" style={{ width: 220 }} placeholder="搜索标题与正文…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-primary" onClick={newNote}>＋ 新建笔记</button>
          </div>

          <div className="notes-feed">
            {!rows.length && <div className="card empty" style={{ padding: 36 }}>这里还没有笔记 ✨（点右上角「＋ 新建笔记」）</div>}
            {rows.map((r) => (
              <NoteCard
                key={r.kind + r.id}
                row={r}
                onOpen={() => open(r, "read")}
                onEdit={() => open(r, "edit")}
                onDelete={() => remove(r)}
                onTag={(t) => setTag(t)}
              />
            ))}
          </div>
        </div>
      </div>

      {overlay && pane && (
        <div className="notes-editor-overlay" onClick={closePane}>
          <div className="notes-editor-panel" onClick={(e) => e.stopPropagation()}>{pane}</div>
        </div>
      )}
    </div>
  );
}

// ---------------- 信息流卡片 ----------------
function NoteCard(props: {
  row: Row;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTag: (t: string) => void;
}) {
  const r = props.row;
  const html = useMemo(() => renderMarkdown(r.content || "（空）"), [r.content]);
  const edited = r.updatedAt - r.createdAt > 60000;
  return (
    <div className="note-feed-card" onClick={props.onOpen} title="点击查看">
      <div className="nfc-head">
        <span className="nfc-time">
          <span>创建 {fmtDT(r.createdAt)}</span>
          <span className={edited ? "nfc-edited" : ""}>最后修改 {fmtDT(r.updatedAt)}</span>
          {r.pinned && <span title="置顶">📌</span>}
          {r.mood && <span title="心情">{moodIcon(r.mood)}</span>}
        </span>
        <span className="nfc-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title="编辑" onClick={props.onEdit}>✏️</button>
          <button className="icon-btn" title="删除" onClick={props.onDelete}>🗑️</button>
        </span>
      </div>
      <div className="nfc-title-row">
        <span className="nfc-title">{r.title}</span>
        {r.tags.map((t) => (
          <span
            key={t}
            className="nfc-tag"
            title={"只看 #" + t}
            onClick={(e) => { e.stopPropagation(); props.onTag(t); }}
          >#{t}</span>
        ))}
      </div>
      <div className="md-preview nfc-body" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="nfc-fade" />
    </div>
  );
}

// ---------------- 阅读视图 ----------------
function NoteReader(props: { target: Target; onEdit: () => void; onClose: () => void; onDeleted: () => void; onTag: (t: string) => void }) {
  const target = props.target;
  const note = useStore((s) => (target.kind === "note" && target.id ? s.notes.find((n) => n.id === target.id) : undefined));
  const diary = useStore((s) => (target.kind === "diary" ? s.diaries.find((d) => d.date === target.date) : undefined));
  const deleteNote = useStore((s) => s.deleteNote);
  const deleteDiary = useStore((s) => s.deleteDiary);
  const showToast = useUiStore((s) => s.showToast);

  const title = note?.title || diary?.title || (target.kind === "diary" ? target.date : "无标题笔记");
  const content = note?.content ?? diary?.content ?? "";
  const date = note?.date ?? (target.kind === "diary" ? target.date : null);
  const mood = diary?.mood ?? null;
  const tags = note?.tags ?? (target.kind === "diary" ? [DIARY_TAG] : []);
  const pinned = note?.pinned ?? false;
  const createdAt = note?.createdAt ?? diary?.createdAt;
  const updatedAt = note?.updatedAt ?? diary?.updatedAt;
  const edited = !!createdAt && !!updatedAt && updatedAt - createdAt > 60000;

  const html = useMemo(() => renderMarkdown(content), [content]);
  const words = useMemo(() => countWords(content), [content]);

  return (
    <div className="card notes-reader">
      <div className="reader-head">
        <div className="reader-title">
          {pinned && <span title="置顶">📌</span>}
          <span>{title}</span>
        </div>
        <button className="btn btn-sm btn-primary" onClick={props.onEdit} title="进入编辑">✏️ 编辑</button>
        <button className="icon-btn" title="关闭" onClick={props.onClose}>✕</button>
      </div>
      <div className="reader-meta">
        <span>创建 {fmtDT(createdAt)}</span>
        <span className={edited ? "nfc-edited" : ""}>最后修改 {fmtDT(updatedAt)}</span>
        {date && <span>📅 关联 {date}</span>}
        {mood && <span title="心情">{moodIcon(mood)}</span>}
        {tags.map((t) => (
          <span key={t} className="tag-chip" style={{ fontSize: 10, cursor: "pointer" }} onClick={() => props.onTag(t)}>#{t}</span>
        ))}
        <span style={{ color: "var(--text-muted)" }}>{words.chars} 字</span>
      </div>
      <div className="md-preview reader-body" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="reader-foot">
        <button
          className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }}
          onClick={async () => {
            if (!window.confirm("删除这篇" + (target.kind === "diary" ? "日记" : "笔记") + "？")) return;
            if (target.kind === "diary") { if (diary) await deleteDiary(diary.id); }
            else if (note) await deleteNote(note.id);
            showToast("已删除", "success");
            props.onDeleted();
          }}
        >删除</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>点右上角「✏️ 编辑」可修改（修改时间会自动更新）</span>
      </div>
    </div>
  );
}

// ---------------- 编辑器 ----------------
function NoteEditor(props: { target: Target; onClose: () => void; onCreated: (id: string) => void; onFinish?: () => void }) {
  const notes = useStore((s) => s.notes);
  const diaries = useStore((s) => s.diaries);
  const upsertNote = useStore((s) => s.upsertNote);
  const upsertDiary = useStore((s) => s.upsertDiary);
  const deleteNote = useStore((s) => s.deleteNote);
  const deleteDiary = useStore((s) => s.deleteDiary);
  const showToast = useUiStore((s) => s.showToast);

  const target = props.target;
  const [id, setId] = useState<string | null>(target.kind === "note" ? target.id : null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [mood, setMood] = useState<Mood | null>(null);
  const [newTag, setNewTag] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);

  const key = target.kind === "note" ? "note:" + (target.id ?? "new") : "diary:" + target.date;
  const draft = useRef({ title: "", content: "", date: null as string | null, tags: [] as string[], pinned: false, mood: null as Mood | null });
  draft.current = { title, content, date, tags, pinned, mood };

  useEffect(() => {
    const st = useStore.getState();
    if (target.kind === "note") {
      const n = target.id ? st.notes.find((x) => x.id === target.id) : null;
      setId(target.id);
      setTitle(n?.title ?? "");
      setContent(n?.content ?? "");
      setDate(n?.date ?? target.date ?? todayStr());
      setTags(n?.tags ?? []);
      setPinned(n?.pinned ?? false);
      setMood(null);
      setCreatedAt(n?.createdAt ?? null);
    } else {
      const d = st.diaries.find((x) => x.date === target.date);
      setId(d?.id ?? null);
      setTitle(d?.title ?? "");
      setContent(d?.content ?? "");
      setDate(target.date);
      setTags([]);
      setPinned(false);
      setMood(d?.mood ?? null);
      setCreatedAt(d?.createdAt ?? null);
    }
    setSavedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = async (patch?: Partial<Note>) => {
    const d = draft.current;
    if (target.kind === "diary") {
      await upsertDiary({ date: target.date, title: d.title, content: d.content, mood: d.mood });
      setSavedAt(Date.now());
      return;
    }
    if (!d.content.trim() && !d.title.trim()) return; // 空白草稿不落库
    const saved = await upsertNote({
      id: id ?? undefined, title: d.title, content: d.content, date: d.date, tags: d.tags, pinned: d.pinned, ...patch,
    });
    if (!id) {
      setId(saved.id);
      props.onCreated(saved.id);
    }
    if (!createdAt) setCreatedAt(saved.createdAt);
    setSavedAt(Date.now());
  };

  const isDiary = target.kind === "diary";

  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <input className="input" style={{ flex: 1, fontWeight: 650 }} placeholder="标题" value={title}
          onChange={(e) => setTitle(e.target.value)} onBlur={() => void save()} />
        {!isDiary && (
          <button className={"star-btn" + (pinned ? " on" : "")} title="置顶" onClick={() => { setPinned(!pinned); void save({ pinned: !pinned }); }}>
            {pinned ? "📌" : "📍"}
          </button>
        )}
        <button className="btn btn-sm" title="完成编辑，返回阅读" onClick={() => { void save(); props.onFinish ? props.onFinish() : props.onClose(); }}>完成</button>
        <button className="icon-btn" title="关闭" onClick={props.onClose}>✕</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", flexWrap: "wrap", borderBottom: "1px solid var(--border)", fontSize: 11.5, color: "var(--text-muted)" }}>
        <span>创建 {fmtDT(createdAt)}</span>
        <span>最后修改 {fmtDT(savedAt ?? undefined)}</span>
        <span style={{ flex: 1 }} />
        <span>日期</span>
        <input className="input" type="date" style={{ width: 148 }} value={date ?? ""} disabled={isDiary}
          onChange={(e) => setDate(e.target.value || null)} onBlur={() => void save({ date })} />
        {isDiary && <span>（日记一天一篇，日期固定）</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>心情</span>
        {MOODS.map((m) => (
          <button key={m.key} className={"chip" + (mood === m.key ? " mood-active" : "")} title={m.label}
            onClick={() => { const next = mood === m.key ? null : m.key; setMood(next); if (isDiary) void save(); }}>{m.icon}</button>
        ))}
        {!isDiary && (
          <>
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>标签</span>
            {tags.map((t) => (
              <span key={t} className="tag-chip" onClick={() => { const next = tags.filter((x) => x !== t); setTags(next); void save({ tags: next }); }}>#{t} ✕</span>
            ))}
            <input className="input" style={{ width: 116 }} placeholder="+ 标签，回车" value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) {
                  const next = Array.from(new Set([...tags, newTag.trim().replace(/^#/, "")]));
                  setTags(next); setNewTag(""); void save({ tags: next });
                }
              }} />
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 320, padding: 12 }}>
        <MarkdownEditor value={content} onChange={(v) => setContent(v)} onSaved={() => void save()}
          placeholder="写点什么…支持 Markdown，停顿即自动保存" height={isDiary ? 380 : 340} />
      </div>

      <div className="side-drawer-foot" style={{ borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 11, color: savedAt ? "var(--success)" : "var(--text-muted)" }}>
          {savedAt ? "已保存 " + fmtDT(savedAt) : "自动保存"}
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }}
          onClick={async () => {
            if (isDiary) { if (!id || !window.confirm("删除这篇日记？")) return; await deleteDiary(id); }
            else { if (!window.confirm("删除这篇笔记？")) return; if (id) await deleteNote(id); }
            showToast("已删除", "success");
            props.onClose();
          }}>删除</button>
      </div>
    </div>
  );
}
