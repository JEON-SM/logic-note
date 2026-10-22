import { highlightAttrs } from './color'
import { db } from './db'
import { defaultBox, defaultEdge } from './shapes'
import type { BoxData, BoxNode, EdgeData, LogicEdge } from './types'

const hl = (text: string, c: string) => {
  const a = highlightAttrs(c)
  return `<mark data-color="${a['data-color']}" class="hl" data-tl="${a['data-tl']}" data-td="${a['data-td']}" style="${a.style}">${text}</mark>`
}
const box = (id: string, x: number, y: number, d: Partial<BoxData>): BoxNode => ({ id, type: 'box', position: { x, y }, data: { ...defaultBox('round'), ...d } })
const link = (source: string, sh: string, target: string, th: string, d: Partial<EdgeData> = {}): LogicEdge => ({
  id: `${source}-${target}`, type: 'logic', source, sourceHandle: sh, target, targetHandle: th, data: { ...defaultEdge(), ...d },
})

/** 처음 실행할 때 둘러보기 노트를 만든다 */
export async function seedIfEmpty() {
  if (localStorage.getItem('ln.seeded') || (await db.notes.count())) return
  localStorage.setItem('ln.seeded', '1')
  const t = Date.now()
  await db.folders.add({ id: 'start', name: '시작하기', parentId: null, createdAt: t, updatedAt: t })
  await db.notes.add({
    id: 'welcome', folderId: 'start', title: 'Logic Note 둘러보기', createdAt: t, updatedAt: t, bg: 'grid',
    nodes: [
      box('a', -170, -170, { title: '<p>대전제</p>', body: '<p>모든 사람은 죽는다</p>' }),
      box('b', 170, -170, { title: '<p>소전제</p>', body: '<p>소크라테스는 사람이다</p>' }),
      box('c', 0, 0, { shape: 'diamond', title: '<p>타당한가?</p>' }),
      box('d', 0, 175, { shape: 'rect', title: '<p>결론</p>', body: `<p>소크라테스는 ${hl('죽는다', '#FFF176')}</p>`, fill: '#DDF3E4', stroke: '#30A46C' }),
      box('e', 290, 0, { shape: 'ellipse', title: '<p>다시 검토</p>', dash: 'dashed' }),
      box('tip', -400, 20, {
        shape: 'rect', fill: '#FFF4C2', dash: 'none', wrap: 190,
        title: '<p style="text-align: left">사용법</p>',
        body: '<ul><li><p>빈 곳 두 번 눌러 상자</p></li><li><p>상자 두 번 눌러 편집</p></li><li><p>가장자리 점을 끌어 연결</p></li><li><p>Tab: 이어지는 상자</p></li></ul>',
      }),
    ],
    edges: [
      link('a', 'b', 'c', 't'),
      link('b', 'b', 'c', 't'),
      link('c', 'b', 'd', 't', { label: '예' }),
      link('c', 'r', 'e', 'l', { label: '아니오', dashed: true }),
    ],
  })
}
