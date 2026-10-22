import type { BoxData, EdgeData, Shape } from './types'

export const SHAPES: { id: Shape; label: string }[] = [
  { id: 'rect', label: '사각형' },
  { id: 'round', label: '둥근 사각형' },
  { id: 'ellipse', label: '원' },
  { id: 'diamond', label: '마름모' },
  { id: 'para', label: '평행사변형' },
  { id: 'hex', label: '육각형' },
]

const slant = (h: number, w: number) => Math.min(h * 0.32, w * 0.2)

/** 도형 외곽선 (0,0)-(w,h) */
export function shapePath(s: Shape, w: number, h: number): string {
  if (s === 'ellipse') return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z`
  if (s === 'diamond') return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`
  if (s === 'para') { const k = slant(h, w); return `M${k} 0H${w}L${w - k} ${h}H0Z` }
  if (s === 'hex') { const k = slant(h, w); return `M${k} 0H${w - k}L${w} ${h / 2}L${w - k} ${h}H${k}L0 ${h / 2}Z` }
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
    default: return { w: cw + 32, h: ch + 20 }
  }
}

export const defaultBox = (shape: Shape): BoxData => ({
  shape, title: '', body: '', media: [], fill: null, stroke: null, strokeWidth: 1.5, dash: 'solid', wrap: null,
})

export const defaultEdge = (): EdgeData => ({ kind: 'bezier', arrow: 'end', dashed: false, color: null, width: 1.5, label: '' })
