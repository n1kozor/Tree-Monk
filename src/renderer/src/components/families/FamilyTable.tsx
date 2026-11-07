import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Baby } from 'lucide-react'
import type { Person } from '@shared/types'
import { useDateFormat } from '@/hooks/useDateFormat'
import { cn, fullName } from '@/lib/utils'
import type { FamilyRow, SharedAncestry } from '@/lib/familyStats'
import { CoupleAvatars, FamilyChips, lifeYears, useGrowingLimit, type FamilySort } from './parts'
import { Duration } from './FamilyCards'

type Col = 'couple' | 'marriage' | 'place' | 'children' | 'duration' | 'ages' | 'status'

/** Which sort a column header applies (the marriage column toggles direction). */
const COL_SORT: Partial<Record<Col, FamilySort>> = {
  couple: 'name',
  marriage: 'marriageAsc',
  children: 'children',
  duration: 'duration'
}

export function FamilyTable({
  rows,
  ancestry,
  selectedId,
  onSelect,
  sort,
  onSort,
  resetKey
}: {
  rows: FamilyRow[]
  ancestry: Map<string, SharedAncestry>
  selectedId: string | null
  onSelect: (id: string) => void
  sort: FamilySort
  onSort: (s: FamilySort) => void
  resetKey: unknown
}): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const { limit, sentinelRef } = useGrowingLimit(rows.length, resetKey, 200)
  const unknown = t('families.unknownSpouse')

  const header = (col: Col, label: string, className?: string): JSX.Element => {
    const target = COL_SORT[col]
    const active =
      target === sort || (col === 'marriage' && (sort === 'marriageAsc' || sort === 'marriageDesc'))
    const click = (): void => {
      if (!target) return
      if (col === 'marriage') onSort(sort === 'marriageAsc' ? 'marriageDesc' : 'marriageAsc')
      else onSort(target)
    }
    return (
      <th
        onClick={target ? click : undefined}
        className={cn(
          'sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur',
          target && 'cursor-pointer select-none hover:text-foreground',
          active && 'text-primary',
          className
        )}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active &&
            (sort === 'name' || sort === 'marriageAsc' ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            ))}
        </span>
      </th>
    )
  }

  const nameCell = (p: Person | null): JSX.Element => (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className={cn('truncate font-medium', !p && 'font-normal italic text-muted-foreground')}>
        {p ? fullName(p) : unknown}
      </span>
      {p && <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{lifeYears(p)}</span>}
    </span>
  )

  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {header('couple', t('families.col.couple'), 'w-[30%]')}
            {header('marriage', t('person.marriage'))}
            {header('place', t('person.place'))}
            {header('children', t('person.children'))}
            {header('duration', t('families.col.duration'))}
            {header('ages', t('families.col.ages'))}
            {header('status', t('families.col.status'))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r) => {
            const id = r.family.id
            return (
              <tr
                key={id}
                data-testid="family-row"
                onClick={() => onSelect(id)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-accent/40',
                  selectedId === id && 'bg-primary/10 hover:bg-primary/15'
                )}
              >
                <td className="border-b border-border/50 px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <CoupleAvatars row={r} size="h-8 w-8" />
                    <div className="min-w-0 flex-1 text-[13px] leading-tight">
                      {nameCell(r.husband)}
                      {nameCell(r.wife)}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap border-b border-border/50 px-3 py-2 text-xs tabular-nums">
                  {r.marriageDate ? (
                    fmtDate(r.marriageDate)
                  ) : r.startEstimated ? (
                    <span className="italic text-muted-foreground" title={t('families.estimatedStart')}>
                      ~{r.startYear}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
                <td className="max-w-[220px] truncate border-b border-border/50 px-3 py-2 text-xs text-muted-foreground" title={r.marriagePlace ?? ''}>
                  {r.marriagePlace || <span className="text-muted-foreground/60">—</span>}
                </td>
                <td className="border-b border-border/50 px-3 py-2 text-xs tabular-nums">
                  {r.children.length ? (
                    <span className="inline-flex items-center gap-1">
                      <Baby className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.children.length}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">0</span>
                  )}
                </td>
                <td className="whitespace-nowrap border-b border-border/50 px-3 py-2">
                  <Duration row={r} />
                </td>
                <td className="whitespace-nowrap border-b border-border/50 px-3 py-2 text-xs tabular-nums text-muted-foreground">
                  {r.husbandAge != null || r.wifeAge != null ? (
                    <span title={t('families.col.ages')}>
                      {r.husbandAge ?? '?'} / {r.wifeAge ?? '?'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
                <td className="border-b border-border/50 px-3 py-2">
                  <FamilyChips row={r} ancestry={ancestry.get(id)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {limit < rows.length && (
        <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground tabular-nums">
          {limit} / {rows.length}
        </div>
      )}
    </div>
  )
}
