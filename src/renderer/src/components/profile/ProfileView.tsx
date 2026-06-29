import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  Camera,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Network,
  RefreshCw,
  Route,
  Search,
  Bird,
  Trash2,
  UserRound,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/common/DateInput'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlaceInput } from '@/components/common/PlaceInput'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { ConfirmDialog, toastUndo } from '@/components/common/ConfirmDialog'
import { PersonFamily } from '@/components/person/PersonFamily'
import { PersonSources } from '@/components/person/PersonSources'
import { PersonResearch } from '@/components/person/PersonResearch'
import { PersonOccupations } from '@/components/person/PersonOccupations'
import { PersonEvents } from '@/components/person/PersonEvents'
import { PersonCollaborations } from '@/components/person/PersonCollaborations'
import { PersonTimeline } from '@/components/person/PersonTimeline'
import { PhotoFrameDialog } from '@/components/person/PhotoFrameDialog'
import { PersonQualityCard } from '@/components/person/PersonQualityCard'
import { PersonGodparents } from '@/components/person/PersonGodparents'
import { FactSources, VitalNote } from '@/components/person/FactSources'
import { QualityRing } from '@/components/common/QualityRing'
import { personQuality } from '@/lib/completeness'
import { canSearchFamilySearch, familySearchPersonUrl, familySearchSearchUrl, isFamilySearchId } from '@/lib/familySearchSearch'
import { PersonAliases } from '@/components/person/PersonAliases'
import { useAppStore } from '@/store/useAppStore'
import { cn, fullName, yearOf } from '@/lib/utils'
import { normalizeDate } from '@/lib/dates'
import type { CitationDetail, Person, PersonInput, SanityIssue, Sex } from '@shared/types'

/**
 * Full-screen, Facebook-style person profile — lives inside the app frame
 * (sidebar + topbar stay). A roomier, tabbed surface than the slide-in side
 * panel, reusing the same family/sources/research/occupation/alias blocks.
 */
export function ProfileView({ personId: personIdProp }: { personId?: string } = {}): JSX.Element | null {
  const { t, i18n } = useTranslation()
  // Each profile tab passes its own id; falls back to the active profile slot.
  const activeProfileId = useAppStore((s) => s.profilePersonId)
  const personId = personIdProp ?? activeProfileId
  const closeProfile = useAppStore((s) => s.closeProfile)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const focusPersonTree = useAppStore((s) => s.focusPersonTree)
  const openKinship = useAppStore((s) => s.openKinship)
  const openPersonOnMap = useAppStore((s) => s.openPersonOnMap)
  const defaultRootId = useAppStore((s) => s.defaultRootId)
  const treeRootId = useAppStore((s) => s.treeRootId)
  const peopleById = useAppStore((s) => s.peopleById)
  const families = useAppStore((s) => s.families)
  const occPersonIds = useAppStore((s) => s.occupationPersonIds)
  const refreshPeople = useAppStore((s) => s.refreshPeople)
  const refreshAll = useAppStore((s) => s.refreshAll)
  const refreshDocuments = useAppStore((s) => s.refreshDocuments)
  const personSyncNonce = useAppStore((s) => s.personSyncNonce)

  const [person, setPerson] = useState<Person | null>(null)
  const [factCites, setFactCites] = useState<CitationDetail[]>([])
  const [docCount, setDocCount] = useState(0)
  const [anomalies, setAnomalies] = useState<SanityIssue[]>([])
  const [deleting, setDeleting] = useState(false)
  const [framingOpen, setFramingOpen] = useState(false)

  const reload = useCallback(async () => {
    if (!personId) {
      setPerson(null)
      return
    }
    const [p, d, issues] = await Promise.all([
      window.api.people.get(personId),
      window.api.documents.listForPerson(personId),
      window.api.sanity.check()
    ])
    setPerson(p)
    setDocCount(d.length)
    setAnomalies(issues.filter((i) => i.people.some((x) => x.id === personId)))
  }, [personId])

  // Citations for the per-fact source chips (refreshed after a sync too).
  useEffect(() => {
    if (!personId) {
      setFactCites([])
      return
    }
    void window.api.research.citationsForPerson(personId).then(setFactCites)
  }, [personId, personSyncNonce])

  useEffect(() => {
    void reload()
  }, [reload])

  const patch = (field: keyof PersonInput, value: string): void =>
    setPerson((p) => (p ? { ...p, [field]: value } : p))

  const save = async (next: Person | null = person): Promise<void> => {
    if (!next) return
    await window.api.people.update(next.id, {
      givenName: next.givenName,
      surname: next.surname,
      sex: next.sex,
      birthDate: next.birthDate,
      birthPlace: next.birthPlace,
      deathDate: next.deathDate,
      deathPlace: next.deathPlace,
      deceased: next.deceased,
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

  const setSex = (sex: Sex): void => {
    if (!person || person.sex === sex) return
    const next = { ...person, sex }
    setPerson(next)
    void save(next)
  }
  const setDeceased = (v: boolean): void => {
    if (!person) return
    const next = { ...person, deceased: v }
    setPerson(next)
    void save(next)
  }
  const commitDate = (field: 'birthDate' | 'deathDate' | 'christeningDate' | 'burialDate'): void => {
    if (!person) return
    const norm = normalizeDate(person[field] ?? '')
    const next = { ...person, [field]: norm || null }
    setPerson(next)
    void save(next)
  }
  const copyBirthToChristening = (): void => {
    if (!person) return
    const next = { ...person, christeningDate: person.birthDate, christeningPlace: person.birthPlace }
    setPerson(next)
    void save(next)
  }
  const changeAvatar = async (): Promise<void> => {
    if (!person) return
    const updated = await window.api.people.setAvatar(person.id)
    if (updated) {
      setPerson(updated)
      await Promise.all([refreshPeople(), refreshDocuments()])
    }
  }

  const doDelete = async (): Promise<void> => {
    if (!person) return
    const snap = await window.api.people.remove(person.id)
    await refreshAll()
    closeProfile()
    if (snap) {
      toastUndo(t('delete.personDeleted', { name: fullName(person) }), t('common.undo'), async () => {
        await window.api.people.restore(snap)
        await refreshAll()
      })
    }
  }

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

  if (!personId || !person) return null

  const deceased = person.deceased || !!person.deathDate
  const by = yearOf(person.birthDate)
  const dy = yearOf(person.deathDate)
  const lifespan = by || dy ? `${by || '?'} – ${deceased ? dy || '?' : t('tree.living')}` : ''
  const rootId = defaultRootId ?? treeRootId
  const rootPerson = rootId && rootId !== person.id ? peopleById.get(rootId) : undefined

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <button
          onClick={closeProfile}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </button>

        {/* Identity header — the name gets its own full-width row so the action
            buttons (which wrap) can never squeeze it. */}
        <div className="mt-3 rounded-2xl border border-border bg-card/60 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => (person.profilePhotoId ? setFramingOpen(true) : void changeAvatar())}
              title={person.profilePhotoId ? t('photo.adjust') : t('person.changePhoto')}
              className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-2 ring-border"
            >
              <PersonAvatar
                personId={person.id}
                name={fullName(person)}
                sex={person.sex}
                className="h-24 w-24 text-2xl"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold leading-tight">{fullName(person)}</h1>
              {lifespan && <p className="mt-0.5 text-sm text-muted-foreground">{lifespan}</p>}
              {isFamilySearchId(person.fsId) && (
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(person.fsId!)
                    toast.success(t('person.fsIdCopied'))
                  }}
                  title={t('person.copyFsId')}
                  className="group/fsid mt-0.5 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t('person.fsIdLabel')}: <span className="font-mono">{person.fsId}</span>
                  <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover/fsid:opacity-70" />
                </button>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>
                  {person.sex === 'M'
                    ? t('person.male')
                    : person.sex === 'F'
                      ? t('person.female')
                      : t('common.unknown')}
                </Badge>
                {deceased ? (
                  <Badge className="text-slate-600 dark:text-slate-300">
                    <Bird className="h-3 w-3" /> {t('tree.deceased')}
                  </Badge>
                ) : (
                  <Badge className="text-emerald-600 dark:text-emerald-400">{t('tree.living')}</Badge>
                )}
                {person.occupation?.trim() && <Badge>{person.occupation.trim()}</Badge>}
              </div>
            </div>

            <QualityRing
              value={personQuality(person, occPersonIds).score}
              size={56}
              title={t('quality.title')}
              className="hidden shrink-0 sm:block"
            />
          </div>

          {/* Primary actions — own row, wrap freely. */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                void save()
                focusPersonTree(person.id)
              }}
            >
              <Network className="h-3.5 w-3.5" />
              {t('person.showTree')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                void save()
                openPersonOnMap(person.id)
              }}
            >
              <MapPin className="h-3.5 w-3.5" />
              {t('person.showOnMap')}
            </Button>
            {familySearchPersonUrl(person) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-sky-500/40 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-400"
                onClick={() => {
                  const u = familySearchPersonUrl(person)
                  if (u) void window.api.app.openExternal(u)
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('person.openFamilySearch')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!canSearchFamilySearch(person)}
              onClick={() => void window.api.app.openExternal(familySearchSearchUrl(person, i18n.language))}
            >
              <Search className="h-3.5 w-3.5" />
              {t('person.searchFamilySearch')}
            </Button>
            {rootPerson && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openKinship(person.id)}>
                <Route className="h-3.5 w-3.5" />
                {t('person.howRelatedGeneric')}
              </Button>
            )}
          </div>
        </div>

        {/* Tabbed content */}
        <Tabs defaultValue="overview" className="mt-5 pb-12">
          <TabsList className="h-11 w-full">
            <TabsTrigger value="overview" className="flex-1 gap-1.5">
              <UserRound className="h-4 w-4" />
              <span className="hidden sm:inline">{t('person.overview')}</span>
            </TabsTrigger>
            <TabsTrigger value="family" className="flex-1 gap-1.5">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">{t('person.family')}</span>
              <TabCount n={familyCount} />
            </TabsTrigger>
            <TabsTrigger value="sources" className="flex-1 gap-1.5">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">{t('person.sources')}</span>
              <TabCount n={docCount} />
            </TabsTrigger>
            <TabsTrigger value="research" className="flex-1 gap-1.5">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">{t('person.research')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview — editable vitals + occupations + aliases */}
          <TabsContent value="overview" className="mt-4">
            {anomalies.length > 0 && (
              <div className="mb-4 space-y-1.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t('person.anomaliesTitle', { count: anomalies.length })}
                </p>
                {anomalies.map((a) => (
                  <p key={a.id} className="pl-6 text-xs leading-snug text-amber-700 dark:text-amber-300/90">
                    <span className="font-medium">{t(`issues.rules.${a.rule}`)}</span>
                    {a.detail ? ` — ${a.detail}` : ''}
                  </p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              {/* Center column: vitals + everything that used to flank the timeline */}
              <div className="space-y-5">
              <Card title={t('person.overview')}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Hungarian writes the family name first; other languages given first. */}
                  {(i18n.language === 'hu'
                    ? (['surname', 'givenName'] as const)
                    : (['givenName', 'surname'] as const)
                  ).map((f) => (
                    <Field key={f} label={t(`person.${f}`)}>
                      <Input value={person[f]} onChange={(e) => patch(f, e.target.value)} onBlur={() => save()} />
                    </Field>
                  ))}
                  <div className="sm:col-span-2">
                    <Field label={t('person.sex')}>
                      <div className="flex gap-1.5">
                        {(
                          [
                            ['M', t('person.male')],
                            ['F', t('person.female')],
                            ['U', t('common.unknown')]
                          ] as [Sex, string][]
                        ).map(([value, label]) => (
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
                  </div>
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
                    <PlaceInput value={person.birthPlace ?? ''} onChange={(v) => patch('birthPlace', v)} onCommit={() => save()} />
                  </Field>
                  <div className="sm:col-span-2">
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
                    <PlaceInput value={person.deathPlace ?? ''} onChange={(v) => patch('deathPlace', v)} onCommit={() => save()} />
                  </Field>
                  <div className="sm:col-span-2">
                    <VitalNote label={t('person.death')} value={person.deathNote ?? ''} onSave={(v) => saveNote('deathNote', v)} />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={deceased}
                      disabled={!!person.deathDate}
                      onChange={(e) => setDeceased(e.target.checked)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <span className={person.deathDate ? 'text-muted-foreground' : ''}>{t('person.deceased')}</span>
                  </label>
                  <div className="flex justify-end sm:col-span-2">
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
                    <PlaceInput value={person.christeningPlace ?? ''} onChange={(v) => patch('christeningPlace', v)} onCommit={() => save()} />
                  </Field>
                  <div className="sm:col-span-2">
                    <VitalNote label={t('person.christening')} value={person.christeningNote ?? ''} onSave={(v) => saveNote('christeningNote', v)} />
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
                    <PlaceInput value={person.burialPlace ?? ''} onChange={(v) => patch('burialPlace', v)} onCommit={() => save()} />
                  </Field>
                  <div className="sm:col-span-2">
                    <VitalNote label={t('person.burial')} value={person.burialNote ?? ''} onSave={(v) => saveNote('burialNote', v)} />
                  </div>
                  <div className="sm:col-span-2">
                    <Field label={t('person.religion')}>
                      <Input value={person.religion ?? ''} onChange={(e) => patch('religion', e.target.value)} onBlur={() => save()} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label={t('person.notes')}>
                      <Textarea value={person.notes ?? ''} onChange={(e) => patch('notes', e.target.value)} onBlur={() => save()} rows={4} />
                    </Field>
                  </div>
                </div>
              </Card>

                <PersonQualityCard person={person} />

                {/* The cards that used to sit above/below the timeline — now in the
                    centre, two-up so they fill the wider page. */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <Card>
                    <PersonOccupations personId={person.id} />
                  </Card>
                  <Card>
                    <PersonEvents personId={person.id} />
                  </Card>
                  <Card>
                    <PersonGodparents person={person} />
                  </Card>
                  <Card>
                    <PersonAliases personId={person.id} />
                  </Card>
                </div>

                {/* FamilySearch collaboration discussions — its own section, only
                    shown when the person actually has any. */}
                <PersonCollaborations personId={person.id} />

                <Button variant="destructive" size="sm" className="w-full gap-2" onClick={() => setDeleting(true)}>
                  <Trash2 className="h-4 w-4" />
                  {t('common.delete')}
                </Button>
              </div>

              {/* Right column: the timeline only, kept in view while scrolling. */}
              <div className="lg:sticky lg:top-4 lg:self-start">
                <Card>
                  <PersonTimeline person={person} />
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="family" className="mt-4 space-y-4">
            <Card>
              <PersonFamily person={person} />
            </Card>
            <Card>
              <PersonGodparents person={person} />
            </Card>
          </TabsContent>

          <TabsContent value="sources" className="mt-4">
            <Card>
              <PersonSources personId={person.id} />
            </Card>
          </TabsContent>

          <TabsContent value="research" className="mt-4">
            <Card>
              <PersonResearch personId={person.id} />
            </Card>
          </TabsContent>
        </Tabs>
      </div>

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
          <p className="text-xs">{t('delete.undoHint')}</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function Card({
  title,
  children
}: {
  title?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
      {title && (
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      )}
      <div className="space-y-3">{children}</div>
    </section>
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

function Badge({ className, children }: { className?: string; children: React.ReactNode }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2.5 py-0.5 text-xs font-medium text-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}

/** Count pill shown on a tab (hidden when zero). */
function TabCount({ n }: { n: number }): JSX.Element | null {
  if (!n) return null
  return (
    <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold leading-none text-muted-foreground">
      {n}
    </span>
  )
}
