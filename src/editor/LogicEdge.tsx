import { memo, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, type EdgeProps } from '@xyflow/react'
import { ACCENT, INK, themeMap } from '../lib/color'
import { defaultEdge } from '../lib/shapes'
import { useTheme } from '../lib/store'
import type { LogicEdge as LogicEdgeT } from '../lib/types'
import { RelIcon } from '../ui/kit'
import { patchEdges, useEd } from './store'

export const LogicEdge = memo(function LogicEdge(p: EdgeProps<LogicEdgeT>) {
  const theme = useTheme()
  const d = { ...defaultEdge(), ...p.data }
  const editing = useEd((s) => s.editingEdge === p.id)
  // 집합 안의 선은 높이(zIndex)가 올라가므로 라벨도 같은 높이로 (선 위, 상자 아래)
  const z = useEd((s) => s.edges.find((e) => e.id === p.id)?.zIndex ?? 0)
  const args = { sourceX: p.sourceX, sourceY: p.sourceY, targetX: p.targetX, targetY: p.targetY, sourcePosition: p.sourcePosition, targetPosition: p.targetPosition }
  const [path, lx, ly] =
    d.kind === 'straight' ? getStraightPath(args) : d.kind === 'step' ? getSmoothStepPath({ ...args, borderRadius: 10, offset: d.offset ?? 20 }) : getBezierPath(args)
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
        style={{ stroke: color, strokeWidth: d.width, strokeDasharray: d.dashed ? '6 5' : undefined }} />
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
    </>
  )
})

function LabelInput({ id, value }: { id: string; value: string }) {
  const [v, setV] = useState(value)
  const done = () => { if (v !== value) patchEdges([id], { label: v.trim() }); useEd.setState({ editingEdge: null }) }
  return (
    <input autoFocus value={v} size={Math.max(4, v.length + 1)} placeholder="라벨" onChange={(e) => setV(e.target.value)} onBlur={done}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); done() } }} />
  )
}
