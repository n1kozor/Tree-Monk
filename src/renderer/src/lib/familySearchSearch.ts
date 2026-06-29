import type { Person } from '@shared/types'
import { isFamilySearchId } from '@shared/familysearch'

export { isFamilySearchId }

/** First 4-digit year in a free-form date string, or null. */
function birthYear(date: string | null): number | null {
  const m = (date ?? '').match(/\d{4}/)
  return m ? Number(m[0]) : null
}

/** FamilySearch's site uses a 2-letter language path segment (/de/, /en/, /hu/…). */
function fsLang(lang: string | undefined): string {
  const base = (lang ?? '').split('-')[0].toLowerCase()
  return base || 'en'
}

/**
 * A FamilySearch historical-record search URL pre-filled from a person's vitals
 * (name + birth year + birthplace), in the user's UI language. Example:
 * https://www.familysearch.org/de/search/record/results?q.givenName=István&q.surname=Barkóczi&q.birthLikeDate.from=1891&q.birthLikeDate.to=1891&q.birthLikePlace=csány
 */
export function familySearchSearchUrl(person: Person, lang?: string): string {
  const p = new URLSearchParams()
  const given = person.givenName?.trim()
  const surname = person.surname?.trim()
  if (given) p.set('q.givenName', given)
  if (surname) p.set('q.surname', surname)
  const by = birthYear(person.birthDate)
  if (by) {
    p.set('q.birthLikeDate.from', String(by))
    p.set('q.birthLikeDate.to', String(by))
  }
  const place = person.birthPlace?.trim()
  if (place) p.set('q.birthLikePlace', place)
  return `https://www.familysearch.org/${fsLang(lang)}/search/record/results?${p.toString()}`
}

/** Whether we have enough to make a meaningful search (at least a name). */
export function canSearchFamilySearch(person: Person): boolean {
  return Boolean(person.givenName?.trim() || person.surname?.trim())
}

/**
 * Direct link to this person's page in the FamilySearch Family Tree, using the
 * FamilySearch person id (`fsId`) captured during import/sync. Null when we have
 * no id, or when the stored id is not a genuine FamilySearch id (e.g. a foreign
 * GEDCOM `RIN` like "MH:I512") — there is nothing to open on FamilySearch then.
 */
export function familySearchPersonUrl(person: Person): string | null {
  const id = person.fsId?.trim()
  return isFamilySearchId(id)
    ? `https://www.familysearch.org/tree/person/details/${encodeURIComponent(id as string)}`
    : null
}
