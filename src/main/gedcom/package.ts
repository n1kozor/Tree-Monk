import AdmZip from 'adm-zip'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { exportGedcom, type GedcomExportOptions } from './export'
import { importGedcomFile } from './import'
import type { GedcomImportResult } from '@shared/types'

/**
 * GEDCOM *package*: one .zip holding the .ged plus its `media/` folder. A plain
 * export already writes the pictures next to the .ged, but that sibling folder
 * is easy to leave behind when the file travels to another machine — the zip
 * keeps them together the way Family Historian / FTM users expect.
 */
export function exportGedcomPackage(
  zipPath: string,
  personIds?: string[],
  opts: GedcomExportOptions = {}
): { mediaCount: number } {
  const tmp = mkdtempSync(join(tmpdir(), 'treemonk-gedzip-'))
  try {
    const gedName = `${basename(zipPath).replace(/\.zip$/i, '') || 'treemonk-export'}.ged`
    const { mediaCount } = exportGedcom(join(tmp, gedName), personIds, opts)
    const zip = new AdmZip()
    zip.addLocalFolder(tmp)
    zip.writeZip(zipPath)
    return { mediaCount }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

export function isGedcomPackage(filePath: string): boolean {
  return /\.zip$/i.test(filePath)
}

/**
 * Imports a GEDCOM package (.zip): extracts it, imports the first .ged found
 * (shallowest wins) with the extracted folder as the media base, so relative
 * `media/…` references resolve exactly as they do for a loose .ged file.
 * Returns null when the archive holds no GEDCOM at all.
 */
export function importGedcomPackage(zipPath: string): GedcomImportResult | null {
  const tmp = mkdtempSync(join(tmpdir(), 'treemonk-gedzip-'))
  try {
    new AdmZip(zipPath).extractAllTo(tmp, /* overwrite */ true)
    const ged = findGedcom(tmp)
    return ged ? importGedcomFile(ged) : null
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** Breadth-first search for a .ged/.gedcom file under `dir`. */
function findGedcom(dir: string): string | null {
  const queue = [dir]
  while (queue.length) {
    const d = queue.shift()!
    const entries = readdirSync(d)
    const hit = entries.find((n) => /\.(ged|gedcom)$/i.test(n) && statSync(join(d, n)).isFile())
    if (hit) return join(d, hit)
    for (const n of entries) {
      const p = join(d, n)
      if (statSync(p).isDirectory() && n !== '__MACOSX') queue.push(p)
    }
  }
  return null
}
