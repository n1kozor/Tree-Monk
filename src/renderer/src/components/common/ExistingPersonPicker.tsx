import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { fullName, yearOf } from '@/lib/utils'
import { matchesName, nameScore } from '@/lib/nameMatch'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { Input } from '@/components/ui/input'
import type { Person } from '@shared/types'

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
  const [q, setQ] = useState('')

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
          results.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
            >
              <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-7 w-7 text-[10px]" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{fullName(p)}</span>
              {lifespan(p) && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{lifespan(p)}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
