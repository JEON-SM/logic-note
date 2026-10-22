import type { XYPosition } from '@xyflow/react'
import { addMediaFile, isUrl } from '../lib/media'
import { promptText } from '../ui/Dialogs'
import type { MediaItem } from '../lib/types'
import { addBox, addLink, patchNodes, selectedNodes, startEditing, useEd } from './store'

let centerFn: () => XYPosition = () => ({ x: 0, y: 0 })
export const setCenterFn = (f: () => XYPosition) => { centerFn = f }
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
