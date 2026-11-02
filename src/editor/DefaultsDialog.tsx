import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { setSettings, useSettings } from '../lib/store'
import { DefaultsForm } from '../ui/Defaults'
import { Modal } from '../ui/Dialogs'
import { Segmented } from '../ui/kit'
import { setNoteDefaults, useEd } from './store'

const useOpen = create<{ open: boolean }>(() => ({ open: false }))
export const openDefaults = () => useOpen.setState({ open: true })

/** 새 상자·선 기본 모양: 이 노트만 / 모든 노트 */
export function DefaultsDialog() {
  const open = useOpen((s) => s.open)
  const note = useEd((s) => s.defaults)
  const all = useSettings((s) => s.defaults)
  const [scope, setScope] = useState<'note' | 'all'>('note')
  useEffect(() => () => useOpen.setState({ open: false }), [])
  if (!open) return null
  return (
    <Modal open onClose={() => useOpen.setState({ open: false })} title="기본 모양" wide>
      <div className="exp-seg">
        <Segmented value={scope} onChange={setScope} options={[{ id: 'note', label: '이 노트' }, { id: 'all', label: '모든 노트' }]} />
      </div>
      <p className="set-help">새로 만드는 상자와 선에 쓰여요. 이미 있는 것은 그대로예요.</p>
      {scope === 'note' ? (
        <>
          <label className="def-follow">
            <input type="checkbox" checked={!note} onChange={(e) => setNoteDefaults(e.target.checked ? null : all)} />
            모든 노트 설정 따르기 {note && <small className="set-help">(이 노트만 따로 쓰는 중)</small>}
          </label>
          {/* 따르는 중에 바꾸면 이 노트만의 설정이 된다 */}
          <DefaultsForm value={note ?? all} onChange={setNoteDefaults} />
        </>
      ) : (
        <DefaultsForm value={all} onChange={(defaults) => setSettings({ defaults })} />
      )}
    </Modal>
  )
}
