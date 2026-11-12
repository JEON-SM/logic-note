import type { Node, Edge, Viewport } from '@xyflow/react'

/** 'round'(둥근 사각형)·'memo-lined'(줄 메모지)는 예전 노트에만 있다. 열 때 'rect'·'memo'+줄 서식으로 바뀐다 */
export type Shape = 'rect' | 'round' | 'ellipse' | 'diamond' | 'para' | 'hex' | 'memo' | 'memo-lined'
export type Bg = 'grid' | 'grid-wide' | 'dots' | 'dots-wide' | 'lines' | 'none'
/** 상자 안 바탕 무늬 (서식) */
export type Rule = 'lines' | 'grid' | 'dots'
/** 상자 안 글의 세로 위치 */
export type VAlign = 'top' | 'middle' | 'bottom'

export interface MediaItem { id: string; kind: 'image' | 'video'; mediaId: string }

/** 사용자가 테두리에 놓은 연결점. u·v는 상자 폭·높이에 대한 비율 */
export interface Port { id: string; u: number; v: number }

export type BoxData = {
  shape: Shape
  /** 예전 노트의 제목 칸. 열 때 body 앞에 합쳐지고 비워진다 */
  title: string
  /** 상자 글 전체 (HTML). head 서식이면 첫 단락이 제목 줄 */
  body: string
  media: MediaItem[]
  fill: string | null
  stroke: string | null
  strokeWidth: number
  dash: 'solid' | 'dashed' | 'none'
  /** 예전 방식의 글 폭 고정 (지금은 w를 쓴다) */
  wrap: number | null
  /**
   * 상자 크기. 정해져 있으면 글이 넘쳐도 그대로이고 넘친 글은 상자 안에서 스크롤한다.
   * 없으면(예전 노트·붙여넣은 그림·'글에 맞추기') 한 번 글에 맞춰 잰 뒤 그 크기로 고정된다
   */
  w?: number | null
  h?: number | null
  /** 서식: 첫 줄을 제목으로 (굵게, 아래 구분선) */
  head?: boolean
  /** 서식: 상자 안 바탕 무늬 */
  rule?: Rule | null
  /** 글의 세로 위치 (없으면 가운데, 안에 상자가 있거나 메모지·줄 서식이면 위) */
  valign?: VAlign | null
  hidePreview?: boolean
  ports?: Port[]
  /** 이 상자를 감싸는 상자 */
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
  /** 꺾은 점 (캔버스 좌표). 있으면 선은 양 끝과 이 점들을 곧게 잇는다 */
  points?: { x: number; y: number }[] | null
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
  /** 선 끝에 연결점을 달아 둔 노트 (예전 노트는 처음 열 때 한 번 달아 준다) */
  dots?: number
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
