import type { BoxData, Defaults, EdgeData, Rel, Shape } from './types'
import { t } from '../lib/i18n'

export const SHAPES: { id: Shape; label: string }[] = [
  { id: 'rect', label: t('사각형') },
  { id: 'round', label: t('둥근 사각형') },
  { id: 'ellipse', label: t('원') },
  { id: 'diamond', label: t('마름모') },
  { id: 'para', label: t('평행사변형') },
  { id: 'hex', label: t('육각형') },
]

/** 메모지: 접힌 모서리가 있는 종이. 글은 왼쪽 위부터 */
export const MEMOS: { id: Shape; label: string }[] = [
  { id: 'memo', label: t('메모지') },
  { id: 'memo-lined', label: t('줄 메모지') },
]
export const isMemo = (s: Shape) => s === 'memo' || s === 'memo-lined'
export const MEMO = { w: 200, h: 200, fill: '#FFF4C2', pad: 14, line: 24, fold: 18 }

const slant = (h: number, w: number) => Math.min(h * 0.32, w * 0.2)

/** 도형 외곽선 (0,0)-(w,h) */
export function shapePath(s: Shape, w: number, h: number): string {
  if (s === 'ellipse') return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z`
  if (s === 'diamond') return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`
  if (s === 'para') { const k = slant(h, w); return `M${k} 0H${w}L${w - k} ${h}H0Z` }
  if (s === 'hex') { const k = slant(h, w); return `M${k} 0H${w - k}L${w} ${h / 2}L${w - k} ${h}H${k}L0 ${h / 2}Z` }
  if (isMemo(s)) { const f = Math.min(MEMO.fold, w / 3, h / 3); return `M2 0H${w}V${h - f}L${w - f} ${h}H2A2 2 0 0 1 0 ${h - 2}V2A2 2 0 0 1 2 0Z` }
  const r = Math.min(s === 'round' ? 16 : 3, w / 2, h / 2)
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`
}

/** 내용 크기 → 도형 크기 (내용이 도형 안에 들어가도록) */
export function outerSize(s: Shape, cw: number, ch: number) {
  switch (s) {
    case 'ellipse': return { w: cw * 1.42 + 24, h: ch * 1.42 + 16 }
    // 마름모 안에 cw×ch 사각형이 들어가는 조건: W = cw + r·ch, H = ch + cw/r
    case 'diamond': return { w: cw + 2 * ch + 28, h: ch + cw / 2 + 20 }
    case 'para':
    case 'hex': { const h = ch + 20; return { w: cw + 32 + 2 * slant(h, cw + 32), h } }
    case 'round': return { w: cw + 40, h: ch + 22 }
    case 'memo':
    case 'memo-lined': return { w: cw + MEMO.pad * 2, h: ch + MEMO.pad * 2 }
    default: return { w: cw + 32, h: ch + 20 }
  }
}

/** 도형 크기 → 그 안에 들어가는 내용 크기 (outerSize의 반대) */
export function innerSize(s: Shape, w: number, h: number) {
  switch (s) {
    case 'ellipse': return { w: (w - 24) / 1.42, h: (h - 16) / 1.42 }
    // 마름모 안의 가장 큰 사각형은 가로세로 절반
    case 'diamond': return { w: w / 2 - 14, h: h / 2 - 10 }
    case 'para':
    case 'hex': return { w: w - 32 - 2 * slant(h, w), h: h - 20 }
    case 'round': return { w: w - 40, h: h - 22 }
    case 'memo':
    case 'memo-lined': return { w: w - MEMO.pad * 2, h: h - MEMO.pad * 2 }
    default: return { w: w - 32, h: h - 20 }
  }
}

/** 도형 외곽선을 따라 촘촘히 찍은 점 (테두리 위 가장 가까운 곳을 찾는 데 쓴다) */
export function outlinePoints(s: Shape, w: number, h: number, step = 1.5) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', shapePath(s, w, h))
  const len = p.getTotalLength(), n = Math.max(8, Math.ceil(len / step))
  return Array.from({ length: n }, (_, i) => { const q = p.getPointAtLength((i * len) / n); return { x: q.x, y: q.y } })
}

/** 연결점이 자석처럼 붙는 곳: 도형의 모서리와 각 변의 가운데 */
export function shapeAnchors(s: Shape, w: number, h: number) {
  const loop = (ps: number[][]) => ps.flatMap(([x, y], i) => {
    const [a, b] = ps[(i + 1) % ps.length]
    return [{ x, y }, { x: (x + a) / 2, y: (y + b) / 2 }]
  })
  if (s === 'ellipse') return Array.from({ length: 8 }, (_, i) => ({ x: (w / 2) * (1 + Math.cos((i * Math.PI) / 4)), y: (h / 2) * (1 + Math.sin((i * Math.PI) / 4)) }))
  if (s === 'diamond') return loop([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])
  if (s === 'para') { const k = slant(h, w); return loop([[k, 0], [w, 0], [w - k, h], [0, h]]) }
  if (s === 'hex') { const k = slant(h, w); return loop([[k, 0], [w - k, 0], [w, h / 2], [w - k, h], [k, h], [0, h / 2]]) }
  if (isMemo(s)) { const f = Math.min(MEMO.fold, w / 3, h / 3); return loop([[0, 0], [w, 0], [w, h - f], [w - f, h], [0, h]]) }
  // 둥근 모서리는 호의 한가운데
  const r = Math.min(s === 'round' ? 16 : 3, w / 2, h / 2), e = r * (1 - Math.SQRT1_2)
  return [[e, e], [w - e, e], [w - e, h - e], [e, h - e], [w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]].map(([x, y]) => ({ x, y }))
}

/** 연결점에서 가장 가까운 변 (선이 나가는 방향) */
export function portSide(u: number, v: number): 't' | 'r' | 'b' | 'l' {
  const d = [['t', v], ['r', 1 - u], ['b', 1 - v], ['l', u]] as const
  return d.reduce((a, b) => (b[1] < a[1] ? b : a))[0]
}

export const defaultBox = (shape: Shape): BoxData => ({
  shape, title: '', body: '', media: [], fill: null, stroke: null, strokeWidth: 1.5, dash: 'solid', wrap: null,
})

export const defaultEdge = (): EdgeData => ({ kind: 'bezier', arrow: 'end', dashed: false, color: null, width: 1.5, label: '' })

/** 처음 설치했을 때의 기본 모양: 사각형, 기본 색, 직선 화살표 */
export const BASE_DEFAULTS: Defaults = {
  shape: 'rect', fill: null, stroke: null,
  edge: { kind: 'straight', arrow: 'end', dashed: false, color: null, width: 1.5 },
}

export const RELS: { id: Rel; label: string }[] = [
  { id: '=', label: t('같음') },
  { id: '≠', label: t('같지 않음') },
  { id: '≈', label: t('비슷함') },
]
