// ============================================================
// 移动端检测（安卓 APK WebView / 手机浏览器 / 窄窗口）
//
// 检测优先级：
//  1. UA 检测——Android/iPhone 等移动设备 UA 100% 命中，
//     不依赖 window.Capacitor 注入时机，也不依赖视口宽度。
//     （安卓 WebView 可能按 980px 桌面视口渲染，innerWidth 判断会失灵）
//  2. 视口宽度 ≤768px——桌面端窄窗口 / 平板分屏
// ============================================================
import { useEffect, useState } from "react";

const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|Mobile|Silk/i;

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() => detect());

  useEffect(() => {
    const onCheck = () => setMobile(detect());
    window.addEventListener("resize", onCheck);
    window.addEventListener("orientationchange", onCheck);
    return () => {
      window.removeEventListener("resize", onCheck);
      window.removeEventListener("orientationchange", onCheck);
    };
  }, []);

  return mobile;
}

export function detect(): boolean {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (MOBILE_UA_RE.test(ua)) return true;
  return window.innerWidth <= 768;
}
