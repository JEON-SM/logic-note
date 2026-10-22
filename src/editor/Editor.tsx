import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import {
  Background, BackgroundVariant, ConnectionMode, ReactFlow, ReactFlowProvider, SelectionMode, reconnectEdge, useReactFlow, useStore,
  type Connection, type FinalConnectionState, type Viewport,
} from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { ArrowLeft, Check, Grid3x3, Maximize, Minus, MoreVertical, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { CANVAS } from '../lib/color'
import { db, updateNote } from '../lib/db'
import { isUrl } from '../lib/media'
import { go, useSettings, useTheme } from '../lib/store'
import { remoteEvents } from '../lib/sync'
import type { Bg, LogicEdge as LogicEdgeT } from '../lib/types'
import { IB, Item, Menu, MenuSep } from '../ui/kit'
import { BGS, SyncButton } from '../ui/Settings'
import { addChild, insertFiles, insertLink, insertText, setCenterFn } from './actions'
import { BoxNode } from './BoxNode'
import { LogicEdge } from './LogicEdge'
import { Toolbar } from './Toolbar'
import {
  CLIP_MARK, addBox, addLink, commit, copySelection, flushSave, hasClip, loadNote, onEdgesChange, onNodesChange, pasteClip, redo,
  startEditing, stopEditing, undo, useEd,
} from './store'

const nodeTypes = { box: BoxNode }
const edgeTypes = { logic: LogicEdge }
const BG: Record<Bg, { variant: BackgroundVariant; gap: number; size?: number } | null> = {
  grid: { variant: BackgroundVariant.Lines, gap: 24 },
  'grid-wide': { variant: BackgroundVariant.Lines, gap: 48 },
  dots: { variant: BackgroundVariant.Dots, gap: 24, size: 1.6 },
  'dots-wide': { variant: BackgroundVariant.Dots, gap: 48, size: 1.8 },
  none: null,
}
const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
const OPPOSITE: Record<string, string> = { t: 'b', b: 't', l: 'r', r: 'l' }

export default function EditorPage({ id }: { id: string }) {
  const [ready, setReady] = useState<{ viewport?: Viewport } | null>(null)
  useEffect(() => {
    let alive = true
    db.notes.get(id).then((n) => {
      if (!alive) return
      if (!n || n.deleted) return go('#/')
      loadNote(n)
      setReady({ viewport: n.viewport })
    })
    // 다른 기기에서 받은 변경: 편집 중이 아니면 다시 불러온다
    const onRemote = (e: Event) => {
      if ((e as CustomEvent).detail !== id || useEd.getState().editingId) return
      db.notes.get(id).then((n) => n && loadNote(n))
    }
    remoteEvents.addEventListener('note', onRemote)
    return () => { alive = false; remoteEvents.removeEventListener('note', onRemote); flushSave(); useEd.setState({ noteId: '' }) }
  }, [id])
  if (!ready) return <div className="editor" />
  return (
    <ReactFlowProvider>
      <div className="editor">
        <TopBar id={id} />
        <Toolbar />
        <Canvas id={id} viewport={ready.viewport} />
      </div>
    </ReactFlowProvider>
  )
}

function TopBar({ id }: { id: string }) {
  const { title, bg, canUndo, canRedo } = useEd(useShallow((s) => ({ title: s.title, bg: s.bg, canUndo: s.past.length > 0, canRedo: s.future.length > 0 })))
  const back = () => { flushSave(); history.length > 1 ? history.back() : go('#/') }
  return (
    <header className="bar editor-bar">
      <IB label="뒤로" onClick={back}><ArrowLeft size={20} strokeWidth={1.6} /></IB>
      <input className="title-input" value={title} placeholder="제목 없음" onChange={(e) => useEd.setState({ title: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <IB label="실행 취소 (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={18} strokeWidth={1.6} /></IB>
      <IB label="다시 실행 (Ctrl+Y)" disabled={!canRedo} onClick={redo}><Redo2 size={18} strokeWidth={1.6} /></IB>
      <Menu align="end" trigger={<IB label="배경"><Grid3x3 size={18} strokeWidth={1.6} /></IB>}>
        {BGS.map((b) => <Item key={b.id} checked={bg === b.id} onSelect={() => useEd.setState({ bg: b.id })}>{b.label}</Item>)}
      </Menu>
      <SyncButton />
      <Menu align="end" trigger={<IB label="더보기"><MoreVertical size={18} strokeWidth={1.6} /></IB>}>
        <Item icon={<Check size={15} />} onSelect={() => useSettings.setState({ bg })}>이 배경을 기본으로</Item>
        <MenuSep />
        <Item icon={<Trash2 size={15} />} danger onSelect={async () => { flushSave(); await updateNote(id, { trashed: 1 }); go('#/') }}>노트 삭제</Item>
      </Menu>
    </header>
  )
}

function Canvas({ id, viewport }: { id: string; viewport?: Viewport }) {
  const theme = useTheme()
  const rf = useReactFlow()
  const wrap = useRef<HTMLDivElement>(null)
  const { nodes, edges, bg, tool, shape } = useEd(useShallow((s) => ({ nodes: s.nodes, edges: s.edges, bg: s.bg, tool: s.tool, shape: s.shape })))
  const [fitOnOpen] = useState(() => !viewport && nodes.length > 0)

  const center = useCallback(() => {
    const r = wrap.current!.getBoundingClientRect()
    return rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }, [rf])
  useEffect(() => setCenterFn(center), [center])

  // 단축키 · 붙여넣기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && k === 'y') { e.preventDefault(); redo() }
      else if (mod && k === 'c') { if (copySelection()) navigator.clipboard?.writeText(CLIP_MARK).catch(() => {}) }
      else if (mod && k === 'd') { e.preventDefault(); if (copySelection()) pasteClip() }
      else if (mod && k === 'a') { e.preventDefault(); useEd.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) })) }
      else if (e.key === 'Tab') { e.preventDefault(); addChild() }
      else if (e.key === 'Enter') {
        const sel = useEd.getState().nodes.filter((n) => n.selected)
        if (sel.length === 1) { e.preventDefault(); startEditing(sel[0].id) }
      } else if (e.key === 'Escape') {
        useEd.setState((s) => ({ tool: s.tool === 'place' ? 'hand' : s.tool, nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)) }))
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return
      const files = [...(e.clipboardData?.files ?? [])]
      const text = e.clipboardData?.getData('text/plain') ?? ''
      e.preventDefault()
      if (files.length) insertFiles(files)
      else if ((text === CLIP_MARK || !text) && hasClip()) pasteClip()
      else if (isUrl(text)) insertLink(text.trim())
      else if (text.trim()) insertText(text)
    }
    addEventListener('keydown', onKey)
    addEventListener('paste', onPaste)
    return () => { removeEventListener('keydown', onKey); removeEventListener('paste', onPaste) }
  }, [])

  const toFlow = (x: number, y: number) => rf.screenToFlowPosition({ x, y })

  const onConnect = useCallback((c: Connection) => addLink(c.source, c.sourceHandle ?? 'r', c.target, c.targetHandle ?? 'l'), [])

  // 빈 곳에 놓으면 새 상자, 상자 위에 놓으면 가장 가까운 쪽에 연결
  const onConnectEnd = useCallback((e: MouseEvent | TouchEvent, cs: FinalConnectionState) => {
    if (cs.isValid || !cs.fromNode) return
    const pt = 'changedTouches' in e ? e.changedTouches[0] : e
    const pos = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY })
    const from = cs.fromNode, fh = cs.fromHandle?.id ?? 'r'
    const hit = document.elementFromPoint(pt.clientX, pt.clientY)?.closest('.react-flow__node')?.getAttribute('data-id')
    const target = hit && useEd.getState().nodes.find((n) => n.id === hit)
    const dx = pos.x - from.position.x, dy = pos.y - from.position.y
    const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'l' : 'r') : dy > 0 ? 't' : 'b'
    if (target) {
      if (target.id !== from.id) addLink(from.id, fh, target.id, side)
      return
    }
    const off = { l: [60, 0], r: [-60, 0], t: [0, 24], b: [0, -24] }[side]!
    const nid = addBox({ x: pos.x + off[0], y: pos.y + off[1] }, useEd.getState().nodes.find((n) => n.id === from.id)?.data.shape ?? 'rect')
    addLink(from.id, fh, nid, side ?? OPPOSITE[fh], false)
    startEditing(nid)
  }, [rf])

  const onReconnect = useCallback((old: LogicEdgeT, c: Connection) => {
    commit()
    useEd.setState((s) => ({ edges: reconnectEdge(old, c, s.edges, { shouldReplaceId: false }), rev: s.rev + 1 }))
  }, [])

  const onPaneClick = (e: React.MouseEvent) => {
    useEd.setState({ editingEdge: null })
    if (useEd.getState().editingId) return stopEditing()
    if (tool === 'place') {
      const nid = addBox(toFlow(e.clientX, e.clientY), shape)
      useEd.setState({ tool: 'hand' })
      startEditing(nid)
    }
  }
  const onDoubleClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return
    startEditing(addBox(toFlow(e.clientX, e.clientY), shape))
  }
  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    const at = toFlow(e.clientX, e.clientY)
    const files = [...e.dataTransfer.files]
    if (files.length) return insertFiles(files, at)
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (isUrl(text)) insertLink(text.trim(), at)
    else if (text.trim()) insertText(text, at)
  }

  const pattern = BG[bg]
  return (
    <div className={`canvas tool-${tool}`} ref={wrap} onDoubleClick={onDoubleClick} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectEnd={onConnectEnd} onReconnect={onReconnect}
        nodeOrigin={[0.5, 0.5]} connectionMode={ConnectionMode.Loose} connectionRadius={32}
        defaultViewport={viewport ?? { x: innerWidth / 2, y: innerHeight / 3, zoom: 1 }} fitView={fitOnOpen} fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        panOnDrag={tool === 'select' ? [1, 2] : true} selectionOnDrag={tool === 'select'} selectionMode={SelectionMode.Partial}
        panOnScroll={false} zoomOnDoubleClick={false} minZoom={0.1} maxZoom={4}
        deleteKeyCode={['Backspace', 'Delete']} multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        onBeforeDelete={async () => { commit(); return true }}
        onNodeDragStart={() => commit()}
        onNodeDoubleClick={(_, n) => startEditing(n.id)}
        onNodeClick={(_, n) => { if (useEd.getState().editingId !== n.id) stopEditing() }}
        onEdgeDoubleClick={(_, ed) => useEd.setState({ editingEdge: ed.id })}
        onPaneClick={onPaneClick}
        onMoveEnd={(_, vp) => updateNote(id, { viewport: vp }, false)}
        colorMode={theme} proOptions={{ hideAttribution: true }}
      >
        {pattern && (
          <Background variant={pattern.variant} gap={pattern.gap} size={pattern.size} lineWidth={1}
            color={theme === 'dark' ? '#323236' : '#ECECEA'} bgColor={CANVAS[theme]} />
        )}
        {!pattern && <Background variant={BackgroundVariant.Dots} gap={1000} size={0} bgColor={CANVAS[theme]} />}
      </ReactFlow>
      {!nodes.length && <div className="hint">빈 곳을 두 번 눌러 상자 만들기</div>}
      <ZoomPanel />
    </div>
  )
}

function ZoomPanel() {
  const rf = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  return (
    <div className="zoom">
      <IB label="축소" onClick={() => rf.zoomOut({ duration: 150 })}><Minus size={16} /></IB>
      <button className="zoom-val" title="100%" onClick={() => rf.zoomTo(1, { duration: 150 })}>{Math.round(zoom * 100)}%</button>
      <IB label="확대" onClick={() => rf.zoomIn({ duration: 150 })}><Plus size={16} /></IB>
      <IB label="전체 보기" onClick={() => rf.fitView({ padding: 0.25, duration: 250, maxZoom: 1.5 })}><Maximize size={15} /></IB>
    </div>
  )
}
