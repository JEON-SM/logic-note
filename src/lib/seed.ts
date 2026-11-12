import { highlightAttrs } from './color'
import { db, uid } from './db'
import { t } from './i18n'
import { MEMO, defaultBox, defaultEdge } from './shapes'
import type { BoxData, BoxNode, EdgeData, LogicEdge, Note } from './types'

/** 둘러보기 판. 올리면 예전 둘러보기를 새것으로 바꾼다 (예전 것은 휴지통에) */
const TOUR = 2

const hl = (text: string, c: string) => {
  const a = highlightAttrs(c)
  return `<mark data-color="${a['data-color']}" class="hl" data-tl="${a['data-tl']}" data-td="${a['data-td']}" style="${a.style}">${text}</mark>`
}
const p = (s: string) => `<p>${t(s)}</p>`
/** 왼쪽 맞춤 글줄 (사각형 상자는 가운데 맞춤이 기본) */
const L = (s: string) => `<p style="text-align: left">${t(s)}</p>`
const list = (items: string[], line = L) => `<ul>${items.map((s) => `<li>${line(s)}</li>`).join('')}</ul>`
/** x, y는 왼쪽 위 모서리 (상자 자리는 가운데로 저장한다). 크기는 정해 둔다: 넘치는 글은 상자 안에서 스크롤 */
const box = (id: string, x: number, y: number, w: number, h: number, d: Partial<BoxData>): BoxNode =>
  ({ id, type: 'box', position: { x: x + w / 2, y: y + h / 2 }, data: { ...defaultBox('rect'), w, h, ...d } })
const link = (source: string, sh: string, target: string, th: string, d: Partial<EdgeData> = {}): LogicEdge => ({
  id: `${source}-${target}`, type: 'logic', source, sourceHandle: sh, target, targetHandle: th, data: { ...defaultEdge(), ...d },
})

/** 새 기능을 한 장에: 왼쪽 사용법, 가운데 상자 안의 예시, 오른쪽 리본·단축키·무늬 */
function tour(): Pick<Note, 'title' | 'bg' | 'nodes' | 'edges'> {
  const set = { parent: 'set' }
  return {
    title: t('Logic Note 둘러보기'), bg: 'grid',
    nodes: [
      box('tip', -552, -240, 264, 360, {
        shape: 'memo', fill: MEMO.fill, dash: 'none', head: true, valign: 'top',
        body: p('사용법') + list([
          '빈 곳을 끌어서 상자 그리기', '상자를 고르고 바로 타자 (Enter·F2: 편집, Esc: 끝)', '넘치는 글은 상자 안에서 스크롤',
          '테두리를 두 번 눌러 점을 만들고 끌어서 연결', 'Tab: 이어지는 상자 · 방향키: 옆 상자', '휠: 스크롤 · Ctrl+휠: 확대',
          '스페이스나 가운데 버튼을 누른 채 끌면 화면 이동',
        ], p),
      }),
      box('set', -240, -240, 552, 456, { head: true, valign: 'top', body: p('예시: 삼단논법') + `<p>${t('안의 상자는 자유롭게 움직여요. 밖으로 끌어내면 빠져요')}</p>` }),
      box('a', -216, -168, 192, 72, { ...set, head: true, body: p('대전제') + p('모든 사람은 죽는다') }),
      box('b', 24, -168, 192, 72, { ...set, head: true, body: p('소전제') + p('소크라테스는 사람이다') }),
      box('c', -84, -48, 168, 96, { ...set, shape: 'diamond', body: p('타당한가?') }),
      box('d', -96, 120, 192, 72, { ...set, head: true, fill: '#DDF3E4', stroke: '#30A46C', body: p('결론') + `<p>${t('소크라테스는')} ${hl(t('죽는다'), '#FFF176')}</p>` }),
      box('e', 156, -36, 144, 72, { ...set, shape: 'ellipse', dash: 'dashed', body: p('다시 검토') }),
      box('arrange', -240, 240, 552, 72, {
        dash: 'none', body: p('배치 탭: 맞춤 · 간격 똑같이 · 같은 크기 · 맨 앞으로') + p('모눈에 맞추기는 배치·보기 탭에서 켜고 꺼요 (Alt: 반대로)'),
      }),
      box('ribbon', 360, -240, 264, 192, {
        head: true, valign: 'top', fill: '#DCEEFF', stroke: '#0090FF',
        body: L('리본') + list(['빠른 도구: 고른 것에 따라 바뀌는 한 줄', '홈 · 삽입 · 상자 · 선 · 배치 · 보기', '서식 복사: 한 상자의 모양을 다른 상자에', 'Ctrl+F1: 리본 접기·펼치기']),
      }),
      box('keys', 360, -24, 264, 144, {
        head: true, rule: 'lines', fill: '#FFE8D7', stroke: '#F76B15',
        body: L('단축키 (안에서 스크롤 ↓)') + list([
          'Enter·F2: 편집 · Esc: 끝내기', '방향키: 옆 상자 고르기', 'Alt+방향키: 조금씩 옮기기', 'Ctrl+B·I·U: 굵게·기울임·밑줄',
          'Shift·Ctrl+클릭: 여러 개 고르기', 'Ctrl+D: 복제 · Ctrl+G: 묶기', 'Delete: 지우기 · Ctrl+Z: 되돌리기',
        ]),
      }),
      box('rules', 360, 144, 264, 48, { dash: 'none', body: p('상자 무늬 (상자 탭)') }),
      box('r1', 360, 192, 80, 72, { rule: 'lines', body: p('줄') }),
      box('r2', 452, 192, 80, 72, { rule: 'grid', body: p('모눈') }),
      box('r3', 544, 192, 80, 72, { rule: 'dots', body: p('점') }),
    ],
    edges: [
      link('a', 'b', 'c', 't'),
      link('b', 'b', 'c', 't'),
      link('c', 'b', 'd', 't', { label: t('예') }),
      link('c', 'r', 'e', 'l', { label: t('아니오'), dashed: true }),
    ],
  }
}

/**
 * 처음 실행할 때 둘러보기 노트를 만든다 (화면 언어로).
 * 예전 둘러보기가 있으면 새 판으로 바꾸고, 예전 것은 휴지통에 넣어 둔다 (되살릴 수 있게)
 */
export async function seedIfEmpty() {
  if (+(localStorage.getItem('ln.tour') ?? 0) >= TOUR) return
  const seeded = localStorage.getItem('ln.seeded'), count = await db.notes.count()
  localStorage.setItem('ln.tour', String(TOUR))
  localStorage.setItem('ln.seeded', '1')
  const now = Date.now()
  if (!seeded && !count) {
    await db.folders.add({ id: 'start', name: t('시작하기'), parentId: null, createdAt: now, updatedAt: now })
    await db.notes.add({ id: 'welcome', folderId: 'start', createdAt: now, updatedAt: now, ...tour() })
    return
  }
  const old = await db.notes.get('welcome')
  if (!old || old.deleted || old.trashed) return
  await db.notes.add({ ...old, id: uid(), title: old.title + t(' (이전)'), trashed: 1, updatedAt: now, dirty: 1, driveId: undefined, syncedAt: undefined })
  await db.notes.put({
    ...old, ...tour(), updatedAt: now, dirty: 1,
    viewport: undefined, dots: undefined, ground: null, mode: null, paper: null, defaults: null,
  })
}
