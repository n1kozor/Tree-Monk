import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Baby,
  BarChart3,
  CalendarHeart,
  CalendarRange,
  Dna,
  Heart,
  HeartCrack,
  HeartHandshake,
  Hourglass,
  Route,
  Trophy,
  Users,
  type LucideIcon
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { BarList, Columns, Kpi, Panel } from '@/components/dashboard/DashboardView'
import { useAppStore } from '@/store/useAppStore'
import { fullName } from '@/lib/utils'
import {
  ANCESTRY_MAX_GEN,
  computeFamilyStats,
  type FamilyRecord,
  type FamilyRow,
  type SharedAncestry
} from '@/lib/familyStats'
import { CoupleAvatars, coupleName } from './parts'

export function FamilyInsights({
  rows,
  ancestry,
  unions,
  onSelect,
  onShowRelated
}: {
  rows: FamilyRow[]
  ancestry: Map<string, SharedAncestry>
  unions: ReadonlyMap<string, number>
  onSelect: (id: string) => void
  onShowRelated: () => void
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const peopleById = useAppStore((s) => s.peopleById)
  const openKinship = useAppStore((s) => s.openKinship)
  const stats = useMemo(() => computeFamilyStats(rows, unions), [rows, unions])
  const unknown = t('families.unknownSpouse')

  const nf1 = useMemo(
    () => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [i18n.language]
  )
  const one = (v: number | null): string => (v == null ? '—' : nf1.format(v))
  const pct = (part: number, whole: number): string =>
    whole ? new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 }).format(part / whole) : '—'

  const monthNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language, { month: 'short' })
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(2000, i, 1)))
  }, [i18n.language])

  const related = useMemo(() => rows.filter((r) => ancestry.has(r.family.id)), [rows, ancestry])

  const records: { key: string; icon: LucideIcon; label: string; rec: FamilyRecord | null; value: (v: number) => string }[] = [
    { key: 'largest', icon: Users, label: t('families.stats.recLargest'), rec: stats.records.largest, value: (v) => t('families.childrenN', { count: v }) },
    { key: 'longest', icon: Hourglass, label: t('families.stats.recLongest'), rec: stats.records.longest, value: (v) => t('families.years', { count: v }) },
    { key: 'bride', icon: Heart, label: t('families.stats.recYoungestBride'), rec: stats.records.youngestBride, value: (v) => t('families.aged', { count: v }) },
    { key: 'groom', icon: Heart, label: t('families.stats.recYoungestGroom'), rec: stats.records.youngestGroom, value: (v) => t('families.aged', { count: v }) },
    { key: 'gap', icon: CalendarRange, label: t('families.stats.recAgeGap'), rec: stats.records.ageGap, value: (v) => t('families.years', { count: v }) }
  ]

  const kinds = [
    { label: t('relationship.married'), count: stats.kinds.married },
    { label: t('relationship.partner'), count: stats.kinds.partner },
    { label: t('families.kind.other'), count: stats.kinds.other }
  ]
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count)

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          <Kpi icon={HeartHandshake} label={t('dashboard.kpiFamilies')} value={stats.total} accent="#0d9488" />
          <Kpi
            icon={Baby}
            label={t('families.stats.withChildren')}
            value={stats.withChildren}
            sub={pct(stats.withChildren, stats.total)}
            accent="#ec4899"
          />
          <Kpi icon={Users} label={t('dashboard.avgChildren')} value={one(stats.avgChildren)} accent="#6366f1" />
          <Kpi
            icon={Hourglass}
            label={t('families.stats.avgDuration')}
            value={stats.avgDuration == null ? '—' : t('families.years', { count: Math.round(stats.avgDuration) })}
            accent="#f59e0b"
          />
          <Kpi
            icon={CalendarHeart}
            label={t('families.stats.avgAges')}
            value={`${one(stats.avgAgeHusband)} / ${one(stats.avgAgeWife)}`}
            sub={t('families.stats.avgAgesSub')}
            accent="#8b5cf6"
          />
          <Kpi
            icon={Dna}
            label={t('families.stats.related')}
            value={related.length}
            sub={t('families.stats.relatedSub', { count: ANCESTRY_MAX_GEN })}
            accent="#e11d48"
            onClick={related.length ? onShowRelated : undefined}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel icon={BarChart3} title={t('families.stats.decades')} className="xl:col-span-2">
            <Columns buckets={stats.decades} />
          </Panel>
          <Panel icon={CalendarHeart} title={t('families.stats.months')} desc={t('families.stats.monthsHint')}>
            {stats.datedMonths ? (
              <Columns buckets={stats.months.map((count, i) => ({ label: monthNames[i], count }))} color="#ec4899" />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('families.stats.noMonths')}</p>
            )}
          </Panel>
          <Panel icon={Baby} title={t('families.stats.childrenDist')}>
            <Columns buckets={stats.childrenHistogram} color="#6366f1" />
          </Panel>
          <Panel icon={CalendarRange} title={t('families.stats.ageGap')} desc={t('families.stats.ageGapDesc')}>
            <Columns
              buckets={['wifeOlder', '0–4', '5–9', '10–14', '15+'].map((label, i) => ({
                label: label === 'wifeOlder' ? t('families.stats.gapWifeOlder') : label,
                count: stats.ageGaps[i]
              }))}
              color="#8b5cf6"
            />
          </Panel>
          <Panel icon={HeartHandshake} title={t('families.stats.kinds')}>
            <BarList buckets={kinds} unit="" />
            <div className="mt-3 grid gap-2 border-t border-border/60 pt-3 text-sm sm:grid-cols-2">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <HeartCrack className="h-4 w-4 text-rose-500" />
                {t('families.stats.divorces')}: <b className="text-foreground tabular-nums">{stats.divorced}</b>
              </span>
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 text-primary" />
                {t('families.stats.remarried', { count: stats.remarriedPeople })}
              </span>
            </div>
          </Panel>
          <Panel icon={Trophy} title={t('families.stats.records')}>
            <div className="space-y-1">
              {records.map(({ key, icon: Icon, label, rec, value }) => (
                <button
                  key={key}
                  disabled={!rec}
                  onClick={() => rec && onSelect(rec.row.family.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors enabled:hover:bg-accent disabled:opacity-50"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted-foreground">{label}</span>
                    <span className="block truncate text-sm font-medium">
                      {rec ? coupleName(rec.row, unknown) : '—'}
                    </span>
                  </span>
                  {rec && (
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">{value(rec.value)}</span>
                  )}
                </button>
              ))}
            </div>
          </Panel>
          <Panel
            icon={Dna}
            title={t('families.stats.relatedList')}
            desc={t('families.stats.relatedDesc', { count: ANCESTRY_MAX_GEN })}
            className="xl:col-span-2"
          >
            {related.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t('families.stats.relatedNone', { count: ANCESTRY_MAX_GEN })}
              </p>
            ) : (
              <div className="grid gap-1 lg:grid-cols-2">
                {related.slice(0, 60).map((r) => {
                  const a = ancestry.get(r.family.id)!
                  const names = a.ancestorIds
                    .map((id) => peopleById.get(id))
                    .filter((p): p is NonNullable<typeof p> => !!p)
                    .map((p) => fullName(p))
                    .join(' & ')
                  return (
                    <div key={r.family.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-accent/60">
                      <button
                        onClick={() => onSelect(r.family.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <CoupleAvatars row={r} size="h-8 w-8" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{coupleName(r, unknown)}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {t('families.commonAncestor', { names })} ·{' '}
                            {t('families.generationsUp', { genA: a.genA, genB: a.genB })}
                          </span>
                        </span>
                      </button>
                      {r.husband && r.wife && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          title={t('families.detail.openKinship')}
                          onClick={() => openKinship(r.wife!.id, r.husband!.id)}
                        >
                          <Route className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </ScrollArea>
  )
}
