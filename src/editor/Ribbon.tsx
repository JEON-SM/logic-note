import { memo, useDeferredValue, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { useEditorState } from '@tiptap/react'
import { useShallow } from 'zustand/react/shallow'
import {
  AArrowDown, AArrowUp, AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignLeft, AlignRight, AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, Baseline, Bold, BoxSelect, BringToFront, ChevronDown,
  ChevronUp, ClipboardPaste, Columns2, Copy, CopyPlus, Files, Film, Frame, GitBranchPlus, Group as GroupIcon, Hand, Heading, Highlighter, ImagePlus, Import,
  Infinity as InfinityIcon, Italic, LayoutTemplate, Link2, List, ListChecks, ListOrdered, ListTodo, LogIn, Magnet, Maximize, Maximize2, Moon, NotebookPen,
  PaintBucket, Paintbrush, Palette, PanelTop, RectangleHorizontal, RectangleVertical, RemoveFormatting, Scaling, Scissors, SendToBack, Square, SquarePlus,
  StickyNote, StretchHorizontal, StretchVertical, Strikethrough, Sun, Tag, Trash2, Type, Underline, Ungroup, ZoomIn, ZoomOut,
} from 'lucide-react'
import { GROUNDS, HIGHLIGHTS, INK, SURFACE, groundLook, readable, themeMap } from '../lib/color'
import { pickFiles } from '../lib/media'
import { FONTS, SIZES, readTextLook, sizeInPt, type Fmt } from '../lib/rich'
import { MEMOS, RELS, SHAPES, defaultBox, defaultEdge, isMemo } from '../lib/shapes'
import { setSettings, useSettings, useTheme } from '../lib/store'
import type { BoxData, EdgeData, Shape } from '../lib/types'
import { ColorButton, ColorPanel, IB, Item, Menu, MenuSep, Pop, RelIcon, ShapeIcon, cls } from '../ui/kit'
import { BGS } from '../ui/Settings'
import { toast } from '../ui/Toast'
import { addChild, addPreset, insertFiles, insertLink, openImportHere } from './actions'
import { startPicking } from './CanvasMenu'
import { openDefaults } from './DefaultsDialog'
import { openPages } from './Pages'
import { usePageNav } from './pageNav'
import {
  CLIP_MARK, alignBoxes, copySelection, cutSelection, distributeBoxes, fmt, groupSelection, matchSize, paperKind, pasteClip, patchEdges, patchNodes,
  pickLook, reorder, selectOnly, setPageSide, setPaper, takeOut, useEd, useLook, type AlignKind, type PaperKind,
} from './store'
import { LineIcon, RULES, S, SizePicker, ToolbarBody, VALIGNS, isShapeOn, shapePatch, useActiveMarks } from './Toolbar'
import { t } from '../lib/i18n'

/** 리본 탭. '빠른 도구'는 예전 도구 막대 그대로 (고른 것에 따라 바뀌는 한 줄) */
const TABS = [
  { id: 'quick', label: t('빠른 도구') }, { id: 'home', label: t('홈') }, { id: 'insert', label: t('삽입') }, { id: 'box', label: t('상자', { context: 'tab' }) },
  { id: 'lines', label: t('선', { context: 'tab' }) }, { id: 'arrange', label: t('배치') }, { id: 'view', label: t('보기') },
]
const BI = { size: 20, strokeWidth: 1.5 }
const SI = { size: 15, strokeWidth: 1.7 }

/** 편집기 위의 리본 (엑셀처럼 탭을 고르면 그 탭의 묶음들이 펼쳐진다) */
export function Ribbon() {
  const saved = useSettings((s) => s.ribbonTab), min = useSettings((s) => !!s.ribbonMin)
  const tab = TABS.some((x) => x.id === saved) ? saved : 'quick'
  const selN = useEd(useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.id)))
  const selE = useEd(useShallow((s) => s.edges.filter((e) => e.selected).map((e) => e.id)))
  // 선택 표시가 먼저 그려지고 리본은 바로 다음에 바뀐다
  const n = useDeferredValue(selN), e = useDeferredValue(selE)
  // Ctrl+F1: 리본 접기·펼치기 (엑셀처럼)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'F1' || !(ev.ctrlKey || ev.metaKey)) return
      ev.preventDefault()
      setSettings({ ribbonMin: !useSettings.getState().ribbonMin })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className={cls('ribbon', min && 'min')}>
      <div className="rb-tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={cls('rb-tab', tab === x.id && !min && 'on')}
            onMouseDown={(ev) => ev.preventDefault()} onClick={() => setSettings({ ribbonTab: x.id, ribbonMin: false })}>{x.label}</button>
        ))}
        <span className="rb-gap" />
        <IB label={min ? t('리본 펼치기 (Ctrl+F1)') : t('리본 접기 (Ctrl+F1)')} onClick={() => setSettings({ ribbonMin: !min })}>
          {min ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </IB>
      </div>
      {!min && (tab === 'quick' ? <ToolbarBody selN={n} selE={e} /> : <RibbonBody tab={tab} selN={n} selE={e} />)}
    </div>
  )
}

const RibbonBody = memo(function RibbonBody({ tab, selN, selE }: { tab: string; selN: string[]; selE: string[] }) {
  return (
    <div className="rb-body">
      <div key={tab} className="rb-inner">
        {tab === 'home' ? <HomeTab ids={selN} /> : tab === 'insert' ? <InsertTab ids={selN} /> : tab === 'box' ? <BoxTab ids={selN} />
          : tab === 'lines' ? <LinesTab ids={selE} /> : tab === 'arrange' ? <ArrangeTab ids={selN} /> : <ViewTab />}
      </div>
    </div>
  )
})

// ── 단추와 묶음 ──
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; label: string; on?: boolean; tip?: string; drop?: boolean }
/** 큰 단추: 아이콘 아래 이름 */
const Big = ({ icon, label, on, tip, drop, className, ...p }: BtnProps) => (
  <button type="button" className={cls('rb-big', on && 'on', className)} title={tip ?? label} aria-label={tip ?? label} aria-pressed={on}
    onMouseDown={(e) => e.preventDefault()} {...p}>
    <span className="rb-ico">{icon}</span>
    <span className="rb-txt">{label}{drop && <ChevronDown size={10} strokeWidth={2} />}</span>
  </button>
)
/** 작은 단추: 아이콘 옆 이름 (두세 줄로 쌓는다) */
const Small = ({ icon, label, on, tip, drop, className, ...p }: BtnProps) => (
  <button type="button" className={cls('rb-sm', on && 'on', className)} title={tip ?? label} aria-label={tip ?? label} aria-pressed={on}
    onMouseDown={(e) => e.preventDefault()} {...p}>
    {icon && <span className="rb-ico">{icon}</span>}
    <span className="rb-txt">{label}</span>
    {drop && <ChevronDown size={10} strokeWidth={2} />}
  </button>
)
const Col = ({ children }: { children: ReactNode }) => <div className="rb-col">{children}</div>
const Row = ({ children }: { children: ReactNode }) => <div className="rb-row">{children}</div>
/** 묶음: 위에 단추, 아래에 이름. off면 안의 단추를 모두 끈다 */
const Grp = ({ label, off, children }: { label: string; off?: boolean; children: ReactNode }) => (
  <fieldset className="rb-group" disabled={off} aria-label={label}>
    <div className="rb-cmds">{children}</div>
    <div className="rb-label">{label}</div>
  </fieldset>
)

// ── 홈: 클립보드 · 글꼴 · 단락 · 스타일 · 편집 ──
const BLOCKS: { id: string; label: string; cls: string; run: Fmt }[] = [
  { id: 'p', label: t('본문'), cls: 'st-p', run: (c) => c.setParagraph() },
  { id: 'h1', label: t('제목 1'), cls: 'st-h1', run: (c) => c.setHeading({ level: 1 }) },
  { id: 'h2', label: t('제목 2'), cls: 'st-h2', run: (c) => c.setHeading({ level: 2 }) },
  { id: 'h3', label: t('제목 3'), cls: 'st-h3', run: (c) => c.setHeading({ level: 3 }) },
  { id: 'quote', label: t('인용'), cls: 'st-quote', run: (c) => c.toggleBlockquote() },
  { id: 'code', label: t('코드'), cls: 'st-code', run: (c) => c.toggleCodeBlock() },
]
/** 편집 중인 글줄의 스타일 */
function useBlock() {
  const editor = useEd((s) => (s.editingId ? s.active : null))
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e || e.isDestroyed) return null
      if (e.isActive('codeBlock')) return 'code'
      if (e.isActive('blockquote')) return 'quote'
      for (const l of [1, 2, 3]) if (e.isActive('heading', { level: l })) return `h${l}`
      return 'p'
    },
  })
}

function HomeTab({ ids }: { ids: string[] }) {
  const rf = useReactFlow()
  const none = !ids.length
  const m = useActiveMarks()
  const block = useBlock()
  const first = useEd((s) => s.nodes.find((n) => n.id === ids[0])?.data)
  const anySel = useEd((s) => s.nodes.some((n) => n.selected) || s.edges.some((x) => x.selected))
  /** 글자 크게·작게: 다음 크기 단계로 */
  const step = (dir: 1 | -1) => {
    const cur = sizeInPt(m ? m.size : first ? readTextLook(first.body).size : null) ?? 10.5
    const next = dir > 0 ? SIZES.find((s) => s > cur + 0.01) : [...SIZES].reverse().find((s) => s < cur - 0.01)
    if (next) fmt((c) => c.setFontSize(`${next}pt`))
  }
  const toClip = () => navigator.clipboard?.writeText(CLIP_MARK).catch(() => {})
  const remove = () => {
    const s = useEd.getState()
    rf.deleteElements({ nodes: s.nodes.filter((n) => n.selected).map((n) => ({ id: n.id })), edges: s.edges.filter((x) => x.selected).map((x) => ({ id: x.id })) })
  }
  return (
    <>
      <Grp label={t('클립보드')}>
        <Big icon={<ClipboardPaste {...BI} />} label={t('붙여넣기')} tip={t('붙여넣기 (Ctrl+V)')} onClick={() => pasteClip()} />
        <Col>
          <Small icon={<Scissors {...SI} />} label={t('잘라내기')} tip={t('잘라내기 (Ctrl+X)')} disabled={none} onClick={() => { if (cutSelection()) toClip() }} />
          <Small icon={<Copy {...SI} />} label={t('복사')} tip={t('복사 (Ctrl+C)')} disabled={none}
            onClick={() => { if (copySelection()) { toClip(); toast(t('{{count}}개 복사했어요', { count: ids.length })) } }} />
          <Small icon={<CopyPlus {...SI} />} label={t('복제')} tip={t('복제 (Ctrl+D)')} disabled={none} onClick={() => { if (copySelection()) pasteClip() }} />
        </Col>
        <PainterBig disabled={none} />
      </Grp>
      <Grp label={t('글꼴')} off={none}>
        <Col>
          <Row>
            <Menu trigger={
              <button type="button" className="rb-field" title={t('글꼴')} onMouseDown={(e) => e.preventDefault()}>
                <span style={{ fontFamily: m?.font || undefined }}>{FONTS.find((f) => f.value === (m?.font ?? ''))?.label ?? FONTS[0].label}</span>
                <ChevronDown size={11} />
              </button>
            }>
              {FONTS.map((f) => (
                <Item key={f.label} checked={(m?.font ?? '') === f.value} onSelect={() => fmt((c) => (f.value ? c.setFontFamily(f.value) : c.unsetFontFamily()))}>
                  <span style={{ fontFamily: f.value || undefined }}>{f.label}</span>
                </Item>
              ))}
            </Menu>
            <SizePicker current={m?.size} />
            <IB label={t('글자 크게')} onClick={() => step(1)}><AArrowUp {...SI} /></IB>
            <IB label={t('글자 작게')} onClick={() => step(-1)}><AArrowDown {...SI} /></IB>
          </Row>
          <Row>
            <IB label={t('굵게 (Ctrl+B)')} on={m?.bold} onClick={() => fmt((c) => c.toggleBold())}><Bold {...SI} /></IB>
            <IB label={t('기울임 (Ctrl+I)')} on={m?.italic} onClick={() => fmt((c) => c.toggleItalic())}><Italic {...SI} /></IB>
            <IB label={t('밑줄 (Ctrl+U)')} on={m?.underline} onClick={() => fmt((c) => c.toggleUnderline())}><Underline {...SI} /></IB>
            <IB label={t('취소선')} on={m?.strike} onClick={() => fmt((c) => c.toggleStrike())}><Strikethrough {...SI} /></IB>
            <ColorButton label={t('글자 색')} icon={<Baseline {...SI} />} value={m?.color} none={t('자동')}
              onChange={(color) => fmt((c) => (color ? c.setColor(color) : c.unsetColor()))} />
            <ColorButton label={t('형광펜')} icon={<Highlighter {...SI} />} value={m?.hl} none={t('없음')} palette={HIGHLIGHTS}
              onChange={(color) => fmt((c) => (color ? c.setHighlight({ color }) : c.unsetHighlight()))} />
            <IB label={t('서식 지우기')} onClick={() => fmt((c) => c.unsetAllMarks())}><RemoveFormatting {...SI} /></IB>
          </Row>
        </Col>
      </Grp>
      <Grp label={t('단락')} off={none}>
        <Col>
          <Row>
            <IB label={t('왼쪽 맞춤')} onClick={() => fmt((c) => c.setTextAlign('left'))}><AlignLeft {...SI} /></IB>
            <IB label={t('가운데 맞춤')} onClick={() => fmt((c) => c.setTextAlign('center'))}><AlignCenter {...SI} /></IB>
            <IB label={t('오른쪽 맞춤')} onClick={() => fmt((c) => c.setTextAlign('right'))}><AlignRight {...SI} /></IB>
            <span className="rb-vsep" />
            {VALIGNS.map((v) => <IB key={v.id} label={v.label} on={!!first && valignOf(first) === v.id} onClick={() => patchNodes(ids, { valign: v.id })}>{v.icon}</IB>)}
          </Row>
          <Row>
            <IB label={t('글머리 기호')} onClick={() => fmt((c) => c.toggleBulletList())}><List {...SI} /></IB>
            <IB label={t('번호 매기기')} onClick={() => fmt((c) => c.toggleOrderedList())}><ListOrdered {...SI} /></IB>
            <IB label={t('체크리스트')} onClick={() => fmt((c) => c.toggleTaskList())}><ListChecks {...SI} /></IB>
          </Row>
        </Col>
      </Grp>
      <Grp label={t('스타일')} off={none}>
        <div className="rb-gallery">
          {BLOCKS.map((b) => (
            <button key={b.id} type="button" className={cls('rb-style', b.cls, block === b.id && 'on')} title={b.label}
              onMouseDown={(e) => e.preventDefault()} onClick={() => fmt(b.run)}>{b.label}</button>
          ))}
        </div>
      </Grp>
      <Grp label={t('편집')}>
        <Col>
          <Small icon={<BoxSelect {...SI} />} label={t('모두 선택')} tip={t('모두 선택 (Ctrl+A)')} onClick={() => selectOnly(useEd.getState().nodes.map((n) => n.id))} />
          <Small icon={<Trash2 {...SI} />} label={t('삭제')} tip={t('삭제 (Delete)')} disabled={!anySel} onClick={remove} />
        </Col>
      </Grp>
    </>
  )
}

/** 상자 글이 실제로 놓이는 세로 자리 (BoxNode와 같은 규칙) */
const valignOf = (d: BoxData) => (d.rule === 'lines' ? 'top' : d.valign ?? (isMemo(d.shape) ? 'top' : 'middle'))

/** 서식 복사 (Word처럼: 한 번 누르면 다음 상자 하나에, 두 번 누르면 Esc까지 계속) */
function PainterBig({ disabled }: { disabled: boolean }) {
  const on = useEd((s) => !!s.painter)
  return (
    <Big icon={<Paintbrush {...BI} />} label={t('서식 복사')} tip={t('서식 복사 (두 번 누르면 계속)')} on={on} disabled={disabled && !on}
      onClick={() => (on ? useEd.setState({ painter: null }) : pickLook(false))} onDoubleClick={() => pickLook(true)} />
  )
}

// ── 삽입: 도형 · 바로 넣기 · 미디어 · 연결 · 가져오기 ──
const TASK = '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p style="text-align: left"></p></li></ul>'
const PRESETS: { id: string; label: string; tip: string; icon: ReactNode; shape: Shape; patch: Partial<BoxData> }[] = [
  { id: 'title', label: t('제목 상자'), tip: t('첫 줄이 제목인 상자 (아래 구분선)'), icon: <Heading {...BI} />, shape: 'rect', patch: { head: true, w: 192, h: 96, valign: 'top' } },
  { id: 'text', label: t('글 상자'), tip: t('테두리 없는 글 상자'), icon: <Type {...BI} />, shape: 'rect', patch: { dash: 'none', w: 192, h: 48 } },
  { id: 'todo', label: t('체크리스트'), tip: t('체크리스트 상자'), icon: <ListTodo {...BI} />, shape: 'rect', patch: { w: 192, h: 120, valign: 'top', body: TASK } },
  { id: 'frame', label: t('묶음 상자'), tip: t('다른 상자를 담는 큰 상자 (위에 이름)'), icon: <Frame {...BI} />, shape: 'rect', patch: { w: 384, h: 264, valign: 'top', head: true } },
  { id: 'memo', label: t('메모지'), tip: t('메모지'), icon: <StickyNote {...BI} />, shape: 'memo', patch: {} },
  { id: 'lined', label: t('줄 메모지'), tip: t('줄 메모지'), icon: <NotebookPen {...BI} />, shape: 'memo-lined', patch: {} },
]

function InsertTab({ ids }: { ids: string[] }) {
  const { tool, shape } = useEd(useShallow((s) => ({ tool: s.tool, shape: s.shape })))
  const place = (id: Shape) => useEd.setState({ tool: tool === 'place' && shape === id ? 'draw' : 'place', shape: id })
  return (
    <>
      <Grp label={t('도형 (누른 뒤 끌어서 그리기)')}>
        {SHAPES.map((s) => (
          <Big key={s.id} icon={<ShapeIcon shape={s.id} size={24} />} label={s.label} on={tool === 'place' && shape === s.id}
            tip={t('{{shape}} — 끌어서 그리기 (상자 위에 그리면 그 안에)', { shape: s.label })} onClick={() => place(s.id)} />
        ))}
      </Grp>
      <Grp label={t('바로 넣기')}>
        {PRESETS.map((p) => <Big key={p.id} icon={p.icon} label={p.label} tip={p.tip} onClick={() => addPreset(p.shape, p.patch)} />)}
      </Grp>
      <Grp label={t('미디어')}>
        <Big icon={<ImagePlus {...BI} />} label={t('이미지')} onClick={async () => insertFiles(await pickFiles('image/*'))} />
        <Big icon={<Film {...BI} />} label={t('영상')} onClick={async () => insertFiles(await pickFiles('video/*'))} />
        <Big icon={<Link2 {...BI} />} label={t('링크')} onClick={() => insertLink()} />
      </Grp>
      <Grp label={t('연결')}>
        <Big icon={<GitBranchPlus {...BI} />} label={t('이어지는 상자')} tip={t('연결된 상자 추가 (Tab)')} disabled={ids.length !== 1} onClick={addChild} />
        <Big icon={<GroupIcon {...BI} />} label={t('묶기')} tip={t('집합으로 묶기 (Ctrl+G)')} disabled={!ids.length} onClick={groupSelection} />
      </Grp>
      <Grp label={t('가져오기')}>
        <Big icon={<Import {...BI} />} label={t('AI 도식')} tip={t('AI 도식 가져오기')} onClick={() => openImportHere()} />
      </Grp>
    </>
  )
}

// ── 상자: 도형 · 상자 스타일 · 채우기·테두리 · 크기 · 글 배치 ──
const STYLES: { id: string; label: string; fill: string | null; stroke: string | null; dash?: BoxData['dash'] }[] = [
  { id: 'plain', label: t('기본'), fill: null, stroke: null },
  { id: 'orange', label: t('주황', { context: 'style' }), fill: '#FFE8D7', stroke: '#F76B15' },
  { id: 'yellow', label: t('노랑', { context: 'style' }), fill: '#FFF4C2', stroke: '#FFC53D' },
  { id: 'green', label: t('초록', { context: 'style' }), fill: '#DDF3E4', stroke: '#30A46C' },
  { id: 'teal', label: t('청록', { context: 'style' }), fill: '#D5F2EE', stroke: '#12A594' },
  { id: 'blue', label: t('파랑', { context: 'style' }), fill: '#DCEEFF', stroke: '#0090FF' },
  { id: 'purple', label: t('보라', { context: 'style' }), fill: '#EDE2F7', stroke: '#8E4EC6' },
  { id: 'red', label: t('빨강', { context: 'style' }), fill: '#FDE2E1', stroke: '#E5484D' },
  { id: 'gray', label: t('회색', { context: 'style' }), fill: '#F2F2F7', stroke: '#6E6E73' },
  { id: 'dark', label: t('진하게'), fill: '#1C1C1E', stroke: '#1C1C1E' },
  { id: 'strong', label: t('강조'), fill: '#F76B15', stroke: '#F76B15' },
  { id: 'dashed', label: t('점선 테두리'), fill: null, stroke: null, dash: 'dashed' },
]

function BoxTab({ ids }: { ids: string[] }) {
  const none = !ids.length
  const first = useEd((s) => s.nodes.find((n) => n.id === ids[0])?.data) ?? defaultBox('rect')
  const theme = useLook().theme
  return (
    <>
      <Grp label={t('도형')} off={none}>
        <Menu trigger={<Big icon={<ShapeIcon shape={first.shape} size={24} />} label={t('모양 바꾸기')} drop />}>
          {SHAPES.map((s) => <Item key={s.id} icon={<ShapeIcon shape={s.id} size={16} />} checked={isShapeOn(first, s.id)} onSelect={() => patchNodes(ids, shapePatch(s.id))}>{s.label}</Item>)}
          <MenuSep />
          {MEMOS.map((x) => <Item key={x.id} icon={x.id === 'memo' ? <StickyNote size={16} /> : <NotebookPen size={16} />} checked={isShapeOn(first, x.id)} onSelect={() => patchNodes(ids, shapePatch(x.id))}>{x.label}</Item>)}
        </Menu>
      </Grp>
      <Grp label={t('상자 스타일')} off={none}>
        <div className="rb-swatches">
          {STYLES.map((s) => {
            const bg = s.fill ? themeMap(s.fill, theme) : SURFACE[theme]
            return (
              <button key={s.id} type="button" className="rb-swatch" title={s.label} aria-label={s.label} onMouseDown={(e) => e.preventDefault()}
                onClick={() => patchNodes(ids, { fill: s.fill, stroke: s.stroke, dash: s.dash ?? 'solid' })}
                style={{ background: bg, borderColor: s.stroke ? themeMap(s.stroke, theme) : INK[theme], borderStyle: s.dash === 'dashed' ? 'dashed' : 'solid', color: readable('#1C1C1E', bg) }}>
                Aa
              </button>
            )
          })}
        </div>
      </Grp>
      <Grp label={t('채우기·테두리')} off={none}>
        <ColorButton label={t('채우기')} icon={<PaintBucket {...S} />} value={first.fill} none={t('기본')} onChange={(fill) => patchNodes(ids, { fill })} />
        <ColorButton label={t('테두리 색')} icon={<Square {...S} />} value={first.stroke} none={t('기본')} onChange={(stroke) => patchNodes(ids, { stroke })} />
        <Menu trigger={<IB label={t('테두리 모양')}><LineIcon dashed={first.dash === 'dashed'} /></IB>}>
          <Item icon={<LineIcon />} checked={first.dash === 'solid'} onSelect={() => patchNodes(ids, { dash: 'solid' })}>{t('실선')}</Item>
          <Item icon={<LineIcon dashed />} checked={first.dash === 'dashed'} onSelect={() => patchNodes(ids, { dash: 'dashed' })}>{t('점선')}</Item>
          <Item checked={first.dash === 'none'} onSelect={() => patchNodes(ids, { dash: 'none' })}>{t('테두리 없음')}</Item>
          <MenuSep />
          {[1, 1.5, 2.5, 4].map((w) => <Item key={w} checked={first.strokeWidth === w} onSelect={() => patchNodes(ids, { strokeWidth: w })}>{w}px</Item>)}
        </Menu>
      </Grp>
      <Grp label={t('크기')} off={none}>
        <Col>
          <NumField label={t('폭')} value={first.w} onCommit={(w) => patchNodes(ids, { w, wrap: null })} />
          <NumField label={t('높이')} value={first.h} onCommit={(h) => patchNodes(ids, { h, wrap: null })} />
          <Small icon={<Scaling {...SI} />} label={t('글에 맞추기')} tip={t('크기를 글에 맞추기')} onClick={() => patchNodes(ids, { w: null, h: null, wrap: null })} />
        </Col>
      </Grp>
      <Grp label={t('글 배치')} off={none}>
        <Col>
          <Row>{VALIGNS.map((v) => <IB key={v.id} label={v.label} on={valignOf(first) === v.id} onClick={() => patchNodes(ids, { valign: v.id })}>{v.icon}</IB>)}</Row>
          <Row>
            <IB label={t('첫 줄을 제목으로 (아래 구분선)')} on={!!first.head} onClick={() => patchNodes(ids, { head: !first.head })}><PanelTop {...SI} /></IB>
            <Menu trigger={<IB label={t('무늬 (줄·모눈·점)')} on={!!first.rule}><LayoutTemplate {...SI} /></IB>}>
              {RULES.map((r) => <Item key={r.id ?? 'none'} checked={(first.rule ?? null) === r.id} onSelect={() => patchNodes(ids, { rule: r.id })}>{r.label}</Item>)}
            </Menu>
          </Row>
        </Col>
      </Grp>
    </>
  )
}

/** 숫자 칸 (엑셀 리본의 크기 칸처럼): Enter나 다른 곳을 누르면 적용, Esc는 취소 */
function NumField({ label, value, onCommit }: { label: string; value: number | null | undefined; onCommit: (v: number) => void }) {
  const [v, setV] = useState<string | null>(null)
  const cancel = useRef(false)
  const apply = () => {
    const typed = v
    setV(null)
    if (cancel.current || typed == null) { cancel.current = false; return }
    const m = typed.trim().match(/^(\d+(?:\.\d+)?)\s*(px)?$/i)
    if (m) onCommit(Math.min(4000, Math.max(24, Math.round(+m[1]))))
  }
  return (
    <label className="rb-num">
      <span>{label}</span>
      <input inputMode="numeric" value={v ?? (value ? String(Math.round(value)) : '')} onFocus={(e) => e.target.select()}
        onChange={(e) => setV(e.target.value)} onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur() }
        }} />
    </label>
  )
}

// ── 선: 고른 선(없으면 새로 그릴 선)의 모양 ──
function LinesTab({ ids }: { ids: string[] }) {
  const rf = useReactFlow()
  const style = useEd((s) => s.edgeStyle)
  const sel = useEd((s) => s.edges.find((e) => e.id === ids[0])?.data)
  const d: EdgeData = ids.length ? { ...defaultEdge(), ...sel } : style
  const set = (p: Partial<EdgeData>) => (ids.length ? patchEdges(ids, p) : useEd.setState((s) => ({ edgeStyle: { ...s.edgeStyle, ...p } })))
  return (
    <>
      <Grp label={t('적용 대상')}>
        <div className="rb-note">{ids.length ? `${t('고른 선')} (${ids.length})` : t('새로 그릴 선')}</div>
      </Grp>
      <Grp label={t('선 모양')}>
        <Big icon={<LineIcon kind="bezier" />} label={t('곡선')} on={d.kind === 'bezier'} onClick={() => set({ kind: 'bezier' })} />
        <Big icon={<LineIcon kind="straight" />} label={t('직선')} on={d.kind === 'straight'} onClick={() => set({ kind: 'straight' })} />
        <Big icon={<LineIcon kind="step" />} label={t('꺾은선')} on={d.kind === 'step'} onClick={() => set({ kind: 'step' })} />
      </Grp>
      <Grp label={t('끝 모양')}>
        <Big icon={<LineIcon arrow="end" />} label={t('화살표')} on={d.arrow === 'end'} onClick={() => set({ arrow: 'end' })} />
        <Big icon={<LineIcon arrow="both" />} label={t('양방향')} on={d.arrow === 'both'} onClick={() => set({ arrow: 'both' })} />
        <Big icon={<LineIcon />} label={t('선만')} on={d.arrow === 'none'} onClick={() => set({ arrow: 'none' })} />
      </Grp>
      <Grp label={t('선 스타일')}>
        <Col>
          <Small icon={<LineIcon dashed />} label={t('점선')} on={d.dashed} onClick={() => set({ dashed: !d.dashed })} />
          <Menu trigger={<Small label={`${t('두께')} ${d.width}px`} drop />}>
            {[1, 1.5, 2.5, 4].map((w) => <Item key={w} checked={d.width === w} onSelect={() => set({ width: w })}>{w}px</Item>)}
          </Menu>
        </Col>
        <ColorButton label={t('선 색')} icon={<Palette {...S} />} value={d.color} none={t('기본')} onChange={(color) => set({ color })} />
      </Grp>
      <Grp label={t('관계 기호')}>
        <Row>
          <IB label={t('기호 없음')} on={!d.rel} onClick={() => set({ rel: null })}><span className="rb-none">—</span></IB>
          {RELS.map((r) => <IB key={r.id} label={`${r.id} ${r.label}`} on={d.rel === r.id} onClick={() => set({ rel: r.id })}><RelIcon rel={r.id} size={16} /></IB>)}
        </Row>
      </Grp>
      <Grp label={t('선 도구')}>
        <Big icon={<Tag {...BI} />} label={t('라벨')} tip={t('라벨 (더블클릭)')} disabled={ids.length !== 1} onClick={() => useEd.setState({ editingEdge: ids[0] })} />
        <Big icon={<Palette {...BI} />} label={t('기본 모양')} tip={t('기본 모양 설정…')} onClick={openDefaults} />
        <Big icon={<Trash2 {...BI} />} label={t('삭제')} disabled={!ids.length} onClick={() => rf.deleteElements({ edges: ids.map((id) => ({ id })) })} />
      </Grp>
    </>
  )
}

// ── 배치: 맞춤 · 배분 · 같은 크기 · 순서 · 상자 안의 상자 · 모눈 ──
const ALIGNS: { id: AlignKind; label: string; icon: ReactNode }[] = [
  { id: 'left', label: t('왼쪽'), icon: <AlignStartVertical {...SI} /> },
  { id: 'center', label: t('가운데'), icon: <AlignCenterVertical {...SI} /> },
  { id: 'right', label: t('오른쪽'), icon: <AlignEndVertical {...SI} /> },
  { id: 'top', label: t('위쪽'), icon: <AlignStartHorizontal {...SI} /> },
  { id: 'middle', label: t('가운데 (세로)'), icon: <AlignCenterHorizontal {...SI} /> },
  { id: 'bottom', label: t('아래쪽'), icon: <AlignEndHorizontal {...SI} /> },
]

function SnapBig() {
  const snap = useSettings((s) => s.snap !== false)
  return (
    <Big icon={<Magnet {...BI} />} label={t('모눈에 맞추기')} on={snap} tip={t('모눈에 맞추기 — 끄면 자유롭게 놓여요 (Alt를 누르는 동안은 반대로)')}
      onClick={() => { setSettings({ snap: !snap }); toast(snap ? t('모눈에 맞추지 않고 자유롭게 놓아요') : t('모눈에 맞춰 놓아요')) }} />
  )
}

function ArrangeTab({ ids }: { ids: string[] }) {
  const n = ids.length
  const inSet = useEd((s) => s.nodes.some((x) => ids.includes(x.id) && x.data.parent && s.nodes.some((p) => p.id === x.data.parent)))
  return (
    <>
      <Grp label={t('맞춤')} off={n < 2}>
        <Col>{ALIGNS.slice(0, 3).map((a) => <Small key={a.id} icon={a.icon} label={a.label} tip={t('{{side}} 맞춤', { side: a.label })} onClick={() => alignBoxes(a.id)} />)}</Col>
        <Col>{ALIGNS.slice(3).map((a) => <Small key={a.id} icon={a.icon} label={a.label} tip={t('{{side}} 맞춤', { side: a.label })} onClick={() => alignBoxes(a.id)} />)}</Col>
      </Grp>
      <Grp label={t('간격 똑같이')} off={n < 3}>
        <Col>
          <Small icon={<AlignHorizontalDistributeCenter {...SI} />} label={t('가로로')} tip={t('가로 간격 똑같이 (상자 3개 이상)')} onClick={() => distributeBoxes('h')} />
          <Small icon={<AlignVerticalDistributeCenter {...SI} />} label={t('세로로')} tip={t('세로 간격 똑같이 (상자 3개 이상)')} onClick={() => distributeBoxes('v')} />
        </Col>
      </Grp>
      <Grp label={t('같은 크기')} off={n < 2}>
        <Col>
          <Small icon={<StretchHorizontal {...SI} />} label={t('폭')} tip={t('가장 넓은 상자의 폭으로')} onClick={() => matchSize('w')} />
          <Small icon={<StretchVertical {...SI} />} label={t('높이')} tip={t('가장 높은 상자의 높이로')} onClick={() => matchSize('h')} />
          <Small icon={<Maximize2 {...SI} />} label={t('폭과 높이')} tip={t('가장 큰 상자의 크기로')} onClick={() => matchSize('both')} />
        </Col>
      </Grp>
      <Grp label={t('순서')} off={!n}>
        <Big icon={<BringToFront {...BI} />} label={t('맨 앞으로')} onClick={() => reorder(true)} />
        <Big icon={<SendToBack {...BI} />} label={t('맨 뒤로')} onClick={() => reorder(false)} />
      </Grp>
      <Grp label={t('상자 안의 상자')} off={!n}>
        <Big icon={<GroupIcon {...BI} />} label={t('묶기')} tip={t('집합으로 묶기 (Ctrl+G)')} onClick={groupSelection} />
        <Col>
          <Small icon={<LogIn {...SI} />} label={t('다른 상자에 넣기…')} onClick={() => startPicking(ids)} />
          <Small icon={<Ungroup {...SI} />} label={t('꺼내기')} tip={t('집합에서 꺼내기')} disabled={!inSet} onClick={() => takeOut(ids)} />
        </Col>
      </Grp>
      <Grp label={t('모눈')}>
        <SnapBig />
      </Grp>
    </>
  )
}

// ── 보기: 도구 · 확대·축소 · 배경 · 모눈 · 용지 ──
const PAPERS: { id: PaperKind; label: string; icon: ReactNode }[] = [
  { id: 'canvas', label: t('무한 캔버스'), icon: <InfinityIcon {...SI} /> },
  { id: 'a4', label: t('A4 세로'), icon: <RectangleVertical {...SI} /> },
  { id: 'a4-land', label: t('A4 가로'), icon: <RectangleHorizontal {...SI} /> },
]

function ViewTab() {
  const rf = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  const { tool, bg, paper, ground } = useEd(useShallow((s) => ({ tool: s.tool, bg: s.bg, paper: s.paper, ground: s.ground })))
  const app = useTheme(), dark = useLook().theme === 'dark'
  const toPage = usePageNav()
  const choosePaper = (k: PaperKind) => {
    if (setPaper(k)) toast(t('용지보다 넓은 내용이 있어요. A4 가로로 바꾸거나 상자를 옮겨 주세요'))
    if (k !== 'canvas') requestAnimationFrame(() => toPage(0))
  }
  const toggleDark = () => {
    const next = dark ? 'light' : 'dark'
    useEd.setState((s) => ({ mode: groundLook(s.ground, app).theme === next ? null : next }))
  }
  return (
    <>
      <Grp label={t('도구')}>
        <Big icon={<SquarePlus {...BI} />} label={t('그리기')} tip={t('상자 그리기 (빈 곳을 끌기)')} on={tool === 'draw'} onClick={() => useEd.setState({ tool: 'draw' })} />
        <Big icon={<BoxSelect {...BI} />} label={t('선택')} tip={t('선택 (끌어서 여러 개 고르기)')} on={tool === 'select'} onClick={() => useEd.setState({ tool: 'select' })} />
        <Big icon={<Hand {...BI} />} label={t('화면 이동')} tip={t('화면 이동 (끌기 · 스페이스를 누른 채 끌어도 돼요)')} on={tool === 'hand'} onClick={() => useEd.setState({ tool: 'hand' })} />
      </Grp>
      <Grp label={t('확대·축소')}>
        <Big icon={<ZoomOut {...BI} />} label={t('축소')} onClick={() => rf.zoomOut({ duration: 150 })} />
        <Big icon={<span className="rb-zoom">{Math.round(zoom * 100)}%</span>} label="100%" tip={t('100%로')} onClick={() => rf.zoomTo(1, { duration: 150 })} />
        <Big icon={<ZoomIn {...BI} />} label={t('확대')} onClick={() => rf.zoomIn({ duration: 150 })} />
        <Big icon={<Maximize {...BI} />} label={t('전체 보기')} onClick={() => rf.fitView({ padding: 0.25, duration: 250, maxZoom: 1.5 })} />
      </Grp>
      <Grp label={t('배경')}>
        <div className="rb-grid2">
          {BGS.map((b) => <Small key={b.id} label={b.label} on={bg === b.id} onClick={() => useEd.setState({ bg: b.id })} />)}
        </div>
        <Pop trigger={<Big icon={<PaintBucket {...BI} />} label={t('바탕색')} drop />}>
          <div className="bg-pop">
            <ColorPanel value={ground} onChange={(g) => useEd.setState({ ground: g })} palette={GROUNDS} none={t('기본 (흰색·검정)')} />
          </div>
        </Pop>
        <Big icon={dark ? <Sun {...BI} /> : <Moon {...BI} />} label={t('다크 모드')} on={dark} tip={dark ? t('이 노트 다크 모드 끄기') : t('이 노트 다크 모드 켜기')} onClick={toggleDark} />
      </Grp>
      <Grp label={t('모눈')}>
        <SnapBig />
      </Grp>
      <Grp label={t('용지')}>
        <Col>{PAPERS.map((p) => <Small key={p.id} icon={p.icon} label={p.label} on={paperKind(paper) === p.id} onClick={() => choosePaper(p.id)} />)}</Col>
        {paper && (
          <Col>
            <Small icon={<Columns2 {...SI} />} label={t('다음 페이지 옆으로')} on={!!paper.side} onClick={() => setPageSide(!paper.side)} />
            <Small icon={<Files {...SI} />} label={t('페이지 정렬')} tip={t('페이지 정렬 (추가·삭제·순서)')} onClick={openPages} />
          </Col>
        )}
      </Grp>
    </>
  )
}
