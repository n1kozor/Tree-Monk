import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertTriangle, ArrowDownToLine, Camera, ChevronRight, Copy, ExternalLink, Loader2, MapPin, Maximize2, Network, Printer, RefreshCw, Route, Search, Trash2, TreeDeciduous, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFsMode } from '@/hooks/useFsMode'
import { FsPersonSyncDialog } from '@/components/person/FsPersonSyncDialog'
import { FsExpandDialog } from '@/components/person/FsExpandDialog'
import { PersonSheetDialog, FamilySheetDialog } from '@/components/print/PrintSheets'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/common/DateInput'
import { PlaceInput } from '@/components/common/PlaceInput'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore } from '@/store/useAppStore'
import { fullName, cn } from '@/lib/utils'
import { smartNormalizeDate } from '@/lib/smartDate'
import { canSearchFamilySearch, familySearchPersonUrl, familySearchSearchUrl, isFamilySearchId } from '@/lib/familySearchSearch'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { ConfirmDialog, toastUndo } from '@/components/common/ConfirmDialog'
import { PersonFamily } from './PersonFamily'
import { PersonSources } from './PersonSources'
import { PersonAliases } from './PersonAliases'
import { PersonOccupations } from './PersonOccupations'
import { PersonEvents } from './PersonEvents'
import { PersonTimeline } from './PersonTimeline'
import { PhotoFrameDialog } from './PhotoFrameDialog'
import { PersonGodparents } from './PersonGodparents'
import { FactSources, VitalNote } from './FactSources'
import { QualityRing } from '@/components/common/QualityRing'
import { personQuality } from '@/lib/completeness'
import { PersonResearch } from './PersonResearch'
import type { CitationDetail, Person, PersonInput, SanityIssue, Sex } from '@shared/types'

export function PersonPanel(): JSX.Element | null {
  const { t, i18n } = useTranslation()
  const selectedId = useAppStore((s) => s.selectedPersonId)
  const personSyncNonce = useAppStore((s) => s.personSyncNonce)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const openProfile = useAppStore((s) => s.openProfile)
  const focusPersonTree = useAppStore((s) => s.focusPersonTree)
  const openKinship = useAppStore((s) => s.openKinship)
  const openPersonOnMap = useAppStore((s) => s.openPersonOnMap)
  const defaultRootId = useAppStore((s) => s.defaultRootId)
  const treeRootId = useAppStore((s) => s.treeRootId)
  const peopleById = useAppStore((s) => s.peopleById)
  const families = useAppStore((s) => s.families)
  const occPersonIds = useAppStore((s) => s.occupationPersonIds)
  const researchByPerson = useAppStore((s) => s.researchByPerson)
  const refreshPeople = useAppStore((s) => s.refreshPeople)
  const refreshAll = useAppStore((s) => s.refreshAll)
  const refreshDocuments = useAppStore((s) => s.refreshDocuments)

  const [deleting, setDeleting] = useState(false)
  const [framingOpen, setFramingOpen] = useState(false)
  const [person, setPerson] = useState<Person | null>(null)
  const [fsConfigured, setFsConfigured] = useState(false)
  const fsMode = useFsMode()
  const [fsSyncOpen, setFsSyncOpen] = useState(false)
  const [fsExpandOpen, setFsExpandOpen] = useState(false)
  const [sheet, setSheet] = useState<'person' | 'family' | null>(null)

  useEffect(() => {
    void window.api.familysearch.configured().then(setFsConfigured)
  }, [])
  // Counts shown on the tab labels (so the user sees at a glance how much is
  // attached). Documents + citations make up "sources".
  const [docCount, setDocCount] = useState(0)
  const [citationCount, setCitationCount] = useState(0)
  const [factCites, setFactCites] = useState<CitationDetail[]>([])
  // Data-issue anomalies that involve this person (same scan as the pedigree's
  // warning marker — shown here so the profile explains the "!" too).
  const [anomalies, setAnomalies] = useState<SanityIssue[]>([])

  const reload = useCallback(async () => {
    if (!selectedId) return
    const [p, d, c, issues] = await Promise.all([
      window.api.people.get(selectedId),
      window.api.documents.listForPerson(selectedId),
      window.api.research.citationsForPerson(selectedId),
      window.api.sanity.check()
    ])
    setPerson(p)
    setDocCount(d.length)
    setCitationCount(c.length)
    setFactCites(c)
    setAnomalies(issues.filter((i) => i.people.some((x) => x.id === selectedId)))
  }, [selectedId])

  useEffect(() => {
    if (selectedId) reload()
    else setPerson(null)
  }, [selectedId, reload, personSyncNonce])

  const familyCount = useMemo(() => {
    if (!person) return 0
    const ids = new Set<string>()
    for (const f of families) {
      if (f.husbandId === person.id || f.wifeId === person.id) {
        const spouse = f.husbandId === person.id ? f.wifeId : f.husbandId
        if (spouse) ids.add(spouse)
        for (const c of f.childIds) ids.add(c)
      }
      if (f.childIds.includes(person.id)) {
        if (f.husbandId) ids.add(f.husbandId)
        if (f.wifeId) ids.add(f.wifeId)
      }
    }
    return ids.size
  }, [families, person])

  if (!selectedId || !person) return null

  const sourceCount = docCount + citationCount
  const researchCount = researchByPerson.get(person.id)?.length ?? 0

  const patch = (field: keyof PersonInput, value: string): void =>
    setPerson((p) => (p ? { ...p, [field]: value } : p))

  // Persists `next` (defaults to current state). Accepting an override lets
  // callers that just updated state (sex toggle, date commit) save immediately
  // without waiting for the async setState to flush.
  const save = async (next: Person | null = person): Promise<void> => {
    if (!next) return
    await window.api.people.update(next.id, {
      givenName: next.givenName,
      surname: next.surname,
      sex: next.sex,
      fsId: next.fsId,
      birthDate: next.birthDate,
      birthPlace: next.birthPlace,
      deathDate: next.deathDate,
      deathPlace: next.deathPlace,
      deceased: next.deceased,
      illegitimate: next.illegitimate,
      christeningDate: next.christeningDate,
      christeningPlace: next.christeningPlace,
      burialDate: next.burialDate,
      burialPlace: next.burialPlace,
      religion: next.religion,
      occupation: next.occupation,
      notes: next.notes,
      birthNote: next.birthNote,
      deathNote: next.deathNote,
      christeningNote: next.christeningNote,
      burialNote: next.burialNote
    })
    await refreshPeople()
  }

  // Persist a per-vital reason note straight away (used by the VitalNote modal).
  const saveNote = (
    field: 'birthNote' | 'deathNote' | 'christeningNote' | 'burialNote',
    value: string
  ): void => {
    if (!person) return
    const next = { ...person, [field]: value || null }
    setPerson(next)
    void save(next)
  }

  // Mark a person dead even with no date. A recorded death date already implies
  // it, so the toggle is locked on (and shown muted) whenever a date is present.
  const setDeceased = (v: boolean): void => {
    if (!person) return
    const next = { ...person, deceased: v }
    setPerson(next)
    void save(next)
  }

  const setIllegitimate = (v: boolean): void => {
    if (!person) return
    const next = { ...person, illegitimate: v }
    setPerson(next)
    void save(next)
  }

  const setSex = (sex: Sex): void => {
    if (!person || person.sex === sex) return
    const next = { ...person, sex }
    setPerson(next)
    void save(next)
  }

  // Standardize a date field on blur (e.g. "7.3.1850" → "1850-03-07").
  const commitDate = (field: 'birthDate' | 'deathDate' | 'christeningDate' | 'burialDate'): void => {
    if (!person) return
    // FS mode: the FamilySearch Date authority formats in the UI language.
    void smartNormalizeDate(person[field] ?? '').then((norm) => {
      const next = { ...person, [field]: norm || null }
      setPerson(next)
      void save(next)
    })
  }

  // One-click: carry the birth date + place over to the christening fields
  // (christenings usually happened days after birth, at the same place).
  const copyBirthToChristening = (): void => {
    if (!person) return
    const next = { ...person, christeningDate: person.birthDate, christeningPlace: person.birthPlace }
    setPerson(next)
    void save(next)
  }

  const close = (): void => {
    save()
    selectPerson(null)
  }

  const doDelete = async (): Promise<void> => {
    const snap = await window.api.people.remove(person.id)
    await refreshAll()
    selectPerson(null)
    if (snap) {
      toastUndo(t('delete.personDeleted', { name: fullName(person) }), t('common.undo'), async () => {
        await window.api.people.restore(snap)
        await refreshAll()
      })
    }
  }

  const changeAvatar = async (): Promise<void> => {
    const updated = await window.api.people.setAvatar(person.id)
    if (updated) {
      setPerson(updated)
      await Promise.all([refreshPeople(), refreshDocuments()])
    }
  }

  // Open a FamilySearch record search pre-filled with this person's vitals.
  const searchFamilySearch = (): void => {
    void window.api.app.openExternal(familySearchSearchUrl(person, i18n.language))
  }
  // Open this person's actual FamilySearch tree page (only when we have an fsId).
  const fsPersonUrl = familySearchPersonUrl(person)
  const openFamilySearch = (): void => {
    if (fsPersonUrl) void window.api.app.openExternal(fsPersonUrl)
  }


  return (
    <>
      <div data-testid="person-panel-backdrop" className="fixed inset-0 z-30 bg-black/25 backdrop-blur-md" onClick={close} />
      <aside data-testid="person-panel" className="glass-strong fixed right-0 top-0 z-40 flex h-full w-[500px] max-w-[92vw] animate-slide-in flex-col rounded-l-3xl border-l border-border/40">
        {/* keyed by person id → re-runs a subtle swap animation so switching
            from one profile to another is clearly noticeable. */}
        <div key={person.id} className="flex min-h-0 flex-1 animate-panel-swap flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => (person.profilePhotoId ? setFramingOpen(true) : void changeAvatar())}
              title={person.profilePhotoId ? t('photo.adjust') : t('person.changePhoto')}
              className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-full"
            >
              <PersonAvatar
                personId={person.id}
                name={fullName(person)}
                sex={person.sex}
                className="h-12 w-12 text-sm"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-4 w-4 text-white" />
              </span>
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{fullName(person)}</p>
              {isFamilySearchId(person.fsId) ? (
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(person.fsId!)
                    toast.success(t('person.fsIdCopied'))
                  }}
                  title={t('person.copyFsId')}
                  className="group/fsid flex max-w-full items-center gap-1 truncate text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="truncate">
                    {t('person.fsIdLabel')}: <span className="font-mono">{person.fsId}</span>
                  </span>
                  <Copy className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/fsid:opacity-70" />
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">{t('person.profile')}</p>
              )}
            </div>
            <QualityRing value={personQuality(person, occPersonIds).score} size={34} title={t('quality.title')} className="ml-1 shrink-0" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                save()
                focusPersonTree(person.id)
              }}
            >
              <Network className="h-3.5 w-3.5" />
              {t('person.showTree')}
            </Button>
            <Button variant="ghost" size="icon" onClick={close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Hero action: jump to the roomy full-screen profile. Made deliberately
            large + arrowed so it clearly reads as "expand to the full page". */}
        <button
          onClick={() => {
            void save()
            openProfile(person.id)
          }}
          className="group mx-4 mt-3 flex items-center gap-3 rounded-xl bg-primary px-3.5 py-3 text-left text-primary-foreground shadow-sm ring-1 ring-primary/30 transition-all hover:bg-primary/90 hover:shadow-md"
        >
          <Maximize2 className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight">{t('person.openProfile')}</span>
            <span className="block text-[11px] leading-tight text-primary-foreground/80">
              {t('person.openProfileHint')}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>

        {/* Show the person on the period map (their era + nearby history). */}
        <button
          onClick={() => {
            void save()
            openPersonOnMap(person.id)
          }}
          className="mx-4 mt-2 flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <MapPin className="h-4 w-4 text-primary" />
          {t('person.showOnMap')}
        </button>

        <div className="mx-4 mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => setSheet('person')}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Printer className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{t('print.personSheet')}</span>
          </button>
          <button
            onClick={() => setSheet('family')}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Printer className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{t('print.familySheet')}</span>
          </button>
        </div>

        {/* FamilySearch: open the person's own page (needs an fsId) + a record
            search. The open button is hidden when there is no FamilySearch id. */}
        <div className={cn('mx-4 mt-2 grid gap-2', fsPersonUrl ? 'grid-cols-2' : 'grid-cols-1')}>
          {fsPersonUrl && (
            <button
              onClick={openFamilySearch}
              title={t('person.openFamilySearch')}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-2 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-500/20 dark:text-sky-400"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('person.fsOpenShort')}</span>
            </button>
          )}
          <button
            onClick={searchFamilySearch}
            disabled={!canSearchFamilySearch(person)}
            title={t('person.searchFamilySearch')}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            <Search className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{fsPersonUrl ? t('person.fsSearchShort') : t('person.searchFamilySearch')}</span>
          </button>
        </div>

        {/* FamilySearch refresh (pull) — full preview modal before anything changes. */}
        {fsMode && fsConfigured && isFamilySearchId(person.fsId) && (
          <button
            onClick={() => setFsSyncOpen(true)}
            title={t('fs.pullBtn')}
            className="mx-4 mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
          >
            <RefreshCw className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('fs.pullBtn')}</span>
          </button>
        )}
        {fsMode && fsConfigured && isFamilySearchId(person.fsId) && (
          <button
            onClick={() => setFsExpandOpen(true)}
            title={t('fsExpand.btn')}
            className="mx-4 mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Network className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{t('fsExpand.btn')}</span>
          </button>
        )}

        {/* Editable FamilySearch ID — add it by hand (e.g. after a GEDCOM import
            with no _FSFTID); a valid id lights up the Open/Search buttons above. */}
        <div className="mx-4 mt-2">
          <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <TreeDeciduous className="h-3 w-3" /> {t('person.fsIdLabel')}
          </label>
          <input
            value={person.fsId ?? ''}
            onChange={(e) => patch('fsId', e.target.value.trim().toUpperCase())}
            onBlur={() => void save()}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            placeholder={t('person.fsIdPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            className={cn(
              'w-full rounded-lg border bg-secondary/40 px-2.5 py-1.5 font-mono text-xs outline-none transition-colors focus:border-primary',
              person.fsId && !isFamilySearchId(person.fsId) ? 'border-amber-500/60' : 'border-border'
            )}
          />
          {person.fsId && !isFamilySearchId(person.fsId) && (
            <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">{t('person.fsIdInvalid')}</p>
          )}
        </div>


        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">
                {t('person.overview')}
              </TabsTrigger>
              <TabsTrigger value="family" className="flex-1 gap-1.5">
                {t('person.family')}
                <TabCount n={familyCount} />
              </TabsTrigger>
              <TabsTrigger value="sources" className="flex-1 gap-1.5">
                {t('person.sources')}
                <TabCount n={sourceCount} />
              </TabsTrigger>
              <TabsTrigger value="research" className="flex-1 gap-1.5">
                {t('person.research')}
                <TabCount n={researchCount} />
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="family" className="min-h-0 flex-1 overflow-y-auto p-4">
            <PersonFamily person={person} />
          </TabsContent>

          <TabsContent value="sources" className="min-h-0 flex-1 overflow-y-auto p-4">
            <PersonSources personId={person.id} />
          </TabsContent>

          <TabsContent value="research" className="min-h-0 flex-1 overflow-y-auto p-4">
            <PersonResearch personId={person.id} />
          </TabsContent>

          <TabsContent
            value="overview"
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
          >
            {anomalies.length > 0 && (
              <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t('person.anomaliesTitle', { count: anomalies.length })}
                </p>
                {anomalies.map((a) => (
                  <p key={a.id} className="pl-5 text-[11px] leading-snug text-amber-700 dark:text-amber-300/90">
                    <span className="font-medium">{t(`issues.rules.${a.rule}`)}</span>
                    {a.detail ? ` — ${a.detail}` : ''}
                  </p>
                ))}
              </div>
            )}
            {/* "How are we related?" — opens the relationship finder with this
                person pre-filled. "Me" is the default root, else the tree's focus
                root; if neither is set the finder lets you pick the other end. */}
            {(() => {
              const rootId = defaultRootId ?? treeRootId
              if (rootId && rootId === person.id) return null
              const rootPerson = rootId ? peopleById.get(rootId) : undefined
              return (
                <button
                  onClick={() => openKinship(person.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Route className="h-4 w-4 text-primary" />
                  {rootPerson
                    ? t('person.howRelated', { name: fullName(rootPerson) })
                    : t('person.howRelatedGeneric')}
                </button>
              )
            })()}
            <div className="grid grid-cols-2 gap-3">
              {/* Hungarian writes the family name first; other languages given first. */}
              {(i18n.language === 'hu'
                ? (['surname', 'givenName'] as const)
                : (['givenName', 'surname'] as const)
              ).map((f) => (
                <Field key={f} label={t(`person.${f}`)}>
                  <Input value={person[f]} onChange={(e) => patch(f, e.target.value)} onBlur={() => save()} />
                </Field>
              ))}
            </div>
            <Field label={t('person.sex')}>
              <div className="flex gap-1.5">
                {([
                  ['M', t('person.male')],
                  ['F', t('person.female')],
                  ['U', t('common.unknown')]
                ] as [Sex, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSex(value)}
                    className={cn(
                      'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                      person.sex === value
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={`${t('person.birth')} · ${t('person.date')}`}
                action={<FactSources citations={factCites} tags={['BIRT', 'CHR']} label={t('person.birth')} />}
              >
                <DateInput
                  value={person.birthDate ?? ''}
                  placeholder={t('person.dateHint')}
                  onValueChange={(v) => patch('birthDate', v)}
                  onCommit={() => commitDate('birthDate')}
                />
              </Field>
              <Field label={`${t('person.birth')} · ${t('person.place')}`}>
                <PlaceInput
                  value={person.birthPlace ?? ''}
                  onChange={(v) => patch('birthPlace', v)}
                  onCommit={() => save()}
                />
              </Field>
              <div className="col-span-2">
                <VitalNote label={t('person.birth')} value={person.birthNote ?? ''} onSave={(v) => saveNote('birthNote', v)} />
              </div>
              <Field
                label={`${t('person.death')} · ${t('person.date')}`}
                action={<FactSources citations={factCites} tags={['DEAT']} label={t('person.death')} />}
              >
                <DateInput
                  value={person.deathDate ?? ''}
                  placeholder={t('person.dateHint')}
                  onValueChange={(v) => patch('deathDate', v)}
                  onCommit={() => commitDate('deathDate')}
                />
              </Field>
              <Field label={`${t('person.death')} · ${t('person.place')}`}>
                <PlaceInput
                  value={person.deathPlace ?? ''}
                  onChange={(v) => patch('deathPlace', v)}
                  onCommit={() => save()}
                />
              </Field>
              <div className="col-span-2">
                <VitalNote label={t('person.death')} value={person.deathNote ?? ''} onSave={(v) => saveNote('deathNote', v)} />
              </div>
              <Field
                label={`${t('person.burial')} · ${t('person.date')}`}
                action={<FactSources citations={factCites} tags={['BURI']} label={t('person.burial')} />}
              >
                <DateInput
                  value={person.burialDate ?? ''}
                  placeholder={t('person.dateHint')}
                  onValueChange={(v) => patch('burialDate', v)}
                  onCommit={() => commitDate('burialDate')}
                />
              </Field>
              <Field label={`${t('person.burial')} · ${t('person.place')}`}>
                <PlaceInput
                  value={person.burialPlace ?? ''}
                  onChange={(v) => patch('burialPlace', v)}
                  onCommit={() => save()}
                />
              </Field>
              <div className="col-span-2">
                <VitalNote label={t('person.burial')} value={person.burialNote ?? ''} onSave={(v) => saveNote('burialNote', v)} />
              </div>
              <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={person.deceased || !!person.deathDate}
                  disabled={!!person.deathDate}
                  onChange={(e) => setDeceased(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className={person.deathDate ? 'text-muted-foreground' : ''}>
                  {t('person.deceased')}
                </span>
              </label>
              {/* Born out of wedlock — plain user-set flag. */}
              <label className="col-span-2 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!person.illegitimate}
                  onChange={(e) => setIllegitimate(e.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span>{t('person.illegitimate')}</span>
              </label>
              <div className="col-span-2 -mb-1 flex justify-end">
                <button
                  type="button"
                  onClick={copyBirthToChristening}
                  disabled={!person.birthDate && !person.birthPlace}
                  title={t('person.copyBirthToChristening')}
                  className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground/50 disabled:hover:bg-transparent"
                >
                  <ArrowDownToLine className="h-3 w-3" />
                  {t('person.copyBirthToChristening')}
                </button>
              </div>
              <Field
                label={`${t('person.christening')} · ${t('person.date')}`}
                action={<FactSources citations={factCites} tags={['CHR']} label={t('person.christening')} />}
              >
                <DateInput
                  value={person.christeningDate ?? ''}
                  placeholder={t('person.dateHint')}
                  onValueChange={(v) => patch('christeningDate', v)}
                  onCommit={() => commitDate('christeningDate')}
                />
              </Field>
              <Field label={`${t('person.christening')} · ${t('person.place')}`}>
                <PlaceInput
                  value={person.christeningPlace ?? ''}
                  onChange={(v) => patch('christeningPlace', v)}
                  onCommit={() => save()}
                />
              </Field>
              <div className="col-span-2">
                <VitalNote label={t('person.christening')} value={person.christeningNote ?? ''} onSave={(v) => saveNote('christeningNote', v)} />
              </div>
              <div className="col-span-2">
                <Field label={t('person.religion')}>
                  <Input
                    value={person.religion ?? ''}
                    onChange={(e) => patch('religion', e.target.value)}
                    onBlur={() => save()}
                  />
                </Field>
              </div>
            </div>
            <PersonOccupations personId={person.id} />
            <PersonEvents personId={person.id} />
            <PersonGodparents person={person} />
            <PersonTimeline person={person} />
            <Field label={t('person.notes')}>
              <Textarea
                value={person.notes ?? ''}
                onChange={(e) => patch('notes', e.target.value)}
                onBlur={() => save()}
                rows={4}
              />
            </Field>
            <Separator />

            <PersonAliases personId={person.id} />
            <Separator />

            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setDeleting(true)}>
              <Trash2 className="h-4 w-4" />
              {t('common.delete')}
            </Button>
          </TabsContent>
        </Tabs>
        </div>
      </aside>

      {framingOpen && (
        <PhotoFrameDialog
          open={framingOpen}
          person={person}
          onOpenChange={setFramingOpen}
          onChanged={(p) => {
            setPerson(p)
            void refreshPeople()
          }}
          onReplace={() => {
            setFramingOpen(false)
            void changeAvatar()
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={t('delete.personTitle', { name: fullName(person) })}
          confirmLabel={t('common.delete')}
          onConfirm={doDelete}
        >
          <p className="mb-2">{t('delete.personConsequence')}</p>
          <ul className="space-y-1 rounded-md border border-border bg-secondary/30 p-2 text-foreground">
            {(() => {
              const marriages = families.filter(
                (f) => f.husbandId === person.id || f.wifeId === person.id
              ).length
              const asChild = families.some((f) => f.childIds.includes(person.id))
              const items: string[] = []
              if (marriages) items.push(t('delete.itemMarriages', { count: marriages }))
              if (asChild) items.push(t('delete.itemChild'))
              if (docCount) items.push(t('delete.itemDocs', { count: docCount }))
              items.push(t('delete.itemBoard'))
              return items.map((it) => (
                <li key={it} className="list-inside list-disc">
                  {it}
                </li>
              ))
            })()}
          </ul>
          <p className="mt-2 text-xs">{t('delete.undoHint')}</p>
        </ConfirmDialog>
      )}

      {sheet === 'person' && person && <PersonSheetDialog personId={person.id} onClose={() => setSheet(null)} />}
      {sheet === 'family' && person && <FamilySheetDialog personId={person.id} onClose={() => setSheet(null)} />}
      {fsExpandOpen && person && isFamilySearchId(person.fsId) && (
        <FsExpandDialog
          open={fsExpandOpen}
          onOpenChange={setFsExpandOpen}
          personName={`${person.givenName ?? ''} ${person.surname ?? ''}`.trim()}
          fid={person.fsId!}
        />
      )}
      {fsSyncOpen && person && isFamilySearchId(person.fsId) && (
        <FsPersonSyncDialog
          open={fsSyncOpen}
          onOpenChange={setFsSyncOpen}
          personId={person.id}
          fid={person.fsId!}
          onApplied={async () => {
            await refreshAll()
            const fresh = await window.api.people.get(person.id)
            if (fresh) setPerson(fresh)
            useAppStore.getState().bumpPersonSync()
          }}
        />
      )}
    </>
  )
}

function Field({
  label,
  children,
  action
}: {
  label: string
  children: React.ReactNode
  action?: React.ReactNode
}): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex min-h-[1.125rem] items-center gap-1.5">
        <Label>{label}</Label>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Small pill showing how many items a tab holds (hidden when zero). */
function TabCount({ n }: { n: number }): JSX.Element | null {
  if (!n) return null
  return (
    <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold leading-none text-muted-foreground">
      {n}
    </span>
  )
}
