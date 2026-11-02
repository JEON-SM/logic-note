import type { BoxData, Defaults, EdgeData, Rel, Shape } from './types'

export const SHAPES: { id: Shape; label: string }[] = [
  { id: 'rect', label: '사각형' },
  { id: 'round', label: '둥근 사각형' },
  { id: 'ellipse', label: '원' },
  { id: 'diamond', label: '마름모' },
  { id: 'para', label: '평행사변형' },
  { id: 'hex', label: '육각형' },
]

/** 메모지: 접힌 모서리가 있는 종이. 글은 왼쪽 위부터 */
export const MEMOS: { id: Shape; label: string }[] = [
  { id: 'memo', label: '메모지' },
  { id: 'memo-lined', label: '줄 메모지' },
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
  { id: '=', label: '같음' },
  { id: '≠', label: '같지 않음' },
  { id: '≈', label: '비슷함' },
]
