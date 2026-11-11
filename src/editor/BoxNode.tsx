import { memo, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { Handle, NodeResizer, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { EditorView } from '@tiptap/pm/view'
import { animate } from 'motion/react'
import { Play, X } from 'lucide-react'
import { ACCENT, INK, SURFACE, readable, themeMap, toneOf } from '../lib/color'
import { useMediaUrl, usePreview, youtubeId } from '../lib/media'
import { htmlOf, markdownPaste, richExtensions, sanitize, linksIn } from '../lib/rich'
import { MEMO, innerSize, isMemo, outerSize, portSide, shapeAnchors, shapePath } from '../lib/shapes'
import type { BoxData, BoxNode as BoxNodeT, MediaItem } from '../lib/types'
import { beginResize, born, endResize, fixSize, patchNodes, startEditing, stopEditing, takeCaret, useEd, useLook } from './store'
import { t } from '../lib/i18n'

const SIDES = [
  { id: 't', pos: Position.Top }, { id: 'r', pos: Position.Right },
  { id: 'b', pos: Position.Bottom }, { id: 'l', pos: Position.Left },
]
/** 글에 맞춰 잴 때 최대 폭 */
const MAX_W = 260
const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

/** 상자 안에서 글이 놓이는 영역 (도형 안쪽) */
function textArea(data: BoxData, w: number, h: number) {
  if (isMemo(data.shape)) return { x: MEMO.pad, y: MEMO.pad, w: Math.max(16, w - MEMO.pad * 2), h: Math.max(18, h - MEMO.pad * 2) }
  const i = innerSize(data.shape, w, h)
  const iw = Math.min(w, Math.max(16, i.w)), ih = Math.min(h, Math.max(18, i.h))
  return { x: (w - iw) / 2, y: (h - ih) / 2, w: iw, h: ih }
}

export const BoxNode = memo(function BoxNode({ id, data, selected }: NodeProps<BoxNodeT>) {
  const { theme, ground } = useLook()
  const editing = useEd((s) => s.editingId === id)
  const ready = useEd((s) => s.readyId === id)
  const dropping = useEd((s) => s.dropTarget === id)
  const host = useEd((s) => s.hosts.has(id))
  const draft = useEd((s) => (s.portDraft?.id === id ? s.portDraft : null))
  const syncHandles = useUpdateNodeInternals()
  useEffect(() => syncHandles(id), [id, data.ports, syncHandles])
  // 하나만 골랐을 때만 크기 손잡이를 둔다 (고르지 않은 상자는 셀 필요도 없다)
  const solo = useEd((s) => selected && s.nodes.reduce((k, n) => k + (n.selected ? 1 : 0), 0) === 1)
  const box = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const memoKind = isMemo(data.shape)
  const fixed = data.w != null && data.h != null

  // 크기가 정해지지 않은 상자(예전 노트·붙여넣은 그림·'글에 맞추기'): 글에 맞춰 한 번 재고 그 크기로 고정
  useLayoutEffect(() => {
    if (fixed) return
    const el = area.current!
    const ro = new ResizeObserver(() => {
      // 그림이 아직 안 불러와졌으면 다 불러온 뒤에 잰다
      if (el.querySelector('.media-ph') || [...el.querySelectorAll('img')].some((i) => !i.complete)) return
      // offsetWidth·Height는 소수점을 버리므로 2px 여유를 둔다 (고정한 뒤 글이 살짝 넘치지 않게)
      const o = outerSize(data.shape, el.offsetWidth + 2, el.offsetHeight + 2)
      fixSize(id, Math.max(data.w ?? 0, Math.ceil(o.w)), Math.max(data.h ?? 0, Math.ceil(o.h)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fixed, id, data.shape, data.w, data.h])

  // 넘친 글: 상자 안에서 스크롤하고, 아래에 더 있으면 흐리게 표시
  const [over, setOver] = useState({ scroll: false, more: false })
  const checkOver = () => {
    const el = area.current
    if (!el || !fixed) return
    const scroll = el.scrollHeight > el.clientHeight + 2, more = scroll && el.scrollTop + el.clientHeight < el.scrollHeight - 2
    setOver((o) => (o.scroll === scroll && o.more === more ? o : { scroll, more }))
  }
  useLayoutEffect(() => {
    const el = area.current
    if (!el || !fixed) return
    const ro = new ResizeObserver(checkOver)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [fixed]) // eslint-disable-line react-hooks/exhaustive-deps
  // 고르지 않은 상자는 엑셀 셀처럼 늘 글 첫머리부터 보인다
  useEffect(() => {
    const el = area.current
    if (!el || selected || editing || !el.scrollTop) return
    el.scrollTop = 0
    checkOver()
  }, [selected, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const w = data.w ?? 60, h = data.h ?? 24
  const fill = data.fill ? themeMap(data.fill, theme) : SURFACE[theme]
  const stroke = data.stroke ? themeMap(data.stroke, theme) : INK[theme]
  const sw = data.strokeWidth
  const tone = toneOf(fill === 'transparent' ? ground : fill)
  const d = shapePath(data.shape, w, h)
  const empty = !data.body && !data.media.length
  const fold = Math.min(MEMO.fold, w / 3, h / 3)
  const rule = data.rule ?? null
  const valign = rule === 'lines' ? 'top' : data.valign ?? (memoKind || host ? 'top' : 'middle')
  const a = textArea(data, w, h)
  const live = editing || ready

  // 새로 만든 상자는 톡 하고 나타난다
  useEffect(() => {
    if (!born.delete(id) || !box.current || reduced()) return
    animate(box.current, { scale: [0.8, 1], opacity: [0, 1] }, { duration: 0.22, ease: [0.22, 1, 0.36, 1] })
  }, [id])
  // 다른 상자에 들어가거나 나오면 살짝 튀어 자리 잡는다
  const parent = useRef(data.parent ?? null)
  useEffect(() => {
    if (parent.current === (data.parent ?? null)) return
    parent.current = data.parent ?? null
    if (box.current && !reduced()) animate(box.current, { scale: [1.04, 1] }, { duration: 0.28, ease: [0.22, 1, 0.36, 1] })
  }, [data.parent])

  const text = (
    <div className={cls('box-text', data.head && 'head')}>
      {live ? <BoxEditor id={id} html={data.body} editing={editing} /> : empty ? (fixed ? null : <div className="box-empty" />) : <BoxView html={data.body} />}
      <MediaList id={id} media={data.media} editing={editing} />
      {!data.hidePreview && <LinkCards html={data.body} />}
    </div>
  )

  return (
    <div ref={box} className={cls('box', `tone-${tone}`, memoKind && 'memo')}
      style={{ width: w, height: h, ['--ink' as string]: readable('#1C1C1E', fill) }}>
      <svg className="box-shape" width={w} height={h}>
        {selected && <path className="box-halo" d={d} fill="none" stroke={ACCENT} strokeWidth={sw + 4} strokeLinejoin="miter" />}
        <path className="box-main" d={d} fill={fill} stroke={data.dash === 'none' ? 'none' : stroke} strokeWidth={sw}
          strokeDasharray={data.dash === 'dashed' ? '6 4' : undefined} strokeLinejoin="miter" />
        {memoKind && <path d={`M${w} ${h - fold}L${w - fold} ${h - fold}L${w - fold} ${h}Z`} fill="var(--ink)" fillOpacity={0.12} />}
        {dropping && <path className="box-drop" d={d} fill={ACCENT} fillOpacity={0.06} stroke={ACCENT} strokeWidth={2} strokeDasharray="5 4" />}
        {draft && (
          <g>
            {shapeAnchors(data.shape, w, h).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={ACCENT} opacity={0.5} />)}
            {!draft.port && <circle className="port-dot" r={draft.snapped ? 7 : 5} fill={ACCENT} stroke="#fff" strokeWidth={1.5} style={{ transform: `translate(${draft.x}px, ${draft.y}px)` }} />}
          </g>
        )}
      </svg>
      {fixed ? (
        <div ref={area} onScroll={checkOver} onClick={live && !editing ? openLink : undefined}
          className={cls('box-area', `va-${valign}`, rule && `rule-${rule}`, editing && 'editing nodrag nopan nowheel', ready && !editing && 'ready',
            over.scroll && selected && !editing && 'nowheel', over.more && 'more')}
          onContextMenu={editing ? (e) => e.stopPropagation() : undefined}
          style={{ left: a.x, top: a.y, width: a.w, height: a.h }}>
          {text}
        </div>
      ) : (
        // 재는 중: 글 크기대로 펼쳐 둔다 (정해 둔 폭이 있으면 그 폭 안에서)
        <div ref={area} className={cls('box-area auto', memoKind && 'memo')}
          style={{ ...(data.w ? { width: Math.max(24, Math.floor(innerSize(data.shape, data.w, data.h ?? 48).w)) } : data.wrap ? { width: data.wrap } : { maxWidth: MAX_W }) }}>
          {text}
        </div>
      )}
      {solo && !editing && (
        <NodeResizer minWidth={24} minHeight={24} handleClassName="rs-h" lineClassName="rs-l"
          onResizeStart={() => beginResize(id)} onResizeEnd={() => endResize(id)} />
      )}
      {/* 네 변 가운데의 점은 보이지 않는다: 예전 선과 '상자에 놓아 연결'에만 쓴다 */}
      {SIDES.map((s) => <Handle key={s.id} id={s.id} type="source" position={s.pos} className="h base" isConnectableStart={false} />)}
      {data.ports?.map((p) => (
        <Handle key={p.id} id={p.id} type="source" position={SIDES.find((s) => s.id === portSide(p.u, p.v))!.pos}
          className={`h port${draft?.port === p.id ? ` moving${draft.snapped ? ' snapped' : ''}` : ''}`}
          style={{ left: `${p.u * 100}%`, top: `${p.v * 100}%`, right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)' }} />
      ))}
    </div>
  )
})

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function openLink(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a')
  if (!a) return
  e.preventDefault()
  e.stopPropagation()
  window.open(a.href, '_blank', 'noopener')
}

/** 보기용 글: 편집기와 같은 구조(.tx > .ProseMirror)로 그려서 고를 때 글줄·높이가 바뀌지 않게 */
function BoxView({ html }: { html: string }) {
  return (
    <div className="tx rich" onClick={openLink}>
      <div className="tiptap ProseMirror" dangerouslySetInnerHTML={{ __html: sanitize(html) }} />
    </div>
  )
}

/** 커서가 상자 밖으로 나가면 상자 글만 스크롤한다 (캔버스는 그대로) */
function scrollCaret(view: EditorView) {
  const sc = view.dom.closest('.box-area') as HTMLElement | null
  if (!sc) return true
  const r = view.coordsAtPos(view.state.selection.head), b = sc.getBoundingClientRect()
  const z = b.height / (sc.offsetHeight || 1) || 1
  if (r.bottom > b.bottom) sc.scrollTop += (r.bottom - b.bottom) / z + 4
  else if (r.top < b.top) sc.scrollTop -= (b.top - r.top) / z + 4
  return true
}

/** 메뉴·창·다른 입력 칸에 있는 포커스는 빼앗지 않는다 (고르기만 한 상자) */
const mayTakeFocus = () => {
  const a = document.activeElement as HTMLElement | null
  return !a || a === document.body || !!a.closest('.react-flow')
}

/** 글자를 치면 편집을 시작하는 키 (한글 입력 중 키 포함). 스페이스는 화면 이동에 쓴다 */
const startsTyping = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229 || (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey)

/**
 * 상자 글 편집기 (한 칸). editing이 아니면 '고른 상태': 숨은 커서가 글 끝에 있어 그대로 타자를 치면 이어 쓰고,
 * 다른 키(방향키·Delete·Ctrl+C 등)는 캔버스 단축키로 넘긴다
 */
function BoxEditor({ id, html, editing }: { id: string; html: string; editing: boolean }) {
  const last = useRef(html)
  const editor = useEditor({
    extensions: richExtensions(t('입력하세요')),
    content: html,
    onUpdate: ({ editor: ed }) => {
      const h = htmlOf(ed)
      last.current = h
      patchNodes([id], { body: h }, false)
    },
    onFocus: ({ editor: ed }) => useEd.setState({ active: ed }),
    editorProps: {
      // 고른 상태에서 붙여넣기·끌어 놓기는 캔버스가 처리한다
      handlePaste: (v, e) => (useEd.getState().editingId === id ? markdownPaste(v, e) : true),
      handleDrop: () => useEd.getState().editingId !== id,
      handleScrollToSelection: scrollCaret,
      handleKeyDown: (_, e) => {
        if (useEd.getState().editingId !== id) {
          if (startsTyping(e)) { startEditing(id); return false }
          if (e.key === 'Enter' || e.key === 'F2') { startEditing(id); return true }
          // Ctrl+V는 붙여넣기 이벤트가 생기도록 그대로 둔다 (캔버스가 받는다)
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') return false
          return true
        }
        if (e.isComposing || e.keyCode === 229) return false
        if (e.key === 'Escape') { e.stopPropagation(); stopEditing(); return true }
        return false
      },
    },
  })
  // 실행 취소·서식 브러시처럼 바깥에서 글이 바뀌면 편집기에도 반영
  useEffect(() => {
    if (!editor || editor.isDestroyed || html === last.current) return
    last.current = html
    editor.commands.setContent(html || '', { emitUpdate: false })
    if (!editing && mayTakeFocus()) editor.commands.focus('end', { scrollIntoView: false })
  }, [html]) // eslint-disable-line react-hooks/exhaustive-deps
  // 고르면 숨은 커서를 글 끝에, 두 번 눌러 편집을 시작했으면 누른 자리에
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const c = editing ? takeCaret(id) : null
    const at = c && editor.view.posAtCoords({ left: c.x, top: c.y })
    if (!at && editor.isFocused) return
    editor.commands.setTextSelection(at ? at.pos : editor.state.doc.content.size)
    // 방금 그린 상자는 React Flow가 크기를 재기 전까지 숨겨져 있어 포커스를 받지 못한다. 나타날 때까지 몇 프레임 다시 시도
    let tries = 30, raf = 0
    const go = () => {
      if (editor.isDestroyed || editor.view.hasFocus()) return
      if (editing || mayTakeFocus()) editor.view.focus()
      if (!editor.view.hasFocus() && --tries > 0) raf = requestAnimationFrame(go)
    }
    go()
    return () => cancelAnimationFrame(raf)
  }, [editor, editing, id])
  return <EditorContent editor={editor} className="tx rich" />
}

function MediaList({ id, media, editing }: { id: string; media: MediaItem[]; editing: boolean }) {
  if (!media.length) return null
  const remove = (mid: string) => patchNodes([id], (d) => ({ media: d.media.filter((m) => m.id !== mid) }))
  return (
    <div className="media">
      {media.map((m) => (
        <div key={m.id} className="media-item">
          <MediaView m={m} />
          {editing && <button className="media-x nodrag" aria-label={t('삭제')} onClick={() => remove(m.id)}><X size={12} /></button>}
        </div>
      ))}
    </div>
  )
}

function MediaView({ m }: { m: MediaItem }) {
  const url = useMediaUrl(m.mediaId)
  if (!url) return <div className="media-ph" />
  return m.kind === 'video'
    ? <video className="nodrag" src={url} controls playsInline preload="metadata" />
    : <img src={url} alt="" draggable={false} />
}

function LinkCards({ html }: { html: string }) {
  const links = html ? linksIn(html).slice(0, 3) : []
  return <>{links.map((u) => (youtubeId(u) ? <YouTube key={u} id={youtubeId(u)!} /> : <LinkCard key={u} url={u} />))}</>
}

function YouTube({ id }: { id: string }) {
  const [play, setPlay] = useState(false)
  return (
    <div className="yt nodrag">
      {play
        ? <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title="YouTube" />
        : <button onClick={() => setPlay(true)} aria-label={t('재생')}><img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" /><span className="yt-play"><Play size={18} fill="currentColor" /></span></button>}
    </div>
  )
}

function LinkCard({ url }: { url: string }) {
  const meta = usePreview(url)
  if (!meta) return null
  let host = url
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* 그대로 */ }
  return (
    <a className="link-card nodrag" href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      {meta.image && <img src={meta.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <span className="lc-text">
        <span className="lc-title">{meta.title}</span>
        <span className="lc-host">{meta.logo && <img src={meta.logo} alt="" referrerPolicy="no-referrer" />}{meta.site || host}</span>
      </span>
    </a>
  )
}
