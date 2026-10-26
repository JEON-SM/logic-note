import { useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { create } from 'zustand'
import { CANVAS } from '../lib/color'
import { captureImage, download, fileName, noteChars, toDotCode, toMermaid } from '../lib/exporter'
import { useTheme } from '../lib/store'
import { Modal } from '../ui/Dialogs'
import { cls } from '../ui/kit'
import { useEd } from './store'

const useExport = create<{ open: boolean }>(() => ({ open: false }))
export const openExport = () => useExport.setState({ open: true })

type Code = 'mermaid' | 'dot'

export function ExportDialog() {
  const open = useExport((s) => s.open)
  const rf = useReactFlow()
  const theme = useTheme()
  const [code, setCode] = useState<Code>('mermaid')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // 노트를 떠나면 창도 닫는다
  useEffect(() => () => useExport.setState({ open: false }), [])

  useEffect(() => {
    if (!open) return
    const { nodes, edges } = useEd.getState()
    if (code === 'mermaid') setText(toMermaid(nodes, edges))
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
        <h3>코드</h3>
        <p className="set-help">
          Mermaid는 Claude·ChatGPT에 붙여넣으면 AI가 도식 구조를 그대로 읽고, Notion·GitHub·Obsidian에서는 그림으로 보입니다.
          Logic Note로 다시 가져올 수도 있어요.
        </p>
        <div className="seg exp-seg">
          {(['mermaid', 'dot'] as Code[]).map((c) => (
            <button key={c} type="button" className={cls(code === c && 'on')} onClick={() => setCode(c)}>{c === 'mermaid' ? 'Mermaid' : 'Graphviz'}</button>
          ))}
        </div>
        <textarea className="field imp-code" readOnly value={text} onFocus={(e) => e.target.select()} />
        <div className="set-actions">
          <button className="btn primary" disabled={!text} onClick={run('코드를 복사했어요', () => navigator.clipboard.writeText(text))}>코드 복사</button>
          <button className="btn" disabled={!text} onClick={run('파일로 저장했어요', async () =>
            download(new Blob([text], { type: 'text/plain' }), fileName(title, code === 'mermaid' ? 'mmd' : 'dot')))}>파일로 저장</button>
        </div>
      </section>
      {msg && <p className={msg.startsWith('실패') ? 'set-error' : 'exp-msg'}>{msg}</p>}
    </Modal>
  )
}
