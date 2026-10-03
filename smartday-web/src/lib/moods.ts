// 心情图标映射
import { Mood } from "@/types";

export const MOOD_ICONS: Record<Mood, string> = {
  happy: "😄",
  smile: "😊",
  neutral: "😐",
  sad: "😢",
  angry: "😡",
};
export const MOOD_LIST: Array<{ value: Mood; icon: string; label: string }> = [
  { value: "happy", icon: "😄", label: "开心" },
  { value: "smile", icon: "😊", label: "不错" },
  { value: "neutral", icon: "😐", label: "一般" },
  { value: "sad", icon: "😢", label: "低落" },
  { value: "angry", icon: "😡", label: "生气" },
];
