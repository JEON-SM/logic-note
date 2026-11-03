import { PaintBucket, Spline, Square } from 'lucide-react'
import { SHAPES } from '../lib/shapes'
import type { Defaults, EdgeData } from '../lib/types'
import { ColorButton, IB, Segmented, ShapeIcon } from './kit'
import { t } from '../lib/i18n'

const S = { size: 18, strokeWidth: 1.6 }

/** 새 상자·선의 기본 모양 고르기 (전체 설정과 노트별 설정이 같이 쓴다) */
export function DefaultsForm({ value: d, onChange }: { value: Defaults; onChange: (d: Defaults) => void }) {
  const e = d.edge
  const setE = (p: Partial<Defaults['edge']>) => onChange({ ...d, edge: { ...e, ...p } })
  return (
    <div>
      <div className="def-sub">{t('새 상자')}</div>
      <div className="def-row"><span>{t('도형')}</span>
        <div className="def-tools">
          {SHAPES.map((s) => (
            <IB key={s.id} label={s.label} on={d.shape === s.id} onClick={() => onChange({ ...d, shape: s.id })}><ShapeIcon shape={s.id} /></IB>
          ))}
        </div>
      </div>
      <div className="def-row"><span>{t('색')}</span>
        <div className="def-tools">
          <ColorButton label={t('채우기')} icon={<PaintBucket {...S} />} value={d.fill} none={t('기본')} onChange={(fill) => onChange({ ...d, fill })} />
          <ColorButton label={t('테두리 색')} icon={<Square {...S} />} value={d.stroke} none={t('기본')} onChange={(stroke) => onChange({ ...d, stroke })} />
        </div>
      </div>
      <div className="def-sub">{t('새 연결선')}</div>
      <div className="def-row"><span>{t('모양')}</span>
        <Segmented<EdgeData['kind']> value={e.kind} onChange={(kind) => setE({ kind })}
          options={[{ id: 'straight', label: t('직선') }, { id: 'bezier', label: t('곡선') }, { id: 'step', label: t('꺾은선') }]} />
      </div>
      <div className="def-row"><span>{t('끝')}</span>
        <Segmented<EdgeData['arrow']> value={e.arrow} onChange={(arrow) => setE({ arrow })}
          options={[{ id: 'end', label: t('화살표') }, { id: 'both', label: t('양방향') }, { id: 'none', label: t('선만') }]} />
      </div>
      <div className="def-row"><span>{t('선')}</span>
        <div className="def-tools">
          <Segmented value={e.dashed ? 'dashed' : 'solid'} onChange={(v) => setE({ dashed: v === 'dashed' })}
            options={[{ id: 'solid', label: t('실선') }, { id: 'dashed', label: t('점선') }]} />
          <ColorButton label={t('선 색')} icon={<Spline {...S} />} value={e.color} none={t('기본')} onChange={(color) => setE({ color })} />
        </div>
      </div>
      <div className="def-row"><span>{t('두께')}</span>
        <Segmented value={String(e.width)} onChange={(w) => setE({ width: +w })}
          options={[1, 1.5, 2.5, 4].map((w) => ({ id: String(w), label: String(w) }))} />
      </div>
    </div>
  )
}
