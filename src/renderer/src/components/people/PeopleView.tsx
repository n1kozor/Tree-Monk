import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, fullName, yearOf } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { aliasMap, personScore } from '@/lib/personSearch'
import { PersonAvatar } from '@/components/common/PersonAvatar'

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
      list = list
        .map((p) => ({ p, s: personScore(p, aMap.get(p.id) ?? [], q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.p)
    }
    return list
  }, [people, q, aMap, sex, from, to, place, missing, childOf])

  // Windowed rendering: a tree with thousands of people must not mount thousands
  // of avatar cards (and image decodes) at once. Grow as the user scrolls.
  const PAGE = 120
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setLimit(PAGE), [q, sex, from, to, place, missing, people.length])
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

  const sexBtn = (value: '' | 'M' | 'F', label: string): JSX.Element => (
    <button
      onClick={() => setSex(value)}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
        sex === value ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="pl-8" />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('people.results', { count: filtered.length })}
          </span>
          <div className="flex-1" />
          <Button size="sm" className="gap-2" onClick={onAdd} data-testid="people-add">
            <Plus className="h-4 w-4" />
            {t('common.add')}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1">
            {sexBtn('', t('people.anySex'))}
            {sexBtn('M', t('person.male'))}
            {sexBtn('F', t('person.female'))}
          </div>
          <div className="h-5 w-px bg-border" />
          <span className="text-muted-foreground">{t('person.birth')}:</span>
          <Input
            type="number"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder={t('person.from')}
            className="h-8 w-20 text-xs"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t('person.to')}
            className="h-8 w-20 text-xs"
          />
          <Input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder={t('person.place')}
            className="h-8 w-44 text-xs"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={clear}>
              <X className="h-3.5 w-3.5" />
              {t('people.clear')}
            </Button>
          )}
        </div>

        {/* Missing-data filter — surface the research gaps. */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{t('people.missingLabel')}:</span>
          {MISSING.map((k) => (
            <button
              key={k}
              onClick={() => toggleMissing(k)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                missing.has(k)
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  : 'border-border/60 text-muted-foreground hover:bg-accent'
              )}
            >
              {t(`people.missing.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-4">
          {shown.map((p) => (
            <button
              key={p.id}
              onClick={() => selectPerson(p.id)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50"
            >
              <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-12 w-12 text-base" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{fullName(p)}</p>
                <p className="text-xs text-muted-foreground">
                  {yearOf(p.birthDate)}
                  {p.deathDate ? `–${yearOf(p.deathDate)}` : ''}
                  {p.birthPlace ? ` · ${p.birthPlace}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
        {limit < filtered.length && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {t('documents.loadingMore', { shown: limit, total: filtered.length, defaultValue: '{{shown}} / {{total}}' })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
