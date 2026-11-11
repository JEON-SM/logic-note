// 상자 글: 예전 노트(제목 칸 + 설명 칸)를 한 칸 글로 바꾸고, 내보낼 때는 제목 줄을 다시 나눈다
import { normalizeShape } from './shapes'
import type { BoxData, BoxNode } from './types'

/**
 * 예전 상자 → 지금 상자. 제목은 글 맨 앞 단락이 되고 '제목 줄' 서식이 켜진다(보이는 모양은 그대로).
 * 둥근 사각형은 각진 사각형, 줄 메모지는 메모지 + 줄 서식. 바뀐 게 없으면 같은 객체를 돌려준다
 */
export function upgradeBox(d: BoxData): BoxData {
  const { shape, rule } = normalizeShape(d.shape)
  const title = d.title ?? ''
  if (!title && shape === d.shape && d.body !== undefined) return d
  return {
    ...d, shape,
    ...(rule && !d.rule && { rule }),
    title: '',
    body: title + (d.body ?? ''),
    ...(title && { head: true }),
  }
}

export function upgradeNodes(nodes: BoxNode[]) {
  let changed = false
  const out = nodes.map((n) => {
    const d = upgradeBox(n.data)
    if (d === n.data) return n
    changed = true
    return { ...n, data: d }
  })
  return changed ? out : nodes
}

/** 내보내기용: 제목 줄(HTML)과 나머지. '제목 줄' 서식이 아니면 제목은 비어 있다 */
export function boxParts(d: Pick<BoxData, 'title' | 'body' | 'head'>) {
  if (d.title) return { title: d.title, body: d.body }
  if (!d.head || !d.body) return { title: '', body: d.body ?? '' }
  const doc = new DOMParser().parseFromString(`<body>${d.body}</body>`, 'text/html').body
  const first = doc.firstElementChild
  if (!first) return { title: '', body: d.body }
  first.remove()
  return { title: first.outerHTML, body: doc.innerHTML }
}
