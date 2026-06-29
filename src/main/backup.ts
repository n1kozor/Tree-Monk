import { app, dialog, BrowserWindow } from 'electron'
import AdmZip from 'adm-zip'
import { existsSync } from 'fs'
import { join } from 'path'
import { closeDb, dataDir, getDb } from './db/connection'

/** Zips the database + media folder into a .zip the user chooses. */
export async function createBackup(win: BrowserWindow | null): Promise<{ path: string } | null> {
  const stamp = new Date().toISOString().slice(0, 10)
  const res = await dialog.showSaveDialog(win ?? undefined!, {
    title: 'Backup TreeMonk',
    defaultPath: `treemonk-backup-${stamp}.zip`,
    filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    // Linux/GTK does not confirm overwrites unless asked explicitly.
    properties: ['showOverwriteConfirmation', 'createDirectory']
  })
  if (res.canceled || !res.filePath) return null

  // Flush the WAL into the main .db so the backup is consistent.
  try {
    getDb().pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* ignore */
  }

  const zip = new AdmZip()
  zip.addLocalFolder(dataDir())
  zip.writeZip(res.filePath)
  return { path: res.filePath }
}

/**
 * Restores a backup: replaces the data folder from the chosen .zip and
 * relaunches the app so everything reloads cleanly.
 */
export async function restoreBackup(win: BrowserWindow | null): Promise<boolean> {
  const res = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Restore TreeMonk backup',
    properties: ['openFile'],
    filters: [{ name: 'Zip archive', extensions: ['zip'] }]
  })
  if (res.canceled || !res.filePaths[0]) return false

  const zip = new AdmZip(res.filePaths[0])
  // Sanity: the archive must contain the database.
  const hasDb = zip.getEntries().some((e) => e.entryName.endsWith('treemonk.db'))
  if (!hasDb && !existsSync(join(dataDir(), 'treemonk.db'))) return false

  closeDb()
  zip.extractAllTo(dataDir(), /* overwrite */ true)

  app.relaunch()
  app.exit(0)
  return true
}
