import { protocol, net, nativeImage } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { existsSync, mkdirSync, statSync } from 'fs'
import { extname, join } from 'path'
import { Documents } from './db/repo'
import { mediaDir } from './db/connection'

/**
 * Custom `tmedia://media/<documentId>` scheme that streams a stored document's
 * bytes straight from disk. This replaces the old base64 `documents.dataUrl`
 * IPC for image display: avatars and thumbnails now load natively via `<img
 * src>` — no per-image IPC round-trip and no synchronous main-process file
 * reads, which previously froze the UI when many photos rendered at once.
 */
const SCHEME = 'tmedia'

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
}

// Two-level thumbnail cache so a grid/tree of thousands of photos decodes each
// original AT MOST ONCE — ever. Hot thumbnails stay in memory; everything is
// also persisted to disk, so re-opening the tree or restarting the app serves
// tiny pre-made JPEGs instead of re-decoding multi-megapixel originals (which is
// what spun the machine up). Keyed by id|width|mtime, so a re-downloaded image
// regenerates automatically.
const thumbCache = new Map<string, Buffer>()
const THUMB_CACHE_MAX = 400

function memSet(key: string, buf: Buffer): void {
  if (thumbCache.size >= THUMB_CACHE_MAX) {
    const oldest = thumbCache.keys().next().value
    if (oldest) thumbCache.delete(oldest)
  }
  thumbCache.set(key, buf)
}

let thumbDirPath: string | null = null
function thumbDir(): string {
  if (!thumbDirPath) {
    thumbDirPath = join(mediaDir(), '.thumbs')
    try {
      mkdirSync(thumbDirPath, { recursive: true })
    } catch {
      /* best effort */
    }
  }
  return thumbDirPath
}

/** Decode + downscale raw image bytes to `w` px wide → JPEG. Null when
 *  nativeImage can't decode it (caller serves the original instead). */
function resizeToJpeg(data: Buffer, w: number): Buffer | null {
  try {
    const img = nativeImage.createFromBuffer(data)
    if (img.isEmpty()) return null
    const { width } = img.getSize()
    const out = width > w ? img.resize({ width: w, quality: 'good' }) : img
    return out.toJPEG(80)
  } catch {
    return null
  }
}

/** In-memory-only thumbnail (for still-remote bytes that have no stable file). */
function thumbFromBuffer(key: string, data: Buffer, w: number): Buffer | null {
  const cached = thumbCache.get(key)
  if (cached) return cached
  const buf = resizeToJpeg(data, w)
  if (buf) memSet(key, buf)
  return buf
}

/** Disk-backed thumbnail for a LOCAL file. On a hit, the original is never read
 *  or decoded — only the tiny cached JPEG is. Misses generate + persist it. */
async function localThumb(id: string, sourcePath: string, w: number): Promise<Buffer | null> {
  let mtime = 0
  try {
    mtime = Math.round(statSync(sourcePath).mtimeMs)
  } catch {
    return null
  }
  const key = `${id}|${w}|${mtime}`
  const mem = thumbCache.get(key)
  if (mem) return mem
  // Disk cache is best-effort: any failure here (cache dir, read) still produces
  // an in-memory thumbnail below, so a thumbnail request never errors out.
  let cacheFile: string | null = null
  try {
    cacheFile = join(thumbDir(), `${id}_${w}_${mtime}.jpg`)
    const cached = await readFile(cacheFile) // hit: no original decode
    memSet(key, cached)
    return cached
  } catch {
    /* miss / no disk cache → generate below */
  }
  let data: Buffer
  try {
    data = await readFile(sourcePath)
  } catch {
    return null
  }
  const buf = resizeToJpeg(data, w)
  if (!buf) return null
  memSet(key, buf)
  if (cacheFile) void writeFile(cacheFile, buf).catch(() => undefined) // persist in background
  return buf
}

/** Pre-generate + disk-cache thumbnails for a freshly-downloaded local image,
 *  reusing the bytes the downloader already has in memory. So the FIRST family
 *  tree / documents render serves ready-made thumbnails instead of decoding
 *  multi-megapixel originals on demand (which spun the machine up). Best-effort. */
export async function warmThumbnails(
  docId: string,
  sourcePath: string,
  data: Buffer,
  widths: number[]
): Promise<void> {
  let mtime = 0
  try {
    mtime = Math.round(statSync(sourcePath).mtimeMs)
  } catch {
    return
  }
  for (const w of widths) {
    try {
      const key = `${docId}|${w}|${mtime}`
      if (thumbCache.has(key)) continue
      const cacheFile = join(thumbDir(), `${docId}_${w}_${mtime}.jpg`)
      if (existsSync(cacheFile)) continue
      const buf = resizeToJpeg(data, w)
      if (buf) {
        memSet(key, buf)
        await writeFile(cacheFile, buf)
      }
    } catch {
      /* best effort — falls back to on-demand generation */
    }
  }
}

const jpegHeaders = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400' }

/** Must run BEFORE app `ready` so the scheme is treated as privileged/secure. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

/** Must run AFTER app `ready`. Resolves `tmedia://media/<id>` to the file bytes. */
export function registerMediaProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const id = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      if (!id) return new Response('Bad request', { status: 400 })
      const doc = Documents.get(id)
      if (!doc) return new Response('Not found', { status: 404 })
      // Thumbnail request (?w=N): serve a downscaled JPEG of raster images so
      // grids/avatars never decode multi-thousand-pixel originals. Anything
      // nativeImage can't decode (PDF, SVG, web page) falls through to original.
      const w = Math.min(2400, Math.max(0, Math.round(Number(url.searchParams.get('w')) || 0)))

      // A still-remote document (not yet downloaded) is proxied from its URL.
      // FamilySearch rejects requests without a User-Agent (401), so send one —
      // the same way the background downloader fetches it. These are mostly
      // images, so a thumbnail request resizes the fetched bytes too.
      if (/^https?:\/\//i.test(doc.filePath)) {
        try {
          const res = await net.fetch(doc.filePath, {
            headers: { 'User-Agent': 'TreeMonk', Accept: 'image/*' }
          })
          if (w > 0 && res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            const thumb = thumbFromBuffer(`${id}|${w}`, buf, w)
            if (thumb) return new Response(thumb, { headers: jpegHeaders })
            return new Response(buf, {
              headers: { 'Content-Type': res.headers.get('content-type') || 'image/jpeg' }
            })
          }
          return res
        } catch {
          // Un-downloaded remote image that can't be fetched (offline, auth, dead
          // link). Return a quiet 404 so the <img> shows its fallback glyph — not
          // a scary 500 that floods the console (these are downloaded in the bg).
          return new Response('Upstream unavailable', { status: 404 })
        }
      }

      if (!existsSync(doc.filePath)) return new Response('Gone', { status: 404 })
      // Thumbnail: served from the disk cache without ever reading/decoding the
      // (possibly multi-megabyte) original on a hit.
      if (w > 0) {
        const thumb = await localThumb(id, doc.filePath, w)
        if (thumb) return new Response(thumb, { headers: jpegHeaders })
      }
      // Full size (the viewer) or a format nativeImage can't thumbnail.
      const mime = doc.mimeType || EXT_MIME[extname(doc.filePath).toLowerCase()] || 'application/octet-stream'
      const data = await readFile(doc.filePath)
      return new Response(data, {
        headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache' }
      })
    } catch {
      // Never a 500: the <img> just falls back to its glyph, and the console
      // isn't flooded with errors when many media requests are in flight.
      return new Response('Error', { status: 404 })
    }
  })
}
