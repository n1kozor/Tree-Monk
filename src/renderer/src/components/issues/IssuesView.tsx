import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, EyeOff, GitMerge, Heart, Loader2, MapPin, RefreshCw, ShieldAlert, Bird, SpellCheck, Type, Users, Users2, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { MergeDialog } from './MergeDialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { normalizeDate } from '@/lib/dates'
import { useAppStore } from '@/store/useAppStore'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { fullName, yearOf } from '@/lib/utils'
import type { DuplicateCandidate, NameGroup, Person, PersonInput, SanityFix, SanityIssue } from '@shared/types'

interface CandMeta {
  span: string
  place: string
  parents: string[]
  spouses: string[]
}

/** Modal for the "mark deceased" quick-fix — confirms and optionally adds a death date. */
function MarkDeceasedDialog({
  fix,
  onClose,
  onApplied
}: {
  fix: SanityFix | null
  onClose: () => void
  onApplied: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset the date field whenever a different person is targeted.
  useEffect(() => setDate(''), [fix])

  const apply = async (): Promise<void> => {
    if (!fix) return
    setBusy(true)
    const norm = normalizeDate(date)
    const patch: PersonInput = { deceased: true }
    if (norm) patch.deathDate = norm
    await window.api.people.update(fix.personId, patch)
    setBusy(false)
    onApplied()
    onClose()
  }

  return (
    <Dialog open={!!fix} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bird className="h-4 w-4 text-primary" />
            {t('issues.fix.markDeceasedTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t('issues.fix.markDeceasedBody', { name: fix?.personName ?? '' })}
          </p>
          <div className="space-y-1">
            <Label>{t('issues.fix.deathDateOptional')}</Label>
            <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder={t('person.dateHint')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={apply} disabled={busy}>
            <Bird className="h-4 w-4" />
            {t('issues.fix.markDeceasedConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function IssuesView(): JSX.Element {
  const { t } = useTranslation()
  const selectPerson = useAppStore((s) => s.selectPerson)
  const refreshPeople = useAppStore((s) => s.refreshPeople)
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const peopleById = useAppStore((s) => s.peopleById)
  const refreshAll = useAppStore((s) => s.refreshAll)
  const [issues, setIssues] = useState<SanityIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'issues' | 'dups' | 'surnames' | 'givennames'>('issues')
  const [fixTarget, setFixTarget] = useState<SanityFix | null>(null)
  const [dismissTarget, setDismissTarget] = useState<SanityIssue | null>(null)

  // Duplicates (on-demand)
  const [dups, setDups] = useState<DuplicateCandidate[] | null>(null)
  const [dupLoading, setDupLoading] = useState(false)
  const [mergePair, setMergePair] = useState<{ aId: string; bId: string } | null>(null)

  // Parent/spouse lookups so each duplicate candidate can show WHO they really
  // are — the key disambiguator when many people share the exact same name.
  const famIndex = useMemo(() => {
    const parentsOf = new Map<string, string[]>()
    const spousesOf = new Map<string, string[]>()
    for (const f of families) {
      const par = [f.husbandId, f.wifeId].filter((x): x is string => !!x)
      for (const cid of f.childIds) parentsOf.set(cid, par)
      if (f.husbandId && f.wifeId) {
        spousesOf.set(f.husbandId, [...(spousesOf.get(f.husbandId) ?? []), f.wifeId])
        spousesOf.set(f.wifeId, [...(spousesOf.get(f.wifeId) ?? []), f.husbandId])
      }
    }
    return { parentsOf, spousesOf }
  }, [families])
  const nameById = (id: string): string => {
    const p = peopleById.get(id)
    return p ? fullName(p) : '—'
  }
  const candMeta = (p: Person): CandMeta => {
    const by = yearOf(p.birthDate)
    const dy = yearOf(p.deathDate)
    return {
      span: by || dy ? `${by ?? '?'} – ${dy ?? '?'}` : '',
      place: (p.birthPlace ?? '').split(',')[0].trim(),
      parents: (famIndex.parentsOf.get(p.id) ?? []).map(nameById),
      spouses: (famIndex.spousesOf.get(p.id) ?? []).map(nameById)
    }
  }

  // Surname + given-name spelling/accent variants → normalization.
  const [surnameGroups, setSurnameGroups] = useState<NameGroup[] | null>(null)
  const [givenGroups, setGivenGroups] = useState<NameGroup[] | null>(null)
  // Per-group chosen canonical (keyed by group.key); defaults to the suggestion.
  const [chosenSurname, setChosenSurname] = useState<Record<string, string>>({})
  const [chosenGiven, setChosenGiven] = useState<Record<string, string>>({})
  const [normalizing, setNormalizing] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setLoading(true)
    setIssues(await window.api.sanity.check())
    setLoading(false)
  }, [])

  const scanDups = useCallback(async () => {
    setDupLoading(true)
    try {
      setDups(await window.api.duplicates.scan())
    } finally {
      setDupLoading(false)
    }
  }, [])

  const scanSurnames = useCallback(async () => {
    setSurnameGroups(await window.api.names.surnameVariants())
  }, [])
  const scanGiven = useCallback(async () => {
    setGivenGroups(await window.api.names.givenNameVariants())
  }, [])

  const applyNormalize = async (g: NameGroup): Promise<void> => {
    const canonical = chosenSurname[g.key] ?? g.suggested
    setNormalizing(g.key)
    try {
      const n = await window.api.names.normalizeSurname(g.variants.map((v) => v.name), canonical)
      await refreshAll()
      await scanSurnames()
      toast.success(t('issues.surnameNormalized', { count: n, name: canonical }))
    } finally {
      setNormalizing(null)
    }
  }

  const applyNormalizeGiven = async (g: NameGroup): Promise<void> => {
    const canonical = chosenGiven[g.key] ?? g.suggested
    setNormalizing(g.key)
    try {
      const n = await window.api.names.normalizeGivenName(g.variants.map((v) => v.name), canonical)
      await refreshAll()
      await scanGiven()
      toast.success(t('issues.givenNameNormalized', { count: n, name: canonical }))
    } finally {
      setNormalizing(null)
    }
  }

  const dismissDup = async (c: DuplicateCandidate): Promise<void> => {
    await window.api.duplicates.dismiss(c.aId, c.bId)
    setDups((prev) => prev?.filter((d) => !(d.aId === c.aId && d.bId === c.bId)) ?? null)
  }

  const onMerged = async (auditSeq: number): Promise<void> => {
    toast.success(t('issues.merged'), {
      duration: 8000,
      action: {
        label: t('audit.undo'),
        onClick: () =>
          void window.api.audit.revert(auditSeq).then(async () => {
            await refreshAll()
            await scanDups()
            await scan()
          })
      }
    })
    await refreshAll()
    await scanDups()
    await scan()
  }

  useEffect(() => {
    scan()
    void scanDups()
    void scanSurnames()
    void scanGiven()
  }, [scan, scanDups, scanSurnames, scanGiven, people, families])

  const counts = useMemo(
    () => ({
      high: issues.filter((i) => i.severity === 'high').length,
      medium: issues.filter((i) => i.severity === 'medium').length
    }),
    [issues]
  )

  // The label for a fix button, keyed by its kind (extensible).
  const fixLabel = (fix: SanityFix): string => t(`issues.fix.${fix.kind}`)

  const rescanAll = useCallback(() => {
    void scan()
    void scanDups()
    void scanSurnames()
    void scanGiven()
  }, [scan, scanDups, scanSurnames, scanGiven])

  // Each category is its own tab so a long list never squeezes the others out.
  const dupCount = dups?.length ?? null
  const surnameCount = surnameGroups?.length ?? null
  const givenCount = givenGroups?.length ?? null
  const issueTone =
    counts.high > 0 ? 'danger' : counts.medium > 0 ? 'warn' : 'ok'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <ShieldAlert className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{t('issues.title')}</h2>
            <p className="truncate text-xs text-muted-foreground">{t('issues.subtitle')}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 gap-2" onClick={rescanAll} disabled={loading || dupLoading}>
          <RefreshCw className={cn('h-4 w-4', (loading || dupLoading) && 'animate-spin')} />
          {t('issues.rescan')}
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border/40 px-3">
        <TabButton
          active={tab === 'issues'}
          onClick={() => setTab('issues')}
          icon={<AlertTriangle className="h-4 w-4" />}
          label={t('issues.tabIssues')}
          count={issues.length}
          tone={issueTone}
        />
        <TabButton
          active={tab === 'dups'}
          onClick={() => setTab('dups')}
          icon={<Users2 className="h-4 w-4" />}
          label={t('issues.tabDuplicates')}
          count={dupCount}
          tone={dupCount ? 'accent' : 'ok'}
        />
        <TabButton
          active={tab === 'surnames'}
          onClick={() => setTab('surnames')}
          icon={<SpellCheck className="h-4 w-4" />}
          label={t('issues.tabSurnames')}
          count={surnameCount}
          tone={surnameCount ? 'accent' : 'ok'}
        />
        <TabButton
          active={tab === 'givennames'}
          onClick={() => setTab('givennames')}
          icon={<Type className="h-4 w-4" />}
          label={t('issues.tabGivenNames')}
          count={givenCount}
          tone={givenCount ? 'accent' : 'ok'}
        />
      </div>

      {/* Active tab fills the rest with its own scroll. */}
      <div className="min-h-0 flex-1">
        {/* ---- Data quality issues ---- */}
        {tab === 'issues' &&
          (issues.length === 0 ? (
            <Empty icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />} text={t('issues.clean')} />
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-2 p-4">
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={cn(
                      'rounded-xl border bg-secondary/40 p-3 backdrop-blur-sm',
                      issue.severity === 'high' ? 'border-destructive/40' : 'border-amber-500/30'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          issue.severity === 'high' ? 'text-destructive' : 'text-amber-500'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{t(`issues.rules.${issue.rule}`)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{issue.detail}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {issue.people.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => selectPerson(p.id)}
                              className="flex items-center gap-1.5 rounded-lg bg-secondary/50 px-2 py-0.5 text-xs font-medium hover:bg-primary/15 hover:text-primary"
                            >
                              <PersonAvatar
                                personId={p.id}
                                name={peopleById.get(p.id) ? fullName(peopleById.get(p.id)!) : p.name}
                                sex={peopleById.get(p.id)?.sex}
                                className="h-4 w-4 text-[8px]"
                              />
                              {peopleById.get(p.id) ? fullName(peopleById.get(p.id)!) : p.name}
                            </button>
                          ))}
                          {issue.fixes?.map((fix) => (
                            <button
                              key={`${fix.kind}:${fix.personId}`}
                              onClick={() => setFixTarget(fix)}
                              className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                            >
                              <Bird className="h-3 w-3" />
                              {fixLabel(fix)}
                            </button>
                          ))}
                          <button
                            onClick={() => setDismissTarget(issue)}
                            title={t('issues.dismissHint')}
                            className="ml-auto flex items-center gap-1 rounded-lg border border-border/40 px-2 py-0.5 text-xs font-medium text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                          >
                            <EyeOff className="h-3 w-3" />
                            {t('issues.dismiss')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ))}

        {/* ---- Possible duplicates ---- */}
        {tab === 'dups' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2.5">
              <p className="min-w-0 truncate text-xs text-muted-foreground">{t('issues.duplicatesHint')}</p>
              <Button size="sm" variant="outline" className="shrink-0 gap-2" onClick={scanDups} disabled={dupLoading}>
                <RefreshCw className={cn('h-4 w-4', dupLoading && 'animate-spin')} />
                {t('issues.scanDuplicates')}
              </Button>
            </div>
            {!dups || dups.length === 0 ? (
              <Empty
                icon={<Users2 className="h-10 w-10 text-muted-foreground/50" />}
                text={t('issues.duplicatesNone')}
              />
            ) : (
              <ScrollArea className="h-full">
                <div className="space-y-1.5 p-4">
                  {dups.map((c) => {
                    const a = peopleById.get(c.aId)
                    const b = peopleById.get(c.bId)
                    if (!a || !b) return null
                    const ma = candMeta(a)
                    const mb = candMeta(b)
                    const diff = {
                      span: ma.span !== mb.span,
                      place: ma.place !== mb.place,
                      parents: ma.parents.join('|') !== mb.parents.join('|'),
                      spouses: ma.spouses.join('|') !== mb.spouses.join('|')
                    }
                    return (
                      <div key={c.aId + c.bId} className="overflow-hidden rounded-2xl border border-border/40 bg-secondary/40 shadow-sm backdrop-blur-sm">
                        {/* Header: confidence + why-matched + actions */}
                        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-secondary/30 px-3 py-1.5">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                              c.score >= 80 ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary'
                            )}
                          >
                            {c.score}%
                          </span>
                          <span className="flex flex-wrap gap-1">
                            {c.reasons.map((r) => (
                              <span key={r} className="rounded bg-secondary/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {t(`issues.reason.${r}`, { defaultValue: r })}
                              </span>
                            ))}
                          </span>
                          <span className="ml-auto flex items-center gap-1">
                            <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setMergePair({ aId: c.aId, bId: c.bId })}>
                              <GitMerge className="h-3.5 w-3.5" /> {t('issues.merge')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-xs text-muted-foreground"
                              title={t('issues.notDuplicate')}
                              onClick={() => void dismissDup(c)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </div>
                        {/* The two candidates side by side, with their distinguishing facts. */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch divide-x divide-border/40">
                          <DupSide person={a} meta={ma} diff={diff} onSelect={() => selectPerson(a.id)} />
                          <div className="flex items-center justify-center px-1 text-muted-foreground/60">
                            <GitMerge className="h-4 w-4" />
                          </div>
                          <DupSide person={b} meta={mb} diff={diff} onSelect={() => selectPerson(b.id)} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {/* ---- Surname / given-name normalization (spelling / accent variants) ---- */}
        {tab === 'surnames' && (
          <NameNormalizeList
            groups={surnameGroups}
            chosen={chosenSurname}
            setChosen={setChosenSurname}
            normalizing={normalizing}
            onApply={applyNormalize}
            icon={<SpellCheck className="h-10 w-10 text-muted-foreground/50" />}
            none={t('issues.surnamesNone')}
            hint={t('issues.surnamesHint')}
            keepLabel={(name) => t('issues.surnameKeep', { name })}
            finalLabel={t('issues.surnameFinal')}
            applyLabel={t('issues.surnameApply')}
          />
        )}
        {tab === 'givennames' && (
          <NameNormalizeList
            groups={givenGroups}
            chosen={chosenGiven}
            setChosen={setChosenGiven}
            normalizing={normalizing}
            onApply={applyNormalizeGiven}
            icon={<Type className="h-10 w-10 text-muted-foreground/50" />}
            none={t('issues.givenNamesNone')}
            hint={t('issues.givenNamesHint')}
            keepLabel={(name) => t('issues.givenNameKeep', { name })}
            finalLabel={t('issues.givenNameFinal')}
            applyLabel={t('issues.givenNameApply')}
          />
        )}
      </div>

      <MarkDeceasedDialog
        fix={fixTarget}
        onClose={() => setFixTarget(null)}
        onApplied={async () => {
          await refreshPeople()
          await scan()
        }}
      />

      <ConfirmDialog
        open={!!dismissTarget}
        onOpenChange={(o) => !o && setDismissTarget(null)}
        title={t('issues.dismissTitle')}
        confirmLabel={t('issues.dismissConfirm')}
        onConfirm={async () => {
          const key = dismissTarget?.key
          setDismissTarget(null)
          if (key) {
            await window.api.sanity.dismiss(key)
            await scan()
          }
        }}
      >
        <p>{t('issues.dismissBody')}</p>
        {dismissTarget && (
          <p className="mt-2 rounded-xl border border-border/40 bg-secondary/30 p-2 text-xs text-foreground">
            {t(`issues.rules.${dismissTarget.rule}`)} — {dismissTarget.detail}
          </p>
        )}
      </ConfirmDialog>

      <MergeDialog pair={mergePair} onClose={() => setMergePair(null)} onMerged={onMerged} />
    </div>
  )
}

type Tone = 'danger' | 'warn' | 'accent' | 'ok'

const TONE_BADGE: Record<Tone, string> = {
  danger: 'bg-destructive/15 text-destructive',
  warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-500',
  accent: 'bg-primary/15 text-primary',
  ok: 'bg-secondary text-muted-foreground'
}

/** A single tab with an icon, label and a coloured count badge. */
function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  tone
}: {
  active: boolean
  onClick: () => void
  icon: JSX.Element
  label: string
  count: number | null
  tone: Tone
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {count != null && (
        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', TONE_BADGE[tone])}>
          {count}
        </span>
      )}
      {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
    </button>
  )
}

/** Centered empty / success state for a tab. */
function Empty({ icon, text }: { icon: JSX.Element; text: string }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      {icon}
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

/** Shared list for unifying spelling/accent variants of a name field (surnames
 *  or given names): pick or type the canonical form per group, then unify. */
function NameNormalizeList({
  groups,
  chosen,
  setChosen,
  normalizing,
  onApply,
  icon,
  none,
  hint,
  keepLabel,
  finalLabel,
  applyLabel
}: {
  groups: NameGroup[] | null
  chosen: Record<string, string>
  setChosen: React.Dispatch<React.SetStateAction<Record<string, string>>>
  normalizing: string | null
  onApply: (g: NameGroup) => void
  icon: JSX.Element
  none: string
  hint: string
  keepLabel: (name: string) => string
  finalLabel: string
  applyLabel: string
}): JSX.Element {
  if (!groups || groups.length === 0) return <Empty icon={icon} text={none} />
  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-4">
        <p className="text-xs text-muted-foreground">{hint}</p>
        {groups.map((g) => {
          const canonical = chosen[g.key] ?? g.suggested
          const busy = normalizing === g.key
          return (
            <div
              key={g.key}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-secondary/40 p-2 text-xs backdrop-blur-sm"
            >
              <span className="flex flex-wrap items-center gap-1">
                {g.variants.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => setChosen((c) => ({ ...c, [g.key]: v.name }))}
                    title={keepLabel(v.name)}
                    className={cn(
                      'rounded-lg border px-1.5 py-0.5 transition-colors',
                      v.name === canonical
                        ? 'border-primary bg-primary/10 font-semibold text-foreground'
                        : 'border-border/40 text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {v.name}
                    <span className="ml-1 tabular-nums text-muted-foreground/70">{v.count}</span>
                  </button>
                ))}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={canonical}
                onChange={(e) => setChosen((c) => ({ ...c, [g.key]: e.target.value }))}
                spellCheck={false}
                aria-label={finalLabel}
                className="w-28 rounded-lg border border-primary/40 bg-background px-2 py-0.5 text-xs font-semibold text-primary outline-none focus:border-primary"
              />
              <Button
                size="sm"
                className="ml-auto h-7 gap-1 text-xs"
                disabled={busy || !canonical.trim()}
                onClick={() => onApply(g)}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SpellCheck className="h-3.5 w-3.5" />}
                {applyLabel}
              </Button>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

/** One side of a duplicate pair: the person + the facts that tell them apart
 *  (years, place, parents, spouse). Fields that DIFFER from the other candidate
 *  are highlighted, so a true vs. false match is obvious at a glance. */
function DupSide({
  person,
  meta,
  diff,
  onSelect
}: {
  person: Person
  meta: CandMeta
  diff: { span: boolean; place: boolean; parents: boolean; spouses: boolean }
  onSelect: () => void
}): JSX.Element {
  const line = (Icon: LucideIcon, value: string, hl: boolean): JSX.Element | null =>
    value ? (
      <span
        className={cn(
          'flex items-center gap-1.5 text-[11px]',
          hl ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
        )}
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{value}</span>
      </span>
    ) : null
  return (
    <button
      onClick={onSelect}
      className="group flex min-w-0 flex-col gap-1 p-3 text-left transition-colors hover:bg-accent/40"
    >
      <span className="flex items-center gap-2">
        <PersonAvatar personId={person.id} name={fullName(person)} sex={person.sex} className="h-8 w-8 shrink-0 text-[10px]" />
        <span className="truncate text-sm font-semibold group-hover:text-primary">{fullName(person)}</span>
      </span>
      {line(CalendarDays, meta.span, diff.span)}
      {line(MapPin, meta.place, diff.place)}
      {line(Users, meta.parents.join(', '), diff.parents)}
      {line(Heart, meta.spouses.join(', '), diff.spouses)}
    </button>
  )
}
