import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, fullName, yearOf } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import type { ResearchLog, ResearchResult } from '@shared/types'

/**
 * Research overview — every research note across the whole tree in one place,
 * grouped by person, so open leads are never buried inside individual profiles.
 * Filter by outcome or free text; click a person to open their panel.
 */

const RESULTS: ResearchResult[] = ['negative', 'positive', 'inconclusive']
const RESULT_TONE: Record<ResearchResult, string> = {
  negative: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  positive: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  inconclusive: 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
}

export function ResearchView(): JSX.Element {
  const { t } = useTranslation()
  const logs = useAppStore((s) => s.researchLogs)
  const peopleById = useAppStore((s) => s.peopleById)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const [q, setQ] = useState('')
  const [result, setResult] = useState<ResearchResult | ''>('')

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match = (l: ResearchLog): boolean => {
      if (result && l.result !== result) return false
      if (!needle) return true
      const person = l.personId ? peopleById.get(l.personId) : undefined
      return [l.title, l.repository, l.sourceDesc, l.detail, person ? fullName(person) : '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    }
    const byPerson = new Map<string, ResearchLog[]>()
    for (const l of logs) {
      if (!match(l)) continue
      const key = l.personId ?? '__general__'
      const arr = byPerson.get(key) ?? []
      arr.push(l)
      byPerson.set(key, arr)
    }
    // Newest activity first within a group; groups by person name (general last).
    const entries = [...byPerson.entries()].map(([key, list]) => ({
      key,
      person: key === '__general__' ? undefined : peopleById.get(key),
      list: [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    }))
    entries.sort((a, b) => {
      if (!a.person && b.person) return 1
      if (a.person && !b.person) return -1
      return (a.person ? fullName(a.person) : '').localeCompare(b.person ? fullName(b.person) : '')
    })
    return entries
  }, [logs, q, result, peopleById])

  const total = useMemo(() => groups.reduce((n, g) => n + g.list.length, 0), [groups])

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-border/60 p-4">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="h-4 w-4 text-primary" />
            {t('researchView.title')}
          </h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('researchView.count', { count: total })}
          </span>
          <div className="flex-1" />
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('common.search')}
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setResult('')}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              result === ''
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border/60 text-muted-foreground hover:bg-accent'
            )}
          >
            {t('researchView.all')}
          </button>
          {RESULTS.map((r) => (
            <button
              key={r}
              onClick={() => setResult((prev) => (prev === r ? '' : r))}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                result === r
                  ? 'border-transparent ' + RESULT_TONE[r]
                  : 'border-border/60 text-muted-foreground hover:bg-accent'
              )}
            >
              {t(`research.${r}`)}
            </button>
          ))}
          {(q || result) && (
            <button
              onClick={() => {
                setQ('')
                setResult('')
              }}
              className="ml-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> {t('people.clear')}
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          {groups.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">{t('researchView.empty')}</p>
          )}
          {groups.map((g) => (
            <section key={g.key} className="glass overflow-hidden rounded-2xl">
              <button
                onClick={() => g.person && selectPerson(g.person.id)}
                disabled={!g.person}
                className={cn(
                  'flex w-full items-center gap-2.5 border-b border-border/40 px-3.5 py-2.5 text-left',
                  g.person && 'transition-colors hover:bg-accent/50'
                )}
              >
                {g.person ? (
                  <>
                    <PersonAvatar
                      personId={g.person.id}
                      name={fullName(g.person)}
                      sex={g.person.sex}
                      className="h-7 w-7 text-[10px]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{fullName(g.person)}</span>
                      <span className="block text-[11px] tabular-nums text-muted-foreground">
                        {yearOf(g.person.birthDate)}
                        {g.person.deathDate ? `–${yearOf(g.person.deathDate)}` : ''}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="flex-1 text-sm font-semibold text-muted-foreground">
                    {t('researchView.general')}
                  </span>
                )}
                <span className="shrink-0 rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {g.list.length}
                </span>
              </button>
              <div className="divide-y divide-border/30">
                {g.list.map((l) => (
                  <div key={l.id} className="px-3.5 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] tabular-nums text-muted-foreground">{l.date}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.title || '—'}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          RESULT_TONE[l.result]
                        )}
                      >
                        {t(`research.${l.result}`)}
                      </span>
                    </div>
                    {(l.repository || l.sourceDesc || l.dateRange) && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {[l.repository, l.sourceDesc, l.dateRange].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {l.detail && (
                      <p className="mt-0.5 whitespace-pre-wrap text-xs text-foreground/85">{l.detail}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
