import { create } from 'zustand'
import type { Alias, DocumentRecord, Family, GedcomImportResult, Person, ResearchLog } from '@shared/types'
import { isFamilySearchId } from '@/lib/familySearchSearch'

export type View =
  | 'board'
  | 'dashboard'
  | 'tree'
  | 'map'
  | 'people'
  | 'documents'
  | 'issues'
  | 'query'
  | 'kinship'
  | 'research'
  | 'audit'
  | 'calendar'
  | 'changelog'
  | 'profile'
  | 'settings'
  | 'plugin'
  | 'plugins'
  | 'pluginGuide'

/** A browser-style open tab. Views are singletons (one tab each); persons and
 *  documents can each have many. Title/icon are derived live from the store. */
export type TabKind = 'view' | 'person' | 'document'
export interface Tab {
  id: string // stable: "view:<view>" | "person:<id>" | "document:<id>"
  kind: TabKind
  view?: View // kind === 'view'
  ref?: string // person / document id
}
export type TabSpec = { kind: 'view'; view: View } | { kind: 'person' | 'document'; ref: string }
const tabIdOf = (spec: TabSpec): string =>
  spec.kind === 'view' ? `view:${spec.view}` : `${spec.kind}:${spec.ref}`

interface AppState {
  view: View
  /** Open person-profile tabs (browser-style), in display order. */
  tabs: Tab[]
  /** Active profile tab id, or null when the plain view (sidebar nav) is shown. */
  activeTabId: string | null
  people: Person[]
  /** O(1) person lookup by id — derived from `people`. */
  peopleById: Map<string, Person>
  families: Family[]
  documents: DocumentRecord[]
  /** All aliases (AKA / linguistic variants) — powers smart search. */
  aliases: Alias[]
  /** All research logs — surfaced on board person nodes. */
  researchLogs: ResearchLog[]
  /** Research logs grouped by person id — derived from `researchLogs`. */
  researchByPerson: Map<string, ResearchLog[]>
  /** Person ids that have at least one occupation row (occupations live in their
   *  own table, not the people.occupation column) — used by the quality scoring. */
  occupationPersonIds: Set<string>
  /** Bumped after a FamilySearch single-person sync so per-person panels that
   *  fetch their own lists (events, sources) re-load the merged facts. */
  personSyncNonce: number
  /** Bumped whenever a person's sources (documents OR citations) change, so the
   *  tree re-fetches its server-computed per-person source count live. */
  sourcesNonce: number
  selectedPersonId: string | null
  /** Person shown in the full-screen Profile view. */
  profilePersonId: string | undefined
  /** The view to return to when leaving the full-screen Profile. */
  profileBackView: View | undefined
  /** Root person for the Family Tree views (set from the profile panel). */
  treeRootId: string | undefined
  /** Bumped on every focusPersonTree call so the always-mounted tree re-roots
   *  even when the target equals the current root (a plain treeRootId re-set
   *  wouldn't re-trigger the sync). */
  treeFocusNonce: number
  /** The persisted default root person (set by FamilySearch import). */
  defaultRootId: string | undefined
  /** Pending endpoints for the Relationship finder (set by "How are we related?"). */
  kinshipFrom: string | undefined
  kinshipTo: string | undefined
  /** Person to centre + date-focus on the Map (set by the profile "Show on map" button). */
  mapFocusPersonId: string | undefined
  /** Bumped on each "Show on map" so the (always-checking) map re-applies focus. */
  mapFocusNonce: number
  /** End-of-GEDCOM-import summary — a dialog shows it until dismissed. */
  gedcomSummary: GedcomImportResult | null
  setGedcomSummary: (r: GedcomImportResult | null) => void
  /** Document to open in the viewer (set by the global search). */
  documentFocusId: string | undefined
  /** Bumped each time so the Documents view re-applies the focus. */
  documentFocusNonce: number
  loading: boolean

  setView: (view: View) => void
  /** The plugin menu entry shown while `view === 'plugin'`. */
  activePlugin: { pluginId: string; menuId: string } | null
  /** Open a plugin's sandboxed panel (sidebar plugin entries). */
  openPlugin: (pluginId: string, menuId: string) => void
  /** Bumped whenever plugins are (un)installed or toggled — sidebar refreshes. */
  pluginsNonce: number
  bumpPlugins: () => void
  /** The step-by-step plugin install wizard (opened from the sidebar flyout). */
  pluginInstallOpen: boolean
  setPluginInstallOpen: (open: boolean) => void
  /** Navigate to the Documents view and open this document in the viewer. */
  openDocument: (id: string) => void
  selectPerson: (id: string | null) => void
  /** Open the full-screen Profile view for a person (closes the side panel). */
  openProfile: (id: string) => void
  /** Leave the full-screen Profile, returning to the previous view. */
  closeProfile: () => void
  /** Open a tab (or focus it if already open). `background` keeps the current tab active. */
  openTab: (spec: TabSpec, opts?: { background?: boolean }) => void
  /** Make a tab the active (shown) one. */
  activateTab: (id: string) => void
  /** Close a tab; activates a neighbour, never leaves zero tabs. */
  closeTab: (id: string) => void
  /** Reorder a tab to a new index (drag). */
  moveTab: (id: string, toIndex: number) => void
  setTreeRoot: (id: string | undefined) => void
  /** Set (or clear) the persisted global starting person ("me"). */
  setDefaultRoot: (id: string | null) => Promise<void>
  /** Open the Family Tree focused on a given person. */
  focusPersonTree: (id: string) => void
  /** Open the Relationship finder from the default root to `toId`. */
  openKinship: (toId: string) => void
  /** Show a person on the Map: centre on their places + set the historical year. */
  openPersonOnMap: (id: string) => void

  refreshAll: () => Promise<void>
  refreshPeople: () => Promise<void>
  refreshFamilies: () => Promise<void>
  refreshDocuments: () => Promise<void>
  refreshOccupations: () => Promise<void>
  refreshAliases: () => Promise<void>
  refreshResearch: () => Promise<void>
  bumpPersonSync: () => void
  bumpSources: () => void
  /** FamilySearch background watcher: personId → pending remote change summary. */
  fsChanges: Record<string, { fields: number; relatives: number; content: number }>
  setFsChange: (personId: string, summary: { fields: number; relatives: number; content: number } | null) => void
  /** Read-only FamilySearch change scan (iterates every FS-linked person). */
  fsScan: {
    running: boolean
    total: number
    done: number
    results: {
      personId: string
      name: string
      status: 'changed' | 'deleted' | 'ok'
      fields: number
      relatives: number
      content: number
    }[]
  } | null
  fsScanMinimized: boolean
  startFsScan: () => Promise<void>
  cancelFsScan: () => void
  clearFsScan: () => void
  setFsScanMinimized: (v: boolean) => void
  /** Background FamilySearch import (minimizable — watch the tree grow live). */
  fsImport: { running: boolean; phase: string; name: string; count: number; people: number; families: number } | null
  startFsImport: (opts: { ascend: number; childrenDepth: number; treeId?: string; root?: string; maxPersons?: number; keepRoot?: boolean }) => Promise<void>
  clearFsImport: () => void
  fsImportExpanded: boolean
  setFsImportExpanded: (v: boolean) => void
}

// Exposed for e2e/debug probes (drive store state from Playwright).
if (typeof window !== 'undefined') {
  ;(window as unknown as { __appStore?: typeof useAppStore }).__appStore = undefined
}

function indexPeople(people: Person[]): Map<string, Person> {
  const m = new Map<string, Person>()
  for (const p of people) m.set(p.id, p)
  return m
}

function indexResearch(logs: ResearchLog[]): Map<string, ResearchLog[]> {
  const m = new Map<string, ResearchLog[]>()
  for (const l of logs) {
    if (!l.personId) continue
    const arr = m.get(l.personId)
    if (arr) arr.push(l)
    else m.set(l.personId, [l])
  }
  return m
}

// ---- Tabs (person profiles only — views are plain navigation, NOT tabs) ----

const TABS_KEY = 'tm.tabs'

function loadTabs(): { view: View; tabs: Tab[]; activeTabId: string | null } {
  try {
    const parsed = JSON.parse(localStorage.getItem(TABS_KEY) || 'null')
    if (parsed && typeof parsed === 'object') {
      const tabs = (Array.isArray(parsed.tabs) ? parsed.tabs : []).filter(
        (t: Tab) => t && t.kind === 'person' && typeof t.ref === 'string'
      ) as Tab[]
      const view: View = typeof parsed.view === 'string' && parsed.view !== 'profile' ? parsed.view : 'board'
      const activeTabId =
        typeof parsed.activeTabId === 'string' && tabs.some((t) => t.id === parsed.activeTabId)
          ? (parsed.activeTabId as string)
          : null
      return { view, tabs, activeTabId }
    }
  } catch {
    /* corrupt → default */
  }
  return { view: 'board', tabs: [], activeTabId: null }
}

function persistTabs(view: View, tabs: Tab[], activeTabId: string | null): void {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({ view, tabs, activeTabId }))
  } catch {
    /* private mode / quota — non-fatal */
  }
}

const INITIAL = loadTabs()
const INITIAL_ACTIVE = INITIAL.tabs.find((t) => t.id === INITIAL.activeTabId)

export const useAppStore = create<AppState>((set, get) => ({
  view: INITIAL.view,
  tabs: INITIAL.tabs,
  activeTabId: INITIAL.activeTabId,
  people: [],
  peopleById: new Map(),
  families: [],
  documents: [],
  aliases: [],
  researchLogs: [],
  researchByPerson: new Map(),
  occupationPersonIds: new Set(),
  personSyncNonce: 0,
  sourcesNonce: 0,
  selectedPersonId: null,
  profilePersonId: INITIAL_ACTIVE?.ref,
  profileBackView: undefined,
  treeRootId: undefined,
  treeFocusNonce: 0,
  defaultRootId: undefined,
  kinshipFrom: undefined,
  kinshipTo: undefined,
  mapFocusPersonId: undefined,
  mapFocusNonce: 0,
  gedcomSummary: null,
  setGedcomSummary: (r) => set({ gedcomSummary: r }),
  documentFocusId: undefined,
  documentFocusNonce: 0,
  loading: false,

  // Plain navigation: show the view (deactivating any open profile tab, which
  // stays open). Views are NOT tabs.
  setView: (view) =>
    set((s) => {
      persistTabs(view, s.tabs, null)
      return { view, activeTabId: null, profilePersonId: undefined }
    }),
  activePlugin: null,
  pluginsNonce: 0,
  bumpPlugins: () => set((s) => ({ pluginsNonce: s.pluginsNonce + 1 })),
  pluginInstallOpen: false,
  setPluginInstallOpen: (open) => set({ pluginInstallOpen: open }),
  openPlugin: (pluginId, menuId) =>
    set((s) => {
      persistTabs(s.view, s.tabs, null)
      return {
        view: 'plugin' as View,
        activePlugin: { pluginId, menuId },
        activeTabId: null,
        profilePersonId: undefined
      }
    }),
  openDocument: (id) =>
    set((s) => {
      persistTabs('documents', s.tabs, null)
      return {
        view: 'documents' as View,
        activeTabId: null,
        profilePersonId: undefined,
        documentFocusId: id,
        documentFocusNonce: s.documentFocusNonce + 1
      }
    }),
  selectPerson: (id) => set({ selectedPersonId: id }),
  // Opening a profile opens (or focuses) that person's tab and shows it.
  openProfile: (id) =>
    set((s) => {
      const tid = `person:${id}`
      const tabs = s.tabs.some((t) => t.id === tid)
        ? s.tabs
        : [...s.tabs, { id: tid, kind: 'person', ref: id } as Tab]
      persistTabs(s.view, tabs, tid)
      return { tabs, activeTabId: tid, profilePersonId: id, selectedPersonId: null }
    }),
  // "Back" from a profile === closing the current tab.
  closeProfile: () => {
    const id = get().activeTabId
    if (id) get().closeTab(id)
  },

  openTab: (spec, opts) =>
    set((s) => {
      if (spec.kind !== 'person') return {} // only people are tabbable
      const id = tabIdOf(spec)
      const tabs = s.tabs.some((t) => t.id === id)
        ? s.tabs
        : [...s.tabs, { id, kind: 'person', ref: spec.ref } as Tab]
      if (opts?.background) {
        persistTabs(s.view, tabs, s.activeTabId)
        return { tabs }
      }
      persistTabs(s.view, tabs, id)
      return { tabs, activeTabId: id, profilePersonId: spec.ref }
    }),
  activateTab: (id) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id)
      if (!tab) return {}
      persistTabs(s.view, s.tabs, id)
      return { activeTabId: id, profilePersonId: tab.ref }
    }),
  closeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx === -1) return {}
      const tabs = s.tabs.filter((t) => t.id !== id)
      // If the closed tab was active, fall onto its right neighbour, else the left
      // one, else back to the plain view (no tab active).
      let activeTabId = s.activeTabId
      if (id === s.activeTabId) activeTabId = (tabs[idx] ?? tabs[idx - 1])?.id ?? null
      const active = tabs.find((t) => t.id === activeTabId)
      persistTabs(s.view, tabs, activeTabId)
      return { tabs, activeTabId, profilePersonId: active?.ref }
    }),
  moveTab: (id, toIndex) =>
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === id)
      if (from === -1) return {}
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(from, 1)
      tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, moved)
      persistTabs(s.view, tabs, s.activeTabId)
      return { tabs }
    }),
  setTreeRoot: (treeRootId) => set({ treeRootId }),
  setDefaultRoot: async (id) => {
    await window.api.settings.setDefaultRoot(id)
    // The global starting person also becomes the tree's focus root, so every
    // view ("me"-relative kinship, the pedigree) lines up on the same person.
    set((s) => ({ defaultRootId: id ?? undefined, treeRootId: id ?? s.treeRootId }))
  },
  focusPersonTree: (id) =>
    set((s) => {
      persistTabs('tree', s.tabs, null)
      return {
        view: 'tree',
        activeTabId: null,
        profilePersonId: undefined,
        treeRootId: id,
        selectedPersonId: null,
        treeFocusNonce: s.treeFocusNonce + 1
      }
    }),
  openKinship: (toId) =>
    set((s) => {
      persistTabs('kinship', s.tabs, null)
      return {
        view: 'kinship',
        activeTabId: null,
        profilePersonId: undefined,
        selectedPersonId: null,
        // "Me" is the persisted default root, or whatever root the tree is focused
        // on; the finder still lets you change it if neither is set.
        kinshipFrom: s.defaultRootId ?? s.treeRootId,
        kinshipTo: toId
      }
    }),
  openPersonOnMap: (id) =>
    set((s) => {
      persistTabs('map', s.tabs, null)
      return {
        view: 'map',
        activeTabId: null,
        profilePersonId: undefined,
        selectedPersonId: null,
        mapFocusPersonId: id,
        mapFocusNonce: s.mapFocusNonce + 1
      }
    }),

  refreshAll: async () => {
    set({ loading: true })
    const [people, families, documents, aliases, researchLogs, occupations, defaultRoot] = await Promise.all([
      window.api.people.list(),
      window.api.families.list(),
      window.api.documents.list(),
      window.api.aliases.all().catch(() => []),
      window.api.research.allLogs().catch(() => []),
      window.api.occupations.all().catch(() => []),
      window.api.settings.getDefaultRoot().catch(() => null)
    ])
    // Strict root enforcement: keep the session's chosen root ONLY if that
    // person still exists (after a `replace` import the old id is gone — falling
    // back to the heuristic would otherwise pick the wrong person, e.g. a sibling).
    const defaultRootId = defaultRoot ?? undefined
    const byId = indexPeople(people)
    const cur = get().treeRootId
    const treeRootId = cur && byId.has(cur) ? cur : defaultRootId
    // Close profile tabs whose person was deleted (e.g. by a `replace` import).
    const prevTabs = get().tabs
    const liveTabs = prevTabs.filter((t) => t.ref != null && byId.has(t.ref))
    let tabPatch: Partial<AppState> = {}
    if (liveTabs.length !== prevTabs.length) {
      const curActive = get().activeTabId
      const activeTabId = liveTabs.some((t) => t.id === curActive) ? curActive : null
      persistTabs(get().view, liveTabs, activeTabId)
      tabPatch = {
        tabs: liveTabs,
        activeTabId,
        profilePersonId: liveTabs.find((t) => t.id === activeTabId)?.ref
      }
    }
    set({
      people,
      peopleById: byId,
      families,
      documents,
      aliases,
      researchLogs,
      researchByPerson: indexResearch(researchLogs),
      occupationPersonIds: new Set(occupations.map((o) => o.personId)),
      defaultRootId,
      treeRootId,
      loading: false,
      ...tabPatch
    })
  },
  refreshPeople: async () => {
    const people = await window.api.people.list()
    set({ people, peopleById: indexPeople(people) })
  },
  refreshFamilies: async () => set({ families: await window.api.families.list() }),
  refreshDocuments: async () => set({ documents: await window.api.documents.list() }),
  refreshOccupations: async () => {
    const occs = await window.api.occupations.all().catch(() => [])
    set({ occupationPersonIds: new Set(occs.map((o) => o.personId)) })
  },
  refreshAliases: async () => set({ aliases: await window.api.aliases.all() }),
  bumpPersonSync: () => set((s) => ({ personSyncNonce: s.personSyncNonce + 1 })),
  bumpSources: () => set((s) => ({ sourcesNonce: s.sourcesNonce + 1 })),
  fsChanges: {},
  setFsChange: (personId, summary) =>
    set((s) => {
      const next = { ...s.fsChanges }
      if (summary) next[personId] = summary
      else delete next[personId]
      return { fsChanges: next }
    }),
  fsScan: null,
  fsScanMinimized: false,
  setFsScanMinimized: (v) => set({ fsScanMinimized: v }),
  cancelFsScan: () =>
    set((s) => (s.fsScan ? { fsScan: { ...s.fsScan, running: false } } : {})),
  clearFsScan: () => set({ fsScan: null, fsScanMinimized: false }),
  fsImport: null,
  fsImportExpanded: false,
  setFsImportExpanded: (v) => set({ fsImportExpanded: v }),
  clearFsImport: () => set({ fsImport: null, fsImportExpanded: false }),
  startFsImport: async (opts) => {
    if (get().fsImport?.running) return
    set({ fsImport: { running: true, phase: 'auth', name: '', count: 0, people: 0, families: 0 }, fsImportExpanded: false })
    // Live status → store; the tree view reads it and refreshes as data lands.
    const off = window.api.familysearch.onStatus?.((st) => {
      set((s) =>
        s.fsImport
          ? { fsImport: { ...s.fsImport, phase: st.phase, name: st.name ?? s.fsImport.name, count: st.count ?? s.fsImport.count } }
          : {}
      )
    })
    // Periodically refresh so the tree literally grows while importing.
    const ticker = setInterval(() => {
      if (get().fsImport?.running) void get().refreshAll()
    }, 2500)
    try {
      const r = await window.api.familysearch.import(opts)
      const people = (r.peopleCreated ?? 0) + (r.peopleUpdated ?? 0)
      const families = (r.familiesCreated ?? 0) + (r.familiesUpdated ?? 0)
      set((s) => (s.fsImport ? { fsImport: { ...s.fsImport, running: false, phase: 'done', people, families } } : {}))
    } catch {
      set((s) => (s.fsImport ? { fsImport: { ...s.fsImport, running: false, phase: 'error' } } : {}))
    } finally {
      off?.()
      clearInterval(ticker)
      await get().refreshAll()
    }
  },
  startFsScan: async () => {
    const people = Array.from(get().peopleById.values()).filter((p) => isFamilySearchId(p.fsId))
    set({
      fsScan: { running: true, total: people.length, done: 0, results: [] },
      fsScanMinimized: false
    })
    const checkOne = async (p: Person): Promise<void> => {
      const name = `${p.givenName ?? ''} ${p.surname ?? ''}`.trim() || p.id
      let entry: {
        personId: string
        name: string
        status: 'changed' | 'deleted' | 'ok'
        fields: number
        relatives: number
        content: number
      } | null = null
      try {
        const r = await window.api.familysearch.syncPreview(p.id)
        if ('error' in r) {
          if (r.error === 'FS_NOT_FOUND') {
            entry = { personId: p.id, name, status: 'deleted', fields: 0, relatives: 0, content: 0 }
            get().setFsChange(p.id, { fields: 0, relatives: 0, content: 1 })
          }
        } else {
          const contentNew = Object.values(r.content).reduce((n, c) => n + Math.max(0, c.remote - c.local), 0)
          const total = r.fields.length + r.newRelatives.length + contentNew
          entry = {
            personId: p.id,
            name,
            status: total > 0 ? 'changed' : 'ok',
            fields: r.fields.length,
            relatives: r.newRelatives.length,
            content: contentNew
          }
          get().setFsChange(
            p.id,
            total > 0 ? { fields: r.fields.length, relatives: r.newRelatives.length, content: contentNew } : null
          )
        }
      } catch {
        /* skip this person on error */
      }
      set((s) => {
        if (!s.fsScan) return {}
        return {
          fsScan: {
            ...s.fsScan,
            done: s.fsScan.done + 1,
            results: entry ? [...s.fsScan.results, entry] : s.fsScan.results
          }
        }
      })
    }
    // Parallel worker pool — much faster than one-by-one.
    const CONCURRENCY = 6
    let next = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        const scan = get().fsScan
        if (!scan || !scan.running) return
        const i = next++
        if (i >= people.length) return
        await checkOne(people[i])
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, people.length) }, () => worker()))
    set((s) => (s.fsScan ? { fsScan: { ...s.fsScan, running: false } } : {}))
  },
  refreshResearch: async () => {
    const researchLogs = await window.api.research.allLogs()
    set({ researchLogs, researchByPerson: indexResearch(researchLogs) })
  }
}))

// e2e/debug handle (assigned after creation so the store object exists).
;(window as unknown as { __appStore?: typeof useAppStore }).__appStore = useAppStore
