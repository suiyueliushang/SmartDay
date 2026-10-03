// 全局专注弹层：从任务详情/事件详情/专注页唤起
import React, { useState } from "react";
import { useUiStore } from "@/store/uiStore";
import { Modal, Seg } from "./common";
import { FocusTimer } from "./focus/FocusTimer";
import { FocusMode } from "@/types";

export function FocusPanel() {
  const open = useUiStore((s) => s.focusPanelOpen);
  const close = useUiStore((s) => s.closeFocusPanel);
  const target = useUiStore((s) => s.focusTarget);
  const initMode = useUiStore((s) => s.focusMode);
  const [mode, setMode] = useState<FocusMode>(initMode);
  const [minutes, setMinutes] = useState(25);
  const [endAt, setEndAt] = useState<number | undefined>(undefined);

  // 每次打开时重置
  React.useEffect(() => {
    if (open) {
      setMode(initMode);
      setMinutes(25);
      setEndAt(target?.type === "event" ? (target.endAt ?? Date.now() + 25 * 60000) : undefined);
    }
  }, [open, initMode, target]);

  if (!open) return null;

  return (
    <Modal open onClose={close} title="🎯 专注" width="lg">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {target?.type !== "event" && (
          <Seg<FocusMode>
            value={mode}
            onChange={(m) => { setMode(m); }}
            options={[
              { value: "pomodoro", label: "🍅 番茄钟" },
              { value: "countdown", label: "⏱️ 倒计时" },
              { value: "stopwatch", label: "▶️ 正向" },
              { value: "event", label: "📅 事件倒计时" },
            ]}
          />
        )}
        {mode === "countdown" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>时长</span>
            <input className="input" type="number" min={1} max={180} value={minutes} style={{ width: 90 }}
              onChange={(e) => setMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 25)))} />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>分钟（1-180）</span>
          </div>
        )}
        {mode === "event" && (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {target ? "倒计时至 " + target.title + " 结束" : "选择要倒计时的事件"}
          </div>
        )}
        <FocusTimer
          key={mode + (target?.id ?? "") + minutes}
          mode={mode}
          plannedMinutes={minutes}
          endAt={endAt}
          target={target}
          onFinished={() => {}}
        />
      </div>
    </Modal>
  );
}
