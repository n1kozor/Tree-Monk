import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  Baby,
  BadgeCheck,
  Camera,
  Copy,
  Droplets,
  ExternalLink,
  FileText,
  Flower2,
  Loader2,
  Lock,
  MapPin,
  MoreHorizontal,
  Network,
  RefreshCw,
  Route,
  Search,
  Bird,
  Trash2,
  Printer,
  Upload,
  UserRound,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/common/DateInput'
import { useDatePlaceholder } from '@/hooks/useDateFormat'
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
import { FsPersonSyncDialog } from '@/components/person/FsPersonSyncDialog'
import { FsExpandDialog } from '@/components/person/FsExpandDialog'
import { PersonSheetDialog, FamilySheetDialog } from '@/components/print/PrintSheets'
import { religionOptions } from '@/lib/religions'
import { PersonQualityCard } from '@/components/person/PersonQualityCard'
import { PersonGodparents } from '@/components/person/PersonGodparents'
import { PersonWitnesses } from '@/components/person/PersonWitnesses'
import { PersonAttributes } from '@/components/person/PersonAttributes'
import { GivenNamesEditor } from '@/components/person/GivenNamesEditor'
import { PersonParticipations } from '@/components/person/PersonParticipations'
import { FactSources, VitalNote } from '@/components/person/FactSources'
import { QualityRing } from '@/components/common/QualityRing'
import { personQuality } from '@/lib/completeness'
import { canSearchFamilySearch, familySearchPersonUrl, familySearchSearchUrl, isFamilySearchId } from '@/lib/familySearchSearch'
import { PersonAliases, NameOriginLine } from '@/components/person/PersonAliases'
import { useAppStore } from '@/store/useAppStore'
import { useSettings } from '@/store/useSettings'
import { useFsMode } from '@/hooks/useFsMode'
import { cn, fullName, yearOf } from '@/lib/utils'
import { smartNormalizeDate } from '@/lib/smartDate'
import type { CitationDetail, Person, PersonInput, SanityIssue, Sex } from '@shared/types'

/**
 * Full-screen, Facebook-style person profile — lives inside the app frame
 * (sidebar + topbar stay). A roomier, tabbed surface than the slide-in side
 * panel, reusing the same family/sources/research/occupation/alias blocks.
 */
export function ProfileView({ personId: personIdProp }: { personId?: string } = {}): JSX.Element | null {
  const { t, i18n } = useTranslation()
  const datePlaceholder = useDatePlaceholder()
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

  const animations = useSettings((s) => s.animations)
  const [person, setPerson] = useState<Person | null>(null)
  const [moreNames, setMoreNames] = useState(false)
  const [tab, setTab] = useState('overview')
  const [factCites, setFactCites] = useState<CitationDetail[]>([])
  const [docCount, setDocCount] = useState(0)
  const [anomalies, setAnomalies] = useState<SanityIssue[]>([])
  const [deleting, setDeleting] = useState(false)
  const [framingOpen, setFramingOpen] = useState(false)
  const [fsConfigured, setFsConfigured] = useState(false)
  const fsMode = useFsMode()
  const [fsSyncOpen, setFsSyncOpen] = useState(false)
  const [fsExpandOpen, setFsExpandOpen] = useState(false)
  const [sheet, setSheet] = useState<'person' | 'family' | null>(null)

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

  useEffect(() => {
    void window.api.familysearch.configured().then(setFsConfigured)
  }, [])

  const patch = (field: keyof PersonInput, value: string): void =>
    setPerson((p) => (p ? { ...p, [field]: value } : p))

  // Toggle the manual "verified" review flag (local + store).
  const toggleVerified = async (): Promise<void> => {
    if (!person) return
    const verified = !person.verified
    setPerson((p) => (p ? { ...p, verified } : p))
    await window.api.people.update(person.id, { verified })
    await refreshPeople()
  }

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
      burialNote: next.burialNote,
      callName: next.callName,
      namePrefix: next.namePrefix,
      nameSuffix: next.nameSuffix,
      stillborn: next.stillborn,
      isPrivate: next.isPrivate
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
  // Stillborn implies deceased (the checkbox reflects that immediately).
  const setStillborn = (v: boolean): void => {
    if (!person) return
    const next = { ...person, stillborn: v, deceased: person.deceased || v }
    setPerson(next)
    void save(next)
  }
  const setPrivate = (v: boolean): void => {
    if (!person) return
    const next = { ...person, isPrivate: v }
    setPerson(next)
    void save(next)
  }
  const commitDate = (field: 'birthDate' | 'deathDate' | 'christeningDate' | 'burialDate'): void => {
    if (!person) return
    // FS mode: the FamilySearch Date authority formats in the UI language.
    void smartNormalizeDate(person[field] ?? '').then((norm) => {
      const next = { ...person, [field]: norm || null }
      setPerson(next)
      void save(next)
    })
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
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-5 sm:px-6 lg:px-8">
        <button
          onClick={closeProfile}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </button>

        {/* Identity header — the name gets its own full-width row so the action
            buttons (which wrap) can never squeeze it. */}
        <div className="glass mt-3 rounded-2xl p-5">
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
              <h1 className="text-2xl font-bold leading-tight">
                {[person.namePrefix, fullName(person), person.nameSuffix].filter(Boolean).join(' ')}
                {person.callName?.trim() && (
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    „{person.callName.trim()}”
                  </span>
                )}
              </h1>
              {lifespan && <p className="mt-0.5 text-sm text-muted-foreground">{lifespan}</p>}
              {/* Married / birth (maiden) name from the typed name variants. */}
              <NameOriginLine personId={person.id} />
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
                {person.illegitimate && (
                  <Badge className="text-amber-600 dark:text-amber-400">
                    {t('person.illegitimate')}
                  </Badge>
                )}
                {person.stillborn && (
                  <Badge className="text-slate-600 dark:text-slate-300">{t('person.stillborn')}</Badge>
                )}
                {person.isPrivate && (
                  <Badge className="text-rose-600 dark:text-rose-400">
                    <Lock className="h-3 w-3" /> {t('person.private')}
                  </Badge>
                )}
                {person.occupation?.trim() && <Badge>{person.occupation.trim()}</Badge>}
              </div>
            </div>

            <div className="hidden shrink-0 flex-col items-center gap-1 sm:flex">
              <QualityRing value={personQuality(person, occPersonIds).score} size={56} title={t('quality.title')} />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('quality.title')}
              </span>
            </div>
          </div>

          {/* Actions — grouped by weight: the teal navigation trio, then the
              FamilySearch cluster, then status + the ⋯ overflow on the right. */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
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
              className="gap-1.5 border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
              onClick={() => {
                void save()
                openPersonOnMap(person.id)
              }}
            >
              <MapPin className="h-3.5 w-3.5" />
              {t('person.showOnMap')}
            </Button>
            {rootPerson && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-primary/25 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                onClick={() => openKinship(person.id)}
              >
                <Route className="h-3.5 w-3.5" />
                {t('person.howRelatedGeneric')}
              </Button>
            )}

            <span className="mx-1 hidden h-5 w-px bg-border/60 sm:block" aria-hidden />

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
            {fsMode && fsConfigured && isFamilySearchId(person.fsId) && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
                  onClick={() => setFsSyncOpen(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('fs.pullBtn')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setFsExpandOpen(true)}
                >
                  <Network className="h-3.5 w-3.5" />
                  {t('fsExpand.btn')}
                </Button>
              </>
            )}

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant={person.verified ? 'default' : 'outline'}
                size="sm"
                className={cn('gap-1.5', person.verified && 'bg-emerald-600 text-white hover:bg-emerald-700')}
                onClick={() => void toggleVerified()}
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                {person.verified ? t('person.verifiedOn') : t('person.markVerified')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title={t('person.moreActions')}
                    aria-label={t('person.moreActions')}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSheet('person')}>
                    <Printer className="h-4 w-4" />
                    {t('print.personSheet')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSheet('family')}>
                    <Printer className="h-4 w-4" />
                    {t('print.familySheet')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleting(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('common.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Tabbed content. A compact segmented switcher — always-labelled,
            counted, the active segment tinted in the app's selection teal and
            slid into place — kept sticky so it never scrolls out of reach. */}
        <Tabs value={tab} onValueChange={setTab} className="mt-5 pb-12">
          <TabsList className="sticky top-2 z-20 h-auto">
            {(
              [
                { value: 'overview', icon: UserRound, label: t('person.overview'), count: 0 },
                { value: 'family', icon: Users, label: t('person.family'), count: familyCount },
                { value: 'sources', icon: FileText, label: t('person.sources'), count: docCount },
                { value: 'research', icon: Search, label: t('person.research'), count: 0 }
              ] as const
            ).map(({ value, icon: Icon, label, count }) => {
              const active = tab === value
              return (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    'relative h-9 gap-2 px-4 transition-colors',
                    'hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="profile-tab-pill"
                      transition={
                        animations ? { type: 'spring', bounce: 0.16, duration: 0.45 } : { duration: 0 }
                      }
                      className="absolute inset-0 rounded-lg bg-primary/15 ring-1 ring-primary/25"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className={cn(active && 'font-semibold')}>{label}</span>
                    <TabCount n={count} active={active} />
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* Overview — editable vitals + occupations + aliases */}
          <TabsContent
            value="overview"
            className="mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
          >
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
              {/* Center column: identity, then the vital events as four scannable
                  register-style blocks, then faith & notes and the extras. */}
              <div className="space-y-5">
                <Card title={t('person.identity')}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Hungarian writes the family name first; other languages given first. */}
                    {(i18n.language === 'hu'
                      ? (['surname', 'givenName'] as const)
                      : (['givenName', 'surname'] as const)
                    ).map((f) => (
                      <Field key={f} label={t(`person.${f}`)}>
                        {f === 'givenName' ? (
                          /* Structured given-names editor: numbered chips, drag to
                             reorder — storage stays the space-separated string. */
                          <GivenNamesEditor
                            value={person.givenName}
                            onCommit={(v) => {
                              const next = { ...person, givenName: v }
                              setPerson(next)
                              void save(next)
                            }}
                          />
                        ) : (
                          <Input value={person[f]} onChange={(e) => patch(f, e.target.value)} onBlur={() => save()} />
                        )}
                      </Field>
                    ))}
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
                              'flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                              person.sex === value
                                ? 'border-primary bg-primary/15 text-primary shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
                                : 'border-border/40 text-muted-foreground hover:bg-accent'
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label={t('person.religion')}>
                      <Input list="tm-religions" value={person.religion ?? ''} onChange={(e) => patch('religion', e.target.value)} onBlur={() => save()} />
                      <datalist id="tm-religions">
                        {religionOptions(i18n.language).map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label={t('person.callName')}>
                      <Input
                        value={person.callName ?? ''}
                        onChange={(e) => patch('callName', e.target.value)}
                        onBlur={() => save()}
                        placeholder={t('person.callNameHint')}
                      />
                    </Field>
                    {/* Prefix + suffix are rare — folded behind a small link,
                        auto-open whenever either carries a value. */}
                    {moreNames || person.namePrefix || person.nameSuffix ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Field label={t('person.namePrefix')}>
                          <Input
                            value={person.namePrefix ?? ''}
                            onChange={(e) => patch('namePrefix', e.target.value)}
                            onBlur={() => save()}
                            placeholder="Dr."
                          />
                        </Field>
                        <Field label={t('person.nameSuffix')}>
                          <Input
                            value={person.nameSuffix ?? ''}
                            onChange={(e) => patch('nameSuffix', e.target.value)}
                            onBlur={() => save()}
                            placeholder="Jr."
                          />
                        </Field>
                      </div>
                    ) : (
                      <button
                        onClick={() => setMoreNames(true)}
                        className="self-end pb-2 text-left text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                      >
                        + {t('person.moreNameFields')}
                      </button>
                    )}
                  </div>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!person.isPrivate}
                      onChange={(e) => setPrivate(e.target.checked)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <span>{t('person.private')}</span>
                    <span className="text-xs text-muted-foreground">{t('person.privateHint')}</span>
                  </label>
                </Card>

                <Card title={t('person.vitalEvents')}>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
                    <VitalBlock
                      icon={Baby}
                      tint="text-emerald-600 dark:text-emerald-400"
                      title={t('person.birth')}
                      action={<FactSources citations={factCites} tags={['BIRT', 'CHR']} label={t('person.birth')} />}
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Field label={t('person.date')}>
                          <DateInput
                            value={person.birthDate ?? ''}
                            placeholder={datePlaceholder}
                            onValueChange={(v) => patch('birthDate', v)}
                            onCommit={() => commitDate('birthDate')}
                          />
                        </Field>
                        <Field label={t('person.place')}>
                          <PlaceInput value={person.birthPlace ?? ''} onChange={(v) => patch('birthPlace', v)} onCommit={() => save()} />
                        </Field>
                      </div>
                      <VitalNote label={t('person.birth')} value={person.birthNote ?? ''} onSave={(v) => saveNote('birthNote', v)} />
                    </VitalBlock>

                    <VitalBlock
                      icon={Droplets}
                      tint="text-sky-600 dark:text-sky-400"
                      title={t('person.christening')}
                      action={
                        <>
                          <button
                            type="button"
                            onClick={copyBirthToChristening}
                            disabled={!person.birthDate && !person.birthPlace}
                            title={t('person.copyBirthToChristening')}
                            aria-label={t('person.copyBirthToChristening')}
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-primary/30 bg-primary/5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground/50 disabled:hover:bg-transparent"
                          >
                            <ArrowDownToLine className="h-3 w-3" />
                          </button>
                          <FactSources citations={factCites} tags={['CHR']} label={t('person.christening')} />
                        </>
                      }
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Field label={t('person.date')}>
                          <DateInput
                            value={person.christeningDate ?? ''}
                            placeholder={datePlaceholder}
                            onValueChange={(v) => patch('christeningDate', v)}
                            onCommit={() => commitDate('christeningDate')}
                          />
                        </Field>
                        <Field label={t('person.place')}>
                          <PlaceInput value={person.christeningPlace ?? ''} onChange={(v) => patch('christeningPlace', v)} onCommit={() => save()} />
                        </Field>
                      </div>
                      <VitalNote label={t('person.christening')} value={person.christeningNote ?? ''} onSave={(v) => saveNote('christeningNote', v)} />
                    </VitalBlock>

                    <VitalBlock
                      icon={Bird}
                      tint="text-slate-500 dark:text-slate-300"
                      title={t('person.death')}
                      action={<FactSources citations={factCites} tags={['DEAT']} label={t('person.death')} />}
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Field label={t('person.date')}>
                          <DateInput
                            value={person.deathDate ?? ''}
                            placeholder={datePlaceholder}
                            onValueChange={(v) => patch('deathDate', v)}
                            onCommit={() => commitDate('deathDate')}
                          />
                        </Field>
                        <Field label={t('person.place')}>
                          <PlaceInput value={person.deathPlace ?? ''} onChange={(v) => patch('deathPlace', v)} onCommit={() => save()} />
                        </Field>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={deceased}
                            disabled={!!person.deathDate || !!person.stillborn}
                            onChange={(e) => setDeceased(e.target.checked)}
                            className="h-4 w-4 accent-[hsl(var(--primary))]"
                          />
                          <span className={person.deathDate || person.stillborn ? 'text-muted-foreground' : ''}>
                            {t('person.deceased')}
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!person.stillborn}
                            onChange={(e) => setStillborn(e.target.checked)}
                            className="h-4 w-4 accent-[hsl(var(--primary))]"
                          />
                          <span>{t('person.stillborn')}</span>
                        </label>
                      </div>
                      <VitalNote label={t('person.death')} value={person.deathNote ?? ''} onSave={(v) => saveNote('deathNote', v)} />
                    </VitalBlock>

                    <VitalBlock
                      icon={Flower2}
                      tint="text-amber-700 dark:text-amber-400"
                      title={t('person.burial')}
                      action={<FactSources citations={factCites} tags={['BURI']} label={t('person.burial')} />}
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Field label={t('person.date')}>
                          <DateInput
                            value={person.burialDate ?? ''}
                            placeholder={datePlaceholder}
                            onValueChange={(v) => patch('burialDate', v)}
                            onCommit={() => commitDate('burialDate')}
                          />
                        </Field>
                        <Field label={t('person.place')}>
                          <PlaceInput value={person.burialPlace ?? ''} onChange={(v) => patch('burialPlace', v)} onCommit={() => save()} />
                        </Field>
                      </div>
                      <VitalNote label={t('person.burial')} value={person.burialNote ?? ''} onSave={(v) => saveNote('burialNote', v)} />
                    </VitalBlock>
                  </div>
                </Card>

                <Card>
                  <Field label={t('person.notes')}>
                    <Textarea value={person.notes ?? ''} onChange={(e) => patch('notes', e.target.value)} onBlur={() => save()} rows={4} />
                  </Field>
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
                    <PersonAliases personId={person.id} />
                  </Card>
                  <Card>
                    <PersonAttributes personId={person.id} />
                  </Card>
                </div>

                {/* Role participations — self-hiding, like the collaborations below. */}
                <PersonParticipations personId={person.id} variant="card" />

                {/* FamilySearch collaboration discussions — its own section, only
                    shown when the person actually has any. */}
                <PersonCollaborations personId={person.id} />
              </div>

              {/* Right column: the timeline only, kept in view while scrolling —
                  offset below the sticky section nav. */}
              <div className="lg:sticky lg:top-14 lg:self-start">
                <Card>
                  <PersonTimeline person={person} />
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="family"
            className="mt-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
          >
            <Card>
              <PersonFamily person={person} />
            </Card>
            <Card>
              <PersonGodparents person={person} />
            </Card>
            <Card>
              <PersonWitnesses
                ownerType="person"
                ownerId={person.id}
                title={t('witnesses.christeningTitle')}
                excludeIds={[person.id]}
              />
            </Card>
          </TabsContent>

          <TabsContent
            value="sources"
            className="mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
          >
            <Card>
              <PersonSources personId={person.id} />
            </Card>
          </TabsContent>

          <TabsContent
            value="research"
            className="mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
          >
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

      {sheet === 'person' && <PersonSheetDialog personId={person.id} onClose={() => setSheet(null)} />}
      {sheet === 'family' && <FamilySheetDialog personId={person.id} onClose={() => setSheet(null)} />}
      {fsExpandOpen && isFamilySearchId(person.fsId) && (
        <FsExpandDialog
          open={fsExpandOpen}
          onOpenChange={setFsExpandOpen}
          personName={`${person.givenName ?? ''} ${person.surname ?? ''}`.trim()}
          fid={person.fsId!}
        />
      )}
      {fsSyncOpen && isFamilySearchId(person.fsId) && (
        <FsPersonSyncDialog
          open={fsSyncOpen}
          onOpenChange={setFsSyncOpen}
          personId={person.id}
          fid={person.fsId!}
          onApplied={async () => {
            await Promise.all([refreshAll(), reload()])
            useAppStore.getState().bumpPersonSync()
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
    <section className="glass rounded-2xl p-4">
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

/** One vital event (birth/christening/death/burial) as a compact block: a
 *  small tinted icon + the app's usual section title, per-fact actions on the
 *  right, date/place pair beneath. Four of these tile 2-up on wide screens. */
function VitalBlock({
  icon: Icon,
  tint,
  title,
  action,
  children
}: {
  icon: React.ComponentType<{ className?: string }>
  tint: string
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', tint)} />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">{action}</div>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/40 bg-secondary/50 px-2.5 py-0.5 text-xs font-medium text-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}

/** Count pill shown on a tab (hidden when zero). */
function TabCount({ n, active }: { n: number; active?: boolean }): JSX.Element | null {
  if (!n) return null
  return (
    <span
      className={cn(
        'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none',
        active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
      )}
    >
      {n}
    </span>
  )
}
