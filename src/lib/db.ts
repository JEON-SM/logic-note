import Dexie, { type EntityTable } from 'dexie'
import type { Folder, LinkMeta, Note } from './types'

export interface MediaRec { id: string; blob: Blob; type: string; driveId?: string }
export interface PreviewRec { url: string; data: LinkMeta | null; at: number }

export const db = new Dexie('logic-note') as Dexie & {
  folders: EntityTable<Folder, 'id'>
  notes: EntityTable<Note, 'id'>
  media: EntityTable<MediaRec, 'id'>
  previews: EntityTable<PreviewRec, 'url'>
}
db.version(1).stores({ folders: 'id, parentId', notes: 'id, folderId, updatedAt', media: 'id', previews: 'url' })

export const uid = () => crypto.randomUUID()

// 동기화 모듈이 로컬 변경을 감지하도록
let listener = () => {}
export const onLocalChange = (fn: () => void) => { listener = fn }
const changed = () => listener()

export async function createFolder(name: string, parentId: string | null) {
  const t = Date.now()
  const f: Folder = { id: uid(), name, parentId, createdAt: t, updatedAt: t, dirty: 1 }
  await db.folders.add(f)
  changed()
  return f
}

export async function updateFolder(id: string, patch: Partial<Folder>) {
  await db.folders.update(id, { ...patch, updatedAt: Date.now(), dirty: 1 })
  changed()
}

/** 폴더와 하위 폴더를 지우고, 안의 노트는 휴지통으로 */
export async function deleteFolder(id: string) {
  const all = await db.folders.toArray()
  const ids = new Set([id])
  for (let grew = true; grew;) {
    grew = false
    for (const f of all) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true }
  }
  const t = Date.now()
  await db.transaction('rw', db.folders, db.notes, async () => {
    for (const f of all.filter((f) => ids.has(f.id))) {
      if (f.driveId) await db.folders.update(f.id, { deleted: 1, updatedAt: t, dirty: 1 })
      else await db.folders.delete(f.id)
    }
    await db.notes.where('folderId').anyOf([...ids]).modify({ trashed: 1, folderId: null, updatedAt: t, dirty: 1 })
  })
  changed()
}

export async function createNote(folderId: string | null) {
  const t = Date.now()
  const n: Note = { id: uid(), folderId, title: '', nodes: [], edges: [], createdAt: t, updatedAt: t, dirty: 1 }
  await db.notes.add(n)
  changed()
  return n
}

export async function updateNote(id: string, patch: Partial<Note>, touch = true) {
  await db.notes.update(id, touch ? { ...patch, updatedAt: Date.now(), dirty: 1 } : patch)
  if (touch) changed()
}

export async function duplicateNote(id: string) {
  const n = await db.notes.get(id)
  if (!n) return
  const t = Date.now()
  await db.notes.add({ ...n, id: uid(), title: (n.title || '제목 없음') + ' 사본', createdAt: t, updatedAt: t, dirty: 1, driveId: undefined, syncedAt: undefined })
  changed()
}

/** 영구 삭제: 동기화된 적 있으면 묘비만 남겨 원격에서도 지우게 한다 */
export async function purgeNote(id: string) {
  const n = await db.notes.get(id)
  if (!n) return
  if (n.driveId) await db.notes.put({ ...n, deleted: 1, nodes: [], edges: [], updatedAt: Date.now(), dirty: 1 })
  else await db.notes.delete(id)
  changed()
}

export async function emptyTrash() {
  const ids = (await db.notes.toArray()).filter((n) => n.trashed && !n.deleted).map((n) => n.id)
  for (const id of ids) await purgeNote(id)
}

export async function restoreNote(id: string) {
  const n = await db.notes.get(id)
  if (!n) return
  const folder = n.folderId ? await db.folders.get(n.folderId) : null
  await updateNote(id, { trashed: 0, folderId: folder && !folder.deleted ? folder.id : null })
}

const blobToDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) })

export async function exportAll() {
  const media = await Promise.all((await db.media.toArray()).map(async (m) => ({ id: m.id, type: m.type, data: await blobToDataUrl(m.blob) })))
  const folders = (await db.folders.toArray()).filter((f) => !f.deleted)
  const notes = (await db.notes.toArray()).filter((n) => !n.deleted)
  return new Blob([JSON.stringify({ app: 'logic-note', v: 1, folders, notes, media })], { type: 'application/json' })
}

export async function importAll(file: File) {
  const data = JSON.parse(await file.text())
  if (data.app !== 'logic-note') throw new Error('Logic Note 백업 파일이 아닙니다.')
  const strip = <T extends { driveId?: string; syncedAt?: number }>(x: T) => ({ ...x, dirty: 1, driveId: undefined, syncedAt: undefined })
  await db.transaction('rw', db.folders, db.notes, db.media, async () => {
    await db.folders.bulkPut(data.folders.map(strip))
    await db.notes.bulkPut(data.notes.map(strip))
    for (const m of data.media) await db.media.put({ id: m.id, type: m.type, blob: await (await fetch(m.data)).blob() })
  })
  changed()
}

export const plain = (html: string) =>
  html.replace(/<\/(p|li|div)>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()

export const noteText = (n: Note) => n.title + ' ' + n.nodes.map((x) => plain(x.data.title) + ' ' + plain(x.data.body)).join(' ')
