import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal } from 'lucide-react'
import {
  usePedigreeSettings,
  type FanColorMode,
  type FanSweep
} from '@/store/usePedigreeSettings'
import { CHART_FONTS, chartFontFamily, ensureChartFont, type FontCategory } from '@/lib/chartFonts'

const SWEEPS: FanSweep[] = [360, 270, 180]
const COLOR_MODES: FanColorMode[] = ['sex', 'generation', 'country', 'mono']
const FONT_CATS: FontCategory[] = ['sans', 'serif', 'script', 'display']

/** Compact popover with the fan-chart's look settings (sweep, colours, years). */
export function FanOptions(): JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ped = usePedigreeSettings()

  // Preload the selected font so the live preview renders in the real face.
  useEffect(() => {
    if (open) void ensureChartFont(ped.fanFont)
  }, [open, ped.fanFont])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('tree.fanOptions')}
        className={`glass-subtle flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors ${
          open
            ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
            : 'text-muted-foreground hover:text-primary'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden lg:inline">{t('tree.fanOptions')}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute left-0 top-10 z-50 w-72 space-y-3 rounded-2xl p-3 text-card-foreground">
            {/* Sweep */}
            <Field label={t('tree.fanSweep')}>
              <Segmented
                options={SWEEPS.map((s) => ({ value: s, label: `${s}°` }))}
                value={ped.fanSweep}
                onChange={(v) => ped.set({ fanSweep: v })}
              />
            </Field>

            {/* Colour mode */}
            <Field label={t('tree.fanColors')}>
              <Segmented
                options={COLOR_MODES.map((m) => ({ value: m, label: t(`tree.fanColor_${m}`) }))}
                value={ped.fanColorMode}
                onChange={(v) => ped.set({ fanColorMode: v })}
              />
            </Field>

            {/* Font */}
            <Field label={t('tree.fanFont')}>
              <select
                value={ped.fanFont}
                onChange={(e) => {
                  const v = e.target.value
                  void ensureChartFont(v)
                  ped.set({ fanFont: v })
                }}
                className="h-8 w-full rounded-xl border border-input bg-transparent px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/30"
              >
                {FONT_CATS.map((cat) => (
                  <optgroup key={cat} label={t(`tree.fontCat_${cat}`)}>
                    {CHART_FONTS.filter((f) => f.category === cat).map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p
                className="mt-1 truncate rounded-lg bg-muted/40 px-2 py-1.5 text-sm text-foreground"
                style={{ fontFamily: chartFontFamily(ped.fanFont) }}
                title="Árvíztűrő tükörfúrógép"
              >
                Árvíztűrő · 1850
              </p>
            </Field>

            {/* Years toggle */}
            <label className="flex cursor-pointer items-center justify-between text-xs font-medium text-foreground">
              {t('tree.fanYears')}
              <button
                role="switch"
                aria-checked={ped.fanShowYears}
                onClick={() => ped.set({ fanShowYears: !ped.fanShowYears })}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  ped.fanShowYears ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    ped.fanShowYears ? 'left-0.5 translate-x-4' : 'left-0.5'
                  }`}
                />
              </button>
            </label>
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="flex gap-1 rounded-xl bg-muted/50 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`min-w-0 flex-1 rounded-lg px-1 py-1 text-[11px] font-medium transition-colors ${
            value === o.value
              ? 'bg-card text-foreground shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
