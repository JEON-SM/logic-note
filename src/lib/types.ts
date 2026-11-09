import type { Node, Edge, Viewport } from '@xyflow/react'

export type Shape = 'rect' | 'round' | 'ellipse' | 'diamond' | 'para' | 'hex' | 'memo' | 'memo-lined'
export type Bg = 'grid' | 'grid-wide' | 'dots' | 'dots-wide' | 'lines' | 'none'

export interface MediaItem { id: string; kind: 'image' | 'video'; mediaId: string }

/** 사용자가 테두리에 놓은 연결점. u·v는 상자 폭·높이에 대한 비율 */
export interface Port { id: string; u: number; v: number }

export type BoxData = {
  shape: Shape
  title: string
  body: string
  media: MediaItem[]
  fill: string | null
  stroke: string | null
  strokeWidth: number
  dash: 'solid' | 'dashed' | 'none'
  /** 예전 방식의 글 폭 고정 (지금은 w를 쓴다) */
  wrap: number | null
  /** 직접 정한 상자 크기. 글이 더 많으면 그만큼 커진다. 집합은 이 크기를 유지하며 안쪽 상자에 맞춰 늘어난다 */
  w?: number | null
  h?: number | null
  hidePreview?: boolean
  ports?: Port[]
  /** 이 상자를 감싸는 상자(집합) */
  parent?: string | null
}

/** 선 가운데에 표시하는 관계 기호 */
export type Rel = '=' | '≠' | '≈'

export type EdgeData = {
  kind: 'bezier' | 'straight' | 'step'
  arrow: 'end' | 'both' | 'none'
  dashed: boolean
  color: string | null
  width: number
  label: string
  rel?: Rel | null
  /** 되먹임 선이 다른 상자를 비켜 돌아가는 거리(꺾은선) */
  offset?: number
}

/** 새 상자·선을 만들 때 쓰는 기본 모양 (전체 설정, 또는 노트별) */
export interface Defaults {
  shape: Shape
  fill: string | null
  stroke: string | null
  edge: Pick<EdgeData, 'kind' | 'arrow' | 'dashed' | 'color' | 'width'>
}

export type BoxNode = Node<BoxData, 'box'>
export type LogicEdge = Edge<EdgeData, 'logic'>

export interface Folder {
  id: string
  name: string
  parentId: string | null
  /** 폴더를 묶는 그룹 (노트는 담지 않는다) */
  group?: number
  createdAt: number
  updatedAt: number
  deleted?: number
  /** 마지막 동기화 이후 이 기기에서 바뀜 */
  dirty?: number
  driveId?: string
  /** 마지막으로 본 원격 버전(u) */
  syncedAt?: number
}

/** A4 용지 노트: 페이지를 위에서 아래로 쌓는다. 상자는 놓인 위치로 어느 페이지인지 정해진다 */
export interface Paper {
  size: 'a4'
  landscape?: boolean
  /** 다음 페이지를 옆에 (없으면 아래에) */
  side?: boolean
  /** 페이지 순서 (id는 순서를 바꿀 때 구분용) */
  pages: string[]
}

export interface Note {
  id: string
  folderId: string | null
  title: string
  nodes: BoxNode[]
  edges: LogicEdge[]
  viewport?: Viewport
  bg?: Bg
  /** 바탕색. 없으면 라이트/다크에 따라 흰색/검정 */
  ground?: string | null
  /** 이 노트만의 다크 모드. 없으면 앱 테마를 따른다 */
  mode?: 'light' | 'dark' | null
  /** 있으면 A4 용지 노트, 없으면 무한 캔버스 */
  paper?: Paper | null
  /** 이 노트만의 기본 모양. 없으면 전체 설정을 따른다 */
  defaults?: Defaults | null
  favorite?: number
  trashed?: number
  createdAt: number
  updatedAt: number
  deleted?: number
  /** 마지막 동기화 이후 이 기기에서 바뀜 */
  dirty?: number
  driveId?: string
  /** 마지막으로 본 원격 버전(u) */
  syncedAt?: number
}

export interface LinkMeta { title?: string; description?: string; image?: string; logo?: string; site?: string }
