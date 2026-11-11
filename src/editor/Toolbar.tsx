import { memo, useDeferredValue, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useEditorState } from '@tiptap/react'
import { useShallow } from 'zustand/react/shallow'
import {
  AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Baseline, Bold, BoxSelect,
  CornerDownRight, Copy, Film, Hand, Highlighter, ImagePlus, Italic, LayoutTemplate, Link2, List, ListChecks, ListOrdered, MoreHorizontal,
  Paintbrush, PaintBucket, Spline, Square, SquarePlus, Strikethrough, Tag, Trash2, Type, Underline, GitBranchPlus, Eye, EyeOff, Group, Ungroup,
  Palette, StickyNote, NotebookPen, Scaling, LogIn,
} from 'lucide-react'
import { HIGHLIGHTS } from '../lib/color'
import { pickFiles } from '../lib/media'
import { FONTS, SIZES, parseSize, sizeInPt } from '../lib/rich'
import { MEMOS, RELS, SHAPES, defaultBox, defaultEdge, isMemo, normalizeShape } from '../lib/shapes'
import type { BoxData, EdgeData, Rule, Shape, VAlign } from '../lib/types'
import { ColorButton, IB, Item, Menu, MenuSep, Pop, RelIcon, Sep, ShapeIcon, cls } from '../ui/kit'
import { addChild, insertFiles, insertLink } from './actions'
import { startPicking } from './CanvasMenu'
import { openDefaults } from './DefaultsDialog'
import { copySelection, fmt, groupSelection, pasteClip, patchEdges, patchNodes, pickLook, takeOut, useEd } from './store'
import { t } from '../lib/i18n'

/** 모양 바꾸기: 줄 메모지는 메모지 + 줄 서식 */
const shapePatch = (s: Shape): Partial<BoxData> => { const n = normalizeShape(s); return { shape: n.shape, ...(s === 'memo-lined' ? { rule: 'lines' } : s === 'memo' ? { rule: null } : {}) } }
const isShapeOn = (d: BoxData, s: Shape) => (s === 'memo-lined' ? d.shape === 'memo' && d.rule === 'lines' : s === 'memo' ? d.shape === 'memo' && d.rule !== 'lines' : d.shape === s)
const RULES: { id: Rule | null; label: string }[] = [
  { id: null, label: t('무늬 없음') }, { id: 'lines', label: t('줄') }, { id: 'grid', label: t('모눈') }, { id: 'dots', label: t('점') },
]
const VALIGNS: { id: VAlign; label: string; icon: React.ReactNode }[] = [
  { id: 'top', label: t('위쪽'), icon: <AlignVerticalJustifyStart size={16} /> },
  { id: 'middle', label: t('가운데 (세로)'), icon: <AlignVerticalJustifyCenter size={16} /> },
  { id: 'bottom', label: t('아래쪽'), icon: <AlignVerticalJustifyEnd size={16} /> },
]

const S = { size: 18, strokeWidth: 1.6 }

const LineIcon = ({ dashed, arrow = 'none', kind = 'straight' }: { dashed?: boolean; arrow?: EdgeData['arrow']; kind?: EdgeData['kind'] }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={kind === 'step' ? 'M3 4H9V14H15' : kind === 'bezier' ? 'M3 13C9 13 9 5 15 5' : 'M3 9H15'} strokeDasharray={dashed ? '2.5 2.5' : undefined} />
    {arrow !== 'none' && <path d={kind === 'bezier' ? 'M12 3L15 5L12.6 7.6' : 'M12 6L15 9L12 12'} transform={kind === 'step' ? 'translate(0 5)' : undefined} />}
    {arrow === 'both' && <path d="M6 6L3 9L6 12" />}
  </svg>
)

export function Toolbar() {
  const selN = useEd(useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.id)))
  const selE = useEd(useShallow((s) => s.edges.filter((e) => e.selected).map((e) => e.id)))
  // 상자를 고르면 선택 표시가 먼저 그려지고, 무거운 도구 막대는 바로 다음에 (기다리는 움직임 없이) 바뀐다
  const n = useDeferredValue(selN), e = useDeferredValue(selE)
  return <ToolbarBody selN={n} selE={e} />
}

const ToolbarBody = memo(function ToolbarBody({ selN, selE }: { selN: string[]; selE: string[] }) {
  const key = selN.length ? 'node' : selE.length ? 'edge' : 'create'
  return (
    <div className="toolbar">
      <div className="tb-inner">
        <div key={key} className="tb-group">
          {selN.length ? <NodeTools ids={selN} /> : selE.length ? <EdgeTools ids={selE} /> : <CreateTools />}
        </div>
      </div>
    </div>
  )
})

function CreateTools() {
  const { tool, shape, edgeStyle } = useEd(useShallow((s) => ({ tool: s.tool, shape: s.shape, edgeStyle: s.edgeStyle })))
  const setStyle = (p: Partial<EdgeData>) => useEd.setState((s) => ({ edgeStyle: { ...s.edgeStyle, ...p } }))
  return (
    <>
      <IB label={t('상자 그리기 (빈 곳을 끌기)')} on={tool === 'draw'} onClick={() => useEd.setState({ tool: 'draw' })}><SquarePlus {...S} /></IB>
      <IB label={t('선택 (끌어서 여러 개 고르기)')} on={tool === 'select'} onClick={() => useEd.setState({ tool: 'select' })}><BoxSelect {...S} /></IB>
      <IB label={t('화면 이동 (끌기 · 스페이스를 누른 채 끌어도 돼요)')} on={tool === 'hand'} onClick={() => useEd.setState({ tool: 'hand' })}><Hand {...S} /></IB>
      <Sep />
      {SHAPES.map((s) => (
        <IB key={s.id} label={t('{{shape}} — 끌어서 그리기 (상자 위에 그리면 그 안에)', { shape: s.label })} on={tool === 'place' && shape === s.id}
          onClick={() => useEd.setState({ tool: tool === 'place' && shape === s.id ? 'draw' : 'place', shape: s.id })}>
          <ShapeIcon shape={s.id} />
        </IB>
      ))}
      <Menu trigger={<IB label={t('메모지 — 끌어서 그리기')} on={tool === 'place' && isMemo(shape)}><StickyNote {...S} /></IB>}>
        {MEMOS.map((m) => (
          <Item key={m.id} icon={m.id === 'memo' ? <StickyNote size={16} /> : <NotebookPen size={16} />} checked={tool === 'place' && shape === m.id}
            onSelect={() => useEd.setState({ tool: 'place', shape: m.id })}>{m.label}</Item>
        ))}
      </Menu>
      <Sep />
      <Menu trigger={<IB label={t('새 연결선 모양')}><LineIcon kind={edgeStyle.kind} arrow={edgeStyle.arrow} dashed={edgeStyle.dashed} /></IB>}>
        <EdgeStyleItems d={edgeStyle} set={setStyle} />
        <MenuSep />
        <Item icon={<Palette size={16} />} onSelect={openDefaults}>{t('기본 모양 설정…')}</Item>
      </Menu>
      <Sep />
      <IB label={t('이미지')} onClick={async () => insertFiles(await pickFiles('image/*'))}><ImagePlus {...S} /></IB>
      <IB label={t('영상')} onClick={async () => insertFiles(await pickFiles('video/*'))}><Film {...S} /></IB>
      <IB label={t('링크')} onClick={() => insertLink()}><Link2 {...S} /></IB>
    </>
  )
}

function EdgeStyleItems({ d, set }: { d: EdgeData; set: (p: Partial<EdgeData>) => void }) {
  return (
    <>
      <Item icon={<LineIcon kind="bezier" />} checked={d.kind === 'bezier'} onSelect={() => set({ kind: 'bezier' })}>{t('곡선')}</Item>
      <Item icon={<LineIcon kind="straight" />} checked={d.kind === 'straight'} onSelect={() => set({ kind: 'straight' })}>{t('직선')}</Item>
      <Item icon={<LineIcon kind="step" />} checked={d.kind === 'step'} onSelect={() => set({ kind: 'step' })}>{t('꺾은선')}</Item>
      <MenuSep />
      <Item icon={<LineIcon arrow="end" />} checked={d.arrow === 'end'} onSelect={() => set({ arrow: 'end' })}>{t('화살표')}</Item>
      <Item icon={<LineIcon arrow="both" />} checked={d.arrow === 'both'} onSelect={() => set({ arrow: 'both' })}>{t('양방향 화살표')}</Item>
      <Item icon={<LineIcon />} checked={d.arrow === 'none'} onSelect={() => set({ arrow: 'none' })}>{t('선만')}</Item>
      <MenuSep />
      <Item icon={<LineIcon dashed />} checked={d.dashed} onSelect={() => set({ dashed: !d.dashed })}>{t('점선')}</Item>
    </>
  )
}

function useActiveMarks() {
  const editor = useEd((s) => (s.editingId ? s.active : null))
  return useEditorState({
    editor,
    selector: ({ editor: e }) => e && !e.isDestroyed ? {
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      size: e.getAttributes('textStyle').fontSize as string | undefined, font: e.getAttributes('textStyle').fontFamily as string | undefined,
      color: e.getAttributes('textStyle').color as string | undefined, hl: e.getAttributes('highlight').color as string | undefined,
    } : null,
  })
}

/** 글자 크기: 목록에서 고르거나 '10p'처럼 직접 입력 (단위 없으면 pt) */
function SizePicker({ current }: { current?: string }) {
  const pt = sizeInPt(current)
  const [v, setV] = useState('')
  const [bad, setBad] = useState(false)
  const apply = (css: string | null) => fmt((c) => (css ? c.setFontSize(css) : c.unsetFontSize()))
  return (
    <Pop trigger={<button type="button" className="ib size-btn" title={t('글자 크기 (pt)')} onMouseDown={(e) => e.preventDefault()}>{pt ?? 'Aa'}</button>}>
      <form className="size-pop" onSubmit={(e) => {
        e.preventDefault()
        const css = parseSize(v)
        setBad(!css)
        if (css) { apply(css); setV('') }
      }}>
        <input className={cls('field sm', bad && 'bad')} inputMode="decimal" placeholder={t('직접 입력 (예: 10p)')} value={v}
          onChange={(e) => { setV(e.target.value); setBad(false) }} />
        <div className="size-list">
          <button type="button" className={cls(!current && 'on')} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(null)}>{t('기본')}</button>
          {SIZES.map((n) => (
            <button key={n} type="button" className={cls(pt === n && 'on')} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(`${n}pt`)}>{n}</button>
          ))}
        </div>
      </form>
    </Pop>
  )
}

function NodeTools({ ids }: { ids: string[] }) {
  const rf = useReactFlow()
  const first = useEd((s) => s.nodes.find((n) => n.id === ids[0])?.data) ?? defaultBox('rect')
  const inSet = useEd((s) => s.nodes.some((n) => ids.includes(n.id) && n.data.parent && s.nodes.some((p) => p.id === n.data.parent)))
  const m = useActiveMarks()
  const hasLinks = /href=/.test(first.body)
  return (
    <>
      <Menu trigger={<IB label={t('도형')}><ShapeIcon shape={first.shape} /></IB>}>
        {SHAPES.map((s) => <Item key={s.id} icon={<ShapeIcon shape={s.id} size={16} />} checked={isShapeOn(first, s.id)} onSelect={() => patchNodes(ids, shapePatch(s.id))}>{s.label}</Item>)}
        <MenuSep />
        {MEMOS.map((m) => <Item key={m.id} icon={m.id === 'memo' ? <StickyNote size={16} /> : <NotebookPen size={16} />} checked={isShapeOn(first, m.id)} onSelect={() => patchNodes(ids, shapePatch(m.id))}>{m.label}</Item>)}
      </Menu>
      <Menu trigger={<IB label={t('서식 (제목 줄·줄·모눈)')} on={!!(first.head || first.rule)}><LayoutTemplate {...S} /></IB>}>
        <Item checked={!!first.head} onSelect={() => patchNodes(ids, { head: !first.head })}>{t('첫 줄을 제목으로 (아래 구분선)')}</Item>
        <MenuSep />
        {RULES.map((r) => <Item key={r.id ?? 'none'} checked={(first.rule ?? null) === r.id} onSelect={() => patchNodes(ids, { rule: r.id })}>{r.label}</Item>)}
      </Menu>
      <SizeBox ids={ids} />
      <ColorButton label={t('채우기')} icon={<PaintBucket {...S} />} value={first.fill} none={t('기본')} onChange={(fill) => patchNodes(ids, { fill })} />
      <ColorButton label={t('테두리 색')} icon={<Square {...S} />} value={first.stroke} none={t('기본')} onChange={(stroke) => patchNodes(ids, { stroke })} />
      <Menu trigger={<IB label={t('테두리 모양')}><LineIcon dashed={first.dash === 'dashed'} /></IB>}>
        <Item icon={<LineIcon />} checked={first.dash === 'solid'} onSelect={() => patchNodes(ids, { dash: 'solid' })}>{t('실선')}</Item>
        <Item icon={<LineIcon dashed />} checked={first.dash === 'dashed'} onSelect={() => patchNodes(ids, { dash: 'dashed' })}>{t('점선')}</Item>
        <Item checked={first.dash === 'none'} onSelect={() => patchNodes(ids, { dash: 'none' })}>{t('테두리 없음')}</Item>
        <MenuSep />
        {[1, 1.5, 2.5, 4].map((w) => <Item key={w} checked={first.strokeWidth === w} onSelect={() => patchNodes(ids, { strokeWidth: w })}>{w}px</Item>)}
      </Menu>
      <Sep />
      <Menu trigger={<IB label={t('글꼴')}><Type {...S} /></IB>}>
        {FONTS.map((f) => (
          <Item key={f.label} checked={(m?.font ?? '') === f.value} onSelect={() => fmt((c) => (f.value ? c.setFontFamily(f.value) : c.unsetFontFamily()))}>
            <span style={{ fontFamily: f.value || undefined }}>{f.label}</span>
          </Item>
        ))}
      </Menu>
      <SizePicker current={m?.size} />
      <IB label={t('굵게 (Ctrl+B)')} on={m?.bold} onClick={() => fmt((c) => c.toggleBold())}><Bold {...S} /></IB>
      <IB label={t('기울임 (Ctrl+I)')} on={m?.italic} onClick={() => fmt((c) => c.toggleItalic())}><Italic {...S} /></IB>
      <IB label={t('밑줄 (Ctrl+U)')} on={m?.underline} onClick={() => fmt((c) => c.toggleUnderline())}><Underline {...S} /></IB>
      <IB label={t('취소선')} on={m?.strike} onClick={() => fmt((c) => c.toggleStrike())}><Strikethrough {...S} /></IB>
      <ColorButton label={t('글자 색')} icon={<Baseline {...S} />} value={m?.color} none={t('자동')}
        onChange={(color) => fmt((c) => (color ? c.setColor(color) : c.unsetColor()))} />
      <ColorButton label={t('형광펜')} icon={<Highlighter {...S} />} value={m?.hl} none={t('없음')} palette={HIGHLIGHTS}
        onChange={(color) => fmt((c) => (color ? c.setHighlight({ color }) : c.unsetHighlight()))} />
      <Menu trigger={<IB label={t('정렬 (가로·세로)')}><AlignCenter {...S} /></IB>}>
        <Item icon={<AlignLeft size={16} />} onSelect={() => fmt((c) => c.setTextAlign('left'))}>{t('왼쪽')}</Item>
        <Item icon={<AlignCenter size={16} />} onSelect={() => fmt((c) => c.setTextAlign('center'))}>{t('가운데')}</Item>
        <Item icon={<AlignRight size={16} />} onSelect={() => fmt((c) => c.setTextAlign('right'))}>{t('오른쪽')}</Item>
        <MenuSep />
        {VALIGNS.map((v) => <Item key={v.id} icon={v.icon} checked={first.valign === v.id} onSelect={() => patchNodes(ids, { valign: v.id })}>{v.label}</Item>)}
      </Menu>
      <Menu trigger={<IB label={t('목록')}><List {...S} /></IB>}>
        <Item icon={<List size={16} />} onSelect={() => fmt((c) => c.toggleBulletList())}>{t('글머리 기호')}</Item>
        <Item icon={<ListOrdered size={16} />} onSelect={() => fmt((c) => c.toggleOrderedList())}>{t('번호 매기기')}</Item>
        <Item icon={<ListChecks size={16} />} onSelect={() => fmt((c) => c.toggleTaskList())}>{t('체크리스트')}</Item>
      </Menu>
      <Painter />
      <Sep />
      <IB label={t('이미지 넣기')} onClick={async () => insertFiles(await pickFiles('image/*'))}><ImagePlus {...S} /></IB>
      <IB label={t('링크 넣기')} onClick={() => insertLink()}><Link2 {...S} /></IB>
      <Menu align="end" trigger={<IB label={t('더보기')}><MoreHorizontal {...S} /></IB>}>
        <Item icon={<GitBranchPlus size={16} />} onSelect={addChild}>{t('연결된 상자 추가 (Tab)')}</Item>
        <Item icon={<Group size={16} />} onSelect={groupSelection}>{t('집합으로 묶기 (Ctrl+G)')}</Item>
        <Item icon={<LogIn size={16} />} onSelect={() => startPicking(ids)}>{t('다른 상자에 넣기…')}</Item>
        {inSet && <Item icon={<Ungroup size={16} />} onSelect={() => takeOut(ids)}>{t('집합에서 꺼내기')}</Item>}
        <Item icon={<Copy size={16} />} onSelect={() => { copySelection(); pasteClip() }}>{t('복제 (Ctrl+D)')}</Item>
        <Item icon={<Scaling size={16} />} onSelect={() => patchNodes(ids, { w: null, h: null, wrap: null })}>{t('크기를 글에 맞추기')}</Item>
        <Item icon={<Film size={16} />} onSelect={async () => insertFiles(await pickFiles('video/*'))}>{t('영상 넣기')}</Item>
        {hasLinks && (
          <Item icon={first.hidePreview ? <Eye size={16} /> : <EyeOff size={16} />} onSelect={() => patchNodes(ids, { hidePreview: !first.hidePreview })}>
            {first.hidePreview ? t('링크 미리보기 보기') : t('링크 미리보기 숨기기')}
          </Item>
        )}
      </Menu>
      <IB label={t('삭제')} onClick={() => rf.deleteElements({ nodes: ids.map((id) => ({ id })) })}><Trash2 {...S} /></IB>
    </>
  )
}

/** 서식 브러시 (Word처럼): 한 번 누르면 다음 상자 하나에, 두 번 누르면 Esc까지 여러 상자에 */
function Painter() {
  const on = useEd((s) => !!s.painter)
  return (
    <IB label={t('서식 복사 (두 번 누르면 계속)')} on={on}
      onClick={() => (on ? useEd.setState({ painter: null }) : pickLook(false))} onDoubleClick={() => pickLook(true)}>
      <Paintbrush {...S} />
    </IB>
  )
}

/** 상자 크기를 숫자로 (글이 넘치면 상자 안에서 스크롤) */
function SizeBox({ ids }: { ids: string[] }) {
  const n = useEd((s) => s.nodes.find((x) => x.id === ids[0]))
  const [w, setW] = useState(''), [h, setH] = useState('')
  const num = (v: string) => { const m = v.trim().match(/^(\d+(?:\.\d+)?)\s*(px)?$/i); return m ? Math.min(4000, Math.max(24, Math.round(+m[1]))) : undefined }
  const cur = () => { setW(n?.data.w ? String(Math.round(n.data.w)) : ''); setH(n?.data.h ? String(Math.round(n.data.h)) : '') }
  return (
    <Pop trigger={<IB label={t('상자 크기')} onClick={cur}><Scaling {...S} /></IB>}>
      <form className="size-box" onSubmit={(e) => {
        e.preventDefault()
        const nw = num(w), nh = num(h)
        if (nw || nh) patchNodes(ids, { ...(nw && { w: nw }), ...(nh && { h: nh }), wrap: null })
      }}>
        <label>{t('폭')}<input className="field sm" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} /></label>
        <label>{t('높이')}<input className="field sm" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} /></label>
        <div className="size-box-row">
          <button type="button" className="btn" onClick={() => patchNodes(ids, { w: null, h: null, wrap: null })}>{t('글에 맞추기')}</button>
          <button type="submit" className="btn primary">{t('적용')}</button>
        </div>
        <p className="set-help">{t('선택한 상자의 모서리나 변을 끌어도 돼요. 넘치는 글은 상자 안에서 스크롤돼요.')}</p>
      </form>
    </Pop>
  )
}

function EdgeTools({ ids }: { ids: string[] }) {
  const rf = useReactFlow()
  const d = { ...defaultEdge(), ...useEd((s) => s.edges.find((e) => e.id === ids[0])?.data) }
  const set = (p: Partial<EdgeData>) => patchEdges(ids, p)
  return (
    <>
      <IB label={t('곡선')} on={d.kind === 'bezier'} onClick={() => set({ kind: 'bezier' })}><Spline {...S} /></IB>
      <IB label={t('직선')} on={d.kind === 'straight'} onClick={() => set({ kind: 'straight' })}><LineIcon /></IB>
      <IB label={t('꺾은선')} on={d.kind === 'step'} onClick={() => set({ kind: 'step' })}><CornerDownRight {...S} /></IB>
      <Sep />
      <IB label={t('화살표')} on={d.arrow === 'end'} onClick={() => set({ arrow: 'end' })}><LineIcon arrow="end" /></IB>
      <IB label={t('양방향')} on={d.arrow === 'both'} onClick={() => set({ arrow: 'both' })}><LineIcon arrow="both" /></IB>
      <IB label={t('선만')} on={d.arrow === 'none'} onClick={() => set({ arrow: 'none' })}><LineIcon /></IB>
      <IB label={t('점선')} on={d.dashed} onClick={() => set({ dashed: !d.dashed })}><LineIcon dashed /></IB>
      <Menu trigger={<IB label={t('관계 기호 (=, ≠, ≈)')} on={!!d.rel} className="rel-btn"><RelIcon rel={d.rel ?? '='} size={18} width={1.6} /></IB>}>
        <Item checked={!d.rel} onSelect={() => set({ rel: null })}>{t('기호 없음')}</Item>
        {RELS.map((r) => <Item key={r.id} icon={<RelIcon rel={r.id} size={16} />} checked={d.rel === r.id} onSelect={() => set({ rel: r.id })}>{r.id} {r.label}</Item>)}
      </Menu>
      <Sep />
      <ColorButton label={t('선 색')} icon={<Spline {...S} />} value={d.color} none={t('기본')} onChange={(color) => set({ color })} />
      <Menu trigger={<button type="button" className="ib size-btn" title={t('두께')}>{d.width}</button>}>
        {[1, 1.5, 2.5, 4].map((w) => <Item key={w} checked={d.width === w} onSelect={() => set({ width: w })}>{w}px</Item>)}
      </Menu>
      <IB label={t('라벨 (더블클릭)')} onClick={() => useEd.setState({ editingEdge: ids[0] })}><Tag {...S} /></IB>
      <IB label={t('삭제')} onClick={() => rf.deleteElements({ edges: ids.map((id) => ({ id })) })}><Trash2 {...S} /></IB>
    </>
  )
}
