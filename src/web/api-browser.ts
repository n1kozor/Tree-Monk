import type { TreeMonkApi } from '@shared/ipc'
import type { HistEvent } from '@shared/types'
import {
  Aliases,
  AppSettings,
  Board,
  Boards,
  Citations,
  Documents,
  Events,
  Families,
  Godparents,
  Notes,
  Occupations,
  People,
  ResearchLogs
} from '../main/db/repo'
import { buildTree } from '../main/db/tree'
import { buildPedigree } from '../main/db/pedigree'
import { buildMapMarkers } from '../main/db/mapData'
import { buildAtlasPoints } from '../main/db/atlasData'
import { runSanityCheck } from '../main/db/sanity'
import { findRelationshipPath } from '../main/db/relationship'
import { runPersonQuery, listSavedQueries } from '../main/db/query'
import { scanDuplicates } from '../main/db/duplicates'
import { givenNameVariants, surnameVariants } from '../main/db/nameNormalize'

const DEMO_VERSION = '0.19.3 · demo'

// The UI registers a handler so a blocked write surfaces a friendly toast.
let onBlocked: () => void = () => {}
export function setReadOnlyHandler(fn: () => void): void {
  onBlocked = fn
}
function blocked(): never {
  onBlocked()
  throw new Error('TreeMonk demo is read-only')
}
const unsubscribe = (): (() => void) => () => {}

// Historical events near a place + era, straight from Wikidata (CORS-enabled).
async function eventsNear(
  lat: number,
  lon: number,
  fromYear: number,
  toYear: number,
  lang = 'hu'
): Promise<HistEvent[]> {
  const langChain = lang.startsWith('en') ? 'en' : `${lang.slice(0, 2)},en`
  const query = `SELECT ?event ?eventLabel ?date ?coord WHERE {
    SERVICE wikibase:around { ?event wdt:P625 ?coord.
      bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral.
      bd:serviceParam wikibase:radius "150". }
    ?event wdt:P585 ?date.
    FILTER(YEAR(?date) >= ${fromYear} && YEAR(?date) <= ${toYear})
    SERVICE wikibase:label { bd:serviceParam wikibase:language "${langChain}". }
  } LIMIT 80`
  try {
    const res = await fetch(
      'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query),
      { headers: { Accept: 'application/sparql-results+json' } }
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      results?: { bindings?: Array<Record<string, { value?: string }>> }
    }
    const out: HistEvent[] = []
    const seen = new Set<string>()
    for (const b of data.results?.bindings ?? []) {
      const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value ?? '')
      if (!m) continue
      const id = (b.event?.value ?? '').split('/').pop() ?? ''
      const title = b.eventLabel?.value ?? ''
      if (!id || seen.has(id) || !title || /^Q\d+$/.test(title)) continue
      seen.add(id)
      const dateStr = b.date?.value ?? null
      const y = dateStr ? Number(dateStr.slice(0, dateStr.startsWith('-') ? 5 : 4)) : NaN
      out.push({
        id,
        title,
        date: dateStr,
        year: Number.isFinite(y) ? y : null,
        lon: Number(m[1]),
        lat: Number(m[2]),
        url: b.event?.value ?? ''
      })
    }
    out.sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
    return out
  } catch {
    return []
  }
}

const DEMO_WORKSPACE = {
  id: 'demo',
  name: 'Demo',
  file: 'demo.sqlite',
  color: '#10b981',
  createdAt: '2024-01-01T00:00:00.000Z'
}

/**
 * The read-only browser implementation of `window.api`. Reads run the real
 * repository/domain layer over the in-memory sample DB; every mutation, file or
 * network/import operation is a friendly no-op so the demo can't change anything.
 */
export function createDemoApi(): TreeMonkApi {
  return {
    people: {
      list: async () => People.list(),
      get: async (id) => People.get(id),
      create: async () => blocked(),
      update: async () => blocked(),
      remove: async () => blocked(),
      restore: async () => blocked(),
      setAvatar: async () => blocked()
    },
    families: {
      list: async () => Families.list(),
      create: async () => blocked(),
      update: async () => blocked(),
      remove: async () => blocked()
    },
    documents: {
      list: async () => Documents.list(),
      listForPerson: async (pid) => Documents.listForPerson(pid),
      import: async () => blocked(),
      importPaths: async () => blocked(),
      importDataUrl: async () => blocked(),
      createLink: async () => blocked(),
      update: async () => blocked(),
      remove: async () => blocked(),
      restore: async () => blocked(),
      attach: async () => blocked(),
      detach: async () => blocked(),
      dataUrl: async () => null,
      open: async () => {}
    },
    board: {
      get: async (boardId) => Board.get(boardId),
      saveNode: async () => blocked(),
      saveNodes: async () => blocked(),
      removeNode: async () => blocked(),
      saveEdge: async () => blocked(),
      removeEdge: async () => blocked()
    },
    boards: {
      list: async () => Boards.list(),
      create: async () => blocked(),
      rename: async () => blocked(),
      remove: async () => blocked(),
      duplicate: async () => blocked()
    },
    research: {
      citationsForPerson: async (pid) => Citations.forOwner('person', pid),
      notesForPerson: async (pid) => Notes.forOwner('person', pid),
      logsForPerson: async (pid) => ResearchLogs.forPerson(pid),
      allLogs: async () => ResearchLogs.all(),
      createLog: async () => blocked(),
      removeLog: async () => blocked()
    },
    aliases: {
      listForPerson: async (pid) => Aliases.forPerson(pid),
      all: async () => Aliases.all(),
      create: async () => blocked(),
      remove: async () => blocked()
    },
    occupations: {
      listForPerson: async (pid) => Occupations.forPerson(pid),
      all: async () => Occupations.all(),
      create: async () => blocked(),
      update: async () => blocked(),
      remove: async () => blocked(),
      reorder: async () => blocked()
    },
    godparents: {
      listForPerson: async (pid) => Godparents.forPerson(pid),
      godchildren: async (pid) => Godparents.godchildrenOf(pid),
      add: async () => blocked(),
      remove: async () => blocked()
    },
    events: {
      forPerson: async (pid) => Events.forPerson(pid),
      create: async () => blocked(),
      update: async () => blocked(),
      remove: async () => blocked(),
      reorder: async () => blocked()
    },
    tree: {
      build: async (rootId, mode) => buildTree(rootId, mode),
      pedigree: async (rootId, rootFamilyId) => buildPedigree(rootId, rootFamilyId),
      exportImage: async () => blocked()
    },
    map: {
      markers: async () => buildMapMarkers()
    },
    atlas: {
      points: async () => buildAtlasPoints()
    },
    apiServer: {
      getConfig: async () => ({ enabled: false, port: 27007, token: '', allowWrites: false, mcpEnabled: false }),
      setConfig: async () => blocked(),
      regenerateToken: async () => blocked(),
      status: async () => ({ running: false, port: 27007, error: null }),
      onExternalChange: () => () => {}
    },
    plugins: {
      list: async () => [],
      install: async () => blocked(),
      remove: async () => blocked(),
      setEnabled: async () => blocked(),
      panel: async () => null
    },
    wiki: {
      eventsNear: async (lat, lon, fromYear, toYear, lang) =>
        eventsNear(lat, lon, fromYear, toYear, lang)
    },
    media: {
      downloadRemote: async () => ({ done: 0, total: 0, ok: 0, failed: 0 }),
      onDownloadProgress: unsubscribe
    },
    sanity: {
      check: async () => runSanityCheck(),
      dismiss: async () => blocked()
    },
    relationship: {
      find: async (fromId, toId) => findRelationshipPath(fromId, toId)
    },
    query: {
      run: async (q) => runPersonQuery(q),
      listSaved: async () => listSavedQueries(),
      // The demo is read-only — saving/removing surfaces the friendly toast.
      save: async () => blocked(),
      remove: async () => blocked()
    },
    backup: {
      create: async () => blocked(),
      restore: async () => blocked()
    },
    gedcom: {
      import: async () => blocked(),
      importContent: async () => blocked(),
      export: async () => blocked()
    },
    data: {
      exportJson: async () => blocked(),
      exportDatabase: async () => blocked()
    },
    familysearch: {
      // FamilySearch is disabled in the demo — report "not configured" so the
      // whole integration stays dormant (no sign-in, no sync UI).
      configured: async () => false,
      login: async () => ({ ok: false, error: 'DEMO' }),
      signedIn: async () => false,
      signOut: async () => {},
      import: async () => blocked(),
      search: async () => blocked(),
      preview: async () => blocked(),
      syncPerson: async () => ({ needCreds: true as const }),
      syncPreview: async () => ({ error: 'DEMO' }),
      listTrees: async () => [{ id: 'GLOBAL', name: 'Family Tree', kind: 'global' as const }],
      lookupPerson: async () => ({ found: false }),
      normalizeDate: async () => null,
      getSettings: async () => null,
      onStatus: unsubscribe,
      onNode: unsubscribe,
      onRootSet: unsubscribe,
      cancel: async () => {},
      pending: async () => false
    },
    db: {
      wipe: async () => blocked(),
      cleanup: async () => blocked(),
      removeEmpty: async () => blocked()
    },
    settings: {
      getDefaultRoot: async () => AppSettings.get('default_root_person_id'),
      setDefaultRoot: async () => blocked()
    },
    geo: {
      search: async () => [],
      savePlace: async () => blocked(),
      geocodeAll: async () => blocked(),
      onGeocodeProgress: unsubscribe,
      standardizeAll: async () => blocked(),
      onStandardizeProgress: unsubscribe
    },
    app: {
      openExternal: async (url) => {
        window.open(url, '_blank', 'noopener')
      },
      openManual: async () => false,
      setLanguage: async () => {}
    },
    updates: {
      version: async () => DEMO_VERSION,
      check: async () => ({
        current: DEMO_VERSION,
        latest: null,
        hasUpdate: false,
        notes: null,
        url: null,
        publishedAt: null,
        assetUrl: null
      }),
      download: async () => {}
    },
    workspaces: {
      list: async () => [DEMO_WORKSPACE],
      active: async () => DEMO_WORKSPACE,
      create: async () => blocked(),
      switch: async () => blocked(),
      rename: async () => blocked(),
      remove: async () => blocked()
    },
    audit: {
      query: async () => ({ entries: [], total: 0, hasMore: false }),
      impact: async () => blocked(),
      revert: async () => blocked()
    },
    dashboard: {
      exportPdf: async () => blocked()
    },
    duplicates: {
      scan: async () => scanDuplicates(),
      merge: async () => blocked(),
      dismiss: async () => blocked()
    },
    names: {
      surnameVariants: async () => surnameVariants(),
      givenNameVariants: async () => givenNameVariants(),
      normalizeSurname: async () => blocked()
    },
    supportInvite: {
      status: async () => true,
      markSeen: async () => {}
    },
    support: {
      history: async () => [],
      save: async () => {},
      clear: async () => {}
    }
  }
}
