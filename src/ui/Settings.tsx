import { useState } from 'react'
import { Cloud, CloudAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-react'
import { create } from 'zustand'
import { setSettings, useSettings, useSync } from '../lib/store'
import { BUILTIN_CLIENT_ID, connect, disconnect, sync } from '../lib/sync'
import { exportAll, importAll } from '../lib/db'
import { pickFiles } from '../lib/media'
import { Modal } from './Dialogs'
import { cls, IB } from './kit'
import type { Bg } from '../lib/types'

export const BGS: { id: Bg; label: string }[] = [
  { id: 'grid', label: '모눈' },
  { id: 'grid-wide', label: '넓은 모눈' },
  { id: 'dots', label: '그리드 (점)' },
  { id: 'dots-wide', label: '넓은 그리드 (점)' },
  { id: 'none', label: '없음' },
]

export const useSettingsOpen = create<{ open: boolean }>(() => ({ open: false }))
export const openSettings = () => useSettingsOpen.setState({ open: true })

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.id} type="button" className={cls(value === o.id && 'on')} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

export function SettingsDialog() {
  const open = useSettingsOpen((s) => s.open)
  const s = useSettings()
  const { linked, status, last, error } = useSync()
  const [msg, setMsg] = useState('')
  const run = (fn: () => Promise<unknown>) => fn().then(() => setMsg('')).catch((e) => setMsg(e.message))

  const doExport = async () => {
    const url = URL.createObjectURL(await exportAll())
    Object.assign(document.createElement('a'), { href: url, download: `logic-note-${new Date().toISOString().slice(0, 10)}.json` }).click()
    URL.revokeObjectURL(url)
  }
  const doImport = async () => { const [f] = await pickFiles('application/json,.json'); if (f) await importAll(f); setMsg(f ? '가져왔습니다.' : '') }

  return (
    <Modal open={open} onClose={() => useSettingsOpen.setState({ open: false })} title="설정" wide>
      <section className="set-sec">
        <h3>화면</h3>
        <div className="set-row"><span>테마</span>
          <Segmented value={s.theme} onChange={(theme) => setSettings({ theme })} options={[{ id: 'system', label: '시스템' }, { id: 'light', label: '라이트' }, { id: 'dark', label: '다크' }]} />
        </div>
        <div className="set-row"><span>새 노트 배경</span>
          <select className="field sm" value={s.bg} onChange={(e) => setSettings({ bg: e.target.value as Bg })}>
            {BGS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
        <div className="set-row"><span>링크 미리보기 <small>microlink.io 사용</small></span>
          <Segmented value={s.previews ? 'on' : 'off'} onChange={(v) => setSettings({ previews: v === 'on' })} options={[{ id: 'on', label: '켜기' }, { id: 'off', label: '끄기' }]} />
        </div>
      </section>

      <section className="set-sec">
        <h3>Google Drive 동기화</h3>
        <p className="set-help">
          내 드라이브의 <b>Logic Note</b> 폴더에 폴더 구조 그대로 노트 파일(.lnote)이 저장됩니다.
          {!BUILTIN_CLIENT_ID && <> Google Cloud Console에서 만든 <b>OAuth 클라이언트 ID</b>(웹 애플리케이션)가 필요합니다 — README 참고.</>}
        </p>
        {(!BUILTIN_CLIENT_ID || s.clientId) && (
          <input className="field mono" placeholder="xxxxxxxx.apps.googleusercontent.com" value={s.clientId} onChange={(e) => setSettings({ clientId: e.target.value })} />
        )}
        <div className="set-actions">
          {!linked && <button className="btn primary" onClick={() => run(connect)}>Google 계정 연결</button>}
          {linked && status === 'auth' && <button className="btn primary" onClick={() => run(connect)}>다시 로그인</button>}
          {linked && <button className="btn" disabled={status === 'syncing'} onClick={() => run(sync)}>지금 동기화</button>}
          {linked && <button className="btn" onClick={disconnect}>연결 해제</button>}
          <span className="set-status">
            {status === 'syncing' ? '동기화 중…' : linked && last ? `마지막 동기화 ${new Date(last).toLocaleTimeString()}` : ''}
          </span>
        </div>
        {(msg || error) && <p className="set-error">{msg || error}</p>}
      </section>

      <section className="set-sec">
        <h3>백업</h3>
        <div className="set-actions">
          <button className="btn" onClick={doExport}>모두 내보내기 (.json)</button>
          <button className="btn" onClick={() => run(doImport)}>가져오기</button>
        </div>
      </section>
    </Modal>
  )
}

/** 상단 바의 동기화 상태 버튼 */
export function SyncButton() {
  const { linked, status } = useSync()
  if (!linked) return <IB label="동기화 설정" onClick={openSettings}><CloudOff size={18} strokeWidth={1.6} /></IB>
  const icon = status === 'syncing' ? <RefreshCw size={18} strokeWidth={1.6} className="spin" />
    : status === 'error' ? <CloudAlert size={18} strokeWidth={1.6} />
    : status === 'auth' ? <Cloud size={18} strokeWidth={1.6} className="warn" />
    : <CloudCheck size={18} strokeWidth={1.6} />
  const label = status === 'auth' ? '다시 로그인' : status === 'error' ? '동기화 오류 — 다시 시도' : '지금 동기화'
  return <IB label={label} onClick={() => (status === 'auth' ? connect().catch(() => openSettings()) : sync())}>{icon}</IB>
}
