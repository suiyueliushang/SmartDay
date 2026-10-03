// ============================================================
// 日记与笔记页
// ============================================================
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { useRoute } from "@/lib/router";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MiniCalendar } from "@/components/calendar/MiniCalendar";
import { Modal, Empty, Field, Seg } from "@/components/common";
import { todayStr, fmtDate, parseDate, addMonths, fmtDateWithTemplate } from "@/lib/date";
import { MOOD_ICONS, MOOD_LIST } from "@/lib/moods";
import { markdownToText } from "@/lib/markdown";
import { Diary, Note } from "@/types";
import { downloadText } from "@/lib/download";

export function DiaryPage() {
  const route = useRoute();
  const initialDate = route.date ?? todayStr();
  const [date, setDate] = useState(initialDate);
  const diaries = useStore((s) => s.diaries);
  const notes = useStore((s) => s.notes);
  const settings = useStore((s) => s.settings);
  const upsertDiary = useStore((s) => s.upsertDiary);
  const deleteDiary = useStore((s) => s.deleteDiary);
  const upsertNote = useStore((s) => s.upsertNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [tab, setTab] = useState<"diary" | "notes">("diary");
  const [tagFilter, setTagFilter] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<"diary" | "note" | null>(null);

  useEffect(() => {
    if (route.date) setDate(route.date);
  }, [route.date]);

  const diary = useMemo(() => diaries.find((d) => d.date === date), [diaries, date]);

  // 日记编辑状态（本地缓冲，自动保存）
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [diaryTitle, setDiaryTitle] = useState("");
  useEffect(() => {
    setContent(diary?.content ?? "");
    setMood(diary?.mood ?? null);
    const d = parseDate(date);
    setDiaryTitle(diary?.title ?? fmtDateWithTemplate(d, settings.diary.titleFormat || "M月d日 dddd"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, diary?.id]);

  const saveDiary = () => {
    void upsertDiary({
      date,
      title: diaryTitle.trim() || undefined,
      content,
      mood: (mood as Diary["mood"]) ?? null,
    });
  };

  const activeNote = useMemo(() => notes.find((n) => n.id === activeNoteId), [notes, activeNoteId]);

  const monthDiaries = useMemo(() => {
    const mStart = new Date(parseDate(date).getFullYear(), parseDate(date).getMonth(), 1);
    const mEnd = addMonths(mStart, 1);
    return diaries
      .filter((d) => {
        const t = parseDate(d.date);
        return t >= mStart && t < mEnd;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [diaries, date]);

  const allTags = useMemo(() => Array.from(new Set(notes.flatMap((n) => n.tags))), [notes]);
  const filteredNotes = useMemo(() => {
    let list = notes;
    if (tagFilter) list = list.filter((n) => n.tags.includes(tagFilter));
    if (noteSearch) {
      const q = noteSearch.toLowerCase();
      list = list.filter((n) => (n.title + n.content).toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [notes, tagFilter, noteSearch]);

  const exportDiaries = () => {
    const md = diaries
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => {
        const head = [
          "# " + (d.title || d.date),
          "",
          "> 日期：" + d.date + (d.mood ? "　心情：" + (MOOD_ICONS[d.mood] ?? "") : ""),
          "",
          d.content.trim(),
        ].join("\n");
        return head;
      })
      .join("\n\n---\n\n");
    downloadText("smartday-diaries-" + todayStr() + ".md", md, "text/markdown;charset=utf-8");
  };

  return (
    <div className="page page-wide">
      <div className="diary-layout">
        {/* 左侧：日期与列表 */}
        <div className="diary-side">
          <div className="card" style={{ padding: "8px 0" }}>
            <MiniCalendar date={date} onSelect={setDate} selected={date} highlightEvents highlightDiaries />
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <b style={{ flex: 1, fontSize: 13.5 }}>📖 本月日记</b>
              <button className="btn btn-sm" onClick={exportDiaries} title="导出 Markdown">导出</button>
            </div>
            {!monthDiaries.length && <div className="empty" style={{ padding: 16 }}>本月还没有日记</div>}
            {monthDiaries.slice(0, 15).map((d) => (
              <div key={d.id} className="diary-entry" onClick={() => setDate(d.date)} style={{ marginBottom: 6 }}>
                <div className="d-date">{d.date.slice(5)} {d.title?.replace(/^\S+\s+/, "")}{d.mood ? " " + MOOD_ICONS[d.mood] : ""}</div>
                <div className="d-preview">{markdownToText(d.content).slice(0, 40) || "（空）"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：编辑区 */}
        <div style={{ minWidth: 0 }}>
          <Seg<"diary" | "notes">
            value={tab}
            onChange={setTab}
            options={[
              { value: "diary", label: "📝 日记" },
              { value: "notes", label: "📄 笔记" },
            ]}
          />
          <div style={{ height: 12 }} />

          {tab === "diary" && (
            <>
              {/* 日记头部 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-icon" onClick={() => setDate(fmtDate(addMonths(parseDate(date), -1)))}>‹</button>
                  <button className="btn btn-sm" onClick={() => setDate(todayStr())}>今天</button>
                  <button className="btn btn-icon" onClick={() => setDate(fmtDate(addMonths(parseDate(date), 1)))}>›</button>
                </div>
                <span style={{ fontSize: 15, fontWeight: 650 }}>{date}</span>
                {settings.diary.showMood && (
                  <div className="mood-picker" style={{ marginLeft: "auto" }}>
                    {MOOD_LIST.map((m) => (
                      <button
                        key={m.value} className={"mood-btn" + (mood === m.value ? " on" : "")}
                        title={m.label} onClick={() => setMood(mood === m.value ? null : m.value)}
                      >{m.icon}</button>
                    ))}
                  </div>
                )}
              </div>
              <input
                className="input" style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}
                value={diaryTitle} placeholder="标题"
                onChange={(e) => setDiaryTitle(e.target.value)}
                onBlur={saveDiary}
              />
              {!diary && !content && (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 8px" }}>
                  ✍️ 这一天还没写过日记，直接开写吧（一天一篇，可补写任意日期）
                </div>
              )}
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder={"写下 " + date + " 的所思所想…\n\n支持 Markdown：**加粗**、# 标题、- 列表、\`\`\`代码\`\`\`、> 引用、表格、勾选任务等"}
                onSaved={saveDiary}
                height="calc(100vh - 260px)"
              />
              {diary && (
                <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setConfirmDelete("diary")}>删除这篇日记</button>
                </div>
              )}
            </>
          )}

          {tab === "notes" && (
            <NotesArea
              notes={filteredNotes}
              allTags={allTags}
              tagFilter={tagFilter}
              setTagFilter={setTagFilter}
              search={noteSearch}
              setSearch={setNoteSearch}
              activeNoteId={activeNoteId}
              setActiveNoteId={setActiveNoteId}
              activeNote={activeNote}
              upsertNote={upsertNote}
              deleteNote={deleteNote}
              onDeleteAsk={() => setConfirmDelete("note")}
            />
          )}
        </div>
      </div>

      <Modal open={confirmDelete != null} onClose={() => setConfirmDelete(null)} title="确认删除" footer={
        <>
          <button className="btn" onClick={() => setConfirmDelete(null)}>取消</button>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirmDelete === "diary" && diary) void deleteDiary(diary.id);
              if (confirmDelete === "note" && activeNote) { void deleteNote(activeNote.id); setActiveNoteId(null); }
              setConfirmDelete(null);
            }}
          >确认删除</button>
        </>
      }>
        {confirmDelete === "diary" ? "删除后无法恢复，确定删除这篇日记吗？" : "删除后无法恢复，确定删除这条笔记吗？"}
      </Modal>
    </div>
  );
}

// ---------------- 笔记区 ----------------
function NotesArea(props: {
  notes: Note[];
  allTags: string[];
  tagFilter: string;
  setTagFilter: (t: string) => void;
  search: string;
  setSearch: (s: string) => void;
  activeNoteId: string | null;
  setActiveNoteId: (id: string | null) => void;
  activeNote?: Note;
  upsertNote: (n: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  onDeleteAsk: () => void;
}) {
  const [editing, setEditing] = useState<Note | null>(null);
  const settings = useStore((s) => s.settings);

  const startNew = () => {
    setEditing({ id: "", title: "新笔记", content: "", tags: [], pinned: false, createdAt: Date.now(), updatedAt: Date.now() });
  };
  const save = (patch: Partial<Note>) => {
    if (editing) {
      void props.upsertNote({ ...editing, ...patch });
    }
  };

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      {/* 笔记列表 */}
      <div style={{ width: 300, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input className="input" placeholder="搜索笔记…" style={{ padding: "6px 10px", fontSize: 12.5 }} value={props.search} onChange={(e) => props.setSearch(e.target.value)} />
          <button className="btn btn-sm btn-primary" onClick={startNew}>＋ 新笔记</button>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          <button className={"chip" + (!props.tagFilter ? " on" : "")} onClick={() => props.setTagFilter("")}>全部</button>
          {props.allTags.map((t) => (
            <button key={t} className={"chip" + (props.tagFilter === t ? " on" : "")} onClick={() => props.setTagFilter(t)}>#{t}</button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
          {!props.notes.length && <div className="empty" style={{ padding: 20 }}>还没有笔记</div>}
          {props.notes.map((n) => (
            <div key={n.id} className={"note-card" + (props.activeNoteId === n.id ? " card-active" : "")}
              style={props.activeNoteId === n.id ? { borderColor: "var(--accent)" } : undefined}
              onClick={() => { props.setActiveNoteId(n.id); setEditing(n); }}>
              <div className="n-title">{n.pinned ? "📌 " : ""}{n.title}</div>
              <div className="n-preview">{markdownToText(n.content).slice(0, 60)}</div>
              <div style={{ marginTop: 5, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {n.tags.map((t) => <span key={t} className="tag-chip" style={{ fontSize: 9.5 }}>#{t}</span>)}
                {n.date && <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>写于 {n.date}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 编辑器 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!editing && <Empty icon="📄" text="选择或新建一条笔记">左侧列表点击可编辑；笔记支持标签、置顶，可关联日期</Empty>}
        {editing && (
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <input
                className="input" style={{ flex: 1, fontWeight: 700, fontSize: 15 }}
                value={editing.title} placeholder="笔记标题"
                onChange={(e) => { const next = { ...editing, title: e.target.value }; setEditing(next); }}
                onBlur={() => editing.title.trim() && save({ title: editing.title.trim() })}
              />
              <button className={"btn btn-sm" + (editing.pinned ? " btn-primary" : "")} onClick={() => { setEditing({ ...editing, pinned: !editing.pinned }); save({ pinned: !editing.pinned }); }}>
                📌 {editing.pinned ? "已置顶" : "置顶"}
              </button>
              <input
                className="input" type="date" style={{ width: 140 }} value={editing.date ?? ""}
                title="关联日期（写于某天）"
                onChange={(e) => { const next = { ...editing, date: e.target.value || null }; setEditing(next); save({ date: next.date }); }}
              />
              <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={props.onDeleteAsk}>删除</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
              <TagEditor tags={editing.tags} onChange={(tags) => { setEditing({ ...editing, tags }); save({ tags }); }} allTags={settings.diary.noteTags} />
            </div>
            <MarkdownEditor
              key={editing.id || "new"}
              value={editing.content}
              onChange={(v) => { setEditing({ ...editing, content: v }); }}
              onSaved={() => save({ content: editing.content })}
              placeholder={"笔记内容（Markdown）…"}
              height="calc(100vh - 320px)"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function TagEditor(props: { tags: string[]; onChange: (tags: string[]) => void; allTags: string[] }) {
  const [input, setInput] = useState("");
  const add = (t: string) => {
    const clean = t.trim().replace(/^#/, "");
    if (clean && !props.tags.includes(clean)) props.onChange([...props.tags, clean]);
    setInput("");
  };
  return (
    <>
      {props.tags.map((t) => (
        <span key={t} className="tag-chip" onClick={() => props.onChange(props.tags.filter((x) => x !== t))}>#{t} ✕</span>
      ))}
      <input
        className="input" placeholder="+ 标签" style={{ width: 110, padding: "4px 9px", fontSize: 12 }}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(input); }}
        onBlur={() => input.trim() && add(input)}
      />
      {props.allTags.filter((t) => !props.tags.includes(t)).slice(0, 5).map((t) => (
        <button key={t} className="chip" style={{ fontSize: 11 }} onClick={() => props.onChange([...props.tags, t])}>#{t}＋</button>
      ))}
    </>
  );
}
