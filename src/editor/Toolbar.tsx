import { useReactFlow } from '@xyflow/react'
import { useEditorState } from '@tiptap/react'
import { useShallow } from 'zustand/react/shallow'
import {
  AlignCenter, AlignLeft, AlignRight, Baseline, Bold, CornerDownRight, Copy, Film, Hand, Highlighter, ImagePlus, Italic,
  Link2, List, ListChecks, ListOrdered, MoreHorizontal, MousePointer2, PaintBucket, Spline, Square, Strikethrough, Tag,
  Trash2, Type, Underline, GitBranchPlus, Eye, EyeOff, MoveHorizontal,
} from 'lucide-react'
import { HIGHLIGHTS } from '../lib/color'
import { pickFiles } from '../lib/media'
import { FONTS, SIZES } from '../lib/rich'
import { SHAPES, defaultBox, defaultEdge } from '../lib/shapes'
import type { EdgeData } from '../lib/types'
import { ColorButton, IB, Item, Menu, MenuSep, Sep, ShapeIcon } from '../ui/kit'
import { addChild, insertFiles, insertLink } from './actions'
import { copySelection, fmt, pasteClip, patchEdges, patchNodes, useEd } from './store'

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
  return (
    <div className="toolbar">
      <div className="tb-inner">
        {selN.length ? <NodeTools ids={selN} /> : selE.length ? <EdgeTools ids={selE} /> : <CreateTools />}
      </div>
    </div>
  )
}

function CreateTools() {
  const { tool, shape, edgeStyle } = useEd(useShallow((s) => ({ tool: s.tool, shape: s.shape, edgeStyle: s.edgeStyle })))
  const setStyle = (p: Partial<EdgeData>) => useEd.setState((s) => ({ edgeStyle: { ...s.edgeStyle, ...p } }))
  return (
    <>
      <IB label="이동 (드래그로 화면 이동)" on={tool === 'hand'} onClick={() => useEd.setState({ tool: 'hand' })}><Hand {...S} /></IB>
      <IB label="선택 (드래그로 여러 개 선택)" on={tool === 'select'} onClick={() => useEd.setState({ tool: 'select' })}><MousePointer2 {...S} /></IB>
      <Sep />
      {SHAPES.map((s) => (
        <IB key={s.id} label={`${s.label} — 캔버스를 눌러 배치`} on={tool === 'place' && shape === s.id}
          onClick={() => useEd.setState({ tool: tool === 'place' && shape === s.id ? 'hand' : 'place', shape: s.id })}>
          <ShapeIcon shape={s.id} />
        </IB>
      ))}
      <Sep />
      <Menu trigger={<IB label="새 연결선 모양"><LineIcon kind={edgeStyle.kind} arrow={edgeStyle.arrow} dashed={edgeStyle.dashed} /></IB>}>
        <EdgeStyleItems d={edgeStyle} set={setStyle} />
      </Menu>
      <Sep />
      <IB label="이미지" onClick={async () => insertFiles(await pickFiles('image/*'))}><ImagePlus {...S} /></IB>
      <IB label="영상" onClick={async () => insertFiles(await pickFiles('video/*'))}><Film {...S} /></IB>
      <IB label="링크" onClick={() => insertLink()}><Link2 {...S} /></IB>
    </>
  )
}

function EdgeStyleItems({ d, set }: { d: EdgeData; set: (p: Partial<EdgeData>) => void }) {
  return (
    <>
      <Item icon={<LineIcon kind="bezier" />} checked={d.kind === 'bezier'} onSelect={() => set({ kind: 'bezier' })}>곡선</Item>
      <Item icon={<LineIcon kind="straight" />} checked={d.kind === 'straight'} onSelect={() => set({ kind: 'straight' })}>직선</Item>
      <Item icon={<LineIcon kind="step" />} checked={d.kind === 'step'} onSelect={() => set({ kind: 'step' })}>꺾은선</Item>
      <MenuSep />
      <Item icon={<LineIcon arrow="end" />} checked={d.arrow === 'end'} onSelect={() => set({ arrow: 'end' })}>화살표</Item>
      <Item icon={<LineIcon arrow="both" />} checked={d.arrow === 'both'} onSelect={() => set({ arrow: 'both' })}>양방향 화살표</Item>
      <Item icon={<LineIcon />} checked={d.arrow === 'none'} onSelect={() => set({ arrow: 'none' })}>선만</Item>
      <MenuSep />
      <Item icon={<LineIcon dashed />} checked={d.dashed} onSelect={() => set({ dashed: !d.dashed })}>점선</Item>
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

function NodeTools({ ids }: { ids: string[] }) {
  const rf = useReactFlow()
  const first = useEd((s) => s.nodes.find((n) => n.id === ids[0])?.data) ?? defaultBox('rect')
  const m = useActiveMarks()
  const hasLinks = /href=/.test(first.body)
  return (
    <>
      <Menu trigger={<IB label="도형"><ShapeIcon shape={first.shape} /></IB>}>
        {SHAPES.map((s) => <Item key={s.id} icon={<ShapeIcon shape={s.id} size={16} />} checked={first.shape === s.id} onSelect={() => patchNodes(ids, { shape: s.id })}>{s.label}</Item>)}
      </Menu>
      <ColorButton label="채우기" icon={<PaintBucket {...S} />} value={first.fill} none="기본" onChange={(fill) => patchNodes(ids, { fill })} />
      <ColorButton label="테두리 색" icon={<Square {...S} />} value={first.stroke} none="기본" onChange={(stroke) => patchNodes(ids, { stroke })} />
      <Menu trigger={<IB label="테두리 모양"><LineIcon dashed={first.dash === 'dashed'} /></IB>}>
        <Item icon={<LineIcon />} checked={first.dash === 'solid'} onSelect={() => patchNodes(ids, { dash: 'solid' })}>실선</Item>
        <Item icon={<LineIcon dashed />} checked={first.dash === 'dashed'} onSelect={() => patchNodes(ids, { dash: 'dashed' })}>점선</Item>
        <Item checked={first.dash === 'none'} onSelect={() => patchNodes(ids, { dash: 'none' })}>테두리 없음</Item>
        <MenuSep />
        {[1, 1.5, 2.5, 4].map((w) => <Item key={w} checked={first.strokeWidth === w} onSelect={() => patchNodes(ids, { strokeWidth: w })}>{w}px</Item>)}
      </Menu>
      <Sep />
      <Menu trigger={<IB label="글꼴"><Type {...S} /></IB>}>
        {FONTS.map((f) => (
          <Item key={f.label} checked={(m?.font ?? '') === f.value} onSelect={() => fmt((c) => (f.value ? c.setFontFamily(f.value) : c.unsetFontFamily()))}>
            <span style={{ fontFamily: f.value || undefined }}>{f.label}</span>
          </Item>
        ))}
      </Menu>
      <Menu trigger={<button type="button" className="ib size-btn" title="글자 크기" onMouseDown={(e) => e.preventDefault()}>{m?.size ? parseInt(m.size) : 'Aa'}</button>}>
        <Item checked={!m?.size} onSelect={() => fmt((c) => c.unsetFontSize())}>기본</Item>
        {SIZES.map((n) => <Item key={n} checked={m?.size === `${n}px`} onSelect={() => fmt((c) => c.setFontSize(`${n}px`))}>{n}</Item>)}
      </Menu>
      <IB label="굵게 (Ctrl+B)" on={m?.bold} onClick={() => fmt((c) => c.toggleBold())}><Bold {...S} /></IB>
      <IB label="기울임 (Ctrl+I)" on={m?.italic} onClick={() => fmt((c) => c.toggleItalic())}><Italic {...S} /></IB>
      <IB label="밑줄 (Ctrl+U)" on={m?.underline} onClick={() => fmt((c) => c.toggleUnderline())}><Underline {...S} /></IB>
      <IB label="취소선" on={m?.strike} onClick={() => fmt((c) => c.toggleStrike())}><Strikethrough {...S} /></IB>
      <ColorButton label="글자 색" icon={<Baseline {...S} />} value={m?.color} none="자동"
        onChange={(color) => fmt((c) => (color ? c.setColor(color) : c.unsetColor()))} />
      <ColorButton label="형광펜" icon={<Highlighter {...S} />} value={m?.hl} none="없음" palette={HIGHLIGHTS}
        onChange={(color) => fmt((c) => (color ? c.setHighlight({ color }) : c.unsetHighlight()))} />
      <Menu trigger={<IB label="정렬"><AlignCenter {...S} /></IB>}>
        <Item icon={<AlignLeft size={16} />} onSelect={() => fmt((c) => c.setTextAlign('left'))}>왼쪽</Item>
        <Item icon={<AlignCenter size={16} />} onSelect={() => fmt((c) => c.setTextAlign('center'))}>가운데</Item>
        <Item icon={<AlignRight size={16} />} onSelect={() => fmt((c) => c.setTextAlign('right'))}>오른쪽</Item>
      </Menu>
      <Menu trigger={<IB label="목록"><List {...S} /></IB>}>
        <Item icon={<List size={16} />} onSelect={() => fmt((c) => c.toggleBulletList())}>글머리 기호</Item>
        <Item icon={<ListOrdered size={16} />} onSelect={() => fmt((c) => c.toggleOrderedList())}>번호 매기기</Item>
        <Item icon={<ListChecks size={16} />} onSelect={() => fmt((c) => c.toggleTaskList())}>체크리스트</Item>
      </Menu>
      <Sep />
      <IB label="이미지 넣기" onClick={async () => insertFiles(await pickFiles('image/*'))}><ImagePlus {...S} /></IB>
      <IB label="링크 넣기" onClick={() => insertLink()}><Link2 {...S} /></IB>
      <Menu align="end" trigger={<IB label="더보기"><MoreHorizontal {...S} /></IB>}>
        <Item icon={<GitBranchPlus size={16} />} onSelect={addChild}>연결된 상자 추가 (Tab)</Item>
        <Item icon={<Copy size={16} />} onSelect={() => { copySelection(); pasteClip() }}>복제 (Ctrl+D)</Item>
        <Item icon={<MoveHorizontal size={16} />} onSelect={() => patchNodes(ids, { wrap: null })}>폭 자동 맞춤</Item>
        <Item icon={<Film size={16} />} onSelect={async () => insertFiles(await pickFiles('video/*'))}>영상 넣기</Item>
        {hasLinks && (
          <Item icon={first.hidePreview ? <Eye size={16} /> : <EyeOff size={16} />} onSelect={() => patchNodes(ids, { hidePreview: !first.hidePreview })}>
            {first.hidePreview ? '링크 미리보기 보기' : '링크 미리보기 숨기기'}
          </Item>
        )}
      </Menu>
      <IB label="삭제" onClick={() => rf.deleteElements({ nodes: ids.map((id) => ({ id })) })}><Trash2 {...S} /></IB>
    </>
  )
}

function EdgeTools({ ids }: { ids: string[] }) {
  const rf = useReactFlow()
  const d = { ...defaultEdge(), ...useEd((s) => s.edges.find((e) => e.id === ids[0])?.data) }
  const set = (p: Partial<EdgeData>) => patchEdges(ids, p)
  return (
    <>
      <IB label="곡선" on={d.kind === 'bezier'} onClick={() => set({ kind: 'bezier' })}><Spline {...S} /></IB>
      <IB label="직선" on={d.kind === 'straight'} onClick={() => set({ kind: 'straight' })}><LineIcon /></IB>
      <IB label="꺾은선" on={d.kind === 'step'} onClick={() => set({ kind: 'step' })}><CornerDownRight {...S} /></IB>
      <Sep />
      <IB label="화살표" on={d.arrow === 'end'} onClick={() => set({ arrow: 'end' })}><LineIcon arrow="end" /></IB>
      <IB label="양방향" on={d.arrow === 'both'} onClick={() => set({ arrow: 'both' })}><LineIcon arrow="both" /></IB>
      <IB label="선만" on={d.arrow === 'none'} onClick={() => set({ arrow: 'none' })}><LineIcon /></IB>
      <IB label="점선" on={d.dashed} onClick={() => set({ dashed: !d.dashed })}><LineIcon dashed /></IB>
      <Sep />
      <ColorButton label="선 색" icon={<Spline {...S} />} value={d.color} none="기본" onChange={(color) => set({ color })} />
      <Menu trigger={<button type="button" className="ib size-btn" title="두께">{d.width}</button>}>
        {[1, 1.5, 2.5, 4].map((w) => <Item key={w} checked={d.width === w} onSelect={() => set({ width: w })}>{w}px</Item>)}
      </Menu>
      <IB label="라벨 (더블클릭)" onClick={() => useEd.setState({ editingEdge: ids[0] })}><Tag {...S} /></IB>
      <IB label="삭제" onClick={() => rf.deleteElements({ edges: ids.map((id) => ({ id })) })}><Trash2 {...S} /></IB>
    </>
  )
}
