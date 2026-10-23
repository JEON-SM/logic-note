import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { AI_PROMPT, parseDiagram, type Imported } from '../lib/diagram'
import { createNote, updateNote } from '../lib/db'
import { go, useTheme } from '../lib/store'
import type { Note } from '../lib/types'
import { NoteThumb } from '../library/NoteThumb'
import { Modal } from './Dialogs'

type Target = { kind: 'note'; onImport: (r: Imported) => void } | { kind: 'new'; folderId: string | null }
const useImport = create<{ target: Target | null; text: string }>(() => ({ target: null, text: '' }))

/** 'note': 지금 노트에 넣기, 'new': 새 노트로 만들기 */
export const openImport = (target: Target, text = '') => useImport.setState({ target, text })

export function ImportDialog() {
  const { target, text } = useImport()
  const theme = useTheme()
  const [res, setRes] = useState<Imported | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setRes(null)
    setErr('')
    if (!text.trim()) return
    let alive = true
    const t = setTimeout(() => parseDiagram(text).then((r) => alive && setRes(r), (e) => alive && setErr(e.message)), 300)
    return () => { alive = false; clearTimeout(t) }
  }, [text])

  if (!target) return null
  const close = () => { useImport.setState({ target: null, text: '' }); setCopied(false) }
  const copyPrompt = () => navigator.clipboard.writeText(AI_PROMPT).then(() => setCopied(true))
  const run = async () => {
    if (!res) return
    if (target.kind === 'note') target.onImport(res)
    else {
      const n = await createNote(target.folderId)
      await updateNote(n.id, { title: res.title, nodes: res.nodes, edges: res.edges })
      go('#/n/' + n.id)
    }
    close()
  }

  return (
    <Modal open onClose={close} title="AI 도식 가져오기" wide>
      <p className="set-help">
        Claude·ChatGPT 같은 AI가 그려 준 <b>Mermaid</b>(flowchart·mindmap) 또는 <b>Graphviz</b> 코드를 붙여넣으세요.
        답변 전체를 붙여넣어도 코드 블록만 골라냅니다.
      </p>
      <div className="imp-prompt">
        <button type="button" className="btn" onClick={copyPrompt}>{copied ? '복사했어요' : 'AI에게 보낼 요청문 복사'}</button>
        <span>요청문 뒤에 정리할 내용을 이어 붙여 AI에게 보내세요.</span>
      </div>
      <textarea
        className="field imp-code" autoFocus spellCheck={false} value={text}
        onChange={(e) => useImport.setState({ text: e.target.value })}
        placeholder={'```mermaid\nflowchart TD\n  A(전제) --> C{타당한가?}\n  C -->|예| D[결론]\n```'}
      />
      <div className="imp-preview bgp-grid">
        {res
          ? <NoteThumb note={{ nodes: res.nodes, edges: res.edges } as Note} theme={theme} />
          : <span className={err ? 'imp-err' : 'imp-hint'}>{err || (text.trim() ? '읽는 중…' : '미리보기')}</span>}
      </div>
      <div className="dialog-actions">
        <span className="imp-info">{res && `${res.source} · 상자 ${res.nodes.length}개 · 연결선 ${res.edges.length}개`}</span>
        <button type="button" className="btn" onClick={close}>취소</button>
        <button type="button" className="btn primary" disabled={!res} onClick={run}>{target.kind === 'new' ? '새 노트로 가져오기' : '가져오기'}</button>
      </div>
    </Modal>
  )
}
