import { getDb } from './connection'
import { Families, People, Places } from './repo'
import type { AtlasKind, AtlasPoint, Sex } from '@shared/types'

/**
 * Data feed for the Atlas (map) view: every life event that can be pinned to a
 * geocoded place — vitals (birth / christening / death / burial), marriages,
 * and the events table (residences and any other fact with a place). The
 * renderer filters by kind / person / year and builds its own GeoJSON.
 */

function yearNum(date: string | null): number | null {
  if (!date) return null
  const m = date.match(/\d{4}/)
  return m ? Number(m[0]) : null
}

interface EventPlaceRow {
  type: string
  date: string | null
  end_date: string | null
  place: string
  value: string | null
  owner_id: string
  given_name: string
  surname: string
  sex: Sex
}

export function buildAtlasPoints(): AtlasPoint[] {
  const places = Places.list()
  if (!places.length) return []
  const coord = new Map(places.map((p) => [p.name.trim(), p]))

  const people = People.list()
  const families = Families.list()
  const byId = new Map(people.map((p) => [p.id, p]))
  const out: AtlasPoint[] = []

  const push = (
    kind: AtlasKind,
    personId: string,
    place: string | null,
    date: string | null,
    endDate: string | null = null,
    detail: string | null = null
  ): void => {
    if (!place) return
    const pl = coord.get(place.trim())
    if (!pl) return
    const p = byId.get(personId)
    if (!p) return
    out.push({
      kind,
      personId,
      personName: `${p.givenName} ${p.surname}`.trim() || '—',
      sex: p.sex,
      year: yearNum(date),
      date,
      endYear: yearNum(endDate),
      place: pl.name,
      lat: pl.lat,
      lon: pl.lon,
      detail
    })
  }

  for (const p of people) {
    push('birth', p.id, p.birthPlace, p.birthDate)
    push('christening', p.id, p.christeningPlace, p.christeningDate)
    push('death', p.id, p.deathPlace, p.deathDate)
    push('burial', p.id, p.burialPlace, p.burialDate)
  }
  for (const f of families) {
    for (const pid of [f.husbandId, f.wifeId]) {
      if (pid) push('marriage', pid, f.marriagePlace, f.marriageDate)
    }
  }

  // Life events with a place — residences drive the migration timeline; every
  // other typed fact (military, school, …) lands under 'other' with its label.
  // end_date arrived via a later migration — fall back gracefully on databases
  // that don't carry the column yet (e.g. the read-only browser demo snapshot).
  const query = (withEnd: boolean): EventPlaceRow[] =>
    getDb()
      .prepare(
        `SELECT e.type, e.date, ${withEnd ? 'e.end_date' : 'NULL AS end_date'}, e.place, e.value, e.owner_id,
                p.given_name, p.surname, p.sex
         FROM events e JOIN people p ON p.id = e.owner_id
         WHERE e.owner_type = 'person' AND e.place IS NOT NULL AND trim(e.place) <> ''
         ORDER BY e.owner_id, (e.date IS NULL OR e.date = ''), e.date, e.ordinal`
      )
      .all() as EventPlaceRow[]
  let rows: EventPlaceRow[]
  try {
    rows = query(true)
  } catch {
    rows = query(false)
  }
  for (const r of rows) {
    const pl = coord.get(r.place.trim())
    if (!pl) continue
    const residence = r.type.toLowerCase().includes('resid')
    out.push({
      kind: residence ? 'residence' : 'other',
      personId: r.owner_id,
      personName: `${r.given_name} ${r.surname}`.trim() || '—',
      sex: r.sex,
      year: yearNum(r.date),
      date: r.date,
      endYear: yearNum(r.end_date),
      place: pl.name,
      lat: pl.lat,
      lon: pl.lon,
      detail: residence ? null : r.value || r.type
    })
  }

  return out
}
