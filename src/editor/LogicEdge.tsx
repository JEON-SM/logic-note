import { memo, useState, type PointerEvent as RPointerEvent } from 'react'
import {
  BaseEdge, EdgeLabelRenderer, ViewportPortal, getBezierPath, getSmoothStepPath, getStraightPath, useReactFlow, useStore, type EdgeProps, type XYPosition,
} from '@xyflow/react'
import { ACCENT, INK, themeMap } from '../lib/color'
import { defaultEdge } from '../lib/shapes'
import type { LogicEdge as LogicEdgeT } from '../lib/types'
import { RelIcon } from '../ui/kit'
import { near, patchEdges, setBends, setFree, snapXY, useEd, useLook } from './store'
import { t } from '../lib/i18n'

export const LogicEdge = memo(function LogicEdge(p: EdgeProps<LogicEdgeT>) {
  const { theme } = useLook()
  const d = { ...defaultEdge(), ...p.data }
  const editing = useEd((s) => s.editingEdge === p.id)
  // 집합 안의 선은 높이(zIndex)가 올라가므로 라벨도 같은 높이로 (선 위, 상자 아래)
  const z = useEd((s) => s.edges.find((e) => e.id === p.id)?.zIndex ?? 0)
  const args = { sourceX: p.sourceX, sourceY: p.sourceY, targetX: p.targetX, targetY: p.targetY, sourcePosition: p.sourcePosition, targetPosition: p.targetPosition }
  // 꺾은 점이 있으면 양 끝과 꺾은 점을 곧게 잇는다
  const all = d.points?.length ? [{ x: p.sourceX, y: p.sourceY }, ...d.points, { x: p.targetX, y: p.targetY }] : null
  const [path, lx, ly] = all ? polyline(all)
    : d.kind === 'straight' ? getStraightPath(args) : d.kind === 'step' ? getSmoothStepPath({ ...args, borderRadius: 10, offset: d.offset ?? 20 }) : getBezierPath(args)
  const color = p.selected ? ACCENT : themeMap(d.color ?? INK.light, theme)
  const mid = `ar-${p.id}`
  return (
    <>
      <defs>
        <marker id={mid} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
          <path d="M0 1L9 5L0 9Z" fill={color} />
        </marker>
      </defs>
      <BaseEdge id={p.id} path={path} interactionWidth={18}
        markerEnd={d.arrow !== 'none' ? `url(#${mid})` : undefined}
        markerStart={d.arrow === 'both' ? `url(#${mid})` : undefined}
        style={{ stroke: color, strokeWidth: d.width, strokeDasharray: d.dashed ? '6 5' : undefined, strokeLinejoin: 'miter' }} />
      {(d.label || d.rel || editing) && (
        <EdgeLabelRenderer>
          <div className={`edge-label nodrag nopan${p.selected ? ' on' : ''}${d.rel && !d.label && !editing ? ' rel-only' : ''}`}
            style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, zIndex: z }}
            onDoubleClick={() => useEd.setState({ editingEdge: p.id })}>
            {d.rel && <span className="edge-rel" style={{ color: p.selected ? undefined : color }}><RelIcon rel={d.rel} size={14} width={1.9} /></span>}
            {editing ? <LabelInput id={p.id} value={d.label} /> : d.label}
          </div>
        </EdgeLabelRenderer>
      )}
      {p.selected && (
        <Bends id={p.id} all={all ?? [{ x: p.sourceX, y: p.sourceY }, { x: p.targetX, y: p.targetY }]}
          avoid={d.label || d.rel ? { x: lx, y: ly } : null} />
      )}
    </>
  )
})

/** 꺾은 점이 있는 선의 길: 곧은 구간들. 라벨 자리는 길이의 한가운데 */
function polyline(all: XYPosition[]): [string, number, number] {
  const path = 'M' + all.map((q) => `${q.x} ${q.y}`).join('L')
  const lens = all.slice(1).map((q, i) => Math.hypot(q.x - all[i].x, q.y - all[i].y))
  let half = lens.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < lens.length; i++) {
    if (half <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, half / lens[i]) : 0
      return [path, all[i].x + (all[i + 1].x - all[i].x) * k, all[i].y + (all[i + 1].y - all[i].y) * k]
    }
    half -= lens[i]
  }
  return [path, all[0].x, all[0].y]
}

/** 꺾은 점 b에서의 각: a 쪽에서 시계 방향으로 c 쪽까지 (0~359°). 곧으면 180°, 직각이면 90° 또는 270° */
export function bendAngle(a: XYPosition, b: XYPosition, c: XYPosition) {
  const deg = ((Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x)) * 180) / Math.PI
  return Math.round(((deg % 360) + 360) % 360) % 360
}

/**
 * 꺾은 점 자리 맞추기: 앞뒤 점과 가로·세로로 줄이 맞으면 붙고(꺾이는 각이 90°·270°가 되게),
 * 아니면 45° 방향에, 그것도 아니면 모눈에. Alt를 누르고 있으면 자유롭게
 */
function snapBend(p: XYPosition, a: XYPosition, c: XYPosition, alt: boolean): XYPosition {
  if (alt) return p
  const tol = near()
  const nx = Math.abs(a.x - p.x) <= Math.abs(c.x - p.x) ? a.x : c.x, ny = Math.abs(a.y - p.y) <= Math.abs(c.y - p.y) ? a.y : c.y
  const sx = Math.abs(nx - p.x) <= tol, sy = Math.abs(ny - p.y) <= tol
  if (sx || sy) {
    const g = snapXY(p)
    return { x: sx ? nx : g.x, y: sy ? ny : g.y }
  }
  for (const q of [a, c]) {
    const ang = Math.atan2(p.y - q.y, p.x - q.x), k = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4), dist = Math.hypot(p.x - q.x, p.y - q.y)
    if (dist > 0 && Math.abs(ang - k) < (3 * Math.PI) / 180) return { x: q.x + Math.cos(k) * dist, y: q.y + Math.sin(k) * dist }
  }
  return snapXY(p)
}

/**
 * 고른 선의 꺾은 점 손잡이: 구간 가운데의 작은 점을 끌면 새로 꺾이고, 꺾은 점을 끌면 옮겨진다(두 번 누르면 지움).
 * 끄는 동안 각 꺾은 점의 각도를 보여 준다
 */
function Bends({ id, all, avoid }: { id: string; all: XYPosition[]; avoid: XYPosition | null }) {
  const rf = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  const bending = useEd((s) => s.bending?.edge === id)
  const pts = all.slice(1, -1)
  const at = (q: XYPosition, shift = 'translate(-50%, -50%)') => ({ transform: `translate(${q.x}px, ${q.y}px) scale(${1 / zoom}) ${shift}` })
  /** 끌기 시작. add면 index 자리에 새 꺾은 점을 넣으며 시작한다 (조금이라도 끌었을 때만) */
  const start = (e: RPointerEvent, index: number, add: boolean) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const x0 = e.clientX, y0 = e.clientY, from = all[0], to = all[all.length - 1]
    let list = pts.map((q) => ({ ...q })), begun = false
    const move = (ev: PointerEvent) => {
      if (!begun) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return
        begun = true
        if (add) list = [...list.slice(0, index), { ...rf.screenToFlowPosition({ x: x0, y: y0 }) }, ...list.slice(index)]
        setBends(id, list, true)
        useEd.setState({ bending: { edge: id, index } })
      }
      setFree(ev.altKey)
      const ends = [from, ...list, to]
      list = list.map((q, i) => (i === index ? snapBend(rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY }), ends[index], ends[index + 2], ev.altKey) : q))
      setBends(id, list)
    }
    const up = () => {
      removeEventListener('pointermove', move, true)
      removeEventListener('pointerup', up, true)
      setFree(false)
      if (begun) useEd.setState({ bending: null })
    }
    addEventListener('pointermove', move, true)
    addEventListener('pointerup', up, true)
  }
  return (
    <ViewportPortal>
      {all.slice(0, -1).map((q, i) => {
        const r = all[i + 1], len = Math.hypot(r.x - q.x, r.y - q.y)
        if (len * zoom < 30) return null
        // 라벨 위에는 두지 않는다 (라벨은 두 번 눌러 고치므로)
        let k = 0.5
        if (avoid && Math.hypot(q.x + (r.x - q.x) / 2 - avoid.x, q.y + (r.y - q.y) / 2 - avoid.y) < 24 / zoom) k = 0.25
        return (
          <div key={`m${i}`} className="bend-add nodrag nopan" title={t('끌어서 꺾기')} style={at({ x: q.x + (r.x - q.x) * k, y: q.y + (r.y - q.y) * k })}
            onPointerDown={(e) => start(e, i, true)} />
        )
      })}
      {pts.map((q, i) => (
        <div key={`b${i}`} className="bend nodrag nopan" title={t('끌어서 옮기기 · 두 번 누르면 지우기')} style={at(q)}
          onPointerDown={(e) => start(e, i, false)}
          onDoubleClick={(e) => { e.stopPropagation(); setBends(id, pts.filter((_, k) => k !== i), true) }} />
      ))}
      {bending && pts.map((q, i) => <div key={`d${i}`} className="bend-deg" style={at(q, 'translate(10px, -30px)')}>{bendAngle(all[i], q, all[i + 2])}°</div>)}
    </ViewportPortal>
  )
}

function LabelInput({ id, value }: { id: string; value: string }) {
  const [v, setV] = useState(value)
  const done = () => { if (v !== value) patchEdges([id], { label: v.trim() }); useEd.setState({ editingEdge: null }) }
  return (
    <input autoFocus value={v} size={Math.max(4, v.length + 1)} placeholder={t('라벨')} onChange={(e) => setV(e.target.value)} onBlur={done}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); done() } }} />
  )
}
