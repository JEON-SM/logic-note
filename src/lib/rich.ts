import { Editor, type ChainedCommands } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import type { EditorView } from '@tiptap/pm/view'
import DOMPurify from 'dompurify'
import { highlightAttrs, textVars } from './color'
import { t } from '../lib/i18n'

// 글자색: 배경 밝기에 따라 무채색을 자동 반전할 수 있게 CSS 변수로 렌더
const ThemedColor = Color.extend({
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        color: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-tc') || el.style.color || null,
          renderHTML: (a: Record<string, string>) => (a.color ? { 'data-tc': a.color, style: textVars(a.color) } : {}),
        },
      },
    }]
  },
})

const ThemedHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-color'),
        renderHTML: (a: Record<string, string>) => (a.color ? highlightAttrs(a.color) : {}),
      },
    }
  },
}).configure({ multicolor: true })

export const FONTS = [
  { label: t('기본'), value: '' },
  { label: t('명조'), value: "'Noto Serif KR', serif" },
  { label: t('둥근 고딕'), value: "'Gowun Dodum', sans-serif" },
  { label: t('손글씨'), value: "'Nanum Pen Script', cursive" },
  { label: t('코드'), value: "'JetBrains Mono', monospace" },
]
/** 글자 크기 (pt) */
export const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]

/** '10', '10p', '10pt', '13px', '10.5' → CSS 크기. 단위가 없으면 pt */
export function parseSize(input: string): string | null {
  const m = input.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(p|pt|px|포인트)?$/)
  if (!m) return null
  const n = Math.min(400, Math.max(4, +m[1]))
  return m[2] === 'px' ? `${n}px` : `${n}pt`
}
/** 저장된 CSS 크기 → pt 숫자 (px는 환산) */
export const sizeInPt = (css?: string | null) => {
  if (!css) return null
  const n = parseFloat(css)
  return css.endsWith('px') ? Math.round(n * 0.75 * 10) / 10 : n
}

export const richExtensions = (placeholder?: string) => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
  }),
  TextStyle, ThemedColor, FontFamily, FontSize, ThemedHighlight,
  TextAlign.configure({ types: ['paragraph', 'heading'] }),
  TaskList, TaskItem.configure({ nested: true }),
  Markdown,
  ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
]

// ── 마크다운 ──
// 입력 중에는 StarterKit의 입력 규칙(# 제목, - 목록, **굵게**, > 인용, ``` 코드 …)이 바로 서식으로 바꾼다.
// 붙여넣은 글이 마크다운이면 Tiptap 공식 마크다운 확장으로 읽어 서식으로 넣는다.
const MD_RE = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|---\s*$)|\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)/m
export const looksLikeMarkdown = (text: string) => MD_RE.test(text)

export function markdownPaste(view: EditorView, e: ClipboardEvent) {
  const cb = e.clipboardData
  const text = cb?.getData('text/plain') ?? ''
  // 서식이 있는 HTML이 같이 왔으면 그쪽을 쓴다
  if (!text || !looksLikeMarkdown(text) || /<(strong|b|em|h[1-6]|ul|ol|li|a|table|blockquote)\b/i.test(cb?.getData('text/html') ?? '')) return false
  const ed = (view.dom as HTMLElement & { editor?: Editor }).editor
  if (!ed) return false
  return ed.commands.insertContent(text, { contentType: 'markdown' })
}

/** 마크다운 글 → 상자용 HTML (보이지 않는 에디터로 변환) */
export function markdownToHtml(md: string): string {
  const ed = new Editor({ element: document.createElement('div'), extensions: richExtensions(), content: '' })
  ed.commands.setContent(md, { contentType: 'markdown' })
  const out = ed.isEmpty ? '' : ed.getHTML().replace(/(<p><\/p>)+$/, '')
  ed.destroy()
  return out
}

export type Fmt = (c: ChainedCommands) => ChainedCommands

/** 편집 중이 아닌 상자 전체에 서식 적용 (보이지 않는 에디터로 처리) */
export function applyToHtml(html: string, fn: Fmt): string {
  const ed = new Editor({ element: document.createElement('div'), extensions: richExtensions(), content: html || '' })
  fn(ed.chain().selectAll()).run()
  const out = ed.isEmpty ? '' : ed.getHTML()
  ed.destroy()
  return out
}

export const htmlOf = (ed: Editor) => (ed.isEmpty ? '' : ed.getHTML())

const cache = new Map<string, string>()
export const sanitize = (html: string) => {
  let s = cache.get(html)
  if (s === undefined) { s = DOMPurify.sanitize(html); cache.set(html, s) }
  return s
}

export const linksIn = (html: string) => [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))]
