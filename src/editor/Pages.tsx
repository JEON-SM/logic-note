// A4 용지 노트의 페이지: 캔버스 위 종이, 아래쪽 페이지 표시, 페이지 정렬 창(삼성 노트처럼 끌어서 순서 바꾸기)
import { useEffect, useMemo } from 'react'
import { ViewportPortal, useReactFlow, useStore } from '@xyflow/react'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { ChevronLeft, ChevronRight, CopyPlus, Plus, Trash2 } from 'lucide-react'
import { useTheme } from '../lib/store'
import { nodesByPage, pageAt, pageSize, pageTop, pagesHeight } from '../lib/pages'
import type { Bg, Paper } from '../lib/types'
import { Thumb } from '../library/NoteThumb'
import { Modal, confirmDanger } from '../ui/Dialogs'
import { IB, Segmented } from '../ui/kit'
import { addPage, duplicatePage, paperKind, removePage, reorderPages, setPaper, useEd } from './store'

const useOpen = create<{ open: boolean }>(() => ({ open: false }))
export const openPages = () => useOpen.setState({ open: true })

/** i번째 페이지 윗부분이 화면 위쪽에 오도록 (폭은 화면에 맞춤) */
export function usePageNav() {
  const rf = useReactFlow()
  const width = useStore((s) => s.width)
  return (i: number, duration = 250) => {
    const p = useEd.getState().paper
    if (!p) return
    const { w } = pageSize(p)
    const zoom = Math.min(1, (width - 48) / w)
    rf.setViewport({ x: (width - w * zoom) / 2, y: 24 - pageTop(p, i) * zoom, zoom }, { duration })
  }
}

/** 캔버스 안의 종이들 (상자·선보다 아래) */
export function PagesLayer({ paper, bg }: { paper: Paper; bg: Bg }) {
  const { w, h } = pageSize(paper)
  return (
    <ViewportPortal>
      <div className="pages-layer">
        {paper.pages.map((id, i) => (
          <div key={id} className={`page bg-${bg}`} style={{ width: w, height: h, transform: `translate(0px, ${pageTop(paper, i)}px)` }}>
            <span className="page-no">{i + 1}</span>
          </div>
        ))}
        <button type="button" className="page-add nopan nodrag" style={{ transform: `translate(${w / 2}px, ${pagesHeight(paper) + 18}px) translateX(-50%)` }}
          onClick={() => addPage()}>
          <Plus size={15} /> 페이지 추가
        </button>
      </div>
    </ViewportPortal>
  )
}

/** 아래쪽 '2 / 5' 표시. 누르면 페이지 정렬 */
export function PageIndicator({ paper }: { paper: Paper }) {
  const go = usePageNav()
  const cur = useStore((s) => pageAt(paper, (s.height / 2 - s.transform[1]) / s.transform[2]))
  const n = paper.pages.length
  return (
    <div className="page-ind">
      <IB label="이전 페이지" disabled={cur === 0} onClick={() => go(cur - 1)}><ChevronLeft size={16} /></IB>
      <button type="button" className="page-ind-n" title="페이지 정렬" onClick={openPages}>{cur + 1} / {n}</button>
      <IB label="다음 페이지" disabled={cur >= n - 1} onClick={() => go(cur + 1)}><ChevronRight size={16} /></IB>
    </div>
  )
}

/** 페이지 정렬: 끌어서 순서 바꾸기, 복제·삭제, 추가, 용지 방향 */
export function PageSorter() {
  const open = useOpen((s) => s.open)
  const { paper, nodes, edges, frames } = useEd(useShallow((s) => ({ paper: s.paper, nodes: s.nodes, edges: s.edges, frames: s.frames })))
  const go = usePageNav()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // 터치는 길게 눌러서 끈다 (그냥 밀면 스크롤)
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const by = useMemo(() => (paper ? nodesByPage(paper, nodes) : []), [paper, nodes])
  useEffect(() => () => useOpen.setState({ open: false }), [])
  if (!open || !paper) return null
  const close = () => useOpen.setState({ open: false })
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    reorderPages(arrayMove(paper.pages, paper.pages.indexOf(String(active.id)), paper.pages.indexOf(String(over.id))))
  }
  return (
    <Modal open onClose={close} title="페이지" wide>
      <div className="exp-seg">
        <Segmented value={paperKind(paper)} onChange={setPaper}
          options={[{ id: 'a4', label: 'A4 세로' }, { id: 'a4-land', label: 'A4 가로' }]} />
      </div>
      <p className="set-help">끌어서 순서를 바꿔요 (터치는 길게 눌러서). 누르면 그 페이지로 가요.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={paper.pages} strategy={rectSortingStrategy}>
          <div className={`page-grid${paper.landscape ? ' land' : ''}`}>
            {paper.pages.map((id, i) => (
              <PageCard key={id} id={id} index={i} paper={paper} ids={by[i] ?? []} nodes={nodes} edges={edges} frames={frames}
                onOpen={() => { close(); go(i) }} />
            ))}
            <button type="button" className="page-card page-card-add" onClick={() => addPage()} aria-label="페이지 추가"><Plus size={22} /></button>
          </div>
        </SortableContext>
      </DndContext>
    </Modal>
  )
}

function PageCard({ id, index, paper, ids, nodes, edges, frames, onOpen }: {
  id: string; index: number; paper: Paper; ids: string[]; onOpen: () => void
  nodes: ReturnType<typeof useEd.getState>['nodes']; edges: ReturnType<typeof useEd.getState>['edges']; frames: ReturnType<typeof useEd.getState>['frames']
}) {
  const theme = useTheme()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const { w, h } = pageSize(paper)
  const on = new Set(ids)
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() }
  return (
    <div ref={setNodeRef} className={`page-card${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}
      onClick={onOpen}>
      <div className="page-thumb">
        <Thumb nodes={nodes.filter((n) => on.has(n.id))} edges={edges.filter((e) => on.has(e.source) && on.has(e.target))} frames={frames} theme={theme}
          area={{ x: 0, y: pageTop(paper, index), w, h }} />
      </div>
      <div className="page-card-foot">
        <span>{index + 1}</span>
        <IB label="페이지 복제" {...stop} onClick={(e) => { e.stopPropagation(); duplicatePage(index) }}><CopyPlus size={14} /></IB>
        <IB label="페이지 삭제" disabled={paper.pages.length < 2} {...stop} onClick={async (e) => {
          e.stopPropagation()
          if (!ids.length || await confirmDanger(`${index + 1}쪽을 지울까요?`, '이 페이지의 상자도 함께 지워져요. Ctrl+Z로 되돌릴 수 있어요.')) removePage(index)
        }}><Trash2 size={14} /></IB>
      </div>
    </div>
  )
}
