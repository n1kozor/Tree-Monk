import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { Channels } from '@shared/ipc'
import { isAppLanguage } from '@shared/languages'
import {
  Aliases,
  AppSettings,
  Board,
  Boards,
  Citations,
  DismissedIssues,
  Documents,
  FactParticipants,
  Families,
  Attributes,
  EventParticipants,
  Godparents,
  Places,
  Witnesses,
  type WitnessOwnerType,
  Notes,
  Events,
  Occupations,
  Collaborations,
  People,
  ResearchLogs,
  Sources,
  Todos
} from './db/repo'
import { buildTree } from './db/tree'
import { buildPedigree, buildPersonDescendants, buildUnionCouple } from './db/pedigree'
import { detectKinship } from './db/kinship'
import { exportTreeImage, exportHtmlPdf } from './treeExport'
import { registerRegionsIpc } from './regionsIpc'
import { buildMapMarkers } from './db/mapData'
import { buildAtlasPoints } from './db/atlasData'
import { getApiConfig, getApiStatus, notifyDataChanged, regenerateApiToken, restartApiServer, setApiConfig } from './api/server'
import { installPluginZip, listPlugins, pluginPanelInfo, removePlugin, setPluginEnabled } from './plugins'
import { eventsNear as wikiEventsNear } from './wiki'
import { hiddenIssues, restoreHidden, runSanityCheck } from './db/sanity'
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
  probeFamilySearchThrottle,
  searchFamilySearch,
  syncPersonFromFamilySearch
} from './familysearch'
import {
  FsIngester,
  applyFsAliases,
  applyFsCollaborations,
  applyFsEvents,
  applyFsMedia,
  applyFsNotes,
  applyFsOccupations,
  applyFsSources,
  applyFsGodparents
} from './db/fsIngest'
import { removeDisconnectedImports, removeEmptyPeople, removeNamelessStubs, wipeDatabase } from './db/admin'
import { closeDb } from './db/connection'
import { Audit } from './db/audit'
import { scanDuplicates, mergePeople, dismissMerge } from './db/duplicates'
import {
  surnameVariants,
  normalizeSurname,
  dismissNameGroup,
  givenNameVariants,
  normalizeGivenName
} from './db/nameNormalize'
import { exportJson, exportDatabase } from './dataExport'
import {
  activeWorkspace,
  createWorkspace,
  listWorkspaces,
  markActiveWorkspaceKind,
  removeWorkspace,
  renameWorkspace,
  setActiveWorkspace,
  wasFreshBootstrap
} from './workspaces'
import { geoSearch, geocodePlaces, queueGeocode, savePlace, standardizePlaces, waitForIncomingGeocode } from './geo'
import { checkForUpdates, currentVersion, listReleases, openUpdateDownload } from './updates'
import type { ChildRelation, FamilySearchImportOptions } from '@shared/types'
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
import { exportIndexes, exportSite } from './siteExport'
import { importCsvFile } from './csvImport'
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
  registerRegionsIpc() // photo region (face) tags
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
  ipcMain.handle(
    Channels.families.setChildRelation,
    (_e, fid: string, cid: string, side: 'father' | 'mother' | 'both', rel: ChildRelation | null) =>
      Families.setChildRelation(fid, cid, side, rel)
  )

  // Shared-event participants (roles: pap, bába, adományozó…).
  ipcMain.handle(Channels.eventParticipants.forEvent, (_e, eid: string) => EventParticipants.forEvent(eid))
  ipcMain.handle(Channels.eventParticipants.set, (_e, eid: string, pid: string, role: string | null) =>
    EventParticipants.set(eid, pid, role)
  )
  ipcMain.handle(Channels.eventParticipants.remove, (_e, eid: string, pid: string) =>
    EventParticipants.remove(eid, pid)
  )
  ipcMain.handle(Channels.eventParticipants.forPerson, (_e, pid: string) => EventParticipants.forPerson(pid))

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
  ipcMain.handle(Channels.documents.attach, (_e, docId: string, pid: string, eventTag?: string | null) =>
    Documents.attach(docId, pid, eventTag)
  )
  ipcMain.handle(Channels.documents.detach, (_e, docId: string, pid: string) =>
    Documents.detach(docId, pid)
  )
  ipcMain.handle(Channels.documents.tagsForPerson, (_e, pid: string) => Documents.eventTagsForPerson(pid))
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
    return Citations.create({
      sourceId: s.id,
      ownerType: 'person',
      ownerId: personId,
      eventTag: edit.eventTag ?? null,
      page: edit.page ?? null,
      quality: edit.quality ?? null,
      note: edit.note ?? null
    })
  })
  // Attach an existing source (from a citation) to another person — used by the
  // "attach to others" flow so one source can back several people. Idempotent.
  ipcMain.handle(
    Channels.research.attachSourceToPerson,
    (_e, sourceId: string, personId: string, eventTag: string | null) =>
      Citations.attachSource(sourceId, personId, eventTag)
  )
  ipcMain.handle(Channels.research.peopleForSource, (_e, sourceId: string) =>
    Citations.peopleForSource(sourceId)
  )
  ipcMain.handle(Channels.research.detachSourceFromPerson, (_e, sourceId: string, personId: string) =>
    Citations.detachSource(sourceId, personId)
  )
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
  ipcMain.handle(Channels.research.listSources, () => Sources.list())
  ipcMain.handle(Channels.research.notesForPerson, (_e, pid: string) => Notes.forOwner('person', pid))
  ipcMain.handle(Channels.research.logsForPerson, (_e, pid: string) => ResearchLogs.forPerson(pid))
  ipcMain.handle(Channels.research.allLogs, () => ResearchLogs.all())
  ipcMain.handle(Channels.research.createLog, (_e, input) => ResearchLogs.create(input))
  ipcMain.handle(Channels.research.updateLog, (_e, id: string, input) => ResearchLogs.update(id, input))
  ipcMain.handle(Channels.research.removeLog, (_e, id: string) => ResearchLogs.remove(id))

  // Todos
  ipcMain.handle(Channels.todos.all, () => Todos.all())
  ipcMain.handle(Channels.todos.forPerson, (_e, pid: string) => Todos.forPerson(pid))
  ipcMain.handle(Channels.todos.create, (_e, input) => Todos.create(input))
  ipcMain.handle(Channels.todos.update, (_e, id: string, input) => Todos.update(id, input))
  ipcMain.handle(Channels.todos.remove, (_e, id: string) => Todos.remove(id))

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
  ipcMain.handle(Channels.occupations.reorder, (_e, ids: string[]) => Occupations.reorder(ids))
  ipcMain.handle(Channels.collaborations.listForPerson, (_e, pid: string) => Collaborations.forPerson(pid))

  // Godparents (keresztszülők) — a person may have one or more.
  ipcMain.handle(Channels.godparents.listForPerson, (_e, pid: string) => Godparents.forPerson(pid))
  ipcMain.handle(Channels.godparents.godchildren, (_e, pid: string) => Godparents.godchildrenOf(pid))
  ipcMain.handle(Channels.godparents.add, (_e, pid: string, gid: string) => Godparents.add(pid, gid))
  ipcMain.handle(Channels.godparents.remove, (_e, pid: string, gid: string) => Godparents.remove(pid, gid))

  // Witnesses (tanúk) — christening witnesses of a person, marriage witnesses of a family.
  ipcMain.handle(Channels.witnesses.forOwner, (_e, ot: WitnessOwnerType, oid: string) => Witnesses.forOwner(ot, oid))
  ipcMain.handle(Channels.witnesses.add, (_e, ot: WitnessOwnerType, oid: string, wid: string) => Witnesses.add(ot, oid, wid))
  ipcMain.handle(Channels.witnesses.remove, (_e, ot: WitnessOwnerType, oid: string, wid: string) => Witnesses.remove(ot, oid, wid))

  // Role-bearing participants of a vital fact (midwife, officiating priest…).
  ipcMain.handle(Channels.factParticipants.forFact, (_e, pid: string, tag: string) => FactParticipants.forFact(pid, tag))
  ipcMain.handle(Channels.factParticipants.add, (_e, pid: string, tag: string, part: string, role: string | null) =>
    FactParticipants.add(pid, tag, part, role)
  )
  ipcMain.handle(Channels.factParticipants.remove, (_e, pid: string, tag: string, part: string) =>
    FactParticipants.remove(pid, tag, part)
  )

  // Free-form person attributes (FACT/TYPE).
  ipcMain.handle(Channels.attributes.forPerson, (_e, pid: string) => Attributes.forPerson(pid))
  ipcMain.handle(Channels.attributes.create, (_e, pid: string, input) => Attributes.create(pid, input))
  ipcMain.handle(Channels.attributes.update, (_e, id: string, input) => Attributes.update(id, input))
  ipcMain.handle(Channels.attributes.remove, (_e, id: string) => Attributes.remove(id))

  // Life events / facts (residences, military, nationality, …) — person-scoped.
  ipcMain.handle(Channels.events.forPerson, (_e, pid: string) => Events.forPerson(pid))
  ipcMain.handle(Channels.events.forFamily, (_e, fid: string) => Events.forOwner('family', fid))
  ipcMain.handle(Channels.events.create, (_e, pid: string, input) => Events.create('person', pid, input))
  ipcMain.handle(Channels.events.createForFamily, (_e, fid: string, input) => Events.create('family', fid, input))
  ipcMain.handle(Channels.events.update, (_e, id: string, input) => Events.update(id, input))
  ipcMain.handle(Channels.events.remove, (_e, id: string) => Events.remove(id))
  ipcMain.handle(Channels.events.reorder, (_e, ids: string[]) => Events.reorder(ids))

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
  ipcMain.handle(Channels.tree.personDescendants, (_e, personId: string, familyId?: string) =>
    buildPersonDescendants(personId, familyId)
  )
  ipcMain.handle(Channels.tree.exportImage, (e, payload: TreeExportPayload) =>
    exportTreeImage(BrowserWindow.fromWebContents(e.sender), payload)
  )

  // Map
  ipcMain.handle(Channels.map.markers, () => buildMapMarkers())
  ipcMain.handle(Channels.atlas.points, () => buildAtlasPoints())
  ipcMain.handle(Channels.apiServer.getConfig, () => getApiConfig())
  ipcMain.handle(Channels.apiServer.setConfig, (_e, patch) => setApiConfig(patch))
  ipcMain.handle(Channels.apiServer.regenerateToken, () => {
    const t = regenerateApiToken()
    restartApiServer()
    return t
  })
  ipcMain.handle(Channels.apiServer.status, () => getApiStatus())

  // Plugins (sandboxed panels over the local API)
  ipcMain.handle(Channels.plugins.list, () => listPlugins())
  ipcMain.handle(Channels.plugins.install, (e, filePath?: string) =>
    installPluginZip(BrowserWindow.fromWebContents(e.sender), filePath)
  )
  ipcMain.handle(Channels.plugins.remove, (_e, id: string) => removePlugin(id))
  ipcMain.handle(Channels.plugins.setEnabled, (_e, id: string, enabled: boolean) =>
    setPluginEnabled(id, enabled)
  )
  ipcMain.handle(Channels.plugins.panel, (_e, pluginId: string, menuId: string) =>
    pluginPanelInfo(pluginId, menuId)
  )
  ipcMain.handle(
    Channels.wiki.eventsNear,
    (_e, lat: number, lon: number, fromYear: number, toYear: number, lang?: string) =>
      wikiEventsNear(lat, lon, fromYear, toYear, lang)
  )

  // Sanity check
  ipcMain.handle(Channels.sanity.check, () => runSanityCheck(existsSync))
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
    markActiveWorkspaceKind('manual')
    return Audit.pause(() => importGedcomFile(res.filePaths[0]))
  })
  ipcMain.handle(Channels.gedcom.importContent, (_e, text: string) => {
    markActiveWorkspaceKind('manual')
    return Audit.pause(() => importGedcomText(text))
  })

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
    // Snapshot the gazetteer BEFORE anything is imported. The incremental
    // geocoder fills it with RAW place strings while the import streams, so
    // afterwards "already known" no longer means "already standardized" — only
    // this snapshot does. Without it the post-import pass skips every new
    // variant and the same village shows up twice in the statistics.
    const placesBeforeImport = Places.list().map((p) => p.name)
    // This tree is now a FamilySearch tree — the workspace list shows it, and
    // the FS features gate on it.
    markActiveWorkspaceKind('fs')
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
          // Geocode the places of THIS person right away, in the background, so
          // the map fills while the tree is still streaming in instead of only
          // after the whole import has finished. The queue de-duplicates and
          // shares the same request scheduler, so it cannot outrun the limits.
          if (node.t === 'i') {
            queueGeocode([
              node.bp,
              node.dp,
              node.cp,
              node.bup,
              ...(node.ev ?? []).map((ev) => ev.place)
            ])
          } else if (node.t === 'f') {
            queueGeocode([node.mp])
          }
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
      // And drop persons THIS run created that ended up connected to nobody
      // (cap / side-branch cutoff artifacts — the data-issue checker used to
      // flag them as "not connected to anyone").
      const keepId = resolvedRoot
        ? (People.findByFsId(resolvedRoot)?.id ?? null)
        : (AppSettings.get('default_root_person_id') ?? null)
      removeDisconnectedImports(ingester.newFids, keepId)
      AppSettings.set('fs_import_pending', null)
      Audit.setEnabled(true)
    }
    // New place names → standardize + geocode automatically (background; uses
    // the FamilySearch Places authority while signed in). Standardization first
    // collapses spelling/language variants of the same place ("Budapest,
    // Hungary" / "Budapest, Magyarország") to ONE canonical form, then the
    // geocode pass fills in whatever is still missing; finally every open
    // window is told to refresh. The pre-import snapshot keeps re-imports fast.
    void (async () => {
      try {
        // Most places were already resolved by the incremental queue while the
        // import streamed; wait for it to drain so the two passes never look up
        // the same name twice, then finish whatever is left.
        await waitForIncomingGeocode()
        await standardizePlaces(() => undefined, { skipNames: placesBeforeImport })
        await geocodePlaces(() => undefined)
      } catch {
        /* best-effort background job */
      }
      notifyDataChanged()
    })()
    // Pull the FamilySearch photos down to local files in the background. Until
    // now this ran only after a GEDCOM import, so FS pictures stayed as remote
    // URLs and were fetched one by one whenever a profile happened to be opened
    // — slow on every view, and useless offline. Progress reuses the existing
    // download indicator.
    void (async () => {
      try {
        await downloadRemoteMedia((p) => safeSend(e.sender, Channels.media.downloadProgress, p))
      } catch {
        /* best-effort: a missing photo must never fail the import */
      }
      notifyDataChanged()
    })()
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
  ipcMain.handle(Channels.familysearch.throttleProbe, () => probeFamilySearchThrottle())
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

  // Sync ONE person from FamilySearch, reusing the cached session login. A
  // deleted or merged record is also applied locally only after the user has
  // confirmed it in the renderer.
  ipcMain.handle(
    Channels.familysearch.syncPerson,
    async (_e, fid: string) => {
      // Requires a browser sign-in (OAuth token). If not signed in, ask the
      // renderer to prompt sign-in.
      if (!isSignedIn()) return { needCreds: true as const }
      const remote = await syncPersonFromFamilySearch({ fid })
      const existing = People.findByFsId(fid)

      if (remote.status === 'deleted') {
        if (!existing) return { found: false, status: 'deleted' as const, updated: 0 }
        const snapshot = People.remove(existing.id)
        if (AppSettings.get('default_root_person_id') === existing.id)
          AppSettings.set('default_root_person_id', null)
        return { found: false, status: 'deleted' as const, updated: 0, snapshot }
      }
      if (remote.status === 'not_found') return { found: false, status: 'not_found' as const, updated: 0 }

      const node = remote.nodes.find((n) => n.t === 'i' && n.fid === remote.resolvedFid) ?? remote.nodes.find((n) => n.t === 'i')
      if (!node || node.t !== 'i' || !existing) {
        return {
          found: false,
          status: remote.status,
          forwardedFid: remote.forwardedFid,
          updated: 0
        }
      }

      const applyNode = (localId: string): boolean => {
        // Explicit per-person sync → FamilySearch wins for every field it provides.
        const changed = People.overwriteFrom(localId, {
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
        // Same enrichment as the bulk import: name variations, photos & profile
        // photo, occupations, life events and notes (all additive / deduped).
        applyFsAliases(localId, node.alt)
        applyFsMedia(localId, node.media)
        applyFsOccupations(localId, node.oc)
        applyFsEvents(localId, node.ev)
        applyFsNotes(localId, node.no)
        applyFsSources(localId, remote.nodes)
        applyFsGodparents(remote.nodes, node.fid, localId)
        applyFsCollaborations(localId, node.di)
        return changed
      }

      if (remote.status === 'merged' && remote.forwardedFid) {
        const target = People.findByFsId(remote.forwardedFid)
        let targetId = existing.id
        let mergeAuditSeq: number | undefined
        if (target && target.id !== existing.id) {
          // FamilySearch's forwarded person is canonical. Keep the local
          // research from both rows while making that person the survivor.
          const joinNotes = [...new Set([target.notes, existing.notes].filter((x): x is string => !!x?.trim()))].join('\n\n') || null
          const merged = mergePeople(target.id, existing.id, {
            givenName: node.g || target.givenName || existing.givenName,
            surname: node.s || target.surname || existing.surname,
            sex: node.x !== 'U' ? node.x : target.sex !== 'U' ? target.sex : existing.sex,
            birthDate: node.bd || target.birthDate || existing.birthDate,
            birthPlace: node.bp || target.birthPlace || existing.birthPlace,
            deathDate: node.dd || target.deathDate || existing.deathDate,
            deathPlace: node.dp || target.deathPlace || existing.deathPlace,
            deceased: !!node.dc || !!node.dd || target.deceased || existing.deceased,
            christeningDate: node.cd || target.christeningDate || existing.christeningDate,
            christeningPlace: node.cp || target.christeningPlace || existing.christeningPlace,
            burialDate: node.bud || target.burialDate || existing.burialDate,
            burialPlace: node.bup || target.burialPlace || existing.burialPlace,
            religion: node.re || target.religion || existing.religion,
            notes: joinNotes,
            profilePhotoId: target.profilePhotoId || existing.profilePhotoId
          })
          targetId = target.id
          mergeAuditSeq = merged.auditSeq
        } else if (!target) {
          // No local copy of the canonical person exists yet. Re-key this row
          // instead of creating a duplicate and preserve all its local research.
          People.update(existing.id, { fsId: remote.forwardedFid })
        }

        const changed = applyNode(targetId)
        let addedRelatives: { fid: string; name: string; kind: string }[] = []
        try {
          const rel = await syncPersonRelatives(targetId)
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
        void geocodePlaces(() => undefined).catch(() => undefined)
        return {
          found: true,
          status: 'merged' as const,
          forwardedFid: remote.forwardedFid,
          localPersonId: targetId,
          mergeAuditSeq,
          updated: changed ? 1 : 0,
          addedRelatives
        }
      }

      const changed = applyNode(existing.id)
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
      return { found: true, status: 'active' as const, updated: changed ? 1 : 0, addedRelatives }
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
    // http(s) links + mailto (the feedback "write to the developer" button).
    if (/^(https?:\/\/|mailto:)/i.test(url)) void shell.openExternal(url)
  })

  // Open the bundled multilingual user manual (self-contained HTML) in its own
  // in-app window (NOT the system browser). Packaged: resources/manual.html;
  // dev: the source docs/ copy. Re-opening focuses the existing window.
  ipcMain.handle(Channels.app.openManual, (_event, requestedLanguage: unknown) => {
    const requestedCode = typeof requestedLanguage === 'string' ? requestedLanguage.slice(0, 2).toLowerCase() : ''
    const language = isAppLanguage(requestedCode) ? requestedCode : 'en'
    // The bundled manual ships in hu/en/de/fr — other UI languages read the
    // English one (the title follows suit, so window and content agree).
    const MANUAL_LANGS = ['hu', 'en', 'de', 'fr'] as const
    const manualLang = (MANUAL_LANGS as readonly string[]).includes(language)
      ? (language as (typeof MANUAL_LANGS)[number])
      : 'en'
    const manualTitle = {
      hu: 'TreeMonk — Kézikönyv',
      en: 'TreeMonk — Manual',
      de: 'TreeMonk — Handbuch',
      fr: 'TreeMonk — Manuel'
    }[manualLang]
    const file = [
      join(process.resourcesPath, 'manual.html'),
      join(app.getAppPath(), 'docs', 'TreeMonk-Kezikonyv.html')
    ].find((p) => existsSync(p))
    if (!file) return false
    const loadOptions = { hash: `lang=${manualLang}` }
    if (manualWindow && !manualWindow.isDestroyed()) {
      manualWindow.setTitle(manualTitle)
      void manualWindow.loadFile(file, loadOptions)
      manualWindow.show()
      manualWindow.focus()
      return true
    }
    const win = new BrowserWindow({
      width: 940,
      height: 860,
      title: manualTitle,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    win.setMenuBarVisibility(false)
    void win.loadFile(file, loadOptions)
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
  ipcMain.handle(Channels.workspaces.freshBootstrap, () => wasFreshBootstrap())
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
  ipcMain.handle(Channels.geo.listPlaces, () =>
    Places.list().map((p) => ({
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      placeType: p.place_type ?? null,
      parentName: p.parent_name ?? null,
      govId: p.gov_id ?? null,
      canonical: p.canonical ?? null
    }))
  )
  ipcMain.handle(
    Channels.geo.setPlaceMeta,
    (_e, name: string, meta: { placeType?: string | null; parentName?: string | null; govId?: string | null }) =>
      Places.setMeta(name, meta)
  )
  ipcMain.handle(Channels.geo.geocodeAll, (e) =>
    geocodePlaces((p) => safeSend(e.sender, Channels.geo.geocodeProgress, p))
  )
  ipcMain.handle(Channels.geo.standardizeAll, (e, onlyNew?: boolean) =>
    standardizePlaces((p) => safeSend(e.sender, Channels.geo.standardizeProgress, p), { skipKnown: !!onlyNew })
  )
  ipcMain.handle(
    Channels.gedcom.export,
    async (
      e,
      personIds?: string[],
      defaultName?: string,
      opts?: { excludePrivate?: boolean; anonymizeLiving?: boolean }
    ) => {
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
    exportGedcom(res.filePath, personIds, opts)
    return { path: res.filePath }
    }
  )
  ipcMain.handle(Channels.site.export, async (e, lang: string, personIds?: string[]) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined!
    const res = await dialog.showSaveDialog(win, {
      title: 'Export website',
      defaultPath: 'treemonk-site.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory']
    })
    if (res.canceled || !res.filePath) return null
    exportSite(res.filePath, lang, personIds)
    return { path: res.filePath }
  })
  ipcMain.handle(Channels.site.exportIndexes, async (e, lang: string, personIds?: string[]) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined!
    const res = await dialog.showSaveDialog(win, {
      title: 'Export indexes',
      defaultPath: 'treemonk-indexes.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory']
    })
    if (res.canceled || !res.filePath) return null
    exportIndexes(res.filePath, lang, personIds)
    return { path: res.filePath }
  })
  // Bulk person import from CSV (delimiter + column auto-detection).
  ipcMain.handle(Channels.csv.import, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined!
    const res = await dialog.showOpenDialog(win, {
      title: 'Import CSV',
      filters: [{ name: 'CSV', extensions: ['csv', 'txt', 'tsv'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    return importCsvFile(res.filePaths[0])
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
  ipcMain.handle(Channels.names.dismissGroup, (_e, kind: 'surname' | 'given', key: string) =>
    dismissNameGroup(kind, key)
  )
  ipcMain.handle(Channels.sanity.hidden, () => hiddenIssues())
  ipcMain.handle(Channels.sanity.restore, (_e, kind: 'anomaly' | 'nameGroup' | 'merge', key: string) =>
    restoreHidden(kind, key)
  )

  // One-time, no-pressure support invitation — flagged in the key/value settings
  // so it never reappears once seen, on this or any future version.
  ipcMain.handle(Channels.supportInvite.status, () => AppSettings.get('support_invite_seen') === '1')
  ipcMain.handle(Channels.supportInvite.markSeen, () => AppSettings.set('support_invite_seen', '1'))
  ipcMain.handle(Channels.fsAnnounce.status, () => AppSettings.get('fs_announce_seen') === '1')
  ipcMain.handle(Channels.fsAnnounce.markSeen, () => AppSettings.set('fs_announce_seen', '1'))
}
