import { useState, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { create } from 'zustand'
import { useLiveQuery } from 'dexie-react-hooks'
import { Folder as FolderIcon, Home } from 'lucide-react'
import { db } from '../lib/db'
import { cls } from './kit'

type D =
  | { kind: 'prompt'; title: string; value: string; ok: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message?: string; ok: string; resolve: (v: boolean) => void }
  | { kind: 'folder'; title: string; exclude?: string; resolve: (v: string | null | undefined) => void }

const useDialog = create<{ d: D | null }>(() => ({ d: null }))
const open = (d: D) => useDialog.setState({ d })

export const promptText = (title: string, value = '', ok = '확인') =>
  new Promise<string | null>((resolve) => open({ kind: 'prompt', title, value, ok, resolve }))
export const confirmDanger = (title: string, message?: string, ok = '삭제') =>
  new Promise<boolean>((resolve) => open({ kind: 'confirm', title, message, ok, resolve }))
/** undefined = 취소, null = 최상위 */
export const pickFolder = (title: string, exclude?: string) =>
  new Promise<string | null | undefined>((resolve) => open({ kind: 'folder', title, exclude, resolve }))

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className={cls('dialog', wide && 'wide')} aria-describedby={undefined}>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function DialogHost() {
  const d = useDialog((s) => s.d)
  if (!d) return null
  const close = (v: unknown) => { useDialog.setState({ d: null }); (d.resolve as (x: unknown) => void)(v) }
  const cancel = d.kind === 'confirm' ? false : d.kind === 'prompt' ? null : undefined
  return (
    <Modal open onClose={() => close(cancel)} title={d.title}>
      {d.kind === 'prompt' && <PromptBody d={d} close={close} />}
      {d.kind === 'confirm' && (
        <>
          {d.message && <p className="dialog-msg">{d.message}</p>}
          <div className="dialog-actions">
            <button className="btn" onClick={() => close(false)}>취소</button>
            <button className="btn danger" autoFocus onClick={() => close(true)}>{d.ok}</button>
          </div>
        </>
      )}
      {d.kind === 'folder' && <FolderBody exclude={d.exclude} close={close} />}
    </Modal>
  )
}

function PromptBody({ d, close }: { d: Extract<D, { kind: 'prompt' }>; close: (v: unknown) => void }) {
  const [v, setV] = useState(d.value)
  return (
    <form onSubmit={(e) => { e.preventDefault(); close(v.trim() || null) }}>
      <input className="field" autoFocus value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} />
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={() => close(null)}>취소</button>
        <button type="submit" className="btn primary">{d.ok}</button>
      </div>
    </form>
  )
}

function FolderBody({ exclude, close }: { exclude?: string; close: (v: unknown) => void }) {
  const folders = useLiveQuery(() => db.folders.toArray(), [])?.filter((f) => !f.deleted) ?? []
  const rows: { id: string; name: string; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => x.parentId === parent).sort((a, b) => a.name.localeCompare(b.name))) {
      if (f.id === exclude) continue
      rows.push({ id: f.id, name: f.name, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return (
    <div className="folder-pick">
      <button className="tree-row" onClick={() => close(null)}><Home size={16} /> <span>최상위</span></button>
      {rows.map((r) => (
        <button key={r.id} className="tree-row" style={{ paddingLeft: 12 + r.depth * 16 }} onClick={() => close(r.id)}>
          <FolderIcon size={16} /> <span>{r.name}</span>
        </button>
      ))}
    </div>
  )
}
