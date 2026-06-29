import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronUp, RotateCcw, Settings2 } from 'lucide-react'
import {
  CANVAS_BACKGROUNDS,
  CARD_BACKGROUNDS,
  CARD_BORDERS,
  PEDIGREE_ACCENTS,
  usePedigreeSettings,
  type PedigreeValues
} from '@/store/usePedigreeSettings'

/** Floating, persisted look-and-feel panel for the pedigree canvas.
 *  Lives in the top-right of the canvas and is open by default. */
export function PedigreeSettingsPanel(): JSX.Element {
  const { t } = useTranslation()
  const ped = usePedigreeSettings()
  const [open, setOpen] = useState(true)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={t('tree.displaySettings')}
        className="absolute right-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card/90 text-muted-foreground shadow-xl backdrop-blur transition-colors hover:text-primary"
      >
        <Settings2 className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="absolute right-4 top-4 z-30 w-64 overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" /> {t('tree.displaySettings')}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={ped.reset}
            title={t('ctx.reset')}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            title={t('common.close')}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-13rem)] space-y-3.5 overflow-y-auto p-3">
        <Slider
          label={t('tree.colSpacing')}
          value={ped.colGap}
          min={240}
          max={520}
          step={4}
          onChange={(v) => ped.set({ colGap: v })}
        />
        <Slider
          label={t('tree.rowSpacing')}
          value={ped.rowGap}
          min={140}
          max={320}
          step={2}
          onChange={(v) => ped.set({ rowGap: v })}
        />

        <Swatches
          label={t('tree.accent')}
          options={PEDIGREE_ACCENTS}
          selected={ped.accent}
          onPick={(color) => ped.set({ accent: color })}
          custom={ped.accent}
          onCustom={(color) => ped.set({ accent: color })}
        />
        <Slider
          label={t('tree.connectorWidth')}
          value={ped.connectorWidth}
          min={1}
          max={5}
          step={0.5}
          onChange={(v) => ped.set({ connectorWidth: v })}
        />
        <Slider
          label={t('tree.connectorOpacity')}
          value={ped.connectorOpacity}
          min={0.15}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => ped.set({ connectorOpacity: v })}
        />

        <div className="space-y-3 border-t border-border/60 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('tree.cards')}
          </span>
          <Swatches
            label={t('tree.cardBg')}
            options={CARD_BACKGROUNDS}
            selected={ped.cardBg}
            onPick={(color) => ped.set({ cardBg: color })}
            ring
            custom={ped.cardBg.startsWith('#') ? ped.cardBg : undefined}
            onCustom={(color) => ped.set({ cardBg: color })}
          />
          <Swatches
            label={t('tree.cardBorder')}
            options={CARD_BORDERS}
            selected={ped.cardBorder}
            onPick={(color) => ped.set({ cardBorder: color })}
            ring
            custom={ped.cardBorder.startsWith('#') ? ped.cardBorder : undefined}
            onCustom={(color) => ped.set({ cardBorder: color })}
          />
          <Slider
            label={t('tree.cardBorderWidth')}
            value={ped.cardBorderWidth}
            min={0}
            max={4}
            step={0.5}
            onChange={(v) => ped.set({ cardBorderWidth: v })}
          />
          <Slider
            label={t('tree.cardRadius')}
            value={ped.cardRadius}
            min={0}
            max={24}
            step={1}
            onChange={(v) => ped.set({ cardRadius: v })}
          />
          <Toggle
            label={t('tree.cardShadow')}
            value={ped.cardShadow}
            onChange={(v) => ped.set({ cardShadow: v })}
          />
        </div>

        <div className="border-t border-border/60 pt-3">
          <Swatches
            label={t('tree.canvasBg')}
            options={CANVAS_BACKGROUNDS}
            selected={ped.background}
            onPick={(color) => ped.set({ background: color })}
            ring
          />
          <label className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={ped.background.startsWith('#') ? ped.background : '#ffffff'}
              onChange={(e) => ped.set({ background: e.target.value })}
              className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
              title={t('tree.customColor')}
            />
            <span className="text-[11px] text-muted-foreground">{t('tree.customColor')}</span>
          </label>
          <div className="mt-3 space-y-3.5">
            <Slider
              label={t('tree.contrast')}
              value={ped.contrast}
              min={0.7}
              max={1.5}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => ped.set({ contrast: v })}
            />
            <Slider
              label={t('tree.brightness')}
              value={ped.brightness}
              min={0.6}
              max={1.4}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => ped.set({ brightness: v })}
            />
            <Slider
              label={t('tree.saturation')}
              value={ped.saturation}
              min={0}
              max={2}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => ped.set({ saturation: v })}
            />
            <Slider
              label={t('tree.vintage')}
              value={ped.sepia}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => ped.set({ sepia: v })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-[11px] text-muted-foreground">
        {label}
        <span className="tabular-nums text-foreground">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tm-slider w-full cursor-pointer appearance-none bg-transparent"
      />
    </label>
  )
}

function Swatches({
  label,
  options,
  selected,
  onPick,
  ring,
  custom,
  onCustom
}: {
  label: string
  options: { key: string; color: string }[]
  selected: string
  onPick: (color: string) => void
  ring?: boolean
  /** When set, shows a free colour picker chip seeded with this value. */
  custom?: string
  onCustom?: (color: string) => void
}): JSX.Element {
  const isPreset = options.some((o) => o.color === selected)
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => onPick(o.color)}
            title={o.key}
            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
              selected === o.color ? 'border-foreground' : 'border-transparent'
            }`}
            style={{
              // `auto` follows the theme → show a split light/dark chip.
              background:
                o.color === 'auto'
                  ? 'linear-gradient(135deg, #f5f5f4 0 50%, #18181b 50% 100%)'
                  : o.color === 'accent'
                    ? 'conic-gradient(from 0deg, #10b981, #0ea5e9, #8b5cf6, #f43f5e, #f59e0b, #10b981)'
                    : o.color,
              boxShadow: ring ? 'inset 0 0 0 1px rgba(255,255,255,0.15)' : undefined
            }}
          />
        ))}
        {onCustom && (
          <label
            title="…"
            className={`relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border-2 ${
              !isPreset ? 'border-foreground' : 'border-dashed border-muted-foreground/50'
            }`}
            style={{ background: custom || 'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)' }}
          >
            <input
              type="color"
              value={custom && custom.startsWith('#') ? custom : '#10b981'}
              onChange={(e) => onCustom(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        )}
      </div>
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between text-[11px] text-muted-foreground"
    >
      <span>{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-border'}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
            value ? 'left-0.5 translate-x-3' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
