import { useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { DropdownMenu, Popover } from 'radix-ui'
import { Check } from 'lucide-react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { PALETTE, themeMap } from '../lib/color'
import { pushRecent, useSettings, useTheme } from '../lib/store'
import { shapePath } from '../lib/shapes'
import type { Shape } from '../lib/types'

export const cls = (...a: unknown[]) => a.filter(Boolean).join(' ')

export const Logo = ({ size = 24 }: { size?: number }) => {
  const dark = useTheme() === 'dark'
  const [base, mark] = dark ? ['#F4F4F1', '#1C1C1E'] : ['#1C1C1E', '#F4F4F1']
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <rect width="512" height="512" rx="116" fill={base} />
      <path d="M184 184 L320 320" stroke={mark} strokeWidth="18" strokeLinecap="round" />
      <circle cx="176" cy="176" r="60" fill={mark} />
      <rect x="280" y="280" width="112" height="112" rx="14" fill="#FF5F1F" />
    </svg>
  )
}

export const ShapeIcon = ({ shape, size = 18 }: { shape: Shape; size?: number }) => {
  const w = shape === 'ellipse' || shape === 'diamond' ? 14 : 16, h = shape === 'diamond' ? 14 : shape === 'ellipse' ? 12 : 11
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden>
      <path d={shapePath(shape, w, h)} transform={`translate(${(18 - w) / 2} ${(18 - h) / 2})`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

type IBProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; on?: boolean }
/** 아이콘 버튼. mousedown 기본동작을 막아 편집 중인 텍스트의 포커스를 지킨다 */
export const IB = ({ label, on, className, children, ...p }: IBProps) => (
  <button type="button" className={cls('ib', on && 'on', className)} title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} {...p}>
    {children}
  </button>
)

export const Sep = () => <span className="sep" />

export function Menu({ trigger, children, align = 'start', open, onOpenChange }: {
  trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' | 'center'; open?: boolean; onOpenChange?: (o: boolean) => void
}) {
  return (
    <DropdownMenu.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align={align} sideOffset={6} collisionPadding={8} onCloseAutoFocus={(e) => e.preventDefault()}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export const Item = ({ icon, children, onSelect, danger, checked }: { icon?: ReactNode; children: ReactNode; onSelect: () => void; danger?: boolean; checked?: boolean }) => (
  <DropdownMenu.Item className={cls('menu-item', danger && 'danger')} onSelect={onSelect}>
    <span className="menu-icon">{icon}</span>
    <span className="menu-text">{children}</span>
    {checked && <Check size={14} className="menu-check" />}
  </DropdownMenu.Item>
)
export const MenuSep = () => <DropdownMenu.Separator className="menu-sep" />

export function Pop({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop" sideOffset={6} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ── 색 선택: 주요 색 / 최근 색 / 고급(스펙트럼) ──
// 무채색은 다크 모드에서 반전해 보여주므로, 저장값은 '라이트 기준' 색이다.
export function ColorButton({ value, onChange, label, icon, palette = PALETTE, none }: {
  value: string | null | undefined; onChange: (c: string | null) => void; label: string; icon: ReactNode; palette?: string[]; none?: string
}) {
  const theme = useTheme()
  return (
    <Pop trigger={
      <button type="button" className="ib color-btn" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()}>
        {icon}
        <span className="color-bar" style={{ background: value ? themeMap(value, theme) : 'transparent' }} />
      </button>
    }>
      <ColorPanel value={value ?? null} onChange={onChange} palette={palette} none={none} />
    </Pop>
  )
}

function ColorPanel({ value, onChange, palette, none }: { value: string | null; onChange: (c: string | null) => void; palette: string[]; none?: string }) {
  const theme = useTheme()
  const recent = useSettings((s) => s.recent)
  const [adv, setAdv] = useState(false)
  const choose = (c: string) => { pushRecent(c); onChange(c) }
  const sw = (c: string, i: number) => (
    <button key={c + i} type="button" className={cls('sw', value === c && 'on')} style={{ background: themeMap(c, theme) }} title={themeMap(c, theme)} onClick={() => choose(c)} />
  )
  return (
    <div className="cpanel">
      {none && <button type="button" className={cls('cp-none', !value && 'on')} onClick={() => onChange(null)}>{none}</button>}
      <div className="sw-grid">{palette.map(sw)}</div>
      {recent.length > 0 && (<><div className="cp-label">최근 사용</div><div className="sw-grid">{recent.map(sw)}</div></>)}
      <button type="button" className="cp-adv" onClick={() => setAdv(!adv)}>{adv ? '간단히' : '고급 설정'}</button>
      {adv && <Advanced initial={value ? themeMap(value, theme) : '#FF5F1F'} onPick={(c) => choose(themeMap(c.toUpperCase(), theme))} />}
    </div>
  )
}

function Advanced({ initial, onPick }: { initial: string; onPick: (c: string) => void }) {
  const [c, setC] = useState(initial)
  return (
    <div className="cp-advanced">
      <HexColorPicker color={c} onChange={setC} />
      <div className="cp-hexrow">
        <span className="sw" style={{ background: c }} />
        <HexColorInput color={c} onChange={setC} prefixed />
        <button type="button" className="btn" onClick={() => onPick(c)}>적용</button>
      </div>
    </div>
  )
}
