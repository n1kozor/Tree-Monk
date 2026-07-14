import { dialog, shell, BrowserWindow } from 'electron'
import { mediaAuthHeaders } from './familysearch'
import { copyFileSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { basename, extname, join } from 'path'
import { randomUUID } from 'crypto'
import { mediaDir, resolveMediaPath } from './db/connection'
import { warmThumbnails } from './mediaProtocol'
import { Documents, People } from './db/repo'
import type { DocumentKind, DocumentRecord, MediaDownloadProgress, Person } from '@shared/types'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.rtf': 'application/rtf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ged': 'application/x-gedcom'
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.svg']

function kindFromExt(ext: string): DocumentKind {
  if (IMAGE_EXTS.includes(ext)) return 'photo'
  return 'other'
}

/** Opens a file picker (ANY file type), copies chosen files into storage. */
export async function importDocuments(
  win: BrowserWindow | null,
  personId?: string
): Promise<DocumentRecord[]> {
  const result = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Import files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'All files', extensions: ['*'] }]
  })
  if (result.canceled) return []
  return result.filePaths.map((src) => copyAndRecord(src, personId))
}

/** Imports files given their absolute paths (e.g. dropped onto the board). */
export function importDocumentPaths(paths: string[], personId?: string): DocumentRecord[] {
  return paths.filter((p) => existsSync(p)).map((src) => copyAndRecord(src, personId))
}

const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg'
}

/**
 * Saves an inlined image (a `data:image/...;base64,...` URL) into media storage
 * and records it — used for clipboard paste and in-app image drops that have no
 * filesystem path. Returns null for a non-image / malformed data URL.
 */
export function importImageDataUrl(dataUrl: string, personId?: string): DocumentRecord | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const ext = EXT_FOR_MIME[mime] ?? '.png'
  const id = randomUUID()
  const dest = join(mediaDir(), `${id}${ext}`)
  writeFileSync(dest, Buffer.from(m[2], 'base64'))
  return Documents.create(
    {
      title: 'Evidence',
      kind: 'photo',
      filePath: dest,
      mimeType: mime,
      personIds: personId ? [personId] : []
    },
    id
  )
}

/** Copies one file into media storage and inserts a document row. */
export function copyAndRecord(src: string, personId?: string): DocumentRecord {
  const ext = extname(src).toLowerCase()
  const id = randomUUID()
  const dest = join(mediaDir(), `${id}${ext}`)
  copyFileSync(src, dest)
  return Documents.create({
    title: basename(src, ext),
    kind: kindFromExt(ext),
    filePath: dest,
    mimeType: MIME[ext] ?? 'application/octet-stream',
    personIds: personId ? [personId] : []
  }, id)
}

/** Opens an image picker and sets the chosen image as the person's avatar. */
export async function setPersonAvatar(
  win: BrowserWindow | null,
  personId: string
): Promise<Person | null> {
  const result = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Choose profile picture',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null
  const doc = copyAndRecord(result.filePaths[0], personId)
  // A fresh photo invalidates any previous framing → reset to centred.
  return People.update(personId, { profilePhotoId: doc.id, profilePhotoCrop: null })
}

const EXT_FROM_CT: Record<string, string> = {
  ...EXT_FOR_MIME,
  'image/tiff': '.tif',
  'image/jpg': '.jpg'
}

function extFromUrl(url: string): string | null {
  const m = /\.(jpe?g|png|gif|webp|bmp|tiff?|svg)(\?|$)/i.exec(url)
  if (!m) return null
  const e = m[1].toLowerCase()
  return '.' + (e === 'jpeg' ? 'jpg' : e)
}

/**
 * Background job: downloads every photo document that is still a remote http(s)
 * URL (e.g. imported from a GEDCOM `OBJE > FILE`) into local media storage and
 * repoints the document at the local file — so it renders inline and can serve
 * as a profile photo. Reports progress via `onProgress`. Failures (auth-gated or
 * dead URLs) are counted and skipped, leaving that document's URL untouched.
 */
export async function downloadRemoteMedia(
  onProgress?: (p: MediaDownloadProgress) => void
): Promise<MediaDownloadProgress> {
  const docs = Documents.remotePhotos()
  const prog: MediaDownloadProgress = { done: 0, total: docs.length, ok: 0, failed: 0 }
  onProgress?.({ ...prog })
  if (docs.length === 0) return prog

  // Throttle progress so a 10k-image run doesn't flood the renderer with one IPC
  // message (and re-render) per image — emit at most a few times per second.
  let lastEmit = 0
  const emit = (force = false): void => {
    const now = Date.now()
    if (force || now - lastEmit >= 300) {
      lastEmit = now
      onProgress?.({ ...prog })
    }
  }

  // A small worker pool: downloads are network-bound, so a few in flight is far
  // faster than one-at-a-time, without saturating the main thread. The shared
  // counter hands each worker the next document (JS is single-threaded, so the
  // synchronous file/DB writes never actually overlap).
  const CONCURRENCY = 6
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++
      if (i >= docs.length) return
      const doc = docs[i]
      try {
        const res = await fetch(doc.filePath, {
          headers: { 'User-Agent': 'TreeMonk', Accept: 'image/*', ...mediaAuthHeaders(doc.filePath) },
          redirect: 'follow'
        })
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer())
          const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
          const ext = EXT_FROM_CT[ct] || extFromUrl(doc.filePath) || '.jpg'
          const dest = join(mediaDir(), `${doc.id}${ext}`)
          writeFileSync(dest, buf)
          Documents.setFile(doc.id, dest, MIME[ext] || ct || 'image/jpeg', kindFromExt(ext))
          // Pre-warm the avatar-size thumbnail from the bytes we already have, so
          // the first family-tree render doesn't decode the originals on demand.
          void warmThumbnails(doc.id, dest, buf, [128])
          prog.ok++
        } else {
          prog.failed++
        }
      } catch {
        prog.failed++
      }
      prog.done++
      emit()
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, docs.length) }, worker))
  emit(true)
  return prog
}

/** Opens a stored document — an external URL in the browser, else the OS app. */
export function openDocument(documentId: string): void {
  const doc = Documents.get(documentId)
  if (!doc) return
  if (/^https?:\/\//i.test(doc.filePath)) {
    void shell.openExternal(doc.filePath)
    return
  }
  const filePath = resolveMediaPath(doc.filePath)
  if (existsSync(filePath)) void shell.openPath(filePath)
}

/** Records a web link as a source/document attached to a person. */
export function createLinkDocument(
  url: string,
  title: string,
  personId?: string
): DocumentRecord | null {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) return null
  return Documents.create({
    title: title.trim() || u,
    kind: 'other',
    filePath: u,
    mimeType: 'text/uri-list',
    personIds: personId ? [personId] : []
  })
}

/** Returns a base64 data URL for a stored document so the renderer can show it. */
export function documentDataUrl(documentId: string): string | null {
  const doc = Documents.get(documentId)
  if (!doc) return null
  const filePath = resolveMediaPath(doc.filePath)
  if (!existsSync(filePath)) return null
  const buf = readFileSync(filePath)
  const mime = doc.mimeType ?? 'application/octet-stream'
  return `data:${mime};base64,${buf.toString('base64')}`
}
