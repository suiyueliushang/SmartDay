// ============================================================
// Markdown 编辑器：三种模式 / 自动保存指示 / 字数统计 / 语法高亮预览
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/store";
import { renderMarkdown } from "@/lib/markdown";
import { countWords } from "@/lib/markdown";
import { Seg } from "./common";

export function MarkdownEditor(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSaved?: () => void;
  height?: number | string;
}) {
  const settings = useStore((s) => s.settings);
  const [mode, setMode] = useState<"edit" | "split" | "preview">(settings.diary.editorMode);
  const [saving, setSaving] = useState<"saved" | "saving">("saved");
  const timerRef = useRef<number | null>(null);
  const lastSavedRef = useRef(props.value);

  useEffect(() => {
    // 自动保存：停顿约 autoSaveIntervalMs 后触发
    if (props.value === lastSavedRef.current) return;
    setSaving("saving");
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      lastSavedRef.current = props.value;
      setSaving("saved");
      props.onSaved?.();
    }, settings.diary.autoSaveIntervalMs || 800);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);

  useEffect(() => {
    if (settings.diary.editorMode !== mode) setMode(settings.diary.editorMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.diary.editorMode]);

  const stats = countWords(props.value);
  const previewHtml = renderMarkdown(props.value);

  return (
    <div className="md-editor-wrap" style={props.height ? { height: props.height } : undefined}>
      <div className="md-editor-tabs">
        <Seg<"edit" | "split" | "preview">
          value={mode}
          onChange={setMode}
          options={[
            { value: "edit", label: "编辑" },
            { value: "split", label: "分屏" },
            { value: "preview", label: "预览" },
          ]}
        />
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" }}>Markdown ✨</span>
      </div>
      {mode === "edit" && (
        <textarea
          className="md-input" placeholder={props.placeholder ?? "开始写作…"}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          spellCheck={false}
        />
      )}
      {mode === "split" && (
        <div className="md-split">
          <textarea
            className="md-input" style={{ borderRight: "1px solid var(--border)" }}
            placeholder={props.placeholder ?? "开始写作…"}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            spellCheck={false}
          />
          <div className="md-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
      {mode === "preview" && (
        <div className="md-split">
          <div className="md-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
      <div className="md-statusbar">
        <span>{stats.chars} 字</span>
        <span>{stats.lines} 行</span>
        <span className={"saving " + saving}>{saving === "saved" ? "✅ 已保存" : "⏳ 正在保存…"}</span>
      </div>
    </div>
  );
}
