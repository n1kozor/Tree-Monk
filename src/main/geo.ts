import { AppSettings, Families, People, Places } from './db/repo'
import { isSignedIn, searchFamilySearchPlaces } from './familysearch'
import type { GeoResult } from '@shared/types'

// Nominatim's usage policy allows at most ~1 request/second from a single app,
// and BLOCKS (HTTP 429) anyone who exceeds it — which silently broke every place
// lookup. So we (a) cache results per query, and (b) serialise requests with a
// >1s gap between them. The UA identifies the app as the policy requires.
const NOMINATIM_UA = 'TreeMonk/1.3 (+https://treemonk.eu)'

/** UI language → Accept-Language string (the user's language first, English as
 *  a fallback) so place names come back localized to the app's language. */
export function placeLang(): string {
  const l = (AppSettings.get('app_language') || 'en').slice(0, 2)
  return l === 'en' ? 'en' : `${l},en`
}
const MIN_INTERVAL_MS = 1100
const geoCache = new Map<string, GeoResult[]>()
let geoChain: Promise<unknown> = Promise.resolve()
let lastFetchAt = 0

/** Nominatim place autocomplete. Returns canonical name + precise lat/lon.
 *  Cached per query and rate-limited to respect Nominatim's usage policy. */
/**
 * Re-rank geocoder hits so the one that best matches the query text wins. A
 * messy place string like "Budapest X. kerület" can make Nominatim's
 * importance-ranked top hit an unrelated same-named spot abroad (a street named
 * "Budapest" in Argentina). A hit whose name actually contains more of the
 * query's words ("budapest" AND "kerület") is almost always the right place.
 * Sorts in place; V8's stable sort keeps Nominatim's order on ties.
 */
function rankByOverlap(query: string, results: GeoResult[]): void {
  if (results.length < 2) return
  const tokens = query
    .toLowerCase()
    .split(/[\s,.]+/)
    .filter((w) => w.length >= 3)
  if (tokens.length === 0) return
  const score = (name: string): number => {
    const n = name.toLowerCase()
    return tokens.reduce((s, w) => s + (n.includes(w) ? 1 : 0), 0)
  }
  results.sort((a, b) => score(b.name) - score(a.name))
}

export async function geoSearch(query: string): Promise<GeoResult[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const key = q.toLowerCase()
  const cached = geoCache.get(key)
  if (cached) return cached

  // Chain requests so only ONE hits Nominatim at a time, each ≥1.1s apart.
  const run = geoChain.then(async () => {
    const again = geoCache.get(key)
    if (again) return again
    // FS mode: the FamilySearch Places authority is the primary source — the
    // same canonical names the FamilySearch tree uses. Public geocoder is only
    // the fallback (signed out, or the authority has no match).
    if (isSignedIn()) {
      try {
        const fs = await searchFamilySearchPlaces(q)
        if (fs.length) {
          geoCache.set(key, fs)
          return fs
        }
      } catch {
        /* fall through to Nominatim */
      }
    }
    const wait = lastFetchAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastFetchAt = Date.now()
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': placeLang() }
      })
      if (!res.ok) return [] // don't cache failures (e.g. a transient 429)
      const data = (await res.json()) as { display_name: string; lat: string; lon: string }[]
      const out = data
        .map((d) => ({ name: d.display_name, lat: Number(d.lat), lon: Number(d.lon) }))
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
      rankByOverlap(q, out)
      geoCache.set(key, out)
      return out
    } catch {
      return []
    }
  })
  // Keep the chain alive even if this call throws.
  geoChain = run.catch(() => undefined)
  return run
}

/** Persist a chosen place + coordinates into the gazetteer (used by the map). */
export function savePlace(place: GeoResult): void {
  if (place?.name && Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
    Places.upsert(place.name, place.lat, place.lon)
  }
}

export interface GeocodeProgress {
  done: number
  total: number
  found: number
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Iterates over every distinct place name in the database (birth / death /
 * marriage) that isn't geocoded yet, looks it up via Nominatim and stores the
 * coordinates KEYED BY THE ORIGINAL string — so the map markers (which match on
 * the person's exact place text) appear. Rate-limited to ~1 req/s per
 * Nominatim's usage policy. Idempotent & resumable (already-geocoded skipped).
 */
export async function geocodePlaces(
  onProgress: (p: GeocodeProgress) => void
): Promise<{ total: number; geocoded: number }> {
  const existing = new Set(Places.list().map((p) => p.name))
  const distinct = new Set<string>()
  const add = (s: string | null): void => {
    const t = (s ?? '').trim()
    if (t.length >= 3 && !existing.has(t)) distinct.add(t)
  }
  for (const p of People.list()) {
    add(p.birthPlace)
    add(p.deathPlace)
  }
  for (const f of Families.list()) add(f.marriagePlace)

  const list = [...distinct]
  const total = list.length
  let done = 0
  let found = 0
  let next = 0

  // Bounded concurrency — several lookups in flight at once (much faster than a
  // strict 1 req/s). A small per-request stagger keeps it from bursting too hard
  // against the public Nominatim endpoint.
  const CONCURRENCY = 6
  const worker = async (slot: number): Promise<void> => {
    await sleep(slot * 200) // stagger startup
    for (;;) {
      const i = next++
      if (i >= total) return
      const results = await geoSearch(list[i])
      if (results[0]) {
        Places.upsert(list[i], results[0].lat, results[0].lon)
        found++
      }
      done++
      onProgress({ done, total, found })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, (_v, s) => worker(s)))
  return { total, geocoded: found }
}

export interface StandardizeProgress {
  done: number
  total: number
  changed: number
}

/**
 * Standardizes every place name in the tree to its canonical Nominatim form —
 * the same lookup the place field uses when you pick a suggestion. This collapses
 * spelling/language variants of the SAME place ("Csány, Heves, Hungary" and
 * "Csány, Heves, Magyarország" → one canonical string), so duplicates disappear,
 * and stores the coordinates for the map. Rate-limited; offline it simply changes
 * nothing (every lookup returns empty). Idempotent.
 */
export async function standardizePlaces(
  onProgress: (p: StandardizeProgress) => void,
  opts: { skipKnown?: boolean } = {}
): Promise<{ places: number; canonicalised: number; recordsUpdated: number }> {
  const people = People.list()
  const families = Families.list()

  // Places we've already geocoded/canonicalised before. When `skipKnown` is set
  // (the automatic post-import pass) we don't re-process them — only genuinely new
  // place strings are looked up, which keeps re-imports fast. The Settings button
  // passes skipKnown=false to re-canonicalise everything.
  const known = opts.skipKnown ? new Set(Places.list().map((p) => p.name)) : new Set<string>()

  // 1. Collect every distinct place string in use (≥3 chars), minus the known ones.
  const distinct = new Set<string>()
  const add = (s: string | null): void => {
    const t = (s ?? '').trim()
    if (t.length >= 3 && !known.has(t)) distinct.add(t)
  }
  for (const p of people) {
    add(p.birthPlace)
    add(p.deathPlace)
    add(p.burialPlace)
    add(p.christeningPlace)
  }
  for (const f of families) add(f.marriagePlace)

  const list = [...distinct]
  const total = list.length
  let done = 0
  let changed = 0

  // 2. Geocode each distinct string → its canonical result (concurrent, staggered).
  const canon = new Map<string, GeoResult>()
  let next = 0
  const CONCURRENCY = 6
  const worker = async (slot: number): Promise<void> => {
    await sleep(slot * 200)
    for (;;) {
      const i = next++
      if (i >= total) return
      const orig = list[i]
      const results = await geoSearch(orig)
      if (results[0]) {
        canon.set(orig, results[0])
        if (results[0].name !== orig) changed++
      }
      done++
      onProgress({ done, total, changed })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, (_v, s) => worker(s)))

  // 3. Persist canonical coordinates and rewrite the place text everywhere it
  //    differs. Only rows that actually change are written (keeps the audit log
  //    and work minimal).
  for (const r of canon.values()) savePlace(r)
  const mapTo = (s: string | null): string | null => {
    const t = (s ?? '').trim()
    const r = t ? canon.get(t) : undefined
    return r && r.name !== t ? r.name : s
  }

  let recordsUpdated = 0
  for (const p of people) {
    const birthPlace = mapTo(p.birthPlace)
    const deathPlace = mapTo(p.deathPlace)
    const burialPlace = mapTo(p.burialPlace)
    const christeningPlace = mapTo(p.christeningPlace)
    if (
      birthPlace !== p.birthPlace ||
      deathPlace !== p.deathPlace ||
      burialPlace !== p.burialPlace ||
      christeningPlace !== p.christeningPlace
    ) {
      People.update(p.id, { birthPlace, deathPlace, burialPlace, christeningPlace })
      recordsUpdated++
    }
  }
  for (const f of families) {
    const marriagePlace = mapTo(f.marriagePlace)
    if (marriagePlace !== f.marriagePlace) {
      Families.update(f.id, { marriagePlace })
      recordsUpdated++
    }
  }

  return { places: total, canonicalised: changed, recordsUpdated }
}
