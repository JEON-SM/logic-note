import { t } from './i18n'

export type Theme = 'light' | 'dark'
type RGB = [number, number, number]

export const CANVAS: Record<Theme, string> = { light: '#FFFFFF', dark: '#1C1C1E' }
export const SURFACE: Record<Theme, string> = { light: '#FFFFFF', dark: '#28282B' }
export const INK: Record<Theme, string> = { light: '#1C1C1E', dark: '#E5E5EA' }
export const ACCENT = '#FF5F1F'

export const PALETTE = [
  '#000000', '#3A3A3C', '#6E6E73', '#AEAEB2', '#D1D1D6', '#F2F2F7', '#FFFFFF',
  '#E5484D', '#F76B15', '#FFC53D', '#30A46C', '#12A594', '#0090FF', '#8E4EC6',
  '#FDE2E1', '#FFE8D7', '#FFF4C2', '#DDF3E4', '#D5F2EE', '#DCEEFF', '#EDE2F7',
]
export const HIGHLIGHTS = ['#FFF176', '#FFCC80', '#FFB3C8', '#C7F5A6', '#A8E6FF', '#D9C2FF', '#E0E0E0']

const hexToRgb = (hex: string): RGB => {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbToHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()

const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export const contrast = (a: string, b: string) => {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
/** 무채색 판정: 채도(HSL)가 낮거나 RGB 차이가 아주 작은 색 */
export const isAchromatic = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min
  if (c < 0.05) return true
  const l = (max + min) / 2
  return c / (1 - Math.abs(2 * l - 1)) < 0.15
}
export const invert = (hex: string) => rgbToHex(hexToRgb(hex).map((v) => 255 - v))

/** 사람이 부르는 색 이름 (AI용 개요에서 같은 색끼리 알아보게) */
export function colorName(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min, l = (max + min) / 2
  const tone = l > 0.8 ? t('연한 ') : l < 0.3 ? t('진한 ') : ''
  if (isAchromatic(hex)) return l < 0.12 ? t('검정') : l > 0.97 ? t('흰색') : tone + t('회색')
  const h = ((max === r ? (g - b) / c : max === g ? (b - r) / c + 2 : (r - g) / c + 4) * 60 + 360) % 360
  const name = h < 15 || h >= 335 ? t('빨강') : h < 40 ? t('주황') : h < 65 ? t('노랑') : h < 160 ? t('초록') : h < 190 ? t('청록') : h < 250 ? t('파랑') : h < 290 ? t('보라') : t('분홍')
  return tone + name
}

/** 무채색은 다크 모드에서 명도를 반전해 표시한다 (채도가 있는 색은 그대로). 자기 역함수. */
export const themeMap = (c: string, theme: Theme) => (theme === 'dark' && isAchromatic(c) ? invert(c) : c)

/** 배경이 밝은지 어두운지 (검정/흰 글씨 대비가 같아지는 지점 기준) */
export const toneOf = (bg: string): Theme => (luminance(bg) > 0.179 ? 'light' : 'dark')

/** a에서 b로 t만큼 섞은 색 */
export const mix = (a: string, b: string, t: number) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)) }

/** 노트 바탕색 고르기용: 종이 같은 옅은 색과 칠판 같은 짙은 색 */
export const GROUNDS = [
  '#FFFFFF', '#F7F6F2', '#FBF5E6', '#FFF4C2', '#E9F5EC', '#E7F0FB', '#F2ECF9',
  '#FCEBEB', '#F2F2F7', '#D9D9DE', '#2C2C2E', '#1E3A2F', '#1A2740', '#000000',
]
export type Look = { ground: string; theme: Theme; grid: string; custom: boolean }
/**
 * 노트 바탕: 정한 색(무채색은 다크 모드에서 반전) 또는 테마 기본색.
 * 그 위의 상자·선은 바탕이 밝은지 어두운지에 맞춰 그린다(theme).
 */
export function groundLook(ground: string | null | undefined, theme: Theme): Look {
  if (!ground) return { ground: CANVAS[theme], theme, grid: theme === 'dark' ? '#323236' : '#ECECEA', custom: false }
  const g = themeMap(ground, theme), tone = toneOf(g)
  return { ground: g, theme: tone, grid: mix(g, tone === 'dark' ? '#FFFFFF' : '#000000', tone === 'dark' ? 0.12 : 0.075), custom: true }
}
/** 캔버스 안(상자·선·종이)에서만 바꿔 쓸 CSS 변수 */
export const groundVars = (l: Look) => (l.custom ? {
  '--canvas': l.ground, '--grid': l.grid,
  ...(l.theme === 'dark' ? { '--text-2': '#A1A1A6', '--text-3': '#6E6E73', '--line-2': '#3A3A3D' } : { '--text-2': '#6E6E73', '--text-3': '#A1A1A6', '--line-2': '#D8D8D4' }),
} as Record<string, string> : undefined)

/** 무채색 글씨가 배경 위에서 잘 안 보이면 반전한 색을 쓴다 */
export const readable = (c: string, bg: string) => {
  if (!isAchromatic(c) || contrast(c, bg) >= 3) return c
  const inv = invert(c)
  return contrast(inv, bg) > contrast(c, bg) ? inv : c
}

/** 글자색 마크용 CSS 변수: 밝은 배경 / 어두운 배경에서 각각 쓸 색 */
export const textVars = (c: string) => `--tc-l:${readable(c, SURFACE.light)};--tc-d:${readable(c, SURFACE.dark)}`

export const highlightAttrs = (c: string) => {
  const d = themeMap(c, 'dark')
  return { 'data-color': c, class: 'hl', 'data-tl': toneOf(c), 'data-td': toneOf(d), style: `--hl:${c};--hl-d:${d}` }
}
