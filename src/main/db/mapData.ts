import { Families, People, Places } from './repo'
import type { MapEventKind, MapMarker } from '@shared/types'

function yearOf(date: string | null): string {
  if (!date) return ''
  const m = date.match(/\d{4}/)
  return m ? m[0] : ''
}

/**
 * Builds clustered-map markers: one per geocoded place (coords come from the
 * GEDCOM's own MAP records), each listing the birth/death/marriage events there.
 */
export function buildMapMarkers(): MapMarker[] {
  const places = Places.list()
  if (!places.length) return []
  const people = People.list()
  const families = Families.list()
  const byId = new Map(people.map((p) => [p.id, p]))
  const name = (id: string | null): string => {
    const p = id ? byId.get(id) : undefined
    return p ? `${p.givenName} ${p.surname}`.trim() || '—' : '—'
  }

  const markers = new Map<string, MapMarker>()
  for (const pl of places) {
    markers.set(pl.name, { name: pl.name, lat: pl.lat, lon: pl.lon, events: [] })
  }
  const add = (
    placeName: string | null,
    kind: MapEventKind,
    personId: string,
    personName: string,
    year: string
  ): void => {
    if (!placeName) return
    const m = markers.get(placeName.trim())
    if (m) m.events.push({ kind, personId, personName, year })
  }

  for (const p of people) {
    add(p.birthPlace, 'birth', p.id, `${p.givenName} ${p.surname}`.trim(), yearOf(p.birthDate))
    add(p.deathPlace, 'death', p.id, `${p.givenName} ${p.surname}`.trim(), yearOf(p.deathDate))
  }
  for (const f of families) {
    const yr = yearOf(f.marriageDate)
    if (f.husbandId) add(f.marriagePlace, 'marriage', f.husbandId, name(f.husbandId), yr)
    if (f.wifeId) add(f.marriagePlace, 'marriage', f.wifeId, name(f.wifeId), yr)
  }

  return [...markers.values()].filter((m) => m.events.length > 0)
}
