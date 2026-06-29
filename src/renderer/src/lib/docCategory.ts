import type { DocumentRecord } from '@shared/types'

/** Coarse document buckets used by the filters, thumbnails and viewer routing. */
export type DocCategory = 'image' | 'pdf' | 'doc' | 'media' | 'link' | 'other'

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'avif', 'svg']
const DOC_EXTS = ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'xls', 'xlsx', 'csv', 'ods']
const MEDIA_EXTS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'mp4', 'mov', 'avi', 'mkv', 'webm']

export const ext = (s: string): string => {
  const m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(s.trim())
  return m ? m[1].toLowerCase() : ''
}

/** Buckets a document by kind / mime / extension. Photos (incl. remote
 *  FamilySearch/GEDCOM images stored as extension-less URLs with a text/uri-list
 *  mime) count as IMAGES — checked first so they open in the in-app viewer. */
export function fileCategory(doc: DocumentRecord): DocCategory {
  const mime = doc.mimeType ?? ''
  const e = ext(doc.filePath)
  if (doc.kind === 'photo' || mime.startsWith('image/') || IMAGE_EXTS.includes(e)) return 'image'
  if (/^https?:\/\//i.test(doc.filePath) || mime === 'text/uri-list') return 'link'
  if (e === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (DOC_EXTS.includes(e)) return 'doc'
  if (mime.startsWith('audio/') || mime.startsWith('video/') || MEDIA_EXTS.includes(e)) return 'media'
  return 'other'
}

/** Documents the in-app deep-zoom viewer can show: images and remote links
 *  (which for imports are usually images; the viewer falls back to the browser
 *  if a link turns out not to be an image). */
export const canView = (doc: DocumentRecord): boolean => {
  const c = fileCategory(doc)
  return c === 'image' || c === 'link'
}
