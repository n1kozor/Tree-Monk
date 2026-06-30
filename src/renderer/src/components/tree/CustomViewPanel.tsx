import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Palette, SlidersHorizontal, Wand2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ColorBy, ColoringLegendItem } from '@/lib/customColor'

export interface CustomConfig {
  surname: string
  given: string
  place: string
  from: string
  to: string
  sex: '' | 'M' | 'F'
  occupation: string
  colorBy: ColorBy
}

export const EMPTY_CUSTOM: CustomConfig = {
  surname: '',
  given: '',
  place: '',
  from: '',
  to: '',
  sex: '',
  occupation: '',
  colorBy: 'none'
}

const COLOR_BYS: ColorBy[] = ['none', 'sex', 'century', 'surname', 'place']

/** The "Egyedi" (custom) view control panel: rich highlight filters + card
 *  colour-coding with a live legend. */
export function CustomViewPanel({
  config,
  setConfig,
  matchCount,
  legend
}: {
  config: CustomConfig
  setConfig: (c: CustomConfig) => void
  /** How many people match the current filters (null = no active filter). */
  matchCount: number | null
  legend: ColoringLegendItem[]
}): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const set = (patch: Partial<CustomConfig>): void => setConfig({ ...config, ...patch })

  const hasFilters = !!(
    config.surname ||
    config.given ||
    config.place ||
    config.from ||
    config.to ||
    config.sex ||
    config.occupation
  )

  const sexBtn = (value: '' | 'M' | 'F', label: string): JSX.Element => (
    <button
      onClick={() => set({ sex: value })}
      className={cn(
        'flex-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors',
        config.sex === value ? 'bg-background text-foreground shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="glass-strong absolute left-4 top-16 z-10 w-72 overflow-hidden rounded-2xl text-xs text-card-foreground">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left"
      >
        <Wand2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 text-sm font-semibold">{t('tree.viewCustom')}</span>
        {matchCount !== null && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            {matchCount}
          </span>
        )}
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="max-h-[70vh] space-y-3.5 overflow-y-auto p-3">
          {/* ---- Filters ---- */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" /> {t('tree.custom.filters')}
              </span>
              {hasFilters && (
                <button
                  onClick={() =>
                    set({ surname: '', given: '', place: '', from: '', to: '', sex: '', occupation: '' })
                  }
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> {t('people.clear')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Input value={config.surname} onChange={(e) => set({ surname: e.target.value })} placeholder={t('person.surname')} className="h-8 text-xs" />
              <Input value={config.given} onChange={(e) => set({ given: e.target.value })} placeholder={t('person.givenName')} className="h-8 text-xs" />
            </div>
            <Input value={config.place} onChange={(e) => set({ place: e.target.value })} placeholder={t('tree.customPlace')} className="h-8 text-xs" />
            <div className="grid grid-cols-2 gap-1.5">
              <Input type="number" value={config.from} onChange={(e) => set({ from: e.target.value })} placeholder={t('person.from')} className="h-8 text-xs" />
              <Input type="number" value={config.to} onChange={(e) => set({ to: e.target.value })} placeholder={t('person.to')} className="h-8 text-xs" />
            </div>
            <Input value={config.occupation} onChange={(e) => set({ occupation: e.target.value })} placeholder={t('person.occupation')} className="h-8 text-xs" />

            <div className="flex items-center gap-0.5 rounded-xl bg-secondary/40 p-0.5">
              {sexBtn('', t('people.anySex'))}
              {sexBtn('M', t('person.male'))}
              {sexBtn('F', t('person.female'))}
            </div>
          </section>

          {/* ---- Colour-coding ---- */}
          <section className="space-y-2 border-t border-border/40 pt-3">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Palette className="h-3.5 w-3.5" /> {t('tree.custom.colorBy')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_BYS.map((cb) => (
                <button
                  key={cb}
                  onClick={() => set({ colorBy: cb })}
                  className={cn(
                    'rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
                    config.colorBy === cb
                      ? 'border-primary/40 bg-primary/15 text-primary ring-1 ring-primary/20'
                      : 'border-border/40 text-muted-foreground hover:bg-accent'
                  )}
                >
                  {t(`tree.custom.by.${cb}`)}
                </button>
              ))}
            </div>

            {/* Legend */}
            {legend.length > 0 && (
              <div className="space-y-1 rounded-xl border border-border/40 bg-background/40 p-2">
                {legend.map((item) => (
                  <div key={`${item.label}-${item.color}`} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="min-w-0 flex-1 truncate text-[11px]">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
