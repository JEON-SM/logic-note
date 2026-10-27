// 노트 내보내기
// 그림: html-to-image (React Flow 공식 문서가 권하는 방식) → PNG / SVG
// 코드: Mermaid(직접 생성), Graphviz DOT(ts-graphviz의 toDot), AI용 개요(글)
import { colorName } from './color'
import type { EdgeAttributesObject, NodeAttributesObject } from 'ts-graphviz'
import type { BoxNode, LogicEdge, Shape } from './types'

// ── 공통 ──
/** 서식 있는 글 → 줄 목록. 목록 항목엔 -, 1., [x] 표시를 붙인다 */
function lines(html: string): string[] {
  if (!html) return []
  const out: string[] = []
  const text = (el: Element) => (el.textContent ?? '').replace(/[^\S\n]+/g, ' ').trim()
  const list = (ul: Element, pad: string) => [...ul.children].forEach((li, i) => {
    const checked = li.getAttribute('data-checked')
    const mark = checked ? (checked === 'true' ? '[x]' : '[ ]') : ul.tagName === 'OL' ? `${Number(ul.getAttribute('start') ?? 1) + i}.` : '-'
    const own = li.cloneNode(true) as Element
    own.querySelectorAll('ul, ol').forEach((l) => l.remove())
    const t = [...own.querySelectorAll('p')].map(text).join(' ').replace(/\s+/g, ' ').trim() || text(own)
    if (t) out.push(`${pad}${mark} ${t}`)
    li.querySelectorAll('ul, ol').forEach((l) => { if (l.parentElement!.closest('li') === li) list(l, pad + '  ') })
  })
  const block = (el: Element, pad: string) => {
    for (const c of el.children) {
      if (c.tagName === 'UL' || c.tagName === 'OL') list(c, pad)
      else if (c.tagName === 'BLOCKQUOTE') block(c, pad + '> ')
      else out.push(...text(c).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => pad + l))
    }
  }
  block(new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n'), 'text/html').body, '')
  return out
}
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
const mq = (s: string) => s.replace(/"/g, '#quot;').replace(/</g, '#60;').replace(/>/g, '#62;').replace(/\|/g, '#124;')
/** 제목은 <b>로 감싸 설명과 구분한다 (가져올 때도 이걸 보고 제목을 나눈다) */
const mmLabel = (n: BoxNode) => {
  const t = lines(n.data.title).map(mq)
  return [t.length ? `<b>${t.join('<br>')}</b>` : '', ...lines(n.data.body).map(mq)].filter(Boolean).join('<br>') || ' '
}

/** Claude·ChatGPT, Notion·GitHub·Obsidian이 읽을 수 있는 Mermaid flowchart */
export function toMermaid(nodes: BoxNode[], edges: LogicEdge[]): string {
  const id = new Map(nodes.map((n, i) => [n.id, 'n' + (i + 1)]))
  const out = [`flowchart ${direction(edges)}`]
  for (const n of nodes) {
    const [a, b] = MM_SHAPE[n.data.shape]
    out.push(`  ${id.get(n.id)}${a}"${mmLabel(n)}"${b}`)
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
const hq = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** HTML 라벨: 제목은 <B>, 줄바꿈은 <BR/> */
const dotLabel = (n: BoxNode) => {
  const t = lines(n.data.title).map(hq)
  const parts = [t.length ? `<B>${t.join('<BR/>')}</B>` : '', ...lines(n.data.body).map(hq)].filter(Boolean)
  return parts.length ? `<${parts.join('<BR/>')}>` : ' '
}

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
      label: dotLabel(n), shape: DOT_SHAPE[d.shape], style: style || undefined,
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

// ── AI용 개요 ──
const SHAPE_NAME: Partial<Record<Shape, string>> = { ellipse: '원', diamond: '마름모', para: '평행사변형', hex: '육각형' }
const ARROW = { end: '→', both: '↔', none: '—' } as const

/**
 * AI에게 붙여넣을 글. 앞쪽은 연결을 따라 펼친 흐름(나무 모양),
 * 뒤쪽은 상자마다 설명·모양·색. 같은 상자를 다시 만나면 ↺로 표시하고 더 펼치지 않는다.
 */
export function toOutline(title: string, nodes: BoxNode[], edges: LogicEdge[]): string {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const linked = edges.filter((e) => byId.has(e.source) && byId.has(e.target))
  const lr = direction(linked) === 'LR'
  // 흐름 방향으로 먼저, 같은 줄(40px 안)이면 옆으로 읽는 순서
  const pos = (n: BoxNode) => (lr ? [Math.round(n.position.x / 40), n.position.y] : [Math.round(n.position.y / 40), n.position.x])
  const order = (a: BoxNode, b: BoxNode) => { const [a1, a2] = pos(a), [b1, b2] = pos(b); return a1 - b1 || a2 - b2 }
  const outs = new Map<string, LogicEdge[]>(), hasIn = new Set<string>()
  for (const e of linked) {
    outs.set(e.source, [...(outs.get(e.source) ?? []), e])
    hasIn.add(e.target)
  }

  const name = (n: BoxNode) => {
    const t = lines(n.data.title).join(' ')
    if (t) return t
    const b = lines(n.data.body)[0]
    return b ? (b.length > 40 ? b.slice(0, 40) + '…' : b) : '(빈 상자)'
  }
  const edgeMeta = (e: LogicEdge) => {
    const d = e.data!
    const m = [d.label && `"${d.label.replace(/\s+/g, ' ').trim()}"`, d.dashed && '점선', d.width >= 2.5 && '굵은 선', d.color && colorName(d.color)].filter(Boolean)
    return m.length ? `  (선: ${m.join(', ')})` : ''
  }

  const num = new Map<string, number>()
  const flow: string[] = []
  const visit = (n: BoxNode, depth: number, via?: LogicEdge) => {
    const head = '  '.repeat(depth) + (via ? ARROW[via.data!.arrow] + ' ' : '')
    const meta = via ? edgeMeta(via) : ''
    if (num.has(n.id)) return void flow.push(`${head}[${num.get(n.id)}] ${name(n)} ↺${meta}`)
    num.set(n.id, num.size + 1)
    flow.push(`${head}[${num.get(n.id)}] ${name(n)}${meta}`)
    for (const e of (outs.get(n.id) ?? []).sort((a, b) => order(byId.get(a.target)!, byId.get(b.target)!)))
      visit(byId.get(e.target)!, depth + 1, e)
  }
  const sorted = [...nodes].sort(order)
  const connected = sorted.filter((n) => outs.has(n.id) || hasIn.has(n.id))
  // 들어오는 선이 없는 상자부터, 남은 건(되먹임 고리) 위쪽 상자부터
  for (const n of [...connected.filter((n) => !hasIn.has(n.id)), ...connected]) {
    if (num.has(n.id)) continue
    if (flow.length) flow.push('')
    visit(n, 0)
  }
  const alone = sorted.filter((n) => !num.has(n.id))
  if (flow.length && alone.length) flow.push('')
  for (const n of alone) {
    num.set(n.id, num.size + 1)
    if (linked.length) flow.push(`[${num.get(n.id)}] ${name(n)} (연결 없음)`)
  }

  const details: string[] = []
  for (const n of [...nodes].sort((a, b) => num.get(a.id)! - num.get(b.id)!)) {
    const d = n.data, t = lines(d.title).join(' '), body = lines(d.body), tc = firstColor(d.title)
    const tags = [
      SHAPE_NAME[d.shape], d.fill && `${colorName(d.fill)} 채움`, d.dash !== 'none' && d.stroke && `${colorName(d.stroke)} 테두리`,
      d.dash === 'dashed' && '점선 테두리', d.dash === 'none' && '테두리 없음', tc && `글자 ${colorName(tc)}`,
    ].filter(Boolean)
    const media = [['image', '이미지'], ['video', '영상']]
      .map(([k, label]) => [label, d.media.filter((m) => m.kind === k).length] as const).filter(([, c]) => c).map(([l, c]) => `${l} ${c}개`)
    // 흐름에서 이미 다 보인 상자(제목뿐)는 다시 적지 않는다
    if (linked.length && t && !body.length && !tags.length && !media.length) continue
    details.push(`[${num.get(n.id)}] ${t || '(제목 없음)'}${tags.length ? `  (상자: ${tags.join(', ')})` : ''}`)
    details.push(...body.map((l) => '    ' + l))
    if (media.length) details.push(`    (첨부: ${media.join(', ')} — 글로 옮기지 못함)`)
  }

  const out = [
    `# ${title || '제목 없음'}`, '',
    `Logic Note에서 내보낸 논리 도식 · 상자 ${nodes.length}개 · 연결 ${linked.length}개`,
  ]
  if (linked.length) out.push(
    '읽는 법: [번호]는 상자. → 화살표, ↔ 양방향, — 방향 없는 선. (선: …)은 선에 붙은 말과 모양.',
    '↺는 위에 이미 나온 상자로 다시 이어진다는 뜻(되먹임·합류).',
    '', '## 흐름', '', ...flow,
  )
  if (details.length) out.push('', linked.length ? '## 상자 내용' : '## 상자', '', ...details)
  return out.join('\n')
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
