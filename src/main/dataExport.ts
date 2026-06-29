import { dialog, type BrowserWindow } from 'electron'
import { writeFileSync, copyFileSync } from 'fs'
import { getDb } from './db/connection'
import { activeDbFile } from './workspaces'

const stamp = (): string => new Date().toISOString().slice(0, 10)

/**
 * Full JSON export of the active tree: every user table dumped as rows. A
 * faithful, human-readable, re-importable snapshot — no genealogy data is lost,
 * and nothing external is contacted.
 */
export async function exportJson(win: BrowserWindow | null): Promise<{ path: string } | null> {
  const res = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'Export JSON',
    defaultPath: `treemonk-${stamp()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['showOverwriteConfirmation', 'createDirectory']
  })
  if (res.canceled || !res.filePath) return null

  const db = getDb()
  const tables = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
  ).map((t) => t.name)

  // The genealogy data only — never the `settings` table (it can hold the
  // FamilySearch login) or the internal audit/change-log tables. A JSON export is
  // easy to share, so it must not carry credentials or noisy history.
  const skip = (name: string): boolean => name === 'settings' || /audit/i.test(name)

  const data: Record<string, unknown[]> = {}
  for (const t of tables) {
    if (skip(t)) continue
    data[t] = db.prepare(`SELECT * FROM "${t}"`).all()
  }

  const payload = {
    app: 'TreeMonk',
    kind: 'full-json-export',
    exportedAt: new Date().toISOString(),
    tables: data
  }
  writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf-8')
  return { path: res.filePath }
}

/**
 * Exports the raw SQLite database file (a complete, re-openable copy). The WAL is
 * checkpointed first so the copied file is fully consistent.
 */
export async function exportDatabase(win: BrowserWindow | null): Promise<{ path: string } | null> {
  const res = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'Export database file',
    defaultPath: `treemonk-${stamp()}.db`,
    filters: [{ name: 'SQLite database', extensions: ['db', 'sqlite'] }],
    properties: ['showOverwriteConfirmation', 'createDirectory']
  })
  if (res.canceled || !res.filePath) return null

  // Flush the WAL into the main .db so the copy is a consistent point-in-time.
  try {
    getDb().pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* ignore */
  }
  copyFileSync(activeDbFile(), res.filePath)
  return { path: res.filePath }
}
