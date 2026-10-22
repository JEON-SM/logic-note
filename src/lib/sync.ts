// Google Drive 동기화
// 구조: 내 드라이브/Logic Note/ 아래에 폴더 트리를 그대로 만들고, 노트는 <제목>.lnote (JSON) 파일 하나씩.
// 이미지·영상은 Logic Note/.media/ 에 따로 저장. 충돌 시 최신 것을 유지하고 다른 쪽은 사본으로 남긴다.
import { db, onLocalChange, uid } from './db'
import { useSettings, useSync } from './store'
import type { Folder, Note } from './types'

const API = 'https://www.googleapis.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER = 'application/vnd.google-apps.folder'
type DFile = { id: string; name: string; parents?: string[]; mimeType?: string; appProperties?: Record<string, string> }

class AuthError extends Error {}
declare global { interface Window { google?: any } }

/** 빌드할 때 넣은 기본 클라이언트 ID (VITE_GOOGLE_CLIENT_ID). 설정에서 직접 넣으면 그게 우선 */
export const BUILTIN_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

let token: { v: string; exp: number } | null = JSON.parse(localStorage.getItem('ln.token') || 'null')
const hasToken = () => !!token && token.exp > Date.now()
export const remoteEvents = new EventTarget()

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise<void>((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', onload: () => res(), onerror: () => rej(new Error('Google 로그인 스크립트를 불러오지 못했습니다.')) })
    document.head.appendChild(s)
  })
}

export async function connect() {
  const clientId = useSettings.getState().clientId.trim() || BUILTIN_CLIENT_ID
  if (!clientId) throw new Error('Google OAuth 클라이언트 ID를 먼저 입력하세요.')
  await loadGis()
  await new Promise<void>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r: any) => {
        if (r.error) return reject(new Error(r.error_description || r.error))
        token = { v: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 }
        localStorage.setItem('ln.token', JSON.stringify(token))
        localStorage.setItem('ln.linked', '1')
        resolve()
      },
      error_callback: (e: any) => reject(new Error(e?.type === 'popup_closed' ? '로그인 창이 닫혔습니다.' : e?.message || '로그인 실패')),
    })
    client.requestAccessToken({ prompt: localStorage.getItem('ln.linked') ? '' : 'consent' })
  })
  useSync.setState({ linked: true })
  await sync()
}

export function disconnect() {
  if (token) window.google?.accounts?.oauth2?.revoke(token.v)
  token = null
  for (const k of ['ln.token', 'ln.linked']) localStorage.removeItem(k)
  useSync.setState({ linked: false, status: 'idle', error: undefined })
}

async function api(path: string, init: RequestInit = {}) {
  if (!hasToken()) throw new AuthError()
  const res = await fetch(path.startsWith('http') ? path : API + path, { ...init, headers: { Authorization: `Bearer ${token!.v}`, ...init.headers } })
  if (res.status === 401) { token = null; localStorage.removeItem('ln.token'); throw new AuthError() }
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 160)}`)
  return res
}
const json = async (path: string, init?: RequestInit) => (await api(path, init)).json()
const jsonBody = (body: unknown, method = 'POST'): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function multipart(meta: object, content: string): RequestInit {
  const b = 'ln' + Math.random().toString(36).slice(2)
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--`
  return { body, headers: { 'Content-Type': `multipart/related; boundary=${b}` } }
}

const q = (s: string) => encodeURIComponent(s)
async function findOne(query: string): Promise<string | undefined> {
  return (await json(`/drive/v3/files?q=${q(query + ' and trashed = false')}&fields=files(id)&spaces=drive`)).files[0]?.id
}

async function ensureDirs() {
  let root = await findOne("appProperties has { key='ln' and value='root' }")
  if (!root) root = (await json('/drive/v3/files?fields=id', jsonBody({ name: 'Logic Note', mimeType: FOLDER, appProperties: { ln: 'root' } }))).id as string
  let media = await findOne(`appProperties has { key='ln' and value='mediadir' } and '${root}' in parents`)
  if (!media) media = (await json('/drive/v3/files?fields=id', jsonBody({ name: '.media', mimeType: FOLDER, parents: [root], appProperties: { ln: 'mediadir' } }))).id as string
  // 다른 계정/새 루트면 로컬의 원격 연결 정보를 초기화 (원격에 없다고 로컬을 지우지 않도록)
  if (localStorage.getItem('ln.root') !== root) {
    await db.folders.toCollection().modify((f) => { delete f.driveId; delete f.syncedAt })
    await db.notes.toCollection().modify((n) => { delete n.driveId; delete n.syncedAt })
    await db.media.toCollection().modify((m) => { delete m.driveId })
    localStorage.setItem('ln.root', root)
  }
  return { root, media }
}

async function listAll(): Promise<DFile[]> {
  const kinds = ['folder', 'note', 'media'].map((v) => `appProperties has { key='ln' and value='${v}' }`).join(' or ')
  const out: DFile[] = []
  let page = ''
  do {
    const r = await json(`/drive/v3/files?q=${q(`(${kinds}) and trashed = false`)}&fields=nextPageToken,files(id,name,parents,mimeType,appProperties)&pageSize=1000&spaces=drive${page ? '&pageToken=' + page : ''}`)
    out.push(...r.files)
    page = r.nextPageToken
  } while (page)
  return out
}

const dirty = (x: { dirty?: number }) => !!x.dirty
const moveQs = (from: string | undefined, to: string) => (from && from !== to ? `&addParents=${to}&removeParents=${from}` : '')
const sameContent = (a: Note, b: Note) => a.title === b.title && JSON.stringify([a.nodes, a.edges]) === JSON.stringify([b.nodes, b.edges])

/** 올린 뒤: 원격 버전을 기록하고, 그 사이 다시 바뀌지 않았으면 변경 표시를 지운다 */
async function settle(table: typeof db.notes | typeof db.folders, id: string, localU: number, remoteU: number, patch: { driveId?: string }) {
  await (table as typeof db.notes).where('id').equals(id).modify((x) => {
    Object.assign(x, patch, { syncedAt: remoteU })
    if (x.updatedAt === localU) x.dirty = 0
  })
}
/** 원격 버전 번호는 항상 증가하게 (기기 간 시계 차이 대비) */
const nextU = (local: number, remote?: DFile) => Math.max(local, +(remote?.appProperties?.u ?? 0) + 1)

let running = false
export async function sync() {
  if (running) return
  if (!hasToken()) { useSync.setState({ status: localStorage.getItem('ln.linked') ? 'auth' : 'idle' }); return }
  running = true
  useSync.setState({ status: 'syncing', error: undefined })
  try {
    const dirs = await ensureDirs()
    const remote = await listAll()
    const of = (kind: string) => remote.filter((f) => f.appProperties?.ln === kind && f.appProperties.lid)
    const lidOf = new Map(remote.map((f) => [f.id, f.appProperties?.lid]))
    const byLid = new Map(remote.map((f) => [f.appProperties?.lid, f]))
    const parentLid = (f: DFile) => (f.parents?.[0] && lidOf.get(f.parents[0])) || null

    // ── 폴더: 받기
    for (const rf of of('folder')) {
      const lid = rf.appProperties!.lid, u = +rf.appProperties!.u
      const lf = await db.folders.get(lid)
      if (!lf || (u > (lf.syncedAt ?? 0) && (!dirty(lf) || u >= lf.updatedAt)))
        await db.folders.put({ id: lid, name: rf.name, parentId: parentLid(rf), createdAt: lf?.createdAt ?? u, updatedAt: u, driveId: rf.id, syncedAt: u, dirty: 0 })
    }
    // ── 폴더: 원격에서 사라진 것
    for (const lf of await db.folders.toArray())
      if (lf.driveId && !byLid.has(lf.id)) {
        if (lf.deleted || !dirty(lf)) await db.folders.delete(lf.id)
        else await db.folders.update(lf.id, { driveId: undefined })
      }
    // ── 폴더: 올리기 (부모 먼저)
    const folders = await db.folders.toArray()
    const fmap = new Map(folders.map((f) => [f.id, f]))
    const depth = (f: Folder): number => (f.parentId && fmap.get(f.parentId) ? 1 + depth(fmap.get(f.parentId)!) : 0)
    for (const lf of folders.filter((f) => !f.deleted).sort((a, b) => depth(a) - depth(b))) {
      if (lf.driveId && !dirty(lf)) continue
      const parent = (lf.parentId && (await db.folders.get(lf.parentId))?.driveId) || dirs.root
      const u = nextU(lf.updatedAt, byLid.get(lf.id))
      const meta = { name: lf.name, appProperties: { ln: 'folder', lid: lf.id, u: String(u) } }
      if (!lf.driveId) {
        const r = await json('/drive/v3/files?fields=id', jsonBody({ ...meta, mimeType: FOLDER, parents: [parent] }))
        await settle(db.folders, lf.id, lf.updatedAt, u, { driveId: r.id })
      } else {
        await api(`/drive/v3/files/${lf.driveId}?fields=id${moveQs(byLid.get(lf.id)?.parents?.[0], parent)}`, jsonBody(meta, 'PATCH'))
        await settle(db.folders, lf.id, lf.updatedAt, u, {})
      }
    }

    // ── 미디어 올리기
    for (const m of await db.media.toArray()) {
      if (m.driveId) continue
      const existing = byLid.get(m.id)
      if (existing) { await db.media.update(m.id, { driveId: existing.id }); continue }
      const meta = { name: m.id, parents: [dirs.media], appProperties: { ln: 'media', lid: m.id } }
      let r: { id: string }
      if (m.blob.size <= 5_000_000) {
        // 작은 파일: 한 번에 (multipart)
        const b = 'ln' + Math.random().toString(36).slice(2)
        const head = [`--${b}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(meta), `--${b}`, `Content-Type: ${m.type}`, '', ''].join('\r\n')
        const body = new Blob([head, m.blob, `\r\n--${b}--`])
        r = await json('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body, headers: { 'Content-Type': `multipart/related; boundary=${b}` } })
      } else {
        // 큰 영상: 이어 올리기 (resumable)
        const init = await api('/upload/drive/v3/files?uploadType=resumable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': m.type },
          body: JSON.stringify(meta),
        })
        r = await (await api(init.headers.get('Location')!, { method: 'PUT', headers: { 'Content-Type': m.type }, body: m.blob })).json()
      }
      await db.media.update(m.id, { driveId: r.id })
    }

    // ── 노트: 받기
    for (const rn of of('note')) {
      const lid = rn.appProperties!.lid, u = +rn.appProperties!.u
      const ln = await db.notes.get(lid)
      if (ln && u <= (ln.syncedAt ?? 0)) continue
      const data = (await (await api(`/drive/v3/files/${rn.id}?alt=media`)).json()) as Note
      const folderId = parentLid(rn)
      const incoming: Note = { ...data, id: lid, folderId, updatedAt: u, driveId: rn.id, syncedAt: u, dirty: 0 }
      if (ln && dirty(ln) && !ln.deleted && !sameContent(ln, incoming)) {
        // 양쪽 모두 바뀜: 진 쪽을 사본으로 남긴다
        const loser = ln.updatedAt > u ? { ...incoming, title: (data.title || '제목 없음') + ' (다른 기기)' } : { ...ln, title: (ln.title || '제목 없음') + ' (이 기기)' }
        await db.notes.add({ ...loser, id: uid(), driveId: undefined, syncedAt: undefined, updatedAt: Date.now(), dirty: 1 })
        if (ln.updatedAt > u) continue
      }
      if (ln?.deleted && ln.updatedAt > u) continue
      await db.notes.put(incoming)
      remoteEvents.dispatchEvent(new CustomEvent('note', { detail: lid }))
    }
    // ── 노트: 원격에서 사라진 것
    for (const ln of await db.notes.toArray())
      if (ln.driveId && !byLid.has(ln.id)) {
        if (ln.deleted || !dirty(ln)) await db.notes.delete(ln.id)
        else await db.notes.update(ln.id, { driveId: undefined })
      }
    // ── 노트: 올리기 / 삭제 반영
    for (const ln of await db.notes.toArray()) {
      if (ln.deleted) {
        if (ln.driveId) await api(`/drive/v3/files/${ln.driveId}`, jsonBody({ trashed: true }, 'PATCH'))
        await db.notes.delete(ln.id)
        continue
      }
      if (ln.driveId && !dirty(ln)) continue
      const folder = ln.folderId ? await db.folders.get(ln.folderId) : undefined
      const parent = folder?.driveId || dirs.root
      const { driveId, syncedAt, dirty: _d, ...payload } = ln
      const u = nextU(ln.updatedAt, byLid.get(ln.id))
      const meta = { name: (ln.title || '제목 없음') + '.lnote', appProperties: { ln: 'note', lid: ln.id, u: String(u) } }
      const content = JSON.stringify(payload)
      if (!driveId) {
        const r = await json('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', ...multipart({ ...meta, mimeType: 'application/json', parents: [parent] }, content) })
        await settle(db.notes, ln.id, ln.updatedAt, u, { driveId: r.id })
      } else {
        await api(`/upload/drive/v3/files/${driveId}?uploadType=multipart&fields=id${moveQs(byLid.get(ln.id)?.parents?.[0], parent)}`, { method: 'PATCH', ...multipart(meta, content) })
        await settle(db.notes, ln.id, ln.updatedAt, u, {})
      }
    }
    // ── 폴더 삭제 반영 (노트를 먼저 옮긴 뒤)
    for (const lf of (await db.folders.toArray()).filter((f) => f.deleted)) {
      if (lf.driveId) await api(`/drive/v3/files/${lf.driveId}`, jsonBody({ trashed: true }, 'PATCH'))
      await db.folders.delete(lf.id)
    }
    // ── 이 기기에 없는 미디어 받기
    const needed = new Set((await db.notes.toArray()).flatMap((n) => n.nodes.flatMap((x) => x.data.media?.map((m) => m.mediaId) ?? [])))
    for (const id of needed) {
      const f = byLid.get(id)
      if (!f || (await db.media.get(id))) continue
      const blob = await (await api(`/drive/v3/files/${f.id}?alt=media`)).blob()
      await db.media.put({ id, blob, type: blob.type || f.mimeType || '', driveId: f.id })
    }
    useSync.setState({ status: 'idle', last: Date.now() })
  } catch (e) {
    if (e instanceof AuthError) useSync.setState({ status: 'auth' })
    else useSync.setState({ status: 'error', error: (e as Error).message })
  } finally {
    running = false
  }
}

let timer: ReturnType<typeof setTimeout>
export function scheduleSync(delay = 4000) {
  if (!localStorage.getItem('ln.linked')) return
  clearTimeout(timer)
  timer = setTimeout(sync, delay)
}

export function initSync() {
  onLocalChange(() => scheduleSync())
  if (!localStorage.getItem('ln.linked')) return
  useSync.setState({ linked: true })
  scheduleSync(800)
  setInterval(() => scheduleSync(0), 3 * 60_000)
  addEventListener('focus', () => scheduleSync(1000))
}
