import { Editor, type ChainedCommands } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import DOMPurify from 'dompurify'
import { highlightAttrs, textVars } from './color'

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
  { label: '기본', value: '' },
  { label: '명조', value: "'Noto Serif KR', serif" },
  { label: '둥근 고딕', value: "'Gowun Dodum', sans-serif" },
  { label: '손글씨', value: "'Nanum Pen Script', cursive" },
  { label: '코드', value: "'JetBrains Mono', monospace" },
]
export const SIZES = [10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48]

export const richExtensions = (placeholder?: string) => [
  StarterKit.configure({
    heading: false, codeBlock: false, blockquote: false, horizontalRule: false, code: false,
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
  }),
  TextStyle, ThemedColor, FontFamily, FontSize, ThemedHighlight,
  TextAlign.configure({ types: ['paragraph'] }),
  TaskList, TaskItem.configure({ nested: true }),
  ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
]

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
