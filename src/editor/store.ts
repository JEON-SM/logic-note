import { useMemo } from 'react'
import { create } from 'zustand'
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import type { Editor } from '@tiptap/core'
import { animate } from 'motion/react'
import { uid, updateNote } from '../lib/db'
import { fitToPaper, newPaper, nodesByPage, pageAt, pageOrigin, pageSize, pagesSize, paperKind, relocate, type PaperKind } from '../lib/pages'
import { applyToHtml, type Fmt } from '../lib/rich'
import { boxAt, hierarchy, layoutSets, rectOf, type Frame, type Rect } from '../lib/sets'
import { MEMO, defaultBox, defaultEdge, isMemo } from '../lib/shapes'
import { noteLook, type Theme } from '../lib/color'
import { useSettings, useTheme } from '../lib/store'
import type { Bg, BoxData, BoxNode, Defaults, EdgeData, LogicEdge, Note, Paper, Shape } from '../lib/types'

type Snap = { nodes: BoxNode[]; edges: LogicEdge[]; paper: Paper | null }
export type Tool = 'hand' | 'select' | 'place'

interface S {
  noteId: string
  title: string
  bg: Bg
  /** 바탕색 (null이면 테마 기본) */
  ground: string | null
  /** 이 노트만의 다크 모드 (null이면 앱 테마) */
  mode: Theme | null
  /** A4 용지 노트면 페이지 구성, 무한 캔버스면 null */
  paper: Paper | null
  /** 이 노트만의 기본 모양 (null이면 전체 설정) */
  defaults: Defaults | null
  nodes: BoxNode[]
  edges: LogicEdge[]
  /** 집합(안에 상자가 있는 상자)의 계산된 크기 */
  frames: Record<string, Frame>
  /** 끌고 있는 상자를 놓으면 들어갈 상자 */
  dropTarget: string | null
  /** '다른 상자에 넣기': 넣을 상자를 고르는 중인 상자들 */
  picking: string[] | null
  /** 손잡이로 크기를 바꾸고 있는 상자 (이때는 틀 움직임을 생략) */
  resizing: string | null
  editingId: string | null
  editingEdge: string | null
  active: Editor | null
  tool: Tool
  shape: Shape
  edgeStyle: EdgeData
  past: Snap[]
  future: Snap[]
  rev: number
}

export const useEd = create<S>(() => ({
  noteId: '', title: '', bg: 'grid', ground: null, mode: null, paper: null, defaults: null, nodes: [], edges: [], frames: {}, dropTarget: null, picking: null, resizing: null,
  editingId: null, editingEdge: null, active: null,
  tool: 'hand', shape: 'rect', edgeStyle: defaultEdge(), past: [], future: [], rev: 0,
}))
const get = useEd.getState
const set = useEd.setState

const clean = <T extends { selected?: boolean; dragging?: boolean }>(a: T[]) => a.map(({ selected, dragging, ...r }) => r as T)
const snap = (): Snap => ({ nodes: clean(get().nodes), edges: clean(get().edges), paper: get().paper })
const bump = () => get().rev + 1

/** 이 노트 바탕과, 그 위 내용을 그릴 밝기(theme) */
export function useLook() {
  const theme = useTheme(), ground = useEd((s) => s.ground), mode = useEd((s) => s.mode)
  return useMemo(() => noteLook(ground, mode, theme), [ground, mode, theme])
}

// ── 기본 모양 ──
/** 지금 노트에서 쓰는 기본값: 노트별 설정이 있으면 그것, 없으면 전체 설정 */
export const effDefaults = () => get().defaults ?? useSettings.getState().defaults
export function applyDefaults() {
  const d = effDefaults()
  set({ edgeStyle: { ...defaultEdge(), ...d.edge }, shape: d.shape })
}
export function setNoteDefaults(defaults: Defaults | null) {
  set({ defaults })
  applyDefaults()
}
// 전체 설정이 바뀌면, 그걸 따르는 노트에 바로 반영
useSettings.subscribe((s, p) => { if (s.defaults !== p.defaults && !get().defaults) applyDefaults() })

let loading = false
export function loadNote(n: Note) {
  loading = true
  set({
    noteId: n.id, title: n.title, bg: n.bg ?? 'grid', ground: n.ground ?? null, mode: n.mode ?? null, paper: n.paper ?? null, defaults: n.defaults ?? null, nodes: n.nodes, edges: n.edges, frames: {},
    editingId: null, editingEdge: null, dropTarget: null, picking: null, resizing: null, past: [], future: [], rev: 0, tool: 'hand',
  })
  applyDefaults()
  loading = false
}

// ── 자동 저장 ──
let timer: ReturnType<typeof setTimeout> | undefined
export function flushSave() {
  if (!timer) return
  clearTimeout(timer)
  timer = undefined
  const { noteId, title, bg, ground, mode, defaults } = get()
  if (noteId) updateNote(noteId, { title, bg, ground, mode, defaults, ...snap() })
}
useEd.subscribe((s, p) => {
  if (!loading && s.noteId && s.noteId === p.noteId && (s.rev !== p.rev || s.title !== p.title || s.bg !== p.bg || s.ground !== p.ground || s.mode !== p.mode || s.defaults !== p.defaults || s.paper !== p.paper)) {
    clearTimeout(timer)
    timer = setTimeout(flushSave, 600)
  }
})
addEventListener('pagehide', flushSave)

// ── 집합 배치 ──
// 상자 글 영역의 잰 크기 (BoxNode가 알려 준다). 바깥 상자의 머리글 자리를 잡는 데 쓴다
const heads = new Map<string, { w: number; h: number }>()
// 끄는 동안·미끄러지는 동안에는 틀을 다시 맞추지 않는다
let dragging = false
let moving = false
export function relayout() {
  if (dragging || moving) return
  const s = get()
  const r = layoutSets(s.nodes, s.edges, s.frames, heads, s.editingId)
  if (r.nodes !== s.nodes || r.edges !== s.edges || r.frames !== s.frames) set({ nodes: r.nodes, edges: r.edges, frames: r.frames })
}
useEd.subscribe((s, p) => { if (s.nodes !== p.nodes || s.edges !== p.edges || s.editingId !== p.editingId) relayout() })
export function reportHead(id: string, w: number, h: number) {
  const old = heads.get(id)
  if (old && old.w === w && old.h === h) return
  heads.set(id, { w, h })
  if (get().frames[id]) relayout()
}

// ── 실행 취소 ──
export function commit() { set((s) => ({ past: [...s.past.slice(-99), snap()], future: [] })) }
export function undo() {
  const p = get().past.at(-1)
  if (!p) return
  set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, snap()], ...p, editingId: null, rev: bump() }))
}
export function redo() {
  const f = get().future.at(-1)
  if (!f) return
  set((s) => ({ future: s.future.slice(0, -1), past: [...s.past, snap()], ...f, editingId: null, rev: bump() }))
}

export function onNodesChange(changes: NodeChange<BoxNode>[]) {
  // 크기 손잡이(NodeResizer)의 변경은 상자 자료의 w·h로 옮긴다. 손대지 않은 쪽은 자동 크기로 둔다
  const sized = new Map<string, { w?: number; h?: number }>()
  const ch = changes.map((c) => {
    if (c.type !== 'dimensions' || !c.setAttributes || !c.dimensions) return c
    const n = get().nodes.find((x) => x.id === c.id)
    const m = n?.measured, d = c.dimensions
    sized.set(c.id, {
      ...((n?.data.w || !m?.width || Math.abs(d.width - m.width) > 0.5) && { w: Math.round(d.width) }),
      ...((n?.data.h || !m?.height || Math.abs(d.height - m.height) > 0.5) && { h: Math.round(d.height) }),
    })
    return { ...c, setAttributes: undefined }
  })
  const content = ch.some((c) => c.type !== 'select' && c.type !== 'dimensions') || sized.size > 0
  set((s) => {
    let nodes = applyNodeChanges(ch, s.nodes)
    if (sized.size) nodes = nodes.map((n) => (sized.has(n.id) ? { ...n, data: { ...n.data, ...sized.get(n.id), wrap: null } } : n))
    // 바깥 상자를 끌면 안의 상자도 같이 움직인다 (크기 조절로 중심이 옮겨진 건 제외)
    const moves = ch.filter((c) => c.type === 'position' && c.position && !sized.has(c.id))
    if (moves.length) {
      const { descendants } = hierarchy(s.nodes)
      const moving = new Set(moves.map((c) => (c as { id: string }).id))
      const delta = new Map<string, XYPosition>()
      for (const c of moves) {
        if (c.type !== 'position' || !c.position) continue
        const old = s.nodes.find((n) => n.id === c.id)
        if (!old) continue
        const dx = c.position.x - old.position.x, dy = c.position.y - old.position.y
        if (dx || dy) for (const d of descendants(c.id)) if (!moving.has(d)) delta.set(d, { x: dx, y: dy })
      }
      if (delta.size) nodes = nodes.map((n) => { const d = delta.get(n.id); return d ? { ...n, position: { x: n.position.x + d.x, y: n.position.y + d.y } } : n })
    }
    // 바깥 상자를 지우면 안의 상자는 한 겹 바깥으로
    const removed = new Map(ch.filter((c) => c.type === 'remove').map((c) => [(c as { id: string }).id, s.nodes.find((n) => n.id === (c as { id: string }).id)?.data.parent ?? null]))
    if (removed.size) {
      const up = (p: string | null | undefined): string | null => (p && removed.has(p) ? up(removed.get(p)) : p ?? null)
      nodes = nodes.map((n) => (n.data.parent && removed.has(n.data.parent) ? { ...n, data: { ...n.data, parent: up(n.data.parent) } } : n))
    }
    return { nodes, rev: content ? s.rev + 1 : s.rev }
  })
}
export function onEdgesChange(ch: EdgeChange<LogicEdge>[]) {
  const content = ch.some((c) => c.type !== 'select')
  set((s) => ({ edges: applyEdgeChanges(ch, s.edges), rev: content ? s.rev + 1 : s.rev }))
}

export const selectedNodes = () => get().nodes.filter((n) => n.selected)
export const selectedEdges = () => get().edges.filter((e) => e.selected)

/** 방금 만든 상자 (BoxNode가 나타나는 움직임을 한 번 보여 주고 지운다) */
export const born = new Set<string>()

export function addBox(position: XYPosition, shape: Shape, patch: Partial<BoxData> = {}) {
  commit()
  const id = uid()
  born.add(id)
  const d = effDefaults()
  const memo = isMemo(shape) && { fill: MEMO.fill, stroke: null, dash: 'none' as const, w: MEMO.w, h: MEMO.h }
  const node: BoxNode = {
    id, type: 'box', position: clampToPaper(position), selected: true,
    data: { ...defaultBox(shape), fill: d.fill, stroke: d.stroke, ...memo, ...patch },
  }
  set((s) => ({
    nodes: [...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), node],
    edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    rev: s.rev + 1,
  }))
  return id
}

export function addLink(source: string, sourceHandle: string, target: string, targetHandle: string, record = true) {
  if (source === target) return
  if (record) commit()
  const edge: LogicEdge = { id: uid(), type: 'logic', source, sourceHandle, target, targetHandle, data: { ...get().edgeStyle } }
  set((s) => ({ edges: [...s.edges, edge], rev: s.rev + 1 }))
}

export function patchNodes(ids: string[], patch: Partial<BoxData> | ((d: BoxData) => Partial<BoxData>), record = true) {
  if (record) commit()
  set((s) => ({
    nodes: s.nodes.map((n) => (ids.includes(n.id) ? { ...n, data: { ...n.data, ...(typeof patch === 'function' ? patch(n.data) : patch) } } : n)),
    rev: s.rev + 1,
  }))
}

export function patchEdges(ids: string[], patch: Partial<EdgeData>) {
  commit()
  set((s) => ({ edges: s.edges.map((e) => (ids.includes(e.id) ? { ...e, data: { ...defaultEdge(), ...e.data, ...patch } } : e)), rev: s.rev + 1 }))
}

// ── 집합: 끌어서 넣고 빼기, 묶기 ──
let draggedIds = new Set<string>()
export function startDrag(ids: string[]) {
  commit()
  dragging = true
  const { descendants } = hierarchy(get().nodes)
  draggedIds = new Set(ids.flatMap((id) => [id, ...descendants(id)]))
}
/** 끄는 동안: 상자 중심이 어느 상자 안에 있는지 표시 */
export function dragOver(id: string) {
  const s = get()
  const n = s.nodes.find((x) => x.id === id)
  if (!n) return
  let target = boxAt(s.nodes, s.frames, n.position.x, n.position.y, draggedIds)
  // 원래 집합에 조금이라도 걸쳐 있으면 그 안에 남는다 (틀이 늘어남). 완전히 벗어나야 빠진다
  const p = n.data.parent && s.nodes.find((x) => x.id === n.data.parent)
  if (p && target !== p.id && !(target && hierarchy(s.nodes).descendants(p.id).includes(target))) {
    const a = rectOf(n), b = rectOf(p, s.frames[p.id])
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) target = p.id
  }
  if (target !== s.dropTarget) set({ dropTarget: target })
}
/** 놓을 때: 함께 끈 상자 중 가장 바깥 것들을 표시된 상자 안으로 (빈 곳이면 밖으로) */
export function finishDrag(ids: string[]) {
  dragging = false
  const s = get()
  const { parentOf } = hierarchy(s.nodes)
  const moved = new Set(ids)
  const tops = ids.filter((id) => { for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (moved.has(p)) return false; return true })
  const target = s.dropTarget
  const change = tops.filter((id) => (parentOf.get(id) ?? null) !== target)
  set((st) => ({
    dropTarget: null,
    nodes: change.length ? st.nodes.map((n) => (change.includes(n.id) ? { ...n, data: { ...n.data, parent: target } } : n)) : st.nodes,
    rev: st.rev + 1,
  }))
  relayout()
  // 용지 노트: 종이 밖에 놓으면 가장 가까운 종이 안으로 돌아온다
  const paper = get().paper
  if (!paper) return
  const all = pagesSize(paper)
  const back = new Map<string, XYPosition>()
  for (const id of tops) {
    const c = get().nodes.find((n) => n.id === id)?.position
    if (!c) continue
    const x = Math.min(all.w - 20, Math.max(20, c.x)), y = Math.min(all.h - 20, Math.max(20, c.y))
    if (x !== c.x || y !== c.y) back.set(id, { x: x - c.x, y: y - c.y })
  }
  if (back.size) glide(back, () => {})
}

/** 선택한 상자들을 새 상자로 감싼다 (Ctrl+G) */
export function groupSelection() {
  const sel = selectedNodes()
  if (!sel.length) return
  const { parentOf } = hierarchy(get().nodes)
  const ids = new Set(sel.map((n) => n.id))
  const tops = sel.filter((n) => { for (let p = parentOf.get(n.id); p; p = parentOf.get(p)) if (ids.has(p)) return false; return true })
  const outer = new Set(tops.map((n) => parentOf.get(n.id) ?? null))
  const rs = tops.map((n) => rectOf(n, get().frames[n.id]))
  const x = (Math.min(...rs.map((r) => r.x)) + Math.max(...rs.map((r) => r.x + r.w))) / 2
  const y = (Math.min(...rs.map((r) => r.y)) + Math.max(...rs.map((r) => r.y + r.h))) / 2
  const id = addBox({ x, y }, 'round', { fill: null, parent: outer.size === 1 ? [...outer][0] : null })
  set((s) => ({ nodes: s.nodes.map((n) => (tops.some((t) => t.id === n.id) ? { ...n, data: { ...n.data, parent: id } } : n)) }))
  startEditing(id)
}

// ── 움직임: 상자를 새 자리로 미끄러지듯 옮긴 뒤 포함 관계를 바꾼다 ──
const EASE = [0.22, 1, 0.36, 1] as const
/** 각 상자(와 그 안의 상자)를 0.35초 동안 옮기고, 끝나면 done */
export function glide(delta: Map<string, XYPosition>, done: () => void) {
  const { descendants } = hierarchy(get().nodes)
  const all = new Map<string, XYPosition>()
  for (const [id, d] of delta) for (const x of [id, ...descendants(id)]) all.set(x, d)
  const from = new Map(get().nodes.filter((n) => all.has(n.id)).map((n) => [n.id, n.position]))
  const at = (t: number) => (s: S) => ({
    nodes: s.nodes.map((n) => { const d = all.get(n.id), p = from.get(n.id); return d && p ? { ...n, position: { x: p.x + d.x * t, y: p.y + d.y * t } } : n }),
  })
  const finish = () => { set(at(1)); moving = false; done(); set((s) => ({ rev: s.rev + 1 })); relayout() }
  if (![...all.values()].some((d) => d.x || d.y) || matchMedia('(prefers-reduced-motion: reduce)').matches) return finish()
  moving = true
  animate(0, 1, { duration: 0.35, ease: EASE, onUpdate: (t) => set(at(t)), onComplete: finish })
}

const topsOf = (ids: string[]) => {
  const { parentOf } = hierarchy(get().nodes)
  const all = new Set(ids)
  return ids.filter((id) => { for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (all.has(p)) return false; return true })
}
const unionRect = (rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y))
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y }
}
const rectById = (id: string) => rectOf(get().nodes.find((x) => x.id === id)!, get().frames[id])

/** 선택한 상자를 한 겹 바깥으로 꺼낸다: 원래 집합 오른쪽으로 비켜 나간다 */
export function takeOut(ids: string[]) {
  const { parentOf } = hierarchy(get().nodes)
  const inner = topsOf(ids).filter((id) => parentOf.has(id))
  if (!inner.length) return
  commit()
  const delta = new Map<string, XYPosition>()
  for (const p of new Set(inner.map((id) => parentOf.get(id)!))) {
    const group = inner.filter((id) => parentOf.get(id) === p)
    const g = unionRect(group.map(rectById)), box = rectById(p)
    for (const id of group) delta.set(id, { x: box.x + box.w + 40 - g.x, y: 0 })
  }
  glide(delta, () => set((s) => ({
    nodes: s.nodes.map((n) => (delta.has(n.id) ? { ...n, data: { ...n.data, parent: parentOf.get(parentOf.get(n.id)!) ?? null } } : n)),
  })))
}

/** 상자를 넣을 수 있는 곳인지: 메모지·자기 자신·자기 안쪽은 안 된다 */
export function canHold(target: string, ids: string[]) {
  const s = get(), t = s.nodes.find((n) => n.id === target)
  if (!t || isMemo(t.data.shape)) return false
  const { descendants } = hierarchy(s.nodes)
  return !ids.some((id) => id === target || descendants(id).includes(target))
}

/** 상자들을 다른 상자 안으로: 그 안의 빈 곳(안쪽 상자들 아래)으로 미끄러져 들어간다 */
export function moveInto(ids: string[], target: string) {
  const s = get()
  const { kids } = hierarchy(s.nodes)
  const moved = topsOf(ids).filter((id) => s.nodes.find((n) => n.id === id)?.data.parent !== target)
  set({ picking: null, dropTarget: null })
  if (!moved.length || !canHold(target, moved)) return
  commit()
  const g = unionRect(moved.map(rectById)), box = rectById(target)
  const inside = (kids.get(target) ?? []).filter((id) => !moved.includes(id))
  let to: XYPosition
  if (inside.length) {
    const c = unionRect(inside.map(rectById))
    to = { x: c.x, y: c.y + c.h + 24 }
  } else to = { x: box.x + box.w / 2 - g.w / 2, y: box.y + box.h / 2 - g.h / 2 + 16 }
  const d = { x: to.x - g.x, y: to.y - g.y }
  glide(new Map(moved.map((id) => [id, d])), () => set((st) => ({
    nodes: st.nodes.map((n) => (moved.includes(n.id) ? { ...n, data: { ...n.data, parent: target } } : n)),
  })))
}

export function startEditing(id: string) {
  if (get().editingId === id) return
  commit()
  set((s) => ({ editingId: id, editingEdge: null, nodes: s.nodes.map((n) => ({ ...n, selected: n.id === id })) }))
}
export const stopEditing = () => { if (get().editingId) set({ editingId: null, active: null }) }

/** 서식 적용: 편집 중이면 현재 커서/선택 영역에, 아니면 선택된 상자 전체에 */
export function fmt(fn: Fmt) {
  const { active, editingId } = get()
  if (editingId && active && !active.isDestroyed) { fn(active.chain().focus()).run(); return }
  const ids = selectedNodes().map((n) => n.id)
  if (ids.length) patchNodes(ids, (d) => ({ title: applyToHtml(d.title, fn), body: applyToHtml(d.body, fn) }))
}

// ── 복사 / 붙여넣기 ──
let clip: Omit<Snap, 'paper'> | null = null
export const CLIP_MARK = '⁣logic-note-clip'
export function copySelection() {
  const sel = selectedNodes()
  if (!sel.length) return false
  // 바깥 상자를 고르면 안의 상자도 함께
  const { descendants } = hierarchy(get().nodes)
  const ids = new Set(sel.flatMap((n) => [n.id, ...descendants(n.id)]))
  const nodes = clean(get().nodes.filter((n) => ids.has(n.id)))
  clip = { nodes, edges: clean(get().edges.filter((e) => ids.has(e.source) && ids.has(e.target))) }
  return true
}
export const hasClip = () => !!clip
export function cutSelection() {
  if (!copySelection()) return false
  commit()
  const ids = new Set(clip!.nodes.map((n) => n.id))
  set((s) => ({
    nodes: s.nodes.filter((n) => !ids.has(n.id)),
    edges: s.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
    rev: s.rev + 1,
  }))
  return true
}
export function pasteClip(offset = 32) {
  if (!clip) return
  commit()
  const map = new Map(clip.nodes.map((n) => [n.id, uid()]))
  const nodes = clip.nodes.map((n) => ({
    ...n, id: map.get(n.id)!, position: { x: n.position.x + offset, y: n.position.y + offset }, selected: true,
    data: { ...n.data, parent: n.data.parent ? map.get(n.data.parent) ?? n.data.parent : null },
  }))
  const edges = clip.edges.map((e) => ({ ...e, id: uid(), source: map.get(e.source)!, target: map.get(e.target)! }))
  nodes.forEach((n) => born.add(n.id))
  clip = { nodes: clean(nodes), edges }
  set((s) => ({ nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...nodes], edges: [...s.edges, ...edges], rev: s.rev + 1 }))
}

// ── A4 용지 ──
/** 용지 노트에서 새 상자가 페이지 밖에 생기지 않게 */
export function clampToPaper(p: XYPosition): XYPosition {
  const paper = get().paper
  if (!paper) return p
  const { w, h } = pageSize(paper), o = pageOrigin(paper, pageAt(paper, p))
  return { x: Math.min(o.x + w - 20, Math.max(o.x + 20, p.x)), y: Math.min(o.y + h - 20, Math.max(o.y + 20, p.y)) }
}

export { paperKind, type PaperKind }

/** 페이지 구성을 바꾸며 상자를 따라 옮긴다 (to: 예전 i번째 페이지가 갈 자리, null이면 지움) */
function rearrange(next: Paper, to: (i: number) => number | null, record = true) {
  const s = get(), old = s.paper!
  if (record) commit()
  const nodes = relocate(old, next, s.nodes, to), ids = new Set(nodes.map((n) => n.id))
  set((st) => ({ paper: next, nodes, edges: st.edges.filter((e) => ids.has(e.source) && ids.has(e.target)), rev: st.rev + 1 }))
}

/** 무한 캔버스 ↔ A4 (세로·가로). 내용이 용지보다 넓으면 true */
export function setPaper(kind: PaperKind): boolean {
  const s = get()
  if (kind === paperKind(s.paper)) return false
  if (kind === 'canvas') { commit(); set((st) => ({ paper: null, rev: st.rev + 1 })); return false }
  if (!s.paper) {
    commit()
    const r = fitToPaper(newPaper(kind === 'a4-land'), s.nodes, s.frames)
    set((st) => ({ paper: r.paper, nodes: r.nodes, rev: st.rev + 1 }))
    return r.overflow
  }
  // 방향만 바꿀 때: 각 페이지의 내용은 그 페이지에 그대로
  rearrange({ ...s.paper, landscape: kind === 'a4-land' || undefined }, (i) => i)
  return false
}

/** 다음 페이지를 아래에(false) 또는 옆에(true) */
export function setPageSide(side: boolean) {
  const p = get().paper
  if (p && !!p.side !== side) rearrange({ ...p, side: side || undefined }, (i) => i)
}

/** 페이지 순서를 바꾼다 (order: 새 순서의 페이지 id) */
export function reorderPages(order: string[]) {
  const p = get().paper
  if (!p || order.join() === p.pages.join()) return
  rearrange({ ...p, pages: order }, (i) => order.indexOf(p.pages[i]))
}

/** at 위치에 빈 페이지를 끼운다 (뒤 페이지 내용은 한 칸씩 밀림) */
export function addPage(at?: number, record = true) {
  const p = get().paper
  if (!p) return
  const i = at ?? p.pages.length
  const pages = [...p.pages]
  pages.splice(i, 0, newPaper().pages[0])
  rearrange({ ...p, pages }, (k) => (k >= i ? k + 1 : k), record)
}

/** 페이지와 그 위의 상자를 지운다 (마지막 한 장은 남긴다) */
export function removePage(i: number) {
  const p = get().paper
  if (!p || p.pages.length < 2) return
  rearrange({ ...p, pages: p.pages.filter((_, k) => k !== i) }, (k) => (k === i ? null : k > i ? k - 1 : k))
}

/** 페이지를 내용째 복제해 바로 뒤에 넣는다 */
export function duplicatePage(i: number) {
  const s = get(), p = s.paper
  if (!p) return
  commit()
  const ids = new Set(nodesByPage(p, s.nodes)[i])
  addPage(i + 1, false)
  const map = new Map([...ids].map((id) => [id, uid()]))
  const a = pageOrigin(p, i), b = pageOrigin(p, i + 1)
  const nodes = clean(s.nodes.filter((n) => ids.has(n.id))).map((n) => ({
    ...n, id: map.get(n.id)!, position: { x: n.position.x + b.x - a.x, y: n.position.y + b.y - a.y },
    data: { ...n.data, parent: n.data.parent ? map.get(n.data.parent) ?? n.data.parent : null },
  }))
  const edges = clean(s.edges.filter((e) => ids.has(e.source) && ids.has(e.target))).map((e) => ({ ...e, id: uid(), source: map.get(e.source)!, target: map.get(e.target)! }))
  set((st) => ({ nodes: [...st.nodes, ...nodes], edges: [...st.edges, ...edges], rev: st.rev + 1 }))
}
