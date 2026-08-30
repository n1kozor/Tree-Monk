import { app } from 'electron'
import { AppSettings, Events, Families, People, Places } from './db/repo'
import { getDb } from './db/connection'
import { isSignedIn, searchFamilySearchPlaces } from './familysearch'
import type { GeoResult } from '@shared/types'
import { canonicalCountryName, knownCountryAlias, lastPlacePart } from '@shared/placeNormalize'

// Geocoding routes through the TreeMonk geocoder proxy FIRST (shared cache +
// server-side throttle on the VPS — see deploy/geocoder/), so the public
// Nominatim server isn't hit by every installed copy of the app. The public
// endpoint is only the fallback when the proxy is unreachable, throttled to
// ~1 request/second with an identifying UA as Nominatim's usage policy
// requires (they BLOCK violators with HTTP 429, which silently broke lookups).
const GEO_PROXY = process.env.TREEMONK_GEOCODER ?? 'https://treemonk.eu/geocode'
const PUBLIC_NOMINATIM = 'https://nominatim.openstreetmap.org'
const NOMINATIM_UA = `TreeMonk/${app.getVersion()} (+https://treemonk.eu)`
/** Set once the proxy failed this session — skip it for subsequent lookups. */
let proxyDead = false

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

/**
 * The region most of this tree's places sit in, taken as the trailing component
 * of their place strings ("…, Pest, Magyarország" -> "Magyarország").
 *
 * A bare one-word place name is dangerously ambiguous across countries: the
 * Hungarian village "Úri" loses every time to the Swiss canton "Uri", which is
 * far more prominent in the geocoder's ranking. When a query carries no region
 * of its own, the tree's own centre of gravity is the best guess available.
 *
 * It stays a HINT: the query is only widened, never restricted, and a clear
 * majority is required — a genuinely scattered tree gets no hint at all.
 */
let regionHint: string | null | undefined
function treeRegionHint(): string | null {
  if (regionHint !== undefined) return regionHint
  const tally = new Map<string, number>()
  const note = (s: string | null | undefined): void => {
    const parts = (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    if (parts.length < 2) return // nothing to learn from a bare name
    const last = parts[parts.length - 1]
    if (last.length >= 3) tally.set(last, (tally.get(last) ?? 0) + 1)
  }
  try {
    for (const p of People.list()) {
      note(p.birthPlace)
      note(p.deathPlace)
      note(p.burialPlace)
      note(p.christeningPlace)
    }
    for (const f of Families.list()) note(f.marriagePlace)
  } catch {
    /* database not open yet — no hint */
  }
  const entries = [...tally.entries()].sort((a, b) => b[1] - a[1])
  const total = entries.reduce((n, e) => n + e[1], 0)
  const best = entries[0]
  regionHint = best && total >= 3 && best[1] / total >= 0.5 ? best[0] : null
  return regionHint
}

/** Forget the learned region — the tree changed (import, workspace switch). */
export function resetRegionHint(): void {
  regionHint = undefined
}

/**
 * Is `candidate` really the same place as what the user wrote?
 *
 * Standardization REPLACES the stored text with the geocoder's canonical name,
 * so an ambiguous village silently rewrites the record: "Póstelek, Békés" had a
 * top hit in Somogy, and the correct county was destroyed on import. The rule
 * that prevents it is simple — a canonical form may add detail or re-spell it,
 * but it may never CONTRADICT what the source states.
 *
 * Every comma-component the user wrote must therefore appear in the candidate,
 * with one deliberate exception: the LAST component, which is the country. That
 * one is allowed to differ, because collapsing "…, Hungary" and
 * "…, Magyarország" into one place is the entire point of standardizing.
 *
 * Comparison is accent- and case-insensitive, and very short tokens ("vm.",
 * "co.") are ignored as noise rather than treated as evidence.
 */
const foldPlace = (x: string): string =>
  x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function placeCandidateFits(original: string, candidate: string): boolean {
  const cand = foldPlace(candidate)
  const parts = original.split(',').map((x) => x.trim()).filter(Boolean)
  // A BARE one-part name is the dangerous case: it contains nothing a wrong
  // candidate could contradict, so containment passes almost anything — the
  // FamilySearch Places authority matches name VARIANTS, and "Russland" (the
  // German word for Russia) happily returned a real settlement of that name in
  // Scotland. The strictest testable claim is that the candidate's own first
  // component IS the queried name — anything looser has already corrupted data.
  if (parts.length === 1) {
    const country = knownCountryAlias(parts[0])
    if (country) {
      const candParts = candidate.split(',').map((x) => x.trim()).filter(Boolean)
      if (candParts.length === 1) return canonicalCountryName(candParts[0]) === country
      return canonicalCountryName(candParts.at(-1)) === country
    }
    const first = (candidate.split(',')[0] ?? '').trim()
    return foldPlace(first) === foldPlace(parts[0])
  }
  const country = knownCountryAlias(parts.at(-1))
  if (country && canonicalCountryName(lastPlacePart(candidate)) !== country) return false
  // Multi-part: every stated component except the trailing country must appear.
  const checked = parts.slice(0, -1)
  for (const part of checked) {
    const tokens = foldPlace(part).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)
    if (!tokens.length) continue
    if (!tokens.every((w) => cand.includes(w))) return false
  }
  return true
}

/** First geocoder hit that does not contradict the query (see above). */
function bestFit(original: string, results: GeoResult[]): GeoResult | undefined {
  return results.find((r) => placeCandidateFits(original, r.name))
}

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

interface NominatimHit {
  display_name: string
  lat: string
  lon: string
  address?: Record<string, string>
}

/**
 * Concise canonical place name from Nominatim's structured address, instead of
 * the raw display_name with every administrative layer:
 *
 *   "Szilvásvárad, Bélapátfalvai járás, Heves vármegye, Észak-Magyarország,
 *    Alföld és Észak, 3348, Magyarország"
 *      → "Szilvásvárad, Heves vármegye, Magyarország"
 *
 * Kept: the feature itself (street, district — the display_name's first
 * segment), the settlement, the county (state as fallback) and the country.
 * Dropped: districts (járás — Nominatim's `municipality` in Hungary!),
 * statistical regions, postcodes. Without address details the raw name is
 * returned unchanged.
 */
function conciseName(d: NominatimHit): string {
  const a = d.address
  if (!a) return d.display_name
  const first = (d.display_name.split(',')[0] ?? '').trim()
  const settlement = a.city ?? a.town ?? a.village ?? a.hamlet ?? null
  const parts: string[] = []
  for (const p of [first, settlement, a.county ?? a.state ?? null, a.country ?? null]) {
    const t = (p ?? '').trim()
    if (t && !parts.includes(t)) parts.push(t)
  }
  return parts.join(', ') || d.display_name
}

export async function geoSearch(query: string): Promise<GeoResult[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const key = q.toLowerCase()
  const cached = geoCache.get(key)
  if (cached) return cached

  // FS mode: the FamilySearch Places authority is the primary source — the
  // same canonical names the FamilySearch tree uses. This runs OUTSIDE the
  // serial Nominatim chain: the FS request scheduler already runs several
  // polite requests in parallel, so bulk geocoding/standardization is fast
  // while signed in. The public geocoder is only the fallback (signed out,
  // or the authority has no match).
  if (isSignedIn()) {
    try {
      const fs = await searchFamilySearchPlaces(q)
      if (fs.length) {
        // The authority ignores the tree-region hint the Nominatim path gets,
        // so apply it here as a PREFERENCE: for a bare name, hits inside the
        // tree's own region sort first (stable — authority order kept on ties).
        const hint = !q.includes(',') ? treeRegionHint() : null
        if (hint) {
          const hf = hint.toLowerCase()
          fs.sort((a, b) =>
            Number(b.name.toLowerCase().includes(hf)) - Number(a.name.toLowerCase().includes(hf))
          )
        }
        geoCache.set(key, fs)
        return fs
      }
    } catch {
      /* fall through to Nominatim */
    }
  }

  // Chain the rest so only ONE request hits Nominatim at a time, ≥1.1s apart.
  const run = geoChain.then(async () => {
    const again = geoCache.get(key)
    if (again) return again
    const headers = { 'User-Agent': NOMINATIM_UA, 'Accept-Language': placeLang() }
    const toResults = (data: NominatimHit[]): GeoResult[] =>
      data
        .map((d) => ({ name: conciseName(d), lat: Number(d.lat), lon: Number(d.lon) }))
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))

    /** One lookup, proxy first, public Nominatim second. */
    const ask = async (text: string): Promise<GeoResult[] | null> => {
      const qs = `search?format=jsonv2&limit=6&addressdetails=1&q=${encodeURIComponent(text)}`
      // 1) The TreeMonk proxy — server-side cache + throttle, so no client-side
      //    pacing is needed (bulk standardization runs much faster through it).
      if (!proxyDead) {
        try {
          const res = await fetch(`${GEO_PROXY}/${qs}`, { headers, signal: AbortSignal.timeout(5000) })
          if (res.ok) return toResults((await res.json()) as NominatimHit[])
          proxyDead = true // 404/5xx → not deployed / broken; stop trying this session
        } catch {
          proxyDead = true
        }
      }
      // 2) Public Nominatim fallback — strictly ≥1.1s apart.
      const wait = lastFetchAt + MIN_INTERVAL_MS - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      lastFetchAt = Date.now()
      try {
        const res = await fetch(`${PUBLIC_NOMINATIM}/${qs}`, { headers })
        if (!res.ok) return null // a transient 429/5xx must not be cached
        return toResults((await res.json()) as NominatimHit[])
      } catch {
        return null
      }
    }

    // A bare name ("Úri") is asked WITH the tree's own region, so it is not
    // matched against a same-named place on the other side of Europe. Anything
    // that already names its own region is sent untouched. If the hint finds
    // nothing, the plain name is tried too — the hint must never lose a place.
    const hint = q.includes(',') ? null : treeRegionHint()
    let out = await ask(hint ? `${q}, ${hint}` : q)
    if (hint && (out === null || out.length === 0)) out = await ask(q)
    if (out === null) return []
    rankByOverlap(q, out)
    geoCache.set(key, out)
    return out
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
// ---- Incremental geocoding (runs DURING an import) --------------------------
// The bulk pass below can only start once everything has been written, so on a
// large FamilySearch import the map stayed empty until the very end. This queue
// takes place names AS THEY STREAM IN and resolves them in the background, so
// coordinates land while the tree is still arriving. It shares geoSearch (hence
// the same cache, the FamilySearch Places authority while signed in, and the
// same Nominatim throttle), so it can never outrun the polite request limits.
const incomingQueue: string[] = []
const incomingSeen = new Set<string>()
let incomingActive = 0
/** Deliberately small: the import itself is competing for the same scheduler. */
const INCREMENTAL_CONCURRENCY = 2

function pumpIncoming(): void {
  while (incomingActive < INCREMENTAL_CONCURRENCY && incomingQueue.length) {
    const name = incomingQueue.shift()
    if (!name) continue
    incomingActive++
    void (async () => {
      try {
        // Someone else may have resolved it since it was queued.
        const known = Places.get(name)
        if (!known || known.lat === null || known.lon === null) {
          // Only a hit that does not contradict the name is trusted — a wrong
          // match would drop the pin in the wrong county just as surely as it
          // would rewrite the text.
          const hit = bestFit(name, await geoSearch(name))
          if (hit) Places.upsert(name, hit.lat, hit.lon)
        }
      } catch {
        /* best-effort: the bulk pass at the end retries whatever is missing */
      } finally {
        incomingActive--
        pumpIncoming()
      }
    })()
  }
}

/**
 * Queue place names for background geocoding while an import is running.
 * Safe to call for every streamed person: names are de-duplicated for the whole
 * session and already-geocoded places are skipped.
 */
export function queueGeocode(names: (string | null | undefined)[]): void {
  for (const raw of names) {
    const t = (raw ?? '').trim()
    if (t.length < 3 || incomingSeen.has(t)) continue
    incomingSeen.add(t)
    incomingQueue.push(t)
  }
  pumpIncoming()
}

/** Resolves once the incremental queue has drained (used before the bulk pass
 *  so the two never geocode the same name twice). */
export async function waitForIncomingGeocode(): Promise<void> {
  while (incomingQueue.length || incomingActive > 0) await sleep(150)
}

export async function geocodePlaces(
  onProgress: (p: GeocodeProgress) => void
): Promise<{ total: number; geocoded: number }> {
  // New people may have shifted where this tree lives — relearn before the run.
  resetRegionHint()
  const existing = new Set(Places.list().map((p) => p.name))
  const distinct = new Set<string>()
  const add = (s: string | null): void => {
    const t = (s ?? '').trim()
    if (t.length >= 3 && !existing.has(t)) distinct.add(t)
  }
  for (const p of People.list()) {
    add(p.birthPlace)
    add(p.deathPlace)
    add(p.burialPlace)
    add(p.christeningPlace)
  }
  for (const f of Families.list()) add(f.marriagePlace)
  // Life-event places (residences etc.) so multiple homes all land on the map.
  for (const s of Events.placeStrings()) add(s)

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
      const fit = bestFit(list[i], results)
      if (fit) {
        Places.upsert(list[i], fit.lat, fit.lon)
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
 * Builds the place MAPPING: every distinct place string in the tree gets a
 * gazetteer row with coordinates and — when a trustworthy canonical form exists
 * — a pointer to it, so "Csány, Heves, Hungary" and "Csány, Heves,
 * Magyarország" group as ONE place in the statistics and on the map.
 *
 * It never touches the records themselves. The text people see stays exactly
 * what the source (FamilySearch, GEDCOM, their own typing) said — rewriting it
 * is how two data-corruption incidents happened ("Póstelek, Békés" turned into
 * Somogy county; a German "Russland" into a Scottish settlement). The mapping
 * layer gives the merging without the risk: a wrong canonical guess miscounts
 * a statistic, it no longer destroys anyone's data.
 *
 * Rate-limited; offline it simply maps nothing (every lookup returns empty).
 * Idempotent.
 */
export async function standardizePlaces(
  onProgress: (p: StandardizeProgress) => void,
  opts: { skipKnown?: boolean; skipNames?: readonly string[] } = {}
): Promise<{ places: number; canonicalised: number; recordsUpdated: number }> {
  const people = People.list()
  const families = Families.list()

  // Places to leave alone, so a re-import stays fast.
  //
  // `skipNames` is an EXPLICIT snapshot and is what the post-import pass uses:
  // the gazetteer is written to DURING the import by the incremental geocoder,
  // under the raw place strings, so by the time this runs every fresh variant
  // ("…, Hungary" next to "…, Magyarország") already looks "known" and would be
  // skipped — which is exactly the duplication this pass exists to remove.
  // The caller therefore snapshots the gazetteer BEFORE the import starts.
  //
  // `skipKnown` keeps the old meaning for other callers; the Settings button
  // passes neither, and re-canonicalises everything.
  const known = opts.skipNames
    ? new Set(opts.skipNames)
    : opts.skipKnown
      ? new Set(Places.list().map((p) => p.name))
      : new Set<string>()

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
  // Life-event places (residences etc.) — otherwise multiple homes never geocode.
  for (const s of Events.placeStrings()) add(s)

  const list = [...distinct]
  const total = list.length
  let done = 0
  let changed = 0

  // 2. Geocode each distinct string → its canonical result (concurrent, staggered).
  // (No canonical map any more — the mapping is persisted per place, above.)
  let next = 0
  const CONCURRENCY = 6
  const worker = async (slot: number): Promise<void> => {
    await sleep(slot * 200)
    for (;;) {
      const i = next++
      if (i >= total) return
      const orig = list[i]
      const results = await geoSearch(orig)
      // A canonical form may add detail, never contradict the source. Without
      // this the top hit for an ambiguous village overwrote a correct county
      // ("Póstelek, Békés" -> "Póstelek, Somogy") and the original was lost.
      const fit = bestFit(orig, results)
      if (fit) {
        // MAPPING, never rewriting: the raw spelling gets its own gazetteer row
        // with the canonical's coordinates plus a POINTER to the canonical
        // form. The map already resolves through the gazetteer, the statistics
        // group through this pointer — so "Csány, Hungary" and "Csány,
        // Magyarország" land in ONE bucket while every record keeps saying
        // exactly what the source said. Rewriting is how both data-corruption
        // incidents happened ("Póstelek" → Somogy, "Russland" → Scotland).
        savePlace(fit)
        Places.upsert(orig, fit.lat, fit.lon)
        if (fit.name !== orig) {
          Places.setCanonical(orig, fit.name)
          changed++
        }
      }
      done++
      onProgress({ done, total, changed })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, (_v, s) => worker(s)))

  // Records are deliberately left untouched. `recordsUpdated` stays in the
  // return shape for IPC compatibility, permanently zero.
  return { places: total, canonicalised: changed, recordsUpdated: 0 }
}
