// 연결점 만들기: 상자 테두리를 두 번 누르면 점이 커서를 따라 테두리 위를 움직이고, 한 번 더 누르면 그 자리에 놓인다.
// 모서리·변 가운데 근처에서는 자석처럼 붙고, 테두리에서 조금 벗어나도 유지되며, 너무 멀어지면 취소된다.
// 이미 있는 연결점을 두 번 누르면 지운다 (선이 이어져 있으면 경고 후 선도 함께).
// 연결점을 누르고 테두리를 따라 끌면 옮기고, 테두리에서 멀어지는 쪽으로 끌면 선을 잇는다.
import { useCallback, type MouseEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import { t } from '../lib/i18n'
import { rectOf } from '../lib/sets'
import { outlinePoints, shapeAnchors } from '../lib/shapes'
import { confirmDanger } from '../ui/Dialogs'
import { toast } from '../ui/Toast'
import { addPort, atPort, commit, patchNodes, removePort, useEd } from './store'

type P = { x: number; y: number }
/** 테두리로 인정하는 거리 / 연결점을 누른 것으로 치는 거리 / 자석 거리 / 이보다 멀어지면 취소 (화면 px) */
const PICK = 7, DOT = 9, SNAP = 24, KEEP = 48
/** 한번 붙으면 자석 거리의 이만큼 멀어질 때까지 떨어지지 않는다 */
const HOLD = 1.4
/** 이만큼 끌면(화면 px) 옮기기인지 선 잇기인지 정한다. 끈 거리의 AWAY배 넘게 테두리에서 멀어졌으면 선 잇기 */
const BEGIN = 5, AWAY = 0.55

const nearest = (pts: P[], at: P) => {
  let best = pts[0], d = Infinity
  for (const p of pts) { const q = Math.hypot(p.x - at.x, p.y - at.y); if (q < d) { d = q; best = p } }
  return { ...best, d }
}

type Cursor = { clientX: number; clientY: number }
/** 커서를 테두리 위 자리로 옮겨 주는 함수 (자석 포함). 커서가 keep(화면 px)보다 멀면 null */
function outlineLocator(rf: ReturnType<typeof useReactFlow>, r: { x: number; y: number }, pts: P[], anchors: P[], keep: number) {
  // 지금 붙어 있는 자리
  let held: P | null = null
  return (ev: Cursor) => {
    const zoom = rf.getZoom(), f = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
    const l = { x: f.x - r.x, y: f.y - r.y }, n = nearest(pts, l)
    if (n.d * zoom > keep) return null
    // 커서가 아니라 테두리 위 위치로 재서, 테두리에서 조금 벗어나 있어도 잘 붙는다
    if (held && Math.hypot(n.x - held.x, n.y - held.y) * zoom <= SNAP * HOLD) return { ...held, snapped: true }
    const a = anchors.length ? nearest(anchors, n) : null
    held = a && a.d * zoom <= SNAP ? { x: a.x, y: a.y } : null
    return held ? { ...held, snapped: true } : { x: n.x, y: n.y, snapped: false }
  }
}

/** 연결점을 지운다. 선이 이어져 있으면 먼저 경고하고, 동의하면 그 선도 모두 지운다 */
export async function deletePort(id: string, port: string) {
  const count = useEd.getState().edges.filter((e) => atPort(e, id, port)).length
  if (count && !(await confirmDanger(t('연결된 점을 지울까요?'), t('이 점에 이어진 선 {{count}}개도 함께 사라져요.', { count })))) return
  removePort(id, port)
  toast(count ? t('점과 선 {{count}}개를 지웠어요', { count }) : t('점을 지웠어요'))
}

/** 연결점을 누른 순간: 끄는 방향을 보고 옮기기와 선 잇기를 가른다 */
export function usePortMoving() {
  const rf = useReactFlow()
  return useCallback((e: MouseEvent) => {
    const s = useEd.getState(), el = (e.target as HTMLElement).closest<HTMLElement>('.react-flow__handle.port')
    // 아래에서 React Flow로 되돌려 보낸 누름은 isTrusted가 false다
    if (!el || !e.isTrusted || e.button !== 0 || s.picking || s.portDraft || s.tool === 'place') return
    const id = el.dataset.nodeid!, port = el.dataset.handleid!
    const n = s.nodes.find((x) => x.id === id), from = n?.data.ports?.find((p) => p.id === port)
    if (!n || !from) return
    e.stopPropagation()

    const r = rectOf(n), pts = outlinePoints(n.data.shape, r.w, r.h)
    const others = n.data.ports!.filter((p) => p.id !== port)
    const free = (u: number, v: number) => !others.some((o) => Math.hypot(o.u - u, o.v - v) < 0.02)
    const locate = outlineLocator(rf, r, pts, shapeAnchors(n.data.shape, r.w, r.h).filter((a) => free(a.x / r.w, a.y / r.h)), Infinity)
    const offLine = (c: Cursor) => {
      const f = rf.screenToFlowPosition({ x: c.clientX, y: c.clientY })
      return nearest(pts, { x: f.x - r.x, y: f.y - r.y }).d * rf.getZoom()
    }
    const { clientX, clientY } = e, off0 = offLine(e)
    const place = (u: number, v: number) => patchNodes([id], (d) => ({ ports: (d.ports ?? []).map((p) => (p.id === port ? { ...p, u, v } : p)) }), false)
    let moving = false, saved = false, last = { u: from.u, v: from.v }

    const stop = () => {
      removeEventListener('mousemove', move, true)
      removeEventListener('mouseup', stop, true)
      removeEventListener('keydown', key, true)
      useEd.setState({ portDraft: null })
    }
    const move = (ev: globalThis.MouseEvent) => {
      if (!moving) {
        const gone = Math.hypot(ev.clientX - clientX, ev.clientY - clientY)
        if (gone < BEGIN) return
        if (Math.abs(offLine(ev) - off0) > gone * AWAY) {
          stop()
          el.dispatchEvent(new globalThis.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0, clientX, clientY }))
          return
        }
        moving = true
      }
      const h = locate(ev)
      if (!h) return
      const u = h.x / r.w, v = h.y / r.h
      if (!free(u, v)) return
      useEd.setState({ portDraft: { id, port, ...h } })
      // 자석에 붙어 제자리면 실행 취소 기록도 남기지 않는다
      if (Math.hypot(u - last.u, v - last.v) < 1e-4) return
      if (!saved) { commit(); saved = true }
      place(u, v)
      last = { u, v }
    }
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.stopPropagation()
      stop()
      if (!saved) return
      place(from.u, from.v)
      useEd.setState((st) => ({ past: st.past.slice(0, -1) }))
    }
    addEventListener('mousemove', move, true)
    addEventListener('mouseup', stop, true)
    addEventListener('keydown', key, true)
  }, [rf])
}

export function usePortPlacing() {
  const rf = useReactFlow()
  return useCallback((e: MouseEvent) => {
    const s = useEd.getState(), target = e.target as HTMLElement
    if (s.picking || s.portDraft || s.tool === 'place' || !target.closest('.react-flow')) return
    if (target.closest('.editing, button')) return
    const z = rf.getZoom(), at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    // 연결점을 두 번 누르면 지운다
    for (const n of s.nodes) {
      const r = rectOf(n)
      const dot = n.data.ports?.find((p) => Math.hypot(r.x + p.u * r.w - at.x, r.y + p.v * r.h - at.y) * z <= DOT)
      if (!dot) continue
      e.stopPropagation()
      e.preventDefault()
      void deletePort(n.id, dot.id)
      return
    }
    if (target.closest('.react-flow__edge, .edge-label')) return
    // 누른 곳에서 가장 가까운 테두리
    let hit: { id: string; r: ReturnType<typeof rectOf>; pts: P[]; d: number } | null = null
    for (const n of s.nodes) {
      const r = rectOf(n), m = PICK / z
      if (!r.w || at.x < r.x - m || at.x > r.x + r.w + m || at.y < r.y - m || at.y > r.y + r.h + m) continue
      const pts = outlinePoints(n.data.shape, r.w, r.h), { d } = nearest(pts, { x: at.x - r.x, y: at.y - r.y })
      if (d * z <= PICK && (!hit || d < hit.d)) hit = { id: n.id, r, pts, d }
    }
    if (!hit) return
    e.stopPropagation()
    e.preventDefault()
    const { id, r, pts } = hit
    const anchors = shapeAnchors(s.nodes.find((n) => n.id === id)!.data.shape, r.w, r.h)

    const locate = outlineLocator(rf, r, pts, anchors, KEEP)
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
