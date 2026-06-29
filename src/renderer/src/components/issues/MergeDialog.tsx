import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, ChevronDown, ChevronUp, GitMerge, TriangleAlert, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName, yearOf } from '@/lib/utils'
import { familySearchPersonUrl, isFamilySearchId } from '@/lib/familySearchSearch'
import type { MergeResolution, Person, Sex } from '@shared/types'

type FieldKey = keyof MergeResolution
const FIELDS: { key: FieldKey; kind: 'text' | 'bool' | 'sex' | 'photo' }[] = [
  { key: 'givenName', kind: 'text' },
  { key: 'surname', kind: 'text' },
  { key: 'sex', kind: 'sex' },
  { key: 'birthDate', kind: 'text' },
  { key: 'birthPlace', kind: 'text' },
  { key: 'deathDate', kind: 'text' },
  { key: 'deathPlace', kind: 'text' },
  { key: 'deceased', kind: 'bool' },
  { key: 'burialDate', kind: 'text' },
  { key: 'burialPlace', kind: 'text' },
  { key: 'christeningDate', kind: 'text' },
  { key: 'christeningPlace', kind: 'text' },
  { key: 'religion', kind: 'text' },
  { key: 'occupation', kind: 'text' },
  { key: 'notes', kind: 'text' },
  { key: 'profilePhotoId', kind: 'photo' }
]
const SEX_SYM: Record<string, string> = { M: '♂', F: '♀', U: '?' }
const snake = (s: string): string => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
const isEmpty = (v: unknown): boolean => v == null || v === '' || v === false

export function MergeDialog({
  pair,
  onClose,
  onMerged
}: {
  pair: { aId: string; bId: string } | null
  onClose: () => void
  onMerged: (auditSeq: number) => void
}): JSX.Element {
  const { t } = useTranslation()
  const peopleById = useAppStore((s) => s.peopleById)
  const families = useAppStore((s) => s.families)

  const [survivorId, setSurvivorId] = useState('')
  const [choices, setChoices] = useState<Record<string, 's' | 'v'>>({})
  const [busy, setBusy] = useState(false)
  // "Who are they really" panel — parents/spouses/children side by side.
  // Expanded by default: the relatives are the fastest way to tell whether two
  // candidates are actually the same person.
  const [inspect, setInspect] = useState(true)

  useEffect(() => {
    if (pair) {
      setSurvivorId(pair.aId)
      setChoices({})
      // Always open the relatives panel for a freshly opened pair (fast compare).
      setInspect(true)
    }
  }, [pair])

  // The immediate family of a person (from the loaded families), for inspection.
  const relationsOf = (
    id: string
  ): { parents: Person[]; spouses: Person[]; children: Person[] } => {
    const parents = new Set<string>()
    const spouses = new Set<string>()
    const children = new Set<string>()
    for (const f of families) {
      if (f.childIds.includes(id)) {
        if (f.husbandId) parents.add(f.husbandId)
        if (f.wifeId) parents.add(f.wifeId)
      }
      if (f.husbandId === id || f.wifeId === id) {
        const sp = f.husbandId === id ? f.wifeId : f.husbandId
        if (sp) spouses.add(sp)
        for (const c of f.childIds) children.add(c)
      }
    }
    const toPeople = (ids: Set<string>): Person[] =>
      [...ids].map((i) => peopleById.get(i)).filter((p): p is Person => !!p)
    return { parents: toPeople(parents), spouses: toPeople(spouses), children: toPeople(children) }
  }

  const a = pair ? peopleById.get(pair.aId) : undefined
  const b = pair ? peopleById.get(pair.bId) : undefined
  const survivor = survivorId === b?.id ? b : a
  const victim = survivor?.id === a?.id ? b : a

  const parentsKey = (id: string): string => {
    const f = families.find((fm) => fm.childIds.includes(id))
    return f ? [f.husbandId, f.wifeId].filter(Boolean).sort().join(',') : ''
  }
  const parentWarn = useMemo(() => {
    if (!a || !b) return false
    const pa = parentsKey(a.id)
    const pb = parentsKey(b.id)
    return !!pa && !!pb && pa !== pb
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, families])

  if (!pair || !survivor || !victim) return <Dialog open={false} onOpenChange={() => onClose()} />

  const raw = (p: Person, key: FieldKey): unknown => (p as unknown as Record<string, unknown>)[key]
  const choiceFor = (key: FieldKey): 's' | 'v' =>
    choices[key] ?? (isEmpty(raw(survivor, key)) && !isEmpty(raw(victim, key)) ? 'v' : 's')

  const display = (p: Person, key: FieldKey, kind: string): string => {
    const v = raw(p, key)
    if (kind === 'sex') return SEX_SYM[(v as string) ?? 'U'] ?? '?'
    if (kind === 'bool') return v ? '✓' : '—'
    if (kind === 'photo') return v ? '🖼' : '—'
    return (v as string) || '—'
  }
  const fieldLabel = (key: FieldKey): string =>
    key === 'profilePhotoId' ? t('issues.mergePhoto') : t(`audit.field.${snake(key)}`, { defaultValue: key })

  const doMerge = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const pick = (key: FieldKey): unknown => raw(choiceFor(key) === 's' ? survivor : victim, key)
      const resolution: MergeResolution = {
        givenName: pick('givenName') as string,
        surname: pick('surname') as string,
        sex: pick('sex') as Sex,
        birthDate: pick('birthDate') as string | null,
        birthPlace: pick('birthPlace') as string | null,
        deathDate: pick('deathDate') as string | null,
        deathPlace: pick('deathPlace') as string | null,
        deceased: pick('deceased') as boolean,
        burialDate: pick('burialDate') as string | null,
        burialPlace: pick('burialPlace') as string | null,
        christeningDate: pick('christeningDate') as string | null,
        christeningPlace: pick('christeningPlace') as string | null,
        religion: pick('religion') as string | null,
        occupation: pick('occupation') as string | null,
        notes: pick('notes') as string | null,
        profilePhotoId: pick('profilePhotoId') as string | null
      }
      const res = await window.api.duplicates.merge(survivor.id, victim.id, resolution)
      onMerged(res.auditSeq)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const Head = ({ p, who }: { p: Person; who: string }): JSX.Element => (
    <div className="flex items-center gap-2">
      <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-8 w-8 shrink-0 text-[10px]" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{fullName(p)}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {who} · {yearOf(p.birthDate)}
          {p.deathDate ? `–${yearOf(p.deathDate)}` : ''}
        </p>
        {/* FamilySearch id — shown so you can verify the two really are the same
            person before merging. Click to open the FamilySearch page. */}
        {isFamilySearchId(p.fsId) && (
          <button
            onClick={() => {
              const u = familySearchPersonUrl(p)
              if (u) void window.api.app.openExternal(u)
            }}
            title={t('person.openFamilySearch')}
            className="truncate font-mono text-[10px] text-sky-600 hover:underline dark:text-sky-400"
          >
            {p.fsId}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary" /> {t('issues.mergeTitle')}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{t('issues.mergeHint')}</p>
        </DialogHeader>

        {/* Survivor / victim headers + swap */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2">
          <Head p={survivor} who={t('issues.survivor')} />
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title={t('issues.swap')} onClick={() => setSurvivorId(victim.id)}>
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <Head p={victim} who={t('issues.duplicate')} />
        </div>

        {parentWarn && (
          <p className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {t('issues.mergeWarnParents')}
          </p>
        )}

        {/* Inspect: compare each person's immediate family before merging. */}
        <button
          type="button"
          onClick={() => setInspect((v) => !v)}
          className="flex items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-accent/40"
        >
          <Users className="h-3.5 w-3.5" />
          {t('issues.inspect')}
          {inspect ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {inspect && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/20 p-2.5 text-[11px]">
            {[survivor, victim].map((p, i) => {
              const rel = relationsOf(p.id)
              const line = (label: string, ppl: Person[]): JSX.Element => (
                <p className="leading-snug">
                  <span className="font-medium text-muted-foreground">{label}: </span>
                  {ppl.length ? (
                    ppl
                      .map((x) => `${fullName(x)}${yearOf(x.birthDate) ? ` (${yearOf(x.birthDate)})` : ''}`)
                      .join(', ')
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </p>
              )
              return (
                <div key={i} className="min-w-0 space-y-1">
                  <p className="truncate font-semibold">{fullName(p)}</p>
                  {line(t('issues.relParents'), rel.parents)}
                  {line(t('issues.relSpouses'), rel.spouses)}
                  {line(t('issues.relChildren'), rel.children)}
                </div>
              )
            })}
          </div>
        )}

        {/* Field-by-field chooser */}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {FIELDS.map(({ key, kind }) => {
            const sv = display(survivor, key, kind)
            const vv = display(victim, key, kind)
            if (sv === '—' && vv === '—') return null
            const differ = sv !== vv
            const cur = choiceFor(key)
            const cell = (side: 's' | 'v', val: string): JSX.Element => (
              <button
                disabled={!differ}
                onClick={() => setChoices((c) => ({ ...c, [key]: side }))}
                className={cn(
                  'truncate rounded-md border px-2 py-1 text-left text-xs transition-colors',
                  !differ
                    ? 'cursor-default border-transparent text-muted-foreground'
                    : cur === side
                      ? 'border-primary bg-primary/10 font-medium text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent'
                )}
                title={val}
              >
                {val}
              </button>
            )
            return (
              <div key={key} className="grid grid-cols-[120px_1fr_1fr] items-center gap-2">
                <span className="truncate text-[11px] font-medium text-muted-foreground">{fieldLabel(key)}</span>
                {cell('s', sv)}
                {cell('v', vv)}
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => void doMerge()} disabled={busy}>
            <GitMerge className="h-4 w-4" /> {t('issues.mergeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
