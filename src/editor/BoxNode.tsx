import { memo, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Play, X } from 'lucide-react'
import { ACCENT, INK, SURFACE, readable, themeMap, toneOf } from '../lib/color'
import { useMediaUrl, usePreview, youtubeId } from '../lib/media'
import { htmlOf, linksIn, richExtensions, sanitize } from '../lib/rich'
import { outerSize, shapePath } from '../lib/shapes'
import { useTheme } from '../lib/store'
import type { BoxData, BoxNode as BoxNodeT, MediaItem } from '../lib/types'
import { patchNodes, stopEditing, useEd } from './store'

const SIDES = [
  { id: 't', pos: Position.Top }, { id: 'r', pos: Position.Right },
  { id: 'b', pos: Position.Bottom }, { id: 'l', pos: Position.Left },
]
const MAX_W = 260

export const BoxNode = memo(function BoxNode({ id, data, selected }: NodeProps<BoxNodeT>) {
  const theme = useTheme()
  const editing = useEd((s) => s.editingId === id)
  const content = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 60, h: 20 })

  // 내용 크기를 재서 도형 크기를 정한다 (글이 늘면 상자도 커짐)
  useLayoutEffect(() => {
    const el = content.current!
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = outerSize(data.shape, size.w, size.h)
  const fill = data.fill ? themeMap(data.fill, theme) : SURFACE[theme]
  const stroke = data.stroke ? themeMap(data.stroke, theme) : INK[theme]
  const tone = toneOf(fill)
  const d = shapePath(data.shape, w, h)
  const empty = !data.title && !data.body && !data.media.length

  return (
    <div className={`box tone-${tone}`} style={{ width: w, height: h, ['--ink' as string]: readable('#1C1C1E', fill) }}>
      <svg className="box-shape" width={w} height={h}>
        {selected && <path d={d} fill="none" stroke={ACCENT} strokeOpacity={0.35} strokeWidth={data.strokeWidth + 5} strokeLinejoin="round" />}
        <path d={d} fill={fill} stroke={data.dash === 'none' ? 'none' : stroke} strokeWidth={data.strokeWidth}
          strokeDasharray={data.dash === 'dashed' ? '6 4' : undefined} strokeLinejoin="round" />
      </svg>
      <div ref={content} className={`box-content${editing ? ' nodrag nopan editing' : ''}`}
        style={data.wrap ? { width: data.wrap } : { maxWidth: MAX_W }}>
        {editing ? <BoxEditor id={id} data={data} /> : empty ? <div className="box-empty" /> : <BoxView data={data} />}
        <MediaList id={id} media={data.media} editing={editing} />
        {!data.hidePreview && <LinkCards html={data.body} />}
      </div>
      {selected && <WidthHandle id={id} data={data} contentWidth={size.w} />}
      {SIDES.map((s) => <Handle key={s.id} id={s.id} type="source" position={s.pos} className="h" />)}
    </div>
  )
})

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

/** 선택된 상자 오른쪽의 폭 조절 손잡이. 더블클릭하면 자동 폭으로 */
function WidthHandle({ id, data, contentWidth }: { id: string; data: BoxData; contentWidth: number }) {
  const zoom = useStore((s) => s.transform[2])
  const down = (e: PointerEvent) => {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const x0 = e.clientX, w0 = data.wrap ?? contentWidth
    const node = useEd.getState().nodes.find((n) => n.id === id)!
    const px0 = node.position.x
    let first = true
    const move = (ev: globalThis.PointerEvent) => {
      const dx = (ev.clientX - x0) / zoom
      const wrap = Math.max(60, Math.round(w0 + dx))
      patchNodes([id], { wrap }, first)
      first = false
      // 왼쪽 끝을 고정하기 위해 중심을 옮긴다
      useEd.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, position: { ...n.position, x: px0 + (wrap - w0) / 2 } } : n)) }))
    }
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <div className="wrap-handle nodrag" title="폭 조절 (더블클릭: 자동)" onPointerDown={down}
      onDoubleClick={(e) => { e.stopPropagation(); patchNodes([id], { wrap: null }) }} />
  )
}
