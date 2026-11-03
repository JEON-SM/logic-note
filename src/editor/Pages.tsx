// A4 용지 노트의 페이지: 캔버스 위 종이, 아래쪽 페이지 표시, 페이지 정렬 창(삼성 노트처럼 끌어서 순서 바꾸기)
import { useEffect, useMemo } from 'react'
import { ViewportPortal, useStore } from '@xyflow/react'
import { AnimatePresence, motion } from 'motion/react'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { ChevronLeft, ChevronRight, CopyPlus, Plus, Trash2 } from 'lucide-react'
import { nodesByPage, pageAt, pageOrigin, pageSize, pagesSize } from '../lib/pages'
import type { Bg, Paper } from '../lib/types'
import { Thumb } from '../library/NoteThumb'
import { Modal, confirmDanger } from '../ui/Dialogs'
import { IB, Segmented } from '../ui/kit'
import { usePageNav } from './pageNav'
import { addPage, duplicatePage, paperKind, removePage, reorderPages, setPageSide, setPaper, useEd, useLook } from './store'
import { t } from '../lib/i18n'

const useOpen = create<{ open: boolean }>(() => ({ open: false }))
export const openPages = () => useOpen.setState({ open: true })

/** 캔버스 안의 종이들 (상자·선보다 아래) */
export function PagesLayer({ paper, bg }: { paper: Paper; bg: Bg }) {
  const { w, h } = pageSize(paper), all = pagesSize(paper)
  // 페이지 추가 버튼: 마지막 페이지 다음 자리
  const add = paper.side ? { x: all.w + 28, y: h / 2 } : { x: w / 2, y: all.h + 36 }
  return (
    <ViewportPortal>
      <div className="pages-layer">
        {paper.pages.map((id, i) => {
          const o = pageOrigin(paper, i)
          return (
            <div key={id} className={`page bg-${bg}`} style={{ width: w, height: h, transform: `translate(${o.x}px, ${o.y}px)` }}>
              <span className="page-no">{i + 1}</span>
            </div>
          )
        })}
        <button type="button" className="page-add nopan nodrag" style={{ transform: `translate(${add.x}px, ${add.y}px) translate(${paper.side ? '0' : '-50%'}, -50%)` }}
          onClick={() => addPage()}>
          <Plus size={15} /> {t('페이지 추가')}
        </button>
      </div>
    </ViewportPortal>
  )
}

/** 아래쪽 '2 / 5' 표시. 누르면 페이지 정렬 */
export function PageIndicator({ paper }: { paper: Paper }) {
  const go = usePageNav()
  const cur = useStore((s) => pageAt(paper, { x: (s.width / 2 - s.transform[0]) / s.transform[2], y: (s.height / 2 - s.transform[1]) / s.transform[2] }))
  const n = paper.pages.length
  return (
    <div className="page-ind">
      <IB label={t('이전 페이지 (PageUp)')} disabled={cur === 0} onClick={() => go(cur - 1)}><ChevronLeft size={16} /></IB>
      <button type="button" className="page-ind-n" title={t('페이지 정렬')} onClick={openPages}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={cur} className="page-ind-cur" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.2 }}>{cur + 1}</motion.span>
        </AnimatePresence> / {n}
      </button>
      <IB label={t('다음 페이지 (PageDown)')} disabled={cur >= n - 1} onClick={() => go(cur + 1)}><ChevronRight size={16} /></IB>
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
    <Modal open onClose={close} title={t('페이지')} wide>
      <div className="exp-seg">
        <Segmented value={paperKind(paper)} onChange={setPaper}
          options={[{ id: 'a4', label: t('A4 세로') }, { id: 'a4-land', label: t('A4 가로') }]} />
        <Segmented value={paper.side ? 'side' : 'down'} onChange={(v) => setPageSide(v === 'side')}
          options={[{ id: 'down', label: t('다음 페이지 아래로') }, { id: 'side', label: t('다음 페이지 옆으로') }]} />
      </div>
      <p className="set-help">{t('끌어서 순서를 바꿔요 (터치는 길게 눌러서). 누르면 그 페이지로 가요.')}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={paper.pages} strategy={rectSortingStrategy}>
          <div className={`page-grid${paper.landscape ? ' land' : ''}`}>
            {paper.pages.map((id, i) => (
              <PageCard key={id} id={id} index={i} paper={paper} ids={by[i] ?? []} nodes={nodes} edges={edges} frames={frames}
                onOpen={() => { close(); go(i, 'top', 0) }} />
            ))}
            <button type="button" className="page-card page-card-add" onClick={() => addPage()} aria-label={t('페이지 추가')}><Plus size={22} /></button>
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
  const { theme, ground } = useLook()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const { w, h } = pageSize(paper)
  const on = new Set(ids)
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() }
  return (
    <div ref={setNodeRef} className={`page-card${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}
      onClick={onOpen}>
      <div className="page-thumb">
        <Thumb nodes={nodes.filter((n) => on.has(n.id))} edges={edges.filter((e) => on.has(e.source) && on.has(e.target))} frames={frames} theme={theme} ground={ground}
          area={{ ...pageOrigin(paper, index), w, h }} />
      </div>
      <div className="page-card-foot">
        <span>{index + 1}</span>
        <IB label={t('페이지 복제')} {...stop} onClick={(e) => { e.stopPropagation(); duplicatePage(index) }}><CopyPlus size={14} /></IB>
        <IB label={t('페이지 삭제')} disabled={paper.pages.length < 2} {...stop} onClick={async (e) => {
          e.stopPropagation()
          if (!ids.length || await confirmDanger(t('{{n}}쪽을 지울까요?', { n: index + 1 }), t('이 페이지의 상자도 함께 지워져요. Ctrl+Z로 되돌릴 수 있어요.'))) removePage(index)
        }}><Trash2 size={14} /></IB>
      </div>
    </div>
  )
}
