// ============================================================
// 笔记页（日记与笔记已合并，统称「笔记」）
//  - 三种可选风格：分栏 / 卡片 / 时间轴（选择会被记忆）
//  - 统一列表：自由笔记 + 有日期的日记，混排按日期与更新排序
//  - 修复：新建笔记时先建记录再编辑，不再出现「写一篇却多出很多重复项」
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { useUiStore } from "@/store/uiStore";
import { useRoute } from "@/lib/router";
import { Note, Diary, Mood } from "@/types";
import { todayStr } from "@/lib/date";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { renderMarkdown, countWords } from "@/lib/markdown";
import { Seg } from "@/components/common";

type NotesStyle = "split" | "cards" | "timeline";
const STYLE_KEY = "smartday.notesStyle";
const COLLAPSE_KEY = "smartday.notesListCollapsed";
const MOODS: Array<{ key: Mood; icon: string; label: string }> = [
  { key: "happy", icon: "😄", label: "很好" },
  { key: "smile", icon: "😊", label: "不错" },
  { key: "neutral", icon: "😐", label: "一般" },
  { key: "sad", icon: "😢", label: "低落" },
  { key: "angry", icon: "😡", label: "烦躁" },
];
const moodIcon = (m?: Mood | null) => MOODS.find((x) => x.key === m)?.icon ?? "";

interface Row {
  kind: "note" | "diary";
  id: string;
  title: string;
  preview: string;
  date: string | null;
  tags: string[];
  pinned: boolean;
  updatedAt: number;
  mood?: Mood | null;
}

type Target = { kind: "note"; id: string | null; date: string | null } | { kind: "diary"; date: string };

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
  const upsertNote = useStore((s) => s.upsertNote);
  const showToast = useUiStore((s) => s.showToast);

  const [style, setStyle] = useState<NotesStyle>(() => {
    const raw = localStorage.getItem(STYLE_KEY) as NotesStyle | null;
    return raw === "cards" || raw === "timeline" || raw === "split" ? raw : "split";
  });
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [active, setActive] = useState<Target | null>(null);
  const [overlay, setOverlay] = useState(false);
  // 列表可折叠（默认展开，宽度收窄为 260px），折叠状态会被记忆
  const [listCollapsed, setListCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  // 点击列表进入「阅读」，只有点「编辑」才进入编辑
  const [mode, setMode] = useState<"read" | "edit">("read");

  const changeStyle = (s: NotesStyle) => {
    setStyle(s);
    localStorage.setItem(STYLE_KEY, s);
  };

  const toggleCollapse = () => {
    const next = !listCollapsed;
    setListCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };

  // 从日历/桌面日历点「今天有日记」进来：#/diary/date:yyyy-MM-dd
  useEffect(() => {
    if (route.date) {
      setActive({ kind: "diary", date: route.date });
      setOverlay(style !== "split");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.date]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of n.tags) set.add(t);
    return [...set].sort();
  }, [notes]);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (const n of notes) {
      list.push({
        kind: "note", id: n.id, title: n.title || "无标题笔记", preview: strip(n.content),
        date: n.date ?? null, tags: n.tags, pinned: n.pinned, updatedAt: n.updatedAt, mood: null,
      });
    }
    for (const d of diaries) {
      list.push({
        kind: "diary", id: d.id, title: d.title || d.date, preview: strip(d.content),
        date: d.date, tags: ["日记"], pinned: false, updatedAt: d.updatedAt, mood: d.mood,
      });
    }
    const kw = q.trim().toLowerCase();
    return list
      .filter((r) => (tagFilter ? r.tags.includes(tagFilter) : true))
      .filter((r) => (kw ? (r.title + " " + r.preview).toLowerCase().includes(kw) : true))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const da = a.date ? Date.parse(a.date) : 0;
        const db = b.date ? Date.parse(b.date) : 0;
        if (da !== db) return db - da;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, diaries, q, tagFilter]);

  const newNote = () => {
    const t: Target = { kind: "note", id: null, date: todayStr() };
    setActive(t);
    setMode("edit"); // 新建后直接进入编辑
    setOverlay(style !== "split");
  };

  /** 点击列表项 → 进入阅读视图（不是编辑） */
  const open = (r: Row) => {
    setActive(r.kind === "note" ? { kind: "note", id: r.id, date: r.date } : { kind: "diary", date: r.date ?? todayStr() });
    setMode("read");
    setOverlay(style !== "split");
  };

  const closePane = () => { setActive(null); setOverlay(false); setMode("read"); };

  const remove = (r: Row) => {
    if (r.kind === "note") {
      if (window.confirm("删除笔记「" + r.title + "」？")) {
        void deleteNote(r.id);
        if (active && active.kind === "note" && active.id === r.id) setActive(null);
      }
    } else {
      showToast("日记请在编辑面板中清空内容后再删除", "info");
    }
  };

  // 右栏：阅读 / 编辑
  const pane = active ? (
    mode === "read" ? (
      <NoteReader
        target={active}
        onEdit={() => setMode("edit")}
        onClose={closePane}
        onDeleted={closePane}
      />
    ) : (
      <NoteEditor
        target={active}
        onClose={closePane}
        onFinish={() => setMode("read")}
        onCreated={(id) => setActive({ kind: "note", id, date: null })}
      />
    )
  ) : (
    <div className="card empty" style={{ padding: 40 }}>选择左侧一篇笔记查看，或点「＋ 新建笔记」✨</div>
  );

  return (
    <div className="page page-wide notes-page">
      <div className="notes-toolbar">
        <h2 style={{ margin: 0 }}>📝 笔记</h2>
        <input className="input" style={{ width: 210 }} placeholder="搜索标题与内容…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ width: 130 }} value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">全部标签</option>
          {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
        <div className="spacer" />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>布局</span>
        <Seg<NotesStyle>
          options={[
            { value: "split", label: "分栏", title: "左侧列表 + 右侧阅读/编辑（列表可折叠）" },
            { value: "cards", label: "卡片", title: "卡片墙，点开阅读" },
            { value: "timeline", label: "时间轴", title: "按日期排布，点开阅读" },
          ]}
          value={style}
          onChange={changeStyle}
        />
        <button className="btn btn-primary" onClick={newNote}>＋ 新建笔记</button>
      </div>

      {style === "split" && (
        <div className={"notes-split" + (listCollapsed ? " list-collapsed" : "")}>
          <div className="notes-list-wrap">
            <button
              className="notes-collapse"
              title={listCollapsed ? "展开笔记列表" : "折叠笔记列表"}
              onClick={toggleCollapse}
            >
              {listCollapsed ? "»" : "«"}
            </button>
            {!listCollapsed && (
            <div className="notes-list">
            {rows.map((r) => (
              <div
                key={r.kind + r.id}
                className={"note-card" + (active && active.kind === r.kind && ((active.kind === "note" && active.id === r.id) || (active.kind === "diary" && active.date === r.date)) ? " active" : "")}
                onClick={() => open(r)}
                onContextMenu={(e) => { e.preventDefault(); remove(r); }}
                title="点击查看，右键删除"
              >
                <div className="nc-date">
                  {r.pinned && <span title="置顶">📌</span>}
                  <span>{r.date ?? "未关联日期"}</span>
                  <span>{moodIcon(r.mood)}</span>
                  {r.kind === "diary" && <span className="tag-chip" style={{ fontSize: 10 }}>日记</span>}
                  {r.tags.filter((t) => t !== "日记").map((t) => <span key={t} className="tag-chip" style={{ fontSize: 10 }}>#{t}</span>)}
                </div>
                <div className="nc-title">{r.title}</div>
                <div className="nc-body">{r.preview || "（空）"}</div>
              </div>
            ))}
            {!rows.length && <div className="empty" style={{ padding: 20 }}>还没有笔记 ✨</div>}
            </div>
            )}
          </div>
          <div className="notes-pane">{pane}</div>
        </div>
      )}

      {style === "cards" && (
        <div className="notes-cards">
          {rows.map((r) => (
            <div key={r.kind + r.id} className="notes-card" onClick={() => open(r)} onContextMenu={(e) => { e.preventDefault(); remove(r); }}>
              <div className="nc-date">
                {r.pinned && <span>📌</span>}
                <span>{r.date ?? "未关联日期"}</span>
                <span>{moodIcon(r.mood)}</span>
                {r.kind === "diary" && <span className="tag-chip" style={{ fontSize: 10 }}>日记</span>}
              </div>
              <div className="nc-title">{r.title}</div>
              <div className="nc-body">{r.preview || "（空）"}</div>
              <div className="nc-tags">{r.tags.map((t) => <span key={t} className="tag-chip" style={{ fontSize: 10 }}>#{t}</span>)}</div>
            </div>
          ))}
          {!rows.length && <div className="empty" style={{ padding: 20 }}>还没有笔记 ✨</div>}
        </div>
      )}

      {style === "timeline" && (
        <div className="notes-timeline">
          {groupByDate(rows).map(([date, items]) => (
            <div key={date} className="tl-item">
              <div className="tl-date">
                <b style={{ color: "var(--text-secondary)" }}>{date}</b>
                <span style={{ color: "var(--text-muted)" }}>{items.length} 篇</span>
              </div>
              {items.map((r) => (
                <div key={r.kind + r.id} className="tl-card" style={{ marginBottom: 8 }} onClick={() => open(r)} onContextMenu={(e) => { e.preventDefault(); remove(r); }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {r.pinned && <span>📌</span>}
                    <b style={{ flex: 1 }}>{r.title}</b>
                    <span>{moodIcon(r.mood)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{r.preview.slice(0, 120) || "（空）"}</div>
                </div>
              ))}
            </div>
          ))}
          {!rows.length && <div className="empty" style={{ padding: 20 }}>还没有笔记 ✨</div>}
        </div>
      )}

      {overlay && active && (
        <div className="notes-editor-overlay" onClick={closePane}>
          <div className="notes-editor-panel" onClick={(e) => e.stopPropagation()}>
            {pane}
          </div>
        </div>
      )}
    </div>
  );
}

function groupByDate(rows: Row[]): Array<[string, Row[]]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.date ?? "未关联日期";
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(r);
  }
  return [...m.entries()];
}

// ---------------- 阅读视图（点击列表默认进入这里） ----------------
function NoteReader(props: { target: Target; onEdit: () => void; onClose: () => void; onDeleted: () => void }) {
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
  const tags = note?.tags ?? (target.kind === "diary" ? ["日记"] : []);
  const pinned = note?.pinned ?? false;

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
        {date && <span>📅 {date}</span>}
        {mood && <span title="心情">{moodIcon(mood)}</span>}
        {tags.map((t) => <span key={t} className="tag-chip" style={{ fontSize: 10 }}>#{t}</span>)}
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
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>点右上角「✏️ 编辑」可修改</span>
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

  // 收窄到局部常量：props.target 在闭包里不会被 TS 收窄
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

  const key = props.target.kind === "note" ? "note:" + (props.target.id ?? "new") : "diary:" + props.target.date;

  // 草稿 ref：避开自动保存回调里的闭包过期问题
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
    } else {
      const d = st.diaries.find((x) => x.date === target.date);
      setId(d?.id ?? null);
      setTitle(d?.title ?? "");
      setContent(d?.content ?? "");
      setDate(target.date);
      setTags([]);
      setPinned(false);
      setMood(d?.mood ?? null);
    }
    setSavedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = async (patch?: Partial<Note>) => {
    const d = draft.current;
    if (target.kind === "diary") {
      // 不展开 patch（Partial<Note> 的 date 可能是 null，会污染日记的固定日期）
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
    setSavedAt(Date.now());
  };

  const isDiary = target.kind === "diary";

  return (
    <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <input
          className="input" style={{ flex: 1, fontWeight: 650 }} placeholder="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void save()}
        />
        {!isDiary && (
          <button className={"star-btn" + (pinned ? " on" : "")} title="置顶" onClick={() => { setPinned(!pinned); void save({ pinned: !pinned }); }}>
            {pinned ? "📌" : "📍"}
          </button>
        )}
        <button className="btn btn-sm" title="完成编辑，返回阅读" onClick={() => { void save(); props.onFinish ? props.onFinish() : props.onClose(); }}>
          完成
        </button>
        <button className="icon-btn" title="关闭" onClick={props.onClose}>✕</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>日期</span>
        <input
          className="input" type="date" style={{ width: 150 }} value={date ?? ""}
          disabled={isDiary}
          onChange={(e) => { setDate(e.target.value || null); }}
          onBlur={() => void save({ date })}
        />
        {isDiary && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>（日记一天一篇，日期固定）</span>}
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>心情</span>
        {MOODS.map((m) => (
          <button
            key={m.key}
            className={"chip" + (mood === m.key ? " mood-active" : "")}
            title={m.label}
            onClick={() => { setMood(mood === m.key ? null : m.key); void save({ mood: mood === m.key ? null : m.key } as Partial<Note>); }}
          >{m.icon}</button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>标签</span>
        {tags.map((t) => (
          <span key={t} className="tag-chip" onClick={() => { const next = tags.filter((x) => x !== t); setTags(next); void save({ tags: next }); }}>#{t} ✕</span>
        ))}
        <input
          className="input" style={{ width: 120 }} placeholder="+ 标签，回车添加" value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTag.trim()) {
              const next = Array.from(new Set([...tags, newTag.trim().replace(/^#/, "")]));
              setTags(next); setNewTag(""); void save({ tags: next });
            }
          }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: savedAt ? "var(--success)" : "var(--text-muted)" }}>
          {savedAt ? "已保存 " + new Date(savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "自动保存"}
        </span>
        <button
          className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }}
          onClick={async () => {
            if (isDiary) {
              if (!id || !window.confirm("删除这篇日记？")) return;
              await deleteDiary(id);
            } else {
              if (!window.confirm("删除这篇笔记？")) return;
              if (id) await deleteNote(id);
            }
            showToast("已删除", "success");
            props.onClose();
          }}
        >删除</button>
      </div>

      <div style={{ flex: 1, minHeight: 320, padding: 12 }}>
        <MarkdownEditor
          value={content}
          onChange={(v) => setContent(v)}
          onSaved={() => void save()}
          placeholder="写点什么…支持 Markdown，停顿即自动保存"
          height={isDiary ? 380 : 340}
        />
      </div>
    </div>
  );
}
