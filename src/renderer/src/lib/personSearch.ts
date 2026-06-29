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

/** Linguistic match against a person's primary name OR any of their aliases. */
export function personMatches(person: Person, aliasNames: string[], query: string): boolean {
  if (!query.trim()) return true
  if (matchesName(query, fullName(person))) return true
  return aliasNames.some((n) => matchesName(query, n))
}

/** Best relevance score across the primary name and aliases (0 = no match). */
export function personScore(person: Person, aliasNames: string[], query: string): number {
  let best = nameScore(query, fullName(person))
  for (const n of aliasNames) best = Math.max(best, nameScore(query, n) * 0.9)
  return best
}
