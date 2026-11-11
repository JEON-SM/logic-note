// 상자 안의 상자. 위치는 모두 캔버스 절대 좌표(상자 중심)로 저장하고, data.parent로 포함 관계만 기록한다.
// 바깥 상자는 자기 크기를 그대로 지킨다: 안쪽 상자는 그 안에서 자유롭게 움직이고, 가장자리에 닿아도 틀이 늘어나지 않는다.
// 안쪽 상자의 중심이 바깥 상자 밖으로 나간 채 놓이면 그 상자에서 빠진다.
import { isMemo } from './shapes'
import type { BoxNode, LogicEdge } from './types'

export type Rect = { x: number; y: number; w: number; h: number }

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

/** 상자 영역: 정해 둔 크기, 아직 없으면 화면에서 잰 크기 */
export const rectOf = (n: BoxNode): Rect => {
  const w = n.data.w ?? n.measured?.width ?? 0, h = n.data.h ?? n.measured?.height ?? 0
  return { x: n.position.x - w / 2, y: n.position.y - h / 2, w, h }
}

export const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

/**
 * 안쪽 상자가 바깥 상자 위에 그려지도록 겹 순서(zIndex)를 맞춘다.
 * 선은 이어진 상자 중 안쪽 것과 같은 높이에 (바깥 상자 바탕에 가리지 않게). 바뀐 게 없으면 같은 배열
 */
export function layoutDepth(nodes: BoxNode[], edges: LogicEdge[]) {
  const { depth } = hierarchy(nodes)
  const z = new Map(nodes.map((n) => [n.id, depth(n.id)]))
  let changed = false
  const out = nodes.map((n) => {
    if ((n.zIndex ?? 0) === z.get(n.id)) return n
    changed = true
    return { ...n, zIndex: z.get(n.id) }
  })
  let edgesChanged = false
  const outEdges = edges.map((e) => {
    const d = Math.max(z.get(e.source) ?? 0, z.get(e.target) ?? 0)
    if ((e.zIndex ?? 0) === d) return e
    edgesChanged = true
    return { ...e, zIndex: d }
  })
  return { nodes: changed ? out : nodes, edges: edgesChanged ? outEdges : edges }
}

/** 점을 품은 상자 중 가장 안쪽(같으면 작은 것). skip은 후보에서 뺀다. 메모지에는 넣지 않는다 */
export function boxAt(nodes: BoxNode[], x: number, y: number, skip: Set<string>) {
  const { depth } = hierarchy(nodes)
  let best: { id: string; d: number; a: number } | null = null
  for (const n of nodes) {
    if (skip.has(n.id) || isMemo(n.data.shape)) continue
    const r = rectOf(n)
    if (!inside(r, x, y)) continue
    const d = depth(n.id), a = r.w * r.h
    if (!best || d > best.d || (d === best.d && a < best.a)) best = { id: n.id, d, a }
  }
  return best?.id ?? null
}

/** 사각형을 완전히 품는 상자 중 가장 안쪽 (그려서 만든 상자가 들어갈 곳) */
export function boxAround(nodes: BoxNode[], r: Rect) {
  const { depth } = hierarchy(nodes)
  let best: { id: string; d: number; a: number } | null = null
  for (const n of nodes) {
    if (isMemo(n.data.shape)) continue
    const b = rectOf(n)
    if (!(r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h)) continue
    const d = depth(n.id), a = b.w * b.h
    if (!best || d > best.d || (d === best.d && a < best.a)) best = { id: n.id, d, a }
  }
  return best?.id ?? null
}
