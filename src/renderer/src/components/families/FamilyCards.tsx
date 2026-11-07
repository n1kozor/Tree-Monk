import { useTranslation } from 'react-i18next'
import { Hourglass, MapPin } from 'lucide-react'
import type { Person } from '@shared/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDateFormat } from '@/hooks/useDateFormat'
import { cn, fullName } from '@/lib/utils'
import type { FamilyRow, SharedAncestry } from '@/lib/familyStats'
import { ChildrenStack, CoupleAvatars, FamilyChips, KIND_TONE, KindIcon, lifeYears, useGrowingLimit } from './parts'

function SpouseLine({ p, unknown }: { p: Person | null; unknown: string }): JSX.Element {
  return (
    <p className="flex min-w-0 items-baseline gap-1.5 leading-snug">
      <span className={cn('truncate text-sm font-semibold', !p && 'font-normal italic text-muted-foreground')}>
        {p ? fullName(p) : unknown}
      </span>
      {p && <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{lifeYears(p)}</span>}
    </p>
  )
}

/** The wedding line shared by cards and the table: date (or the estimated
 *  year in italics) and place. */
export function WeddingLine({ row, className }: { row: FamilyRow; className?: string }): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground', className)}>
      <KindIcon
        row={row}
        className={cn('h-3 w-3 shrink-0', KIND_TONE[row.kind].text, row.kind === 'married' && 'fill-current')}
      />
      {row.marriageDate ? (
        <span className="shrink-0 tabular-nums">{fmtDate(row.marriageDate)}</span>
      ) : row.startEstimated ? (
        <span className="shrink-0 italic tabular-nums" title={t('families.estimatedStart')}>
          ~{row.startYear}
        </span>
      ) : (
        <span className="shrink-0 italic opacity-70">{t('families.noDate')}</span>
      )}
      {row.marriagePlace && (
        <>
          <MapPin className="ml-1 h-3 w-3 shrink-0" />
          <span className="truncate" title={row.marriagePlace}>
            {row.marriagePlace}
          </span>
        </>
      )}
    </div>
  )
}

/** Years married, with a green dot while the union is still running. */
export function Duration({ row }: { row: FamilyRow }): JSX.Element | null {
  const { t } = useTranslation()
  if (row.durationYears == null) return null
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
      <Hourglass className="h-3 w-3" />
      {t('families.years', { count: row.durationYears })}
      {row.ongoing && (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title={t('families.ongoing')} />
      )}
    </span>
  )
}

export function FamilyCards({
  rows,
  ancestry,
  selectedId,
  onSelect,
  resetKey
}: {
  rows: FamilyRow[]
  ancestry: Map<string, SharedAncestry>
  selectedId: string | null
  onSelect: (id: string) => void
  resetKey: unknown
}): JSX.Element {
  const { t } = useTranslation()
  const { limit, sentinelRef } = useGrowingLimit(rows.length, resetKey)
  const unknown = t('families.unknownSpouse')

  return (
    <ScrollArea className="h-full">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 p-4">
        {rows.slice(0, limit).map((r) => {
          const id = r.family.id
          return (
            <button
              key={id}
              data-testid="family-card"
              onClick={() => onSelect(id)}
              className={cn(
                'group relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-border bg-card p-3.5 pl-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5',
                selectedId === id && 'border-primary ring-2 ring-primary/30'
              )}
            >
              <span className={cn('absolute inset-y-0 left-0 w-1', KIND_TONE[r.kind].bar)} />
              <div className="flex items-center gap-3">
                <CoupleAvatars row={r} />
                <div className="min-w-0 flex-1">
                  <SpouseLine p={r.husband} unknown={unknown} />
                  <SpouseLine p={r.wife} unknown={unknown} />
                </div>
              </div>
              <WeddingLine row={r} />
              <div className="flex min-h-6 items-center gap-2">
                {r.children.length ? (
                  <>
                    <ChildrenStack kids={r.children} max={7} />
                    <span className="truncate text-[11px] text-muted-foreground">
                      {t('families.childrenN', { count: r.children.length })}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] italic text-muted-foreground/70">{t('families.noChildren')}</span>
                )}
                <div className="flex-1" />
                <Duration row={r} />
              </div>
              <FamilyChips row={r} ancestry={ancestry.get(id)} />
            </button>
          )
        })}
      </div>
      {limit < rows.length && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground tabular-nums">
          {limit} / {rows.length}
        </div>
      )}
    </ScrollArea>
  )
}
