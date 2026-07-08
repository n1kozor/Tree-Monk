import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  Baby,
  CalendarRange,
  ChevronRight,
  Church,
  Crown,
  Heart,
  Hourglass,
  Layers,
  MapPin,
  Briefcase,
  Move3d,
  Sparkles,
  TrendingUp,
  Type,
  Users,
  UsersRound,
  Route,
  type LucideIcon
} from 'lucide-react'
import type { Family, Person } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import { useDashboardSettings } from '@/store/useDashboardSettings'
import { scopePeople, type DashboardScope } from '@/lib/dashboardScope'
import { computeDashboard, type Bucket } from '@/lib/dashboard'
import { peopleFor, type Facet } from '@/lib/dashboardDrill'
import { QualityRing } from '@/components/common/QualityRing'
import { DrillDownDialog } from './DrillDownDialog'
import { RootPicker } from '@/components/tree/RootPicker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const RECORD_ICONS: Record<string, LucideIcon> = {
  users: Users, heart: Heart, crown: Crown, hourglass: Hourglass,
  baby: Baby, usersRound: UsersRound, map: MapPin, calendar: CalendarRange
}

/* ------------------------------------------------------------------ helpers */

/** Animated count-up for a headline number. */
function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / ms)
      setV(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

/** Longest parent chain in the scoped family graph = generations spanned. */
function maxGenerations(people: Person[], families: Family[]): number {
  const parents = new Map<string, string[]>()
  for (const f of families)
    for (const c of f.childIds) {
      const ps = [f.husbandId, f.wifeId].filter(Boolean) as string[]
      if (ps.length) parents.set(c, [...(parents.get(c) ?? []), ...ps])
    }
  const memo = new Map<string, number>()
  const visiting = new Set<string>()
  const depth = (id: string): number => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 1
    visiting.add(id)
    let d = 1
    for (const p of parents.get(id) ?? []) d = Math.max(d, 1 + depth(p))
    visiting.delete(id)
    memo.set(id, d)
    return d
  }
  let max = 0
  for (const p of people) max = Math.max(max, depth(p.id))
  return max
}

/* ------------------------------------------------------------ small widgets */

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

function Kpi({
  icon: Icon, label, value, sub, accent, onClick
}: {
  icon: LucideIcon; label: string; value: number | string; sub?: string; accent: string; onClick?: () => void
}): JSX.Element {
  const numeric = typeof value === 'number'
  const shown = useCountUp(numeric ? value : 0)
  return (
    <motion.button
      {...fade}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card p-4 text-left transition-all',
        onClick && 'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 cursor-pointer'
      )}
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{numeric ? shown.toLocaleString() : value}</p>
          {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${accent}1a` }}>
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </div>
      </div>
    </motion.button>
  )
}

function Panel({
  icon: Icon, title, desc, children, className
}: {
  icon?: LucideIcon; title: string; desc?: string; children: React.ReactNode; className?: string
}): JSX.Element {
  return (
    <motion.section {...fade} className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}>
      <div className="flex items-center gap-2.5 border-b border-border/60 bg-muted/30 px-4 py-3">
        {Icon && (
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {desc && <p className="truncate text-xs text-muted-foreground">{desc}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </motion.section>
  )
}

/** Ranked horizontal bar list (surnames, places, occupations…). */
function BarList({
  buckets, unit, onPick
}: {
  buckets: Bucket[]; unit: string; onPick?: (label: string) => void
}): JSX.Element {
  const max = buckets[0]?.count || 1
  if (!buckets.length) return <p className="py-6 text-center text-sm text-muted-foreground">—</p>
  return (
    <div className="space-y-1">
      {buckets.map((b, i) => (
        <button
          key={b.label + i}
          onClick={() => onPick?.(b.label)}
          disabled={!onPick}
          className={cn(
            'group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors',
            onPick && 'hover:bg-accent'
          )}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary tabular-nums">
            {i + 1}
          </span>
          <span className="w-32 shrink-0 truncate text-sm font-medium sm:w-44">{b.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${(b.count / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {b.count.toLocaleString()}
            <span className="ml-1 hidden sm:inline">{unit}</span>
          </span>
          {onPick && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground" />}
        </button>
      ))}
    </div>
  )
}

/** Vertical animated columns (births/deaths by century, lifespan bands).
 *  Bars use PIXEL heights — a percentage height would collapse to 0 against the
 *  auto-height flex column parent. */
const BAR_MAX_PX = 132
function Columns({ buckets, color = 'hsl(var(--primary))' }: { buckets: Bucket[]; color?: string }): JSX.Element {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  if (!buckets.length) return <p className="py-6 text-center text-sm text-muted-foreground">—</p>
  return (
    <div className="flex items-end gap-1.5" style={{ minHeight: BAR_MAX_PX + 34 }}>
      {buckets.map((b, i) => (
        <div key={b.label + i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{b.count}</span>
          <motion.div
            className="w-full rounded-t-md"
            style={{ background: color, minHeight: b.count > 0 ? 3 : 0 }}
            initial={{ height: 0 }}
            animate={{ height: Math.round((b.count / max) * BAR_MAX_PX) }}
            transition={{ duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            title={`${b.label}: ${b.count}`}
          />
          <span className="w-full truncate text-center text-[9px] leading-none text-muted-foreground">{b.label}</span>
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------- main view */

export function DashboardView(): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const occPersonIds = useAppStore((s) => s.occupationPersonIds)
  const treeRootId = useAppStore((s) => s.treeRootId)
  const defaultRootId = useAppStore((s) => s.defaultRootId)
  const cfg = useDashboardSettings()

  const [rootOverride, setRootOverride] = useState<string | undefined>(undefined)
  const effectiveRootId = rootOverride ?? defaultRootId ?? treeRootId

  const scoped = useMemo(
    () => scopePeople(people, families, { scope: cfg.scope, rootId: effectiveRootId, includeSpouses: cfg.includeSpouses }),
    [people, families, cfg.scope, effectiveRootId, cfg.includeSpouses]
  )
  const stats = useMemo(
    () => computeDashboard(scoped.people, scoped.families, { topN: 15, occPersonIds }),
    [scoped, occPersonIds]
  )
  const generations = useMemo(() => maxGenerations(scoped.people, scoped.families), [scoped])
  const migration = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of scoped.people) {
      const a = (p.birthPlace ?? '').trim()
      const b = (p.deathPlace ?? '').trim()
      if (!a || !b || a === b) continue
      m.set(`${a}  →  ${b}`, (m.get(`${a}  →  ${b}`) ?? 0) + 1)
    }
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((x, y) => y.count - x.count).slice(0, 15)
  }, [scoped])

  const [drill, setDrill] = useState<{ title: string; people: Person[] } | null>(null)
  const open = (facet: Facet, title: string): void => setDrill({ title, people: peopleFor(facet, scoped.people) })

  const [tab, setTab] = useState('overview')

  if (scoped.people.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted"><Sparkles className="h-7 w-7 opacity-60" /></div>
        <p className="text-sm">{t('dashboard.empty')}</p>
      </div>
    )
  }

  const span = stats.minYear && stats.maxYear ? stats.maxYear - stats.minYear : null
  const livePct = stats.total ? Math.round((stats.living / stats.total) * 100) : 0

  const TABS: [string, string, LucideIcon][] = [
    ['overview', t('dashboard.tab_overview'), Sparkles],
    ['population', t('dashboard.tab_population'), Users],
    ['names', t('dashboard.tab_names'), Type],
    ['places', t('dashboard.tab_places'), MapPin],
    ['life', t('dashboard.tab_life'), Briefcase],
    ['migration', t('dashboard.tab_migration'), Route]
  ]

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
      {/* Header: scope + analyzed banner + tab bar */}
      <div className="shrink-0 space-y-3 border-b border-border bg-background/60 px-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <RootPicker rootId={effectiveRootId} onPick={(id) => setRootOverride(id)} flat />
          <ScopeSelect value={cfg.scope} onChange={(scope) => cfg.set({ scope })} t={t} />
          <div className="flex-1" />
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-foreground">
              {t('dashboard.analyzed', { people: scoped.people.length.toLocaleString(), families: scoped.families.length.toLocaleString() })}
            </span>
          </div>
        </div>
        <TabsList className="h-auto w-full justify-start gap-0.5 overflow-x-auto rounded-none border-b-0 bg-transparent p-0">
          {TABS.map(([v, label, Icon]) => (
            <TabsTrigger
              key={v}
              value={v}
              className="gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-5xl p-4">
          {/* ---------------------------------------------------------- OVERVIEW */}
          <TabsContent value="overview" className="mt-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={Users} label={t('dashboard.kpiPeople')} value={stats.total} accent="hsl(var(--primary))" onClick={() => open({ kind: 'all' }, t('dashboard.kpiPeople'))} />
              <Kpi icon={Heart} label={t('dashboard.kpiFamilies')} value={stats.families} sub={t('dashboard.marriagesN', { count: stats.marriages })} accent="#e0679b" />
              <Kpi icon={Layers} label={t('dashboard.generations')} value={generations} accent="#35d6c4" />
              <Kpi icon={CalendarRange} label={t('dashboard.kpiTimeSpan')} value={span ? t('dashboard.yearsN', { count: span }) : '—'} sub={stats.minYear ? `${stats.minYear} – ${stats.maxYear}` : undefined} accent="#f5a524" />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Tree health */}
              <Panel icon={Sparkles} title={t('dashboard.treeHealth')} className="lg:col-span-2">
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <QualityRing value={stats.qualityScore} size={112} />
                  </div>
                  <div className="w-full space-y-2.5">
                    {stats.completeness.map((c, i) => {
                      const pct = c.total ? Math.round((c.have / c.total) * 100) : 0
                      return (
                        <button key={c.key} onClick={() => open({ kind: 'missing', field: c.key }, t(`dashboard.field.${c.key}`))} className="w-full space-y-1 rounded-lg px-1 py-0.5 text-left hover:bg-accent">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{t(`dashboard.field.${c.key}`)}</span>
                            <span className="font-bold tabular-nums text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-secondary">
                            <motion.div
                              className={cn('h-full rounded-full', pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500')}
                              initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: i * 0.05 }}
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </Panel>

              {/* Quick wins */}
              <Panel icon={TrendingUp} title={t('dashboard.quickWins')} desc={t('dashboard.quickWinsHint')}>
                <div className="space-y-1.5">
                  {[...stats.completeness]
                    .map((c) => ({ ...c, miss: c.total - c.have }))
                    .filter((c) => c.miss > 0)
                    .sort((a, b) => b.miss - a.miss)
                    .slice(0, 4)
                    .map((c) => (
                      <button key={c.key} onClick={() => open({ kind: 'missing', field: c.key }, t(`dashboard.field.${c.key}`))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-amber-500/15"><TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /></span>
                        <span className="flex-1 truncate text-muted-foreground">{t(`dashboard.field.${c.key}`)}</span>
                        <span className="text-xs font-bold tabular-nums text-foreground">+{c.miss.toLocaleString()}</span>
                      </button>
                    ))}
                </div>
              </Panel>
            </div>

            <GenderPanel stats={stats} t={t} onPick={open} />

            {stats.records.length > 0 && (
              <Panel icon={Crown} title={t('dashboard.records')}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {stats.records.map((r, i) => {
                    const Icon = RECORD_ICONS[r.icon] ?? Sparkles
                    return (
                      <button key={r.key + i} onClick={() => r.personId && selectPerson(r.personId)} disabled={!r.personId}
                        className={cn('flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-left', r.personId && 'hover:border-primary/40 hover:shadow-sm')}>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10"><Icon className="h-4 w-4 text-primary" /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{r.value}</p>
                          {r.sub && <p className="truncate text-[11px] text-muted-foreground">{r.years ? t('dashboard.yearsN', { count: Number(r.sub) || 0 }) : r.sub}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </Panel>
            )}
          </TabsContent>

          {/* -------------------------------------------------------- POPULATION */}
          <TabsContent value="population" className="mt-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={Hourglass} label={t('dashboard.avgLifespan')} value={stats.avgLifespan ? t('dashboard.yearsN', { count: stats.avgLifespan }) : '—'} accent="hsl(var(--primary))" />
              <Kpi icon={Baby} label={t('dashboard.avgChildren')} value={stats.avgChildren ?? '—'} accent="#35d6c4" />
              <Kpi icon={UsersRound} label={t('dashboard.living')} value={stats.living} sub={t('dashboard.livingPct', { count: livePct })} accent="#22c55e" onClick={() => open({ kind: 'living', living: true }, t('dashboard.living'))} />
              <Kpi icon={Hourglass} label={t('dashboard.deceased')} value={stats.deceased} accent="#94a3b8" onClick={() => open({ kind: 'living', living: false }, t('dashboard.deceased'))} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel icon={CalendarRange} title={t('dashboard.births')} desc={t('dashboard.byCentury')}><Columns buckets={stats.birthsByCentury} /></Panel>
              <Panel icon={CalendarRange} title={t('dashboard.deaths')} desc={t('dashboard.byCentury')}><Columns buckets={stats.deathsByCentury} color="#94a3b8" /></Panel>
            </div>
            <Panel icon={Hourglass} title={t('dashboard.lifespanDist')}><Columns buckets={stats.lifespanDist} color="#35d6c4" /></Panel>
          </TabsContent>

          {/* ------------------------------------------------------------- NAMES */}
          <TabsContent value="names" className="mt-0 grid gap-4 lg:grid-cols-2">
            <Panel icon={Type} title={t('dashboard.topSurnames')}>
              <BarList buckets={stats.topSurnames} unit={t('dashboard.peopleUnit')} onPick={(v) => open({ kind: 'surname', value: v }, v)} />
            </Panel>
            <Panel icon={Type} title={t('dashboard.topGivenNames')}>
              <BarList buckets={stats.topGivenNames} unit={t('dashboard.peopleUnit')} onPick={(v) => open({ kind: 'given', value: v }, v)} />
            </Panel>
          </TabsContent>

          {/* ------------------------------------------------------------ PLACES */}
          <TabsContent value="places" className="mt-0 grid gap-4 lg:grid-cols-2">
            <Panel icon={MapPin} title={t('dashboard.topPlaces')}>
              <BarList buckets={stats.topBirthPlaces} unit={t('dashboard.peopleUnit')} onPick={(v) => open({ kind: 'birthPlace', value: v }, v)} />
            </Panel>
            <Panel icon={MapPin} title={t('dashboard.topDeathPlaces')}>
              <BarList buckets={stats.topDeathPlaces} unit={t('dashboard.peopleUnit')} onPick={(v) => open({ kind: 'deathPlace', value: v }, v)} />
            </Panel>
          </TabsContent>

          {/* -------------------------------------------------------------- LIFE */}
          <TabsContent value="life" className="mt-0 grid gap-4 lg:grid-cols-2">
            <Panel icon={Briefcase} title={t('dashboard.topOccupations')}>
              <BarList buckets={stats.topOccupations} unit={t('dashboard.peopleUnit')} onPick={(v) => open({ kind: 'occupation', value: v }, v)} />
            </Panel>
            <Panel icon={Church} title={t('dashboard.religions')}>
              <BarList buckets={stats.religions} unit={t('dashboard.peopleUnit')} onPick={(v) => open({ kind: 'religion', value: v }, v)} />
            </Panel>
          </TabsContent>

          {/* --------------------------------------------------------- MIGRATION */}
          <TabsContent value="migration" className="mt-0">
            <Panel icon={Move3d} title={t('dashboard.migrationTitle')} desc={t('dashboard.migrationDesc')}>
              {migration.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('dashboard.migrationNone')}</p>
              ) : (
                <BarList buckets={migration} unit={t('dashboard.peopleUnit')} />
              )}
            </Panel>
          </TabsContent>
        </div>
      </ScrollArea>

      <DrillDownDialog
        open={!!drill}
        title={drill?.title ?? ''}
        people={drill?.people ?? []}
        onOpenChange={(v) => !v && setDrill(null)}
        onSelect={selectPerson}
      />
    </Tabs>
  )
}

/* ----------------------------------------------------------- sub components */

function ScopeSelect({
  value, onChange, t
}: {
  value: DashboardScope; onChange: (v: DashboardScope) => void; t: ReturnType<typeof useTranslation>['t']
}): JSX.Element {
  const OPTS: [DashboardScope, string][] = [
    ['all', t('dashboard.scopeAll')],
    ['blood', t('dashboard.scopeBlood')],
    ['ancestors', t('dashboard.scopeAncestors')],
    ['descendants', t('dashboard.scopeDescendants')]
  ]
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {OPTS.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function GenderPanel({
  stats, t, onPick
}: {
  stats: ReturnType<typeof computeDashboard>; t: ReturnType<typeof useTranslation>['t']; onPick: (f: Facet, title: string) => void
}): JSX.Element {
  const rows: [string, number, string, Facet][] = [
    [t('dashboard.male'), stats.males, 'hsl(var(--primary))', { kind: 'sex', sex: 'M' }],
    [t('dashboard.female'), stats.females, '#e0679b', { kind: 'sex', sex: 'F' }],
    [t('dashboard.unknownSex'), stats.unknownSex, '#94a3b8', { kind: 'sex', sex: 'U' }]
  ]
  const total = Math.max(1, stats.total)
  return (
    <Panel icon={Users} title={t('dashboard.genderSplit')}>
      <div className="space-y-2.5">
        {rows.filter((r) => r[1] > 0).map(([label, count, color, facet], i) => {
          const pct = Math.round((count / total) * 100)
          return (
            <button key={label} onClick={() => onPick(facet, label)} className="w-full space-y-1 rounded-lg px-1 py-0.5 text-left hover:bg-accent">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground tabular-nums">{count.toLocaleString()} · {pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: i * 0.06 }} />
              </div>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}
