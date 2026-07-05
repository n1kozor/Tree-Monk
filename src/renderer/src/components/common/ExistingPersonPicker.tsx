import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Users, Heart, MapPin } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { fullName, yearOf } from '@/lib/utils'
import { matchesName, nameScore } from '@/lib/nameMatch'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { Input } from '@/components/ui/input'
import type { Family, Person } from '@shared/types'

const lifespan = (p: Person): string => {
  const b = yearOf(p.birthDate)
  const d = yearOf(p.deathDate)
  return b || d ? `${b || '?'}–${d || (p.deceased ? '?' : '')}`.replace(/–$/, '') : ''
}

/**
 * Searchable list of EXISTING people. Fuzzy name match (accents / synonyms /
 * spelling drift) ranked by relevance. Picking one calls `onPick`. Reused by the
 * "attach existing person" add flows and the godparent picker.
 */
export function ExistingPersonPicker({
  onPick,
  excludeIds,
  autoFocus = true,
  placeholder
}: {
  onPick: (person: Person) => void
  excludeIds?: Set<string>
  autoFocus?: boolean
  placeholder?: string
}): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const [q, setQ] = useState('')

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  // Distinguishing details so two same-name people (e.g. two "Takács Erzsébet")
  // can be told apart: birth place, parents, and spouse.
  const details = (p: Person): { birthPlace: string | null; parents: string; spouse: string | null } => {
    const shortName = (x?: Person | null): string => (x ? fullName(x) : '')
    const asChild = families.find((f: Family) => f.childIds.includes(p.id))
    const father = asChild?.husbandId ? byId.get(asChild.husbandId) : null
    const mother = asChild?.wifeId ? byId.get(asChild.wifeId) : null
    const parents = [father, mother].map(shortName).filter(Boolean).join(' & ')
    const spouseFam = families.find((f: Family) => f.husbandId === p.id || f.wifeId === p.id)
    const spouseId = spouseFam ? (spouseFam.husbandId === p.id ? spouseFam.wifeId : spouseFam.husbandId) : null
    const spouse = spouseId ? shortName(byId.get(spouseId)) : null
    return { birthPlace: p.birthPlace, parents, spouse: spouse || null }
  }

  const results = useMemo(() => {
    const pool = excludeIds ? people.filter((p) => !excludeIds.has(p.id)) : people
    const needle = q.trim()
    if (!needle) {
      return [...pool].sort((a, b) => fullName(a).localeCompare(fullName(b))).slice(0, 60)
    }
    return pool
      .map((p) => ({ p, s: nameScore(needle, fullName(p)) }))
      .filter((x) => x.s > 0 || matchesName(needle, fullName(x.p)))
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map((x) => x.p)
  }, [people, q, excludeIds])

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? t('picker.searchPlaceholder')}
          className="pl-8"
        />
      </div>
      <div className="max-h-64 min-h-0 space-y-0.5 overflow-y-auto pr-1">
        {results.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('picker.noResults')}</p>
        ) : (
          results.map((p) => {
            const d = details(p)
            const hasMeta = d.birthPlace || d.parents || d.spouse
            return (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
              >
                <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-8 w-8 shrink-0 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm font-medium">{fullName(p)}</span>
                    {lifespan(p) && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{lifespan(p)}</span>
                    )}
                  </span>
                  {hasMeta && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      {d.birthPlace && (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{d.birthPlace}</span>
                        </span>
                      )}
                      {d.parents && (
                        <span className="inline-flex items-center gap-0.5">
                          <Users className="h-3 w-3 shrink-0" /> <span className="truncate">{d.parents}</span>
                        </span>
                      )}
                      {d.spouse && (
                        <span className="inline-flex items-center gap-0.5">
                          <Heart className="h-3 w-3 shrink-0" /> <span className="truncate">{d.spouse}</span>
                        </span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
