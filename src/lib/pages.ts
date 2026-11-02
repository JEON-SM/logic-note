// A4 용지 노트: 페이지를 위에서 아래로 쌓아 둔 캔버스.
// 상자는 따로 페이지 번호를 갖지 않고, 가장 바깥 상자의 중심이 놓인 페이지에 속한다.
import { hierarchy, rectOf, type Frame } from './sets'
import type { BoxNode, Paper } from './types'

/** A4 (210×297mm)를 96dpi로 */
export const A4 = { w: 794, h: 1123 }
export const PAGE_GAP = 56
/** 무한 캔버스 노트를 용지로 옮길 때 둘레 여백 */
const MARGIN = 56

export const pageSize = (p: Paper) => (p.landscape ? { w: A4.h, h: A4.w } : A4)
export const pageStep = (p: Paper) => pageSize(p).h + PAGE_GAP
export const pageTop = (p: Paper, i: number) => i * pageStep(p)
export const pagesHeight = (p: Paper) => p.pages.length * pageStep(p) - PAGE_GAP

/** y 위치가 속한 페이지 (페이지 사이 틈은 가까운 쪽) */
export const pageAt = (p: Paper, y: number) =>
  Math.max(0, Math.min(p.pages.length - 1, Math.floor((y + PAGE_GAP / 2) / pageStep(p))))

export type PaperKind = 'canvas' | 'a4' | 'a4-land'
export const paperKind = (p: Paper | null | undefined): PaperKind => (!p ? 'canvas' : p.landscape ? 'a4-land' : 'a4')
export const paperOf = (k: PaperKind) => (k === 'canvas' ? null : newPaper(k === 'a4-land'))

export const newPaper = (landscape = false, count = 1): Paper => ({
  size: 'a4', ...(landscape && { landscape: true }), pages: Array.from({ length: count }, () => crypto.randomUUID().slice(0, 8)),
})

/** 페이지별 상자 id (집합은 안의 상자까지 함께) */
export function nodesByPage(p: Paper, nodes: BoxNode[]) {
  const { parentOf, descendants } = hierarchy(nodes)
  const out = p.pages.map(() => [] as string[])
  for (const n of nodes) if (!parentOf.has(n.id)) out[pageAt(p, n.position.y)].push(n.id, ...descendants(n.id))
  return out
}

/** 각 상자를 dy만큼 옮긴 새 배열 */
export const shift = (nodes: BoxNode[], dy: Map<string, number>) =>
  nodes.map((n) => (dy.get(n.id) ? { ...n, position: { x: n.position.x, y: n.position.y + dy.get(n.id)! } } : n))

/** 무한 캔버스의 내용을 첫 페이지 왼쪽 위부터 놓고, 필요한 만큼 페이지를 만든다 */
export function fitToPaper(p: Paper, nodes: BoxNode[], frames: Record<string, Frame>) {
  if (!nodes.length) return { paper: p, nodes, overflow: false }
  const rs = nodes.map((n) => rectOf(n, frames[n.id]))
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y))
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h))
  const { w } = pageSize(p)
  // 폭이 맞으면 가운데, 넘치면 왼쪽 여백에 맞춘다
  const dx = (x1 - x0 <= w - MARGIN * 2 ? (w - (x1 - x0)) / 2 : MARGIN) - x0, dy = MARGIN - y0
  const count = Math.max(p.pages.length, Math.ceil((y1 - y0 + MARGIN * 2 + PAGE_GAP) / pageStep(p)))
  return {
    paper: count > p.pages.length ? { ...p, pages: [...p.pages, ...newPaper(false, count - p.pages.length).pages] } : p,
    nodes: nodes.map((n) => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } })),
    overflow: x1 - x0 > w,
  }
}
