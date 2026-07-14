import type {
  ApiServerConfig,
  ApiServerStatus,
  AtlasPoint,
  Alias,
  AliasInput,
  AuditFilter,
  AuditImpact,
  AuditPage,
  BoardEdge,
  DuplicateCandidate,
  MergeResolution,
  MergeResult,
  BoardMeta,
  BoardNode,
  BoardState,
  Citation,
  CitationDetail,
  CitationEdit,
  Collaboration,
  DocumentInput,
  DocumentRecord,
  DocumentSnapshot,
  EventInput,
  EventRecord,
  Family,
  FamilyInput,
  FamilySearchImportOptions,
  FamilySearchPersonResult,
  FamilySearchPreview,
  FamilySearchSavedSettings,
  FamilySearchStatus,
  FsImportNodeEvent,
  GedcomImportResult,
  GeoResult,
  HistEvent,
  MapMarker,
  MediaDownloadProgress,
  NoteRecord,
  Occupation,
  OccupationInput,
  KinshipFlag,
  PedigreeCouple,
  Person,
  PersonInput,
  PersonQuery,
  SavedQuery,
  PersonSnapshot,
  RelationshipPath,
  ResearchLog,
  ResearchLogInput,
  SanityIssue,
  NameGroup,
  ReleaseEntry,
  UpdateInfo,
  TreeExportPayload,
  TreeExportResult,
  TreeNodeDatum,
  Workspace
} from './types'

/** Every IPC channel name, namespaced by domain. */
export const Channels = {
  people: {
    list: 'people:list',
    get: 'people:get',
    create: 'people:create',
    update: 'people:update',
    remove: 'people:remove',
    restore: 'people:restore',
    setAvatar: 'people:setAvatar'
  },
  families: {
    list: 'families:list',
    create: 'families:create',
    update: 'families:update',
    remove: 'families:remove'
  },
  documents: {
    list: 'documents:list',
    listForPerson: 'documents:listForPerson',
    import: 'documents:import',
    importPaths: 'documents:importPaths',
    importDataUrl: 'documents:importDataUrl',
    createLink: 'documents:createLink',
    update: 'documents:update',
    remove: 'documents:remove',
    restore: 'documents:restore',
    attach: 'documents:attach',
    detach: 'documents:detach',
    dataUrl: 'documents:dataUrl',
    open: 'documents:open'
  },
  board: {
    get: 'board:get',
    saveNode: 'board:saveNode',
    saveNodes: 'board:saveNodes',
    removeNode: 'board:removeNode',
    saveEdge: 'board:saveEdge',
    removeEdge: 'board:removeEdge'
  },
  boards: {
    list: 'boards:list',
    create: 'boards:create',
    rename: 'boards:rename',
    remove: 'boards:remove',
    duplicate: 'boards:duplicate'
  },
  research: {
    citationsForPerson: 'research:citationsForPerson',
    addCitation: 'research:addCitation',
    attachSourceToPerson: 'research:attachSourceToPerson',
    peopleForSource: 'research:peopleForSource',
    detachSourceFromPerson: 'research:detachSourceFromPerson',
    updateCitation: 'research:updateCitation',
    deleteCitation: 'research:deleteCitation',
    notesForPerson: 'research:notesForPerson',
    logsForPerson: 'research:logsForPerson',
    allLogs: 'research:allLogs',
    createLog: 'research:createLog',
    updateLog: 'research:updateLog',
    removeLog: 'research:removeLog'
  },
  aliases: {
    listForPerson: 'aliases:listForPerson',
    all: 'aliases:all',
    create: 'aliases:create',
    remove: 'aliases:remove'
  },
  events: {
    forPerson: 'events:forPerson',
    create: 'events:create',
    update: 'events:update',
    remove: 'events:remove',
    reorder: 'events:reorder'
  },
  occupations: {
    listForPerson: 'occupations:listForPerson',
    all: 'occupations:all',
    create: 'occupations:create',
    update: 'occupations:update',
    remove: 'occupations:remove',
    reorder: 'occupations:reorder'
  },
  collaborations: {
    listForPerson: 'collaborations:listForPerson'
  },
  godparents: {
    listForPerson: 'godparents:listForPerson',
    godchildren: 'godparents:godchildren',
    add: 'godparents:add',
    remove: 'godparents:remove'
  },
  tree: {
    build: 'tree:build',
    pedigree: 'tree:pedigree',
    unionCouple: 'tree:unionCouple',
    personDescendants: 'tree:personDescendants',
    kinship: 'tree:kinship',
    exportImage: 'tree:exportImage'
  },
  map: {
    markers: 'map:markers'
  },
  atlas: {
    points: 'atlas:points'
  },
  apiServer: {
    getConfig: 'apiServer:getConfig',
    setConfig: 'apiServer:setConfig',
    regenerateToken: 'apiServer:regenerateToken',
    status: 'apiServer:status',
    onExternalChange: 'apiServer:externalChange'
  },
  wiki: {
    eventsNear: 'wiki:eventsNear'
  },
  media: {
    downloadRemote: 'media:downloadRemote',
    downloadProgress: 'media:downloadProgress'
  },
  sanity: {
    check: 'sanity:check',
    dismiss: 'sanity:dismiss'
  },
  relationship: {
    find: 'relationship:find'
  },
  query: {
    run: 'query:run',
    listSaved: 'query:listSaved',
    save: 'query:save',
    remove: 'query:removeSaved'
  },
  backup: {
    create: 'backup:create',
    restore: 'backup:restore'
  },
  gedcom: {
    import: 'gedcom:import',
    importContent: 'gedcom:importContent',
    export: 'gedcom:export'
  },
  data: {
    exportJson: 'data:exportJson',
    exportDatabase: 'data:exportDatabase'
  },
  familysearch: {
    login: 'familysearch:login',
    import: 'familysearch:import',
    search: 'familysearch:search',
    preview: 'familysearch:preview',
    syncPerson: 'familysearch:syncPerson',
    getSettings: 'familysearch:getSettings',
    status: 'familysearch:status',
    nodeAdded: 'fs-import-node-added',
    rootSet: 'familysearch:rootSet',
    cancel: 'familysearch:cancel',
    pending: 'familysearch:pending',
    signOut: 'familysearch:signOut',
    signedIn: 'familysearch:signedIn',
    configured: 'familysearch:configured',
    personDiff: 'familysearch:personDiff',
    syncPreview: 'familysearch:syncPreview',
    listTrees: 'familysearch:listTrees',
    lookupPerson: 'familysearch:lookupPerson',
    normalizeDate: 'familysearch:normalizeDate',
  },
  db: {
    wipe: 'db:wipe',
    cleanup: 'db:cleanup',
    removeEmpty: 'db:removeEmpty'
  },
  settings: {
    getDefaultRoot: 'settings:getDefaultRoot',
    setDefaultRoot: 'settings:setDefaultRoot'
  },
  geo: {
    search: 'geo:search',
    savePlace: 'geo:savePlace',
    geocodeAll: 'geo:geocodeAll',
    geocodeProgress: 'geo:geocodeProgress',
    standardizeAll: 'geo:standardizeAll',
    standardizeProgress: 'geo:standardizeProgress'
  },
  app: {
    openExternal: 'app:openExternal',
    openManual: 'app:openManual',
    setLanguage: 'app:setLanguage'
  },
  updates: {
    version: 'updates:version',
    check: 'updates:check',
    download: 'updates:download',
    history: 'updates:history'
  },
  workspaces: {
    list: 'workspaces:list',
    active: 'workspaces:active',
    create: 'workspaces:create',
    switch: 'workspaces:switch',
    rename: 'workspaces:rename',
    remove: 'workspaces:remove'
  },
  audit: {
    query: 'audit:query',
    impact: 'audit:impact',
    revert: 'audit:revert'
  },
  dashboard: {
    exportPdf: 'dashboard:exportPdf'
  },
  duplicates: {
    scan: 'duplicates:scan',
    merge: 'duplicates:merge',
    dismiss: 'duplicates:dismiss'
  },
  names: {
    surnameVariants: 'names:surnameVariants',
    normalizeSurname: 'names:normalizeSurname',
    givenNameVariants: 'names:givenNameVariants',
    normalizeGivenName: 'names:normalizeGivenName'
  },
  supportInvite: {
    status: 'supportInvite:status',
    markSeen: 'supportInvite:markSeen'
  },
  fsAnnounce: {
    status: 'fsAnnounce:status',
    markSeen: 'fsAnnounce:markSeen'
  }
} as const

/** The typed surface exposed to the renderer via contextBridge as `window.api`. */
export interface TreeMonkApi {
  people: {
    list(): Promise<Person[]>
    get(id: string): Promise<Person | null>
    create(input: PersonInput): Promise<Person>
    update(id: string, input: PersonInput): Promise<Person>
    /** Deletes a person, returning a snapshot for undo. */
    remove(id: string): Promise<PersonSnapshot | null>
    restore(snapshot: PersonSnapshot): Promise<void>
    /** Opens an image picker and sets the chosen image as the person's avatar. */
    setAvatar(personId: string): Promise<Person | null>
  }
  families: {
    list(): Promise<Family[]>
    create(input: FamilyInput): Promise<Family>
    update(id: string, input: FamilyInput): Promise<Family>
    remove(id: string): Promise<void>
  }
  documents: {
    list(): Promise<DocumentRecord[]>
    listForPerson(personId: string): Promise<DocumentRecord[]>
    /** Opens a native file picker, copies chosen files into app storage. */
    import(personId?: string): Promise<DocumentRecord[]>
    /** Imports files by absolute path (e.g. dropped onto the board). Any file type. */
    importPaths(paths: string[], personId?: string): Promise<DocumentRecord[]>
    /** Saves an inlined image (data URL) — clipboard paste / in-app image drop. */
    importDataUrl(dataUrl: string, personId?: string): Promise<DocumentRecord | null>
    /** Records a web link (http/https) as a source attached to a person. */
    createLink(url: string, title: string, personId?: string): Promise<DocumentRecord | null>
    update(id: string, input: DocumentInput): Promise<DocumentRecord>
    /** Deletes a document (keeps the file), returning a snapshot for undo. */
    remove(id: string): Promise<DocumentSnapshot | null>
    restore(snapshot: DocumentSnapshot): Promise<void>
    attach(documentId: string, personId: string): Promise<void>
    detach(documentId: string, personId: string): Promise<void>
    /** Returns a data URL for in-app rendering of the stored file. */
    dataUrl(id: string): Promise<string | null>
    /** Opens the stored file in the OS default app (any type). */
    open(id: string): Promise<void>
  }
  board: {
    get(boardId?: string): Promise<BoardState>
    saveNode(node: BoardNode): Promise<void>
    saveNodes(nodes: BoardNode[]): Promise<void>
    removeNode(id: string): Promise<void>
    saveEdge(edge: BoardEdge): Promise<void>
    removeEdge(id: string): Promise<void>
  }
  boards: {
    list(): Promise<BoardMeta[]>
    create(name: string): Promise<BoardMeta>
    rename(id: string, name: string): Promise<void>
    remove(id: string): Promise<void>
    duplicate(id: string, name: string): Promise<BoardMeta>
  }
  research: {
    citationsForPerson(personId: string): Promise<CitationDetail[]>
    /** Add a source + citation to a person by hand. Returns the created citation. */
    addCitation(personId: string, edit: CitationEdit): Promise<Citation>
    /** Attach an EXISTING source to another person (a second citation, same source). */
    attachSourceToPerson(sourceId: string, personId: string, eventTag: string | null): Promise<void>
    /** Person ids that cite a given source ("who is this source attached to"). */
    peopleForSource(sourceId: string): Promise<string[]>
    /** Remove a person's citation(s) for a source (source kept for others). */
    detachSourceFromPerson(sourceId: string, personId: string): Promise<void>
    /** Edit a citation and its underlying source (e.g. give a FS source a date). */
    updateCitation(citationId: string, edit: CitationEdit): Promise<void>
    /** Remove a citation (the source row is kept — it may be shared). */
    deleteCitation(citationId: string): Promise<void>
    notesForPerson(personId: string): Promise<NoteRecord[]>
    logsForPerson(personId: string): Promise<ResearchLog[]>
    allLogs(): Promise<ResearchLog[]>
    createLog(input: ResearchLogInput): Promise<ResearchLog>
    updateLog(id: string, input: Partial<ResearchLogInput>): Promise<ResearchLog | null>
    removeLog(id: string): Promise<void>
  }
  aliases: {
    listForPerson(personId: string): Promise<Alias[]>
    all(): Promise<Alias[]>
    create(personId: string, input: AliasInput): Promise<Alias>
    remove(id: string): Promise<void>
  }
  occupations: {
    listForPerson(personId: string): Promise<Occupation[]>
    all(): Promise<Occupation[]>
    create(personId: string, input: OccupationInput): Promise<Occupation>
    update(id: string, input: OccupationInput): Promise<Occupation>
    remove(id: string): Promise<void>
    /** Persist a manual order (ids in the desired display order). */
    reorder(ids: string[]): Promise<void>
  }
  collaborations: {
    /** FamilySearch collaboration discussions imported for a person (read-only). */
    listForPerson(personId: string): Promise<Collaboration[]>
  }
  godparents: {
    /** The godparent person-ids of a person, in display order. */
    listForPerson(personId: string): Promise<string[]>
    /** The people this person is a godparent of. */
    godchildren(personId: string): Promise<string[]>
    add(personId: string, godparentId: string): Promise<void>
    remove(personId: string, godparentId: string): Promise<void>
  }
  events: {
    /** A person's life events / facts (residences, military, nationality, …). */
    forPerson(personId: string): Promise<EventRecord[]>
    create(personId: string, input: EventInput): Promise<EventRecord>
    update(id: string, input: EventInput): Promise<EventRecord>
    remove(id: string): Promise<void>
    /** Persist a manual order (ids in the desired display order). */
    reorder(ids: string[]): Promise<void>
  }
  tree: {
    build(rootId?: string, mode?: 'ancestors' | 'descendants'): Promise<TreeNodeDatum[]>
    pedigree(rootId?: string, rootFamilyId?: string): Promise<PedigreeCouple | null>
    /** A single union's couple node (both spouses' ancestors) — in-place spouse switch. */
    unionCouple(familyId: string): Promise<PedigreeCouple | null>
    /** A person's own union + descendants downward — inline collateral expansion.
     *  `familyId` picks which union to descend (default: first) so a switched
     *  spouse shows that marriage's children. */
    personDescendants(personId: string, familyId?: string): Promise<PedigreeCouple | null>
    /** Per-person flags for unusual marriages (consanguinity / step-sibling). */
    kinship(): Promise<Record<string, KinshipFlag[]>>
    /** Saves a print-ready family tree (vector SVG or single/tiled PDF). */
    exportImage(payload: TreeExportPayload): Promise<TreeExportResult | null>
  }
  map: {
    markers(): Promise<MapMarker[]>
  }
  atlas: {
    /** Every geocoded life event (vitals, marriages, residences, other facts). */
    points(): Promise<AtlasPoint[]>
  }
  apiServer: {
    getConfig(): Promise<ApiServerConfig>
    setConfig(patch: Partial<Omit<ApiServerConfig, 'token'>>): Promise<ApiServerConfig>
    regenerateToken(): Promise<string>
    status(): Promise<ApiServerStatus>
    /** Fires when an external API/MCP client changed the data — refresh. */
    onExternalChange(cb: () => void): () => void
  }
  wiki: {
    /** Historical events near a place + era (Wikidata, Hungarian labels). */
    eventsNear(lat: number, lon: number, fromYear: number, toYear: number, lang?: string): Promise<HistEvent[]>
  }
  media: {
    /** Download every remote-URL photo into local storage (background). */
    downloadRemote(): Promise<MediaDownloadProgress>
    /** Subscribe to live download progress. Returns an unsubscribe function. */
    onDownloadProgress(callback: (p: MediaDownloadProgress) => void): () => void
  }
  sanity: {
    check(): Promise<SanityIssue[]>
    /** Hide an anomaly permanently (false positive). `key` comes from the issue. */
    dismiss(key: string): Promise<void>
  }
  relationship: {
    /** Shortest kinship path between two people (null if unrelated). */
    find(fromId: string, toId: string): Promise<RelationshipPath | null>
  }
  query: {
    run(query: PersonQuery): Promise<Person[]>
    listSaved(): Promise<SavedQuery[]>
    save(name: string, query: PersonQuery): Promise<SavedQuery[]>
    remove(id: string): Promise<SavedQuery[]>
  }
  backup: {
    create(): Promise<{ path: string } | null>
    restore(): Promise<boolean>
  }
  gedcom: {
    import(): Promise<GedcomImportResult | null>
    importContent(text: string): Promise<GedcomImportResult>
    export(personIds?: string[], defaultName?: string): Promise<{ path: string } | null>
  }
  data: {
    /** Full JSON snapshot of the active tree (all tables). */
    exportJson(): Promise<{ path: string } | null>
    /** Raw SQLite database file copy (consistent, re-openable). */
    exportDatabase(): Promise<{ path: string } | null>
  }
  familysearch: {
    /** True if a FamilySearch AppKey (client_id) is configured in this build. */
    configured(): Promise<boolean>
    /** Opens FamilySearch's own sign-in page in the system browser (RFC 8252
     *  loopback flow; the app never sees the password) and caches the token. */
    login(lang?: string): Promise<{ ok: boolean; error?: string }>
    /** True while a valid OAuth session is cached. */
    signedIn(): Promise<boolean>
    /** Forget the cached OAuth session. */
    signOut(): Promise<void>
    import(options: FamilySearchImportOptions): Promise<GedcomImportResult>
    /** Searches FamilySearch for people so the user can pick a starting person. */
    search(options: { query: string }): Promise<FamilySearchPersonResult[]>
    /** Confirms a starting person + estimates how many ancestors would download. */
    preview(options: { root?: string; ascend?: number }): Promise<FamilySearchPreview>
    /** Refreshes ONE person from FamilySearch (FS wins). Returns
     *  `{ needCreds: true }` if not signed in so the UI can prompt sign-in. */
    syncPerson(
      fid: string
    ): Promise<
      | {
          found: boolean
          updated: number
          addedRelatives?: { fid: string; name: string; kind: string }[]
        }
      | { needCreds: true }
    >
    /** List the trees the user can import from (shared Family Tree + personal
     *  genealogies trees). */
    listTrees(): Promise<{ id: string; name: string; kind: 'global' | 'user' }[]>
    /** Verify a FamilySearch person id before import (exists? who is it?). */
    lookupPerson(fid: string, treeId?: string): Promise<{ found: boolean; name?: string; lifespan?: string; gender?: string }>
    /** Normalize a free-text date via the FamilySearch Date authority in the
     *  given UI language; null when not signed in or unparseable. */
    normalizeDate(text: string, lang: string): Promise<string | null>
    /** Full one-person sync preview: field diffs, NEW relatives found on
     *  FamilySearch (spouse/child/parent/godparent) and content counts
     *  (notes/sources/photos/occupations, local vs remote). */
    syncPreview(personId: string): Promise<
      | {
          fields: { field: string; local: string | null; remote: string | null }[]
          newRelatives: { fid: string; name: string; kind: 'spouse' | 'child' | 'parent' | 'godparent' }[]
          content: Record<'notes' | 'sources' | 'media' | 'occupations' | 'events', { local: number; remote: number }>
        }
      | { error: string }
    >
    /** Last-used import settings (to pre-fill the dialog for an easy re-import). */
    getSettings(): Promise<FamilySearchSavedSettings | null>
    /** Subscribe to live import progress. Returns an unsubscribe function. */
    onStatus(callback: (status: FamilySearchStatus) => void): () => void
    /** Subscribe to live streamed nodes (people/families) during import. */
    onNode(callback: (event: FsImportNodeEvent) => void): () => void
    /** Fires once during the main import the moment the chosen starting person has
     *  been ingested, carrying their new local id, so the app can select them as
     *  the root (top-bar starting person) live — without waiting for the import. */
    onRootSet(callback: (personId: string) => void): () => void
    /** Stop a running import early (cleanup of empty stubs still runs). */
    cancel(): Promise<void>
    /** True if a previous import was interrupted (app killed mid-run). */
    pending(): Promise<boolean>
  }
  db: {
    /** Wipes ALL data and relaunches the app. */
    wipe(): Promise<void>
    /** Removes empty/nameless stub entities; returns how many people were removed. */
    cleanup(): Promise<number>
    /** Thorough cleanup of fully-empty people (incl. empty child placeholders). */
    removeEmpty(): Promise<number>
  }
  settings: {
    /** The stored default root person id (set by FamilySearch import). */
    getDefaultRoot(): Promise<string | null>
    setDefaultRoot(personId: string | null): Promise<void>
  }
  geo: {
    /** Nominatim place autocomplete. */
    search(query: string): Promise<GeoResult[]>
    /** Persist a chosen place + coordinates into the gazetteer. */
    savePlace(place: GeoResult): Promise<void>
    /** Geocode every distinct place in the DB (background, rate-limited). */
    geocodeAll(): Promise<{ total: number; geocoded: number }>
    /** Live progress of geocodeAll. Returns an unsubscribe function. */
    onGeocodeProgress(callback: (p: { done: number; total: number; found: number }) => void): () => void
    /** Rewrite every place to its canonical form (dedups variants, stores coords).
     *  `onlyNew` (post-import) skips places already in the gazetteer for speed. */
    standardizeAll(onlyNew?: boolean): Promise<{ places: number; canonicalised: number; recordsUpdated: number }>
    /** Live progress of standardizeAll. Returns an unsubscribe function. */
    onStandardizeProgress(callback: (p: { done: number; total: number; changed: number }) => void): () => void
  }
  app: {
    /** Open an external http(s) URL in the default browser. */
    openExternal(url: string): Promise<void>
    /** Open the bundled user-manual PDF in the OS viewer. Resolves false if missing. */
    openManual(): Promise<boolean>
    /** Tell the main process the current UI language (drives geocoding output). */
    setLanguage(lang: string): Promise<void>
  }
  updates: {
    /** The running app version (fast, no network). */
    version(): Promise<string>
    /** Check GitHub for the latest release and compare to the running version. */
    check(): Promise<UpdateInfo>
    /** Open the latest installer (or release page) in the browser to update. */
    download(): Promise<void>
    /** Full published release history (newest first) for the changelog view. */
    history(): Promise<ReleaseEntry[]>
  }
  workspaces: {
    /** All family trees ("mandants"). */
    list(): Promise<Workspace[]>
    /** The currently active workspace. */
    active(): Promise<Workspace>
    /** Creates a new tree, switches to it and relaunches the app. */
    create(name: string): Promise<void>
    /** Switches the active tree and relaunches the app. */
    switch(id: string): Promise<void>
    /** Renames a tree (no relaunch). */
    rename(id: string, name: string): Promise<void>
    /** Removes a tree from the registry (db file kept). Relaunches if it was active. */
    remove(id: string): Promise<void>
  }
  audit: {
    /** A filtered, keyset-paged page of the change history (newest first). */
    query(filter?: AuditFilter): Promise<AuditPage>
    /** What undoing an entry would affect (later edits, cascades, missing refs). */
    impact(seq: number): Promise<AuditImpact>
    /** Undo a single change. Returns ok:false with a reason if it can't be applied. */
    revert(seq: number): Promise<{ ok: boolean; error?: string }>
  }
  dashboard: {
    /** Render a pre-composed HTML report to a multi-page PDF and save it. */
    exportPdf(html: string, defaultName: string): Promise<{ path: string } | null>
  }
  duplicates: {
    /** Scan the tree for likely-duplicate people (blocked + scored). */
    scan(): Promise<DuplicateCandidate[]>
    /** Merge the victim into the survivor; reversible via `audit.revert(auditSeq)`. */
    merge(survivorId: string, victimId: string, resolution: MergeResolution): Promise<MergeResult>
    /** Mark a pair as "not a duplicate" so it stops being suggested. */
    dismiss(aId: string, bId: string): Promise<void>
  }
  names: {
    /** Surname spelling/accent variant groups that could be unified. */
    surnameVariants(): Promise<NameGroup[]>
    /** Rewrite the given surname variants to `canonical`; returns people changed. */
    normalizeSurname(variants: string[], canonical: string): Promise<number>
    /** Given-name spelling/accent variant groups that could be unified. */
    givenNameVariants(): Promise<NameGroup[]>
    /** Rewrite the given first-name variants to `canonical`; returns people changed. */
    normalizeGivenName(variants: string[], canonical: string): Promise<number>
  }
  supportInvite: {
    /** True once the one-time support invitation has been seen (never again). */
    status(): Promise<boolean>
    /** Record that the support invitation was seen — never shown again. */
    markSeen(): Promise<void>
  }
  fsAnnounce: {
    /** True once the one-time FamilySearch-API notice has been seen. */
    status(): Promise<boolean>
    /** Record that the FamilySearch-API notice was seen — never shown again. */
    markSeen(): Promise<void>
  }
}
