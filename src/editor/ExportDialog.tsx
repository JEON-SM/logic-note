import { useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { create } from 'zustand'
import { CANVAS } from '../lib/color'
import { captureImage, download, fileName, noteChars, toDotCode, toMermaid, toOutline } from '../lib/exporter'
import { useTheme } from '../lib/store'
import { Modal } from '../ui/Dialogs'
import { cls } from '../ui/kit'
import { useEd } from './store'

const useExport = create<{ open: boolean }>(() => ({ open: false }))
export const openExport = () => useExport.setState({ open: true })

type Code = 'outline' | 'mermaid' | 'dot'
const CODES: Record<Code, { label: string; ext: string; help: string }> = {
  outline: {
    label: 'AI용 개요', ext: 'txt',
    help: '연결을 따라 펼친 흐름과 상자마다의 설명을 글로 정리합니다. Claude·ChatGPT에 붙여넣고 질문하면 노트의 논리를 가장 정확하게 읽어요.',
  },
  mermaid: {
    label: 'Mermaid', ext: 'mmd',
    help: 'AI가 고쳐서 돌려준 코드를 다시 가져올 수 있고, Notion·GitHub·Obsidian에서는 그림으로 보입니다. 상자 제목은 굵게(<b>) 표시돼요.',
  },
  dot: { label: 'Graphviz', ext: 'dot', help: 'Graphviz 도구에서 열거나 Logic Note로 다시 가져올 수 있어요. 상자 제목은 굵게(<B>) 표시돼요.' },
}

export function ExportDialog() {
  const open = useExport((s) => s.open)
  const rf = useReactFlow()
  const theme = useTheme()
  const [code, setCode] = useState<Code>('outline')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // 노트를 떠나면 창도 닫는다
  useEffect(() => () => useExport.setState({ open: false }), [])

  useEffect(() => {
    if (!open) return
    const { nodes, edges, title } = useEd.getState()
    if (code === 'outline') setText(toOutline(title, nodes, edges))
    else if (code === 'mermaid') setText(toMermaid(nodes, edges))
    else toDotCode(nodes, edges).then(setText)
  }, [open, code])

  if (!open) return null
  const close = () => { useExport.setState({ open: false }); setMsg('') }
  const title = useEd.getState().title
  const empty = !useEd.getState().nodes.length

  /** 선택 표시·편집 상태를 지운 화면을 찍는다 */
  const image = async (format: 'png' | 'svg') => {
    useEd.setState((s) => ({
      editingId: null, editingEdge: null,
      nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
      edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    }))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')!
    const { nodes, edges } = useEd.getState()
    return captureImage(viewport, rf.getNodesBounds(rf.getNodes()), format, CANVAS[theme], noteChars(nodes, edges))
  }
  const run = (label: string, fn: () => Promise<unknown>) => async () => {
    setBusy(true)
    setMsg('')
    try { await fn(); setMsg(label) } catch (e) { setMsg('실패: ' + (e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={close} title="내보내기" wide>
      <section className="set-sec">
        <h3>그림</h3>
        <div className="set-actions">
          <button className="btn" disabled={busy || empty} onClick={run('PNG로 저장했어요', async () => download(await image('png'), fileName(title, 'png')))}>PNG 저장</button>
          <button className="btn" disabled={busy || empty} onClick={run('그림을 복사했어요. 원하는 곳에 붙여넣으세요', async () => {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': image('png') })])
          })}>그림 복사</button>
          <button className="btn" disabled={busy || empty} onClick={run('SVG로 저장했어요', async () => download(await image('svg'), fileName(title, 'svg')))}>SVG 저장</button>
          <span className="set-status">{busy ? '만드는 중…' : ''}</span>
        </div>
      </section>
      <section className="set-sec">
        <h3>글·코드</h3>
        <div className="seg exp-seg">
          {(Object.keys(CODES) as Code[]).map((c) => (
            <button key={c} type="button" className={cls(code === c && 'on')} onClick={() => setCode(c)}>{CODES[c].label}</button>
          ))}
        </div>
        <p className="set-help">{CODES[code].help}</p>
        <textarea className={cls('field imp-code', code === 'outline' && 'exp-prose')} readOnly value={text} onFocus={(e) => e.target.select()} />
        <div className="set-actions">
          <button className="btn primary" disabled={!text} onClick={run('복사했어요', () => navigator.clipboard.writeText(text))}>복사</button>
          <button className="btn" disabled={!text} onClick={run('파일로 저장했어요', async () =>
            download(new Blob([text], { type: 'text/plain;charset=utf-8' }), fileName(title, CODES[code].ext)))}>파일로 저장</button>
        </div>
      </section>
      {msg && <p className={msg.startsWith('실패') ? 'set-error' : 'exp-msg'}>{msg}</p>}
    </Modal>
  )
}
