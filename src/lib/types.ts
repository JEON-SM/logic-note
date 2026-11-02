import type { Node, Edge, Viewport } from '@xyflow/react'

export type Shape = 'rect' | 'round' | 'ellipse' | 'diamond' | 'para' | 'hex'
export type Bg = 'grid' | 'grid-wide' | 'dots' | 'dots-wide' | 'none'

export interface MediaItem { id: string; kind: 'image' | 'video'; mediaId: string }

export type BoxData = {
  shape: Shape
  title: string
  body: string
  media: MediaItem[]
  fill: string | null
  stroke: string | null
  strokeWidth: number
  dash: 'solid' | 'dashed' | 'none'
  wrap: number | null
  hidePreview?: boolean
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

export interface Note {
  id: string
  folderId: string | null
  title: string
  nodes: BoxNode[]
  edges: LogicEdge[]
  viewport?: Viewport
  bg?: Bg
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
