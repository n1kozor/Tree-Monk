import type { Person } from '@shared/types'

/** A "facet" identifies the subset of people behind a clicked card / bar / slice. */
export type Facet =
  | { kind: 'all' }
  | { kind: 'living'; living: boolean }
  | { kind: 'sex'; sex: 'M' | 'F' | 'U' }
  | { kind: 'surname'; value: string }
  | { kind: 'given'; value: string }
  | { kind: 'birthPlace'; value: string }
  | { kind: 'deathPlace'; value: string }
  | { kind: 'occupation'; value: string }
  | { kind: 'religion'; value: string }
  | { kind: 'birthCentury'; century: number }
  | { kind: 'deathCentury'; century: number }
  | { kind: 'lifespanBand'; band: string }
  | { kind: 'missing'; field: string }

const yearNum = (d: string | null): number | null => {
  const m = d?.match(/\b(\d{4})\b/)
  return m ? Number(m[1]) : null
}
const isDeceased = (p: Person): boolean => !!(p.deceased || p.deathDate)
const trimEq = (a: string | null | undefined, b: string): boolean => (a ?? '').trim() === b

/** The same 10-year age band label the Dashboard histogram uses (or null). */
export function lifespanBand(p: Person): string | null {
  const b = yearNum(p.birthDate)
  const d = yearNum(p.deathDate)
  if (b === null || d === null || d - b < 0 || d - b > 120) return null
  const age = d - b
  return age >= 90 ? '90+' : `${Math.floor(age / 10) * 10}–${Math.floor(age / 10) * 10 + 9}`
}

/** Whether a person is MISSING the given completeness field. */
export function isMissing(p: Person, field: string): boolean {
  switch (field) {
    case 'birthDate':
      return !p.birthDate
    case 'birthPlace':
      return !p.birthPlace
    case 'deathInfo':
      return !p.deathDate && !p.deceased
    case 'photo':
      return !p.profilePhotoId
    case 'occupation':
      return !p.occupation
    default:
      return false
  }
}

/** Resolves the people behind a facet from the already-scoped list. */
export function peopleFor(facet: Facet, people: Person[]): Person[] {
  switch (facet.kind) {
    case 'all':
      return people
    case 'living':
      return people.filter((p) => !isDeceased(p) === facet.living)
    case 'sex':
      return people.filter((p) =>
        facet.sex === 'U' ? p.sex !== 'M' && p.sex !== 'F' : p.sex === facet.sex
      )
    case 'surname':
      return people.filter((p) => trimEq(p.surname, facet.value))
    case 'given':
      return people.filter((p) => trimEq(p.givenName, facet.value))
    case 'birthPlace':
      return people.filter((p) => trimEq(p.birthPlace, facet.value))
    case 'deathPlace':
      return people.filter((p) => trimEq(p.deathPlace, facet.value))
    case 'occupation':
      return people.filter((p) => trimEq(p.occupation, facet.value))
    case 'religion':
      return people.filter((p) => trimEq(p.religion, facet.value))
    case 'birthCentury':
      return people.filter((p) => {
        const y = yearNum(p.birthDate)
        return y !== null && Math.floor(y / 100) * 100 === facet.century
      })
    case 'deathCentury':
      return people.filter((p) => {
        const y = yearNum(p.deathDate)
        return y !== null && Math.floor(y / 100) * 100 === facet.century
      })
    case 'lifespanBand':
      return people.filter((p) => lifespanBand(p) === facet.band)
    case 'missing':
      return people.filter((p) => isMissing(p, facet.field))
    default:
      return []
  }
}

/** "1800s" → 1800 (for turning a century bucket label back into a facet). */
export const centuryOf = (label: string): number => parseInt(label, 10) || 0
