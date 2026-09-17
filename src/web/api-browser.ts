import type { TreeMonkApi } from '@shared/ipc'
import type { HistEvent } from '@shared/types'
import {
  Aliases,
  AppSettings,
  Attributes,
  Board,
  Boards,
  Citations,
  Collaborations,
  DismissedIssues,
  Documents,
  EventParticipants,
  Events,
  Families,
  Godparents,
  Notes,
  Occupations,
  People,
  PhotoRegions,
  Places,
  ResearchLogs,
  Sources,
  Todos,
  Witnesses,
  FactParticipants
} from '../main/db/repo'
import { buildTree } from '../main/db/tree'
import { buildPedigree, buildPersonDescendants, buildUnionCouple } from '../main/db/pedigree'
import { detectKinship } from '../main/db/kinship'
import { buildMapMarkers } from '../main/db/mapData'
import { buildAtlasPoints } from '../main/db/atlasData'
import { hiddenIssues, runSanityCheck } from '../main/db/sanity'
import { findRelationshipPath } from '../main/db/relationship'
import { runPersonQuery, listSavedQueries } from '../main/db/query'
import { dismissMerge, mergePeople, scanDuplicates } from '../main/db/duplicates'
import {
  givenNameVariants,
  normalizeGivenName,
  normalizeSurname,
  surnameVariants
} from '../main/db/nameNormalize'
import { removeSavedQuery, saveQuery } from '../main/db/query'
import { removeEmptyPeople, removeNamelessStubs } from '../main/db/admin'
import { importGedcomText } from '../main/gedcom/import'
import { exportGedcom } from '../main/gedcom/export'
import { exportIndexes, exportSite } from '../main/siteExport'
import { importCsvText } from '../main/csvImport'
import { takeLastWrittenFile } from './fs-shim'
import { exportDbBytes, persistNow, replaceLocalDb } from './connection'
import { wipeAllStorage } from './storage'
import {
  createLinkDocumentWeb,
  documentDataUrlWeb,
  downloadFile,
  importDataUrlWeb,
  openDocumentWeb,
  pickAndImportFiles,
  pickBinaryFile,
  pickTextFile,
  rebuildMediaRegistry,
  setPersonAvatarWeb
} from './media-web'

const DEMO_VERSION = '0.19.3 · demo'
const WEB_VERSION = '1.8.16 · web'

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
      remove: async () => blocked(),
      setChildRelation: async () => blocked()
    },
    eventParticipants: {
      forEvent: async (eid) => EventParticipants.forEvent(eid),
      set: async () => blocked(),
      remove: async () => blocked(),
      forPerson: async (pid) => EventParticipants.forPerson(pid)
    },
    witnesses: {
      forOwner: async (ot, oid) => Witnesses.forOwner(ot, oid),
      add: async () => blocked(),
      remove: async () => blocked()
    },
    factParticipants: {
      forFact: async (pid, tag) => FactParticipants.forFact(pid, tag),
      add: async () => blocked(),
      remove: async () => blocked()
    },
    attributes: {
      forPerson: async (pid) => Attributes.forPerson(pid),
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
      tagsForPerson: async (pid) => Documents.eventTagsForPerson(pid),
      dataUrl: async () => null,
      open: async () => {}
    },
    regions: {
      // The demo carries no tags; reads are empty and writes are blocked.
      forDocument: async () => [],
      forPerson: async () => [],
      create: async () => blocked(),
      update: async () => blocked(),
      remove: async () => blocked()
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
      listSources: async () => Sources.list(),
      addCitation: async () => blocked(),
      attachSourceToPerson: async () => blocked(),
      peopleForSource: async (sourceId) => Citations.peopleForSource(sourceId),
      detachSourceFromPerson: async () => blocked(),
      updateCitation: async () => blocked(),
      deleteCitation: async () => blocked(),
      notesForPerson: async (pid) => Notes.forOwner('person', pid),
      logsForPerson: async (pid) => ResearchLogs.forPerson(pid),
      allLogs: async () => ResearchLogs.all(),
      createLog: async () => blocked(),
      updateLog: async () => blocked(),
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
    todos: {
      all: async () => Todos.all(),
      forPerson: async (pid) => Todos.forPerson(pid),
      create: async () => blocked(),
      update: async () => blocked(),
      remove: async () => blocked()
    },
    collaborations: {
      listForPerson: async (pid) => Collaborations.forPerson(pid)
    },
    site: {
      export: async () => blocked(),
      exportIndexes: async () => blocked()
    },
    csv: {
      import: async () => blocked()
    },
    events: {
      forPerson: async (pid) => Events.forPerson(pid),
      forFamily: async (fid) => Events.forOwner('family', fid),
      create: async () => blocked(),
      createForFamily: async () => blocked(),
      update: async () => blocked(),
      remove: async () => blocked(),
      reorder: async () => blocked()
    },
    tree: {
      build: async (rootId, mode) => buildTree(rootId, mode),
      pedigree: async (rootId, rootFamilyId) => buildPedigree(rootId, rootFamilyId),
      unionCouple: async (familyId) => buildUnionCouple(familyId),
      personDescendants: async (personId, familyId) => buildPersonDescendants(personId, familyId),
      kinship: async () => detectKinship(),
      exportImage: async () => blocked()
    },
    map: {
      markers: async () => buildMapMarkers()
    },
    atlas: {
      points: async () => buildAtlasPoints()
    },
    apiServer: {
      getConfig: async () => ({ enabled: false, port: 27007, token: '', allowWrites: false }),
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
      dismiss: async () => blocked(),
      hidden: async () => hiddenIssues(),
      restore: async () => blocked()
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
      throttleProbe: async () => ({
        ok: false,
        status: 0,
        attempts: 0,
        waitedMs: 0,
        retryAfterMs: null,
        pace: { concurrency: 0, spacingMs: 0, processingMsLastMinute: 0, requestsLastMinute: 0 }
      }),
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
      listPlaces: async () =>
        Places.list().map((p) => ({
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          placeType: p.place_type ?? null,
          parentName: p.parent_name ?? null,
          govId: p.gov_id ?? null,
          canonical: p.canonical ?? null
        })),
      setPlaceMeta: async () => blocked(),
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
      setLanguage: async () => {},
      // Browsers never expose local paths — drop handlers get nothing, as before.
      pathForFile: () => ''
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
      download: async () => {},
      history: async () => [] // the demo has no update history
    },
    workspaces: {
      list: async () => [DEMO_WORKSPACE],
      active: async () => DEMO_WORKSPACE,
      freshBootstrap: async () => false,
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
      normalizeSurname: async () => blocked(),
      normalizeGivenName: async () => blocked(),
      dismissGroup: async () => blocked()
    },
    supportInvite: {
      status: async () => true,
      markSeen: async () => {}
    },
    fsAnnounce: {
      status: async () => true,
      markSeen: async () => {}
    }
  }
}

const LOCAL_WORKSPACE = {
  id: 'local',
  name: 'TreeMonk Web',
  file: 'treemonk.sqlite',
  color: '#0f766e',
  createdAt: '2024-01-01T00:00:00.000Z'
}

const stamp = (): string => new Date().toISOString().slice(0, 10).replace(/-/g, '')

/**
 * The WRITABLE browser implementation of `window.api` for the local web app
 * (treemonk.eu/demo → helyi, böngészőben tárolt fa). Built on the demo API:
 * every read stays as-is; mutations run the real repository layer on the
 * persistent WASM SQLite (see connection.ts — saved to OPFS/IndexedDB after
 * every change). Desktop-only integrations (FamilySearch, plugins, tree-image
 * and PDF export) remain friendly no-ops via the `blocked` toast.
 */
export function createLocalApi(): TreeMonkApi {
  const base = createDemoApi()
  return {
    ...base,
    people: {
      ...base.people,
      create: async (input) => People.create(input),
      update: async (id, input) => People.update(id, input),
      remove: async (id) => People.remove(id),
      restore: async (snap) => People.restore(snap),
      setAvatar: async (id) => setPersonAvatarWeb(id)
    },
    families: {
      ...base.families,
      create: async (input) => Families.create(input),
      update: async (id, input) => Families.update(id, input),
      remove: async (id) => Families.remove(id),
      setChildRelation: async (fid, cid, side, rel) => Families.setChildRelation(fid, cid, side, rel)
    },
    eventParticipants: {
      ...base.eventParticipants,
      set: async (eid, pid, role) => EventParticipants.set(eid, pid, role),
      remove: async (eid, pid) => EventParticipants.remove(eid, pid)
    },
    witnesses: {
      ...base.witnesses,
      add: async (ot, oid, wid) => Witnesses.add(ot, oid, wid),
      remove: async (ot, oid, wid) => Witnesses.remove(ot, oid, wid)
    },
    factParticipants: {
      ...base.factParticipants,
      add: async (pid, tag, part, role) => FactParticipants.add(pid, tag, part, role),
      remove: async (pid, tag, part) => FactParticipants.remove(pid, tag, part)
    },
    attributes: {
      ...base.attributes,
      create: async (pid, input) => Attributes.create(pid, input),
      update: async (id, input) => Attributes.update(id, input),
      remove: async (id) => Attributes.remove(id)
    },
    documents: {
      ...base.documents,
      import: async (personId) => pickAndImportFiles(personId),
      importPaths: async () => [], // OS paths do not exist in the browser
      importDataUrl: async (dataUrl, personId) => importDataUrlWeb(dataUrl, personId),
      createLink: async (url, title, personId) => createLinkDocumentWeb(url, title, personId),
      update: async (id, input) => Documents.update(id, input),
      remove: async (id) => Documents.remove(id),
      restore: async (snap) => Documents.restore(snap),
      attach: async (docId, pid, eventTag) => Documents.attach(docId, pid, eventTag),
      detach: async (docId, pid) => Documents.detach(docId, pid),
      dataUrl: async (id) => documentDataUrlWeb(id),
      open: async (id) => openDocumentWeb(id)
    },
    regions: {
      forDocument: async (docId) => PhotoRegions.forDocument(docId),
      forPerson: async (pid) => PhotoRegions.forPerson(pid),
      create: async (input) => PhotoRegions.create(input),
      update: async (id, patch) => PhotoRegions.update(id, patch),
      remove: async (id) => PhotoRegions.remove(id)
    },
    board: {
      ...base.board,
      saveNode: async (node) => Board.saveNode(node),
      saveNodes: async (nodes) => Board.saveNodes(nodes),
      removeNode: async (id) => Board.removeNode(id),
      saveEdge: async (edge) => Board.saveEdge(edge),
      removeEdge: async (id) => Board.removeEdge(id)
    },
    boards: {
      ...base.boards,
      create: async (name) => Boards.create(name),
      rename: async (id, name) => Boards.rename(id, name),
      remove: async (id) => Boards.remove(id),
      duplicate: async (id, name) => Boards.duplicate(id, name)
    },
    research: {
      ...base.research,
      addCitation: async (personId, edit) => {
        const s = Sources.upsert({
          gedcomId: null,
          title: edit.sourceTitle ?? '',
          author: edit.sourceAuthor ?? null,
          publication: edit.sourcePublication ?? null,
          repositoryId: null,
          text: edit.sourceText ?? null,
          recordDate: edit.recordDate ?? null
        })
        return Citations.create({
          sourceId: s.id,
          ownerType: 'person',
          ownerId: personId,
          eventTag: edit.eventTag ?? null,
          page: edit.page ?? null,
          quality: edit.quality ?? null,
          note: edit.note ?? null
        })
      },
      attachSourceToPerson: async (sourceId, personId, eventTag) =>
        Citations.attachSource(sourceId, personId, eventTag),
      detachSourceFromPerson: async (sourceId, personId) => Citations.detachSource(sourceId, personId),
      updateCitation: async (id, edit) => {
        const hasSrc =
          edit.sourceTitle !== undefined ||
          edit.sourceAuthor !== undefined ||
          edit.sourcePublication !== undefined ||
          edit.sourceText !== undefined ||
          edit.recordDate !== undefined
        let sid = Citations.sourceIdOf(id)
        if (hasSrc && sid) {
          Sources.update(sid, {
            title: edit.sourceTitle,
            author: edit.sourceAuthor,
            publication: edit.sourcePublication,
            text: edit.sourceText,
            recordDate: edit.recordDate
          })
        } else if (hasSrc && !sid) {
          sid = Sources.upsert({
            gedcomId: null,
            title: edit.sourceTitle ?? '',
            author: edit.sourceAuthor ?? null,
            publication: edit.sourcePublication ?? null,
            repositoryId: null,
            text: edit.sourceText ?? null,
            recordDate: edit.recordDate ?? null
          }).id
        }
        Citations.update(id, {
          sourceId: sid ?? undefined,
          eventTag: edit.eventTag,
          page: edit.page,
          quality: edit.quality,
          note: edit.note
        })
      },
      deleteCitation: async (id) => Citations.remove(id),
      createLog: async (input) => ResearchLogs.create(input),
      updateLog: async (id, input) => ResearchLogs.update(id, input),
      removeLog: async (id) => ResearchLogs.remove(id)
    },
    aliases: {
      ...base.aliases,
      create: async (pid, input) => Aliases.create(pid, input),
      remove: async (id) => Aliases.remove(id)
    },
    occupations: {
      ...base.occupations,
      create: async (pid, input) => Occupations.create(pid, input),
      update: async (id, input) => Occupations.update(id, input),
      remove: async (id) => Occupations.remove(id),
      reorder: async (ids) => Occupations.reorder(ids)
    },
    godparents: {
      ...base.godparents,
      add: async (pid, gid) => Godparents.add(pid, gid),
      remove: async (pid, gid) => Godparents.remove(pid, gid)
    },
    todos: {
      ...base.todos,
      create: async (input) => Todos.create(input),
      update: async (id, input) => Todos.update(id, input),
      remove: async (id) => Todos.remove(id)
    },
    events: {
      ...base.events,
      create: async (pid, input) => Events.create('person', pid, input),
      createForFamily: async (fid, input) => Events.create('family', fid, input),
      update: async (id, input) => Events.update(id, input),
      remove: async (id) => Events.remove(id),
      reorder: async (ids) => Events.reorder(ids)
    },
    sanity: {
      ...base.sanity,
      dismiss: async (key) => DismissedIssues.add(key)
    },
    query: {
      ...base.query,
      save: async (name, query) => saveQuery(name, query),
      remove: async (id) => removeSavedQuery(id)
    },
    backup: {
      create: async () => {
        const name = `treemonk-backup-${stamp()}.sqlite`
        downloadFile(name, exportDbBytes(), 'application/x-sqlite3')
        return { path: name }
      },
      restore: async () => {
        const bytes = await pickBinaryFile('.sqlite,.db,.sqlite3')
        if (!bytes) return false
        await replaceLocalDb(bytes)
        location.reload()
        return true
      }
    },
    gedcom: {
      import: async () => {
        const text = await pickTextFile('.ged,.gedcom')
        if (text === null) return null
        const res = importGedcomText(text)
        await persistNow()
        await rebuildMediaRegistry()
        return res
      },
      importContent: async (text) => {
        const res = importGedcomText(text)
        await persistNow()
        await rebuildMediaRegistry()
        return res
      },
      export: async (personIds, defaultName, opts) => {
        const base_ = (defaultName ?? '').replace(/[\\/]+/g, '').replace(/\.ged$/i, '').trim() || 'treemonk-export'
        const { text, mediaCount } = exportGedcom(`${base_}.ged`, personIds, opts)
        takeLastWrittenFile()
        downloadFile(`${base_}.ged`, text, 'text/plain;charset=utf-8')
        return { path: `${base_}.ged`, mediaCount }
      }
    },
    csv: {
      import: async () => {
        const text = await pickTextFile('.csv,.txt,.tsv')
        if (text === null) return null
        const res = importCsvText(text)
        await persistNow()
        return res
      }
    },
    site: {
      export: async (lang) => {
        exportSite('treemonk-site.html', lang)
        const w = takeLastWrittenFile()
        if (!w) return null
        downloadFile('treemonk-site.html', w.data, 'text/html;charset=utf-8')
        return { path: 'treemonk-site.html' }
      },
      exportIndexes: async (lang) => {
        exportIndexes('treemonk-indexes.html', lang)
        const w = takeLastWrittenFile()
        if (!w) return null
        downloadFile('treemonk-indexes.html', w.data, 'text/html;charset=utf-8')
        return { path: 'treemonk-indexes.html' }
      }
    },
    data: {
      ...base.data,
      exportDatabase: async () => {
        const name = `treemonk-${stamp()}.sqlite`
        downloadFile(name, exportDbBytes(), 'application/x-sqlite3')
        return { path: name }
      }
    },
    db: {
      wipe: async () => {
        await wipeAllStorage()
        location.reload()
      },
      cleanup: async () => {
        const removed = removeNamelessStubs()
        AppSettings.set('fs_import_pending', null)
        await persistNow()
        return removed
      },
      removeEmpty: async () => {
        const removed = removeEmptyPeople()
        AppSettings.set('fs_import_pending', null)
        await persistNow()
        return removed
      }
    },
    settings: {
      ...base.settings,
      setDefaultRoot: async (id) => AppSettings.set('default_root_person_id', id)
    },
    app: {
      ...base.app,
      setLanguage: async (lang) => AppSettings.set('app_language', lang)
    },
    duplicates: {
      ...base.duplicates,
      merge: async (survivorId, victimId, resolution) => mergePeople(survivorId, victimId, resolution),
      dismiss: async (aId, bId) => dismissMerge(aId, bId)
    },
    names: {
      ...base.names,
      normalizeSurname: async (variants, canonical) => normalizeSurname(variants, canonical),
      normalizeGivenName: async (variants, canonical) => normalizeGivenName(variants, canonical)
    },
    updates: {
      ...base.updates,
      version: async () => WEB_VERSION,
      check: async () => ({
        current: WEB_VERSION,
        latest: null,
        hasUpdate: false,
        notes: null,
        url: null,
        publishedAt: null,
        assetUrl: null
      })
    },
    workspaces: {
      ...base.workspaces,
      list: async () => [LOCAL_WORKSPACE],
      active: async () => LOCAL_WORKSPACE
    }
  }
}
