import { contextBridge, ipcRenderer } from 'electron'
import { Channels, type TreeMonkApi } from '@shared/ipc'

const api: TreeMonkApi = {
  people: {
    list: () => ipcRenderer.invoke(Channels.people.list),
    get: (id) => ipcRenderer.invoke(Channels.people.get, id),
    create: (input) => ipcRenderer.invoke(Channels.people.create, input),
    update: (id, input) => ipcRenderer.invoke(Channels.people.update, id, input),
    remove: (id) => ipcRenderer.invoke(Channels.people.remove, id),
    restore: (snap) => ipcRenderer.invoke(Channels.people.restore, snap),
    setAvatar: (id) => ipcRenderer.invoke(Channels.people.setAvatar, id)
  },
  families: {
    list: () => ipcRenderer.invoke(Channels.families.list),
    create: (input) => ipcRenderer.invoke(Channels.families.create, input),
    update: (id, input) => ipcRenderer.invoke(Channels.families.update, id, input),
    remove: (id) => ipcRenderer.invoke(Channels.families.remove, id)
  },
  documents: {
    list: () => ipcRenderer.invoke(Channels.documents.list),
    listForPerson: (pid) => ipcRenderer.invoke(Channels.documents.listForPerson, pid),
    import: (personId) => ipcRenderer.invoke(Channels.documents.import, personId),
    importPaths: (paths, personId) =>
      ipcRenderer.invoke(Channels.documents.importPaths, paths, personId),
    importDataUrl: (dataUrl, personId) =>
      ipcRenderer.invoke(Channels.documents.importDataUrl, dataUrl, personId),
    createLink: (url, title, personId) =>
      ipcRenderer.invoke(Channels.documents.createLink, url, title, personId),
    update: (id, input) => ipcRenderer.invoke(Channels.documents.update, id, input),
    remove: (id) => ipcRenderer.invoke(Channels.documents.remove, id),
    restore: (snap) => ipcRenderer.invoke(Channels.documents.restore, snap),
    attach: (docId, pid) => ipcRenderer.invoke(Channels.documents.attach, docId, pid),
    detach: (docId, pid) => ipcRenderer.invoke(Channels.documents.detach, docId, pid),
    dataUrl: (id) => ipcRenderer.invoke(Channels.documents.dataUrl, id),
    open: (id) => ipcRenderer.invoke(Channels.documents.open, id)
  },
  board: {
    get: (boardId) => ipcRenderer.invoke(Channels.board.get, boardId),
    saveNode: (node) => ipcRenderer.invoke(Channels.board.saveNode, node),
    saveNodes: (nodes) => ipcRenderer.invoke(Channels.board.saveNodes, nodes),
    removeNode: (id) => ipcRenderer.invoke(Channels.board.removeNode, id),
    saveEdge: (edge) => ipcRenderer.invoke(Channels.board.saveEdge, edge),
    removeEdge: (id) => ipcRenderer.invoke(Channels.board.removeEdge, id)
  },
  boards: {
    list: () => ipcRenderer.invoke(Channels.boards.list),
    create: (name) => ipcRenderer.invoke(Channels.boards.create, name),
    rename: (id, name) => ipcRenderer.invoke(Channels.boards.rename, id, name),
    remove: (id) => ipcRenderer.invoke(Channels.boards.remove, id),
    duplicate: (id, name) => ipcRenderer.invoke(Channels.boards.duplicate, id, name)
  },
  research: {
    citationsForPerson: (pid) => ipcRenderer.invoke(Channels.research.citationsForPerson, pid),
    addCitation: (pid, edit) => ipcRenderer.invoke(Channels.research.addCitation, pid, edit),
    attachSourceToPerson: (sourceId, pid, eventTag) =>
      ipcRenderer.invoke(Channels.research.attachSourceToPerson, sourceId, pid, eventTag),
    peopleForSource: (sourceId) => ipcRenderer.invoke(Channels.research.peopleForSource, sourceId),
    detachSourceFromPerson: (sourceId, pid) =>
      ipcRenderer.invoke(Channels.research.detachSourceFromPerson, sourceId, pid),
    updateCitation: (id, edit) => ipcRenderer.invoke(Channels.research.updateCitation, id, edit),
    deleteCitation: (id) => ipcRenderer.invoke(Channels.research.deleteCitation, id),
    notesForPerson: (pid) => ipcRenderer.invoke(Channels.research.notesForPerson, pid),
    logsForPerson: (pid) => ipcRenderer.invoke(Channels.research.logsForPerson, pid),
    allLogs: () => ipcRenderer.invoke(Channels.research.allLogs),
    createLog: (input) => ipcRenderer.invoke(Channels.research.createLog, input),
    updateLog: (id, input) => ipcRenderer.invoke(Channels.research.updateLog, id, input),
    removeLog: (id) => ipcRenderer.invoke(Channels.research.removeLog, id)
  },
  aliases: {
    listForPerson: (pid) => ipcRenderer.invoke(Channels.aliases.listForPerson, pid),
    all: () => ipcRenderer.invoke(Channels.aliases.all),
    create: (pid, input) => ipcRenderer.invoke(Channels.aliases.create, pid, input),
    remove: (id) => ipcRenderer.invoke(Channels.aliases.remove, id)
  },
  occupations: {
    listForPerson: (pid) => ipcRenderer.invoke(Channels.occupations.listForPerson, pid),
    all: () => ipcRenderer.invoke(Channels.occupations.all),
    create: (pid, input) => ipcRenderer.invoke(Channels.occupations.create, pid, input),
    update: (id, input) => ipcRenderer.invoke(Channels.occupations.update, id, input),
    remove: (id) => ipcRenderer.invoke(Channels.occupations.remove, id),
    reorder: (ids) => ipcRenderer.invoke(Channels.occupations.reorder, ids)
  },
  collaborations: {
    listForPerson: (pid) => ipcRenderer.invoke(Channels.collaborations.listForPerson, pid)
  },
  godparents: {
    listForPerson: (pid) => ipcRenderer.invoke(Channels.godparents.listForPerson, pid),
    godchildren: (pid) => ipcRenderer.invoke(Channels.godparents.godchildren, pid),
    add: (pid, gid) => ipcRenderer.invoke(Channels.godparents.add, pid, gid),
    remove: (pid, gid) => ipcRenderer.invoke(Channels.godparents.remove, pid, gid)
  },
  events: {
    forPerson: (pid) => ipcRenderer.invoke(Channels.events.forPerson, pid),
    create: (pid, input) => ipcRenderer.invoke(Channels.events.create, pid, input),
    update: (id, input) => ipcRenderer.invoke(Channels.events.update, id, input),
    remove: (id) => ipcRenderer.invoke(Channels.events.remove, id),
    reorder: (ids) => ipcRenderer.invoke(Channels.events.reorder, ids)
  },
  tree: {
    build: (rootId, mode) => ipcRenderer.invoke(Channels.tree.build, rootId, mode),
    pedigree: (rootId, rootFamilyId) =>
      ipcRenderer.invoke(Channels.tree.pedigree, rootId, rootFamilyId),
    unionCouple: (familyId) => ipcRenderer.invoke(Channels.tree.unionCouple, familyId),
    personDescendants: (personId, familyId) =>
      ipcRenderer.invoke(Channels.tree.personDescendants, personId, familyId),
    kinship: () => ipcRenderer.invoke(Channels.tree.kinship),
    exportImage: (payload) => ipcRenderer.invoke(Channels.tree.exportImage, payload)
  },
  map: {
    markers: () => ipcRenderer.invoke(Channels.map.markers)
  },
  atlas: {
    points: () => ipcRenderer.invoke(Channels.atlas.points)
  },
  apiServer: {
    getConfig: () => ipcRenderer.invoke(Channels.apiServer.getConfig),
    setConfig: (patch) => ipcRenderer.invoke(Channels.apiServer.setConfig, patch),
    regenerateToken: () => ipcRenderer.invoke(Channels.apiServer.regenerateToken),
    status: () => ipcRenderer.invoke(Channels.apiServer.status),
    onExternalChange: (cb) => {
      const h = (): void => cb()
      ipcRenderer.on(Channels.apiServer.onExternalChange, h)
      return () => ipcRenderer.removeListener(Channels.apiServer.onExternalChange, h)
    }
  },
  plugins: {
    list: () => ipcRenderer.invoke(Channels.plugins.list),
    install: (filePath) => ipcRenderer.invoke(Channels.plugins.install, filePath),
    remove: (id) => ipcRenderer.invoke(Channels.plugins.remove, id),
    setEnabled: (id, enabled) => ipcRenderer.invoke(Channels.plugins.setEnabled, id, enabled),
    panel: (pluginId, menuId) => ipcRenderer.invoke(Channels.plugins.panel, pluginId, menuId)
  },
  wiki: {
    eventsNear: (lat, lon, fromYear, toYear, lang) =>
      ipcRenderer.invoke(Channels.wiki.eventsNear, lat, lon, fromYear, toYear, lang)
  },
  media: {
    downloadRemote: () => ipcRenderer.invoke(Channels.media.downloadRemote),
    onDownloadProgress: (callback) => {
      const listener = (_e: unknown, p: Parameters<typeof callback>[0]): void => callback(p)
      ipcRenderer.on(Channels.media.downloadProgress, listener)
      return () => ipcRenderer.removeListener(Channels.media.downloadProgress, listener)
    }
  },
  sanity: {
    check: () => ipcRenderer.invoke(Channels.sanity.check),
    dismiss: (key) => ipcRenderer.invoke(Channels.sanity.dismiss, key)
  },
  relationship: {
    find: (fromId, toId) => ipcRenderer.invoke(Channels.relationship.find, fromId, toId)
  },
  query: {
    run: (q) => ipcRenderer.invoke(Channels.query.run, q),
    listSaved: () => ipcRenderer.invoke(Channels.query.listSaved),
    save: (name, query) => ipcRenderer.invoke(Channels.query.save, name, query),
    remove: (id) => ipcRenderer.invoke(Channels.query.remove, id)
  },
  backup: {
    create: () => ipcRenderer.invoke(Channels.backup.create),
    restore: () => ipcRenderer.invoke(Channels.backup.restore)
  },
  gedcom: {
    import: () => ipcRenderer.invoke(Channels.gedcom.import),
    importContent: (text) => ipcRenderer.invoke(Channels.gedcom.importContent, text),
    export: (personIds, defaultName) =>
      ipcRenderer.invoke(Channels.gedcom.export, personIds, defaultName)
  },
  data: {
    exportJson: () => ipcRenderer.invoke(Channels.data.exportJson),
    exportDatabase: () => ipcRenderer.invoke(Channels.data.exportDatabase)
  },
  familysearch: {
    login: (lang) => ipcRenderer.invoke(Channels.familysearch.login, lang),
    configured: () => ipcRenderer.invoke(Channels.familysearch.configured),
    signedIn: () => ipcRenderer.invoke(Channels.familysearch.signedIn),
    signOut: () => ipcRenderer.invoke(Channels.familysearch.signOut),
    syncPreview: (personId) => ipcRenderer.invoke(Channels.familysearch.syncPreview, personId),
    listTrees: () => ipcRenderer.invoke(Channels.familysearch.listTrees),
    lookupPerson: (fid, treeId) => ipcRenderer.invoke(Channels.familysearch.lookupPerson, fid, treeId),
    normalizeDate: (text, lang) => ipcRenderer.invoke(Channels.familysearch.normalizeDate, text, lang),
    import: (options) => ipcRenderer.invoke(Channels.familysearch.import, options),
    search: (options) => ipcRenderer.invoke(Channels.familysearch.search, options),
    preview: (options) => ipcRenderer.invoke(Channels.familysearch.preview, options),
    syncPerson: (fid) => ipcRenderer.invoke(Channels.familysearch.syncPerson, fid),
    getSettings: () => ipcRenderer.invoke(Channels.familysearch.getSettings),
    onStatus: (callback) => {
      const listener = (_e: unknown, status: Parameters<typeof callback>[0]): void => callback(status)
      ipcRenderer.on(Channels.familysearch.status, listener)
      return () => ipcRenderer.removeListener(Channels.familysearch.status, listener)
    },
    onNode: (callback) => {
      const listener = (_e: unknown, event: Parameters<typeof callback>[0]): void => callback(event)
      ipcRenderer.on(Channels.familysearch.nodeAdded, listener)
      return () => ipcRenderer.removeListener(Channels.familysearch.nodeAdded, listener)
    },
    onRootSet: (callback) => {
      const listener = (_e: unknown, personId: string): void => callback(personId)
      ipcRenderer.on(Channels.familysearch.rootSet, listener)
      return () => ipcRenderer.removeListener(Channels.familysearch.rootSet, listener)
    },
    cancel: () => ipcRenderer.invoke(Channels.familysearch.cancel),
    pending: () => ipcRenderer.invoke(Channels.familysearch.pending)
  },
  db: {
    wipe: () => ipcRenderer.invoke(Channels.db.wipe),
    cleanup: () => ipcRenderer.invoke(Channels.db.cleanup),
    removeEmpty: () => ipcRenderer.invoke(Channels.db.removeEmpty)
  },
  settings: {
    getDefaultRoot: () => ipcRenderer.invoke(Channels.settings.getDefaultRoot),
    setDefaultRoot: (id) => ipcRenderer.invoke(Channels.settings.setDefaultRoot, id)
  },
  geo: {
    search: (query) => ipcRenderer.invoke(Channels.geo.search, query),
    savePlace: (place) => ipcRenderer.invoke(Channels.geo.savePlace, place),
    geocodeAll: () => ipcRenderer.invoke(Channels.geo.geocodeAll),
    onGeocodeProgress: (callback) => {
      const listener = (_e: unknown, p: Parameters<typeof callback>[0]): void => callback(p)
      ipcRenderer.on(Channels.geo.geocodeProgress, listener)
      return () => ipcRenderer.removeListener(Channels.geo.geocodeProgress, listener)
    },
    standardizeAll: (onlyNew) => ipcRenderer.invoke(Channels.geo.standardizeAll, onlyNew),
    onStandardizeProgress: (callback) => {
      const listener = (_e: unknown, p: Parameters<typeof callback>[0]): void => callback(p)
      ipcRenderer.on(Channels.geo.standardizeProgress, listener)
      return () => ipcRenderer.removeListener(Channels.geo.standardizeProgress, listener)
    }
  },
  app: {
    setLanguage: (lang) => ipcRenderer.invoke(Channels.app.setLanguage, lang),
    openExternal: (url) => ipcRenderer.invoke(Channels.app.openExternal, url),
    openManual: () => ipcRenderer.invoke(Channels.app.openManual)
  },
  updates: {
    version: () => ipcRenderer.invoke(Channels.updates.version),
    check: () => ipcRenderer.invoke(Channels.updates.check),
    download: () => ipcRenderer.invoke(Channels.updates.download),
    history: () => ipcRenderer.invoke(Channels.updates.history)
  },
  workspaces: {
    list: () => ipcRenderer.invoke(Channels.workspaces.list),
    active: () => ipcRenderer.invoke(Channels.workspaces.active),
    create: (name) => ipcRenderer.invoke(Channels.workspaces.create, name),
    switch: (id) => ipcRenderer.invoke(Channels.workspaces.switch, id),
    rename: (id, name) => ipcRenderer.invoke(Channels.workspaces.rename, id, name),
    remove: (id) => ipcRenderer.invoke(Channels.workspaces.remove, id)
  },
  audit: {
    query: (filter) => ipcRenderer.invoke(Channels.audit.query, filter),
    impact: (seq) => ipcRenderer.invoke(Channels.audit.impact, seq),
    revert: (seq) => ipcRenderer.invoke(Channels.audit.revert, seq)
  },
  dashboard: {
    exportPdf: (html, defaultName) => ipcRenderer.invoke(Channels.dashboard.exportPdf, html, defaultName)
  },
  duplicates: {
    scan: () => ipcRenderer.invoke(Channels.duplicates.scan),
    merge: (survivorId, victimId, resolution) =>
      ipcRenderer.invoke(Channels.duplicates.merge, survivorId, victimId, resolution),
    dismiss: (aId, bId) => ipcRenderer.invoke(Channels.duplicates.dismiss, aId, bId)
  },
  names: {
    surnameVariants: () => ipcRenderer.invoke(Channels.names.surnameVariants),
    normalizeSurname: (variants, canonical) =>
      ipcRenderer.invoke(Channels.names.normalizeSurname, variants, canonical),
    givenNameVariants: () => ipcRenderer.invoke(Channels.names.givenNameVariants),
    normalizeGivenName: (variants, canonical) =>
      ipcRenderer.invoke(Channels.names.normalizeGivenName, variants, canonical)
  },
  supportInvite: {
    status: () => ipcRenderer.invoke(Channels.supportInvite.status),
    markSeen: () => ipcRenderer.invoke(Channels.supportInvite.markSeen)
  },
  fsAnnounce: {
    status: () => ipcRenderer.invoke(Channels.fsAnnounce.status),
    markSeen: () => ipcRenderer.invoke(Channels.fsAnnounce.markSeen)
  }
}

contextBridge.exposeInMainWorld('api', api)
