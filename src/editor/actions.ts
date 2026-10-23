import type { XYPosition } from '@xyflow/react'
import { addMediaFile, isUrl } from '../lib/media'
import { promptText } from '../ui/Dialogs'
import { looksLikeDiagram, parseDiagram, type Imported } from '../lib/diagram'
import type { MediaItem } from '../lib/types'
import { openImport } from '../ui/ImportDialog'
import { addBox, addLink, commit, patchNodes, selectedNodes, startEditing, useEd } from './store'

let centerFn: () => XYPosition = () => ({ x: 0, y: 0 })
export const setCenterFn = (f: () => XYPosition) => { centerFn = f }
let fitFn: (ids: string[]) => void = () => {}
export const setFitFn = (f: (ids: string[]) => void) => { fitFn = f }
/** 화면 가운데. 이미 상자가 있으면 조금씩 비켜서 */
const center = () => {
  const p = centerFn()
  const nodes = useEd.getState().nodes
  while (nodes.some((n) => Math.abs(n.position.x - p.x) < 24 && Math.abs(n.position.y - p.y) < 24)) { p.x += 32; p.y += 32 }
  return p
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const single = () => { const s = selectedNodes(); return s.length === 1 ? s[0] : null }

/** 이미지/영상: 상자 하나가 선택돼 있으면 거기에 붙이고, 아니면 새 상자 */
export async function insertFiles(files: File[], at?: XYPosition) {
  const items = (await Promise.all(files.map(addMediaFile))).filter(Boolean) as MediaItem[]
  if (!items.length) return
  const target = !at && single()
  if (target) patchNodes([target.id], (d) => ({ media: [...d.media, ...items] }))
  else addBox(at ?? center(), 'rect', { media: items })
}

export async function insertLink(url?: string, at?: XYPosition) {
  const u = url ?? (await promptText('링크 추가', 'https://', '추가'))
  if (!u || !isUrl(u)) return
  const html = `<p><a href="${esc(u.trim())}">${esc(u.trim())}</a></p>`
  const target = !at && single()
  if (target) patchNodes([target.id], (d) => ({ body: d.body + html }))
  else addBox(at ?? center(), 'round', { body: html })
}

export const insertText = (text: string, at?: XYPosition) =>
  addBox(at ?? center(), 'rect', { body: text.split(/\r?\n/).map((l) => `<p>${esc(l)}</p>`).join('') })

/** 선택한 상자 옆에 연결된 새 상자 (Tab) */
export function addChild() {
  const from = single()
  if (!from) return
  const w = from.measured?.width ?? 140
  const siblings = useEd.getState().edges.filter((e) => e.source === from.id && e.sourceHandle === 'r').length
  const id = addBox({ x: from.position.x + w / 2 + 150, y: from.position.y + siblings * 90 }, from.data.shape, {
    fill: from.data.fill, stroke: from.data.stroke, strokeWidth: from.data.strokeWidth, dash: from.data.dash,
  })
  addLink(from.id, 'r', id, 'l', false)
  startEditing(id)
}

/** 가져온 도식을 지금 노트에 넣는다: 기존 상자와 겹치지 않게 오른쪽에 두고, 그쪽으로 화면을 옮긴다 */
export function insertImported({ nodes, edges }: Imported) {
  if (!nodes.length) return
  commit()
  const { nodes: cur, edgeStyle } = useEd.getState()
  const xs = nodes.map((n) => n.position.x), ys = nodes.map((n) => n.position.y)
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
  let target = centerFn()
  if (cur.length) {
    const right = Math.max(...cur.map((n) => n.position.x + (n.measured?.width ?? 140) / 2))
    const cy = cur.reduce((a, n) => a + n.position.y, 0) / cur.length
    target = { x: right + 160 + w / 2, y: cy }
  }
  const dx = target.x - (Math.min(...xs) + w / 2), dy = target.y - (Math.min(...ys) + h / 2)
  const placed = nodes.map((n) => ({ ...n, position: { x: n.position.x + dx, y: n.position.y + dy }, selected: true }))
  const linked = edges.map((e) => ({ ...e, data: { ...e.data!, kind: edgeStyle.kind } }))
  useEd.setState((s) => ({
    nodes: [...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...placed],
    edges: [...s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)), ...linked],
    editingId: null, rev: s.rev + 1,
  }))
  setTimeout(() => fitFn(placed.map((n) => n.id)), 80)
}

export const openImportHere = (text = '') => openImport({ kind: 'note', onImport: insertImported }, text)

/** 붙여넣거나 끌어다 놓은 도식 코드: 바로 넣고, 읽지 못하면 가져오기 창에서 이유를 보여준다 */
export async function importDiagramText(text: string) {
  try { insertImported(await parseDiagram(text)) } catch { openImportHere(text) }
}

export { looksLikeDiagram }
