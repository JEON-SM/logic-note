import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalDistributeCenter, Maximize2, StretchHorizontal, StretchVertical, type LucideIcon,
} from 'lucide-react'
import { t } from '../lib/i18n'
import type { AlignKind } from './store'

/** 맞춤 (리본 '배치', 빠른 도구, 오른쪽 클릭 메뉴가 함께 쓴다) */
export const ALIGN_LIST: { id: AlignKind; label: string; Icon: LucideIcon }[] = [
  { id: 'left', label: t('왼쪽'), Icon: AlignStartVertical },
  { id: 'center', label: t('가운데'), Icon: AlignCenterVertical },
  { id: 'right', label: t('오른쪽'), Icon: AlignEndVertical },
  { id: 'top', label: t('위쪽'), Icon: AlignStartHorizontal },
  { id: 'middle', label: t('가운데 (세로)'), Icon: AlignCenterHorizontal },
  { id: 'bottom', label: t('아래쪽'), Icon: AlignEndHorizontal },
]
/** 간격 똑같이 (상자 3개 이상) */
export const SPREAD_LIST: { id: 'h' | 'v'; label: string; tip: string; Icon: LucideIcon }[] = [
  { id: 'h', label: t('가로로'), tip: t('가로 간격 똑같이 (상자 3개 이상)'), Icon: AlignHorizontalDistributeCenter },
  { id: 'v', label: t('세로로'), tip: t('세로 간격 똑같이 (상자 3개 이상)'), Icon: AlignVerticalDistributeCenter },
]
/** 같은 크기 (가장 큰 상자에 맞춘다) */
export const SIZE_LIST: { id: 'w' | 'h' | 'both'; label: string; tip: string; Icon: LucideIcon }[] = [
  { id: 'w', label: t('폭'), tip: t('가장 넓은 상자의 폭으로'), Icon: StretchHorizontal },
  { id: 'h', label: t('높이'), tip: t('가장 높은 상자의 높이로'), Icon: StretchVertical },
  { id: 'both', label: t('폭과 높이'), tip: t('가장 큰 상자의 크기로'), Icon: Maximize2 },
]
