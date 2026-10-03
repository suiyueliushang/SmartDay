// ============================================================
// 通用 UI 组件：Modal / Menu / Switch / Seg / Field / Empty / IconBtn
// ============================================================
import React, { useEffect, useRef, useState, useCallback } from "react";

// ---------- Modal ----------
export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  width?: "normal" | "lg";
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);
  if (!props.open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className={"modal" + (props.width === "lg" ? " modal-lg" : "")}>
        {props.title != null && (
          <div className="modal-head">
            <h3>{props.title}</h3>
            <button className="btn-icon" onClick={props.onClose} aria-label="关闭">✕</button>
          </div>
        )}
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

// ---------- 下拉菜单 ----------
export interface MenuItem {
  label?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
  disabled?: boolean;
}
export function Menu(props: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) props.onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [props]);
  // 防止溢出屏幕
  const style: React.CSSProperties = { left: props.x, top: props.y };
  return (
    <div ref={ref} className="menu" style={style} role="menu">
      {props.items.map((it, i) =>
        it.divider ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            className={"menu-item" + (it.danger ? " danger" : "")}
            onClick={() => {
              if (it.disabled) return;
              it.onClick?.();
              props.onClose();
            }}
            role="menuitem"
          >
            {it.label}
          </div>
        )
      )}
    </div>
  );
}

/** 便捷：右键菜单 hook */
export function useContextMenu() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const open = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPos({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 120) });
  }, []);
  const close = useCallback(() => setPos(null), []);
  return { pos, open, close };
}

// ---------- Switch ----------
export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" title={props.label}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

// ---------- Segmented ----------
export function Seg<T extends string | number>(props: {
  options: Array<{ value: T; label: React.ReactNode; title?: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {props.options.map((o) => (
        <button
          key={o.value}
          className={o.value === props.value ? "on" : ""}
          onClick={() => props.onChange(o.value)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Field ----------
export function Field(props: { label?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={props.style}>
      {props.label && <label>{props.label}</label>}
      {props.children}
    </div>
  );
}

// ---------- Empty ----------
export function Empty(props: { icon?: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ico">{props.icon ?? "🗒️"}</div>
      <div>{props.text}</div>
      {props.children}
    </div>
  );
}

// ---------- 全局点击关闭 hook ----------
export function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return ref;
}

// ---------- 防抖 ----------
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
