import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import {
  Background, BackgroundVariant, ConnectionLineType, ConnectionMode, ReactFlow, ReactFlowProvider, SelectionMode, ViewportPortal, reconnectEdge, useReactFlow, useStore,
  type Connection, type FinalConnectionState, type Viewport,
} from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { ArrowLeft, Check, Columns2, Files, Grid3x3, Import, Infinity as InfinityIcon, Maximize, Moon, Share, Minus, MoreVertical, Palette, Plus, RectangleHorizontal, RectangleVertical, Redo2, Sun, Trash2, Undo2 } from 'lucide-react'
import { GROUNDS, groundLook, groundVars } from '../lib/color'
import { db, freshNotes, purgeNote, updateNote } from '../lib/db'
import { isUrl } from '../lib/media'
import { go, setSettings, useTheme } from '../lib/store'
import { pageSize, pagesSize } from '../lib/pages'
import { boxSize } from '../lib/shapes'
import { remoteEvents } from '../lib/sync'
import type { Bg, LogicEdge as LogicEdgeT } from '../lib/types'
import { ColorPanel, IB, Item, Menu, MenuSep, Pop, Segmented, cls } from '../ui/kit'
import { BGS, SyncButton } from '../ui/Settings'
import { toast } from '../ui/Toast'
import { addChild, importDiagramText, insertFiles, insertLink, insertText, looksLikeDiagram, openImportHere, setCenterFn, setFitFn } from './actions'
import { BoxNode } from './BoxNode'
import { CanvasMenu } from './CanvasMenu'
import { DefaultsDialog, openDefaults } from './DefaultsDialog'
import { LogicEdge } from './LogicEdge'
import { Ribbon } from './Ribbon'
import { ExportDialog, openExport } from './ExportDialog'
import { PageIndicator, PageSorter, PagesLayer, openPages } from './Pages'
import { usePageNav, usePageWheel, useSnapToPage } from './pageNav'
import { usePortMoving, usePortPlacing } from './ports'
import {
  CLIP_MARK, addBox, addLink, canHold, commit, copySelection, cutSelection, dragOver, drawBox, effDefaults, finishDrag, flushSave, fmt, groupSelection, hasClip,
  loadNote, moveInto, notePointer, nudge, onEdgesChange, onNodesChange, paintOnto, paperKind, pasteClip, redo, selectOnly, selectToward, setFree, setPageSide, setPaper,
  clearGuides, drawSnap, setViewZoom, snapCenter, startDrag, startEditing, stopEditing, takeOut, undo, useEd, useLook, type PaperKind,
} from './store'
import { t } from '../lib/i18n'

const nodeTypes = { box: BoxNode }
const edgeTypes = { logic: LogicEdge }
const BG: Record<Bg, { variant: BackgroundVariant; gap: number | [number, number]; size?: number } | null> = {
  grid: { variant: BackgroundVariant.Lines, gap: 24 },
  'grid-wide': { variant: BackgroundVariant.Lines, gap: 48 },
  dots: { variant: BackgroundVariant.Dots, gap: 24, size: 1.6 },
  'dots-wide': { variant: BackgroundVariant.Dots, gap: 48, size: 1.8 },
  // 가로줄만: 세로줄 간격을 아주 넓혀 사실상 보이지 않게
  lines: { variant: BackgroundVariant.Lines, gap: [100000, 28] },
  none: null,
}
const PAPERS: { id: PaperKind; label: string; icon: React.ReactNode }[] = [
  { id: 'canvas', label: t('무한 캔버스'), icon: <InfinityIcon size={15} /> },
  { id: 'a4', label: t('A4 세로'), icon: <RectangleVertical size={15} /> },
  { id: 'a4-land', label: t('A4 가로'), icon: <RectangleHorizontal size={15} /> },
]
/** 글을 쓰는 곳인지. 고르기만 한 상자의 미리 띄운 편집기는 아니다 (단축키는 캔버스가 받는다) */
const isEditable = (t: EventTarget | null) => t instanceof HTMLElement && !t.closest('.box-area.ready') && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
const OPPOSITE: Record<string, string> = { t: 'b', b: 't', l: 'r', r: 'l' }
const openIds = new Set<string>()

export default function EditorPage({ id }: { id: string }) {
  const [ready, setReady] = useState<{ viewport?: Viewport } | null>(null)
  useEffect(() => {
    let alive = true
    openIds.add(id)
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
    return () => {
      alive = false
      openIds.delete(id)
      remoteEvents.removeEventListener('note', onRemote)
      flushSave()
      const s = useEd.getState()
      const blank = s.noteId === id && !s.nodes.length && !s.title.trim()
      useEd.setState({ noteId: '' })
      // 새로 만들고 아무것도 안 한 노트는 나갈 때 지운다 (같은 노트를 바로 다시 연 경우는 제외)
      if (blank && freshNotes.has(id)) setTimeout(() => {
        if (openIds.has(id)) return
        freshNotes.delete(id)
        purgeNote(id).then(() => toast(t('빈 노트라서 지웠어요')))
      }, 0)
    }
  }, [id])
  if (!ready) return <div className="editor" />
  return (
    <ReactFlowProvider>
      <div className="editor">
        <TopBar id={id} />
        <Ribbon />
        <ExportDialog />
        <DefaultsDialog />
        <PageSorter />
        <Canvas id={id} viewport={ready.viewport} />
      </div>
    </ReactFlowProvider>
  )
}

function TopBar({ id }: { id: string }) {
  const { title, bg, paper, canUndo, canRedo } = useEd(useShallow((s) => ({
    title: s.title, bg: s.bg, paper: s.paper, canUndo: s.past.length > 0, canRedo: s.future.length > 0,
  })))
  const back = () => { flushSave(); history.length > 1 ? history.back() : go('#/') }
  const toPage = usePageNav()
  const choosePaper = (k: PaperKind) => {
    if (setPaper(k)) toast(t('용지보다 넓은 내용이 있어요. A4 가로로 바꾸거나 상자를 옮겨 주세요'))
    if (k !== 'canvas') requestAnimationFrame(() => toPage(0))
  }
  return (
    <header className="bar editor-bar">
      <IB label={t('뒤로')} onClick={back}><ArrowLeft size={20} strokeWidth={1.6} /></IB>
      <input className="title-input" value={title} placeholder={t('제목 없음')} onChange={(e) => useEd.setState({ title: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <IB label={t('실행 취소 (Ctrl+Z)')} disabled={!canUndo} onClick={undo}><Undo2 size={18} strokeWidth={1.6} /></IB>
      <IB label={t('다시 실행 (Ctrl+Y)')} disabled={!canRedo} onClick={redo}><Redo2 size={18} strokeWidth={1.6} /></IB>
      {paper && <IB label={t('페이지 정렬')} onClick={openPages}><Files size={18} strokeWidth={1.6} /></IB>}
      <NoteDark />
      <BgPop bg={bg} />
      <SyncButton />
      <Menu align="end" trigger={<IB label={t('더보기')}><MoreVertical size={18} strokeWidth={1.6} /></IB>}>
        <Item icon={<Share size={15} />} onSelect={openExport}>{t('내보내기 (그림·AI용 글·코드)')}</Item>
        <Item icon={<Import size={15} />} onSelect={() => openImportHere()}>{t('AI 도식 가져오기')}</Item>
        <Item icon={<Palette size={15} />} onSelect={openDefaults}>{t('기본 모양 (새 상자·선)')}</Item>
        <MenuSep />
        {PAPERS.map((p) => <Item key={p.id} icon={p.icon} checked={paperKind(paper) === p.id} onSelect={() => choosePaper(p.id)}>{p.label}</Item>)}
        {paper && <Item icon={<Columns2 size={15} />} checked={!!paper.side} onSelect={() => setPageSide(!paper.side)}>{t('다음 페이지 옆으로')}</Item>}
        {paper && <Item icon={<Files size={15} />} onSelect={openPages}>{t('페이지 정렬 (추가·삭제·순서)')}</Item>}
        <MenuSep />
        <Item icon={<Trash2 size={15} />} danger onSelect={async () => { flushSave(); await updateNote(id, { trashed: 1 }); go('#/') }}>{t('노트 삭제')}</Item>
      </Menu>
    </header>
  )
}

/** 이 노트만 다크 모드 켜기·끄기 (삼성 노트처럼 종이만 바뀐다). 저절로 그렇게 보이는 쪽으로 돌아오면 노트별 설정을 지운다 */
function NoteDark() {
  const app = useTheme(), dark = useLook().theme === 'dark'
  const toggle = () => {
    const next = dark ? 'light' : 'dark'
    useEd.setState((s) => ({ mode: groundLook(s.ground, app).theme === next ? null : next }))
  }
  return (
    <IB label={dark ? t('이 노트 다크 모드 끄기') : t('이 노트 다크 모드 켜기')} onClick={toggle}>
      {dark ? <Sun size={18} strokeWidth={1.6} /> : <Moon size={18} strokeWidth={1.6} />}
    </IB>
  )
}

/** 배경: 바탕색(노트마다)과 무늬 */
function BgPop({ bg }: { bg: Bg }) {
  const ground = useEd((s) => s.ground)
  return (
    <Pop trigger={<IB label={t('배경 (바탕색·무늬)')}><Grid3x3 size={18} strokeWidth={1.6} /></IB>}>
      <div className="bg-pop">
        <div className="cp-label">{t('바탕색')}</div>
        <ColorPanel value={ground} onChange={(g) => useEd.setState({ ground: g })} palette={GROUNDS} none={t('기본 (흰색·검정)')} />
        <div className="cp-label">{t('무늬')}</div>
        <div className="bg-list">
          {BGS.map((b) => <button key={b.id} type="button" className={cls(bg === b.id && 'on')} onClick={() => useEd.setState({ bg: b.id })}>{b.label}</button>)}
        </div>
        <button type="button" className="cp-adv" onClick={() => { setSettings({ bg, ground }); toast(t('새 노트에 이 배경을 써요')) }}>
          <Check size={13} /> {t('이 배경을 새 노트 기본으로')}
        </button>
      </div>
    </Pop>
  )
}

function Canvas({ id, viewport }: { id: string; viewport?: Viewport }) {
  const look = useLook(), theme = look.theme
  const rf = useReactFlow()
  const wrap = useRef<HTMLDivElement>(null)
  const { nodes, edges, bg, tool, paper, picking, porting, painting, edgeKind } = useEd(useShallow((s) => ({
    nodes: s.nodes, edges: s.edges, bg: s.bg, tool: s.tool, paper: s.paper, picking: s.picking,
    porting: !!s.portDraft, painting: !!s.painter, edgeKind: s.edgeStyle.kind,
  })))
  const onPortDouble = usePortPlacing(), onPortPress = usePortMoving()
  const [fitOnOpen] = useState(() => !viewport && nodes.length > 0 && !useEd.getState().paper)
  // 용지 노트를 처음 열면 첫 페이지를 화면 폭에 맞춰
  const [startView] = useState(() => {
    const p = useEd.getState().paper
    if (viewport || !p) return viewport ?? { x: innerWidth / 2, y: innerHeight / 3, zoom: 1 }
    const zoom = Math.min(1, (innerWidth - 48) / pageSize(p).w)
    return { x: (innerWidth - pageSize(p).w * zoom) / 2, y: 24, zoom }
  })
  const toPage = usePageNav()
  const snap = useSnapToPage()
  usePageWheel(wrap, !!paper)
  /** 스페이스를 누르고 있는 동안은 끌어서 화면 이동 */
  const [space, setSpace] = useState(false)
  /** Shift를 누르고 있으면 빈 곳을 끌어 여러 개 고르기 */
  const [shift, setShift] = useState(false)
  /** 끌어서 그리는 중인 상자 (화면 좌표) */
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const drawingRef = useRef(false)

  const center = useCallback(() => {
    const r = wrap.current!.getBoundingClientRect()
    return rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }, [rf])
  useEffect(() => setCenterFn(center), [center])
  useEffect(() => setFitFn((ids) => rf.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.2, duration: 300, maxZoom: 1 })), [rf])

  /** 방향키로 고른 상자가 화면 밖이면 그쪽으로 */
  const reveal = useCallback((nid: string) => {
    const n = useEd.getState().nodes.find((x) => x.id === nid), el = wrap.current
    if (!n || !el) return
    const r = el.getBoundingClientRect(), p = rf.flowToScreenPosition(n.position)
    if (p.x < r.left + 40 || p.x > r.right - 40 || p.y < r.top + 40 || p.y > r.bottom - 40) rf.setCenter(n.position.x, n.position.y, { zoom: rf.getZoom(), duration: 200 })
  }, [rf])

  // 단축키 · 붙여넣기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setFree(true)
      if (e.key === 'Shift') setShift(true)
      if (isEditable(e.target)) return
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), st = useEd.getState()
      const sel = st.nodes.filter((n) => n.selected)
      if (e.key === ' ') { e.preventDefault(); if (!e.repeat) setSpace(true); return }
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && k === 'y') { e.preventDefault(); redo() }
      else if (mod && k === 'c') { if (copySelection()) navigator.clipboard?.writeText(CLIP_MARK).catch(() => {}) }
      else if (mod && k === 'x') { if (cutSelection()) navigator.clipboard?.writeText(CLIP_MARK).catch(() => {}) }
      else if (mod && k === 'd') { e.preventDefault(); if (copySelection()) pasteClip() }
      else if (mod && k === 'a') { e.preventDefault(); useEd.setState((s) => ({ nodes: s.nodes.map((n) => (n.selected ? n : { ...n, selected: true })) })) }
      else if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? takeOut(sel.map((n) => n.id)) : groupSelection() }
      // 글을 편집하지 않을 때 Ctrl+B·I·U는 고른 상자 글 전체에 (엑셀처럼)
      else if (mod && (k === 'b' || k === 'i' || k === 'u') && sel.length) {
        e.preventDefault()
        fmt((c) => (k === 'b' ? c.toggleBold() : k === 'i' ? c.toggleItalic() : c.toggleUnderline()))
      } else if (e.key === 'Tab') { e.preventDefault(); addChild() }
      else if ((e.key === 'Enter' || e.key === 'F2') && sel.length === 1) { e.preventDefault(); startEditing(sel[0].id) }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        const ed = st.edges.filter((x) => x.selected)
        if (sel.length || ed.length) { e.preventDefault(); rf.deleteElements({ nodes: sel.map((n) => ({ id: n.id })), edges: ed.map((x) => ({ id: x.id })) }) }
      } else if (ARROWS[e.key] && !mod) {
        e.preventDefault()
        const [dx, dy, dir] = ARROWS[e.key]
        // Alt+방향키: 1px씩, Alt+Shift: 한 칸씩 옮기기. 방향키만: 그쪽 상자로 이동
        if (e.altKey) nudge(dx * (e.shiftKey ? 24 : 1), dy * (e.shiftKey ? 24 : 1))
        else { const nid = selectToward(dir); if (nid) reveal(nid) }
      } else if (e.key === 'Escape') {
        if (st.painter) return useEd.setState({ painter: null })
        if (st.picking) return useEd.setState({ picking: null, dropTarget: null })
        useEd.setState((s) => ({ tool: s.tool === 'place' ? 'draw' : s.tool, nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)) }))
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpace(false)
      if (e.key === 'Alt') setFree(false)
      if (e.key === 'Shift') setShift(false)
    }
    const onBlur = () => { setSpace(false); setFree(false); setShift(false) }
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return
      const files = [...(e.clipboardData?.files ?? [])]
      const text = e.clipboardData?.getData('text/plain') ?? ''
      e.preventDefault()
      if (files.length) insertFiles(files)
      else if ((text === CLIP_MARK || !text) && hasClip()) pasteClip()
      else if (isUrl(text)) insertLink(text.trim())
      else if (looksLikeDiagram(text)) importDiagramText(text)
      else if (text.trim()) insertText(text)
    }
    addEventListener('keydown', onKey)
    addEventListener('keyup', onKeyUp)
    addEventListener('blur', onBlur)
    addEventListener('paste', onPaste)
    return () => { removeEventListener('keydown', onKey); removeEventListener('keyup', onKeyUp); removeEventListener('blur', onBlur); removeEventListener('paste', onPaste) }
  }, [rf, reveal])

  const toFlow = (x: number, y: number) => rf.screenToFlowPosition({ x, y })

  const onConnect = useCallback((c: Connection) => addLink(c.source, c.sourceHandle ?? 'r', c.target, c.targetHandle ?? 'l'), [])

  // 빈 곳에 놓으면 새 상자(처음 상자와 같은 크기), 상자 위에 놓으면 가장 가까운 쪽에 연결
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
    const src = useEd.getState().nodes.find((n) => n.id === from.id)
    const w = src?.data.w ?? 144, h = src?.data.h ?? 48
    const off = { l: [w / 2, 0], r: [-w / 2, 0], t: [0, h / 2], b: [0, -h / 2] }[side]!
    const nid = addBox({ x: pos.x + off[0], y: pos.y + off[1] }, src?.data.shape ?? 'rect', { w, h, fill: src?.data.fill ?? null, stroke: src?.data.stroke ?? null })
    addLink(from.id, fh, nid, side ?? OPPOSITE[fh], false)
    startEditing(nid, undefined, false)
  }, [rf])

  const onReconnect = useCallback((old: LogicEdgeT, c: Connection) => {
    commit()
    useEd.setState((s) => ({ edges: reconnectEdge(old, c, s.edges, { shouldReplaceId: false }), rev: s.rev + 1 }))
  }, [])

  /**
   * 누르는 순간: 상자는 바로 고르고(놓을 때까지 기다리지 않는다), 빈 곳을 끌면 상자를 그린다.
   * 도형을 고른 상태(place)면 상자 위에서도 그려서 그 상자 안에 넣는다
   */
  const onPointerDownCapture = (e: React.PointerEvent) => {
    notePointer(e.pointerType)
    setFree(e.altKey)
    const s = useEd.getState(), target = e.target as HTMLElement
    if (e.button !== 0 || space || s.picking || s.portDraft) return
    const nodeEl = target.closest<HTMLElement>('.react-flow__node')
    const place = s.tool === 'place'
    if (nodeEl && !place) {
      const nid = nodeEl.dataset.id!
      const n = s.nodes.find((x) => x.id === nid)
      if (!n || target.closest('.react-flow__handle')) return
      if (s.editingId && s.editingId !== nid) stopEditing()
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // Shift·Ctrl+클릭: 안 고른 상자는 누르는 순간 더하고, 고른 상자는 끌지 않고 떼면 뺀다
        const x0 = e.clientX, y0 = e.clientY
        if (!n.selected) useEd.setState((st) => ({ nodes: st.nodes.map((x) => (x.id === nid ? { ...x, selected: true } : x)) }))
        const onClick = (ev: MouseEvent) => {
          ev.stopPropagation()
          if (n.selected && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) useEd.setState((st) => ({ nodes: st.nodes.map((x) => (x.id === nid ? { ...x, selected: false } : x)) }))
        }
        addEventListener('click', onClick, { capture: true, once: true })
        setTimeout(() => removeEventListener('click', onClick, { capture: true }), 1500)
        return
      }
      if (!n.selected) selectOnly([nid])
      return
    }
    if (e.pointerType === 'touch') return
    const onPane = target.classList.contains('react-flow__pane')
    if (!(place ? !target.closest('button, .react-flow__handle, .react-flow__resize-control, .edge-label') : s.tool === 'draw' && onPane && !e.shiftKey)) return
    if (s.painter) return
    e.stopPropagation()
    drawingRef.current = true
    const x0 = e.clientX, y0 = e.clientY, shape = place ? s.shape : effDefaults().shape
    let moved = false
    /** 화면에서 끈 그대로의 사각형 (캔버스 좌표) */
    const rawRect = (x1: number, y1: number) => {
      const a = toFlow(Math.min(x0, x1), Math.min(y0, y1)), b = toFlow(Math.max(x0, x1), Math.max(y0, y1))
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }
    }
    // 그리는 동안은 윈도우 선택 상자처럼 마우스를 그대로 따라간다. 변이 다른 상자의 변·가운데에 가까우면 붙고 맞춤선이 보인다
    // (모눈 맞춤은 놓을 때)
    const move = (ev: PointerEvent) => {
      setFree(ev.altKey)
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
      moved = true
      const r = drawSnap(rawRect(ev.clientX, ev.clientY), false), p = rf.flowToScreenPosition({ x: r.x, y: r.y }), z = rf.getZoom()
      setDraft({ x: p.x, y: p.y, w: r.w * z, h: r.h * z })
    }
    const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
    const up = (ev: PointerEvent) => {
      removeEventListener('pointermove', move, true)
      removeEventListener('pointerup', up, true)
      drawingRef.current = false
      setDraft(null)
      clearGuides()
      if (!moved && !place) return
      // 그린 뒤 따라오는 클릭이 방금 만든 상자의 선택을 풀지 않게
      addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0)
      let r = drawSnap(rawRect(ev.clientX, ev.clientY), true)
      if (!moved) {
        // 도형만 고르고 눌렀으면 그 자리에 기본 크기로
        const sz = boxSize(shape), c = snapCenter(toFlow(ev.clientX, ev.clientY), sz.w, sz.h)
        r = { x: c.x - sz.w / 2, y: c.y - sz.h / 2, ...sz }
      }
      drawBox(r, shape)
      if (place) useEd.setState({ tool: 'draw', shape: effDefaults().shape })
    }
    addEventListener('pointermove', move, true)
    addEventListener('pointerup', up, true)
  }
  // 그리는 중에는 React Flow가 상자를 끌지 않게
  const onMouseDownCapture = (e: React.MouseEvent) => {
    if (drawingRef.current) { e.stopPropagation(); return }
    onPortPress(e)
  }

  const onPaneClick = () => {
    useEd.setState({ editingEdge: null, painter: null })
    if (useEd.getState().picking) return useEd.setState({ picking: null, dropTarget: null })
    if (useEd.getState().editingId) return stopEditing()
  }
  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    const at = toFlow(e.clientX, e.clientY)
    const files = [...e.dataTransfer.files]
    const diagrams = files.filter((f) => /\.(mmd|mermaid|dot|gv)$/i.test(f.name))
    for (const f of diagrams) importDiagramText(await f.text())
    if (files.length > diagrams.length) return insertFiles(files.filter((f) => !diagrams.includes(f)), at)
    if (diagrams.length) return
    const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (isUrl(text)) insertLink(text.trim(), at)
    else if (text.trim()) insertText(text, at)
  }

  const pattern = paper ? null : BG[bg]
  const ps = paper && pageSize(paper)
  return (
    <CanvasMenu>
    <div className={cls('canvas', `tool-${tool}`, picking && 'picking', paper && 'paper', porting && 'porting', painting && 'painting', space && 'spacing')} ref={wrap}
      onPointerDownCapture={onPointerDownCapture} onMouseDownCapture={onMouseDownCapture} onDoubleClickCapture={onPortDouble}
      onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectEnd={onConnectEnd} onReconnect={onReconnect}
        nodeOrigin={[0.5, 0.5]} connectionMode={ConnectionMode.Loose} connectionRadius={32} connectOnClick={false}
        connectionLineType={edgeKind === 'straight' ? ConnectionLineType.Straight : edgeKind === 'step' ? ConnectionLineType.SmoothStep : ConnectionLineType.Bezier}
        defaultViewport={startView} fitView={fitOnOpen} fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        translateExtent={ps ? [[-ps.w * 1.5, -ps.h], [pagesSize(paper!).w + ps.w * 1.5, pagesSize(paper!).h + ps.h]] : undefined}
        nodesDraggable={!picking && tool !== 'place'}
        // 엑셀처럼: 휠은 위아래, Shift+휠은 옆으로, Ctrl+휠은 확대·축소. 끌어서 이동은 손 도구·스페이스·가운데 버튼
        panOnScroll panOnDrag={tool === 'hand' || space ? true : [1]} panActivationKeyCode={null}
        selectionOnDrag={(tool === 'select' || shift) && !space} selectionKeyCode={null} selectionMode={SelectionMode.Partial}
        zoomOnDoubleClick={false} minZoom={0.1} maxZoom={4}
        // 여러 개 고르기(Shift·Ctrl+클릭)는 누르는 순간 직접 처리한다
        deleteKeyCode={null} multiSelectionKeyCode={null}
        onBeforeDelete={async () => { commit(); return true }}
        elevateNodesOnSelect={false}
        onNodeDragStart={(_, __, ns) => startDrag(ns.map((n) => n.id))}
        onNodeDrag={(_, n) => dragOver(n.id)}
        onNodeDragStop={(_, __, ns) => finishDrag(ns.map((n) => n.id))}
        onSelectionDragStart={(_, ns) => startDrag(ns.map((n) => n.id))}
        onSelectionDrag={(_, ns) => ns[0] && dragOver(ns[0].id)}
        onSelectionDragStop={(_, ns) => finishDrag(ns.map((n) => n.id))}
        onNodeDoubleClick={(e, n) => startEditing(n.id, { x: e.clientX, y: e.clientY })}
        onNodeClick={(_, n) => {
          const st = useEd.getState()
          if (st.picking) return canHold(n.id, st.picking) ? moveInto(st.picking, n.id) : toast(t('여기에는 넣을 수 없어요'))
          if (st.painter) return paintOnto(n.id)
          if (st.editingId !== n.id) stopEditing()
        }}
        onNodeMouseEnter={(_, n) => { const pick = useEd.getState().picking; if (pick) useEd.setState({ dropTarget: canHold(n.id, pick) ? n.id : null }) }}
        onNodeMouseLeave={() => { if (useEd.getState().picking) useEd.setState({ dropTarget: null }) }}
        onEdgeDoubleClick={(_, ed) => useEd.setState({ editingEdge: ed.id })}
        onPaneClick={onPaneClick}
        onMoveEnd={(e, vp) => { updateNote(id, { viewport: vp }, false); snap(e, vp) }}
        colorMode={theme} proOptions={{ hideAttribution: true }} style={groundVars(look)}
      >
        {pattern && (
          <Background variant={pattern.variant} gap={pattern.gap} size={pattern.size} lineWidth={1}
            color={look.grid} bgColor={look.ground} />
        )}
        {!pattern && <Background variant={BackgroundVariant.Dots} gap={1000} size={0} bgColor={paper ? DESK[theme] : look.ground} />}
        {paper && <PagesLayer paper={paper} bg={bg} />}
        <GuideLayer />
      </ReactFlow>
      {draft && <div className="draw-rect" style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }} />}
      {!nodes.length && (
        <div className="empty-note">
          <div className="hint">{t('빈 곳을 끌어서 상자를 그리세요')}</div>
          <Segmented value={paperKind(paper)} options={PAPERS} onChange={(k) => { setPaper(k); if (k !== 'canvas') requestAnimationFrame(() => toPage(0, 'top', 0)) }} />
        </div>
      )}
      {picking && (
        <div className="pick-bar">
          {t('넣을 상자를 누르세요')}
          <button type="button" className="btn" onClick={() => useEd.setState({ picking: null, dropTarget: null })}>{t('취소')}</button>
        </div>
      )}
      {painting && (
        <div className="pick-bar">
          {t('서식을 입힐 상자를 누르세요')}
          <button type="button" className="btn" onClick={() => useEd.setState({ painter: null })}>{t('취소')}</button>
        </div>
      )}
      {paper && <PageIndicator paper={paper} />}
      <ZoomPanel />
    </div>
    </CanvasMenu>
  )
}

/** 방향키 → 옮길 방향과 고를 방향 */
const ARROWS: Record<string, [number, number, 'l' | 'r' | 'u' | 'd']> = {
  ArrowLeft: [-1, 0, 'l'], ArrowRight: [1, 0, 'r'], ArrowUp: [0, -1, 'u'], ArrowDown: [0, 1, 'd'],
}

/** 용지 노트에서 종이 바깥(책상) 색 */
const DESK = { light: '#ECECE9', dark: '#0C0C0D' } as const

/** 맞춤선: 끌거나 크기를 바꾸거나 그리는 동안 다른 상자와 줄이 맞는 곳에 주황 선 (확대해도 1px) */
function GuideLayer() {
  const guides = useEd((s) => s.guides)
  const zoom = useStore((s) => s.transform[2])
  useEffect(() => setViewZoom(zoom), [zoom])
  if (!guides.length) return null
  const w = 1 / zoom
  return (
    <ViewportPortal>
      {guides.map((g, i) => (
        <div key={i} className="guide" style={g.axis === 'x'
          ? { transform: `translate(${g.at - w / 2}px, ${g.from}px)`, width: w, height: g.to - g.from }
          : { transform: `translate(${g.from}px, ${g.at - w / 2}px)`, width: g.to - g.from, height: w }} />
      ))}
    </ViewportPortal>
  )
}

function ZoomPanel() {
  const rf = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  return (
    <div className="zoom">
      <IB label={t('축소')} onClick={() => rf.zoomOut({ duration: 150 })}><Minus size={16} /></IB>
      <button className="zoom-val" title="100%" onClick={() => rf.zoomTo(1, { duration: 150 })}>{Math.round(zoom * 100)}%</button>
      <IB label={t('확대')} onClick={() => rf.zoomIn({ duration: 150 })}><Plus size={16} /></IB>
      <IB label={t('전체 보기')} onClick={() => rf.fitView({ padding: 0.25, duration: 250, maxZoom: 1.5 })}><Maximize size={15} /></IB>
    </div>
  )
}
