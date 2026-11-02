// 집합: 상자 안의 상자. 위치는 모두 캔버스 절대 좌표(상자 중심)로 저장하고, data.parent로 포함 관계만 기록한다.
// 바깥 상자는 자기 크기(data.w·h)를 유지하는 틀이다. 안쪽 상자는 그 안에서 자유롭게 옮기고,
// 삐져나오면 틀이 그만큼 늘어난다(저절로 줄어들지는 않음).
import { innerSize, isMemo, outerSize } from './shapes'
import type { BoxNode, LogicEdge } from './types'

/** 바깥 상자의 크기, 머리글(제목·설명) 위치, 안에 몇 겹이 들어 있는지 */
export interface Frame { w: number; h: number; top: number; level: number }
export type Rect = { x: number; y: number; w: number; h: number }

const GAP = 12, PAD_X = 14, PAD_Y = 12

/** 부모 → 자식. 없는 부모·자기 자신·고리는 무시한다 */
export function hierarchy(nodes: BoxNode[]) {
  const ids = new Set(nodes.map((n) => n.id))
  const parentOf = new Map<string, string>()
  for (const n of nodes) if (n.data.parent && n.data.parent !== n.id && ids.has(n.data.parent)) parentOf.set(n.id, n.data.parent)
  for (const id of [...parentOf.keys()]) {
    const seen = new Set([id])
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) {
      if (seen.has(p)) { parentOf.delete(id); break }
      seen.add(p)
    }
  }
  const kids = new Map<string, string[]>()
  for (const [c, p] of parentOf) kids.set(p, [...(kids.get(p) ?? []), c])
  const depth = (id: string) => { let d = 0; for (let p = parentOf.get(id); p; p = parentOf.get(p)) d++; return d }
  const descendants = (id: string): string[] => (kids.get(id) ?? []).flatMap((c) => [c, ...descendants(c)])
  return { parentOf, kids, depth, descendants }
}

export const rectOf = (n: BoxNode, frame?: Frame): Rect => {
  const w = frame?.w ?? n.measured?.width ?? 0, h = frame?.h ?? n.measured?.height ?? 0
  return { x: n.position.x - w / 2, y: n.position.y - h / 2, w, h }
}

const hasText = (n: BoxNode) => !!(n.data.title || n.data.body || n.data.media.length)
const near = (a: number, b: number) => Math.abs(a - b) < 0.01
const same = (a: Frame | undefined, b: Frame) => !!a && near(a.w, b.w) && near(a.h, b.h) && a.top === b.top && a.level === b.level

/**
 * 안쪽에서 바깥으로 올라가며 바깥 상자의 틀을 맞춘다.
 * head: 상자 글 영역의 잰 크기, editing: 편집 중인 상자(빈 머리글도 자리를 잡는다).
 * 바뀐 게 없으면 같은 배열·객체를 돌려준다.
 */
export function layoutSets(nodes: BoxNode[], edges: LogicEdge[], prev: Record<string, Frame>, head: Map<string, { w: number; h: number }>, editing: string | null) {
  const { parentOf, kids, depth } = hierarchy(nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const frames: Record<string, Frame> = {}
  const pos = new Map<string, { x: number; y: number }>()
  const rect = (id: string) => rectOf({ ...byId.get(id)!, position: pos.get(id) ?? byId.get(id)!.position }, frames[id])

  const visit = (id: string): number => {
    const cs = kids.get(id)
    if (!cs) return 0
    const level = 1 + Math.max(...cs.map(visit))
    const rs = cs.map(rect)
    const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y))
    const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h))
    const n = byId.get(id)!
    const hd = hasText(n) || editing === id ? head.get(id) ?? { w: 0, h: 0 } : { w: 0, h: 0 }
    const hh = hd.h ? hd.h + GAP : 0
    const cw = Math.max(x1 - x0, hd.w) + PAD_X * 2, ch = y1 - y0 + hh + PAD_Y * 2
    // 안쪽 상자와 머리글을 품는 데 필요한 최소 영역
    const o = outerSize(n.data.shape, cw, ch)
    const cx = (x0 + x1) / 2, cy = (y0 - hh + y1) / 2
    let L = cx - o.w / 2, T = cy - o.h / 2, R = cx + o.w / 2, B = cy + o.h / 2
    // 지금 틀이 그걸 품고 있으면 그대로 (반 픽셀 오차는 무시)
    const { w, h } = n.data
    if (w && h) {
      const p = n.position, E = 0.5
      if (L > p.x - w / 2 - E) L = p.x - w / 2
      if (T > p.y - h / 2 - E) T = p.y - h / 2
      if (R < p.x + w / 2 + E) R = p.x + w / 2
      if (B < p.y + h / 2 + E) B = p.y + h / 2
    }
    const W = R - L, H = B - T
    const f = { w: W, h: H, top: Math.round((H - innerSize(n.data.shape, W, H).h) / 2 + PAD_Y), level }
    frames[id] = same(prev[id], f) ? prev[id] : f
    pos.set(id, { x: (L + R) / 2, y: (T + B) / 2 })
    return level
  }
  for (const n of nodes) if (!parentOf.has(n.id)) visit(n.id)

  let changed = false
  const out = nodes.map((n) => {
    const p = pos.get(n.id), z = depth(n.id), f = frames[n.id]
    const moved = p && (Math.abs(p.x - n.position.x) > 0.01 || Math.abs(p.y - n.position.y) > 0.01)
    // 틀 크기는 상자 자료에 남겨 둔다 (안쪽 상자를 옮겨도 틀이 그대로 있게)
    const resized = f && (Math.abs(f.w - (n.data.w ?? 0)) > 0.01 || Math.abs(f.h - (n.data.h ?? 0)) > 0.01)
    if (!moved && !resized && (n.zIndex ?? 0) === z) return n
    changed = true
    return { ...n, position: moved ? p! : n.position, zIndex: z, ...(resized && { data: { ...n.data, w: f.w, h: f.h } }) }
  })
  // 선은 이어진 상자 중 안쪽 것과 같은 높이에 (바깥 상자 바탕에 가리지 않게)
  let edgesChanged = false
  const outEdges = edges.map((e) => {
    const z = Math.max(byId.has(e.source) ? depth(e.source) : 0, byId.has(e.target) ? depth(e.target) : 0)
    if ((e.zIndex ?? 0) === z) return e
    edgesChanged = true
    return { ...e, zIndex: z }
  })
  const framesSame = Object.keys(frames).length === Object.keys(prev).length && Object.keys(frames).every((k) => frames[k] === prev[k])
  return { nodes: changed ? out : nodes, edges: edgesChanged ? outEdges : edges, frames: framesSame ? prev : frames }
}

/** 끌어다 놓을 곳: 점을 품은 상자 중 가장 안쪽(같으면 작은 것). skip은 후보에서 뺀다. 메모지에는 넣지 않는다 */
export function boxAt(nodes: BoxNode[], frames: Record<string, Frame>, x: number, y: number, skip: Set<string>) {
  const { depth } = hierarchy(nodes)
  let best: { id: string; d: number; a: number } | null = null
  for (const n of nodes) {
    if (skip.has(n.id) || isMemo(n.data.shape)) continue
    const r = rectOf(n, frames[n.id])
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue
    const d = depth(n.id), a = r.w * r.h
    if (!best || d > best.d || (d === best.d && a < best.a)) best = { id: n.id, d, a }
  }
  return best?.id ?? null
}
