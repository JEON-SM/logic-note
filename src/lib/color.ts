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
  const tone = l > 0.8 ? '연한 ' : l < 0.3 ? '진한 ' : ''
  if (isAchromatic(hex)) return l < 0.12 ? '검정' : l > 0.97 ? '흰색' : tone + '회색'
  const h = ((max === r ? (g - b) / c : max === g ? (b - r) / c + 2 : (r - g) / c + 4) * 60 + 360) % 360
  const name = h < 15 || h >= 335 ? '빨강' : h < 40 ? '주황' : h < 65 ? '노랑' : h < 160 ? '초록' : h < 190 ? '청록' : h < 250 ? '파랑' : h < 290 ? '보라' : '분홍'
  return tone + name
}

/** 무채색은 다크 모드에서 명도를 반전해 표시한다 (채도가 있는 색은 그대로). 자기 역함수. */
export const themeMap = (c: string, theme: Theme) => (theme === 'dark' && isAchromatic(c) ? invert(c) : c)

/** 배경이 밝은지 어두운지 (검정/흰 글씨 대비가 같아지는 지점 기준) */
export const toneOf = (bg: string): Theme => (luminance(bg) > 0.179 ? 'light' : 'dark')

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
