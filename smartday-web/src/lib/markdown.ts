// Markdown 渲染：marked + DOMPurify + highlight.js
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const renderer = new marked.Renderer();
// marked v12 的 code token 签名：(code, infostring, escaped)
renderer.code = (code: string, infostring?: string) => {
  const lang = (infostring ?? "").split(/\s+/)[0];
  let highlighted: string;
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(code, { language: lang }).value;
    } catch {
      highlighted = escapeHtml(code);
    }
  } else {
    highlighted = escapeHtml(code);
  }
  return '<pre class="code-block"><code class="hljs language-' + escapeHtml(lang) + '">' + highlighted + "</code></pre>";
};
marked.use({ renderer, gfm: true, breaks: true });

function sanitizeHtml(html: string): string {
  const d = DOMPurify as unknown as {
    sanitize?: (h: string) => string;
    default?: { sanitize: (h: string) => string };
  };
  const fn = d.sanitize ?? d.default?.sanitize;
  return fn ? fn(html) : html;
}

export function renderMarkdown(md: string): string {
  if (!md) return "";
  const html = marked.parse(md ?? "");
  return sanitizeHtml(typeof html === "string" ? html : html.toString());
}

/** 提取纯文本用于搜索/摘要 */
export function markdownToText(md: string): string {
  if (!md) return "";
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\x60|+\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 统计字数（中文按字，英文按词） */
export function countWords(md: string): { chars: number; lines: number; words: number } {
  const text = markdownToText(md);
  const lines = md.split("\n").length;
  const cjk = (text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) || []).length;
  const latin = (text.replace(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return { chars: cjk + latin, lines, words: cjk + latin };
}
