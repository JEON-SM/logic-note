// 오른쪽 클릭: 빈 곳을 오른쪽 버튼으로 끌면 여러 상자를 고르고, 놓으면(또는 상자를 오른쪽 클릭하면) 메뉴가 뜬다.
// 터치는 길게 누르면 메뉴. 메뉴 자체는 Radix ContextMenu.
import { useRef, useState, type MouseEvent, type PointerEvent, type ReactElement } from 'react'
import { useReactFlow, type XYPosition } from '@xyflow/react'
import { ContextMenu } from 'radix-ui'
import {
  BoxSelect, ClipboardPaste, Copy, Group, LogIn, LogOut, Scaling, Scissors, Square, StickyNote, Tag, Trash2, NotebookPen,
} from 'lucide-react'
import { rectOf } from '../lib/sets'
import { CItem, CSep } from '../ui/kit'
import { toast } from '../ui/Toast'
import {
  CLIP_MARK, addBox, copySelection, effDefaults, cutSelection, groupSelection, hasClip, pasteClip, patchNodes, selectedNodes, startEditing, takeOut, useEd,
} from './store'
import { deletePort } from './ports'
import { t } from '../lib/i18n'

type Ctx = { kind: 'port'; node: string; id: string } | { kind: 'nodes' } | { kind: 'edge'; id: string } | { kind: 'pane'; at: XYPosition }
type Box = { x0: number; y0: number; x1: number; y1: number }

const selectOnly = (ids: string[]) => useEd.setState((s) => ({
  nodes: s.nodes.map((n) => (ids.includes(n.id) === !!n.selected ? n : { ...n, selected: ids.includes(n.id) })),
  edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
}))
const markClip = () => navigator.clipboard?.writeText(CLIP_MARK).catch(() => {})

/** '다른 상자에 넣기': 넣을 상자를 누를 때까지 기다린다 */
export function startPicking(ids: string[]) {
  if (!ids.length) return
  useEd.setState({ picking: ids, tool: 'hand' })
}

export function CanvasMenu({ children }: { children: ReactElement }) {
  const rf = useReactFlow()
  const [ctx, setCtx] = useState<Ctx>({ kind: 'pane', at: { x: 0, y: 0 } })
  const [box, setBox] = useState<Box | null>(null)
  const marqueed = useRef(false)

  // 오른쪽 버튼으로 빈 곳을 끌면 선택 상자
  const onPointerDownCapture = (e: PointerEvent) => {
    if (e.button !== 2 || e.pointerType !== 'mouse') return
    const t = e.target as HTMLElement
    if (!t.closest('.react-flow__pane') || t.closest('.react-flow__node, .react-flow__edge, .react-flow__nodesselection, button')) return
    const b = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }
    let moved = false
    const move = (ev: globalThis.PointerEvent) => {
      b.x1 = ev.clientX; b.y1 = ev.clientY
      if (!moved && Math.hypot(b.x1 - b.x0, b.y1 - b.y0) < 5) return
      moved = true
      setBox({ ...b })
    }
    const up = () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      setBox(null)
      if (!moved) return
      const a = rf.screenToFlowPosition({ x: Math.min(b.x0, b.x1), y: Math.min(b.y0, b.y1) })
      const z = rf.screenToFlowPosition({ x: Math.max(b.x0, b.x1), y: Math.max(b.y0, b.y1) })
      const { nodes, frames } = useEd.getState()
      // 걸치기만 해도 고르되, 집합(틀)은 통째로 들어와야 고른다
      const hit = nodes.filter((n) => {
        const r = rectOf(n, frames[n.id])
        return frames[n.id]
          ? r.x >= a.x && r.y >= a.y && r.x + r.w <= z.x && r.y + r.h <= z.y
          : r.x < z.x && r.x + r.w > a.x && r.y < z.y && r.y + r.h > a.y
      }).map((n) => n.id)
      selectOnly(hit)
      marqueed.current = hit.length > 0
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
  }

  // 메뉴가 열리기 직전: 무엇을 눌렀는지 보고 선택을 맞춘다
  const onContextMenu = (e: MouseEvent) => {
    const t = e.target as HTMLElement
    const node = t.closest<HTMLElement>('.react-flow__node')?.dataset.id
    const edge = t.closest<HTMLElement>('.react-flow__edge')?.dataset.id
    useEd.setState({ picking: null, dropTarget: null })
    const port = t.closest<HTMLElement>('.react-flow__handle.port')?.dataset
    if (port?.nodeid && port.handleid) setCtx({ kind: 'port', node: port.nodeid, id: port.handleid })
    else if (marqueed.current || t.closest('.react-flow__nodesselection')) setCtx({ kind: 'nodes' })
    else if (node) {
      if (!useEd.getState().nodes.find((n) => n.id === node)?.selected) selectOnly([node])
      setCtx({ kind: 'nodes' })
    } else if (edge) {
      useEd.setState((s) => ({ edges: s.edges.map((x) => ({ ...x, selected: x.id === edge })), nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)) }))
      setCtx({ kind: 'edge', id: edge })
    } else {
      selectOnly([])
      setCtx({ kind: 'pane', at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) })
    }
    marqueed.current = false
  }

  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild onContextMenu={onContextMenu} onPointerDownCapture={onPointerDownCapture}>
        {children}
      </ContextMenu.Trigger>
      {box && (
        <div className="marquee" style={{
          left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1),
          width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0),
        }} />
      )}
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu" collisionPadding={8} onCloseAutoFocus={(e) => e.preventDefault()}>
          {ctx.kind === 'port' ? <CItem icon={<Trash2 size={15} />} danger onSelect={() => void deletePort(ctx.node, ctx.id)}>{t('연결점 삭제')}</CItem> : ctx.kind === 'nodes' ? <NodeItems /> : ctx.kind === 'edge' ? <EdgeItems id={ctx.id} /> : <PaneItems at={ctx.at} />}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

function NodeItems() {
  const rf = useReactFlow()
  const sel = selectedNodes()
  const ids = sel.map((n) => n.id)
  const inSet = sel.some((n) => n.data.parent)
  const sized = sel.some((n) => n.data.w || n.data.h)
  return (
    <>
      <div className="menu-label">{t('상자 {{count}}개', { count: ids.length })}</div>
      <CItem icon={<Copy size={15} />} hint="Ctrl+C" onSelect={() => { if (copySelection()) { markClip(); toast(t('{{count}}개 복사했어요', { count: ids.length })) } }}>{t('복사')}</CItem>
      <CItem icon={<Scissors size={15} />} hint="Ctrl+X" onSelect={() => { if (cutSelection()) markClip() }}>{t('잘라내기')}</CItem>
      <CItem icon={<BoxSelect size={15} />} hint="Ctrl+D" onSelect={() => { if (copySelection()) pasteClip() }}>{t('복제')}</CItem>
      <CItem icon={<Trash2 size={15} />} hint="Del" danger onSelect={() => rf.deleteElements({ nodes: ids.map((id) => ({ id })) })}>{t('삭제')}</CItem>
      <CSep />
      <CItem icon={<LogIn size={15} />} onSelect={() => startPicking(ids)}>{t('다른 상자에 넣기…')}</CItem>
      <CItem icon={<Group size={15} />} hint="Ctrl+G" onSelect={groupSelection}>{t('집합으로 묶기')}</CItem>
      {inSet && <CItem icon={<LogOut size={15} />} hint="Ctrl+Shift+G" onSelect={() => takeOut(ids)}>{t('집합에서 꺼내기')}</CItem>}
      {sized && <CItem icon={<Scaling size={15} />} onSelect={() => patchNodes(ids, { w: null, h: null, wrap: null })}>{t('크기 자동 맞춤')}</CItem>}
    </>
  )
}

function EdgeItems({ id }: { id: string }) {
  const rf = useReactFlow()
  return (
    <>
      <CItem icon={<Tag size={15} />} onSelect={() => useEd.setState({ editingEdge: id })}>{t('라벨 쓰기')}</CItem>
      <CItem icon={<Trash2 size={15} />} hint="Del" danger onSelect={() => rf.deleteElements({ edges: [{ id }] })}>{t('선 삭제')}</CItem>
    </>
  )
}

function PaneItems({ at }: { at: XYPosition }) {
  const add = (shape: Parameters<typeof addBox>[1]) => startEditing(addBox(at, shape))
  return (
    <>
      <CItem icon={<Square size={15} />} onSelect={() => add(effDefaults().shape)}>{t('여기에 상자')}</CItem>
      <CItem icon={<StickyNote size={15} />} onSelect={() => add('memo')}>{t('여기에 메모지')}</CItem>
      <CItem icon={<NotebookPen size={15} />} onSelect={() => add('memo-lined')}>{t('여기에 줄 메모지')}</CItem>
      <CSep />
      <CItem icon={<ClipboardPaste size={15} />} hint="Ctrl+V" disabled={!hasClip()} onSelect={() => pasteClip()}>{t('붙여넣기')}</CItem>
      <CItem icon={<BoxSelect size={15} />} hint="Ctrl+A" onSelect={() => useEd.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) }))}>{t('모두 선택')}</CItem>
    </>
  )
}
