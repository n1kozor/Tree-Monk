import { matchesName, nameScore } from './nameMatch'
import { fullName } from './utils'
import type { Alias, Person } from '@shared/types'

/** Group alias display-names by person id. */
export function aliasMap(aliases: Alias[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const a of aliases) {
    const name = `${a.givenName} ${a.surname}`.trim()
    if (!name) continue
    const arr = m.get(a.personId) ?? []
    arr.push(name)
    m.set(a.personId, arr)
  }
  return m
}

/** A query wrapped in quotes ("Dosa") asks for an EXACT, accent-sensitive
 *  match — "Dosa" finds only the short-o spelling, never "Dósa". Typographic
 *  quotes count too: Hungarian „…”, curly “…”, guillemets »…« / «…». */
function exactQuery(query: string): string | null {
  const m = /^\s*["„“”»«](.*)["„“”»«]\s*$/.exec(query)
  const inner = m?.[1].trim()
  return inner ? inner : null
}

/** Case-insensitive but accent-SENSITIVE substring over both name orders. */
function exactHit(person: { givenName: string; surname: string }, aliasNames: string[], needle: string): boolean {
  const n = needle.toLowerCase()
  const forms = [
    `${person.givenName} ${person.surname}`,
    `${person.surname} ${person.givenName}`,
    ...aliasNames
  ]
  return forms.some((f) => f.trim().toLowerCase().includes(n))
}

/** Linguistic match against a person's primary name OR any of their aliases. */
export function personMatches(person: Person, aliasNames: string[], query: string): boolean {
  if (!query.trim()) return true
  const exact = exactQuery(query)
  if (exact !== null) return exactHit(person, aliasNames, exact)
  if (matchesName(query, fullName(person))) return true
  return aliasNames.some((n) => matchesName(query, n))
}

/** Best relevance score across the primary name and aliases (0 = no match). */
export function personScore(person: Person, aliasNames: string[], query: string): number {
  const exact = exactQuery(query)
  if (exact !== null) return exactHit(person, aliasNames, exact) ? 100 : 0
  let best = nameScore(query, fullName(person))
  for (const n of aliasNames) best = Math.max(best, nameScore(query, n) * 0.9)
  return best
}
