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
}

export type EdgeData = {
  kind: 'bezier' | 'straight' | 'step'
  arrow: 'end' | 'both' | 'none'
  dashed: boolean
  color: string | null
  width: number
  label: string
}

export type BoxNode = Node<BoxData, 'box'>
export type LogicEdge = Edge<EdgeData, 'logic'>

export interface Folder {
  id: string
  name: string
  parentId: string | null
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
