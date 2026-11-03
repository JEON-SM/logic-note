// A4 용지 노트에서 페이지 넘기기: 휠·PageUp/PageDown·쪽 표시 버튼은 다음/이전 페이지로 미끄러지듯 넘어가고,
// 손으로 밀다 놓으면 가까운 페이지에 맞춰 선다 (삼성 노트처럼).
import { useEffect, type RefObject } from 'react'
import { useReactFlow, useStoreApi, type Viewport } from '@xyflow/react'
import { pageAt, pageOrigin, pageSize } from '../lib/pages'
import { useEd } from './store'

const EDGE = 24
const easeOut = (t: number) => 1 - (1 - t) ** 3

/** 화면 가운데에 있는 페이지 */
export const currentPage = (vp: Viewport, w: number, h: number) => {
  const p = useEd.getState().paper
  return p ? pageAt(p, { x: (w / 2 - vp.x) / vp.zoom, y: (h / 2 - vp.y) / vp.zoom }) : 0
}

export function usePageNav() {
  const rf = useReactFlow()
  const store = useStoreApi()
  /**
   * i번째 페이지로. 지금 배율은 그대로 두고, 페이지가 화면에 다 들어가면 가운데에,
   * 아니면 위쪽(align 'top') 또는 아래쪽('bottom')을 맞춘다.
   */
  return (i: number, align: 'top' | 'bottom' = 'top', duration = 420) => {
    const p = useEd.getState().paper
    if (!p) return
    const { width: W, height: H } = store.getState()
    const vp = rf.getViewport(), z = vp.zoom
    const s = pageSize(p), o = pageOrigin(p, i)
    const x = s.w * z <= W - EDGE ? (W - s.w * z) / 2 - o.x * z : vp.x - (o.x - pageOrigin(p, currentPage(vp, W, H)).x) * z
    const y = s.h * z <= H - EDGE ? (H - s.h * z) / 2 - o.y * z : align === 'top' ? EDGE - o.y * z : H - EDGE - (o.y + s.h) * z
    rf.setViewport({ x, y, zoom: z }, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration, ease: easeOut, interpolate: 'linear' })
  }
}

/** 용지 노트의 휠·키보드 페이지 넘기기. Ctrl+휠(또는 핀치)은 그대로 확대·축소 */
export function usePageWheel(wrap: RefObject<HTMLDivElement | null>, on: boolean) {
  const rf = useReactFlow()
  const store = useStoreApi()
  const go = usePageNav()
  useEffect(() => {
    const el = wrap.current
    if (!el || !on) return
    let acc = 0, lock = 0
    const flip = (dir: number) => {
      const p = useEd.getState().paper!
      const { width: W, height: H } = store.getState()
      const next = currentPage(rf.getViewport(), W, H) + dir
      if (next < 0 || next >= p.pages.length || Date.now() < lock) return
      lock = Date.now() + 450
      go(next, dir > 0 ? 'top' : 'bottom')
    }
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('.editing, .nowheel')) return
      e.preventDefault()
      e.stopPropagation()
      if (Date.now() < lock) return
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const dy = (e.shiftKey ? 0 : e.deltaY) * unit, dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit
      const p = useEd.getState().paper!
      const { width: W, height: H } = store.getState()
      const vp = rf.getViewport(), z = vp.zoom
      const s = pageSize(p), o = pageOrigin(p, currentPage(vp, W, H))
      // 페이지가 화면보다 길면 먼저 페이지 안에서 위아래로, 끝에 닿으면 넘긴다
      if (s.h * z > H - EDGE && dy) {
        const top = EDGE - o.y * z, bottom = H - EDGE - (o.y + s.h) * z
        const y = Math.min(top, Math.max(bottom, vp.y - dy))
        if (Math.abs(y - vp.y) > 0.5) { acc = 0; rf.setViewport({ x: vp.x - dx, y, zoom: z }); return }
      } else if (dx && !dy) { rf.setViewport({ x: vp.x - dx, y: vp.y, zoom: z }); return }
      acc += dy || dx
      if (Math.abs(acc) < 40) return
      const dir = Math.sign(acc)
      acc = 0
      flip(dir)
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable=true]')) return
      if (e.key === 'PageDown') { e.preventDefault(); flip(1) } else if (e.key === 'PageUp') { e.preventDefault(); flip(-1) }
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    addEventListener('keydown', onKey)
    return () => { el.removeEventListener('wheel', onWheel, { capture: true }); removeEventListener('keydown', onKey) }
  }, [wrap, on, rf, store]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** 손으로 밀어 옮긴 뒤: 페이지가 화면에 다 들어가는 배율이면 가까운 페이지에 맞춰 선다 */
export function useSnapToPage() {
  const store = useStoreApi()
  const go = usePageNav()
  return (e: MouseEvent | TouchEvent | null, vp: Viewport) => {
    const p = useEd.getState().paper
    if (!p || !e) return
    const { width: W, height: H } = store.getState(), s = pageSize(p)
    const fits = p.side ? s.w * vp.zoom <= W - EDGE : s.h * vp.zoom <= H - EDGE
    if (fits) go(currentPage(vp, W, H), 'top', 300)
  }
}
