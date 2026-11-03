import { useMemo, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from './color'
import { BASE_DEFAULTS } from './shapes'
import type { LangSetting } from './i18n'
import type { PaperKind } from './pages'
import type { Bg, Defaults } from './types'

export interface Settings {
  theme: 'system' | Theme
  bg: Bg
  recent: string[]
  clientId: string
  sort: 'updated' | 'created' | 'title'
  previews: boolean
  expanded: string[]
  /** 모든 노트의 새 상자·선 기본 모양 */
  defaults: Defaults
  /** 새 노트 용지 */
  paper: PaperKind
  /** 새 노트 바탕색 (null이면 테마 기본) */
  ground: string | null
  /** 화면 언어 (auto: 기기 언어) */
  lang: LangSetting
}

export const useSettings = create<Settings>()(
  persist((): Settings => ({
    theme: 'system', bg: 'grid', recent: [], clientId: '', sort: 'updated', previews: true, expanded: [], defaults: BASE_DEFAULTS, paper: 'canvas', ground: null, lang: 'auto',
  }), { name: 'ln.settings' }),
)
export const setSettings = (p: Partial<Settings>) => useSettings.setState(p)
export const pushRecent = (c: string) =>
  useSettings.setState((s) => ({ recent: [c, ...s.recent.filter((x) => x !== c)].slice(0, 7) }))

const mq = matchMedia('(prefers-color-scheme: dark)')
const subscribeMq = (cb: () => void) => { mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb) }

export function useTheme(): Theme {
  const t = useSettings((s) => s.theme)
  const sysDark = useSyncExternalStore(subscribeMq, () => mq.matches)
  return t === 'system' ? (sysDark ? 'dark' : 'light') : t
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'auth'
export const useSync = create<{ linked: boolean; status: SyncStatus; last?: number; error?: string }>(() => ({ linked: false, status: 'idle' }))

// ── 해시 라우팅 ──
export type Route =
  | { name: 'all' } | { name: 'fav' } | { name: 'trash' }
  | { name: 'folder'; id: string } | { name: 'note'; id: string }

const subscribeHash = (cb: () => void) => { addEventListener('hashchange', cb); return () => removeEventListener('hashchange', cb) }

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash)
  return useMemo(() => {
    const [, a, b] = hash.replace(/^#/, '').split('/')
    if (a === 'f' && b) return { name: 'folder', id: b }
    if (a === 'n' && b) return { name: 'note', id: b }
    if (a === 'fav') return { name: 'fav' }
    if (a === 'trash') return { name: 'trash' }
    return { name: 'all' }
  }, [hash])
}

export const go = (hash: string) => { location.hash = hash }
