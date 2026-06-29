import { People } from './repo'
import { norm } from '@shared/nameMatch'
import type { NameGroup, Person } from '@shared/types'

/**
 * Folds a name to a comparable key: lowercase, diacritics stripped, and the
 * Hungarian letter equivalences y→i / w→v applied — so "Kovács", "Kovacs",
 * "KOVÁCS", "József" / "Jozsef", "Wesselényi" / "Veselényi" collapse to one key.
 */
const nameFold = (s: string): string => norm(s).replace(/y/g, 'i').replace(/w/g, 'v')

/** 1 if the name carries an accent (diacritic), else 0 — used to prefer the
 *  accented spelling as canonical when counts tie. */
const accentRank = (s: string): number =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '') !== s ? 1 : 0

/**
 * Groups the tree's values of a chosen name field (surname or given name) by
 * their folded key and returns every group written in MORE THAN ONE way — i.e.
 * spelling/accent variants of the same name. The `suggested` canonical is the
 * most common spelling (ties prefer the accented, then alphabetical form). These
 * are normalization candidates, not hard errors.
 */
function nameVariants(field: (p: Person) => string): NameGroup[] {
  const groups = new Map<string, Map<string, number>>()
  for (const p of People.list()) {
    const s = field(p).trim()
    if (s.length < 2) continue
    const key = nameFold(s)
    if (!key) continue
    const g = groups.get(key) ?? new Map<string, number>()
    g.set(s, (g.get(s) ?? 0) + 1)
    groups.set(key, g)
  }

  const out: NameGroup[] = []
  for (const [key, g] of groups) {
    if (g.size < 2) continue
    const variants = [...g.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          accentRank(b.name) - accentRank(a.name) ||
          a.name.localeCompare(b.name)
      )
    out.push({
      key,
      suggested: variants[0].name,
      total: variants.reduce((s, v) => s + v.count, 0),
      variants
    })
  }
  out.sort((a, b) => b.total - a.total)
  return out
}

/** Spelling/accent variants of surnames. */
export function surnameVariants(): NameGroup[] {
  return nameVariants((p) => p.surname)
}

/** Spelling/accent variants of given (first) names. */
export function givenNameVariants(): NameGroup[] {
  return nameVariants((p) => p.givenName)
}

/**
 * Rewrites every person whose chosen field is one of `variants` to `canonical`.
 * Returns how many people changed. Each change goes through the normal update
 * path, so it lands in the audit log and is undoable.
 */
function rewriteName(
  variants: string[],
  canonical: string,
  field: (p: Person) => string,
  apply: (id: string, value: string) => void
): number {
  const canon = canonical.trim()
  if (!canon) return 0
  const set = new Set(variants.map((v) => v.trim()).filter((v) => v && v !== canon))
  if (!set.size) return 0
  let n = 0
  for (const p of People.list()) {
    if (set.has(field(p).trim())) {
      apply(p.id, canon)
      n++
    }
  }
  return n
}

export function normalizeSurname(variants: string[], canonical: string): number {
  return rewriteName(variants, canonical, (p) => p.surname, (id, surname) => {
    People.update(id, { surname })
  })
}

export function normalizeGivenName(variants: string[], canonical: string): number {
  return rewriteName(variants, canonical, (p) => p.givenName, (id, givenName) => {
    People.update(id, { givenName })
  })
}
