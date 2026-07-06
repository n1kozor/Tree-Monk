import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { Channels } from '@shared/ipc'
import {
  Aliases,
  AppSettings,
  Board,
  Boards,
  Citations,
  DismissedIssues,
  Documents,
  Families,
  Godparents,
  Notes,
  Events,
  Occupations,
  Collaborations,
  People,
  ResearchLogs,
  Sources
} from './db/repo'
import { buildTree } from './db/tree'
import { buildPedigree, buildPersonDescendants, buildUnionCouple } from './db/pedigree'
import { detectKinship } from './db/kinship'
import { exportTreeImage, exportHtmlPdf } from './treeExport'
import { buildMapMarkers } from './db/mapData'
import { buildAtlasPoints } from './db/atlasData'
import { eventsNear as wikiEventsNear } from './wiki'
import { runSanityCheck } from './db/sanity'
import { findRelationshipPath } from './db/relationship'
import { runPersonQuery, listSavedQueries, saveQuery, removeSavedQuery } from './db/query'
import { createBackup, restoreBackup } from './backup'
import {
  cancelFamilySearchImport,
  familySearchSyncPreview,
  fillEmptyFsPersons,
  listFamilySearchTrees,
  lookupFsPerson,
  normalizeDateViaFamilySearch,
  syncPersonRelatives,
  forgetCreds,
  importFromFamilySearch,
  isFamilySearchConfigured,
  isSignedIn,
  loginFamilySearchOAuth,
  previewFamilySearch,
  searchFamilySearch,
  syncPersonFromFamilySearch
} from './familysearch'
import {
  FsIngester,
  applyFsAliases,
  applyFsEvents,
  applyFsMedia,
  applyFsNotes,
  applyFsOccupations,
  applyFsSources,
  applyFsGodparents
} from './db/fsIngest'
import { removeEmptyPeople, removeNamelessStubs, wipeDatabase } from './db/admin'
import { closeDb } from './db/connection'
import { Audit } from './db/audit'
import { scanDuplicates, mergePeople, dismissMerge } from './db/duplicates'
import {
  surnameVariants,
  normalizeSurname,
  givenNameVariants,
  normalizeGivenName
} from './db/nameNormalize'
import { exportJson, exportDatabase } from './dataExport'
import {
  activeWorkspace,
  createWorkspace,
  listWorkspaces,
  removeWorkspace,
  renameWorkspace,
  setActiveWorkspace
} from './workspaces'
import { geoSearch, geocodePlaces, savePlace, standardizePlaces } from './geo'
import { checkForUpdates, currentVersion, listReleases, openUpdateDownload } from './updates'
import type { FamilySearchImportOptions } from '@shared/types'
import {
  createLinkDocument,
  documentDataUrl,
  downloadRemoteMedia,
  importDocumentPaths,
  importDocuments,
  importImageDataUrl,
  openDocument,
  setPersonAvatar
} from './media'
import { importGedcomFile, importGedcomText } from './gedcom/import'
import { exportGedcom } from './gedcom/export'
import type {
  AuditFilter,
  BoardEdge,
  BoardNode,
  CitationEdit,
  DocumentInput,
  FamilyInput,
  MergeResolution,
  PersonInput,
  TreeExportPayload
} from '@shared/types'

// A single reused window for the user manual — re-clicking just focuses it.
let manualWindow: BrowserWindow | null = null

/** Registers every IPC handler. Call once after app is ready. */
/** Sends an IPC event to a renderer, but never throws if its webContents was
 *  destroyed mid-operation — e.g. the window closed, or (common in dev) an HMR
 *  reload happened during a long background job like the media download. */
function safeSend(sender: WebContents, channel: string, payload: unknown): void {
  try {
    if (!sender.isDestroyed()) sender.send(channel, payload)
  } catch {
    /* renderer is gone — drop the event */
  }
}

export function registerIpc(): void {
  // People
  ipcMain.handle(Channels.people.list, () => People.list())
  ipcMain.handle(Channels.people.get, (_e, id: string) => People.get(id))
  ipcMain.handle(Channels.people.create, (_e, input: PersonInput) => People.create(input))
  ipcMain.handle(Channels.people.update, (_e, id: string, input: PersonInput) =>
    People.update(id, input)
  )
  ipcMain.handle(Channels.people.remove, (_e, id: string) => People.remove(id))
  ipcMain.handle(Channels.people.restore, (_e, snap) => People.restore(snap))
  ipcMain.handle(Channels.people.setAvatar, (e, id: string) =>
    setPersonAvatar(BrowserWindow.fromWebContents(e.sender), id)
  )

  // Families
  ipcMain.handle(Channels.families.list, () => Families.list())
  ipcMain.handle(Channels.families.create, (_e, input: FamilyInput) => Families.create(input))
  ipcMain.handle(Channels.families.update, (_e, id: string, input: FamilyInput) =>
    Families.update(id, input)
  )
  ipcMain.handle(Channels.families.remove, (_e, id: string) => Families.remove(id))

  // Documents
  ipcMain.handle(Channels.documents.list, () => Documents.list())
  ipcMain.handle(Channels.documents.listForPerson, (_e, pid: string) =>
    Documents.listForPerson(pid)
  )
  ipcMain.handle(Channels.documents.import, (e, personId?: string) =>
    importDocuments(BrowserWindow.fromWebContents(e.sender), personId)
  )
  ipcMain.handle(Channels.documents.importPaths, (_e, paths: string[], personId?: string) =>
    importDocumentPaths(paths, personId)
  )
  ipcMain.handle(Channels.documents.importDataUrl, (_e, dataUrl: string, personId?: string) =>
    importImageDataUrl(dataUrl, personId)
  )
  ipcMain.handle(Channels.documents.createLink, (_e, url: string, title: string, personId?: string) =>
    createLinkDocument(url, title, personId)
  )
  ipcMain.handle(Channels.documents.update, (_e, id: string, input: DocumentInput) =>
    Documents.update(id, input)
  )
  ipcMain.handle(Channels.documents.remove, (_e, id: string) => Documents.remove(id))
  ipcMain.handle(Channels.documents.restore, (_e, snap) => Documents.restore(snap))
  ipcMain.handle(Channels.documents.attach, (_e, docId: string, pid: string) =>
    Documents.attach(docId, pid)
  )
  ipcMain.handle(Channels.documents.detach, (_e, docId: string, pid: string) =>
    Documents.detach(docId, pid)
  )
  ipcMain.handle(Channels.documents.dataUrl, (_e, id: string) => documentDataUrl(id))
  ipcMain.handle(Channels.documents.open, (_e, id: string) => openDocument(id))

  // Background download of remote-URL photos (GEDCOM OBJE media) → local files.
  ipcMain.handle(Channels.media.downloadRemote, (e) =>
    downloadRemoteMedia((p) => safeSend(e.sender, Channels.media.downloadProgress, p))
  )

  // Board
  ipcMain.handle(Channels.board.get, (_e, boardId?: string) => Board.get(boardId))
  ipcMain.handle(Channels.board.saveNode, (_e, node: BoardNode) => Board.saveNode(node))
  ipcMain.handle(Channels.board.saveNodes, (_e, nodes: BoardNode[]) => Board.saveNodes(nodes))
  ipcMain.handle(Channels.board.removeNode, (_e, id: string) => Board.removeNode(id))
  ipcMain.handle(Channels.board.saveEdge, (_e, edge: BoardEdge) => Board.saveEdge(edge))
  ipcMain.handle(Channels.board.removeEdge, (_e, id: string) => Board.removeEdge(id))

  // Boards (tabs)
  ipcMain.handle(Channels.boards.list, () => Boards.list())
  ipcMain.handle(Channels.boards.create, (_e, name: string) => Boards.create(name))
  ipcMain.handle(Channels.boards.rename, (_e, id: string, name: string) => Boards.rename(id, name))
  ipcMain.handle(Channels.boards.remove, (_e, id: string) => Boards.remove(id))
  ipcMain.handle(Channels.boards.duplicate, (_e, id: string, name: string) =>
    Boards.duplicate(id, name)
  )

  // Research (sources/citations/notes)
  ipcMain.handle(Channels.research.citationsForPerson, (_e, pid: string) =>
    Citations.forOwner('person', pid)
  )
  // Add a hand-entered source + citation to a person.
  ipcMain.handle(Channels.research.addCitation, (_e, personId: string, edit: CitationEdit) => {
    const s = Sources.upsert({
      gedcomId: null,
      title: edit.sourceTitle ?? '',
      author: edit.sourceAuthor ?? null,
      publication: edit.sourcePublication ?? null,
      repositoryId: null,
      text: edit.sourceText ?? null,
      recordDate: edit.recordDate ?? null
    })
    Citations.create({
      sourceId: s.id,
      ownerType: 'person',
      ownerId: personId,
      eventTag: edit.eventTag ?? null,
      page: edit.page ?? null,
      quality: edit.quality ?? null,
      note: edit.note ?? null
    })
  })
  // Edit a citation AND its underlying source (e.g. give a FamilySearch source a
  // date). Only the provided keys are written; the source is created on the fly
  // if the citation had none.
  ipcMain.handle(Channels.research.updateCitation, (_e, id: string, edit: CitationEdit) => {
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
  })
  ipcMain.handle(Channels.research.deleteCitation, (_e, id: string) => Citations.remove(id))
  ipcMain.handle(Channels.research.notesForPerson, (_e, pid: string) => Notes.forOwner('person', pid))
  ipcMain.handle(Channels.research.logsForPerson, (_e, pid: string) => ResearchLogs.forPerson(pid))
  ipcMain.handle(Channels.research.allLogs, () => ResearchLogs.all())
  ipcMain.handle(Channels.research.createLog, (_e, input) => ResearchLogs.create(input))
  ipcMain.handle(Channels.research.updateLog, (_e, id: string, input) => ResearchLogs.update(id, input))
  ipcMain.handle(Channels.research.removeLog, (_e, id: string) => ResearchLogs.remove(id))

  // Aliases
  ipcMain.handle(Channels.aliases.listForPerson, (_e, pid: string) => Aliases.forPerson(pid))
  ipcMain.handle(Channels.aliases.all, () => Aliases.all())
  ipcMain.handle(Channels.aliases.create, (_e, pid: string, input) => Aliases.create(pid, input))
  ipcMain.handle(Channels.aliases.remove, (_e, id: string) => Aliases.remove(id))

  // Occupations (a person may hold several, each time-scoped)
  ipcMain.handle(Channels.occupations.listForPerson, (_e, pid: string) => Occupations.forPerson(pid))
  ipcMain.handle(Channels.occupations.all, () => Occupations.all())
  ipcMain.handle(Channels.occupations.create, (_e, pid: string, input) => Occupations.create(pid, input))
  ipcMain.handle(Channels.occupations.update, (_e, id: string, input) => Occupations.update(id, input))
  ipcMain.handle(Channels.occupations.remove, (_e, id: string) => Occupations.remove(id))
  ipcMain.handle(Channels.collaborations.listForPerson, (_e, pid: string) => Collaborations.forPerson(pid))

  // Godparents (keresztszülők) — a person may have one or more.
  ipcMain.handle(Channels.godparents.listForPerson, (_e, pid: string) => Godparents.forPerson(pid))
  ipcMain.handle(Channels.godparents.godchildren, (_e, pid: string) => Godparents.godchildrenOf(pid))
  ipcMain.handle(Channels.godparents.add, (_e, pid: string, gid: string) => Godparents.add(pid, gid))
  ipcMain.handle(Channels.godparents.remove, (_e, pid: string, gid: string) => Godparents.remove(pid, gid))

  // Life events / facts (residences, military, nationality, …) — person-scoped.
  ipcMain.handle(Channels.events.forPerson, (_e, pid: string) => Events.forPerson(pid))
  ipcMain.handle(Channels.events.create, (_e, pid: string, input) => Events.create('person', pid, input))
  ipcMain.handle(Channels.events.update, (_e, id: string, input) => Events.update(id, input))
  ipcMain.handle(Channels.events.remove, (_e, id: string) => Events.remove(id))

  // Tree
  ipcMain.handle(
    Channels.tree.build,
    (_e, rootId?: string, mode?: 'ancestors' | 'descendants') => buildTree(rootId, mode)
  )
  ipcMain.handle(Channels.tree.pedigree, (_e, rootId?: string, rootFamilyId?: string) =>
    buildPedigree(rootId, rootFamilyId)
  )
  ipcMain.handle(Channels.tree.kinship, () => detectKinship())
  ipcMain.handle(Channels.tree.unionCouple, (_e, familyId: string) => buildUnionCouple(familyId))
  ipcMain.handle(Channels.tree.personDescendants, (_e, personId: string) =>
    buildPersonDescendants(personId)
  )
  ipcMain.handle(Channels.tree.exportImage, (e, payload: TreeExportPayload) =>
    exportTreeImage(BrowserWindow.fromWebContents(e.sender), payload)
  )

  // Map
  ipcMain.handle(Channels.map.markers, () => buildMapMarkers())
  ipcMain.handle(Channels.atlas.points, () => buildAtlasPoints())
  ipcMain.handle(
    Channels.wiki.eventsNear,
    (_e, lat: number, lon: number, fromYear: number, toYear: number, lang?: string) =>
      wikiEventsNear(lat, lon, fromYear, toYear, lang)
  )

  // Sanity check
  ipcMain.handle(Channels.sanity.check, () => runSanityCheck())
  ipcMain.handle(Channels.sanity.dismiss, (_e, key: string) => DismissedIssues.add(key))

  // Relationship finder (kinship path between two people)
  ipcMain.handle(Channels.relationship.find, (_e, fromId: string, toId: string) =>
    findRelationshipPath(fromId, toId)
  )

  // Query builder
  ipcMain.handle(Channels.query.run, (_e, q) => runPersonQuery(q))
  ipcMain.handle(Channels.query.listSaved, () => listSavedQueries())
  ipcMain.handle(Channels.query.save, (_e, name, query) => saveQuery(name, query))
  ipcMain.handle(Channels.query.remove, (_e, id) => removeSavedQuery(id))

  // Backup & restore
  ipcMain.handle(Channels.backup.create, (e) =>
    createBackup(BrowserWindow.fromWebContents(e.sender))
  )
  // Bulk operations pause the audit log so a restore/import doesn't bury the
  // user's own edits under thousands of machine-generated entries.
  ipcMain.handle(Channels.backup.restore, (e) =>
    Audit.pauseAsync(() => restoreBackup(BrowserWindow.fromWebContents(e.sender)))
  )

  // GEDCOM
  ipcMain.handle(Channels.gedcom.import, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined!
    const res = await dialog.showOpenDialog(win, {
      title: 'Import GEDCOM',
      properties: ['openFile'],
      filters: [{ name: 'GEDCOM', extensions: ['ged', 'gedcom'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return Audit.pause(() => importGedcomFile(res.filePaths[0]))
  })
  ipcMain.handle(Channels.gedcom.importContent, (_e, text: string) =>
    Audit.pause(() => importGedcomText(text))
  )

  // FamilySearch streaming importer → live SQLite ingest
  ipcMain.handle(Channels.familysearch.import, async (e, options: FamilySearchImportOptions) => {
    // Remember the import settings so they can pre-fill for an easy re-import next time.
    AppSettings.set(
      'fs_import_settings',
      JSON.stringify({
        username: options.username,
        root: options.root,
        ascend: options.ascend,
        depth: options.depth,
        maxPeople: options.maxPeople,
        replace: options.replace
      })
    )
    // Mark an import "in progress" so that if the app is killed mid-run, the next
    // launch can detect the interruption and offer the cleanup. Cleared once the
    // import finishes (or is stopped) and the stubs have been cleaned up.
    AppSettings.set('fs_import_pending', '1')
    // Suppress the audit log during the streamed import (restored in `finally`).
    Audit.setEnabled(false)
    const ingester = new FsIngester()
    // As soon as the chosen starting person streams in, make them the app's root
    // (top-bar starting person) — live, without waiting for the whole import.
    let rootApplied = false
    let resolvedRoot: string | null = null
    try {
      const res = await importFromFamilySearch(
        options,
        (status) => safeSend(e.sender, Channels.familysearch.status, status),
        (node) => {
          const event = ingester.ingest(node)
          if (event) safeSend(e.sender, Channels.familysearch.nodeAdded, event)
          // Apply the root AS SOON AS the starting person streams in, so the
          // tree can grow live from the first refresh. With an explicit root we
          // wait for that fid; otherwise (importing your own tree) the FIRST
          // person is the ancestry root.
          if (
            !rootApplied &&
            !options.keepRoot &&
            node.t === 'i' &&
            event?.kind === 'person' &&
            event.person &&
            (!options.root || node.fid === options.root)
          ) {
            rootApplied = true
            AppSettings.set('default_root_person_id', event.person.id)
            safeSend(e.sender, Channels.familysearch.rootSet, event.person.id)
          }
        }
      )
      resolvedRoot = res.rootFid
      // Fill any FS-linked person left EMPTY by the import (stubs from
      // relationship edges whose full record wasn't fetched). These are real
      // tree members — fill them, never delete them.
      await fillEmptyFsPersons(
        options.treeId ?? null,
        (status) => safeSend(e.sender, Channels.familysearch.status, status),
        (node) => {
          const ev = ingester.ingest(node)
          if (ev) safeSend(e.sender, Channels.familysearch.nodeAdded, ev)
        }
      )
    } finally {
      // Always drop nameless married-in stubs — even after a manual Stop — so a
      // partial import never leaves empty entities behind.
      removeNamelessStubs()
      AppSettings.set('fs_import_pending', null)
      Audit.setEnabled(true)
    }
    // New place names → geocode them for the map automatically (background;
    // uses the FamilySearch Places authority while signed in).
    void geocodePlaces(() => undefined).catch(() => undefined)
    // Anchor the app on the starting person (the signed-in user's FS person)
    // and tell the renderer so the top bar updates immediately.
    if (!options.keepRoot && resolvedRoot) {
      const rootPerson = People.findByFsId(resolvedRoot)
      if (rootPerson) {
        AppSettings.set('default_root_person_id', rootPerson.id)
        safeSend(e.sender, Channels.familysearch.rootSet, rootPerson.id)
      }
    }
    return {
      people: ingester.created + ingester.updated,
      families: ingester.familiesCreated + ingester.familiesUpdated,
      skipped: 0,
      peopleCreated: ingester.created,
      peopleUpdated: ingester.updated,
      familiesCreated: ingester.familiesCreated,
      familiesUpdated: ingester.familiesUpdated
    }
  })
  // Browser sign-in: opens FamilySearch's own page; the app never sees the password.
  ipcMain.handle(Channels.familysearch.login, (_e, lang?: string) => loginFamilySearchOAuth(lang))
  ipcMain.handle(Channels.familysearch.signOut, () => forgetCreds())
  ipcMain.handle(Channels.familysearch.signedIn, () => isSignedIn())
  ipcMain.handle(Channels.familysearch.configured, () => isFamilySearchConfigured())
  ipcMain.handle(Channels.familysearch.syncPreview, (_e, personId: string) => familySearchSyncPreview(personId))
  ipcMain.handle(Channels.familysearch.listTrees, () => listFamilySearchTrees())
  ipcMain.handle(Channels.familysearch.lookupPerson, (_e, fid: string, treeId?: string) => lookupFsPerson(fid, treeId))
  ipcMain.handle(Channels.familysearch.normalizeDate, (_e, text: string, lang: string) =>
    normalizeDateViaFamilySearch(text, lang)
  )
  ipcMain.handle(Channels.familysearch.search, (_e, options) => searchFamilySearch({ query: options.query }))
  ipcMain.handle(Channels.familysearch.preview, (e, options) =>
    previewFamilySearch({
      root: options?.root,
      ascend: options?.ascend,
      // Stream the preview's auth / root / ancestor-walk progress to the dialog.
      onStatus: (s) => safeSend(e.sender, Channels.familysearch.status, s)
    })
  )
  // Stop a running import (the post-import cleanup still runs in the handler).
  ipcMain.handle(Channels.familysearch.cancel, () => cancelFamilySearchImport())
  // Was an import interrupted (app killed mid-run)? → offer cleanup next launch.
  ipcMain.handle(Channels.familysearch.pending, () => AppSettings.get('fs_import_pending') === '1')
  // Manual cleanup of empty/nameless entities (also clears the interrupted flag).
  ipcMain.handle(Channels.db.cleanup, () =>
    Audit.pause(() => {
      const removed = removeNamelessStubs()
      AppSettings.set('fs_import_pending', null)
      return removed
    })
  )

  // Thorough "delete empty people" (Settings button): catches fully-empty people
  // including empty child placeholders, never orphaning a real lineage.
  ipcMain.handle(Channels.db.removeEmpty, () =>
    Audit.pause(() => {
      const removed = removeEmptyPeople()
      AppSettings.set('fs_import_pending', null)
      return removed
    })
  )

  // Sync ONE person from FamilySearch, reusing the cached session login. The
  // streamed node is merged NON-destructively (curated fields are preserved).
  ipcMain.handle(
    Channels.familysearch.syncPerson,
    async (_e, fid: string) => {
      // Requires a browser sign-in (OAuth token). If not signed in, ask the
      // renderer to prompt sign-in.
      if (!isSignedIn()) return { needCreds: true as const }
      const nodes = await syncPersonFromFamilySearch({ fid })
      const node = nodes.find((n) => n.t === 'i')
      if (!node) return { found: false, updated: 0 }
    const existing = People.findByFsId(node.fid)
    if (!existing) return { found: false, updated: 0 }
    // Explicit per-person sync → FamilySearch wins for every field it provides.
    const changed = People.overwriteFrom(existing.id, {
      givenName: node.g,
      surname: node.s,
      sex: node.x,
      fsId: node.fid,
      birthDate: node.bd,
      birthPlace: node.bp,
      deathDate: node.dd,
      deathPlace: node.dp,
      deceased: !!node.dc || !!node.dd,
      christeningDate: node.cd ?? null,
      christeningPlace: node.cp ?? null,
      burialDate: node.bud ?? null,
      burialPlace: node.bup ?? null,
      religion: node.re ?? null,
      birthNote: node.bn ?? null,
      deathNote: node.dn ?? null,
      christeningNote: node.cn ?? null,
      burialNote: node.un ?? null
    })
    // Same enrichment as the bulk import: name variations, photos & profile photo,
    // occupations, life events and notes (all additive / deduped — local edits kept).
    applyFsAliases(existing.id, node.alt)
    applyFsMedia(existing.id, node.media)
    applyFsOccupations(existing.id, node.oc)
    applyFsEvents(existing.id, node.ev)
    applyFsNotes(existing.id, node.no)
    applyFsSources(existing.id, nodes)
    applyFsGodparents(nodes, node.fid, existing.id)
    // NEW relatives on FamilySearch (spouse/child/parent/godparent) → pull them
    // in complete (record + portrait + notes + sources) and wire the families.
    let addedRelatives: { fid: string; name: string; kind: string }[] = []
    try {
      const rel = await syncPersonRelatives(existing.id)
      if (rel.nodes.length) {
        Audit.setEnabled(false)
        try {
          const ing = new FsIngester()
          for (const rn of rel.nodes) ing.ingest(rn)
        } finally {
          Audit.setEnabled(true)
        }
      }
      addedRelatives = rel.added
    } catch {
      /* relative sync is best-effort */
    }
    // Geocode any new places this sync brought in (background, best-effort).
    void geocodePlaces(() => undefined).catch(() => undefined)
    return { found: true, updated: changed ? 1 : 0, addedRelatives }
  })

  // Pre-fill data for an easy re-import: saved settings (no password) plus the
  // in-memory session login when still connected.
  ipcMain.handle(Channels.familysearch.getSettings, () => {
    const raw = AppSettings.get('fs_import_settings')
    return raw ? JSON.parse(raw) : {}
  })

  // Reload every renderer window in place. Used after wiping data or switching
  // the active workspace — far more robust than relaunching the OS process,
  // which fails in dev (the relaunched instance loses the dev server URL → black
  // screen). The renderer reloads, re-fetches over IPC, and the main process
  // reopens the (now active) database on the next getDb().
  const reloadWindows = (): void => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.reload()
  }

  // Wipe all data, then reload for a clean slate. Also clears the saved
  // FamilySearch login so a reset truly leaves nothing behind.
  ipcMain.handle(Channels.db.wipe, () => {
    forgetCreds()
    wipeDatabase()
    reloadWindows()
  })

  // App settings (default root person)
  ipcMain.handle(Channels.app.setLanguage, (_e, lang: string) => {
    AppSettings.set('app_language', lang)
  })
  ipcMain.handle(Channels.settings.getDefaultRoot, () => AppSettings.get('default_root_person_id'))
  ipcMain.handle(Channels.settings.setDefaultRoot, (_e, id: string | null) =>
    AppSettings.set('default_root_person_id', id)
  )

  // Open external URLs (board link nodes, etc.) — http(s) only.
  ipcMain.handle(Channels.app.openExternal, (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  // Open the bundled Hungarian user manual (self-contained HTML) in its own
  // in-app window (NOT the system browser). Packaged: resources/manual.html;
  // dev: the source docs/ copy. Re-opening focuses the existing window.
  ipcMain.handle(Channels.app.openManual, () => {
    const file = [
      join(process.resourcesPath, 'manual.html'),
      join(app.getAppPath(), 'docs', 'TreeMonk-Kezikonyv.html')
    ].find((p) => existsSync(p))
    if (!file) return false
    if (manualWindow && !manualWindow.isDestroyed()) {
      manualWindow.show()
      manualWindow.focus()
      return true
    }
    const win = new BrowserWindow({
      width: 940,
      height: 860,
      title: 'TreeMonk — Kézikönyv',
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    win.setMenuBarVisibility(false)
    void win.loadFile(file)
    win.on('closed', () => {
      manualWindow = null
    })
    manualWindow = win
    return true
  })

  // Self-update: report the running version + check GitHub releases for a newer one.
  ipcMain.handle(Channels.updates.version, () => currentVersion())
  ipcMain.handle(Channels.updates.check, () => checkForUpdates())
  ipcMain.handle(Channels.updates.download, () => openUpdateDownload())
  ipcMain.handle(Channels.updates.history, () => listReleases())

  // Workspaces ("mandants") — each family tree is an isolated database file.
  // Switching/creating closes the old DB then reloads, so getDb() opens the new
  // active file cleanly (no OS-level relaunch — see reloadWindows above).
  const relaunch = (): void => {
    closeDb()
    reloadWindows()
  }
  ipcMain.handle(Channels.workspaces.list, () => listWorkspaces())
  ipcMain.handle(Channels.workspaces.active, () => activeWorkspace())
  ipcMain.handle(Channels.workspaces.create, (_e, name: string) => {
    const ws = createWorkspace(name)
    setActiveWorkspace(ws.id)
    relaunch()
  })
  ipcMain.handle(Channels.workspaces.switch, (_e, id: string) => {
    setActiveWorkspace(id)
    relaunch()
  })
  ipcMain.handle(Channels.workspaces.rename, (_e, id: string, name: string) =>
    renameWorkspace(id, name)
  )
  ipcMain.handle(Channels.workspaces.remove, (_e, id: string) => {
    if (removeWorkspace(id)) relaunch()
  })

  // Geocoding (Nominatim)
  ipcMain.handle(Channels.geo.search, (_e, query: string) => geoSearch(query))
  ipcMain.handle(Channels.geo.savePlace, (_e, place) => savePlace(place))
  ipcMain.handle(Channels.geo.geocodeAll, (e) =>
    geocodePlaces((p) => safeSend(e.sender, Channels.geo.geocodeProgress, p))
  )
  ipcMain.handle(Channels.geo.standardizeAll, (e, onlyNew?: boolean) =>
    standardizePlaces((p) => safeSend(e.sender, Channels.geo.standardizeProgress, p), { skipKnown: !!onlyNew })
  )
  ipcMain.handle(Channels.gedcom.export, async (e, personIds?: string[], defaultName?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined!
    // Strip path separators / a stray .ged so the suggested name can't redirect
    // the dialog to another folder, then re-add the extension.
    const base =
      (defaultName ?? '').replace(/[\\/]+/g, '').replace(/\.ged$/i, '').trim() || 'treemonk-export'
    const res = await dialog.showSaveDialog(win, {
      title: 'Export GEDCOM',
      defaultPath: `${base}.ged`,
      filters: [{ name: 'GEDCOM', extensions: ['ged'] }],
      // Linux/GTK does not confirm overwrites unless asked explicitly.
      properties: ['showOverwriteConfirmation', 'createDirectory']
    })
    if (res.canceled || !res.filePath) return null
    exportGedcom(res.filePath, personIds)
    return { path: res.filePath }
  })

  // Whole-tree data export — JSON snapshot or a raw SQLite database file.
  ipcMain.handle(Channels.data.exportJson, (e) => exportJson(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle(Channels.data.exportDatabase, (e) =>
    exportDatabase(BrowserWindow.fromWebContents(e.sender))
  )

  // Audit log (change history + undo)
  ipcMain.handle(Channels.audit.query, (_e, filter?: AuditFilter) => Audit.query(filter))
  ipcMain.handle(Channels.audit.impact, (_e, seq: number) => Audit.impact(seq))
  ipcMain.handle(Channels.audit.revert, (_e, seq: number) => Audit.revert(seq))

  // Dashboard → detailed multi-page PDF
  ipcMain.handle(Channels.dashboard.exportPdf, (e, html: string, defaultName: string) =>
    exportHtmlPdf(BrowserWindow.fromWebContents(e.sender), html, defaultName)
  )

  // Duplicate detection + merge
  ipcMain.handle(Channels.duplicates.scan, () => scanDuplicates())
  ipcMain.handle(Channels.duplicates.merge, (_e, survivorId: string, victimId: string, resolution: MergeResolution) =>
    mergePeople(survivorId, victimId, resolution)
  )
  ipcMain.handle(Channels.duplicates.dismiss, (_e, aId: string, bId: string) => dismissMerge(aId, bId))

  ipcMain.handle(Channels.names.surnameVariants, () => surnameVariants())
  ipcMain.handle(Channels.names.normalizeSurname, (_e, variants: string[], canonical: string) =>
    normalizeSurname(variants, canonical)
  )
  ipcMain.handle(Channels.names.givenNameVariants, () => givenNameVariants())
  ipcMain.handle(Channels.names.normalizeGivenName, (_e, variants: string[], canonical: string) =>
    normalizeGivenName(variants, canonical)
  )

  // One-time, no-pressure support invitation — flagged in the key/value settings
  // so it never reappears once seen, on this or any future version.
  ipcMain.handle(Channels.supportInvite.status, () => AppSettings.get('support_invite_seen') === '1')
  ipcMain.handle(Channels.supportInvite.markSeen, () => AppSettings.set('support_invite_seen', '1'))
  ipcMain.handle(Channels.fsAnnounce.status, () => AppSettings.get('fs_announce_seen') === '1')
  ipcMain.handle(Channels.fsAnnounce.markSeen, () => AppSettings.set('fs_announce_seen', '1'))
}
