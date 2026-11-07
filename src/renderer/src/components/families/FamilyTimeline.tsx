import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { GanttChart, HeartCrack } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName } from '@/lib/utils'
import { timelineEnd, yearNum, type FamilyRow } from '@/lib/familyStats'
import { KIND_TONE, coupleName, useGrowingLimit } from './parts'

/** A tick step that keeps the axis at roughly a dozen labels. */
function niceStep(span: number): number {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200]) if (span / s <= 13) return s
  return 500
}

function Legend(): JSX.Element {
  const { t } = useTranslation()
  const swatch = (cls: string, label: string): JSX.Element => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-5 rounded-full', cls)} />
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-muted-foreground">
      {swatch(KIND_TONE.married.bar, t('relationship.married'))}
      {swatch(KIND_TONE.partner.bar, t('relationship.partner'))}
      {swatch(KIND_TONE.other.bar, t('families.kind.other'))}
      {swatch('border border-dashed border-primary bg-transparent', t('families.timeline.estimated'))}
      {swatch('bg-gradient-to-r from-primary/75 to-transparent', t('families.timeline.openEnd'))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-pink-500 ring-2 ring-background" />
        <span className="-ml-2.5 h-2.5 w-2.5 rounded-full bg-teal-500 ring-2 ring-background" />
        {t('families.timeline.childBirth')}
      </span>
      <span className="inline-flex items-center gap-1">
        <HeartCrack className="h-3.5 w-3.5 text-rose-500" />
        {t('events.type.divorce')}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="font-bold">†</span>
        {t('families.timeline.death')}
      </span>
    </div>
  )
}

export function FamilyTimeline({
  rows,
  selectedId,
  onSelect,
  resetKey
}: {
  rows: FamilyRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  resetKey: unknown
}): JSX.Element {
  const { t } = useTranslation()
  const selectPerson = useAppStore((s) => s.selectPerson)
  const now = new Date().getFullYear()
  const unknown = t('families.unknownSpouse')

  const placed = useMemo(
    () =>
      rows.flatMap((row) => {
        const end = timelineEnd(row, now)
        return row.startYear != null && end != null ? [{ row, start: row.startYear, end }] : []
      }),
    [rows, now]
  )
  const hidden = rows.length - placed.length
  const { limit, sentinelRef } = useGrowingLimit(placed.length, resetKey, 150)

  // The axis covers EVERY placed row (not just the rendered window), children
  // born before the wedding or after its end included, so it never jumps
  // while scrolling.
  const range = useMemo(() => {
    if (!placed.length) return null
    let min = Infinity
    let max = -Infinity
    for (const { row, start, end } of placed) {
      min = Math.min(min, start)
      max = Math.max(max, end)
      for (const c of row.children) {
        const y = yearNum(c.birthDate) ?? yearNum(c.christeningDate)
        if (y != null) {
          min = Math.min(min, y)
          max = Math.max(max, y)
        }
      }
    }
    min -= 2
    max += 2
    if (max - min < 20) {
      const pad = 20 - (max - min)
      min -= Math.floor(pad / 2)
      max += Math.ceil(pad / 2)
    }
    const step = niceStep(max - min)
    const ticks: number[] = []
    for (let y = Math.ceil(min / step) * step; y <= max; y += step) ticks.push(y)
    return { min, max, span: max - min, ticks }
  }, [placed])

  if (!range) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <GanttChart className="h-7 w-7 opacity-60" />
        </div>
        <p className="max-w-sm text-center text-sm">{t('families.timeline.empty')}</p>
      </div>
    )
  }

  const pct = (y: number): number => ((y - range.min) / range.span) * 100

  return (
    <div className="h-full overflow-auto">
      <Legend />
      <div className="relative min-w-[880px]">
        {/* Axis */}
        <div className="sticky top-0 z-20 flex h-8 items-center border-b border-border bg-background/95 backdrop-blur">
          <div className="w-64 shrink-0 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('families.col.couple')}
          </div>
          <div className="relative mr-6 h-full flex-1">
            {range.ticks.map((y) => (
              <span
                key={y}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                style={{ left: `${pct(y)}%` }}
              >
                {y}
              </span>
            ))}
          </div>
        </div>

        {/* Grid lines behind every row (one set, not one per row) */}
        <div className="pointer-events-none absolute bottom-0 left-64 right-6 top-8">
          {range.ticks.map((y) => (
            <span key={y} className="absolute inset-y-0 w-px bg-border/50" style={{ left: `${pct(y)}%` }} />
          ))}
          {now <= range.max && (
            <span
              className="absolute inset-y-0 border-l border-dashed border-emerald-500/50"
              style={{ left: `${pct(now)}%` }}
            />
          )}
        </div>

        {placed.slice(0, limit).map(({ row, start, end }) => {
          const id = row.family.id
          const tone = KIND_TONE[row.kind]
          const openEnd = row.endYear == null && !row.ongoing
          const endLabel = row.endYear ?? (row.ongoing ? t('families.ongoing') : '?')
          return (
            <div
              key={id}
              data-testid="family-timeline-row"
              onClick={() => onSelect(id)}
              className={cn(
                'relative flex h-9 cursor-pointer items-center border-b border-border/30 transition-colors hover:bg-accent/40',
                selectedId === id && 'bg-primary/10 hover:bg-primary/15'
              )}
            >
              <div className="w-64 shrink-0 truncate px-3 text-xs" title={coupleName(row, unknown)}>
                <span className={cn('font-medium', !row.husband && 'italic text-muted-foreground')}>
                  {row.husband ? fullName(row.husband) : unknown}
                </span>
                <span className="text-muted-foreground"> & </span>
                <span className={cn('font-medium', !row.wife && 'italic text-muted-foreground')}>
                  {row.wife ? fullName(row.wife) : unknown}
                </span>
              </div>
              <div className="relative mr-6 h-full flex-1">
                <div
                  title={`${row.startEstimated ? '~' : ''}${start} – ${endLabel}`}
                  className={cn(
                    'absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full',
                    row.startEstimated
                      ? cn('border border-dashed border-current bg-transparent', tone.text)
                      : openEnd
                        ? cn('bg-gradient-to-r to-transparent', tone.from)
                        : row.ongoing
                          ? cn('bg-gradient-to-r to-emerald-400/80', tone.from)
                          : tone.bar
                  )}
                  style={{ left: `${pct(start)}%`, width: `${Math.max(0.6, pct(end) - pct(start))}%` }}
                />
                {row.endReason === 'divorce' || row.endReason === 'separation' ? (
                  <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${pct(end)}%` }}
                    title={`${t(`events.type.${row.endReason}`)} · ${end}`}
                  >
                    <HeartCrack className="h-3.5 w-3.5 text-rose-500" />
                  </span>
                ) : row.endReason === 'death' ? (
                  <span
                    className="absolute top-1/2 ml-1.5 -translate-y-1/2 text-[11px] font-bold leading-none text-muted-foreground"
                    style={{ left: `${pct(end)}%` }}
                    title={`${t('families.timeline.death')} · ${end}`}
                  >
                    †
                  </span>
                ) : null}
                {row.children.map((c) => {
                  const y = yearNum(c.birthDate) ?? yearNum(c.christeningDate)
                  if (y == null) return null
                  const rel = row.family.childRelations?.[c.id]
                  const relType = rel?.father ?? rel?.mother ?? null
                  return (
                    <button
                      key={c.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        selectPerson(c.id)
                      }}
                      title={[fullName(c), y, relType ? t(`childRelation.${relType}`) : null].filter(Boolean).join(' · ')}
                      className={cn(
                        'absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background transition-transform hover:scale-150',
                        c.sex === 'F' ? 'bg-pink-500' : c.sex === 'M' ? 'bg-teal-500' : 'bg-slate-400'
                      )}
                      style={{ left: `${pct(y)}%` }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
        {limit < placed.length && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground tabular-nums">
            {limit} / {placed.length}
          </div>
        )}
      </div>
      {hidden > 0 && (
        <p className="px-4 py-3 text-center text-[11px] text-muted-foreground">
          {t('families.timeline.hidden', { count: hidden })}
        </p>
      )}
    </div>
  )
}
