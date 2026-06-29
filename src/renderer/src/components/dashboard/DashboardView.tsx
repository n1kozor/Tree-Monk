import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Activity,
  Baby,
  CalendarRange,
  ChevronsDown,
  ChevronsUp,
  Church,
  Crown,
  Eye,
  EyeOff,
  FileDown,
  Globe,
  Heart,
  Hourglass,
  LayoutDashboard,
  Loader2,
  MapPin,
  Briefcase,
  Network,
  RotateCcw,
  Bird,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Type,
  Users,
  UsersRound,
  ClipboardCheck,
  X,
  type LucideIcon
} from 'lucide-react'
import type { Person } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'
import {
  DEFAULT_ORDER,
  TOP_N_MAX,
  TOP_N_MIN,
  useDashboardSettings,
  type WidgetId
} from '@/store/useDashboardSettings'
import { scopePeople, type DashboardScope } from '@/lib/dashboardScope'
import { computeDashboard, type Bucket, type DashboardStats } from '@/lib/dashboard'
import { QualityRing } from '@/components/common/QualityRing'
import { buildDashboardReportHtml } from '@/lib/dashboardReport'
import { peopleFor, centuryOf, type Facet } from '@/lib/dashboardDrill'
import { DrillDownDialog } from './DrillDownDialog'
import { RootPicker } from '@/components/tree/RootPicker'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { fullName } from '@/lib/utils'
import { cn } from '@/lib/utils'

const RECORD_ICONS: Record<string, LucideIcon> = {
  users: Users,
  heart: Heart,
  skull: Bird,
  crown: Crown,
  hourglass: Hourglass,
  activity: Activity,
  baby: Baby,
  usersRound: UsersRound,
  tag: Tag,
  map: MapPin,
  calendar: CalendarRange
}

/** Title (i18n key) + icon for every widget — used by headers and the settings list. */
const WIDGET_META: Record<WidgetId, { title: string; icon: LucideIcon }> = {
  kpis: { title: 'dashboard.overview', icon: Sparkles },
  demographics: { title: 'dashboard.demographics', icon: Users },
  records: { title: 'dashboard.records', icon: Crown },
  timeline: { title: 'dashboard.timeline', icon: CalendarRange },
  deaths: { title: 'dashboard.deathsTimeline', icon: Bird },
  lifespan: { title: 'dashboard.lifespanDist', icon: Hourglass },
  surnames: { title: 'dashboard.topSurnames', icon: Tag },
  givenNames: { title: 'dashboard.topGivenNames', icon: Type },
  places: { title: 'dashboard.topPlaces', icon: MapPin },
  deathPlaces: { title: 'dashboard.topDeathPlaces', icon: MapPin },
  occupations: { title: 'dashboard.topOccupations', icon: Briefcase },
  religions: { title: 'dashboard.religions', icon: Church },
  completeness: { title: 'dashboard.completeness', icon: ClipboardCheck }
}

/** Widgets whose internal layout needs the full page width (multi-card rows);
 *  everything else tiles into the masonry. */
const FULL_WIDTH = new Set<WidgetId>(['kpis', 'demographics', 'records'])

const SCOPES: { id: DashboardScope; icon: LucideIcon }[] = [
  { id: 'all', icon: Globe },
  { id: 'blood', icon: Network },
  { id: 'ancestors', icon: ChevronsUp },
  { id: 'descendants', icon: ChevronsDown }
]

/** Standalone Dashboard page — a scoped, reorderable summary of the tree. */
export function DashboardView(): JSX.Element {
  const { t, i18n } = useTranslation()
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const treeRootId = useAppStore((s) => s.treeRootId)
  const defaultRootId = useAppStore((s) => s.defaultRootId)

  const cfg = useDashboardSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [drill, setDrill] = useState<{ title: string; people: Person[] } | null>(null)
  const [exporting, setExporting] = useState(false)
  // A session-only override of the reference person. By default (undefined) the
  // dashboard follows the GLOBAL starting person ("me") — picking someone here is
  // a temporary view change and is NOT persisted, so it never shadows the global
  // on the next launch. (We intentionally ignore the old persisted cfg.rootId.)
  const [rootOverride, setRootOverride] = useState<string | undefined>(undefined)

  const effectiveRootId = rootOverride ?? defaultRootId ?? treeRootId

  const scoped = useMemo(
    () =>
      scopePeople(people, families, {
        scope: cfg.scope,
        rootId: effectiveRootId,
        includeSpouses: cfg.includeSpouses
      }),
    [people, families, cfg.scope, effectiveRootId, cfg.includeSpouses]
  )

  const occPersonIds = useAppStore((s) => s.occupationPersonIds)
  const stats = useMemo(
    () => computeDashboard(scoped.people, scoped.families, { topN: cfg.topN, occPersonIds }),
    [scoped, cfg.topN, occPersonIds]
  )

  // Each widget declares whether it currently has anything worth showing.
  const available: Record<WidgetId, boolean> = {
    kpis: stats.total > 0,
    demographics: stats.total > 0,
    records: stats.records.length > 0,
    timeline: stats.birthsByCentury.length > 0,
    deaths: stats.deathsByCentury.length > 0,
    lifespan: stats.lifespanDist.length > 0,
    surnames: stats.topSurnames.length > 0,
    givenNames: stats.topGivenNames.length > 0,
    places: stats.topBirthPlaces.length > 0,
    deathPlaces: stats.topDeathPlaces.length > 0,
    occupations: stats.topOccupations.length > 0,
    religions: stats.religions.length > 0,
    completeness: stats.total > 0
  }
  const visible = cfg.order.filter((id) => available[id] && !cfg.hidden.includes(id))

  // Just switch the scope — the reference person keeps following the global
  // starting person by default (the picker still lets you override it).
  const pickScope = (scope: DashboardScope): void => {
    cfg.set({ scope })
  }

  // Open the drill-down dialog with the people behind a clicked card / bar / slice.
  const openDrill = (facet: Facet, title: string): void => {
    setDrill({ title, people: peopleFor(facet, scoped.people) })
  }

  const exportPdf = async (): Promise<void> => {
    if (exporting) return
    setExporting(true)
    try {
      const scopeLabel =
        cfg.scope !== 'all' && scoped.root
          ? t('dashboard.subtitleScoped', { name: fullName(scoped.root) })
          : t('dashboard.subtitle')
      const html = buildDashboardReportHtml({
        title: t('app.name'),
        scopeLabel,
        generatedAt: new Date().toLocaleString(i18n.language),
        people: scoped.people,
        families: scoped.families,
        stats
      })
      const res = await window.api.dashboard.exportPdf(html, t('dashboard.report.fileName'))
      if (res) toast.success(t('dashboard.exported', { path: res.path }))
    } catch {
      toast.error(t('dashboard.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  if (people.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <LayoutDashboard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('dashboard.empty')}</p>
        </div>
      </div>
    )
  }

  const scopeActive = cfg.scope !== 'all' && !!scoped.root
  const subtitle = scopeActive
    ? t('dashboard.subtitleScoped', { name: fullName(scoped.root!) })
    : t('dashboard.subtitle')

  return (
    <div className="h-full overflow-y-auto px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="w-full">
        {/* ---- Header ---- */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">{t('dashboard.title')}</h2>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => void exportPdf()}
              disabled={exporting}
              title={t('dashboard.exportPdf')}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{exporting ? t('dashboard.exporting') : t('dashboard.exportPdf')}</span>
            </button>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              title={t('dashboard.settings')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                settingsOpen
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('dashboard.settings')}</span>
            </button>
          </div>
        </div>

        {/* ---- Scope bar ---- */}
        <ScopeBar
          scope={cfg.scope}
          rootId={effectiveRootId}
          includeSpouses={cfg.includeSpouses}
          scoped={scoped}
          onPickScope={pickScope}
          onPickRoot={(id) => setRootOverride(id)}
          onToggleSpouses={() => cfg.set({ includeSpouses: !cfg.includeSpouses })}
        />

        {/* ---- Settings panel ---- */}
        {settingsOpen && (
          <SettingsPanel
            available={available}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {/* ---- Widgets ---- */}
        {visible.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Network className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('dashboard.scopeEmpty')}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Wide widgets (KPI hero, demographics, notable records) span the full
                width; the rest tile into a balanced masonry that fills the page. */}
            {visible
              .filter((id) => FULL_WIDTH.has(id))
              .map((id) => (
                <Widget
                  key={id}
                  id={id}
                  stats={stats}
                  onSelectPerson={selectPerson}
                  onDrill={openDrill}
                  onHide={() => cfg.toggleWidget(id)}
                />
              ))}
            <div className="columns-1 gap-4 lg:columns-2 2xl:columns-3">
              {visible
                .filter((id) => !FULL_WIDTH.has(id))
                .map((id) => (
                  <div key={id} className="mb-4 break-inside-avoid">
                    <Widget
                      id={id}
                      stats={stats}
                      onSelectPerson={selectPerson}
                      onDrill={openDrill}
                      onHide={() => cfg.toggleWidget(id)}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <DrillDownDialog
        open={!!drill}
        title={drill?.title ?? ''}
        people={drill?.people ?? []}
        onOpenChange={(v) => !v && setDrill(null)}
        onSelect={selectPerson}
      />
    </div>
  )
}

/* ---------------- Scope bar (root + scope + spouses + summary) ---------------- */

function ScopeBar({
  scope,
  rootId,
  includeSpouses,
  scoped,
  onPickScope,
  onPickRoot,
  onToggleSpouses
}: {
  scope: DashboardScope
  rootId?: string
  includeSpouses: boolean
  scoped: ReturnType<typeof scopePeople>
  onPickScope: (s: DashboardScope) => void
  onPickRoot: (id: string) => void
  onToggleSpouses: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const needsRoot = scope !== 'all'

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {/* Scope segmented control */}
        <div className="flex items-center rounded-lg border border-border bg-background/60 p-0.5">
          {SCOPES.map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onPickScope(id)}
              title={t(`dashboard.scope.${id}`)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                scope === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t(`dashboard.scope.${id}`)}</span>
            </button>
          ))}
        </div>

        {/* Reference person */}
        <div className={cn('transition-opacity', needsRoot ? 'opacity-100' : 'opacity-50')}>
          <RootPicker rootId={rootId} onPick={onPickRoot} flat />
        </div>

        {/* Include married-in spouses */}
        {needsRoot && (
          <button
            onClick={onToggleSpouses}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              includeSpouses
                ? 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'border-border bg-background/60 text-muted-foreground hover:text-foreground'
            )}
            title={t('dashboard.includeSpousesHint')}
          >
            <Heart className={cn('h-3.5 w-3.5', includeSpouses && 'fill-current')} />
            {t('dashboard.includeSpouses')}
          </button>
        )}
      </div>

      {/* Summary line */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <strong className="font-semibold tabular-nums text-foreground">{scoped.people.length}</strong>
          {t('dashboard.peopleUnit')}
        </span>
        {!scoped.isAll && scoped.excluded > 0 && (
          <span className="flex items-center gap-1">
            <EyeOff className="h-3 w-3" />
            {t('dashboard.excludedN', { count: scoped.excluded })}
          </span>
        )}
        {includeSpouses && scoped.spousesAdded > 0 && (
          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <Heart className="h-3 w-3 fill-current" />
            {t('dashboard.spousesAddedN', { count: scoped.spousesAdded })}
          </span>
        )}
        {scoped.depth && (scoped.depth.up > 0 || scoped.depth.down > 0) && (
          <span className="flex items-center gap-1">
            <Network className="h-3 w-3" />
            {t('dashboard.generations', { up: scoped.depth.up, down: scoped.depth.down })}
          </span>
        )}
        {needsRoot && !scoped.root && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">{t('dashboard.needRoot')}</span>
        )}
      </div>
    </div>
  )
}

/* ---------------- Settings panel (top-N + widget visibility) ---------------- */

function SettingsPanel({
  available,
  onClose
}: {
  available: Record<WidgetId, boolean>
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const cfg = useDashboardSettings()

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" /> {t('dashboard.settings')}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={cfg.resetLayout}
            title={t('dashboard.resetLayout')}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('dashboard.resetLayout')}</span>
          </button>
          <button
            onClick={onClose}
            title={t('common.close')}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Items per list */}
      <label className="block space-y-1.5">
        <span className="flex items-center justify-between text-[11px] text-muted-foreground">
          {t('dashboard.itemsPerList')}
          <span className="tabular-nums text-foreground">{cfg.topN}</span>
        </span>
        <input
          type="range"
          min={TOP_N_MIN}
          max={TOP_N_MAX}
          step={1}
          value={cfg.topN}
          onChange={(e) => cfg.set({ topN: Number(e.target.value) })}
          className="tm-slider w-full max-w-xs cursor-pointer appearance-none bg-transparent"
        />
      </label>

      {/* Widget visibility */}
      <div className="mt-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('dashboard.widgets')}
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {DEFAULT_ORDER.map((id) => {
            const { title, icon: Icon } = WIDGET_META[id]
            const shown = !cfg.hidden.includes(id)
            const hasData = available[id]
            return (
              <button
                key={id}
                onClick={() => cfg.toggleWidget(id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                  shown
                    ? 'border-border bg-background/60 text-foreground hover:border-primary/40'
                    : 'border-dashed border-border bg-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', shown ? 'text-primary' : 'text-muted-foreground/60')} />
                <span className="min-w-0 flex-1 truncate">{t(title)}</span>
                {!hasData && <span className="text-[9px] uppercase text-muted-foreground/60">{t('dashboard.noData')}</span>}
                {shown ? (
                  <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------------- One draggable widget ---------------- */

function Widget({
  id,
  stats,
  onSelectPerson,
  onDrill,
  onHide
}: {
  id: WidgetId
  stats: DashboardStats
  onSelectPerson: (id: string) => void
  onDrill: (facet: Facet, title: string) => void
  onHide: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const { title, icon: Icon } = WIDGET_META[id]

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/60 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2 border-b border-border/60 bg-gradient-to-r from-card to-secondary/20 px-4 py-2.5">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t(title)}
        </h3>
        <button
          onClick={onHide}
          title={t('dashboard.hideWidget')}
          className="rounded-md p-1 text-muted-foreground/40 transition-colors hover:text-foreground"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-4">
        <WidgetBody id={id} stats={stats} onSelectPerson={onSelectPerson} onDrill={onDrill} />
      </div>
    </div>
  )
}

function WidgetBody({
  id,
  stats,
  onSelectPerson,
  onDrill
}: {
  id: WidgetId
  stats: DashboardStats
  onSelectPerson: (id: string) => void
  onDrill: (facet: Facet, title: string) => void
}): JSX.Element | null {
  switch (id) {
    case 'kpis':
      return <Kpis stats={stats} onDrill={onDrill} />
    case 'demographics':
      return <Demographics stats={stats} onDrill={onDrill} />
    case 'records':
      return <Records stats={stats} onSelectPerson={onSelectPerson} />
    case 'surnames':
      return <BarList buckets={stats.topSurnames} accent="bg-sky-500/70" onPick={(v) => onDrill({ kind: 'surname', value: v }, v)} />
    case 'givenNames':
      return <BarList buckets={stats.topGivenNames} accent="bg-indigo-500/70" onPick={(v) => onDrill({ kind: 'given', value: v }, v)} />
    case 'places':
      return <BarList buckets={stats.topBirthPlaces} accent="bg-emerald-500/70" onPick={(v) => onDrill({ kind: 'birthPlace', value: v }, v)} />
    case 'deathPlaces':
      return <BarList buckets={stats.topDeathPlaces} accent="bg-slate-500/70" onPick={(v) => onDrill({ kind: 'deathPlace', value: v }, v)} />
    case 'occupations':
      return <BarList buckets={stats.topOccupations} accent="bg-violet-500/70" onPick={(v) => onDrill({ kind: 'occupation', value: v }, v)} />
    case 'religions':
      return <BarList buckets={stats.religions} accent="bg-amber-500/70" onPick={(v) => onDrill({ kind: 'religion', value: v }, v)} />
    case 'timeline':
      return (
        <DualColumnChart
          births={stats.birthsByCentury}
          deaths={stats.deathsByCentury}
          onPickBirth={(l) => onDrill({ kind: 'birthCentury', century: centuryOf(l) }, l)}
          onPickDeath={(l) => onDrill({ kind: 'deathCentury', century: centuryOf(l) }, l)}
        />
      )
    case 'deaths':
      return <ColumnChart buckets={stats.deathsByCentury} from="from-slate-500/30" to="to-slate-500" onPick={(l) => onDrill({ kind: 'deathCentury', century: centuryOf(l) }, l)} />
    case 'lifespan':
      return <ColumnChart buckets={stats.lifespanDist} from="from-amber-400/40" to="to-amber-500" onPick={(l) => onDrill({ kind: 'lifespanBand', band: l }, l)} />
    case 'completeness':
      return <CompletenessBars stats={stats} onDrill={onDrill} />
    default:
      return null
  }
}

/* ---------------- KPI tiles ---------------- */

function Kpis({ stats, onDrill }: { stats: DashboardStats; onDrill: (f: Facet, title: string) => void }): JSX.Element {
  const { t } = useTranslation()
  const span =
    stats.minYear !== null && stats.maxYear !== null ? `${stats.minYear}–${stats.maxYear}` : '—'
  const tiles: { label: string; value: string; sub?: string; icon: LucideIcon; tint: string; facet?: Facet }[] = [
    { label: t('dashboard.kpiPeople'), value: String(stats.total), icon: Users, tint: 'text-primary', facet: { kind: 'all' } },
    { label: t('dashboard.kpiFamilies'), value: String(stats.families), sub: t('dashboard.marriagesN', { count: stats.marriages }), icon: Heart, tint: 'text-rose-500' },
    { label: t('dashboard.kpiLiving'), value: `${stats.living} / ${stats.total}`, icon: Activity, tint: 'text-emerald-500', facet: { kind: 'living', living: true } },
    { label: t('dashboard.kpiTimeSpan'), value: span, sub: stats.minYear !== null && stats.maxYear !== null ? t('dashboard.yearsN', { count: stats.maxYear - stats.minYear }) : undefined, icon: CalendarRange, tint: 'text-amber-500' }
  ]
  return (
    <div className="space-y-3">
      {/* Data-quality gauge — circular, prominent at the very top of the overview. */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-gradient-to-br from-card to-secondary/30 p-4">
        <QualityRing value={stats.qualityScore} size={72} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('quality.title')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t('quality.dashboardHint')}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const clickable = !!tile.facet
          return (
            <button
              key={tile.label}
              disabled={!clickable}
              onClick={() => tile.facet && onDrill(tile.facet, tile.label)}
              className={cn(
                'relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card to-secondary/30 p-4 text-left',
                clickable && 'cursor-pointer transition-colors hover:border-primary/50'
              )}
            >
              <tile.icon className={cn('mb-2 h-5 w-5', tile.tint)} />
              <p className="text-2xl font-bold tabular-nums leading-none">{tile.value}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </p>
              {tile.sub && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{tile.sub}</p>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Demographics (sex donut + living + averages) ---------------- */

function Demographics({ stats, onDrill }: { stats: DashboardStats; onDrill: (f: Facet, title: string) => void }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <SexDonut stats={stats} onDrill={onDrill} />
      <LivingBar stats={stats} onDrill={onDrill} />
      <div className="flex flex-col justify-center gap-3 rounded-xl border border-border bg-secondary/20 p-4">
        <Stat
          icon={Hourglass}
          tint="text-amber-500"
          label={t('dashboard.avgLifespan')}
          value={stats.avgLifespan !== null ? t('dashboard.yearsN', { count: stats.avgLifespan }) : '—'}
        />
        <Stat
          icon={Baby}
          tint="text-sky-500"
          label={t('dashboard.avgChildren')}
          value={stats.avgChildren !== null ? String(stats.avgChildren) : '—'}
        />
      </div>
    </div>
  )
}

function Stat({
  icon: Icon,
  tint,
  label,
  value
}: {
  icon: LucideIcon
  tint: string
  label: string
  value: string
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background">
        <Icon className={cn('h-4 w-4', tint)} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function SexDonut({ stats, onDrill }: { stats: DashboardStats; onDrill: (f: Facet, title: string) => void }): JSX.Element {
  const { t } = useTranslation()
  const total = stats.total || 1
  const segs = [
    { value: stats.males, color: '#0ea5e9', label: t('dashboard.male'), sex: 'M' as const },
    { value: stats.females, color: '#f43f5e', label: t('dashboard.female'), sex: 'F' as const },
    { value: stats.unknownSex, color: '#64748b', label: t('dashboard.unknownSex'), sex: 'U' as const }
  ].filter((s) => s.value > 0)
  const R = 26
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-secondary/20 p-4">
      <div className="relative h-[72px] w-[72px] shrink-0">
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          {segs.map((s) => {
            const frac = s.value / total
            const dash = frac * C
            const el = (
              <circle
                key={s.label}
                cx="36"
                cy="36"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="11"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-acc}
              />
            )
            acc += dash
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold tabular-nums">{stats.total}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {segs.map((s) => (
          <button
            key={s.label}
            onClick={() => onDrill({ kind: 'sex', sex: s.sex }, s.label)}
            className="-mx-1 flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs transition-colors hover:bg-accent/40"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular-nums">{s.value}</span>
            <span className="w-9 text-right tabular-nums text-muted-foreground">
              {Math.round((s.value / total) * 100)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function LivingBar({ stats, onDrill }: { stats: DashboardStats; onDrill: (f: Facet, title: string) => void }): JSX.Element {
  const { t } = useTranslation()
  const total = stats.total || 1
  const livePct = Math.round((stats.living / total) * 100)
  return (
    <div className="flex flex-col justify-center gap-3 rounded-xl border border-border bg-secondary/20 p-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-background">
        <div className="bg-emerald-500/80" style={{ width: `${(stats.living / total) * 100}%` }} />
        <div className="bg-slate-500/70" style={{ width: `${(stats.deceased / total) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <button
          onClick={() => onDrill({ kind: 'living', living: true }, t('dashboard.living'))}
          className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/40"
        >
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-muted-foreground">{t('dashboard.living')}</span>
          <span className="font-semibold tabular-nums">{stats.living}</span>
        </button>
        <button
          onClick={() => onDrill({ kind: 'living', living: false }, t('dashboard.deceased'))}
          className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/40"
        >
          <span className="font-semibold tabular-nums">{stats.deceased}</span>
          <span className="text-muted-foreground">{t('dashboard.deceased')}</span>
          <Bird className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        {t('dashboard.livingPct', { pct: livePct })}
      </p>
    </div>
  )
}

/* ---------------- Notable records ---------------- */

function Records({
  stats,
  onSelectPerson
}: {
  stats: DashboardStats
  onSelectPerson: (id: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stats.records.map((i) => {
        const Icon = RECORD_ICONS[i.icon] ?? Sparkles
        const clickable = !!i.personId
        const sub = i.sub ? (i.years ? `${i.sub} ${t('tree.insights.yearsUnit')}` : i.sub) : ''
        return (
          <button
            key={i.key}
            disabled={!clickable}
            onClick={() => i.personId && onSelectPerson(i.personId)}
            className={cn(
              'flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3 text-left transition-colors',
              clickable ? 'cursor-pointer hover:border-primary/50 hover:bg-accent' : 'cursor-default'
            )}
          >
            {i.personId ? (
              <PersonAvatar personId={i.personId} name={i.value} className="h-9 w-9 shrink-0 text-xs" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t(`tree.insights.${i.key}`)}
              </p>
              <p className="truncate text-sm font-semibold">{i.value}</p>
              {sub && <p className="text-xs tabular-nums text-muted-foreground">{sub}</p>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Horizontal bar list ---------------- */

function BarList({
  buckets,
  accent,
  onPick
}: {
  buckets: Bucket[]
  accent: string
  onPick?: (label: string) => void
}): JSX.Element {
  const max = Math.max(...buckets.map((b) => b.count), 1)
  return (
    <div className="space-y-2">
      {buckets.map((b) => {
        const inner = (
          <>
            <span className="w-36 shrink-0 truncate text-xs font-medium" title={b.label}>
              {b.label}
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded-md bg-secondary/40">
              <div
                className={cn('flex h-full items-center justify-end rounded-md px-2', accent)}
                style={{ width: `${Math.max((b.count / max) * 100, 8)}%` }}
              >
                <span className="text-[10px] font-bold tabular-nums text-white/90">{b.count}</span>
              </div>
            </div>
          </>
        )
        return onPick ? (
          <button
            key={b.label}
            onClick={() => onPick(b.label)}
            className="-mx-1 flex w-full items-center gap-3 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent/40"
          >
            {inner}
          </button>
        ) : (
          <div key={b.label} className="flex items-center gap-3">
            {inner}
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Column chart (births / deaths / lifespan) ---------------- */

function ColumnChart({
  buckets,
  from,
  to,
  onPick
}: {
  buckets: Bucket[]
  from: string
  to: string
  onPick?: (label: string) => void
}): JSX.Element {
  const max = Math.max(...buckets.map((b) => b.count), 1)
  return (
    <div className="flex items-end gap-2">
      {buckets.map((b) => {
        const inner = (
          <>
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{b.count}</span>
            {/* Fixed-height track so the bar's percentage height has a definite base. */}
            <div className="flex h-32 w-full items-end">
              <div
                className={cn('w-full rounded-t-md bg-gradient-to-t', from, to)}
                style={{ height: `${Math.max((b.count / max) * 100, 3)}%` }}
              />
            </div>
            <span className="w-full truncate text-center text-[10px] text-muted-foreground" title={b.label}>
              {b.label}
            </span>
          </>
        )
        return onPick ? (
          <button
            key={b.label}
            onClick={() => onPick(b.label)}
            className="flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-md py-0.5 transition-colors hover:bg-accent/40"
          >
            {inner}
          </button>
        ) : (
          <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            {inner}
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Births vs deaths by century (grouped columns) ---------------- */

function DualColumnChart({
  births,
  deaths,
  onPickBirth,
  onPickDeath
}: {
  births: Bucket[]
  deaths: Bucket[]
  onPickBirth: (label: string) => void
  onPickDeath: (label: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  // Align both series on a shared, chronologically-sorted century axis.
  const map = new Map<string, { births: number; deaths: number }>()
  const ensure = (l: string): { births: number; deaths: number } => {
    let e = map.get(l)
    if (!e) {
      e = { births: 0, deaths: 0 }
      map.set(l, e)
    }
    return e
  }
  for (const b of births) ensure(b.label).births = b.count
  for (const d of deaths) ensure(d.label).deaths = d.count
  const labels = [...map.keys()].sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  const max = Math.max(1, ...labels.map((l) => Math.max(map.get(l)!.births, map.get(l)!.deaths)))

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-primary/50 to-primary" />
          {t('person.birth')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-slate-500/40 to-slate-500" />
          {t('person.death')}
        </span>
      </div>
      <div className="flex items-end gap-2">
        {labels.map((l) => {
          const e = map.get(l)!
          return (
            <div key={l} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-36 w-full items-end justify-center gap-1">
                <button
                  onClick={() => onPickBirth(l)}
                  title={`${l} · ${t('person.birth')}: ${e.births}`}
                  className="group flex h-full flex-1 items-end rounded-t transition-colors hover:bg-accent/30"
                >
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-primary/40 to-primary transition-opacity group-hover:opacity-80"
                    style={{ height: `${Math.max((e.births / max) * 100, 2)}%` }}
                  />
                </button>
                <button
                  onClick={() => onPickDeath(l)}
                  title={`${l} · ${t('person.death')}: ${e.deaths}`}
                  className="group flex h-full flex-1 items-end rounded-t transition-colors hover:bg-accent/30"
                >
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-slate-500/30 to-slate-500 transition-opacity group-hover:opacity-80"
                    style={{ height: `${Math.max((e.deaths / max) * 100, 2)}%` }}
                  />
                </button>
              </div>
              <span className="w-full truncate text-center text-[10px] text-muted-foreground" title={l}>
                {l}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Data completeness ---------------- */

function CompletenessBars({
  stats,
  onDrill
}: {
  stats: DashboardStats
  onDrill: (f: Facet, title: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {stats.completeness.map((c) => {
        const pct = c.total ? Math.round((c.have / c.total) * 100) : 0
        const missing = c.total - c.have
        const field = t(`dashboard.field.${c.key}`)
        return (
          <button
            key={c.key}
            disabled={missing === 0}
            onClick={() => onDrill({ kind: 'missing', field: c.key }, `${field} — ${t('dashboard.drill.missing')}`)}
            className={cn(
              '-mx-1 rounded-lg px-1 py-1 text-left transition-colors',
              missing > 0 && 'hover:bg-accent/40'
            )}
            title={missing > 0 ? t('dashboard.drill.missingN', { count: missing }) : undefined}
          >
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{field}</span>
              <span className="font-semibold tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/50">
              <div
                className={cn(
                  'h-full rounded-full',
                  pct >= 66 ? 'bg-emerald-500' : pct >= 33 ? 'bg-amber-500' : 'bg-rose-500'
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}
