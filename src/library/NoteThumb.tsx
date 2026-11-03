import { memo } from 'react'
import { INK, SURFACE, groundLook, themeMap, readable, type Theme } from '../lib/color'
import { plain } from '../lib/db'
import { pageSize } from '../lib/pages'
import { hierarchy, type Frame, type Rect } from '../lib/sets'
import { isMemo, shapePath } from '../lib/shapes'
import type { BoxNode, LogicEdge, Note } from '../lib/types'

/** 노트 데이터로 그린 미리보기 (스크린샷 없이 SVG로). 용지 노트는 첫 페이지를 보여 준다 */
export const NoteThumb = memo(function NoteThumb({ note, theme: appTheme }: { note: Note; theme: Theme }) {
  const { theme, ground } = groundLook(note.ground, appTheme)
  if (note.paper) {
    const { w, h } = pageSize(note.paper)
    return <Thumb nodes={note.nodes} edges={note.edges} theme={theme} ground={ground} area={{ x: 0, y: 0, w, h }} />
  }
  if (!note.nodes.length) return null
  return <Thumb nodes={note.nodes} edges={note.edges} theme={theme} ground={ground} />
})

/** 상자·선 그림. area가 있으면 그 영역(페이지)만 종이처럼 그린다 */
export function Thumb({ nodes, edges, theme, area, frames, ground }: {
  nodes: BoxNode[]; edges: LogicEdge[]; theme: Theme; area?: Rect; frames?: Record<string, Frame>; ground?: string
}) {
  const rects = new Map(nodes.map((n) => {
    const w = frames?.[n.id]?.w ?? n.measured?.width ?? n.data.w ?? 140, h = frames?.[n.id]?.h ?? n.measured?.height ?? n.data.h ?? 48
    return [n.id, { x: n.position.x - w / 2, y: n.position.y - h / 2, w, h }]
  }))
  let vb: string
  if (area) vb = `${area.x} ${area.y} ${area.w} ${area.h}`
  else {
    const all = [...rects.values()]
    const x0 = Math.min(...all.map((r) => r.x)), y0 = Math.min(...all.map((r) => r.y))
    const x1 = Math.max(...all.map((r) => r.x + r.w)), y1 = Math.max(...all.map((r) => r.y + r.h))
    const pad = Math.max(24, (x1 - x0) * 0.06)
    vb = `${x0 - pad} ${y0 - pad} ${Math.max(x1 - x0, 320) + pad * 2} ${Math.max(y1 - y0, 200) + pad * 2}`
  }
  const c = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2]
  const { kids, depth } = hierarchy(nodes)
  return (
    <svg className={`thumb-svg${area ? ' paper' : ''}`} viewBox={vb} preserveAspectRatio="xMidYMid meet">
      {area && <rect x={area.x} y={area.y} width={area.w} height={area.h} fill={ground ?? SURFACE[theme]} />}
      {edges.map((e) => {
        const a = rects.get(e.source), b = rects.get(e.target)
        if (!a || !b) return null
        const [ax, ay] = c(a), [bx, by] = c(b)
        return <line key={e.id} x1={ax} y1={ay} x2={bx} y2={by} stroke={themeMap(e.data?.color ?? INK.light, theme)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      })}
      {[...nodes].sort((a, b) => depth(a.id) - depth(b.id)).map((n) => {
        const r = rects.get(n.id)!, d = n.data, set = kids.has(n.id), memo = isMemo(d.shape)
        // 집합은 바탕 없이 테두리만, 글은 위쪽에. 메모지는 글을 왼쪽 위에
        const fill = d.fill ? themeMap(d.fill, theme) : set ? 'none' : SURFACE[theme]
        const text = plain(d.title) || plain(d.body)
        return (
          <g key={n.id} transform={`translate(${r.x} ${r.y})`}>
            <path d={shapePath(d.shape, r.w, r.h)} fill={fill} stroke={d.dash === 'none' ? 'none' : themeMap(d.stroke ?? INK.light, theme)} strokeWidth={set ? 2 : 1} vectorEffect="non-scaling-stroke" />
            {text && (
              <text x={memo ? 14 : r.w / 2} y={set || memo ? 22 : r.h / 2} textAnchor={memo ? 'start' : 'middle'} dominantBaseline="central" fontSize={14} fontWeight={600}
                fill={readable('#1C1C1E', fill === 'none' ? ground ?? SURFACE[theme] : fill)}>
                {text.length > 22 ? text.slice(0, 21) + '…' : text}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
