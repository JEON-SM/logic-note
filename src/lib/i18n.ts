// 화면 글: 한국어 문장을 그대로 키로 쓰고, 영어는 locales/en.ts에서 찾는다 (i18next).
// 언어를 바꾸면 페이지를 다시 불러온다 (모듈에 미리 만든 이름표까지 한 번에 바뀌도록).
import i18next from 'i18next'
import en from '../locales/en'

export type Lang = 'ko' | 'en'
export type LangSetting = 'auto' | Lang

const saved = (): LangSetting => {
  try { return JSON.parse(localStorage.getItem('ln.settings') || '{}').state?.lang ?? 'auto' } catch { return 'auto' }
}
const detect = (): Lang => ((navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase().startsWith('ko') ? 'ko' : 'en')
const s = saved()
export const lang: Lang = s === 'auto' ? detect() : s
/** 날짜·숫자 표시용 */
export const locale = lang === 'ko' ? 'ko-KR' : 'en-US'

i18next.init({
  lng: lang, resources: { en: { translation: en } }, fallbackLng: false, initAsync: false,
  keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false }, returnNull: false,
})
document.documentElement.lang = lang

/** 한국어 문장을 키로: 영어면 번역, 한국어(또는 번역 없음)면 그대로. {{n}} 같은 자리 표시를 채운다 */
export const t = (key: string, opts?: Record<string, unknown>): string => i18next.t(key, { defaultValue: key, ...opts }) as string
