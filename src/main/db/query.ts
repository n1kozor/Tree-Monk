import { AppSettings, Occupations, People } from './repo'
import type { Person, PersonQuery, QueryRule, SavedQuery } from '@shared/types'

// ---- Saved queries (persisted as a JSON blob in settings; no schema change) ----

const SAVED_KEY = 'saved_queries'

/** A collision-resistant local id without pulling in a crypto/uuid dependency
 *  (works in both the Electron main process and the browser demo build). */
function localId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function listSavedQueries(): SavedQuery[] {
  const raw = AppSettings.get(SAVED_KEY)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as SavedQuery[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeSaved(list: SavedQuery[]): SavedQuery[] {
  AppSettings.set(SAVED_KEY, JSON.stringify(list))
  return list
}

/** Saves the query under a name. If a saved query with the same (trimmed,
 *  case-insensitive) name exists, it is overwritten — so re-saving updates it. */
export function saveQuery(name: string, query: PersonQuery): SavedQuery[] {
  const clean = name.trim() || 'Lekérdezés'
  const list = listSavedQueries()
  const now = new Date().toISOString()
  const existing = list.find((q) => q.name.trim().toLowerCase() === clean.toLowerCase())
  if (existing) {
    existing.query = query
    existing.createdAt = now
    return writeSaved(list)
  }
  // Newest first so the most recent appears at the front of the chip row.
  return writeSaved([{ id: localId(), name: clean, query, createdAt: now }, ...list])
}

export function removeSavedQuery(id: string): SavedQuery[] {
  return writeSaved(listSavedQueries().filter((q) => q.id !== id))
}

function yearOf(date: string | null): number | null {
  if (!date) return null
  const m = date.match(/\b(\d{4})\b/)
  return m ? Number(m[1]) : null
}

function fieldValue(p: Person, field: QueryRule['field']): string | number | null {
  switch (field) {
    case 'givenName':
      return p.givenName
    case 'surname':
      return p.surname
    case 'sex':
      return p.sex
    case 'birthPlace':
      return p.birthPlace
    case 'deathPlace':
      return p.deathPlace
    case 'birthYear':
      return yearOf(p.birthDate)
    case 'deathYear':
      return yearOf(p.deathDate)
    default:
      return null
  }
}

/** Occupation is multi-valued (a person may hold several) — match against the set of titles. */
function matchOccupation(titles: string[], rule: QueryRule): boolean {
  switch (rule.operator) {
    case 'isEmpty':
      return titles.length === 0
    case 'notEmpty':
      return titles.length > 0
  }
  const needle = rule.value.trim().toLowerCase()
  const lower = titles.map((t) => t.toLowerCase())
  switch (rule.operator) {
    case 'contains':
      return lower.some((s) => s.includes(needle))
    case 'notContains':
      // True when NONE of the titles contain the needle (incl. no occupations).
      return !lower.some((s) => s.includes(needle))
    case 'equals':
      return lower.some((s) => s === needle)
    case 'startsWith':
      return lower.some((s) => s.startsWith(needle))
    case 'notEquals':
      return !lower.some((s) => s === needle)
    default:
      return false
  }
}

function matchRule(p: Person, rule: QueryRule, occupationTitles: string[]): boolean {
  if (rule.field === 'occupation') return matchOccupation(occupationTitles, rule)
  const raw = fieldValue(p, rule.field)
  const v = rule.value.trim()
  switch (rule.operator) {
    case 'isEmpty':
      return raw === null || raw === undefined || raw === ''
    case 'notEmpty':
      return !(raw === null || raw === undefined || raw === '')
  }
  // "does not contain" is vacuously true for an empty/missing field (it holds no
  // value, so it certainly doesn't contain the needle).
  if (rule.operator === 'notContains' && (raw === null || raw === undefined || String(raw) === '')) {
    return true
  }
  if (raw === null || raw === undefined) return false
  const s = String(raw).toLowerCase()
  const needle = v.toLowerCase()
  switch (rule.operator) {
    case 'contains':
      return s.includes(needle)
    case 'notContains':
      return !s.includes(needle)
    case 'equals':
      return s === needle
    case 'notEquals':
      return s !== needle
    case 'startsWith':
      return s.startsWith(needle)
    case 'lt':
      return Number(raw) < Number(v)
    case 'gt':
      return Number(raw) > Number(v)
    default:
      return false
  }
}

/** Runs a rule-based query against all people (robust to free-form dates). */
export function runPersonQuery(query: PersonQuery): Person[] {
  const rules = query.rules.filter((r) => r.operator === 'isEmpty' || r.operator === 'notEmpty' || r.value.trim() !== '')
  if (rules.length === 0) return []
  const people = People.list()
  // Occupation titles per person (occupations live in their own table now).
  const titlesByPerson = new Map<string, string[]>()
  for (const o of Occupations.all()) {
    if (!o.title) continue
    const arr = titlesByPerson.get(o.personId) ?? []
    arr.push(o.title)
    titlesByPerson.set(o.personId, arr)
  }
  return people.filter((p) => {
    const titles = titlesByPerson.get(p.id) ?? []
    const results = rules.map((r) => matchRule(p, r, titles))
    return query.combinator === 'AND' ? results.every(Boolean) : results.some(Boolean)
  })
}
