import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  Baby,
  CalendarHeart,
  CalendarRange,
  Dna,
  Hourglass,
  ListChecks,
  MapPin,
  Network,
  Printer,
  Route,
  StickyNote,
  Users,
  X,
  type LucideIcon
} from 'lucide-react'
import type { Person } from '@shared/types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { FamilySheetDialog } from '@/components/print/PrintSheets'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName } from '@/lib/utils'
import type { FamilyRow, SharedAncestry } from '@/lib/familyStats'
import { FamilyChips, KIND_TONE, KindIcon, lifeYears } from './parts'

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
}

export function FamilyDetail({
  row,
  ancestry,
  onClose
}: {
  row: FamilyRow
  ancestry?: SharedAncestry
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const fmtDate = useDateFormat()
  const selectPerson = useAppStore((s) => s.selectPerson)
  const focusPersonTree = useAppStore((s) => s.focusPersonTree)
  const openKinship = useAppStore((s) => s.openKinship)
  const families = useAppStore((s) => s.families)
  const peopleById = useAppStore((s) => s.peopleById)
  const [sheetOpen, setSheetOpen] = useState(false)
  const { husband, wife, family } = row
  const anchorId = husband?.id ?? wife?.id ?? null

  // Each child's own children (across all their unions) + the grandchildren total.
  const { kidsOf, grandchildren } = useMemo(() => {
    const ids = new Set(row.children.map((c) => c.id))
    const per = new Map<string, Set<string>>()
    const all = new Set<string>()
    for (const f of families) {
      for (const parent of [f.husbandId, f.wifeId]) {
        if (!parent || !ids.has(parent)) continue
        const set = per.get(parent) ?? new Set<string>()
        for (const c of f.childIds) {
          set.add(c)
          all.add(c)
        }
        per.set(parent, set)
      }
    }
    return { kidsOf: per, grandchildren: all.size }
  }, [families, row.children])

  const firstChildGap =
    row.firstChildYear != null && row.marriageYear != null ? row.firstChildYear - row.marriageYear : null

  const spouse = (p: Person | null, age: number | null): JSX.Element =>
    p ? (
      <button
        onClick={() => selectPerson(p.id)}
        className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1.5 text-center transition-colors hover:bg-accent/60"
      >
        <PersonAvatar
          personId={p.id}
          name={fullName(p)}
          sex={p.sex}
          className="h-16 w-16 text-lg ring-2 ring-border transition-shadow group-hover:ring-primary/50"
        />
        <span className="line-clamp-2 text-sm font-semibold leading-tight">{fullName(p)}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{lifeYears(p) || '—'}</span>
        {age != null && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {t('families.detail.ageAtWedding', { count: age })}
          </span>
        )}
      </button>
    ) : (
      <div className="flex flex-col items-center gap-1.5 p-1.5 text-center">
        <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/30 bg-muted/40" />
        <span className="text-sm italic text-muted-foreground">{t('families.unknownSpouse')}</span>
      </div>
    )

  const durationText = (): string => {
    if (row.durationYears == null) return '—'
    const years = t('families.years', { count: row.durationYears })
    if (row.ongoing) return `${years} · ${t('families.ongoing')}`
    if (row.endReason === 'divorce') return `${years} · ${t('families.detail.untilDivorce', { year: row.endYear })}`
    if (row.endReason === 'separation') return `${years} · ${t('families.detail.untilSeparation', { year: row.endYear })}`
    if (row.endReason === 'death') return `${years} · ${t('families.detail.untilDeath', { year: row.endYear })}`
    return years
  }

  const gapText = (): string | null => {
    if (row.ageGap == null) return null
    if (row.ageGap > 0) return t('families.detail.gapHusband', { count: row.ageGap })
    if (row.ageGap < 0) return t('families.detail.gapWife', { count: -row.ageGap })
    return t('families.detail.gapNone')
  }

  const firstChildText = (): string | null => {
    if (firstChildGap == null) return null
    if (firstChildGap > 0) return t('families.detail.firstChildAfter', { count: firstChildGap })
    if (firstChildGap < 0) return t('families.detail.firstChildBefore', { count: -firstChildGap })
    return t('families.detail.firstChildSameYear')
  }

  const ancestors = (ancestry?.ancestorIds ?? [])
    .map((id) => peopleById.get(id))
    .filter((p): p is Person => !!p)

  return (
    <motion.aside
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      data-testid="family-detail"
      className="absolute inset-y-0 right-0 z-20 flex w-[420px] max-w-full flex-col border-l border-border bg-background/95 shadow-2xl backdrop-blur-xl xl:static xl:z-auto xl:shadow-none"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className={cn('grid h-7 w-7 place-items-center rounded-lg', KIND_TONE[row.kind].soft)}>
          <KindIcon row={row} className={cn('h-4 w-4', KIND_TONE[row.kind].text, row.kind === 'married' && 'fill-current')} />
        </span>
        <h2 className="flex-1 truncate text-sm font-semibold">{t('person.family')}</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title={t('common.close')}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1">
            {spouse(husband, row.husbandAge)}
            <span className="mt-6 grid h-8 w-8 place-items-center rounded-full bg-card ring-1 ring-border">
              <KindIcon row={row} className={cn('h-4 w-4', KIND_TONE[row.kind].text, row.kind === 'married' && 'fill-current')} />
            </span>
            {spouse(wife, row.wifeAge)}
          </div>
          <FamilyChips row={row} ancestry={ancestry} className="justify-center" />

          <section className="space-y-3 rounded-2xl border border-border bg-card p-3">
            <Fact icon={CalendarHeart} label={t('families.detail.wedding')}>
              {row.marriageDate ? (
                <span className="tabular-nums">{fmtDate(row.marriageDate)}</span>
              ) : row.startEstimated ? (
                <span className="italic text-muted-foreground" title={t('families.estimatedStart')}>
                  ~{row.startYear} · {t('families.estimatedStart')}
                </span>
              ) : (
                <span className="italic text-muted-foreground">{t('families.noDate')}</span>
              )}
              {row.marriagePlace && (
                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {row.marriagePlace}
                </span>
              )}
            </Fact>
            <Fact icon={Hourglass} label={t('families.col.duration')}>
              {durationText()}
            </Fact>
            {gapText() && (
              <Fact icon={CalendarRange} label={t('families.stats.ageGap')}>
                {gapText()}
              </Fact>
            )}
            {firstChildText() && (
              <Fact icon={Baby} label={t('families.detail.firstChild')}>
                {firstChildText()}
              </Fact>
            )}
            {grandchildren > 0 && (
              <Fact icon={Users} label={t('families.detail.grandchildren')}>
                <span className="tabular-nums">{grandchildren}</span>
              </Fact>
            )}
          </section>

          {ancestry && (
            <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <Dna className="h-4 w-4" />
                {t('families.detail.related')}
              </p>
              <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
                {t('families.detail.relatedBody', { genA: ancestry.genA, genB: ancestry.genB })}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ancestors.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPerson(p.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-background/70 py-0.5 pl-0.5 pr-2 text-xs transition-colors hover:bg-background"
                  >
                    <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-5 w-5 text-[8px]" />
                    {fullName(p)}
                  </button>
                ))}
              </div>
              {husband && wife && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 gap-1.5 border-amber-500/40 bg-background/60 text-xs"
                  onClick={() => openKinship(wife.id, husband.id)}
                >
                  <Route className="h-3.5 w-3.5" />
                  {t('families.detail.openKinship')}
                </Button>
              )}
            </section>
          )}

          {row.events.length > 0 && (
            <section>
              <SectionTitle>{t('families.detail.events')}</SectionTitle>
              <div className="space-y-1.5">
                {row.events.map((e) => (
                  <div key={e.id} className="flex gap-2.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2">
                    <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-medium">{t(`events.type.${e.type}`, { defaultValue: e.type })}</p>
                      <p className="text-muted-foreground">
                        {[e.date ? fmtDate(e.date) : null, e.place, e.value].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>
              {t('person.children')} · {row.children.length}
            </SectionTitle>
            {row.children.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">{t('families.noChildren')}</p>
            ) : (
              <div className="space-y-1">
                {row.children.map((c) => {
                  const rel = family.childRelations?.[c.id]
                  const relType = rel?.father ?? rel?.mother ?? null
                  const own = kidsOf.get(c.id)?.size ?? 0
                  return (
                    <button
                      key={c.id}
                      onClick={() => selectPerson(c.id)}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-accent/60"
                    >
                      <PersonAvatar personId={c.id} name={fullName(c)} sex={c.sex} className="h-8 w-8 shrink-0 text-[11px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{fullName(c)}</span>
                        <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
                          {[lifeYears(c), own ? t('families.childrenN', { count: own }) : null].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                      {relType && (
                        <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          {t(`childRelation.${relType}`)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {family.notes && (
            <section>
              <SectionTitle>{t('person.notes')}</SectionTitle>
              <p className="flex gap-2 whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-xs italic text-muted-foreground">
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {family.notes}
              </p>
            </section>
          )}
        </div>
      </ScrollArea>

      <div className="flex flex-wrap gap-2 border-t border-border p-3">
        {anchorId && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => focusPersonTree(anchorId)}>
            <Network className="h-3.5 w-3.5" />
            {t('families.detail.showOnTree')}
          </Button>
        )}
        {anchorId && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSheetOpen(true)}>
            <Printer className="h-3.5 w-3.5" />
            {t('print.familySheet')}
          </Button>
        )}
        {husband && wife && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openKinship(wife.id, husband.id)}>
            <Route className="h-3.5 w-3.5" />
            {t('nav.kinship')}
          </Button>
        )}
      </div>
      {sheetOpen && anchorId && <FamilySheetDialog personId={anchorId} onClose={() => setSheetOpen(false)} />}
    </motion.aside>
  )
}
