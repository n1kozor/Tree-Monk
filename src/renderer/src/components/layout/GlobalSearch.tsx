import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Search } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { aliasMap, personScore } from '@/lib/personSearch'
import { norm } from '@/lib/nameMatch'
import { cn, fullName, yearOf } from '@/lib/utils'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import type { Person } from '@shared/types'

type Result =
  | { kind: 'person'; id: string; person: Person; label: string; hint: string }
  | { kind: 'document'; id: string; label: string; hint: string }

/** Always-visible global search in the top bar: live results for people and
 *  documents as you type, opening the matching entity on select. */
export function GlobalSearch(): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const aliases = useAppStore((s) => s.aliases)
  const documents = useAppStore((s) => s.documents)
  const openProfile = useAppStore((s) => s.openProfile)
  const openDocument = useAppStore((s) => s.openDocument)

  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const results = useMemo<Result[]>(() => {
    const query = q.trim()
    if (query.length < 2) return []
    const am = aliasMap(aliases)
    const ppl = people
      .map((p) => ({ p, score: personScore(p, am.get(p.id) ?? [], query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(
        ({ p }): Result => ({
          kind: 'person',
          id: p.id,
          person: p,
          label: fullName(p),
          hint: [yearOf(p.birthDate), p.deathDate ? yearOf(p.deathDate) : '']
            .filter(Boolean)
            .join('–')
        })
      )
    const nq = norm(query)
    const docs = documents
      .filter((d) => norm(d.title || '').includes(nq) || norm(d.description ?? '').includes(nq))
      .slice(0, 4)
      .map(
        (d): Result => ({
          kind: 'document',
          id: d.id,
          label: d.title || '—',
          hint: d.date ? yearOf(d.date) : ''
        })
      )
    return [...ppl, ...docs]
  }, [q, people, aliases, documents])

  useEffect(() => setActive(0), [q])

  // Close the dropdown when clicking outside the search.
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  const choose = (r: Result): void => {
    if (r.kind === 'person') openProfile(r.id)
    else openDocument(r.id)
    setQ('')
    setOpen(false)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[active]
      if (r) choose(r)
    }
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={t('search.placeholder')}
        className="h-9 w-full rounded-full bg-secondary/40 pl-8 pr-3 text-sm outline-none backdrop-blur-sm transition-colors placeholder:text-muted-foreground focus:bg-secondary/60 focus:ring-1 focus:ring-primary/30"
      />
      {open && q.trim().length >= 2 && (
        <div className="glass-strong absolute left-0 right-0 top-11 z-50 max-h-[60vh] overflow-y-auto rounded-2xl p-1">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">{t('search.empty')}</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.kind + r.id}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors',
                  i === active ? 'bg-accent' : 'hover:bg-accent/60'
                )}
              >
                {r.kind === 'person' ? (
                  <PersonAvatar personId={r.id} name={r.label} sex={r.person.sex} className="h-6 w-6 shrink-0 text-[9px]" />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm">{r.label}</span>
                {r.hint && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{r.hint}</span>}
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                  {r.kind === 'person' ? t('search.person') : t('search.document')}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
