import { create } from 'zustand'
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import type { Editor } from '@tiptap/core'
import { uid, updateNote } from '../lib/db'
import { applyToHtml, type Fmt } from '../lib/rich'
import { defaultBox, defaultEdge } from '../lib/shapes'
import type { Bg, BoxData, BoxNode, EdgeData, LogicEdge, Note, Shape } from '../lib/types'

type Snap = { nodes: BoxNode[]; edges: LogicEdge[] }
export type Tool = 'hand' | 'select' | 'place'

interface S {
  noteId: string
  title: string
  bg: Bg
  nodes: BoxNode[]
  edges: LogicEdge[]
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
  noteId: '', title: '', bg: 'grid', nodes: [], edges: [], editingId: null, editingEdge: null, active: null,
  tool: 'hand', shape: 'rect', edgeStyle: defaultEdge(), past: [], future: [], rev: 0,
}))
const get = useEd.getState
const set = useEd.setState

const clean = <T extends { selected?: boolean; dragging?: boolean }>(a: T[]) => a.map(({ selected, dragging, ...r }) => r as T)
const snap = (): Snap => ({ nodes: clean(get().nodes), edges: clean(get().edges) })
const bump = () => get().rev + 1

let loading = false
export function loadNote(n: Note) {
  loading = true
  set({ noteId: n.id, title: n.title, bg: n.bg ?? 'grid', nodes: n.nodes, edges: n.edges, editingId: null, editingEdge: null, past: [], future: [], rev: 0, tool: 'hand' })
  loading = false
}

// ── 자동 저장 ──
let timer: ReturnType<typeof setTimeout> | undefined
export function flushSave() {
  if (!timer) return
  clearTimeout(timer)
  timer = undefined
  const { noteId, title, bg } = get()
  if (noteId) updateNote(noteId, { title, bg, ...snap() })
}
useEd.subscribe((s, p) => {
  if (!loading && s.noteId && s.noteId === p.noteId && (s.rev !== p.rev || s.title !== p.title || s.bg !== p.bg)) {
    clearTimeout(timer)
    timer = setTimeout(flushSave, 600)
  }
})
addEventListener('pagehide', flushSave)

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
  set((s) => ({ nodes: applyNodeChanges(ch, s.nodes), rev: content ? s.rev + 1 : s.rev }))
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
  const node: BoxNode = { id, type: 'box', position, data: { ...defaultBox(shape), ...patch }, selected: true }
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
  const nodes = clean(selectedNodes())
  if (!nodes.length) return false
  const ids = new Set(nodes.map((n) => n.id))
  clip = { nodes, edges: clean(get().edges.filter((e) => ids.has(e.source) && ids.has(e.target))) }
  return true
}
export const hasClip = () => !!clip
export function pasteClip(offset = 32) {
  if (!clip) return
  commit()
  const map = new Map(clip.nodes.map((n) => [n.id, uid()]))
  const nodes = clip.nodes.map((n) => ({ ...n, id: map.get(n.id)!, position: { x: n.position.x + offset, y: n.position.y + offset }, selected: true }))
  const edges = clip.edges.map((e) => ({ ...e, id: uid(), source: map.get(e.source)!, target: map.get(e.target)! }))
  clip = { nodes: clean(nodes), edges }
  set((s) => ({ nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...nodes], edges: [...s.edges, ...edges], rev: s.rev + 1 }))
}
