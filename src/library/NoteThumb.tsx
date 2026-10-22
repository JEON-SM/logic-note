import { memo } from 'react'
import { INK, SURFACE, themeMap, readable, type Theme } from '../lib/color'
import { plain } from '../lib/db'
import { shapePath } from '../lib/shapes'
import type { Note } from '../lib/types'

/** 노트 데이터로 그린 미리보기 (스크린샷 없이 SVG로) */
export const NoteThumb = memo(function NoteThumb({ note, theme }: { note: Note; theme: Theme }) {
  if (!note.nodes.length) return null
  const rects = new Map(note.nodes.map((n) => {
    const w = n.measured?.width ?? 140, h = n.measured?.height ?? 48
    return [n.id, { x: n.position.x - w / 2, y: n.position.y - h / 2, w, h }]
  }))
  const all = [...rects.values()]
  const x0 = Math.min(...all.map((r) => r.x)), y0 = Math.min(...all.map((r) => r.y))
  const x1 = Math.max(...all.map((r) => r.x + r.w)), y1 = Math.max(...all.map((r) => r.y + r.h))
  const pad = Math.max(24, (x1 - x0) * 0.06)
  const vb = `${x0 - pad} ${y0 - pad} ${Math.max(x1 - x0, 320) + pad * 2} ${Math.max(y1 - y0, 200) + pad * 2}`
  const c = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2]
  return (
    <svg className="thumb-svg" viewBox={vb} preserveAspectRatio="xMidYMid meet">
      {note.edges.map((e) => {
        const a = rects.get(e.source), b = rects.get(e.target)
        if (!a || !b) return null
        const [ax, ay] = c(a), [bx, by] = c(b)
        return <line key={e.id} x1={ax} y1={ay} x2={bx} y2={by} stroke={themeMap(e.data?.color ?? INK.light, theme)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      })}
      {note.nodes.map((n) => {
        const r = rects.get(n.id)!, d = n.data
        const fill = d.fill ? themeMap(d.fill, theme) : SURFACE[theme]
        const text = plain(d.title) || plain(d.body)
        return (
          <g key={n.id} transform={`translate(${r.x} ${r.y})`}>
            <path d={shapePath(d.shape, r.w, r.h)} fill={fill} stroke={d.dash === 'none' ? 'none' : themeMap(d.stroke ?? INK.light, theme)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {text && (
              <text x={r.w / 2} y={r.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={600} fill={readable('#1C1C1E', fill)}>
                {text.length > 22 ? text.slice(0, 21) + '…' : text}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
})
