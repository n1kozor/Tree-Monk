import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Baby, Check, Heart, Search, Users, X, type LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName, yearOf } from '@/lib/utils'
import { matchesName, nameScore } from '@/lib/nameMatch'
import type { Family, Person } from '@shared/types'

const lifespan = (p: Person): string => {
  const b = yearOf(p.birthDate)
  const d = yearOf(p.deathDate)
  return b || d ? `${b || '?'}–${d || (p.deceased ? '?' : '')}`.replace(/–$/, '') : ''
}

interface RelGroup {
  key: string
  label: string
  icon: LucideIcon
  people: Person[]
}

/**
 * After attaching an item (a document/link, or a source/citation) to one person,
 * offer to attach the SAME item to others — spouse, parents and children as
 * one-tap quick picks (multi-select), plus a full person search. Confirming runs
 * the caller's `attach(personId)` for every chosen person (idempotent on the
 * backend). Purely additive: skipping changes nothing.
 */
export function AttachToPeopleDialog({
  open,
  onClose,
  sourcePersonId,
  attach,
  label,
  onAttached,
  currentIds,
  onDetach
}: {
  open: boolean
  onClose: () => void
  /** The person the item relates to — used for relatives quick-picks + exclusion.
   *  Omitted in the library view (no anchor person) → search only. */
  sourcePersonId?: string
  /** Attaches the item to one more person (document link or citation). */
  attach: (personId: string) => Promise<void>
  /** What the item is (title / URL) — shown in the header. */
  label: string
  onAttached: () => Promise<void> | void
  /** MANAGE mode: the people currently attached (shown as removable chips). When
   *  omitted, the dialog is the post-add "attach to others too?" prompt. */
  currentIds?: string[]
  /** Detach handler (manage mode) — removes the item from one person. */
  onDetach?: (personId: string) => Promise<void>
}): JSX.Element {
  const { t } = useTranslation()
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const manage = currentIds !== undefined
  // Live set of the people currently attached (manage mode) so detach/add reflect
  // immediately without waiting for a parent refetch.
  const [attached, setAttached] = useState<Set<string>>(new Set(currentIds ?? []))
  useEffect(() => setAttached(new Set(currentIds ?? [])), [currentIds])

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  // Spouse(s), parents and children of the source person, from the family graph.
  const groups = useMemo<RelGroup[]>(() => {
    if (!sourcePersonId) return []
    const toPeople = (ids: (string | null | undefined)[]): Person[] => {
      const seen = new Set<string>()
      const out: Person[] = []
      for (const id of ids) {
        if (!id || seen.has(id)) continue
        seen.add(id)
        const p = byId.get(id)
        if (p) out.push(p)
      }
      return out
    }
    const childFam = families.find((f: Family) => f.childIds.includes(sourcePersonId))
    const parents = toPeople([childFam?.husbandId, childFam?.wifeId])
    const spouseFams = families.filter(
      (f: Family) => f.husbandId === sourcePersonId || f.wifeId === sourcePersonId
    )
    const spouses = toPeople(
      spouseFams.map((f) => (f.husbandId === sourcePersonId ? f.wifeId : f.husbandId))
    )
    const children = toPeople(spouseFams.flatMap((f) => f.childIds))
    const free = (arr: Person[]): Person[] => arr.filter((p) => !attached.has(p.id))
    return (
      [
        { key: 'spouse', label: t('attach.spouse'), icon: Heart, people: free(spouses) },
        { key: 'parents', label: t('attach.parents'), icon: Users, people: free(parents) },
        { key: 'children', label: t('attach.children'), icon: Baby, people: free(children) }
      ] as RelGroup[]
    ).filter((g) => g.people.length > 0)
  }, [families, byId, sourcePersonId, attached, t])

  const attachedPeople = useMemo(
    () => [...attached].map((id) => byId.get(id)).filter((p): p is Person => !!p),
    [attached, byId]
  )

  // Ids already shown as quick-picks — hidden from the search list to avoid dupes.
  const quickIds = useMemo(
    () => new Set(groups.flatMap((g) => g.people.map((p) => p.id))),
    [groups]
  )

  const results = useMemo(() => {
    const needle = q.trim()
    if (!needle) return []
    const pool = people.filter((p) => p.id !== sourcePersonId && !quickIds.has(p.id) && !attached.has(p.id))
    return pool
      .map((p) => ({ p, s: nameScore(needle, fullName(p)) }))
      .filter((x) => x.s > 0 || matchesName(needle, fullName(x.p)))
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map((x) => x.p)
  }, [people, q, quickIds, attached, sourcePersonId])

  const toggle = (id: string): void =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const close = (): void => {
    setSelected(new Set())
    setQ('')
    onClose()
  }

  const confirm = async (): Promise<void> => {
    if (!selected.size) {
      if (!manage) close()
      return
    }
    setBusy(true)
    const added = [...selected]
    for (const pid of added) await attach(pid)
    setBusy(false)
    await onAttached()
    if (manage) {
      // Fold the newly-attached into the "currently attached" list; keep managing.
      setAttached((prev) => new Set([...prev, ...added]))
      setSelected(new Set())
      setQ('')
    } else {
      close()
    }
  }

  const detach = async (pid: string): Promise<void> => {
    if (!onDetach) return
    setBusy(true)
    await onDetach(pid)
    setBusy(false)
    setAttached((prev) => {
      const n = new Set(prev)
      n.delete(pid)
      return n
    })
    await onAttached()
  }

  const PersonChip = ({ p }: { p: Person }): JSX.Element => {
    const on = selected.has(p.id)
    return (
      <button
        onClick={() => toggle(p.id)}
        className={cn(
          'group flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors',
          on
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border/60 bg-secondary/40 text-foreground hover:border-primary/50 hover:bg-accent'
        )}
      >
        <span className="relative">
          <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-6 w-6 text-[9px]" />
          {on && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
          )}
        </span>
        <span className="max-w-[9rem] truncate font-medium">{fullName(p)}</span>
        {lifespan(p) && <span className="shrink-0 tabular-nums text-muted-foreground">{lifespan(p)}</span>}
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>{manage ? t('attach.manageTitle') : t('attach.title')}</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">
          {t('attach.subtitle')} <span className="font-medium text-foreground">{label}</span>
        </p>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1 pr-1">
          {/* Currently attached (manage mode) — remove with the × */}
          {manage && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('attach.currentLabel')}
              </p>
              {attachedPeople.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('documents.unattached')}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {attachedPeople.map((p) => (
                    <span
                      key={p.id}
                      className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-1 pl-1 pr-1 text-xs"
                    >
                      <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-6 w-6 text-[9px]" />
                      <span className="max-w-[9rem] truncate font-medium">{fullName(p)}</span>
                      <button
                        onClick={() => void detach(p.id)}
                        disabled={busy}
                        title={t('attach.remove')}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick picks — relatives (only with an anchor person) */}
          {sourcePersonId &&
            (groups.length > 0 ? (
              groups.map((g) => (
                <div key={g.key} className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <g.icon className="h-3.5 w-3.5" /> {g.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.people.map((p) => (
                      <PersonChip key={p.id} p={p} />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">{t('attach.noRelatives')}</p>
            ))}

          {/* Free search */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('attach.searchLabel')}
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('attach.searchPlaceholder')}
                className="h-9 pl-8 text-sm"
              />
            </div>
            {q.trim() && (
              <div className="max-h-52 space-y-0.5 overflow-y-auto pr-1">
                {results.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t('picker.noResults')}</p>
                ) : (
                  results.map((p) => {
                    const on = selected.has(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggle(p.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                          on ? 'bg-primary/10' : 'hover:bg-accent/50'
                        )}
                      >
                        <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-8 w-8 shrink-0 text-[10px]" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="min-w-0 truncate text-sm font-medium">{fullName(p)}</span>
                            {lifespan(p) && (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{lifespan(p)}</span>
                            )}
                          </span>
                          {p.birthPlace && (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{p.birthPlace}</span>
                          )}
                        </span>
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                            on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                          )}
                        >
                          {on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="ghost" onClick={close} disabled={busy}>
            {manage ? t('attach.done') : t('attach.skip')}
          </Button>
          <Button onClick={() => void confirm()} disabled={busy || selected.size === 0}>
            {selected.size > 0 ? t('attach.confirmN', { count: selected.size }) : t('attach.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
