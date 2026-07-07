import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, ChevronDown, MapPin, Plus, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn, fullName, yearOf } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { aliasMap, personScore } from '@/lib/personSearch'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import type { Person } from '@shared/types'

type SortKey = 'name' | 'birthAsc' | 'birthDesc'

export function PeopleView(): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const aliases = useAppStore((s) => s.aliases)
  const families = useAppStore((s) => s.families)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const refreshPeople = useAppStore((s) => s.refreshPeople)
  const [q, setQ] = useState('')
  const [sex, setSex] = useState<'' | 'M' | 'F'>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [place, setPlace] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  // Missing-data filter: every selected criterion must be missing (AND).
  const MISSING = ['birthDate', 'birthPlace', 'deathDate', 'deathPlace', 'parents', 'photo'] as const
  type MissingKey = (typeof MISSING)[number]
  const [missing, setMissing] = useState<Set<MissingKey>>(new Set())
  const toggleMissing = (k: MissingKey): void =>
    setMissing((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const childOf = useMemo(() => {
    const set = new Set<string>()
    for (const f of families) for (const c of f.childIds) set.add(c)
    return set
  }, [families])

  const aMap = useMemo(() => aliasMap(aliases), [aliases])
  const hasFilters = !!(q.trim() || sex || from || to || place.trim() || missing.size)

  const filtered = useMemo(() => {
    const fromY = parseInt(from, 10)
    const toY = parseInt(to, 10)
    const placeN = place.trim().toLowerCase()
    let list = people.filter((p) => {
      if (sex && p.sex !== sex) return false
      if (!Number.isNaN(fromY) || !Number.isNaN(toY)) {
        const ys = yearOf(p.birthDate)
        const by = ys ? Number(ys) : NaN
        if (Number.isNaN(by)) return false
        if (!Number.isNaN(fromY) && by < fromY) return false
        if (!Number.isNaN(toY) && by > toY) return false
      }
      if (placeN) {
        const bp = (p.birthPlace ?? '').toLowerCase()
        const dp = (p.deathPlace ?? '').toLowerCase()
        if (!bp.includes(placeN) && !dp.includes(placeN)) return false
      }
      for (const k of missing) {
        // Death fields only count as "missing" for people recorded as deceased —
        // a living person having no death date is not a research gap.
        const dead = p.deceased || !!p.deathDate
        if (k === 'birthDate' && p.birthDate) return false
        if (k === 'birthPlace' && p.birthPlace) return false
        if (k === 'deathDate' && (!dead || p.deathDate)) return false
        if (k === 'deathPlace' && (!dead || p.deathPlace)) return false
        if (k === 'parents' && childOf.has(p.id)) return false
        if (k === 'photo' && p.profilePhotoId) return false
      }
      return true
    })
    if (q.trim()) {
      // A search query orders by relevance; otherwise the chosen sort applies.
      list = list
        .map((p) => ({ p, s: personScore(p, aMap.get(p.id) ?? [], q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.p)
    } else {
      const by = (p: Person): number => {
        const y = yearOf(p.birthDate)
        return y ? Number(y) : NaN
      }
      list = [...list].sort((a, b) => {
        if (sort === 'name') return fullName(a).localeCompare(fullName(b))
        const ya = by(a)
        const yb = by(b)
        // People without a birth year sink to the bottom either way.
        if (Number.isNaN(ya) && Number.isNaN(yb)) return fullName(a).localeCompare(fullName(b))
        if (Number.isNaN(ya)) return 1
        if (Number.isNaN(yb)) return -1
        return sort === 'birthAsc' ? ya - yb : yb - ya
      })
    }
    return list
  }, [people, q, aMap, sex, from, to, place, missing, childOf, sort])

  // Windowed rendering: a tree with thousands of people must not mount thousands
  // of avatar cards (and image decodes) at once. Grow as the user scrolls.
  const PAGE = 120
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setLimit(PAGE), [q, sex, from, to, place, missing, sort, people.length])
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || limit >= filtered.length) return
    const io = new IntersectionObserver(
      (es) => es[0]?.isIntersecting && setLimit((l) => Math.min(l + PAGE, filtered.length)),
      { rootMargin: '800px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [limit, filtered.length])
  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit])

  const clear = (): void => {
    setQ('')
    setSex('')
    setFrom('')
    setTo('')
    setPlace('')
    setMissing(new Set())
  }

  const onAdd = async (): Promise<void> => {
    const p = await window.api.people.create({ givenName: '', surname: '' })
    await refreshPeople()
    selectPerson(p.id)
  }

  // One-line lifespan: "1850 – 1900", "* 1850", "1850 – ?", or "—".
  const lifespan = (p: Person): string => {
    const b = yearOf(p.birthDate)
    const d = yearOf(p.deathDate)
    const dead = p.deceased || !!p.deathDate
    if (b && d) return `${b} – ${d}`
    if (b) return dead ? `${b} – ?` : `* ${b}`
    if (d) return `? – ${d}`
    return dead ? '†' : '—'
  }

  const SEXES: [('' | 'M' | 'F'), string][] = [
    ['', t('people.anySex')],
    ['M', t('person.male')],
    ['F', t('person.female')]
  ]
  const SORTS: [SortKey, string][] = [
    ['name', t('people.sortName')],
    ['birthAsc', t('people.sortBirthAsc')],
    ['birthDesc', t('people.sortBirthDesc')]
  ]

  return (
    <div className="flex h-full flex-col">
      {/* Header: search + actions, then a single tidy filter row. */}
      <div className="shrink-0 space-y-3 border-b border-border bg-background/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('common.search')}
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
          <Badge variant="secondary" className="gap-1.5 font-normal tabular-nums">
            <Users className="h-3.5 w-3.5" />
            {t('people.results', { count: filtered.length })}
          </Badge>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <ArrowDownUp className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{SORTS.find((s) => s[0] === sort)?.[1]}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('people.sortLabel')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SORTS.map(([k, label]) => (
                <DropdownMenuItem key={k} onClick={() => setSort(k)} className={cn(sort === k && 'font-semibold text-primary')}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="h-9 gap-2" onClick={onAdd} data-testid="people-add">
            <Plus className="h-4 w-4" />
            {t('common.add')}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sex — a connected segmented control. */}
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {SEXES.map(([v, label]) => (
              <button
                key={v || 'any'}
                onClick={() => setSex(v)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  sex === v
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Birth-year range. */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-0.5">
            <span className="text-xs text-muted-foreground">{t('person.birth')}</span>
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

          {/* Place. */}
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder={t('person.place')}
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>

          {/* Missing-data (research gaps) — tucked into a dropdown. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t('people.missingLabel')}
                {missing.size > 0 && (
                  <Badge variant="default" className="h-4 min-w-4 justify-center px-1 text-[10px]">
                    {missing.size}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>{t('people.missingLabel')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MISSING.map((k) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={missing.has(k)}
                  onCheckedChange={() => toggleMissing(k)}
                  onSelect={(e) => e.preventDefault()}
                  className="capitalize"
                >
                  {t(`people.missing.${k}`)}
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

      {/* Grid of uniform person cards. */}
      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Users className="h-7 w-7 opacity-60" />
          </div>
          <p className="text-sm">{t('people.noMatch')}</p>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clear}>
              {t('people.clear')}
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-2.5 p-4">
            {shown.map((p) => {
              const meta = p.birthPlace || p.deathPlace || p.occupation || ''
              return (
                <button
                  key={p.id}
                  onClick={() => selectPerson(p.id)}
                  className="group flex h-[76px] items-center gap-3 overflow-hidden rounded-xl border border-border bg-card px-3 text-left transition-all hover:border-primary/50 hover:shadow-md hover:shadow-primary/5"
                >
                  <PersonAvatar
                    personId={p.id}
                    name={fullName(p)}
                    sex={p.sex}
                    className="h-12 w-12 shrink-0 text-base ring-1 ring-border transition-shadow group-hover:ring-primary/40"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">{fullName(p) || '—'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">{lifespan(p)}</p>
                    {meta && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground/80">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{meta}</span>
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          {limit < filtered.length && (
            <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground tabular-nums">
              {limit} / {filtered.length}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  )
}
