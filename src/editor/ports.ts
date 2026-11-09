// 연결점 만들기: 상자 테두리를 두 번 누르면 점이 커서를 따라 테두리 위를 움직이고, 한 번 더 누르면 그 자리에 놓인다.
// 모서리·변 가운데 근처에서는 자석처럼 붙고, 테두리에서 조금 벗어나도 유지되며, 너무 멀어지면 취소된다.
// 이미 있는 연결점을 두 번 누르면 지운다.
import { useCallback, type MouseEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import { t } from '../lib/i18n'
import { rectOf } from '../lib/sets'
import { outlinePoints, shapeAnchors } from '../lib/shapes'
import { toast } from '../ui/Toast'
import { addPort, removePort, useEd } from './store'

type P = { x: number; y: number }
/** 테두리로 인정하는 거리 / 연결점을 누른 것으로 치는 거리 / 자석 거리 / 이보다 멀어지면 취소 (화면 px) */
const PICK = 7, DOT = 9, SNAP = 24, KEEP = 48
/** 한번 붙으면 자석 거리의 이만큼 멀어질 때까지 떨어지지 않는다 */
const HOLD = 1.4

const nearest = (pts: P[], at: P) => {
  let best = pts[0], d = Infinity
  for (const p of pts) { const q = Math.hypot(p.x - at.x, p.y - at.y); if (q < d) { d = q; best = p } }
  return { ...best, d }
}

export function usePortPlacing() {
  const rf = useReactFlow()
  return useCallback((e: MouseEvent) => {
    const s = useEd.getState(), target = e.target as HTMLElement
    if (s.picking || s.portDraft || s.tool === 'place' || !target.closest('.react-flow')) return
    if (target.closest('.editing, button')) return
    const z = rf.getZoom(), at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    // 연결점을 두 번 누르면 지운다 (선이 이어진 점이어도)
    for (const n of s.nodes) {
      const r = rectOf(n, s.frames[n.id])
      const dot = n.data.ports?.find((p) => Math.hypot(r.x + p.u * r.w - at.x, r.y + p.v * r.h - at.y) * z <= DOT)
      if (!dot) continue
      e.stopPropagation()
      e.preventDefault()
      removePort(n.id, dot.id)
      toast(t('점을 지웠어요'))
      return
    }
    if (target.closest('.react-flow__edge, .edge-label')) return
    // 누른 곳에서 가장 가까운 테두리
    let hit: { id: string; r: ReturnType<typeof rectOf>; pts: P[]; d: number } | null = null
    for (const n of s.nodes) {
      const r = rectOf(n, s.frames[n.id]), m = PICK / z
      if (!r.w || at.x < r.x - m || at.x > r.x + r.w + m || at.y < r.y - m || at.y > r.y + r.h + m) continue
      const pts = outlinePoints(n.data.shape, r.w, r.h), { d } = nearest(pts, { x: at.x - r.x, y: at.y - r.y })
      if (d * z <= PICK && (!hit || d < hit.d)) hit = { id: n.id, r, pts, d }
    }
    if (!hit) return
    e.stopPropagation()
    e.preventDefault()
    const { id, r, pts } = hit
    const anchors = shapeAnchors(s.nodes.find((n) => n.id === id)!.data.shape, r.w, r.h)

    // 지금 붙어 있는 자리
    let held: P | null = null
    const locate = (ev: { clientX: number; clientY: number }) => {
      const zoom = rf.getZoom(), f = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      const l = { x: f.x - r.x, y: f.y - r.y }, n = nearest(pts, l)
      if (n.d * zoom > KEEP) return null
      // 커서가 아니라 테두리 위 위치로 재서, 테두리에서 조금 벗어나 있어도 잘 붙는다
      if (held && Math.hypot(n.x - held.x, n.y - held.y) * zoom <= SNAP * HOLD) return { ...held, snapped: true }
      const a = nearest(anchors, n)
      held = a.d * zoom <= SNAP ? { x: a.x, y: a.y } : null
      return held ? { ...held, snapped: true } : { x: n.x, y: n.y, snapped: false }
    }
    const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
    const blocked = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick'] as const
    const stop = () => {
      removeEventListener('pointermove', move, true)
      removeEventListener('click', click, true)
      removeEventListener('keydown', key, true)
      removeEventListener('contextmenu', cancel, true)
      blocked.forEach((b) => removeEventListener(b, swallow, true))
      useEd.setState({ portDraft: null })
    }
    const move = (ev: PointerEvent) => {
      const h = locate(ev)
      if (h) useEd.setState({ portDraft: { id, ...h } }); else stop()
    }
    const click = (ev: globalThis.MouseEvent) => {
      swallow(ev)
      const h = locate(ev)
      stop()
      if (h) addPort(id, h.x / r.w, h.y / r.h)
    }
    const cancel = (ev: Event) => { swallow(ev); stop() }
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cancel(ev) }

    addEventListener('pointermove', move, true)
    addEventListener('click', click, true)
    addEventListener('keydown', key, true)
    addEventListener('contextmenu', cancel, true)
    blocked.forEach((b) => addEventListener(b, swallow, true))
    const first = locate(e)
    if (first) useEd.setState({ portDraft: { id, ...first } })
    toast(t('점 위치를 눌러 정하세요 (Esc 취소)'))
  }, [rf])
}
