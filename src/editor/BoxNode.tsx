import { memo, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { EditorContent, useEditor } from '@tiptap/react'
import { animate } from 'motion/react'
import { Play, X } from 'lucide-react'
import { ACCENT, CANVAS, INK, SURFACE, readable, themeMap, toneOf } from '../lib/color'
import { useMediaUrl, usePreview, youtubeId } from '../lib/media'
import { htmlOf, markdownPaste, richExtensions, sanitize, linksIn } from '../lib/rich'
import { MEMO, innerSize, isMemo, outerSize, shapePath } from '../lib/shapes'
import { useTheme } from '../lib/store'
import type { BoxData, BoxNode as BoxNodeT, MediaItem } from '../lib/types'
import { commit, patchNodes, reportHead, stopEditing, useEd } from './store'

const SIDES = [
  { id: 't', pos: Position.Top }, { id: 'r', pos: Position.Right },
  { id: 'b', pos: Position.Bottom }, { id: 'l', pos: Position.Left },
]
const MAX_W = 260
/** 한 겹 더 감쌀 때마다 테두리를 이만큼 두껍게 (바깥일수록 두꺼움) */
const LEVEL_W = 1.5
const near = (a: number, b: number) => Math.abs(a - b) < 0.5
type Shown = { x: number; y: number; w: number; h: number; top: number; set: boolean }

export const BoxNode = memo(function BoxNode({ id, data, selected }: NodeProps<BoxNodeT>) {
  const theme = useTheme()
  const editing = useEd((s) => s.editingId === id)
  const frame = useEd((s) => s.frames[id])
  const dropping = useEd((s) => s.dropTarget === id)
  // 하나만 골랐을 때만 크기 손잡이를 보인다
  const solo = useEd((s) => selected && s.nodes.reduce((k, n) => k + (n.selected ? 1 : 0), 0) === 1)
  const center = useEd((s) => s.nodes.find((n) => n.id === id)?.position)
  const box = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 60, h: 20 })

  // 내용 크기를 재서 도형 크기를 정한다 (글이 늘면 상자도 커짐)
  useLayoutEffect(() => {
    const el = content.current!
    const ro = new ResizeObserver(() => {
      setSize({ w: el.offsetWidth, h: el.offsetHeight })
      reportHead(id, el.offsetWidth, el.offsetHeight)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [id])

  const memoKind = isMemo(data.shape)
  const natural = outerSize(data.shape, size.w, size.h)
  // 글 폭: 직접 정한 상자 폭 안쪽 → 예전 방식의 고정 폭 → 메모지 기본 폭 → 아니면 최대 폭까지 자동
  const textW = frame ? null
    : data.w ? Math.max(24, Math.floor(innerSize(data.shape, data.w, data.h ?? natural.h).w))
    : data.wrap ?? (memoKind ? MEMO.w - MEMO.pad * 2 : null)
  // 집합은 틀 크기, 아니면 직접 정한 크기(글이 더 많으면 그만큼 더)
  const w = frame?.w ?? Math.max(data.w ?? 0, natural.w)
  const h = frame?.h ?? Math.max(data.h ?? 0, natural.h)
  const fill = data.fill ? themeMap(data.fill, theme) : frame ? 'transparent' : SURFACE[theme]
  const stroke = data.stroke ? themeMap(data.stroke, theme) : INK[theme]
  const sw = data.strokeWidth + (frame ? frame.level * LEVEL_W : 0)
  const tone = toneOf(fill === 'transparent' ? CANVAS[theme] : fill)
  const d = shapePath(data.shape, w, h)
  const empty = !data.title && !data.body && !data.media.length
  const fold = Math.min(MEMO.fold, w / 3, h / 3)

  useFrameMotion(id, box, center, { w, h, top: frame?.top ?? 0, set: !!frame }, data.shape)
  // 집합에 들어가거나 나오면 살짝 튀어 자리 잡는다
  const parent = useRef(data.parent ?? null)
  useEffect(() => {
    if (parent.current === (data.parent ?? null)) return
    parent.current = data.parent ?? null
    if (box.current && !reduced()) animate(box.current, { scale: [1.06, 1] }, { duration: 0.32, ease: [0.22, 1, 0.36, 1] })
  }, [data.parent])

  return (
    <div ref={box} className={`box tone-${tone}${frame ? ' set' : ''}${memoKind ? ' memo' : ''}`}
      style={{ width: w, height: h, ['--ink' as string]: readable('#1C1C1E', fill === 'transparent' ? CANVAS[theme] : fill) }}
      onDoubleClick={(e) => {
        // 크기 손잡이를 두 번 누르면 자동 크기로
        if (!(e.target as Element).closest('.react-flow__resize-control')) return
        e.stopPropagation()
        patchNodes([id], { w: null, h: null, wrap: null })
      }}>
      <svg className="box-shape" width={w} height={h}>
        {selected && <path data-f d={d} fill="none" stroke={ACCENT} strokeOpacity={0.35} strokeWidth={sw + 5} strokeLinejoin="round" />}
        <path data-f className="box-main" d={d} fill={fill} stroke={data.dash === 'none' ? 'none' : stroke} strokeWidth={sw}
          strokeDasharray={data.dash === 'dashed' ? '6 4' : undefined} strokeLinejoin="round" />
        {data.shape === 'memo-lined' && (
          <g className="memo-lines" stroke="var(--ink)" strokeOpacity={0.16} strokeWidth={1}>
            {Array.from({ length: Math.max(0, Math.floor((h - MEMO.pad - 21 - 6) / MEMO.line) + 1) }, (_, k) => {
              const y = MEMO.pad + 21 + k * MEMO.line + 0.5
              return <line key={k} x1={MEMO.pad - 4} x2={w - (y > h - fold ? fold + 4 : MEMO.pad - 4)} y1={y} y2={y} />
            })}
          </g>
        )}
        {memoKind && <path d={`M${w} ${h - fold}L${w - fold} ${h - fold}L${w - fold} ${h}Z`} fill="var(--ink)" fillOpacity={0.12} />}
        {dropping && <path data-f className="box-drop" d={d} fill={ACCENT} fillOpacity={0.06} stroke={ACCENT} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />}
      </svg>
      <div ref={content} className={`box-content${editing ? ' nodrag nopan editing' : ''}`}
        onContextMenu={editing ? (e) => e.stopPropagation() : undefined}
        style={{ ...(textW ? { width: textW } : { maxWidth: MAX_W }), ...(frame && { top: frame.top }) }}>
        {editing ? <BoxEditor id={id} data={data} /> : empty ? (frame || memoKind ? null : <div className="box-empty" />) : <BoxView data={data} />}
        <MediaList id={id} media={data.media} editing={editing} />
        {!data.hidePreview && <LinkCards html={data.body} />}
      </div>
      {solo && !editing && (
        <NodeResizer minWidth={48} minHeight={frame ? 40 : Math.round(natural.h)} color={ACCENT} handleClassName="rs-h" lineClassName="rs-l"
          onResizeStart={() => { commit(); useEd.setState({ resizing: id }) }} onResizeEnd={() => useEd.setState({ resizing: null })} />
      )}
      {SIDES.map((s) => <Handle key={s.id} id={s.id} type="source" position={s.pos} className="h" />)}
    </div>
  )
})

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 틀(집합)의 크기·위치가 바뀌면 예전 자리에서 새 자리로 0.3초 동안 옮겨 그린다.
 * 상자를 끌거나 손잡이로 크기를 바꾸는 중에는 그대로 따라간다.
 */
function useFrameMotion(id: string, box: { current: HTMLDivElement | null }, center: { x: number; y: number } | undefined, cur: Omit<Shown, 'x' | 'y'>, shape: BoxData['shape']) {
  const last = useRef<Shown | null>(null)
  const stop = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    if (!center || !box.current) return
    const now: Shown = { ...cur, x: center.x, y: center.y }
    const p = last.current
    last.current = now
    if (!p || (!p.set && !now.set) || (near(p.w, now.w) && near(p.h, now.h)) || useEd.getState().resizing === id || reduced()) return
    const el = box.current
    const paths = [...el.querySelectorAll<SVGPathElement>('path[data-f]')]
    // 머리글 기준점: 집합은 위쪽 가운데, 아니면 한가운데
    const anchor = (r: Shown) => ({ x: r.x, y: r.set ? r.y - r.h / 2 + r.top : r.y })
    const a0 = anchor(p), a1 = anchor(now)
    const ox = p.x - p.w / 2 - (now.x - now.w / 2), oy = p.y - p.h / 2 - (now.y - now.h / 2)
    stop.current?.()
    const ctl = animate(0, 1, {
      duration: 0.3, ease: [0.22, 1, 0.36, 1],
      onUpdate: (t) => {
        const k = 1 - t, w = p.w + (now.w - p.w) * t, h = p.h + (now.h - p.h) * t
        el.style.setProperty('--fx', `${ox * k}px`)
        el.style.setProperty('--fy', `${oy * k}px`)
        el.style.setProperty('--cx', `${(a0.x - a1.x) * k}px`)
        el.style.setProperty('--cy', `${(a0.y - a1.y) * k}px`)
        const d = shapePath(shape, w, h)
        for (const q of paths) if (q.isConnected) q.setAttribute('d', d)
      },
      onComplete: () => {
        for (const v of ['--fx', '--fy', '--cx', '--cy']) el.style.removeProperty(v)
        const d = shapePath(shape, now.w, now.h)
        for (const q of el.querySelectorAll('path[data-f]')) q.setAttribute('d', d)
      },
    })
    stop.current = () => ctl.stop()
  })
}

function openLink(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a')
  if (!a) return
  e.preventDefault()
  e.stopPropagation()
  window.open(a.href, '_blank', 'noopener')
}

function BoxView({ data }: { data: BoxData }) {
  return (
    <div onClick={openLink}>
      {data.title && <div className="box-title rich" dangerouslySetInnerHTML={{ __html: sanitize(data.title) }} />}
      {data.body && <div className="box-body rich" dangerouslySetInnerHTML={{ __html: sanitize(data.body) }} />}
    </div>
  )
}

// 같은 상자 안의 다른 에디터(제목 ↔ 설명)로 포커스 이동. DOM에 붙은 실제 인스턴스를 쓴다
const focusSibling = (dom: Element, index: number, pos: 'start' | 'end') => {
  const el = dom.closest('.box-content')?.querySelectorAll('.ProseMirror')[index] as (Element & { editor?: Parameters<typeof htmlOf>[0] }) | undefined
  el?.editor?.commands.focus(pos)
}

function BoxEditor({ id, data }: { id: string; data: BoxData }) {
  const save = (key: 'title' | 'body') => ({ editor }: { editor: Parameters<typeof htmlOf>[0] }) =>
    patchNodes([id], { [key]: htmlOf(editor) }, false)
  const onFocus = ({ editor }: { editor: Parameters<typeof htmlOf>[0] }) => useEd.setState({ active: editor })

  const title = useEditor({
    extensions: richExtensions('제목'),
    content: data.title,
    onUpdate: save('title'),
    onFocus,
    editorProps: {
      handlePaste: markdownPaste,
      handleKeyDown: (v, e) => {
        if (e.isComposing || e.keyCode === 229) return false // 한글 조합 중 Enter는 IME에 맡김
        if (e.key === 'Enter' && !e.shiftKey) { focusSibling(v.dom, 1, 'start'); return true }
        if (e.key === 'Escape') { stopEditing(); return true }
        return false
      },
    },
  })
  const body = useEditor({
    extensions: richExtensions('설명'),
    content: data.body,
    onUpdate: save('body'),
    onFocus,
    editorProps: {
      handlePaste: markdownPaste,
      handleKeyDown: (v, e) => {
        if (e.isComposing || e.keyCode === 229) return false
        if (e.key === 'Escape') { stopEditing(); return true }
        if (e.key === 'Backspace' && v.state.doc.textContent === '' && v.state.doc.childCount === 1) { focusSibling(v.dom, 0, 'end'); return true }
        return false
      },
    },
  })
  // 마운트 직후 포커스
  useEffect(() => {
    if (!title) return
    title.commands.focus('end')
    const r = requestAnimationFrame(() => { if (!title.isDestroyed && !title.isFocused) title.commands.focus('end') })
    return () => cancelAnimationFrame(r)
  }, [title])
  return (
    <>
      <EditorContent editor={title} className="box-title rich" />
      <EditorContent editor={body} className="box-body rich" />
    </>
  )
}

function MediaList({ id, media, editing }: { id: string; media: MediaItem[]; editing: boolean }) {
  if (!media.length) return null
  const remove = (mid: string) => patchNodes([id], (d) => ({ media: d.media.filter((m) => m.id !== mid) }))
  return (
    <div className="media">
      {media.map((m) => (
        <div key={m.id} className="media-item">
          <MediaView m={m} />
          {editing && <button className="media-x nodrag" aria-label="삭제" onClick={() => remove(m.id)}><X size={12} /></button>}
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
        : <button onClick={() => setPlay(true)} aria-label="재생"><img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" /><span className="yt-play"><Play size={18} fill="currentColor" /></span></button>}
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
