import { createHash } from 'crypto'

/**
 * Stable, content-derived document id for a media URL. Used by BOTH the GEDCOM
 * importer and the FamilySearch streaming importer so the same image URL always
 * maps to the SAME document — no duplicates within or across import paths, even
 * after the file has been downloaded and its path localized.
 */
export function mediaDocId(url: string): string {
  return 'gm_' + createHash('sha1').update(url).digest('hex')
}
