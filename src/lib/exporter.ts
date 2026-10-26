// 노트 내보내기
// 그림: html-to-image (React Flow 공식 문서가 권하는 방식) → PNG / SVG
// 코드: Mermaid(직접 생성), Graphviz DOT(ts-graphviz의 toDot)
import { plain } from './db'
import type { EdgeAttributesObject, NodeAttributesObject } from 'ts-graphviz'
import type { BoxNode, LogicEdge, Shape } from './types'

// ── 공통 ──
/** 상자 글을 줄 단위로 (제목 줄들 + 설명 줄들) */
const lines = (html: string) =>
  [...html.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => plain(m[2])).filter(Boolean)
const textOf = (n: BoxNode) => [...lines(n.data.title), ...lines(n.data.body)]
const firstColor = (html: string) => html.match(/data-tc="(#[0-9A-Fa-f]{6})"/)?.[1]

/** 연결선이 주로 좌우로 이어지면 LR, 아니면 위→아래 */
const direction = (edges: LogicEdge[]) => {
  const side = edges.filter((e) => e.sourceHandle === 'r' || e.sourceHandle === 'l').length
  return side > edges.length / 2 ? 'LR' : 'TD'
}

// ── Mermaid ──
const MM_SHAPE: Record<Shape, [string, string]> = {
  rect: ['[', ']'], round: ['(', ')'], ellipse: ['((', '))'], diamond: ['{', '}'], para: ['[/', '/]'], hex: ['{{', '}}'],
}
const mq = (s: string) => s.replace(/"/g, '#quot;')

/** Claude·ChatGPT, Notion·GitHub·Obsidian이 읽을 수 있는 Mermaid flowchart */
export function toMermaid(nodes: BoxNode[], edges: LogicEdge[]): string {
  const id = new Map(nodes.map((n, i) => [n.id, 'n' + (i + 1)]))
  const out = [`flowchart ${direction(edges)}`]
  for (const n of nodes) {
    const [a, b] = MM_SHAPE[n.data.shape]
    out.push(`  ${id.get(n.id)}${a}"${textOf(n).map(mq).join('<br>') || ' '}"${b}`)
  }
  const linked = edges.filter((e) => id.has(e.source) && id.has(e.target))
  for (const e of linked) {
    const d = e.data!, both = d.arrow === 'both', end = d.arrow === 'end'
    const link = d.dashed ? (both ? '<-.->' : end ? '-.->' : '-.-')
      : d.width >= 2.5 ? (both ? '<==>' : end ? '==>' : '===')
      : both ? '<-->' : end ? '-->' : '---'
    out.push(`  ${id.get(e.source)} ${link}${d.label ? `|${mq(d.label)}|` : ''} ${id.get(e.target)}`)
  }
  for (const n of nodes) {
    const d = n.data, st: string[] = []
    if (d.fill) st.push(`fill:${d.fill}`)
    if (d.dash === 'none') st.push('stroke:none')
    else if (d.stroke) st.push(`stroke:${d.stroke}`)
    if (d.strokeWidth !== 1.5) st.push(`stroke-width:${d.strokeWidth}px`)
    if (d.dash === 'dashed') st.push('stroke-dasharray:5 4')
    const c = firstColor(d.title)
    if (c) st.push(`color:${c}`)
    if (st.length) out.push(`  style ${id.get(n.id)} ${st.join(',')}`)
  }
  linked.forEach((e, i) => { if (e.data?.color) out.push(`  linkStyle ${i} stroke:${e.data.color}`) })
  return out.join('\n')
}

// ── Graphviz DOT ──
const DOT_SHAPE: Record<Shape, string> = { rect: 'box', round: 'box', ellipse: 'ellipse', diamond: 'diamond', para: 'parallelogram', hex: 'hexagon' }
/** 값이 없는 속성은 빼고 넘긴다 */
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T

export async function toDotCode(nodes: BoxNode[], edges: LogicEdge[]): Promise<string> {
  const { Digraph, toDot } = await import('ts-graphviz')
  const g = new Digraph()
  g.set('rankdir', direction(edges) === 'LR' ? 'LR' : 'TB')
  g.attributes.node.set('fontname', 'Pretendard')
  g.attributes.edge.set('fontname', 'Pretendard')
  const byId = new Map(nodes.map((n, i) => {
    const d = n.data
    const style = [d.shape === 'round' && 'rounded', d.fill && 'filled', d.dash === 'dashed' && 'dashed'].filter(Boolean).join(',')
    return [n.id, g.createNode('n' + (i + 1), defined({
      label: textOf(n).join('\n') || ' ', shape: DOT_SHAPE[d.shape], style: style || undefined,
      fillcolor: d.fill ?? undefined, color: d.stroke ?? undefined, fontcolor: firstColor(d.title),
      penwidth: d.dash === 'none' ? 0 : d.strokeWidth !== 1.5 ? d.strokeWidth : undefined,
    }) as unknown as NodeAttributesObject)] as const
  }))
  for (const e of edges) {
    const a = byId.get(e.source), b = byId.get(e.target)
    if (!a || !b) continue
    const d = e.data!
    g.createEdge([a, b], defined({
      label: d.label || undefined, style: d.dashed ? 'dashed' : undefined, color: d.color ?? undefined,
      dir: d.arrow === 'both' ? 'both' : d.arrow === 'none' ? 'none' : undefined,
      penwidth: d.width !== 1.5 ? d.width : undefined,
    }) as unknown as EdgeAttributesObject)
  }
  return toDot(g)
}

// ── 그림 ──
const blobToDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) })

const inRange = (range: string, codes: Set<number>) =>
  range.split(',').some((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, '').split('-').map((h) => parseInt(h.replace('?', '0'), 16))
    const hi = b ?? (part.includes('?') ? parseInt(part.trim().replace(/^U\+/i, '').replace(/\?/g, 'F'), 16) : a)
    for (const c of codes) if (c >= a && c <= hi) return true
    return false
  })

/**
 * 그림에 넣을 글꼴 CSS. 한글 글꼴은 글자 범위별로 수십 조각이라
 * 노트에 실제로 쓰인 글자가 들어 있는 조각만 골라 넣는다.
 */
async function fontCss(text: string): Promise<string> {
  const codes = new Set([...text].map((c) => c.codePointAt(0)!))
  const sheets: { rules: CSSRuleList; base: string }[] = []
  for (const s of document.styleSheets) {
    try { sheets.push({ rules: s.cssRules, base: s.href ?? location.href }) } catch {
      // 다른 출처(Google Fonts) 스타일시트는 직접 받아 읽는다
      if (!s.href) continue
      try {
        const sheet = new CSSStyleSheet()
        sheet.replaceSync(await (await fetch(s.href)).text())
        sheets.push({ rules: sheet.cssRules, base: s.href })
      } catch { /* 오프라인이면 기본 글꼴로 */ }
    }
  }
  const used = new Set<string>()
  const css: string[] = []
  for (const { rules, base } of sheets)
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule)) continue
      const range = r.style.getPropertyValue('unicode-range')
      if (range && !inRange(range, codes)) continue
      const src = r.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/)?.[1]
      if (!src) continue
      const url = new URL(src, base).href
      if (used.has(url)) continue
      used.add(url)
      try {
        const data = await blobToDataUrl(await (await fetch(url)).blob())
        css.push(r.cssText.replace(/src:[^;]+;/, `src: url("${data}");`))
      } catch { /* 못 받은 조각은 건너뛴다 */ }
    }
  return css.join('\n')
}

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** 캔버스(.react-flow__viewport)를 노트 전체가 들어가게 찍는다 */
export async function captureImage(
  viewport: HTMLElement, bounds: { x: number; y: number; width: number; height: number },
  format: 'png' | 'svg', background: string, text: string,
): Promise<Blob> {
  const { toBlob, toSvg } = await import('html-to-image')
  const pad = 48
  const width = Math.ceil(bounds.width + pad * 2), height = Math.ceil(bounds.height + pad * 2)
  const options = {
    backgroundColor: background, width, height,
    pixelRatio: Math.min(2, 16000 / Math.max(width, height)),
    fontEmbedCSS: await fontCss(text),
    imagePlaceholder: PIXEL,
    filter: (el: HTMLElement) => !el.classList?.contains('react-flow__handle') && !el.classList?.contains('wrap-handle'),
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${pad - bounds.x}px, ${pad - bounds.y}px) scale(1)` },
  }
  if (format === 'svg') return (await fetch(await toSvg(viewport, options))).blob()
  const blob = await toBlob(viewport, options)
  if (!blob) throw new Error('그림을 만들지 못했어요.')
  return blob
}

/** 노트 안의 모든 글자 (글꼴 조각을 고르는 데 쓴다) */
export const noteChars = (nodes: BoxNode[], edges: LogicEdge[]) =>
  nodes.map((n) => textOf(n).join('')).join('') + edges.map((e) => e.data?.label ?? '').join('') + '0123456789'

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const fileName = (title: string, ext: string) => `${(title || '제목 없음').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.${ext}`
