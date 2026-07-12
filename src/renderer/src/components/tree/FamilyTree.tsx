import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GalleryVerticalEnd,
  LayoutGrid,
  LocateFixed,
  Minus,
  Network,
  Plus,
  Printer,
  Sprout,
  Wand2, TreeDeciduous } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { usePedigreeSettings, type TreeViewKind } from '@/store/usePedigreeSettings'
import { FanChart } from './FanChart'
import { FanOptions } from './FanOptions'
import { DescendantTree } from './DescendantTree'
import { PedigreeChart } from './PedigreeChart'
import { PortraitChart } from './PortraitChart'
import { RootPicker } from './RootPicker'
import { PanZoom } from './PanZoom'
import { FsPersonSyncDialog } from '@/components/person/FsPersonSyncDialog'
import { FsScanDialog, FsScanPill } from './FsScanDialog'
import { useFsMode } from '@/hooks/useFsMode'
import { useFsChangeWatcher } from '@/hooks/useFsChangeWatcher'
import { isFamilySearchId } from '@/lib/familySearchSearch'
import { TreePersonDialog, type PersonDraft } from './TreePersonDialog'
import { ExportTreeDialog } from './ExportTreeDialog'
import { PedigreeSettingsPanel } from './PedigreeSettingsPanel'
import { CustomViewPanel, EMPTY_CUSTOM, type CustomConfig } from './CustomViewPanel'
import { buildColoring } from '@/lib/customColor'
import type { PedigreeCouple, Sex, TreeNodeDatum } from '@shared/types'

/** A pending "quick add" awaiting the name modal. */
type AddReq =
  | { kind: 'parent'; childId: string; sex: Sex }
  | { kind: 'child'; familyId: string }
  | { kind: 'spouse'; familyId: string; role: 'husband' | 'wife' }

const VIEWS: { key: TreeViewKind; icon: typeof LayoutGrid; labelKey: string }[] = [
  { key: 'landscape', icon: Network, labelKey: 'tree.viewLandscape' },
  { key: 'portrait', icon: GalleryVerticalEnd, labelKey: 'tree.viewPortrait' },
  { key: 'fan', icon: LayoutGrid, labelKey: 'tree.viewFan' },
  { key: 'descendants', icon: Sprout, labelKey: 'tree.viewDescendants' }
]

export function FamilyTree(): JSX.Element {
  const { t } = useTranslation()
  const ped = usePedigreeSettings()
  // Background FamilySearch change watcher (FS mode only) + card-badge clicks.
  useFsChangeWatcher(true)
  const fsMode = useFsMode()
  const startFsScan = useAppStore((s) => s.startFsScan)
  const fsScanRunning = useAppStore((s) => s.fsScan?.running ?? false)
  const [fsSyncTarget, setFsSyncTarget] = useState<{ personId: string; fid: string } | null>(null)
  useEffect(() => {
    const onOpen = (e: Event): void => {
      const personId = (e as CustomEvent<{ personId: string }>).detail?.personId
      if (!personId) return
      const p = useAppStore.getState().peopleById.get(personId)
      if (p && isFamilySearchId(p.fsId)) setFsSyncTarget({ personId, fid: p.fsId! })
    }
    window.addEventListener('fs-open-sync', onOpen)
    return () => window.removeEventListener('fs-open-sync', onOpen)
  }, [])
  // view + fanGenerations live in the persisted store — survive navigation away/back.
  const view = ped.viewKind
  const setView = (v: TreeViewKind): void => ped.set({ viewKind: v })
  const generations = ped.fanGenerations
  const setGenerations = (fn: number | ((prev: number) => number)): void => {
    const next = typeof fn === 'function' ? fn(ped.fanGenerations) : fn
    ped.set({ fanGenerations: next })
  }
  const [pedigree, setPedigree] = useState<PedigreeCouple | null>(null)
  const [treeData, setTreeData] = useState<TreeNodeDatum[]>([])
  const [rootId, setRootId] = useState<string | undefined>(undefined)
  // Chosen union when a person has multiple marriages (spouse switcher).
  const [rootFamilyId, setRootFamilyId] = useState<string | undefined>(undefined)
  const [addReq, setAddReq] = useState<AddReq | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  // Person ids flagged by the sanity check, surfaced on the pedigree cards.
  const [issueIds, setIssueIds] = useState<Set<string>>(new Set())
  const [kinshipNotes, setKinshipNotes] = useState<Map<string, string>>(new Map())
  const selectPerson = useAppStore((s) => s.selectPerson)
  const setTreeRoot = useAppStore((s) => s.setTreeRoot)
  const treeRootId = useAppStore((s) => s.treeRootId)
  const treeFocusNonce = useAppStore((s) => s.treeFocusNonce)
  const defaultRootId = useAppStore((s) => s.defaultRootId)
  const refreshAll = useAppStore((s) => s.refreshAll)
  // The tree cards show a per-person source count baked in server-side; re-fetch
  // when a source changes so adding/removing one updates live. docTotal catches
  // document (file/link) changes storewide; sourcesNonce catches citations, which
  // aren't held in the store.
  const docTotal = useAppStore((s) => s.documents.length)
  const sourcesNonce = useAppStore((s) => s.sourcesNonce)
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)

  // The tree page is kept mounted (its layout survives navigation), but its
  // viewport can drift "scattered" while hidden. Each time it's shown again
  // (switching back from another view, or closing a profile tab over it), bump a
  // signal the charts use to RE-FIT the camera — without touching how the tree
  // was expanded.
  const treeVisible = useAppStore((s) => s.activeTabId === null && s.view === 'tree')
  const [refitNonce, setRefitNonce] = useState(0)
  const wasVisible = useRef(treeVisible)
  useEffect(() => {
    if (treeVisible && !wasVisible.current) setRefitNonce((n) => n + 1)
    wasVisible.current = treeVisible
  }, [treeVisible])

  // When a person is focused from their profile ("Person's tree"), adopt it.
  // The nonce is in the deps so a focus re-roots even when treeRootId is
  // unchanged (the tree is kept mounted, so without it a re-focus on the same
  // person would leave a recentered/drifted local root in place).
  useEffect(() => {
    if (treeRootId) {
      setRootId(treeRootId)
      setRootFamilyId(undefined)
    }
  }, [treeRootId, treeFocusNonce])

  useEffect(() => {
    if (view === 'landscape' || view === 'portrait')
      window.api.tree.pedigree(rootId, rootFamilyId).then(setPedigree)
    else if (view === 'fan') window.api.tree.build(rootId, 'ancestors').then(setTreeData)
    else if (view === 'descendants') window.api.tree.build(rootId, 'descendants').then(setTreeData)
    // 'insights' reads people/families straight from the store — no fetch needed.
    // docTotal/sourcesNonce: re-fetch so the per-person source badge updates when
    // a source (document or citation) is added/removed on a profile.
  }, [people, families, view, rootId, rootFamilyId, docTotal, sourcesNonce])

  // Data-issue markers for the pedigree (same check as the Data Issues view).
  useEffect(() => {
    window.api.sanity
      .check()
      .then((issues) => {
        const s = new Set<string>()
        issues.forEach((i) => i.people.forEach((p) => s.add(p.id)))
        setIssueIds(s)
      })
      .catch(() => setIssueIds(new Set()))
  }, [people, families])

  // Unusual-marriage markers (consanguinity / step-sibling) for the tree cards.
  useEffect(() => {
    if (typeof window.api.tree.kinship !== 'function') return
    const nameOf = (id: string | null): string => {
      if (!id) return '—'
      const p = people.find((x) => x.id === id)
      return p ? `${p.givenName ?? ''} ${p.surname ?? ''}`.trim() || '—' : '—'
    }
    window.api.tree
      .kinship()
      .then((flags) => {
        const m = new Map<string, string>()
        for (const [pid, list] of Object.entries(flags)) {
          const lines = list.map((f) => {
            if (f.kind === 'stepSiblingMarriage') return `${t('tree.kinStepSibling')}: ${nameOf(f.withId)}`
            // Consanguineous: also name the common ancestor, so it's clear WHERE
            // the blood link is (relatedIds[0] = the nearest shared ancestor).
            const ancestor = f.relatedIds?.[0] ? nameOf(f.relatedIds[0]) : null
            const base = `${t('tree.kinConsanguineous')}: ${nameOf(f.withId)}`
            return ancestor ? `${base}\n${t('tree.kinCommonAncestor')}: ${ancestor}` : base
          })
          if (lines.length) m.set(pid, [...new Set(lines)].join('\n'))
        }
        setKinshipNotes(m)
      })
      .catch(() => setKinshipNotes(new Map()))
  }, [people, families, t])

  const recenter = useCallback((id: string) => {
    setRootId(id)
    setRootFamilyId(undefined)
  }, [])

  // Manually choose the START (root) person AND persist it as the default, so
  // it survives reloads and is what "Reset to Root" returns to.
  const setStartPerson = useCallback(
    (id: string) => {
      setRootId(id)
      setRootFamilyId(undefined)
      setTreeRoot(id)
      void window.api.settings.setDefaultRoot(id)
      useAppStore.setState({ defaultRootId: id })
    },
    [setTreeRoot]
  )

  const resetToRoot = useCallback(() => {
    if (defaultRootId) {
      setRootId(defaultRootId)
      setRootFamilyId(undefined)
    }
  }, [defaultRootId])

  // Spouse switch — re-root on the chosen union (a different family tree).
  const switchUnion = useCallback((personId: string, familyId: string) => {
    setRootId(personId)
    setRootFamilyId(familyId)
  }, [])

  // Quick-add flows now open a name modal first (type a name, flesh out later).
  const addParent = useCallback((childId: string, sex: Sex) => setAddReq({ kind: 'parent', childId, sex }), [])
  const addChild = useCallback((familyId: string) => setAddReq({ kind: 'child', familyId }), [])
  const addSpouse = useCallback(
    (familyId: string, role: 'husband' | 'wife') => setAddReq({ kind: 'spouse', familyId, role }),
    []
  )

  const personById = (id?: string | null): (typeof people)[number] | undefined =>
    id ? people.find((p) => p.id === id) : undefined

  // Build the modal's initial draft + title from the pending request.
  const dialogProps = ((): { title: string; initial: PersonDraft; lockSex: boolean } | null => {
    if (!addReq) return null
    if (addReq.kind === 'parent') {
      const childSurname = personById(addReq.childId)?.surname ?? ''
      return {
        title: addReq.sex === 'M' ? t('tree.addFather') : t('tree.addMother'),
        // Fathers usually share the child's surname; mothers often don't.
        initial: { givenName: '', surname: addReq.sex === 'M' ? childSurname : '', sex: addReq.sex },
        lockSex: true
      }
    }
    if (addReq.kind === 'spouse') {
      return {
        title: addReq.role === 'husband' ? t('tree.addFather') : t('tree.addMother'),
        initial: { givenName: '', surname: '', sex: addReq.role === 'husband' ? 'M' : 'F' },
        lockSex: true
      }
    }
    const fam = families.find((f) => f.id === addReq.familyId)
    const fatherSurname = personById(fam?.husbandId)?.surname ?? personById(fam?.wifeId)?.surname ?? ''
    return {
      title: t('person.addChild'),
      initial: { givenName: '', surname: fatherSurname, sex: 'U' },
      lockSex: false
    }
  })()

  // Wire a person (new OR existing) into the pending request's family slot.
  const linkPersonToReq = async (req: AddReq, personId: string): Promise<void> => {
    if (req.kind === 'parent') {
      const fam = families.find((f) => f.childIds.includes(req.childId))
      const role = req.sex === 'F' ? { wifeId: personId } : { husbandId: personId }
      if (fam) await window.api.families.update(fam.id, role)
      else await window.api.families.create({ ...role, childIds: [req.childId] })
    } else if (req.kind === 'spouse') {
      const role = req.role === 'husband' ? { husbandId: personId } : { wifeId: personId }
      await window.api.families.update(req.familyId, role)
    } else {
      const fam = families.find((f) => f.id === req.familyId)
      if (fam && !fam.childIds.includes(personId))
        await window.api.families.update(fam.id, { childIds: [...fam.childIds, personId] })
    }
    await refreshAll()
    setAddReq(null)
    selectPerson(personId)
  }

  const submitAdd = async (draft: PersonDraft): Promise<void> => {
    if (!addReq) return
    const person = await window.api.people.create({
      givenName: draft.givenName,
      surname: draft.surname,
      sex: draft.sex
    })
    await linkPersonToReq(addReq, person.id)
  }

  // Attach an EXISTING person into the same slot instead of creating a new one.
  const attachExisting = async (personId: string): Promise<void> => {
    if (!addReq) return
    await linkPersonToReq(addReq, personId)
  }

  // People that must NOT appear in the picker for the current request (would make
  // an impossible link: self, the existing occupant of the slot, etc.).
  const addExcludeIds = useMemo((): Set<string> => {
    const ex = new Set<string>()
    if (!addReq) return ex
    if (addReq.kind === 'parent') {
      ex.add(addReq.childId)
      const fam = families.find((f) => f.childIds.includes(addReq.childId))
      if (fam?.husbandId) ex.add(fam.husbandId)
      if (fam?.wifeId) ex.add(fam.wifeId)
    } else if (addReq.kind === 'spouse') {
      const fam = families.find((f) => f.id === addReq.familyId)
      if (fam?.husbandId) ex.add(fam.husbandId)
      if (fam?.wifeId) ex.add(fam.wifeId)
    } else {
      const fam = families.find((f) => f.id === addReq.familyId)
      fam?.childIds.forEach((id) => ex.add(id))
      if (fam?.husbandId) ex.add(fam.husbandId)
      if (fam?.wifeId) ex.add(fam.wifeId)
    }
    return ex
  }, [addReq, families])

  // Highlight/colour FILTER (formerly the "custom" view): an overlay on top of the
  // pedigree (landscape/portrait), toggled on demand — not a separate view.
  const [filterOpen, setFilterOpen] = useState(false)
  const filterable = view === 'landscape' || view === 'portrait'
  const filterActive = filterOpen && filterable
  const [custom, setCustom] = useState<CustomConfig>(EMPTY_CUSTOM)
  const customActive = !!(
    custom.surname ||
    custom.given ||
    custom.place ||
    custom.from ||
    custom.to ||
    custom.sex ||
    custom.occupation
  )
  const highlightIds = useMemo(() => {
    if (!filterActive || !customActive) return undefined
    const snN = custom.surname.trim().toLowerCase()
    const gnN = custom.given.trim().toLowerCase()
    const placeN = custom.place.trim().toLowerCase()
    const occN = custom.occupation.trim().toLowerCase()
    const fromY = parseInt(custom.from, 10)
    const toY = parseInt(custom.to, 10)
    const yr = (d: string | null): number => {
      const m = d?.match(/\b(\d{3,4})\b/)
      return m ? Number(m[1]) : NaN
    }
    const set = new Set<string>()
    for (const p of people) {
      if (snN && !p.surname.toLowerCase().includes(snN)) continue
      if (gnN && !p.givenName.toLowerCase().includes(gnN)) continue
      if (placeN && !`${p.birthPlace ?? ''} ${p.deathPlace ?? ''}`.toLowerCase().includes(placeN)) continue
      if (occN && !(p.occupation ?? '').toLowerCase().includes(occN)) continue
      if (custom.sex && p.sex !== custom.sex) continue
      if (!Number.isNaN(fromY) || !Number.isNaN(toY)) {
        const by = yr(p.birthDate)
        if (Number.isNaN(by)) continue
        if (!Number.isNaN(fromY) && by < fromY) continue
        if (!Number.isNaN(toY) && by > toY) continue
      }
      set.add(p.id)
    }
    return set
  }, [filterActive, custom, customActive, people])

  // Card colour-coding (sex / century / surname / place) while the filter is on.
  const coloring = useMemo(
    () => buildColoring(people, filterActive ? custom.colorBy : 'none', t),
    [people, filterActive, custom.colorBy, t]
  )
  const cardColor = useMemo(() => {
    if (!filterActive || custom.colorBy === 'none') return undefined
    return (id: string): string | null => coloring.colorById.get(id) ?? null
  }, [filterActive, custom.colorBy, coloring])

  const root = treeData[0]
  const isEmpty =
    view === 'landscape' || view === 'portrait'
      ? !pedigree
      : view === 'fan' || view === 'descendants'
        ? !root
        : false

  const Controls = (
    <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
      <div className="glass-subtle flex items-center gap-1 rounded-xl p-1">
        {VIEWS.map(({ key, icon: Icon, labelKey }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            title={t(labelKey)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              view === key ? 'bg-primary/20 text-primary ring-1 ring-primary/20' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{t(labelKey)}</span>
          </button>
        ))}
      </div>

      {/* Filter (formerly the "custom" view): highlight/colour people on the
          pedigree without leaving the current layout. */}
      {filterable && (
        <button
          onClick={() => setFilterOpen((v) => !v)}
          title={t('tree.filter')}
          className={`glass-subtle flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors ${
            filterOpen
              ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
              : 'text-muted-foreground hover:text-primary'
          }`}
        >
          <Wand2 className="h-4 w-4" />
          <span className="hidden lg:inline">{t('tree.filter')}</span>
        </button>
      )}

      {view === 'fan' && (
        <div className="glass-subtle flex items-center gap-1 rounded-xl p-1">
          <button
            onClick={() => setGenerations((g) => Math.max(2, g - 1))}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[5.5rem] text-center text-xs text-muted-foreground">
            {generations} {t('tree.generations')}
          </span>
          <button
            onClick={() => setGenerations((g) => Math.min(13, g + 1))}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {view === 'fan' && <FanOptions />}

      <RootPicker rootId={rootId} onPick={setStartPerson} />

      {/* FamilySearch: read-only scan for remote changes across every linked
          person (deletes, new data, updated facts). Minimizable to background. */}
      {fsMode && (
        <button
          onClick={() => void startFsScan()}
          disabled={fsScanRunning}
          title={t('fsScan.title')}
          className="glass-subtle flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
        >
          <TreeDeciduous className="h-4 w-4" />
          <span className="hidden lg:inline">{t('fsScan.button')}</span>
        </button>
      )}

      {/* Export the printable tree (vector SVG / single or tiled PDF). */}
      <button
        onClick={() => setExportOpen(true)}
        title={t('export.title')}
        className="glass-subtle flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <Printer className="h-4 w-4" />
        <span className="hidden lg:inline">{t('export.action')}</span>
      </button>

    </div>
  )

  const CustomPanel = filterActive && (
    <CustomViewPanel
      config={custom}
      setConfig={setCustom}
      matchCount={highlightIds ? highlightIds.size : null}
      legend={coloring.legend}
    />
  )

  const Dialog = dialogProps && (
    <TreePersonDialog
      open={!!addReq}
      onOpenChange={(o) => !o && setAddReq(null)}
      title={dialogProps.title}
      initial={dialogProps.initial}
      lockSex={dialogProps.lockSex}
      onSubmit={submitAdd}
      onPickExisting={(id) => void attachExisting(id)}
      excludeIds={addExcludeIds}
    />
  )

  const ExportDialog = (
    <ExportTreeDialog
      open={exportOpen}
      onOpenChange={setExportOpen}
      view={view === 'fan' ? 'fan' : 'landscape'}
      rootId={rootId}
      rootFamilyId={rootFamilyId}
      fanGenerations={generations}
    />
  )

  if (isEmpty) {
    return (
      <div className="relative h-full w-full">
        {Controls}
        {Dialog}
        {ExportDialog}
        <div className="flex h-full items-center justify-center p-8">
          <p className="max-w-sm text-center text-sm text-muted-foreground">{t('tree.empty')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {Controls}
      {Dialog}
      {ExportDialog}
      {CustomPanel}
      {view === 'landscape' && pedigree && (
        <>
          <PedigreeChart
            root={pedigree}
            probandId={rootId}
            issueIds={issueIds}
            kinshipNotes={kinshipNotes}
            onSelectPerson={selectPerson}
            onRecenter={recenter}
            onAddParent={addParent}
            onAddChild={addChild}
            onAddSpouse={addSpouse}
            onSwitchUnion={switchUnion}
            highlightIds={highlightIds}
            cardColor={cardColor}
            refitSignal={refitNonce}
            layout={{
              colGap: ped.colGap,
              rowGap: ped.rowGap,
              accent: ped.accent,
              connectorWidth: ped.connectorWidth,
              connectorOpacity: ped.connectorOpacity,
              background: ped.background,
              contrast: ped.contrast,
              brightness: ped.brightness,
              saturation: ped.saturation,
              sepia: ped.sepia,
              cardBg: ped.cardBg,
              cardBorder: ped.cardBorder,
              cardBorderWidth: ped.cardBorderWidth,
              cardRadius: ped.cardRadius,
              cardShadow: ped.cardShadow
            }}
          />
          <PedigreeSettingsPanel />
        </>
      )}
      {view === 'portrait' && pedigree && (
        <>
          <PortraitChart
            root={pedigree}
            probandId={rootId}
            issueIds={issueIds}
            kinshipNotes={kinshipNotes}
            onSelectPerson={selectPerson}
            onRecenter={recenter}
            onAddParent={addParent}
            onAddChild={addChild}
            onAddSpouse={addSpouse}
            onSwitchUnion={switchUnion}
            fetchUnionCouple={(familyId) => window.api.tree.unionCouple(familyId)}
            fetchPersonDescendants={(personId, familyId) => window.api.tree.personDescendants(personId, familyId)}
            highlightIds={highlightIds}
            refitSignal={refitNonce}
            layout={{
              colGap: ped.colGap,
              rowGap: ped.rowGap,
              accent: ped.accent,
              connectorWidth: ped.connectorWidth,
              connectorOpacity: ped.connectorOpacity,
              background: ped.background,
              contrast: ped.contrast,
              brightness: ped.brightness,
              saturation: ped.saturation,
              sepia: ped.sepia,
              cardBg: ped.cardBg,
              cardBorder: ped.cardBorder,
              cardBorderWidth: ped.cardBorderWidth,
              cardRadius: ped.cardRadius,
              cardShadow: ped.cardShadow
            }}
          />
          <PedigreeSettingsPanel />
        </>
      )}
      {/* The fan renders on its own canvas with a built-in infinite camera —
          no PanZoom wrapper (CSS-transform zoom would rasterise it blurry). */}
      {view === 'fan' && root && (
        <FanChart
          data={root}
          generations={generations}
          sweep={ped.fanSweep}
          colorMode={ped.fanColorMode}
          showYears={ped.fanShowYears}
          accent={ped.accent}
          onSelect={selectPerson}
        />
      )}
      {view === 'descendants' && root && (
        <PanZoom>
          <DescendantTree data={root} onSelect={selectPerson} />
        </PanZoom>
      )}

      {/* Floating "Reset to Root" — re-centers on the FamilySearch default root. */}
      {defaultRootId && (
        <button
          onClick={resetToRoot}
          title={t('tree.resetToRoot')}
          className="glass glass-hover absolute bottom-5 right-5 z-10 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:text-primary"
        >
          <LocateFixed className="h-4 w-4 text-primary" />
          <span className="hidden md:inline">{t('tree.resetToRoot')}</span>
        </button>
      )}
      {fsMode && <FsScanDialog onOpenPerson={(pid) => window.dispatchEvent(new CustomEvent('fs-open-sync', { detail: { personId: pid } }))} />}
      {fsMode && <FsScanPill />}
      {fsSyncTarget && (
        <FsPersonSyncDialog
          open={fsSyncTarget !== null}
          onOpenChange={(v) => !v && setFsSyncTarget(null)}
          personId={fsSyncTarget.personId}
          fid={fsSyncTarget.fid}
          onApplied={async () => {
            useAppStore.getState().setFsChange(fsSyncTarget.personId, null)
            await useAppStore.getState().refreshAll()
            useAppStore.getState().bumpPersonSync()
          }}
        />
      )}
    </div>
  )
}
