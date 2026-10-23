// AI(Claude, ChatGPT 등)가 만든 도식 코드 → Logic Note 상자/연결선
// 파싱: Mermaid 공식 파서(flowchart·mindmap), ts-graphviz(Graphviz DOT)
// 배치: dagre 자동 레이아웃. 무거운 라이브러리는 실제로 가져올 때만 불러온다.
import type { MermaidConfig } from 'mermaid'
import { textVars } from './color'
import { plain, uid } from './db'
import { defaultBox, defaultEdge, outerSize } from './shapes'
import type { BoxNode, EdgeData, LogicEdge, Shape } from './types'

type Dir = 'TB' | 'BT' | 'LR' | 'RL'
interface GNode { key: string; text: string; shape: Shape; fill?: string; stroke?: string; strokeWidth?: number; dash?: 'dashed' | 'none'; color?: string }
interface GEdge { from: string; to: string; label: string; arrow: EdgeData['arrow']; dashed: boolean; width?: number; color?: string }
interface Graph { dir: Dir; title: string; nodes: GNode[]; edges: GEdge[] }
export interface Imported { title: string; nodes: BoxNode[]; edges: LogicEdge[]; source: 'Mermaid' | 'Graphviz' }

export const AI_PROMPT = `아래 내용을 논리 도식으로 그려줘. 설명 없이 Mermaid flowchart 코드 블록 하나로만 답해줘.
- 전제·근거는 둥근 상자 A(…), 판단·조건은 마름모 B{…}, 결론은 사각형 C[…]
- 화살표에 필요하면 라벨을 붙여줘: A -->|이유| B
- 한 상자 안에서 줄을 바꿀 땐 <br>

내용: `

// ── 감지 ──
const DOT_RE = /^\s*(strict\s+)?(di)?graph(\s+("[^"]*"|[\w.]+))?\s*\{/i
const MERMAID_RE = /^\s*(flowchart|graph)(\s+(TB|TD|BT|LR|RL))?\s*;?\s*$|^\s*mindmap\s*$/im
// 지원하지 않는 Mermaid 도식도 알아봐서 '지원 안 함'을 안내한다
const MERMAID_OTHER_RE = /^\s*(sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|timeline|quadrantChart|gitGraph|requirementDiagram|C4\w+|sankey(-beta)?|xychart(-beta)?|block(-beta)?|packet(-beta)?|kanban|architecture(-beta)?|radar(-beta)?)\b/

/** AI 답변 전체를 붙여넣어도 코드 블록만 골라낸다 */
export function extractCode(text: string): string {
  const blocks = [...text.matchAll(/```[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), code: m[2] }))
  const pick = blocks.find((b) => /^(mermaid|dot|graphviz|gv)$/.test(b.lang)) ?? blocks.find((b) => kindOf(b.code))
  return (pick?.code ?? text).trim()
}

function kindOf(code: string): 'mermaid' | 'dot' | null {
  const body = code.replace(/^\s*---\n[\s\S]*?\n---\s*\n/, '').replace(/^\s*(%%[^\n]*\n\s*)+/, '')
  if (DOT_RE.test(body)) return 'dot'
  const first = body.split('\n').find((l) => l.trim()) ?? ''
  return MERMAID_RE.test(first) || MERMAID_OTHER_RE.test(first) ? 'mermaid' : null
}

export const looksLikeDiagram = (text: string) => !!kindOf(extractCode(text))

// ── 공통 도우미 ──
let ctx: CanvasRenderingContext2D | null = null
const canvas = () => (ctx ??= document.createElement('canvas').getContext('2d')!)

/** CSS/Graphviz 색 이름·#rgb·rgb() → #RRGGBB (모르면 undefined) */
function toHex(c?: string): string | undefined {
  const v = c?.trim().replace(/\s*!important$/, '')
  if (!v || v === 'none' || v === 'transparent') return
  const g = canvas()
  g.fillStyle = '#010203'
  g.fillStyle = v
  const out = String(g.fillStyle)
  if (out === '#010203') return
  if (out.startsWith('#')) return out.toUpperCase()
  const m = out.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
  return m ? '#' + m.slice(1, 4).map((n) => Math.round(+n).toString(16).padStart(2, '0')).join('').toUpperCase() : undefined
}

const WIDTHS = [1, 1.5, 2.5, 4]
const snapWidth = (w?: string | number) => {
  const n = parseFloat(String(w ?? ''))
  return Number.isFinite(n) ? WIDTHS.reduce((a, b) => (Math.abs(b - n) <= Math.abs(a - n) ? b : a)) : undefined
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const decode = (s: string) =>
  s.replace(/#quot;/g, '"').replace(/#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')

/** 라벨 → 제목(첫 줄) + 설명(나머지). **굵게**, *기울임* 정도의 마크다운만 살린다 */
function labelHtml(text: string, color?: string) {
  const lines = decode(text).replace(/^["'`]|["'`]$/g, '').split(/<br\s*\/?>|\\n|\n/i)
    .map((l) => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean)
  const inline = (l: string) => {
    const h = esc(l).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>').replace(/_(.+?)_/g, '<em>$1</em>')
    return color ? `<span data-tc="${color}" style="${textVars(color)}">${h}</span>` : h
  }
  const para = (l: string) => `<p>${inline(l)}</p>`
  return { title: lines[0] ? para(lines[0]) : '', body: lines.slice(1).map(para).join('') }
}

/** 글자 폭으로 상자 크기 추정 (실제 크기는 화면에서 다시 맞춰진다) */
function estimate(shape: Shape, title: string, body: string) {
  const g = canvas(), font = getComputedStyle(document.body).fontFamily
  const lines = (html: string, size: number, weight: number) => {
    g.font = `${weight} ${size}px ${font}`
    const ws = [...html.matchAll(/<p>(.*?)<\/p>/g)].map((m) => g.measureText(plain(m[1])).width)
    return { w: Math.max(0, ...ws.map((w) => Math.min(w, 260))), n: ws.reduce((a, w) => a + Math.max(1, Math.ceil(w / 260)), 0) }
  }
  const t = lines(title, 15, 600), b = lines(body, 13, 400)
  const cw = Math.max(60, t.w, b.w) + 2
  const ch = Math.max(20, t.n * 20.7 + b.n * 19.5 + (t.n && b.n ? 3 : 0))
  return outerSize(shape, cw, ch)
}

// ── Mermaid ──
const MERMAID_SHAPES: Record<string, Shape> = {
  square: 'rect', rect: 'rect', subroutine: 'rect', subproc: 'rect', 'fr-rect': 'rect', odd: 'rect', doc: 'rect', docs: 'rect', text: 'rect',
  round: 'round', rounded: 'round', stadium: 'round', pill: 'round', terminal: 'round', cylinder: 'round', cyl: 'round', db: 'round', database: 'round',
  circle: 'ellipse', circ: 'ellipse', doublecircle: 'ellipse', 'dbl-circ': 'ellipse', ellipse: 'ellipse', 'sm-circ': 'ellipse', 'f-circ': 'ellipse', start: 'ellipse', stop: 'ellipse',
  diamond: 'diamond', diam: 'diamond', decision: 'diamond', question: 'diamond',
  hexagon: 'hex', hex: 'hex', prepare: 'hex',
  lean_right: 'para', lean_left: 'para', 'lean-r': 'para', 'lean-l': 'para', 'in-out': 'para', 'out-in': 'para',
  trapezoid: 'para', inv_trapezoid: 'para', 'trap-t': 'para', 'trap-b': 'para', priority: 'para', 'manual-input': 'para',
}
const MINDMAP_SHAPES: Record<number, Shape> = { 1: 'round', 2: 'rect', 3: 'ellipse', 4: 'round', 5: 'round', 6: 'hex' }

const styleMap = (styles: string[]) =>
  Object.fromEntries(styles.flatMap((s) => s.split(';')).map((s) => s.split(':')).filter((p) => p.length > 1).map(([k, ...v]) => [k.trim().toLowerCase(), v.join(':').trim()]))

function boxStyle(st: Record<string, string>): Partial<GNode> {
  return {
    fill: toHex(st.fill), stroke: toHex(st.stroke), strokeWidth: snapWidth(st['stroke-width']), color: toHex(st.color),
    dash: st['stroke-dasharray'] ? 'dashed' : st.stroke === 'none' || st['stroke-width'] === '0' ? 'none' : undefined,
  }
}

async function parseMermaid(code: string): Promise<Graph> {
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' } as MermaidConfig)
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(code)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = diagram.db as any
  const title = (db.getDiagramTitle?.() as string) || ''

  if (diagram.type === 'mindmap') {
    const nodes: GNode[] = [], edges: GEdge[] = []
    const walk = (n: { id: number; descr: string; type: number; children: typeof n[] }, parent?: string) => {
      const key = String(n.id)
      nodes.push({ key, text: n.descr, shape: MINDMAP_SHAPES[n.type] ?? (parent ? 'round' : 'ellipse') })
      if (parent) edges.push({ from: parent, to: key, label: '', arrow: 'none', dashed: false })
      n.children.forEach((c) => walk(c, key))
    }
    const root = db.getMindmap()
    if (root) walk(root)
    return { dir: 'LR', title, nodes, edges }
  }
  if (!diagram.type.startsWith('flowchart') && diagram.type !== 'graph')
    throw new Error(`'${diagram.type}' 도식은 아직 지원하지 않아요. flowchart(graph)나 mindmap으로 요청해 주세요.`)

  const classes: Map<string, { styles: string[]; textStyles?: string[] }> = db.getClasses()
  const cls = (name: string) => [...(classes.get(name)?.styles ?? []), ...(classes.get(name)?.textStyles ?? [])]
  const verts: Map<string, { id: string; text?: string; type?: string; styles: string[]; classes: string[] }> = db.getVertices()
  const groups = new Set((db.getSubGraphs() as { id: string }[]).map((s) => s.id))
  const nodes = [...verts.values()].filter((v) => !groups.has(v.id)).map((v): GNode => ({
    key: v.id,
    text: v.text || v.id,
    shape: MERMAID_SHAPES[v.type ?? ''] ?? 'rect',
    ...boxStyle(styleMap([...cls('default'), ...v.classes.flatMap(cls), ...v.styles])),
    ...(v.type === 'text' ? { dash: 'none' as const } : {}),
  }))
  const keys = new Set(nodes.map((n) => n.key))
  const edges = (db.getEdges() as { start: string; end: string; type?: string; stroke?: string; text: string; style?: string[] }[])
    .filter((e) => keys.has(e.start) && keys.has(e.end) && e.stroke !== 'invisible')
    .map((e): GEdge => ({
      from: e.start, to: e.end, label: decode(e.text ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim(),
      arrow: e.type?.startsWith('double_') ? 'both' : e.type === 'arrow_open' ? 'none' : 'end',
      dashed: e.stroke === 'dotted', width: e.stroke === 'thick' ? 2.5 : undefined,
      color: toHex(styleMap(e.style ?? []).stroke),
    }))
  const d = String(db.getDirection?.() ?? 'TB').toUpperCase()
  return { dir: d === 'TD' ? 'TB' : (['TB', 'BT', 'LR', 'RL'].includes(d) ? d : 'TB') as Dir, title, nodes, edges }
}

// ── Graphviz DOT ──
const DOT_SHAPES: Record<string, Shape> = {
  box: 'rect', rect: 'rect', rectangle: 'rect', square: 'rect', record: 'rect', component: 'rect', note: 'rect', tab: 'rect', folder: 'rect',
  plaintext: 'rect', plain: 'rect', none: 'rect', underline: 'rect', Mrecord: 'round', cylinder: 'round',
  ellipse: 'ellipse', oval: 'ellipse', circle: 'ellipse', doublecircle: 'ellipse', point: 'ellipse', egg: 'ellipse',
  diamond: 'diamond', Mdiamond: 'diamond',
  parallelogram: 'para', trapezium: 'para', invtrapezium: 'para', house: 'para', invhouse: 'para',
  hexagon: 'hex', octagon: 'hex', doubleoctagon: 'hex',
}

async function parseDot(code: string): Promise<Graph> {
  const { fromDot } = await import('ts-graphviz')
  const g = fromDot(code)
  type Attrs = { get(k: string): unknown }
  const get = (a: Attrs, k: string) => { const v = a.get(k); return v == null ? undefined : String(v) }
  type Sub = { nodes: readonly { id: string; attributes: Attrs }[]; edges: readonly { targets: readonly unknown[]; attributes: Attrs }[]; subgraphs: readonly Sub[]; attributes: { node: Attrs; edge: Attrs } }
  const root = g as unknown as Sub

  const declared = new Map<string, { attrs: Attrs; defaults: Attrs }>()
  const rawEdges: { from: string; to: string; attrs: Attrs; defaults: Attrs }[] = []
  const ids = (t: unknown): string[] => (Array.isArray(t) ? t.flatMap(ids) : [(t as { id: string }).id])
  const walk = (s: Sub) => {
    for (const n of s.nodes) declared.set(n.id, { attrs: n.attributes, defaults: s.attributes.node })
    for (const e of s.edges)
      for (let i = 0; i + 1 < e.targets.length; i++)
        for (const a of ids(e.targets[i])) for (const b of ids(e.targets[i + 1])) rawEdges.push({ from: a, to: b, attrs: e.attributes, defaults: s.attributes.edge })
    s.subgraphs.forEach(walk)
  }
  walk(root)
  for (const e of rawEdges) for (const id of [e.from, e.to]) if (!declared.has(id)) declared.set(id, { attrs: { get: () => undefined }, defaults: root.attributes.node })

  const pick = (x: { attrs: Attrs; defaults: Attrs }, k: string) => get(x.attrs, k) ?? get(x.defaults, k)
  const nodes = [...declared].map(([id, x]): GNode => {
    const style = pick(x, 'style') ?? ''
    const shapeName = pick(x, 'shape') ?? 'ellipse'
    const filled = /filled/.test(style)
    return {
      key: id,
      text: (pick(x, 'label') ?? id).replace(/\\N/g, id).replace(/\\[lr]/g, '\n'),
      shape: shapeName === 'box' && /rounded/.test(style) ? 'round' : DOT_SHAPES[shapeName] ?? 'rect',
      fill: toHex(pick(x, 'fillcolor') ?? (filled ? pick(x, 'color') : undefined)),
      stroke: filled && !pick(x, 'fillcolor') ? undefined : toHex(pick(x, 'color')),
      strokeWidth: snapWidth(pick(x, 'penwidth')),
      color: toHex(pick(x, 'fontcolor')),
      dash: /dashed|dotted/.test(style) ? 'dashed' : /invis/.test(style) || ['plaintext', 'plain', 'none'].includes(shapeName) ? 'none' : undefined,
    }
  })
  const directed = (g as unknown as { directed: boolean }).directed
  const edges = rawEdges.map((e): GEdge => {
    const p = (k: string) => get(e.attrs, k) ?? get(e.defaults, k)
    const dir = p('dir') ?? (directed ? 'forward' : 'none')
    return {
      from: e.from, to: e.to, label: (p('label') ?? p('xlabel') ?? '').replace(/\\n/g, ' '),
      arrow: dir === 'both' ? 'both' : dir === 'none' || p('arrowhead') === 'none' ? 'none' : 'end',
      dashed: /dashed|dotted/.test(p('style') ?? ''), width: snapWidth(p('penwidth')), color: toHex(p('color')),
    }
  })
  const rd = String((g as unknown as Attrs).get('rankdir') ?? 'TB').toUpperCase()
  return { dir: (['TB', 'BT', 'LR', 'RL'].includes(rd) ? rd : 'TB') as Dir, title: get(g as unknown as Attrs, 'label') ?? '', nodes, edges }
}

// ── 배치 ──
async function layout(gr: Graph, kind: EdgeData['kind']): Promise<{ nodes: BoxNode[]; edges: LogicEdge[] }> {
  const { default: dagre } = await import('@dagrejs/dagre')
  const dg = new dagre.graphlib.Graph({ multigraph: true })
  dg.setGraph({ rankdir: gr.dir, nodesep: 48, ranksep: 72, edgesep: 24 })
  dg.setDefaultEdgeLabel(() => ({}))
  const g2 = canvas()
  const built = gr.nodes.map((n) => {
    const { title, body } = labelHtml(n.text, n.color)
    return { n, id: uid(), title, body, size: estimate(n.shape, title, body) }
  })
  const idOf = new Map(built.map((b) => [b.n.key, b.id]))
  for (const b of built) dg.setNode(b.id, { width: b.size.w, height: b.size.h })
  const edges0 = gr.edges.filter((e) => e.from !== e.to)

  // 순환(피드백 루프): 코드에 적힌 순서대로 따라가다 되돌아가는 선을 '되먹임 선'으로 정한다.
  // dagre에는 거꾸로 알려 줘서, 흐름은 위→아래로 유지하고 되먹임 선만 옆으로 돌아가게 한다.
  const out = new Map<string, number[]>()
  edges0.forEach((e, i) => out.set(e.from, [...(out.get(e.from) ?? []), i]))
  const state = new Map<string, number>(), back = new Set<number>()
  const dfs = (v: string) => {
    state.set(v, 1)
    for (const i of out.get(v) ?? []) {
      const w = edges0[i].to
      if (state.get(w) === 1) back.add(i)
      else if (!state.get(w)) dfs(w)
    }
    state.set(v, 2)
  }
  gr.nodes.forEach((n) => state.get(n.key) || dfs(n.key))

  g2.font = `500 12px ${getComputedStyle(document.body).fontFamily}`
  edges0.forEach((e, i) => {
    const lw = e.label ? g2.measureText(e.label).width + 16 : 0
    const [a, b] = back.has(i) ? [e.to, e.from] : [e.from, e.to]
    dg.setEdge(idOf.get(a)!, idOf.get(b)!, { width: lw, height: e.label ? 20 : 0, labelpos: 'c' }, 'e' + i)
  })
  dagre.layout(dg)

  const pos = new Map<string, { x: number; y: number }>(built.map((b) => { const p = dg.node(b.id); return [b.id, { x: Math.round(p.x), y: Math.round(p.y) }] }))
  const size = new Map<string, { w: number; h: number }>(built.map((b) => [b.id, b.size]))
  const vertical = gr.dir === 'TB' || gr.dir === 'BT'

  /** 되먹임 선: 두 상자의 같은 쪽 면에서 나가 다른 상자들을 비켜 돌아간다. 덜 돌아가는 쪽을 고른다 */
  let loops = 0
  const detour = (s: string, t: string) => {
    const a = pos.get(s)!, b = pos.get(t)!, sa = size.get(s)!, sb = size.get(t)!
    const [lo, hi] = vertical ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)]
    const between = built.filter((n) => { const p = pos.get(n.id)!; const c = vertical ? p.y : p.x; return c >= lo && c <= hi })
    const edge = (p: { x: number; y: number }, z: { w: number; h: number }, dir: -1 | 1) =>
      vertical ? p.x + (dir * z.w) / 2 : p.y + (dir * z.h) / 2
    const need = (dir: -1 | 1) => {
      const own = dir < 0 ? Math.min(edge(a, sa, -1), edge(b, sb, -1)) : Math.max(edge(a, sa, 1), edge(b, sb, 1))
      const far = between.reduce((m, n) => { const v = edge(pos.get(n.id)!, n.size, dir); return dir < 0 ? Math.min(m, v) : Math.max(m, v) }, own)
      return Math.abs(own - far) + 32 + 16 * loops
    }
    const lowSide = need(-1) <= need(1)
    loops++
    const side = vertical ? (lowSide ? 'l' : 'r') : lowSide ? 't' : 'b'
    return { side, offset: Math.round(need(lowSide ? -1 : 1) - 16) }
  }
  const nodes = built.map((b): BoxNode => ({
    id: b.id, type: 'box', position: pos.get(b.id)!, measured: { width: Math.round(b.size.w), height: Math.round(b.size.h) },
    data: {
      ...defaultBox(b.n.shape), title: b.title, body: b.body,
      fill: b.n.fill ?? null, stroke: b.n.stroke ?? null, strokeWidth: b.n.strokeWidth ?? 1.5, dash: b.n.dash ?? 'solid',
    },
  }))
  const edges = edges0.map((e, i): LogicEdge => {
    const s = idOf.get(e.from)!, t = idOf.get(e.to)!
    const style = { ...defaultEdge(), kind, label: e.label, arrow: e.arrow, dashed: e.dashed, width: e.width ?? 1.5, color: e.color ?? null }
    if (back.has(i)) {
      const { side, offset } = detour(s, t)
      return { id: uid(), type: 'logic', source: s, sourceHandle: side, target: t, targetHandle: side, data: { ...style, kind: 'step', offset } }
    }
    const a = pos.get(s)!, b = pos.get(t)!, dx = b.x - a.x, dy = b.y - a.y
    const useVertical = vertical ? Math.abs(dx) < 2.5 * Math.abs(dy) : Math.abs(dy) > 2.5 * Math.abs(dx)
    const [sh, th] = useVertical ? (dy >= 0 ? ['b', 't'] : ['t', 'b']) : dx >= 0 ? ['r', 'l'] : ['l', 'r']
    return { id: uid(), type: 'logic', source: s, sourceHandle: sh, target: t, targetHandle: th, data: style }
  })
  return { nodes, edges }
}

/** 붙여넣은 텍스트(AI 답변 전체여도 됨)를 상자와 연결선으로 */
export async function parseDiagram(text: string, kind: EdgeData['kind'] = 'bezier'): Promise<Imported> {
  const code = extractCode(text)
  const k = kindOf(code)
  if (!k) throw new Error('Mermaid(flowchart·graph·mindmap) 또는 Graphviz(digraph) 코드를 찾지 못했어요.')
  let gr: Graph
  try {
    gr = k === 'dot' ? await parseDot(code) : await parseMermaid(code)
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    throw new Error(msg.includes('지원하지') ? msg : `코드를 읽지 못했어요: ${msg.split('\n')[0].slice(0, 160)}`)
  }
  if (!gr.nodes.length) throw new Error('도식에 상자가 없어요.')
  const { nodes, edges } = await layout(gr, kind)
  const title = gr.title || plain(nodes[0].data.title) || '가져온 도식'
  return { title, nodes, edges, source: k === 'dot' ? 'Graphviz' : 'Mermaid' }
}
