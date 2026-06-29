import type { Person } from '@shared/types'

/**
 * A person's "data quality" — how much of their record is filled in. One shared
 * definition drives both the per-person ring (profile) and the aggregate gauge
 * (dashboard), so the two always agree.
 *
 * Fields are weighted equally. Death info only counts for people marked deceased
 * (a living person legitimately has none, so it's not held against them).
 */
export const QUALITY_FIELDS = ['name', 'sex', 'birthDate', 'birthPlace', 'death', 'photo', 'occupation'] as const
export type QualityField = (typeof QUALITY_FIELDS)[number]

const isDeceased = (p: Person): boolean => p.deceased || !!p.deathDate

/** Whether a quality field applies to this person (death only when deceased). */
function applies(p: Person, f: QualityField): boolean {
  return f === 'death' ? isDeceased(p) : true
}

/**
 * Whether an applicable field is filled in. Occupations live in their own table
 * (not the people.occupation column), so the caller passes the set of person-ids
 * that have one — without it we'd wrongly flag everyone as missing an occupation.
 */
function filled(p: Person, f: QualityField, occSet?: Set<string>): boolean {
  switch (f) {
    case 'name':
      return !!(p.givenName.trim() || p.surname.trim())
    case 'sex':
      return p.sex === 'M' || p.sex === 'F'
    case 'birthDate':
      return !!p.birthDate
    case 'birthPlace':
      return !!p.birthPlace
    case 'death':
      return !!p.deathDate
    case 'photo':
      return !!p.profilePhotoId
    case 'occupation':
      return !!p.occupation?.trim() || !!occSet?.has(p.id)
  }
}

export interface PersonQuality {
  /** 0–100. */
  score: number
  filled: QualityField[]
  missing: QualityField[]
}

/** Score one person 0–100 over the fields that apply to them. */
export function personQuality(p: Person, occSet?: Set<string>): PersonQuality {
  const applicable = QUALITY_FIELDS.filter((f) => applies(p, f))
  const done = applicable.filter((f) => filled(p, f, occSet))
  const missing = applicable.filter((f) => !filled(p, f, occSet))
  return {
    score: applicable.length ? Math.round((done.length / applicable.length) * 100) : 0,
    filled: done,
    missing
  }
}

/** Average data-quality score (0–100) across a group of people. */
export function aggregateQuality(people: Person[], occSet?: Set<string>): number {
  if (!people.length) return 0
  const sum = people.reduce((acc, p) => acc + personQuality(p, occSet).score, 0)
  return Math.round(sum / people.length)
}

export type QualityTone = 'high' | 'mid' | 'low'

/** Three-tier tone for colour-coding (matches the dashboard completeness bars). */
export function qualityTone(pct: number): QualityTone {
  return pct >= 75 ? 'high' : pct >= 45 ? 'mid' : 'low'
}

/** Stroke / text hex for a tone (used by the SVG rings). */
export const QUALITY_COLOR: Record<QualityTone, string> = {
  high: '#10b981', // emerald-500
  mid: '#f59e0b', // amber-500
  low: '#ef4444' // rose-500
}
