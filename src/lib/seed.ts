import { highlightAttrs } from './color'
import { db } from './db'
import { t } from './i18n'
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

/** 처음 실행할 때 둘러보기 노트를 만든다 (화면 언어로) */
export async function seedIfEmpty() {
  if (localStorage.getItem('ln.seeded') || (await db.notes.count())) return
  localStorage.setItem('ln.seeded', '1')
  const now = Date.now(), p = (s: string) => `<p>${t(s)}</p>`
  await db.folders.add({ id: 'start', name: t('시작하기'), parentId: null, createdAt: now, updatedAt: now })
  await db.notes.add({
    id: 'welcome', folderId: 'start', title: t('Logic Note 둘러보기'), createdAt: now, updatedAt: now, bg: 'grid',
    nodes: [
      box('a', -170, -170, { title: p('대전제'), body: p('모든 사람은 죽는다') }),
      box('b', 170, -170, { title: p('소전제'), body: p('소크라테스는 사람이다') }),
      box('c', 0, 0, { shape: 'diamond', title: p('타당한가?') }),
      box('d', 0, 175, { shape: 'rect', title: p('결론'), body: `<p>${t('소크라테스는')} ${hl(t('죽는다'), '#FFF176')}</p>`, fill: '#DDF3E4', stroke: '#30A46C' }),
      box('e', 290, 0, { shape: 'ellipse', title: p('다시 검토'), dash: 'dashed' }),
      box('tip', -400, 20, {
        shape: 'memo', fill: '#FFF4C2', dash: 'none', w: 220, h: 176,
        title: p('사용법'),
        body: `<ul>${['빈 곳 두 번 눌러 상자', '상자 두 번 눌러 편집', '테두리를 두 번 눌러 점을 만들고 끌어서 연결', 'Tab: 이어지는 상자'].map((s) => `<li>${p(s)}</li>`).join('')}</ul>`,
      }),
    ],
    edges: [
      link('a', 'b', 'c', 't'),
      link('b', 'b', 'c', 't'),
      link('c', 'b', 'd', 't', { label: t('예') }),
      link('c', 'r', 'e', 'l', { label: t('아니오'), dashed: true }),
    ],
  })
}
