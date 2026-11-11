// A4 용지 노트: 페이지를 아래로(기본) 또는 옆으로 이어 놓은 캔버스.
// 상자는 따로 페이지 번호를 갖지 않고, 가장 바깥 상자의 중심이 놓인 페이지에 속한다.
import { hierarchy, rectOf } from './sets'
import type { BoxNode, Paper } from './types'

type XY = { x: number; y: number }

/** A4 (210×297mm)를 96dpi로 */
export const A4 = { w: 794, h: 1123 }
export const PAGE_GAP = 56
/** 무한 캔버스 노트를 용지로 옮길 때 둘레 여백 */
const MARGIN = 56

export const pageSize = (p: Paper) => (p.landscape ? { w: A4.h, h: A4.w } : A4)
/** 다음 페이지까지의 거리 (넘기는 방향으로) */
export const pageStep = (p: Paper) => (p.side ? pageSize(p).w : pageSize(p).h) + PAGE_GAP
/** i번째 페이지 왼쪽 위 */
export const pageOrigin = (p: Paper, i: number): XY => (p.side ? { x: i * pageStep(p), y: 0 } : { x: 0, y: i * pageStep(p) })
/** 모든 페이지를 합친 크기 */
export const pagesSize = (p: Paper) => {
  const s = pageSize(p), n = p.pages.length * pageStep(p) - PAGE_GAP
  return p.side ? { w: n, h: s.h } : { w: s.w, h: n }
}

/** 점이 속한 페이지 (페이지 사이 틈은 가까운 쪽) */
export const pageAt = (p: Paper, pt: XY) =>
  Math.max(0, Math.min(p.pages.length - 1, Math.floor(((p.side ? pt.x : pt.y) + PAGE_GAP / 2) / pageStep(p))))

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
  for (const n of nodes) if (!parentOf.has(n.id)) out[pageAt(p, n.position)].push(n.id, ...descendants(n.id))
  return out
}

/**
 * old의 i번째 페이지에 있던 상자를 next의 to(i)번째 페이지 같은 자리로 옮긴다 (null이면 지움).
 * 순서 바꾸기·끼우기·지우기·방향 바꾸기를 모두 이걸로 한다.
 */
export function relocate(old: Paper, next: Paper, nodes: BoxNode[], to: (i: number) => number | null) {
  const d = new Map<string, XY | null>()
  nodesByPage(old, nodes).forEach((ids, i) => {
    const j = to(i), a = pageOrigin(old, i), b = j === null ? null : pageOrigin(next, j)
    for (const id of ids) d.set(id, b && { x: b.x - a.x, y: b.y - a.y })
  })
  return nodes.filter((n) => d.get(n.id) !== null).map((n) => {
    const v = d.get(n.id)
    return v && (v.x || v.y) ? { ...n, position: { x: n.position.x + v.x, y: n.position.y + v.y } } : n
  })
}

/** 무한 캔버스의 내용을 첫 페이지 왼쪽 위부터 놓고, 필요한 만큼 페이지를 만든다 */
export function fitToPaper(p: Paper, nodes: BoxNode[]) {
  if (!nodes.length) return { paper: p, nodes, overflow: false }
  const rs = nodes.map(rectOf)
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y))
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h))
  const { w, h } = pageSize(p)
  // 넘기는 방향과 직각인 쪽: 맞으면 가운데, 넘치면 여백에 맞춘다
  const cross = p.side ? y1 - y0 : x1 - x0, room = p.side ? h : w
  const off = cross <= room - MARGIN * 2 ? (room - cross) / 2 : MARGIN
  const dx = (p.side ? MARGIN : off) - x0, dy = (p.side ? off : MARGIN) - y0
  const count = Math.max(p.pages.length, Math.ceil(((p.side ? x1 - x0 : y1 - y0) + MARGIN * 2 + PAGE_GAP) / pageStep(p)))
  return {
    paper: count > p.pages.length ? { ...p, pages: [...p.pages, ...newPaper(false, count - p.pages.length).pages] } : p,
    nodes: nodes.map((n) => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy } })),
    overflow: cross > room,
  }
}
