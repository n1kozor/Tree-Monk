import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownUp,
  BarChart3,
  ChevronDown,
  GanttChart,
  HeartHandshake,
  LayoutGrid,
  MapPin,
  Search,
  SlidersHorizontal,
  Table2,
  X,
  type LucideIcon
} from 'lucide-react'
import type { EventRecord } from '@shared/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ScopePicker, useScopedPeople } from '@/components/common/ScopePicker'
import type { DashboardScope } from '@/lib/dashboardScope'
import { useAppStore } from '@/store/useAppStore'
import { aliasMap, personScore } from '@/lib/personSearch'
import { dateSortKey } from '@/lib/dates'
import { cn, fullName } from '@/lib/utils'
import {
  buildFamilyRows,
  sharedAncestry,
  unionsPerPerson,
  type FamilyRow
} from '@/lib/familyStats'
import type { FamilySort } from './parts'
import { FamilyCards } from './FamilyCards'
import { FamilyTable } from './FamilyTable'
import { FamilyTimeline } from './FamilyTimeline'
import { FamilyInsights } from './FamilyInsights'
import { FamilyDetail } from './FamilyDetail'

type Mode = 'cards' | 'table' | 'timeline' | 'stats'
type Kind = 'all' | 'married' | 'partner' | 'other'
type Kids = 'all' | 'with' | 'without'
const TRAITS = ['related', 'divorced', 'remarriage', 'noDate', 'noPlace', 'oneSpouse'] as const
type Trait = (typeof TRAITS)[number]

const MODES: { id: Mode; icon: LucideIcon }[] = [
  { id: 'cards', icon: LayoutGrid },
  { id: 'table', icon: Table2 },
  { id: 'timeline', icon: GanttChart },
  { id: 'stats', icon: BarChart3 }
]
const SORTS: FamilySort[] = ['marriageAsc', 'marriageDesc', 'children', 'duration', 'name']

const PREFS_KEY = 'treemonk.families'
function loadPrefs(): { mode: Mode; sort: FamilySort } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')
    return {
      mode: MODES.some((m) => m.id === p?.mode) ? p.mode : 'cards',
      sort: SORTS.includes(p?.sort) ? p.sort : 'marriageAsc'
    }
  } catch {
    return { mode: 'cards', sort: 'marriageAsc' }
  }
}

/** Sortable wedding key: the exact date, else the (estimated) start year. */
function marriageKey(r: FamilyRow): number | null {
  if (r.marriageDate) return dateSortKey(r.marriageDate)
  return r.startYear != null ? r.startYear * 10000 + 9999 : null
}

/** Segmented control in the PeopleView style. */
function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            value === v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function FamiliesView(): JSX.Element {
  const { t, i18n } = useTranslation()
  const families = useAppStore((s) => s.families)
  const peopleById = useAppStore((s) => s.peopleById)
  const aliases = useAppStore((s) => s.aliases)

  const [prefs, setPrefs] = useState(loadPrefs)
  const setPref = (patch: Partial<typeof prefs>): void =>
    setPrefs((p) => {
      const next = { ...p, ...patch }
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        /* private mode — keep it for this session only */
      }
      return next
    })
  const { mode, sort } = prefs

  const [scope, setScope] = useState<DashboardScope>('all')
  const scoped = useScopedPeople(scope)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [kids, setKids] = useState<Kids>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [place, setPlace] = useState('')
  const [traits, setTraits] = useState<Set<Trait>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Divorce / separation / wedding events of every family, in one call.
  const [famEvents, setFamEvents] = useState<Map<string, EventRecord[]>>(new Map())
  useEffect(() => {
    let alive = true
    window.api.events
      .forAllFamilies()
      .then((events) => {
        if (!alive) return
        const m = new Map<string, EventRecord[]>()
        for (const e of events) {
          const arr = m.get(e.ownerId) ?? []
          arr.push(e)
          m.set(e.ownerId, arr)
        }
        setFamEvents(m)
      })
      .catch(() => {
        /* no events → divorces simply don't show */
      })
    return () => {
      alive = false
    }
  }, [families])

  const unions = useMemo(() => unionsPerPerson(families), [families])
  const allRows = useMemo(() => buildFamilyRows(families, peopleById, famEvents), [families, peopleById, famEvents])
  const ancestry = useMemo(
    () =>
      sharedAncestry(
        families,
        new Set(peopleById.keys()),
        allRows
          .filter((r) => r.husband && r.wife)
          .map((r) => ({ familyId: r.family.id, a: r.husband!.id, b: r.wife!.id }))
      ),
    [families, peopleById, allRows]
  )
  const aMap = useMemo(() => aliasMap(aliases), [aliases])

  const hasFilters = !!(q.trim() || kind !== 'all' || kids !== 'all' || from || to || place.trim() || traits.size)
  const clear = (): void => {
    setQ('')
    setKind('all')
    setKids('all')
    setFrom('')
    setTo('')
    setPlace('')
    setTraits(new Set())
  }
  const toggleTrait = (k: Trait): void =>
    setTraits((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const rows = useMemo(() => {
    const inScope = scope === 'all' ? null : new Set(scoped.families.map((f) => f.id))
    const fromY = parseInt(from, 10)
    const toY = parseInt(to, 10)
    const placeN = place.trim().toLowerCase()
    let list = allRows.filter((r) => {
      if (inScope && !inScope.has(r.family.id)) return false
      if (kind !== 'all' && r.kind !== kind) return false
      if (kids === 'with' && !r.children.length) return false
      if (kids === 'without' && r.children.length) return false
      if (!Number.isNaN(fromY) || !Number.isNaN(toY)) {
        if (r.marriageYear == null) return false
        if (!Number.isNaN(fromY) && r.marriageYear < fromY) return false
        if (!Number.isNaN(toY) && r.marriageYear > toY) return false
      }
      if (placeN && !(r.marriagePlace ?? '').toLowerCase().includes(placeN)) return false
      for (const k of traits) {
        if (k === 'related' && !ancestry.has(r.family.id)) return false
        if (k === 'divorced' && !r.divorced) return false
        if (k === 'remarriage' && !r.remarriage) return false
        if (k === 'noDate' && r.marriageDate) return false
        if (k === 'noPlace' && r.marriagePlace) return false
        if (k === 'oneSpouse' && r.husband && r.wife) return false
      }
      return true
    })

    if (q.trim()) {
      // A search orders by relevance: spouses first, then children, then the
      // wedding place. Quoted queries stay exact, as on the People page.
      const placeQ = q.trim().replace(/^["„“”»«]+|["„“”»«]+$/g, '').toLowerCase()
      const score = (r: FamilyRow): number => {
        let best = 0
        for (const p of [r.husband, r.wife]) if (p) best = Math.max(best, personScore(p, aMap.get(p.id) ?? [], q))
        for (const c of r.children) best = Math.max(best, personScore(c, aMap.get(c.id) ?? [], q) * 0.6)
        if (placeQ && (r.marriagePlace ?? '').toLowerCase().includes(placeQ)) best = Math.max(best, 30)
        return best
      }
      return list
        .map((r) => ({ r, s: score(r) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.r)
    }

    const nameOf = (r: FamilyRow): string =>
      r.husband ? fullName(r.husband) : r.wife ? fullName(r.wife) : '￿'
    const byMarriage = (a: FamilyRow, b: FamilyRow, dir: 1 | -1): number => {
      const ka = marriageKey(a)
      const kb = marriageKey(b)
      if (ka == null && kb == null) return nameOf(a).localeCompare(nameOf(b), i18n.language)
      if (ka == null) return 1
      if (kb == null) return -1
      return (ka - kb) * dir
    }
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'marriageDesc':
          return byMarriage(a, b, -1)
        case 'children':
          return b.children.length - a.children.length || byMarriage(a, b, 1)
        case 'duration':
          return (b.durationYears ?? -1) - (a.durationYears ?? -1) || byMarriage(a, b, 1)
        case 'name':
          return nameOf(a).localeCompare(nameOf(b), i18n.language)
        default:
          return byMarriage(a, b, 1)
      }
    })
    return list
  }, [allRows, scope, scoped, kind, kids, from, to, place, traits, ancestry, q, aMap, sort, i18n.language])

  const resetKey = `${mode}|${sort}|${scope}|${q}|${kind}|${kids}|${from}|${to}|${place}|${[...traits].join(',')}`
  const selectedRow = selectedId ? allRows.find((r) => r.family.id === selectedId) ?? null : null

  // Esc closes the detail panel — unless a person panel is open on top of it.
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useAppStore.getState().selectedPersonId) setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  const empty = families.length === 0

  return (
    <div className="flex h-full flex-col" data-testid="families-view">
      <div className="shrink-0 space-y-3 border-b border-border bg-background/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('families.search')}
              className="h-9 pl-9 pr-8"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <ScopePicker value={scope} onChange={setScope} />
          <Badge variant="secondary" className="gap-1.5 font-normal tabular-nums">
            <HeartHandshake className="h-3.5 w-3.5" />
            {t('families.results', { count: rows.length })}
          </Badge>
          <div className="flex-1" />
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist">
            {MODES.map(({ id, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                data-testid={`families-mode-${id}`}
                onClick={() => setPref({ mode: id })}
                title={t(`families.view.${id}`)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  mode === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden 2xl:inline">{t(`families.view.${id}`)}</span>
              </button>
            ))}
          </div>
          {mode !== 'stats' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <ArrowDownUp className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t(`families.sort.${sort}`)}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('people.sortLabel')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SORTS.map((k) => (
                  <DropdownMenuItem
                    key={k}
                    onClick={() => setPref({ sort: k })}
                    className={cn(sort === k && 'font-semibold text-primary')}
                  >
                    {t(`families.sort.${k}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Kind>
            value={kind}
            onChange={setKind}
            options={[
              ['all', t('families.kind.all')],
              ['married', t('relationship.married')],
              ['partner', t('relationship.partner')],
              ['other', t('families.kind.other')]
            ]}
          />
          <Segmented<Kids>
            value={kids}
            onChange={setKids}
            options={[
              ['all', t('families.kids.all')],
              ['with', t('families.kids.with')],
              ['without', t('families.kids.without')]
            ]}
          />
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-0.5">
            <span className="text-xs text-muted-foreground">{t('person.marriage')}</span>
            <Input
              type="number"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="—"
              className="h-7 w-16 border-0 bg-transparent px-1 text-center text-xs shadow-none focus-visible:ring-0"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="—"
              className="h-7 w-16 border-0 bg-transparent px-1 text-center text-xs shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder={t('person.place')}
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t('families.traitsLabel')}
                {traits.size > 0 && (
                  <Badge variant="default" className="h-4 min-w-4 justify-center px-1 text-[10px]">
                    {traits.size}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>{t('families.traitsLabel')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {TRAITS.map((k) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={traits.has(k)}
                  onCheckedChange={() => toggleTrait(k)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {t(`families.trait.${k}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={clear}>
              <X className="h-3.5 w-3.5" />
              {t('people.clear')}
            </Button>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <HeartHandshake className="h-7 w-7 opacity-60" />
              </div>
              <p className="text-sm font-medium text-foreground">{t('families.empty')}</p>
              <p className="max-w-md text-xs">{t('families.emptyHint')}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <HeartHandshake className="h-7 w-7 opacity-60" />
              </div>
              <p className="text-sm">{t('families.noMatch')}</p>
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={clear}>
                  {t('people.clear')}
                </Button>
              )}
            </div>
          ) : mode === 'table' ? (
            <FamilyTable
              rows={rows}
              ancestry={ancestry}
              selectedId={selectedId}
              onSelect={setSelectedId}
              sort={sort}
              onSort={(s) => setPref({ sort: s })}
              resetKey={resetKey}
            />
          ) : mode === 'timeline' ? (
            <FamilyTimeline rows={rows} selectedId={selectedId} onSelect={setSelectedId} resetKey={resetKey} />
          ) : mode === 'stats' ? (
            <FamilyInsights
              rows={rows}
              ancestry={ancestry}
              unions={unions}
              onSelect={setSelectedId}
              onShowRelated={() => {
                setTraits(new Set<Trait>(['related']))
                setPref({ mode: 'cards' })
              }}
            />
          ) : (
            <FamilyCards
              rows={rows}
              ancestry={ancestry}
              selectedId={selectedId}
              onSelect={setSelectedId}
              resetKey={resetKey}
            />
          )}
        </div>
        {selectedRow && (
          <FamilyDetail
            key={selectedRow.family.id}
            row={selectedRow}
            ancestry={ancestry.get(selectedRow.family.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
