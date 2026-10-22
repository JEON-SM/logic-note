import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from './db'
import { useSettings } from './store'
import type { LinkMeta, MediaItem } from './types'

async function shrinkImage(file: File, max = 2000): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
  if (s === 1 && file.size < 1_500_000) return file
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * s)
  c.height = Math.round(bmp.height * s)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/webp', 0.88))
}

export async function addMediaFile(file: File): Promise<MediaItem | null> {
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null
  if (!kind) return null
  const blob = kind === 'image' ? await shrinkImage(file) : file
  const mediaId = uid()
  await db.media.put({ id: mediaId, blob, type: blob.type || file.type })
  return { id: uid(), kind, mediaId }
}

export const pickFiles = (accept: string) =>
  new Promise<File[]>((res) => {
    const i = Object.assign(document.createElement('input'), { type: 'file', accept, multiple: true })
    i.onchange = () => res([...(i.files ?? [])])
    i.click()
  })

const urls = new Map<string, string>()
export const useMediaUrl = (id: string) =>
  useLiveQuery(async () => {
    if (urls.has(id)) return urls.get(id)
    const r = await db.media.get(id)
    if (!r) return undefined
    const u = URL.createObjectURL(r.blob)
    urls.set(id, u)
    return u
  }, [id])

export const youtubeId = (url: string) =>
  url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1] ?? null

export const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim())

// 링크 미리보기: microlink.io (CORS 허용, 무료 한도 있음) 결과를 IndexedDB에 캐시
const inflight = new Set<string>()
async function fetchPreview(url: string) {
  if (inflight.has(url)) return
  inflight.add(url)
  try {
    const r = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url))
    if (r.status === 429) return
    const j = await r.json()
    const d = j.data
    const data: LinkMeta | null = j.status === 'success' && d?.title
      ? { title: d.title, description: d.description, image: d.image?.url, logo: d.logo?.url, site: d.publisher }
      : null
    await db.previews.put({ url, data, at: Date.now() })
  } catch { /* 오프라인 등: 다음에 다시 시도 */ } finally { inflight.delete(url) }
}

export function usePreview(url: string) {
  const enabled = useSettings((s) => s.previews)
  return useLiveQuery(async () => {
    const r = await db.previews.get(url)
    if (r) return r.data
    if (enabled) setTimeout(() => fetchPreview(url))
    return undefined
  }, [url, enabled])
}
