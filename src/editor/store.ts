import { create } from 'zustand'
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import type { Editor } from '@tiptap/core'
import { uid, updateNote } from '../lib/db'
import { applyToHtml, type Fmt } from '../lib/rich'
import { boxAt, hierarchy, layoutSets, rectOf, type Frame } from '../lib/sets'
import { defaultBox, defaultEdge } from '../lib/shapes'
import { useSettings } from '../lib/store'
import type { Bg, BoxData, BoxNode, Defaults, EdgeData, LogicEdge, Note, Shape } from '../lib/types'

type Snap = { nodes: BoxNode[]; edges: LogicEdge[] }
export type Tool = 'hand' | 'select' | 'place'

interface S {
  noteId: string
  title: string
  bg: Bg
  /** 이 노트만의 기본 모양 (null이면 전체 설정) */
  defaults: Defaults | null
  nodes: BoxNode[]
  edges: LogicEdge[]
  /** 집합(안에 상자가 있는 상자)의 계산된 크기 */
  frames: Record<string, Frame>
  /** 끌고 있는 상자를 놓으면 들어갈 상자 */
  dropTarget: string | null
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
  noteId: '', title: '', bg: 'grid', defaults: null, nodes: [], edges: [], frames: {}, dropTarget: null, editingId: null, editingEdge: null, active: null,
  tool: 'hand', shape: 'rect', edgeStyle: defaultEdge(), past: [], future: [], rev: 0,
}))
const get = useEd.getState
const set = useEd.setState

const clean = <T extends { selected?: boolean; dragging?: boolean }>(a: T[]) => a.map(({ selected, dragging, ...r }) => r as T)
const snap = (): Snap => ({ nodes: clean(get().nodes), edges: clean(get().edges) })
const bump = () => get().rev + 1

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
    noteId: n.id, title: n.title, bg: n.bg ?? 'grid', defaults: n.defaults ?? null, nodes: n.nodes, edges: n.edges, frames: {},
    editingId: null, editingEdge: null, dropTarget: null, past: [], future: [], rev: 0, tool: 'hand',
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
  const { noteId, title, bg, defaults } = get()
  if (noteId) updateNote(noteId, { title, bg, defaults, ...snap() })
}
useEd.subscribe((s, p) => {
  if (!loading && s.noteId && s.noteId === p.noteId && (s.rev !== p.rev || s.title !== p.title || s.bg !== p.bg || s.defaults !== p.defaults)) {
    clearTimeout(timer)
    timer = setTimeout(flushSave, 600)
  }
})
addEventListener('pagehide', flushSave)

// ── 집합 배치 ──
// 상자 글 영역의 잰 크기 (BoxNode가 알려 준다). 바깥 상자의 머리글 자리를 잡는 데 쓴다
const heads = new Map<string, { w: number; h: number }>()
let dragging = false
export function relayout() {
  if (dragging) return
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

export function onNodesChange(ch: NodeChange<BoxNode>[]) {
  const content = ch.some((c) => c.type !== 'select' && c.type !== 'dimensions')
  set((s) => {
    let nodes = applyNodeChanges(ch, s.nodes)
    // 바깥 상자를 끌면 안의 상자도 같이 움직인다
    const moves = ch.filter((c) => c.type === 'position' && c.position)
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

export function addBox(position: XYPosition, shape: Shape, patch: Partial<BoxData> = {}) {
  commit()
  const id = uid()
  const d = effDefaults()
  const node: BoxNode = { id, type: 'box', position, data: { ...defaultBox(shape), fill: d.fill, stroke: d.stroke, ...patch }, selected: true }
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
  const target = boxAt(s.nodes, s.frames, n.position.x, n.position.y, draggedIds)
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

/** 선택한 상자를 한 겹 바깥으로 꺼낸다 */
export function takeOut(ids: string[]) {
  const { parentOf } = hierarchy(get().nodes)
  const inner = ids.filter((id) => parentOf.has(id))
  if (!inner.length) return
  patchNodes(inner, (d) => ({ parent: (d.parent && parentOf.get(d.parent)) ?? null }))
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
let clip: Snap | null = null
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
export function pasteClip(offset = 32) {
  if (!clip) return
  commit()
  const map = new Map(clip.nodes.map((n) => [n.id, uid()]))
  const nodes = clip.nodes.map((n) => ({
    ...n, id: map.get(n.id)!, position: { x: n.position.x + offset, y: n.position.y + offset }, selected: true,
    data: { ...n.data, parent: n.data.parent ? map.get(n.data.parent) ?? n.data.parent : null },
  }))
  const edges = clip.edges.map((e) => ({ ...e, id: uid(), source: map.get(e.source)!, target: map.get(e.target)! }))
  clip = { nodes: clean(nodes), edges }
  set((s) => ({ nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...nodes], edges: [...s.edges, ...edges], rev: s.rev + 1 }))
}
