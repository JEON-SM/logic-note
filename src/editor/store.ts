import { useMemo } from 'react'
import { create } from 'zustand'
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import type { Editor } from '@tiptap/core'
import { animate } from 'motion/react'
import { backupOnce, uid, updateNote } from '../lib/db'
import { upgradeNodes } from '../lib/boxtext'
import { fitToPaper, newPaper, nodesByPage, pageAt, pageOrigin, pageSize, pagesSize, paperKind, relocate, type PaperKind } from '../lib/pages'
import { applyToHtml, readTextLook, textLookFmt, type Fmt, type TextLook } from '../lib/rich'
import { boxAround, boxAt, hierarchy, inside, layoutDepth, rectOf, type Rect } from '../lib/sets'
import { MEMO, attachPorts, boxSize, defaultBox, defaultEdge, isMemo, normalizeShape } from '../lib/shapes'
import { noteLook, type Theme } from '../lib/color'
import { useSettings, useTheme } from '../lib/store'
import type { Bg, BoxData, BoxNode, Defaults, EdgeData, LogicEdge, Note, Paper, Shape } from '../lib/types'

type Snap = { nodes: BoxNode[]; edges: LogicEdge[]; paper: Paper | null }
/** draw: 빈 곳을 끌어 상자 그리기(기본) · select: 끌어서 여러 개 고르기 · hand: 끌어서 화면 이동 · place: 고른 도형을 어디서든 그리기(한 번) */
export type Tool = 'draw' | 'select' | 'hand' | 'place'
/** 서식 브러시로 옮기는 모양 */
export type BoxLook = Pick<BoxData, 'shape' | 'fill' | 'stroke' | 'strokeWidth' | 'dash' | 'head' | 'rule' | 'valign'> & { text: TextLook }

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
  /** 끌고 있는 상자를 놓으면 들어갈 상자 */
  dropTarget: string | null
  /** '다른 상자에 넣기': 넣을 상자를 고르는 중인 상자들 */
  picking: string[] | null
  /** 손잡이로 크기를 바꾸고 있는 상자 */
  resizing: string | null
  /** 놓거나 옮기는 중인 연결점 (상자 안 좌표, port: 옮기는 점의 id) */
  portDraft: { id: string; x: number; y: number; snapped: boolean; port?: string } | null
  editingId: string | null
  /**
   * 하나만 골라 둔 상자: 편집기를 미리 띄워 두고 숨은 커서를 둔다. 그대로 타자를 치면(한글 첫 글자도) 바로 글이 들어간다.
   * 고른 직후 화면이 먼저 그려지도록 두 프레임 뒤에 정해진다
   */
  readyId: string | null
  editingEdge: string | null
  active: Editor | null
  tool: Tool
  shape: Shape
  edgeStyle: EdgeData
  /** 서식 브러시: 다음에 누르는 상자에 이 모양을 입힌다 (sticky면 Esc까지 계속) */
  painter: { look: BoxLook; sticky: boolean } | null
  past: Snap[]
  future: Snap[]
  rev: number
  /** 안에 상자가 있는 상자 (글을 위쪽에 둔다) */
  hosts: Set<string>
}

export const useEd = create<S>(() => ({
  noteId: '', title: '', bg: 'grid', ground: null, mode: null, paper: null, defaults: null, nodes: [], edges: [], dropTarget: null, picking: null, resizing: null, portDraft: null,
  editingId: null, readyId: null, editingEdge: null, active: null, painter: null, hosts: new Set<string>(),
  tool: 'draw', shape: 'rect', edgeStyle: defaultEdge(), past: [], future: [], rev: 0,
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
  set({ edgeStyle: { ...defaultEdge(), ...d.edge }, shape: normalizeShape(d.shape).shape })
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
  const base = n.dots ? n : attachPorts(n.nodes, n.edges)
  // 예전 노트: 제목·설명 칸을 한 칸으로, 둥근 모서리는 각지게. 바꾸기 전 원본은 이 기기에 남겨 둔다
  const nodes = upgradeNodes(base.nodes)
  if (base !== n || nodes !== base.nodes || nodes.some((x) => x.data.w == null || x.data.h == null)) backupOnce(n).catch(() => {})
  set({
    noteId: n.id, title: n.title, bg: n.bg ?? 'grid', ground: n.ground ?? null, mode: n.mode ?? null, paper: n.paper ?? null, defaults: n.defaults ?? null,
    nodes, edges: base.edges, editingId: null, readyId: null, editingEdge: null, dropTarget: null, picking: null, resizing: null, portDraft: null, painter: null,
    past: [], future: [], rev: 0, tool: 'draw',
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
  if (noteId) updateNote(noteId, { title, bg, ground, mode, defaults, dots: 1, ...snap() })
}
useEd.subscribe((s, p) => {
  if (!loading && s.noteId && s.noteId === p.noteId && (s.rev !== p.rev || s.title !== p.title || s.bg !== p.bg || s.ground !== p.ground || s.mode !== p.mode || s.defaults !== p.defaults || s.paper !== p.paper)) {
    clearTimeout(timer)
    timer = setTimeout(flushSave, 600)
  }
})
addEventListener('pagehide', flushSave)

// ── 겹 순서: 안쪽 상자를 바깥 상자 위에 ──
// 끄는 동안·미끄러지는 동안에는 다시 맞추지 않는다
let dragging = false
let moving = false
export function relayout() {
  if (dragging || moving) return
  const s = get()
  const r = layoutDepth(s.nodes, s.edges)
  const hosts = new Set<string>()
  for (const n of s.nodes) if (n.data.parent) hosts.add(n.data.parent)
  const sameHosts = hosts.size === s.hosts.size && [...hosts].every((h) => s.hosts.has(h))
  if (r.nodes !== s.nodes || r.edges !== s.edges || !sameHosts) set({ nodes: r.nodes, edges: r.edges, ...(!sameHosts && { hosts }) })
}
useEd.subscribe((s, p) => { if (s.nodes !== p.nodes || s.edges !== p.edges) relayout() })

// ── 미리 띄워 두는 편집기 (그대로 타자 치기) ──
let pointerKind = 'mouse'
/** 마지막으로 누른 입력 장치. 터치로 고르면 화면 키보드가 뜨지 않게 편집기를 미리 띄우지 않는다 */
export const notePointer = (kind: string) => { pointerKind = kind }
const singleSelected = (nodes: BoxNode[]) => {
  let id: string | null = null
  for (const n of nodes) if (n.selected) { if (id) return null; id = n.id }
  return id
}
let readyFrame = 0
useEd.subscribe((s, p) => {
  if (s.nodes === p.nodes && s.editingId === p.editingId && s.readyId === p.readyId) return
  if (s.editingId) { if (s.readyId !== s.editingId) set({ readyId: s.editingId }); return }
  const sel = pointerKind === 'touch' ? null : singleSelected(s.nodes)
  if (sel === s.readyId) return
  cancelAnimationFrame(readyFrame)
  // 편집을 막 끝낸 상자는 편집기를 그대로 둔다 (다시 그리지 않게)
  if (sel && p.editingId === sel) return set({ readyId: sel })
  if (s.readyId) set({ readyId: null })
  if (sel) readyFrame = requestAnimationFrame(() => requestAnimationFrame(() => {
    const st = get()
    if (!st.editingId && !dragging && singleSelected(st.nodes) === sel) set({ readyId: sel })
  }))
})

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

// ── 모눈에 맞추기: 설정(모눈에 맞추기)으로 켜고 끈다. Alt를 누르고 있는 동안은 반대로 ──
let free = false
export const setFree = (v: boolean) => { free = v }
/** 지금은 모눈에 맞추지 않는다 (맞추기를 꺼 두었으면 Alt를 누를 때만 맞춘다) */
const loose = () => (useSettings.getState().snap === false) !== free
/** 배경 무늬의 칸 크기 (줄 무늬는 줄 간격) */
const gridStep = () => {
  const bg = get().bg, s = bg.endsWith('-wide') ? 48 : 24
  return { x: s, y: bg === 'lines' ? 28 : s }
}
/** 점을 가까운 모눈 교차점으로. 용지 노트는 그 페이지의 왼쪽 위가 기준 */
export function snapXY(p: XYPosition): XYPosition {
  if (loose()) return p
  const g = gridStep(), paper = get().paper
  const o = paper ? pageOrigin(paper, pageAt(paper, p)) : { x: 0, y: 0 }
  return { x: o.x + Math.round((p.x - o.x) / g.x) * g.x, y: o.y + Math.round((p.y - o.y) / g.y) * g.y }
}
/** w×h 상자의 중심을, 왼쪽 위 모서리가 모눈에 닿도록 */
export function snapCenter(c: XYPosition, w: number, h: number): XYPosition {
  const tl = snapXY({ x: c.x - w / 2, y: c.y - h / 2 })
  return { x: tl.x + w / 2, y: tl.y + h / 2 }
}
/** 크기를 바꾸는 중: 움직인 변만 모눈에 */
function snapEdges(r: Rect, r0: Rect): Rect {
  if (loose()) return r
  const a = snapXY({ x: r.x, y: r.y }), b = snapXY({ x: r.x + r.w, y: r.y + r.h })
  let L = r.x, T = r.y, R = r.x + r.w, B = r.y + r.h
  if (Math.abs(L - r0.x) > 0.5) L = Math.min(a.x, R - 24)
  if (Math.abs(T - r0.y) > 0.5) T = Math.min(a.y, B - 24)
  if (Math.abs(R - (r0.x + r0.w)) > 0.5) R = Math.max(b.x, L + 24)
  if (Math.abs(B - (r0.y + r0.h)) > 0.5) B = Math.max(b.y, T + 24)
  return { x: L, y: T, w: R - L, h: B - T }
}
let resizeFrom: { id: string; rect: Rect } | null = null
export function beginResize(id: string) {
  const n = get().nodes.find((x) => x.id === id)
  commit()
  resizeFrom = n ? { id, rect: rectOf(n) } : null
  set({ resizing: id })
}
export function endResize(id: string) {
  resizeFrom = null
  set({ resizing: null })
  settleKids(id)
}

export function onNodesChange(changes: NodeChange<BoxNode>[]) {
  const s = get()
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  // 크기 손잡이(NodeResizer): 폭·높이는 상자 자료로, 움직인 변은 모눈에 맞춘다
  const sized = new Map<string, { w: number; h: number }>()
  const center = new Map<string, XYPosition>()
  for (const c of changes) {
    if (c.type !== 'dimensions' || !c.setAttributes || !c.dimensions) continue
    const n = byId.get(c.id)
    if (!n) continue
    const at = (changes.find((x) => x.type === 'position' && x.id === c.id && x.position) as { position: XYPosition } | undefined)?.position ?? n.position
    let r: Rect = { x: at.x - c.dimensions.width / 2, y: at.y - c.dimensions.height / 2, w: c.dimensions.width, h: c.dimensions.height }
    if (resizeFrom?.id === c.id) r = snapEdges(r, resizeFrom.rect)
    sized.set(c.id, { w: Math.round(r.w), h: Math.round(r.h) })
    center.set(c.id, { x: r.x + r.w / 2, y: r.y + r.h / 2 })
  }
  let ch = changes.map((c) => {
    if (c.type === 'dimensions' && c.setAttributes) return { ...c, setAttributes: undefined }
    if (c.type === 'position' && center.has(c.id)) return { ...c, position: center.get(c.id) }
    return c
  })
  // 끄는 중(그리고 놓는 순간): 앞장선 상자의 왼쪽 위를 모눈에 맞추고, 함께 끄는 상자도 같은 만큼.
  // React Flow는 놓을 때 맞추기 전 자리를 한 번 더 보내므로(dragging: false) 그것도 맞춘다
  const isDrag = (c: NodeChange<BoxNode>) => c.type === 'position' && typeof c.dragging === 'boolean' && !!c.position && !center.has(c.id)
  const drags = ch.filter(isDrag) as { id: string; position: XYPosition }[]
  if (drags.length && !loose()) {
    const lead = byId.get(drags[0].id)
    if (lead) {
      const r = rectOf(lead), p = drags[0].position, to = snapCenter(p, r.w, r.h)
      const dx = to.x - p.x, dy = to.y - p.y
      if (dx || dy) ch = ch.map((c) => (isDrag(c) && c.type === 'position' ? { ...c, position: { x: c.position!.x + dx, y: c.position!.y + dy } } : c))
    }
  }
  const content = ch.some((c) => c.type !== 'select' && c.type !== 'dimensions') || sized.size > 0
  set((st) => {
    let nodes = applyNodeChanges(ch, st.nodes)
    if (sized.size) nodes = nodes.map((n) => (sized.has(n.id) ? { ...n, data: { ...n.data, ...sized.get(n.id), wrap: null } } : n))
    // 바깥 상자를 끌면 안의 상자도 같이 움직인다 (크기 조절로 중심이 옮겨진 건 제외)
    const moves = ch.filter((c) => c.type === 'position' && c.position && !sized.has(c.id))
    if (moves.length) {
      const { descendants } = hierarchy(st.nodes)
      const moving = new Set(moves.map((c) => (c as { id: string }).id))
      const delta = new Map<string, XYPosition>()
      for (const c of moves) {
        if (c.type !== 'position' || !c.position) continue
        const old = byId.get(c.id)
        if (!old) continue
        const dx = c.position.x - old.position.x, dy = c.position.y - old.position.y
        if (dx || dy) for (const d of descendants(c.id)) if (!moving.has(d)) delta.set(d, { x: dx, y: dy })
      }
      if (delta.size) nodes = nodes.map((n) => { const d = delta.get(n.id); return d ? { ...n, position: { x: n.position.x + d.x, y: n.position.y + d.y } } : n })
    }
    // 바깥 상자를 지우면 안의 상자는 한 겹 바깥으로
    const removed = new Map(ch.filter((c) => c.type === 'remove').map((c) => [(c as { id: string }).id, byId.get((c as { id: string }).id)?.data.parent ?? null]))
    if (removed.size) {
      const up = (p: string | null | undefined): string | null => (p && removed.has(p) ? up(removed.get(p)) : p ?? null)
      nodes = nodes.map((n) => (n.data.parent && removed.has(n.data.parent) ? { ...n, data: { ...n.data, parent: up(n.data.parent) } } : n))
    }
    return { nodes, rev: content ? st.rev + 1 : st.rev }
  })
}
export function onEdgesChange(ch: EdgeChange<LogicEdge>[]) {
  const content = ch.some((c) => c.type !== 'select')
  set((s) => ({ edges: applyEdgeChanges(ch, s.edges), rev: content ? s.rev + 1 : s.rev }))
}

export const selectedNodes = () => get().nodes.filter((n) => n.selected)
export const selectedEdges = () => get().edges.filter((e) => e.selected)
/** 이 상자들만 고른다 (바뀌는 상자만 새로 만든다) */
export function selectOnly(ids: string[]) {
  const on = new Set(ids)
  set((s) => ({
    nodes: s.nodes.map((n) => (on.has(n.id) === !!n.selected ? n : { ...n, selected: on.has(n.id) })),
    edges: s.edges.some((e) => e.selected) ? s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)) : s.edges,
  }))
}

/** 방금 만든 상자 (BoxNode가 나타나는 움직임을 한 번 보여 주고 지운다) */
export const born = new Set<string>()

/**
 * 새 상자. position은 중심. 크기를 따로 주지 않으면 도형의 기본 크기이고, 왼쪽 위가 모눈에 닿게 놓인다.
 * patch에 w: null, h: null을 주면 글(그림)에 맞춰 한 번 잰 뒤 고정된다
 */
export function addBox(position: XYPosition, shape0: Shape, patch: Partial<BoxData> = {}, opts: { pop?: boolean; snap?: boolean } = {}) {
  commit()
  const id = uid()
  if (opts.pop !== false) born.add(id)
  const d = effDefaults()
  const { shape, rule } = normalizeShape(shape0)
  const size = boxSize(shape)
  const memo = isMemo(shape) && { fill: MEMO.fill, stroke: null, dash: 'none' as const }
  const data: BoxData = { ...defaultBox(shape), fill: d.fill, stroke: d.stroke, ...memo, ...(rule && { rule }), w: size.w, h: size.h, ...patch }
  const at = opts.snap !== false && data.w && data.h ? snapCenter(position, data.w, data.h) : position
  const node: BoxNode = { id, type: 'box', position: clampToPaper(at), selected: true, data }
  set((s) => ({
    nodes: [...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), node],
    edges: s.edges.some((e) => e.selected) ? s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)) : s.edges,
    rev: s.rev + 1,
  }))
  return id
}

/** 끌어서 그린 사각형으로 상자를 만들고 바로 글을 쓴다. 다른 상자 안에 완전히 들어가면 그 상자 안으로 */
export function drawBox(r: Rect, shape: Shape) {
  const parent = boxAround(get().nodes, r)
  const id = addBox({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, shape, { w: Math.round(r.w), h: Math.round(r.h), parent }, { pop: false, snap: false })
  startEditing(id, undefined, false)
  return id
}

/** 크기가 정해지지 않은 상자(예전 노트·그림)를 잰 크기로 고정한다 (실행 취소 기록 없이) */
export function fixSize(id: string, w: number, h: number) {
  set((s) => ({
    nodes: s.nodes.map((n) => (n.id === id && (n.data.w == null || n.data.h == null) ? { ...n, data: { ...n.data, w: Math.round(w), h: Math.round(h), wrap: null } } : n)),
    rev: s.rev + 1,
  }))
}

export function addLink(source: string, sourceHandle: string, target: string, targetHandle: string, record = true) {
  if (source === target) return
  if (record) commit()
  const edge: LogicEdge = { id: uid(), type: 'logic', source, sourceHandle, target, targetHandle, data: { ...get().edgeStyle } }
  // 새 선의 양 끝에도 연결점을 단다
  set((s) => {
    const r = attachPorts(s.nodes, [edge])
    return { nodes: r.nodes, edges: [...s.edges, ...r.edges], rev: s.rev + 1 }
  })
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

// ── 상자 안의 상자: 끌어서 넣고 빼기, 묶기 ──
let draggedIds = new Set<string>()
export function startDrag(ids: string[]) {
  commit()
  dragging = true
  const { descendants } = hierarchy(get().nodes)
  draggedIds = new Set(ids.flatMap((id) => [id, ...descendants(id)]))
}
/** 끄는 동안: 상자 중심을 품은 상자를 표시 (원래 바깥 상자여도 중심이 밖으로 나가면 빠진다) */
export function dragOver(id: string) {
  const s = get()
  const n = s.nodes.find((x) => x.id === id)
  if (!n) return
  const target = boxAt(s.nodes, n.position.x, n.position.y, draggedIds)
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

/** 크기를 줄여 중심이 밖으로 나간 안쪽 상자는 한 겹 바깥으로 */
export function settleKids(id: string) {
  const s = get(), n = s.nodes.find((x) => x.id === id)
  if (!n) return
  const r = rectOf(n), { kids, parentOf } = hierarchy(s.nodes)
  const out = new Set((kids.get(id) ?? []).filter((k) => { const c = s.nodes.find((x) => x.id === k)!; return !inside(r, c.position.x, c.position.y) }))
  if (!out.size) return
  const up = parentOf.get(id) ?? null
  set((st) => ({ nodes: st.nodes.map((x) => (out.has(x.id) ? { ...x, data: { ...x.data, parent: up } } : x)), rev: st.rev + 1 }))
}

const unionRect = (rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y))
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y }
}
const rectById = (id: string) => rectOf(get().nodes.find((x) => x.id === id)!)
const topsOf = (ids: string[]) => {
  const { parentOf } = hierarchy(get().nodes)
  const all = new Set(ids)
  return ids.filter((id) => { for (let p = parentOf.get(id); p; p = parentOf.get(p)) if (all.has(p)) return false; return true })
}

/** 선택한 상자들을 새 상자로 감싼다 (Ctrl+G). 위쪽에 이름을 쓸 자리를 둔다 */
export function groupSelection() {
  const sel = selectedNodes()
  if (!sel.length) return
  const { parentOf } = hierarchy(get().nodes)
  const tops = topsOf(sel.map((n) => n.id))
  const outer = new Set(tops.map((id) => parentOf.get(id) ?? null))
  const u = unionRect(tops.map(rectById))
  const a = snapXY({ x: u.x - 24, y: u.y - 48 }), b = snapXY({ x: u.x + u.w + 24, y: u.y + u.h + 24 })
  const x = Math.min(a.x, u.x - 12), y = Math.min(a.y, u.y - 36)
  const w = Math.max(b.x, u.x + u.w + 12) - x, h = Math.max(b.y, u.y + u.h + 12) - y
  const id = addBox({ x: x + w / 2, y: y + h / 2 }, 'rect', { w, h, valign: 'top', parent: outer.size === 1 ? [...outer][0] : null }, { snap: false })
  set((s) => ({ nodes: s.nodes.map((n) => (tops.includes(n.id) ? { ...n, data: { ...n.data, parent: id } } : n)) }))
  startEditing(id, undefined, false)
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

/** 선택한 상자를 한 겹 바깥으로 꺼낸다: 원래 상자 오른쪽으로 비켜 나간다 */
export function takeOut(ids: string[]) {
  const { parentOf } = hierarchy(get().nodes)
  const inner = topsOf(ids).filter((id) => parentOf.has(id))
  if (!inner.length) return
  commit()
  const delta = new Map<string, XYPosition>()
  for (const p of new Set(inner.map((id) => parentOf.get(id)!))) {
    const group = inner.filter((id) => parentOf.get(id) === p)
    const g = unionRect(group.map(rectById)), box = rectById(p)
    for (const id of group) delta.set(id, { x: box.x + box.w + 48 - g.x, y: 0 })
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

/**
 * '다른 상자에 넣기': 고른 상자들을 그 상자 가운데로 미끄러뜨려 넣는다.
 * 직접 고른 명령이라, 들어갈 자리가 모자라면 그때만 바깥 상자를 그만큼 키운다
 */
export function moveInto(ids: string[], target: string) {
  const s = get()
  const moved = topsOf(ids).filter((id) => s.nodes.find((n) => n.id === id)?.data.parent !== target)
  set({ picking: null, dropTarget: null })
  if (!moved.length || !canHold(target, moved)) return
  commit()
  const g = unionRect(moved.map(rectById))
  let box = rectById(target)
  const need = { w: g.w + 48, h: g.h + 72 }
  if (box.w < need.w || box.h < need.h) {
    const w = Math.max(box.w, need.w), h = Math.max(box.h, need.h)
    patchNodes([target], { w, h }, false)
    box = { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h }
  }
  const to = snapXY({ x: box.x + box.w / 2 - g.w / 2, y: box.y + box.h / 2 - g.h / 2 + 12 })
  const d = { x: to.x - g.x, y: to.y - g.y }
  glide(new Map(moved.map((id) => [id, d])), () => set((st) => ({
    nodes: st.nodes.map((n) => (moved.includes(n.id) ? { ...n, data: { ...n.data, parent: target } } : n)),
  })))
}

// ── 글 편집 ──
/** 두 번 눌러 편집을 시작한 자리 (BoxEditor가 커서를 거기 둔다) */
let caretAt: { id: string; x: number; y: number } | null = null
export const takeCaret = (id: string) => { const c = caretAt?.id === id ? caretAt : null; caretAt = null; return c }
/** record: 실행 취소 기록을 남길지 (방금 만든 상자는 만들 때 이미 남겼다) */
export function startEditing(id: string, at?: { x: number; y: number }, record = true) {
  caretAt = at ? { id, ...at } : null
  if (get().editingId === id) return
  if (record) commit()
  set((s) => ({
    editingId: id, readyId: id, editingEdge: null,
    nodes: s.nodes.map((n) => (!!n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })),
  }))
}
export const stopEditing = () => { if (get().editingId) set({ editingId: null, active: null }) }

/** 서식 적용: 편집 중이면 현재 커서/선택 영역에, 아니면 선택된 상자 글 전체에 */
export function fmt(fn: Fmt) {
  const { active, editingId } = get()
  if (editingId && active && !active.isDestroyed) { fn(active.chain().focus()).run(); return }
  const ids = selectedNodes().map((n) => n.id)
  if (ids.length) patchNodes(ids, (d) => ({ body: applyToHtml(d.body, fn) }))
}

// ── 서식 브러시 (Word처럼: 한 번 누르면 한 상자, 두 번 누르면 Esc까지 계속) ──
export function pickLook(sticky: boolean) {
  const n = selectedNodes()[0]
  if (!n) return
  const d = n.data
  set({ painter: { sticky, look: { shape: d.shape, fill: d.fill, stroke: d.stroke, strokeWidth: d.strokeWidth, dash: d.dash, head: d.head, rule: d.rule, valign: d.valign, text: readTextLook(d.body) } } })
}
export function paintOnto(id: string) {
  const p = get().painter
  if (!p) return
  const { text, ...box } = p.look
  patchNodes([id], (d) => ({ ...box, body: d.body ? applyToHtml(d.body, textLookFmt(text)) : d.body }))
  if (!p.sticky) set({ painter: null })
}

/** 고른 상자를 dx·dy만큼 (안의 상자도 함께). 잇달아 누르면 실행 취소 한 번으로 묶는다 */
let lastNudge = 0
export function nudge(dx: number, dy: number) {
  const sel = selectedNodes()
  if (!sel.length) return
  if (Date.now() - lastNudge > 800) commit()
  lastNudge = Date.now()
  const { descendants } = hierarchy(get().nodes)
  const ids = new Set(topsOf(sel.map((n) => n.id)).flatMap((id) => [id, ...descendants(id)]))
  set((s) => ({ nodes: s.nodes.map((n) => (ids.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)), rev: s.rev + 1 }))
}

// ── 맞춤·배분·같은 크기·순서 (엑셀·파워포인트의 '정렬'). 안의 상자는 바깥 상자와 함께 움직인다 ──
const pickedTops = () => topsOf(selectedNodes().map((n) => n.id)).map((id) => ({ id, r: rectById(id) }))
export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
/** 고른 상자들의 한쪽 변(또는 가운데)을 선택 영역 기준으로 맞춘다 */
export function alignBoxes(kind: AlignKind) {
  const ps = pickedTops()
  if (ps.length < 2) return
  const u = unionRect(ps.map((p) => p.r))
  const delta = new Map<string, XYPosition>()
  for (const { id, r } of ps) {
    const dx = kind === 'left' ? u.x - r.x : kind === 'right' ? u.x + u.w - r.x - r.w : kind === 'center' ? u.x + u.w / 2 - r.x - r.w / 2 : 0
    const dy = kind === 'top' ? u.y - r.y : kind === 'bottom' ? u.y + u.h - r.y - r.h : kind === 'middle' ? u.y + u.h / 2 - r.y - r.h / 2 : 0
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) delta.set(id, { x: dx, y: dy })
  }
  if (!delta.size) return
  commit()
  glide(delta, () => {})
}
/** 양 끝 상자는 그대로 두고, 사이 간격이 같아지게 (상자 3개 이상) */
export function distributeBoxes(axis: 'h' | 'v') {
  const ps = pickedTops()
  if (ps.length < 3) return
  const k = axis === 'h' ? 'x' : 'y', s = axis === 'h' ? 'w' : 'h'
  ps.sort((a, b) => a.r[k] + a.r[s] / 2 - b.r[k] - b.r[s] / 2)
  const first = ps[0].r, last = ps[ps.length - 1].r
  const gap = (last[k] + last[s] - first[k] - ps.reduce((a, p) => a + p.r[s], 0)) / (ps.length - 1)
  const delta = new Map<string, XYPosition>()
  let at = first[k]
  for (const p of ps) {
    const d = at - p.r[k]
    if (Math.abs(d) > 0.5) delta.set(p.id, axis === 'h' ? { x: d, y: 0 } : { x: 0, y: d })
    at += p.r[s] + gap
  }
  if (!delta.size) return
  commit()
  glide(delta, () => {})
}
/** 고른 상자들을 가장 큰 것의 폭·높이로. 왼쪽 위 모서리는 그대로 (맞춤 뒤에 써도 줄이 흐트러지지 않게) */
export function matchSize(what: 'w' | 'h' | 'both') {
  const sel = selectedNodes()
  if (sel.length < 2) return
  const rs = new Map(sel.map((n) => [n.id, rectOf(n)]))
  const w = Math.max(...[...rs.values()].map((r) => r.w)), h = Math.max(...[...rs.values()].map((r) => r.h))
  commit()
  set((s) => ({
    nodes: s.nodes.map((n) => {
      const r = rs.get(n.id)
      if (!r) return n
      const nw = what === 'h' ? r.w : w, nh = what === 'w' ? r.h : h
      return { ...n, position: { x: r.x + nw / 2, y: r.y + nh / 2 }, data: { ...n.data, w: nw, h: nh, wrap: null } }
    }),
    rev: s.rev + 1,
  }))
}
/** 맨 앞으로·맨 뒤로 (같은 겹에 있는 상자끼리 그리는 순서) */
export function reorder(front: boolean) {
  const ids = new Set(selectedNodes().map((n) => n.id))
  if (!ids.size) return
  commit()
  set((s) => {
    const a = s.nodes.filter((n) => ids.has(n.id)), b = s.nodes.filter((n) => !ids.has(n.id))
    return { nodes: front ? [...b, ...a] : [...a, ...b], rev: s.rev + 1 }
  })
}

/** 방향키: 고른 상자에서 그쪽으로 가장 가까운 상자를 고른다 (엑셀의 셀 이동처럼). 고른 상자 id */
export function selectToward(dir: 'l' | 'r' | 'u' | 'd') {
  const s = get(), sel = selectedNodes()
  if (!s.nodes.length) return null
  if (!sel.length) { selectOnly([s.nodes[0].id]); return s.nodes[0].id }
  const c = sel[sel.length - 1].position
  let best: { id: string; score: number } | null = null
  for (const n of s.nodes) {
    if (n.selected) continue
    const dx = n.position.x - c.x, dy = n.position.y - c.y
    const along = dir === 'r' ? dx : dir === 'l' ? -dx : dir === 'd' ? dy : -dy
    const across = Math.abs(dir === 'l' || dir === 'r' ? dy : dx)
    if (along <= 1 || across > along * 2) continue
    const score = along + across * 2
    if (!best || score < best.score) best = { id: n.id, score }
  }
  if (best) selectOnly([best.id])
  return best?.id ?? null
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

// ── 연결점 ──
/** 테두리에 연결점을 놓는다 (거의 같은 자리에 이미 있으면 그대로) */
export function addPort(id: string, u: number, v: number) {
  const ports = get().nodes.find((n) => n.id === id)?.data.ports ?? []
  if (ports.some((p) => Math.hypot(p.u - u, p.v - v) < 0.02)) return
  patchNodes([id], { ports: [...ports, { id: uid(), u, v }] })
}
/** 이 선이 그 연결점에 이어져 있는가 */
export const atPort = (e: LogicEdge, id: string, port: string) =>
  (e.source === id && e.sourceHandle === port) || (e.target === id && e.targetHandle === port)
/** 연결점과 거기 이어진 선을 함께 지운다 */
export function removePort(id: string, port: string) {
  commit()
  set((s) => ({
    nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ports: (n.data.ports ?? []).filter((x) => x.id !== port) } } : n)),
    edges: s.edges.filter((e) => !atPort(e, id, port)),
    rev: s.rev + 1,
  }))
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
    const r = fitToPaper(newPaper(kind === 'a4-land'), s.nodes)
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
