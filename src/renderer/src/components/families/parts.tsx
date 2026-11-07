import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dna, Heart, HeartCrack, Unlink2, Users } from 'lucide-react'
import type { Person } from '@shared/types'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { cn, fullName } from '@/lib/utils'
import type { FamilyKind, FamilyRow, SharedAncestry } from '@/lib/familyStats'

export type FamilySort = 'marriageAsc' | 'marriageDesc' | 'children' | 'duration' | 'name'

/** Accent per couple type — shared by cards, table and timeline bars. */
export const KIND_TONE: Record<FamilyKind, { bar: string; from: string; text: string; soft: string }> = {
  married: { bar: 'bg-primary/75', from: 'from-primary/75', text: 'text-primary', soft: 'bg-primary/10' },
  partner: { bar: 'bg-violet-500/75', from: 'from-violet-500/75', text: 'text-violet-600 dark:text-violet-400', soft: 'bg-violet-500/10' },
  other: { bar: 'bg-slate-400/75', from: 'from-slate-400/75', text: 'text-slate-500 dark:text-slate-400', soft: 'bg-slate-400/10' }
}

/** Icon for the union type — a heart would be ironic on a "no relationship". */
export function KindIcon({ row, className }: { row: FamilyRow; className?: string }): JSX.Element {
  const rel = row.family.relationship
  const Icon = rel === 'none' ? Unlink2 : rel === 'other' ? Users : Heart
  return <Icon className={className} />
}

/** "1820 – 1890", "* 1820", "1820 – ?", "† 1890" or "" (nothing known). */
export function lifeYears(p: Person | null | undefined): string {
  if (!p) return ''
  const b = /\d{4}/.exec(p.birthDate ?? p.christeningDate ?? '')?.[0]
  const d = /\d{4}/.exec(p.deathDate ?? '')?.[0]
  const dead = p.deceased || !!p.deathDate
  if (b && d) return `${b} – ${d}`
  if (b) return dead ? `${b} – ?` : `* ${b}`
  if (d) return `† ${d}`
  return ''
}

/** Display name of a couple: "A & B", with the unknown side spelled out. */
export function coupleName(row: FamilyRow, unknown: string): string {
  const h = row.husband ? fullName(row.husband) : unknown
  const w = row.wife ? fullName(row.wife) : unknown
  return `${h} & ${w}`
}

/** Two overlapping avatars; an empty dashed circle for an unknown spouse. */
export function CoupleAvatars({
  row,
  size = 'h-11 w-11',
  className
}: {
  row: FamilyRow
  size?: string
  className?: string
}): JSX.Element {
  const one = (p: Person | null, extra: string): JSX.Element =>
    p ? (
      <PersonAvatar
        personId={p.id}
        name={fullName(p)}
        sex={p.sex}
        className={cn(size, 'shrink-0 text-sm ring-2 ring-card', extra)}
      />
    ) : (
      <div
        className={cn(
          size,
          'shrink-0 rounded-full border-2 border-dashed border-muted-foreground/30 bg-muted/40 ring-2 ring-card',
          extra
        )}
      />
    )
  return (
    <div className={cn('relative flex shrink-0 items-center', className)}>
      {one(row.husband, '')}
      {one(row.wife, '-ml-3')}
      <span className="absolute -bottom-0.5 left-1/2 grid h-4 w-4 -translate-x-1/2 place-items-center rounded-full bg-card shadow-sm ring-1 ring-border">
        <KindIcon row={row} className={cn('h-2.5 w-2.5', KIND_TONE[row.kind].text, row.kind === 'married' && 'fill-current')} />
      </span>
    </div>
  )
}

/** Up to `max` overlapping child avatars, then "+N". */
export function ChildrenStack({ kids, max = 6 }: { kids: Person[]; max?: number }): JSX.Element | null {
  if (!kids.length) return null
  const shown = kids.slice(0, max)
  return (
    <div className="flex items-center">
      {shown.map((c, i) => (
        <PersonAvatar
          key={c.id}
          personId={c.id}
          name={fullName(c)}
          sex={c.sex}
          className={cn('h-6 w-6 shrink-0 text-[9px] ring-2 ring-card', i > 0 && '-ml-1.5')}
        />
      ))}
      {kids.length > max && (
        <span className="-ml-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-muted px-1 text-[9px] font-semibold text-muted-foreground ring-2 ring-card tabular-nums">
          +{kids.length - max}
        </span>
      )}
    </div>
  )
}

/** Small status chips: marriage number, union type, divorce, blood relation. */
export function FamilyChips({
  row,
  ancestry,
  className
}: {
  row: FamilyRow
  ancestry?: SharedAncestry
  className?: string
}): JSX.Element | null {
  const { t } = useTranslation()
  const chips: JSX.Element[] = []
  const order = row.family.marriageOrder
  if (order && order > 1) {
    chips.push(
      <span key="ord" className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
        {t('person.marriageOrdinal', { count: order, ordinal: true })}
      </span>
    )
  }
  if (row.family.relationship) {
    chips.push(
      <span key="kind" className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-medium', KIND_TONE[row.kind].soft, KIND_TONE[row.kind].text)}>
        {t(`relationship.${row.family.relationship}`)}
      </span>
    )
  }
  if (row.divorced) {
    const type = row.events.some((e) => e.type === 'divorce') ? 'divorce' : 'separation'
    chips.push(
      <span key="div" className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
        <HeartCrack className="h-3 w-3" />
        {t(`events.type.${type}`)}
        {row.endYear != null && <span className="tabular-nums">{row.endYear}</span>}
      </span>
    )
  }
  if (ancestry) {
    chips.push(
      <span
        key="rel"
        title={t('families.relatedTip', { genA: ancestry.genA, genB: ancestry.genB })}
        className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
      >
        <Dna className="h-3 w-3" />
        {t('families.related')}
      </span>
    )
  }
  if (!chips.length) return null
  return <div className={cn('flex flex-wrap items-center gap-1', className)}>{chips}</div>
}

/**
 * Windowed rendering: a tree with thousands of families must not mount
 * thousands of avatar rows at once. Grows by `page` as the sentinel scrolls
 * into view; resets whenever `resetKey` changes (new filter, new sort…).
 */
export function useGrowingLimit(
  total: number,
  resetKey: unknown,
  page = 120
): { limit: number; sentinelRef: React.MutableRefObject<HTMLDivElement | null> } {
  const [limit, setLimit] = useState(page)
  useEffect(() => setLimit(page), [resetKey, page])
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || limit >= total) return
    const io = new IntersectionObserver(
      (es) => es[0]?.isIntersecting && setLimit((l) => Math.min(l + page, total)),
      { rootMargin: '800px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [limit, total, page])
  return { limit, sentinelRef }
}
