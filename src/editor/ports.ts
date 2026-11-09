// 연결점 만들기: 상자 테두리를 두 번 누르면 점이 커서를 따라 테두리 위를 움직이고, 한 번 더 누르면 그 자리에 놓인다.
// 모서리·변 가운데 근처에서는 자석처럼 붙고, 테두리에서 조금 벗어나도 유지되며, 너무 멀어지면 취소된다.
import { useCallback, type MouseEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import { t } from '../lib/i18n'
import { rectOf } from '../lib/sets'
import { outlinePoints, shapeAnchors } from '../lib/shapes'
import { toast } from '../ui/Toast'
import { addPort, useEd } from './store'

type P = { x: number; y: number }
/** 테두리로 인정하는 거리 / 자석 거리 / 이보다 멀어지면 취소 (화면 px) */
const PICK = 7, SNAP = 12, KEEP = 48

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
    if (target.closest('.editing, .react-flow__edge, .edge-label, button')) return
    const z = rf.getZoom(), at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
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

    const locate = (ev: { clientX: number; clientY: number }) => {
      const zoom = rf.getZoom(), f = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      const l = { x: f.x - r.x, y: f.y - r.y }, n = nearest(pts, l)
      if (n.d * zoom > KEEP) return null
      const a = nearest(anchors, l)
      return a.d * zoom <= SNAP ? { x: a.x, y: a.y, snapped: true } : { x: n.x, y: n.y, snapped: false }
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
