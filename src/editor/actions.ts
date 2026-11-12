import type { XYPosition } from '@xyflow/react'
import { addMediaFile, isUrl } from '../lib/media'
import { promptText } from '../ui/Dialogs'
import { looksLikeDiagram, parseDiagram, type Imported } from '../lib/diagram'
import { looksLikeMarkdown, markdownToHtml } from '../lib/rich'
import type { BoxData, MediaItem, Shape } from '../lib/types'
import { openImport } from '../ui/ImportDialog'
import { handleSide } from '../lib/shapes'
import { boxAround, rectOf } from '../lib/sets'
import { addBox, addLink, commit, patchNodes, selectedNodes, startEditing, useEd } from './store'
import { t } from '../lib/i18n'

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
  // 그림에 맞춰 한 번 잰 뒤 그 크기로 고정
  else addBox(at ?? center(), 'rect', { media: items, w: null, h: null })
}

export async function insertLink(url?: string, at?: XYPosition) {
  const u = url ?? (await promptText(t('링크 추가'), 'https://', t('추가')))
  if (!u || !isUrl(u)) return
  const html = `<p><a href="${esc(u.trim())}">${esc(u.trim())}</a></p>`
  const target = !at && single()
  if (target) patchNodes([target.id], (d) => ({ body: d.body + html }))
  else addBox(at ?? center(), 'rect', { body: html, w: null, h: null })
}

/** 붙여넣은 글로 상자 만들기 (글에 맞춘 크기). 마크다운이면 서식으로 바꾸고, 첫 줄이 '# 제목'이면 제목 줄 서식으로 */
export function insertText(text: string, at?: XYPosition) {
  const auto = { w: null, h: null }
  if (!looksLikeMarkdown(text)) return addBox(at ?? center(), 'rect', { ...auto, body: text.split(/\r?\n/).map((l) => `<p>${esc(l)}</p>`).join('') })
  const m = text.match(/^\s*#{1,6}\s+(.+)\r?\n?([\s\S]*)$/)
  return addBox(at ?? center(), 'rect', { ...auto, ...(m && { head: true }), body: (m ? `<p>${esc(m[1].trim())}</p>` : '') + markdownToHtml(m ? m[2] : text) })
}

/** 선택한 상자 오른쪽에 같은 크기·모양으로 연결된 새 상자 (Tab). 이미 있으면 그 아래로 */
export function addChild() {
  const from = single()
  if (!from) return
  const w = from.data.w ?? from.measured?.width ?? 144, h = from.data.h ?? from.measured?.height ?? 48
  const siblings = useEd.getState().edges.filter((e) => e.source === from.id && handleSide(from.data, e.sourceHandle) === 'r').length
  const id = addBox({ x: from.position.x + w + 72, y: from.position.y + siblings * (h + 24) }, from.data.shape, {
    w, h, fill: from.data.fill, stroke: from.data.stroke, strokeWidth: from.data.strokeWidth, dash: from.data.dash,
    head: from.data.head, rule: from.data.rule, valign: from.data.valign, parent: from.data.parent ?? null,
  })
  addLink(from.id, 'r', id, 'l', false)
  startEditing(id, undefined, false)
}

/** 리본 '삽입'의 미리 만든 상자: 화면 가운데에 놓고 바로 글을 쓴다. 다른 상자 안에 완전히 들어가면 (그린 상자처럼) 그 안으로 */
export function addPreset(shape: Shape, patch: Partial<BoxData>) {
  const id = addBox(center(), shape, patch)
  const s = useEd.getState(), n = s.nodes.find((x) => x.id === id)
  const parent = n && boxAround(s.nodes.filter((x) => x.id !== id), rectOf(n))
  if (parent) useEd.setState((st) => ({ nodes: st.nodes.map((x) => (x.id === id ? { ...x, data: { ...x.data, parent } } : x)) }))
  startEditing(id, undefined, false)
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
  const linked = edges.map((e) => (e.data?.offset ? e : { ...e, data: { ...e.data!, kind: edgeStyle.kind } }))
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
