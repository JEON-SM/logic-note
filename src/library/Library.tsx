import { useMemo, useState, type DragEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronRight, Copy, Folder as FolderIcon, FolderInput, FolderPlus, Menu as MenuIcon, Moon, MoreVertical, NotebookText,
  Pencil, Plus, RotateCcw, Search, Settings, SortAsc, Star, Sun, Trash2, X,
} from 'lucide-react'
import { createFolder, createNote, db, deleteFolder, duplicateNote, emptyTrash, noteText, purgeNote, restoreNote, updateFolder, updateNote } from '../lib/db'
import { go, setSettings, useSettings, useTheme, type Route } from '../lib/store'
import type { Folder, Note } from '../lib/types'
import { cls, IB, Item, Logo, Menu, MenuSep } from '../ui/kit'
import { confirmDanger, pickFolder, promptText } from '../ui/Dialogs'
import { openSettings, SyncButton } from '../ui/Settings'
import { NoteThumb } from './NoteThumb'

const DRAG = 'application/x-ln-note'
const fmtDate = (t: number) => {
  const d = new Date(t), now = new Date()
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('ko-KR', { year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric', month: 'short', day: 'numeric' })
}

async function newFolder(parentId: string | null) {
  const name = await promptText(parentId ? '새 하위 폴더' : '새 폴더', '', '만들기')
  if (!name) return
  const f = await createFolder(name, parentId)
  if (parentId) setSettings({ expanded: [...new Set([...useSettings.getState().expanded, parentId])] })
  go('#/f/' + f.id)
}

function onDropNote(e: DragEvent, folderId: string | null) {
  const id = e.dataTransfer.getData(DRAG)
  if (!id) return
  e.preventDefault()
  updateNote(id, { folderId, trashed: 0 })
}
const allowDrop = (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAG)) e.preventDefault() }

export function Library({ route }: { route: Route }) {
  const folders = useLiveQuery(() => db.folders.toArray(), [])?.filter((f) => !f.deleted) ?? []
  const notes = useLiveQuery(() => db.notes.toArray(), [])?.filter((n) => !n.deleted) ?? []
  const [drawer, setDrawer] = useState(false)
  const [query, setQuery] = useState<string | null>(null)
  const sort = useSettings((s) => s.sort)
  const theme = useTheme()

  const folder = route.name === 'folder' ? folders.find((f) => f.id === route.id) : undefined
  const path = useMemo(() => {
    const out: Folder[] = []
    for (let f = folder; f; f = folders.find((x) => x.id === f!.parentId)) out.unshift(f)
    return out
  }, [folder, folders])

  const live = notes.filter((n) => !n.trashed)
  let shown: Note[] =
    route.name === 'trash' ? notes.filter((n) => n.trashed)
    : route.name === 'fav' ? live.filter((n) => n.favorite)
    : route.name === 'folder' ? live.filter((n) => n.folderId === route.id)
    : live
  const q = query?.trim().toLowerCase()
  if (q) shown = shown.filter((n) => noteText(n).toLowerCase().includes(q))
  shown = [...shown].sort((a, b) =>
    sort === 'title' ? (a.title || '').localeCompare(b.title || '') : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt)
  const subfolders = route.name === 'folder' && !q ? folders.filter((f) => f.parentId === route.id).sort((a, b) => a.name.localeCompare(b.name)) : []

  const title = route.name === 'trash' ? '휴지통' : route.name === 'fav' ? '즐겨찾기' : folder?.name ?? '모든 노트'
  const add = async () => { const n = await createNote(route.name === 'folder' ? route.id : null); go('#/n/' + n.id) }

  return (
    <div className="lib">
      <Sidebar route={route} folders={folders} notes={live} open={drawer} onClose={() => setDrawer(false)} trashCount={notes.length - live.length} />
      <main className="lib-main">
        <header className="bar">
          <IB label="메뉴" className="only-narrow" onClick={() => setDrawer(true)}><MenuIcon size={20} strokeWidth={1.6} /></IB>
          {query === null ? (
            <div className="crumbs">
              {path.length > 1 && path.slice(0, -1).map((f) => (
                <span key={f.id}><a href={'#/f/' + f.id}>{f.name}</a><ChevronRight size={14} /></span>
              ))}
              <h1>{title}</h1>
              <span className="count">{shown.length}</span>
            </div>
          ) : (
            <div className="search">
              <Search size={16} strokeWidth={1.6} />
              <input autoFocus placeholder="노트 검색" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery(null)} />
              <IB label="검색 닫기" onClick={() => setQuery(null)}><X size={16} /></IB>
            </div>
          )}
          <span className="grow" />
          {query === null && <IB label="검색" onClick={() => setQuery('')}><Search size={18} strokeWidth={1.6} /></IB>}
          <Menu align="end" trigger={<IB label="정렬"><SortAsc size={18} strokeWidth={1.6} /></IB>}>
            <Item checked={sort === 'updated'} onSelect={() => setSettings({ sort: 'updated' })}>수정한 날짜</Item>
            <Item checked={sort === 'created'} onSelect={() => setSettings({ sort: 'created' })}>만든 날짜</Item>
            <Item checked={sort === 'title'} onSelect={() => setSettings({ sort: 'title' })}>제목</Item>
          </Menu>
          <SyncButton />
          {route.name === 'trash' && shown.length > 0 && (
            <button className="btn" onClick={async () => (await confirmDanger('휴지통을 비울까요?', '노트가 영구적으로 삭제됩니다.', '비우기')) && emptyTrash()}>비우기</button>
          )}
        </header>

        <section className="grid">
          {subfolders.map((f) => (
            <a key={f.id} href={'#/f/' + f.id} className="card folder-card" onDragOver={allowDrop} onDrop={(e) => onDropNote(e, f.id)}>
              <div className="thumb folder-thumb"><FolderIcon size={30} strokeWidth={1.2} /></div>
              <div className="card-meta"><div className="card-title">{f.name}</div>
                <div className="card-sub">{live.filter((n) => n.folderId === f.id).length}개 노트</div></div>
            </a>
          ))}
          {shown.map((n) => <NoteCard key={n.id} note={n} theme={theme} trash={route.name === 'trash'} folderName={route.name !== 'folder' ? folders.find((f) => f.id === n.folderId)?.name : undefined} />)}
        </section>

        {!shown.length && !subfolders.length && (
          <div className="empty">
            <NotebookText size={28} strokeWidth={1.2} />
            <p>{q ? '검색 결과가 없습니다' : route.name === 'trash' ? '휴지통이 비어 있습니다' : '노트가 없습니다'}</p>
          </div>
        )}
        {route.name !== 'trash' && <button className="fab" title="새 노트" aria-label="새 노트" onClick={add}><Plus size={26} strokeWidth={1.8} /></button>}
      </main>
    </div>
  )
}

function NoteCard({ note, theme, trash, folderName }: { note: Note; theme: 'light' | 'dark'; trash: boolean; folderName?: string }) {
  const [menu, setMenu] = useState(false)
  const open = () => !trash && go('#/n/' + note.id)
  return (
    <div className={cls('card', menu && 'menu-open')} draggable={!trash} onDragStart={(e) => e.dataTransfer.setData(DRAG, note.id)}
      onContextMenu={(e) => { e.preventDefault(); setMenu(true) }}>
      <button className={cls('thumb', 'bgp-' + (note.bg ?? 'grid'))} onClick={open} aria-label={note.title || '제목 없음'}>
        <NoteThumb note={note} theme={theme} />
      </button>
      <div className="card-meta">
        <div className="card-title" onClick={open}>{note.favorite ? <Star size={12} className="fav" fill="currentColor" /> : null}{note.title || '제목 없음'}</div>
        <div className="card-sub">{fmtDate(note.updatedAt)}{folderName && <> · {folderName}</>}</div>
      </div>
      <Menu open={menu} onOpenChange={setMenu} align="end" trigger={<IB label="더보기" className="card-more"><MoreVertical size={16} /></IB>}>
        {trash ? (<>
          <Item icon={<RotateCcw size={15} />} onSelect={() => restoreNote(note.id)}>복원</Item>
          <Item icon={<Trash2 size={15} />} danger onSelect={async () => (await confirmDanger('영구 삭제할까요?', '되돌릴 수 없습니다.')) && purgeNote(note.id)}>영구 삭제</Item>
        </>) : (<>
          <Item icon={<Star size={15} />} onSelect={() => updateNote(note.id, { favorite: note.favorite ? 0 : 1 })}>{note.favorite ? '즐겨찾기 해제' : '즐겨찾기'}</Item>
          <Item icon={<Pencil size={15} />} onSelect={async () => { const t = await promptText('이름 변경', note.title); if (t) updateNote(note.id, { title: t }) }}>이름 변경</Item>
          <Item icon={<FolderInput size={15} />} onSelect={async () => { const f = await pickFolder('이동할 폴더'); if (f !== undefined) updateNote(note.id, { folderId: f }) }}>이동</Item>
          <Item icon={<Copy size={15} />} onSelect={() => duplicateNote(note.id)}>복제</Item>
          <MenuSep />
          <Item icon={<Trash2 size={15} />} danger onSelect={() => updateNote(note.id, { trashed: 1 })}>삭제</Item>
        </>)}
      </Menu>
    </div>
  )
}

function Sidebar({ route, folders, notes, open, onClose, trashCount }: {
  route: Route; folders: Folder[]; notes: Note[]; open: boolean; onClose: () => void; trashCount: number
}) {
  const theme = useTheme()
  const nav = (name: Route['name'], hash: string, icon: React.ReactNode, label: string, count?: number) => (
    <a href={hash} className={cls('nav', route.name === name && 'on')} onClick={onClose}
      onDragOver={name === 'all' ? allowDrop : undefined} onDrop={name === 'all' ? (e) => onDropNote(e, null) : undefined}>
      {icon}<span>{label}</span>{count ? <span className="count">{count}</span> : null}
    </a>
  )
  return (
    <>
      <div className={cls('scrim', open && 'show')} onClick={onClose} />
      <aside className={cls('side', open && 'open')}>
        <div className="brand"><Logo size={26} /><span>Logic Note</span></div>
        <nav>
          {nav('all', '#/', <NotebookText size={18} strokeWidth={1.6} />, '모든 노트', notes.length)}
          {nav('fav', '#/fav', <Star size={18} strokeWidth={1.6} />, '즐겨찾기', notes.filter((n) => n.favorite).length)}
          {nav('trash', '#/trash', <Trash2 size={18} strokeWidth={1.6} />, '휴지통', trashCount)}
        </nav>
        <div className="side-head"><span>폴더</span><IB label="새 폴더" onClick={() => newFolder(null)}><FolderPlus size={16} strokeWidth={1.6} /></IB></div>
        <div className="tree">
          <FolderTree parent={null} depth={0} folders={folders} notes={notes} route={route} onPick={onClose} />
          {!folders.length && <p className="tree-empty">폴더가 없습니다</p>}
        </div>
        <div className="side-foot">
          <IB label="설정" onClick={openSettings}><Settings size={18} strokeWidth={1.6} /></IB>
          <IB label={theme === 'dark' ? '라이트 모드' : '다크 모드'} onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}>
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.6} /> : <Moon size={18} strokeWidth={1.6} />}
          </IB>
        </div>
      </aside>
    </>
  )
}

function FolderTree({ parent, depth, folders, notes, route, onPick }: {
  parent: string | null; depth: number; folders: Folder[]; notes: Note[]; route: Route; onPick: () => void
}) {
  const expanded = useSettings((s) => s.expanded)
  const kids = folders.filter((f) => f.parentId === parent).sort((a, b) => a.name.localeCompare(b.name))
  const toggle = (id: string) => setSettings({ expanded: expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id] })
  return (
    <>
      {kids.map((f) => {
        const hasKids = folders.some((x) => x.parentId === f.id)
        const isOpen = expanded.includes(f.id)
        return (
          <div key={f.id}>
            <div className={cls('tree-row', route.name === 'folder' && route.id === f.id && 'on')} style={{ paddingLeft: 8 + depth * 14 }}
              onDragOver={allowDrop} onDrop={(e) => onDropNote(e, f.id)}>
              <button className={cls('chev', isOpen && 'open', !hasKids && 'hide')} onClick={() => toggle(f.id)} aria-label="펼치기"><ChevronRight size={14} /></button>
              <a href={'#/f/' + f.id} onClick={onPick}><FolderIcon size={16} strokeWidth={1.6} /><span>{f.name}</span></a>
              <span className="count">{notes.filter((n) => n.folderId === f.id).length || ''}</span>
              <Menu align="end" trigger={<IB label="폴더 메뉴" className="row-more"><MoreVertical size={14} /></IB>}>
                <Item icon={<FolderPlus size={15} />} onSelect={() => newFolder(f.id)}>하위 폴더 만들기</Item>
                <Item icon={<Pencil size={15} />} onSelect={async () => { const n = await promptText('폴더 이름', f.name); if (n) updateFolder(f.id, { name: n }) }}>이름 변경</Item>
                <Item icon={<FolderInput size={15} />} onSelect={async () => {
                  const to = await pickFolder('이동할 위치', f.id)
                  if (to === undefined) return
                  // 자기 하위 폴더 안으로는 옮길 수 없다
                  for (let p = to; p; p = folders.find((x) => x.id === p)?.parentId ?? null) if (p === f.id) return
                  updateFolder(f.id, { parentId: to })
                }}>이동</Item>
                <MenuSep />
                <Item icon={<Trash2 size={15} />} danger onSelect={async () => {
                  if (!(await confirmDanger(`'${f.name}' 폴더를 삭제할까요?`, '하위 폴더도 함께 삭제되고, 안의 노트는 휴지통으로 이동합니다.'))) return
                  await deleteFolder(f.id)
                  if (route.name === 'folder') go('#/')
                }}>삭제</Item>
              </Menu>
            </div>
            {hasKids && isOpen && <FolderTree parent={f.id} depth={depth + 1} folders={folders} notes={notes} route={route} onPick={onPick} />}
          </div>
        )
      })}
    </>
  )
}
