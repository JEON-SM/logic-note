import { useState } from 'react'
import { Cloud, CloudAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-react'
import { create } from 'zustand'
import { setSettings, useSettings, useSync } from '../lib/store'
import { BUILTIN_CLIENT_ID, connect, disconnect, sync } from '../lib/sync'
import { exportAll, importAll } from '../lib/db'
import { pickFiles } from '../lib/media'
import { BASE_DEFAULTS } from '../lib/shapes'
import { DefaultsForm } from './Defaults'
import { Modal } from './Dialogs'
import { IB, Segmented } from './kit'
import type { Bg } from '../lib/types'
import { locale, t } from '../lib/i18n'

export const BGS: { id: Bg; label: string }[] = [
  { id: 'grid', label: t('모눈') },
  { id: 'grid-wide', label: t('넓은 모눈') },
  { id: 'dots', label: t('그리드 (점)') },
  { id: 'dots-wide', label: t('넓은 그리드 (점)') },
  { id: 'lines', label: t('줄') },
  { id: 'none', label: t('없음') },
]

export const useSettingsOpen = create<{ open: boolean }>(() => ({ open: false }))
export const openSettings = () => useSettingsOpen.setState({ open: true })

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
  const doImport = async () => { const [f] = await pickFiles('application/json,.json'); if (f) await importAll(f); setMsg(f ? t('가져왔습니다.') : '') }

  return (
    <Modal open={open} onClose={() => useSettingsOpen.setState({ open: false })} title={t('설정')} wide>
      <section className="set-sec">
        <h3>{t('화면')}</h3>
        <div className="set-row"><span>{t('언어')} · Language</span>
          <Segmented value={s.lang} onChange={(lang) => { setSettings({ lang }); location.reload() }}
            options={[{ id: 'auto', label: t('자동') }, { id: 'ko', label: '한국어' }, { id: 'en', label: 'English' }]} />
        </div>
        <div className="set-row"><span>{t('테마')}</span>
          <Segmented value={s.theme} onChange={(theme) => setSettings({ theme })} options={[{ id: 'system', label: t('시스템') }, { id: 'light', label: t('라이트') }, { id: 'dark', label: t('다크') }]} />
        </div>
        <div className="set-row"><span>{t('새 노트 용지')}</span>
          <Segmented value={s.paper} onChange={(paper) => setSettings({ paper })}
            options={[{ id: 'canvas', label: t('무한 캔버스') }, { id: 'a4', label: t('A4 세로') }, { id: 'a4-land', label: t('A4 가로') }]} />
        </div>
        <div className="set-row"><span>{t('새 노트 배경')}</span>
          <select className="field sm" value={s.bg} onChange={(e) => setSettings({ bg: e.target.value as Bg })}>
            {BGS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
        <div className="set-row"><span>{t('링크 미리보기')} <small>{t('microlink.io 사용')}</small></span>
          <Segmented value={s.previews ? 'on' : 'off'} onChange={(v) => setSettings({ previews: v === 'on' })} options={[{ id: 'on', label: t('켜기') }, { id: 'off', label: t('끄기') }]} />
        </div>
      </section>

      <section className="set-sec">
        <h3>{t('새 상자·선 기본 모양')}</h3>
        <p className="set-help">{t('모든 노트에 적용돼요. 노트마다 다르게 하려면 편집기 ⋮ 메뉴 › 기본 모양에서 바꾸세요.')}</p>
        <DefaultsForm value={s.defaults} onChange={(defaults) => setSettings({ defaults })} />
        <div className="set-actions"><button className="btn" onClick={() => setSettings({ defaults: BASE_DEFAULTS })}>{t('처음 값으로')}</button></div>
      </section>

      <section className="set-sec">
        <h3>{t('Google Drive 동기화')}</h3>
        <p className="set-help">
          {t('내 드라이브의')} <b>Logic Note</b> {t('폴더에 폴더 구조 그대로 노트 파일(.lnote)이 저장됩니다.')}
          {!BUILTIN_CLIENT_ID && <> {t('Google Cloud Console에서 만든')} <b>{t('OAuth 클라이언트 ID')}</b>{t('(웹 애플리케이션)가 필요합니다 — README 참고.')}</>}
        </p>
        {(!BUILTIN_CLIENT_ID || s.clientId) && (
          <input className="field mono" placeholder="xxxxxxxx.apps.googleusercontent.com" value={s.clientId} onChange={(e) => setSettings({ clientId: e.target.value })} />
        )}
        <div className="set-actions">
          {!linked && <button className="btn primary" onClick={() => run(connect)}>{t('Google 계정 연결')}</button>}
          {linked && status === 'auth' && <button className="btn primary" onClick={() => run(connect)}>{t('다시 로그인')}</button>}
          {linked && <button className="btn" disabled={status === 'syncing'} onClick={() => run(sync)}>{t('지금 동기화')}</button>}
          {linked && <button className="btn" onClick={disconnect}>{t('연결 해제')}</button>}
          <span className="set-status">
            {status === 'syncing' ? t('동기화 중…') : linked && last ? t('마지막 동기화 {{time}}', { time: new Date(last).toLocaleTimeString(locale) }) : ''}
          </span>
        </div>
        {(msg || error) && <p className="set-error">{msg || error}</p>}
      </section>

      <section className="set-sec">
        <h3>{t('백업')}</h3>
        <div className="set-actions">
          <button className="btn" onClick={doExport}>{t('모두 내보내기 (.json)')}</button>
          <button className="btn" onClick={() => run(doImport)}>{t('가져오기')}</button>
        </div>
      </section>
    </Modal>
  )
}

/** 상단 바의 동기화 상태 버튼 */
export function SyncButton() {
  const { linked, status } = useSync()
  if (!linked) return <IB label={t('동기화 설정')} onClick={openSettings}><CloudOff size={18} strokeWidth={1.6} /></IB>
  const icon = status === 'syncing' ? <RefreshCw size={18} strokeWidth={1.6} className="spin" />
    : status === 'error' ? <CloudAlert size={18} strokeWidth={1.6} />
    : status === 'auth' ? <Cloud size={18} strokeWidth={1.6} className="warn" />
    : <CloudCheck size={18} strokeWidth={1.6} />
  const label = status === 'auth' ? t('다시 로그인') : status === 'error' ? t('동기화 오류 — 다시 시도') : t('지금 동기화')
  return <IB label={label} onClick={() => (status === 'auth' ? connect().catch(() => openSettings()) : sync())}>{icon}</IB>
}
