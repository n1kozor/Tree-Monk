import { app } from 'electron'
import { basename, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import type { Workspace } from '@shared/types'

/**
 * A "workspace" (the user calls it a *mandant*) is an isolated family tree:
 * its own SQLite database file. Switching the active workspace simply makes
 * `getDb()` open a different file — so people, families, boards, sources etc.
 * are completely separated with NO per-row scoping needed.
 *
 * The registry (which workspaces exist + which one is active) lives in a small
 * JSON file alongside the databases.
 */
export type { Workspace }

interface Registry {
  active: string
  workspaces: Workspace[]
}

const COLORS = [
  '#6366f1',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6'
]

function rootDir(): string {
  const d = join(app.getPath('userData'), 'data')
  mkdirSync(d, { recursive: true })
  return d
}

function treesDir(): string {
  const d = join(rootDir(), 'trees')
  mkdirSync(d, { recursive: true })
  return d
}

function registryPath(): string {
  return join(rootDir(), 'workspaces.json')
}

let cache: Registry | null = null
// True when THIS run created the registry from nothing (fresh install, or the
// user wiped/moved the data folder). The renderer resets its first-launch
// choices then — otherwise a stale localStorage flag suppressed the start
// chooser on a brand-new profile.
let bootstrappedFresh = false

export function wasFreshBootstrap(): boolean {
  return bootstrappedFresh
}

/** Default name for the very first tree, in the OS language. */
function defaultTreeName(): string {
  const loc = (app.getLocale() || 'en').toLowerCase()
  if (loc.startsWith('hu')) return 'Családfa'
  if (loc.startsWith('de')) return 'Stammbaum'
  if (loc.startsWith('fr')) return 'Arbre généalogique'
  return 'Family Tree'
}

function persist(): void {
  if (cache) writeFileSync(registryPath(), JSON.stringify(cache, null, 2), 'utf-8')
}

function load(): Registry {
  if (cache) return cache
  const p = registryPath()
  if (existsSync(p)) {
    try {
      cache = JSON.parse(readFileSync(p, 'utf-8')) as Registry
    } catch {
      cache = null
    }
  }
  if (!cache || !Array.isArray(cache.workspaces) || cache.workspaces.length === 0) {
    // Bootstrap: adopt the legacy single database (treemonk.db) as the first
    // workspace, so existing users keep all their data seamlessly.
    const first: Workspace = {
      id: randomUUID(),
      name: defaultTreeName(),
      file: join(rootDir(), 'treemonk.db'),
      color: COLORS[0],
      createdAt: new Date().toISOString()
    }
    cache = { active: first.id, workspaces: [first] }
    bootstrappedFresh = true
    persist()
  }
  if (!cache.workspaces.find((w) => w.id === cache!.active)) {
    cache.active = cache.workspaces[0].id
  }
  healPaths(cache)
  return cache
}

/**
 * Workspace entries store ABSOLUTE database paths, so a backup restored on
 * another machine (different Windows username or drive) points at folders
 * that don't exist there — the app then died on launch with "Cannot open
 * database because the directory does not exist" even though every file was
 * restored fine. If a recorded file is missing but a database with the same
 * name sits in the current data folder, point the entry there. Entries whose
 * path resolves are never touched, and a file that is genuinely absent
 * everywhere is left alone (a fresh install's not-yet-created treemonk.db
 * must keep its local path so getDb() can create it).
 */
function healPaths(r: Registry): void {
  let healed = false
  for (const w of r.workspaces) {
    if (!w.file || existsSync(w.file)) continue
    const name = basename(w.file)
    const local = [join(treesDir(), name), join(rootDir(), name)].find((p) => existsSync(p))
    if (local && local !== w.file) {
      w.file = local
      healed = true
    }
  }
  if (healed) persist()
}

/** Detect what a tree is by looking INTO its database: any person carrying a
 *  FamilySearch id makes it an FS tree. Opened read-only on its own connection
 *  (this may be a non-active workspace's file). */
function detectKind(file: string): 'fs' | 'manual' | undefined {
  if (!file || !existsSync(file)) return undefined
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true })
    try {
      const row = db.prepare("SELECT 1 AS x FROM people WHERE coalesce(fs_id,'') != '' LIMIT 1").get()
      return row ? 'fs' : 'manual'
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

export function listWorkspaces(): Workspace[] {
  const r = load()
  // Backfill the kind for entries that don't have one yet (older registries) —
  // probed once, then persisted, so the list stays cheap.
  let changed = false
  for (const w of r.workspaces) {
    if (w.kind) continue
    const k = detectKind(w.file)
    if (k) {
      w.kind = k
      changed = true
    }
  }
  if (changed) persist()
  return r.workspaces
}

/** Mark the ACTIVE workspace's kind (called by the importers: an FS import
 *  makes the tree an FS tree; a GEDCOM import marks a so-far-unknown tree
 *  manual — it never downgrades an FS tree). */
export function markActiveWorkspaceKind(kind: 'fs' | 'manual'): void {
  const r = load()
  const w = r.workspaces.find((x) => x.id === r.active)
  if (!w) return
  if (kind === 'manual' && w.kind === 'fs') return
  if (w.kind !== kind) {
    w.kind = kind
    persist()
  }
}

export function activeWorkspace(): Workspace {
  const r = load()
  return r.workspaces.find((w) => w.id === r.active) ?? r.workspaces[0]
}

/** The database file the active workspace points to — used by `getDb()`. */
export function activeDbFile(): string {
  return activeWorkspace().file
}

export function createWorkspace(name: string): Workspace {
  const r = load()
  const id = randomUUID()
  const ws: Workspace = {
    id,
    name: name.trim() || 'Névtelen',
    file: join(treesDir(), `${id}.db`),
    color: COLORS[r.workspaces.length % COLORS.length],
    createdAt: new Date().toISOString()
  }
  r.workspaces.push(ws)
  persist()
  return ws
}

export function setActiveWorkspace(id: string): void {
  const r = load()
  if (r.workspaces.find((w) => w.id === id)) {
    r.active = id
    persist()
  }
}

export function renameWorkspace(id: string, name: string): void {
  const r = load()
  const w = r.workspaces.find((w) => w.id === id)
  if (w) {
    w.name = name.trim() || w.name
    persist()
  }
}

/**
 * Removes a workspace from the registry. The last workspace can never be
 * deleted. The database FILE is left on disk to avoid irreversible data loss.
 * Returns true if the active workspace changed (caller should relaunch).
 */
export function removeWorkspace(id: string): boolean {
  const r = load()
  if (r.workspaces.length <= 1) return false
  const wasActive = r.active === id
  r.workspaces = r.workspaces.filter((w) => w.id !== id)
  if (wasActive) r.active = r.workspaces[0].id
  persist()
  return wasActive
}
