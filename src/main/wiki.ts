import { app, net } from 'electron'
import type { HistEvent } from '@shared/types'

const UA = `TreeMonk/${app.getVersion()} (+https://treemonk.eu)`
const cache = new Map<string, HistEvent[]>()

/**
 * Historical events (battles, treaties, foundings, …) that have BOTH a date
 * (P585) and coordinates (P625), within `radius` km of (lat, lon) and the given
 * year range — straight from Wikidata. Labels are requested in the app's active
 * language first, then English as a universal fallback. Cached per rounded
 * request (language is part of the cache key). Fetched from the main process so
 * there are no CSP limits.
 */
export async function eventsNear(
  lat: number,
  lon: number,
  fromYear: number,
  toYear: number,
  lang = 'hu',
  radiusKm = 150
): Promise<HistEvent[]> {
  // Build the preferred-language chain: requested lang → English fallback.
  const langChain = lang.startsWith('en') ? 'en' : `${lang.slice(0, 2)},en`
  const key = `${lat.toFixed(2)}|${lon.toFixed(2)}|${fromYear}|${toYear}|${radiusKm}|${langChain}`
  const hit = cache.get(key)
  if (hit) return hit

  const query = `SELECT ?event ?eventLabel ?date ?coord WHERE {
    SERVICE wikibase:around {
      ?event wdt:P625 ?coord.
      bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral.
      bd:serviceParam wikibase:radius "${radiusKm}".
    }
    ?event wdt:P585 ?date.
    FILTER(YEAR(?date) >= ${fromYear} && YEAR(?date) <= ${toYear})
    SERVICE wikibase:label { bd:serviceParam wikibase:language "${langChain}". }
  } LIMIT 80`

  try {
    const res = await net.fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query), {
      headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      results?: { bindings?: Array<Record<string, { value?: string }>> }
    }
    const out: HistEvent[] = []
    const seen = new Set<string>()
    for (const b of data.results?.bindings ?? []) {
      const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value ?? '')
      if (!m) continue
      const id = (b.event?.value ?? '').split('/').pop() ?? ''
      const title = b.eventLabel?.value ?? ''
      // Skip dupes and items with no real label (the service echoes the Q-id).
      if (!id || seen.has(id) || !title || /^Q\d+$/.test(title)) continue
      seen.add(id)
      const dateStr = b.date?.value ?? null
      const y = dateStr ? Number(dateStr.slice(0, dateStr.startsWith('-') ? 5 : 4)) : NaN
      out.push({
        id,
        title,
        date: dateStr,
        year: Number.isFinite(y) ? y : null,
        lon: Number(m[1]),
        lat: Number(m[2]),
        url: b.event?.value ?? ''
      })
    }
    out.sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
    cache.set(key, out)
    return out
  } catch {
    return []
  }
}
