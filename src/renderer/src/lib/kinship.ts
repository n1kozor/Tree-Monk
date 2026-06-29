import type { RelationKind, Sex } from '@shared/types'

/** An i18n key + params describing one person's relationship to the start. */
export interface RelTerm {
  key: string
  params?: Record<string, number>
  /** When true the blood term is reached through marriage (in-law). */
  inLaw?: boolean
}

/**
 * Derives the kinship term of a person relative to the START person from the
 * sequence of hops (parent/child/spouse) that the shortest path took to reach
 * them. Counts upward (parent) and downward (child) generations to the nearest
 * common ancestor — the classic kinship calculation — and names the result,
 * gender-aware where the language distinguishes it.
 *
 * Shortest family paths run "up to a common ancestor, then down", so the up/down
 * counts fully describe blood relationships. A spouse hop makes it an in-law
 * relationship; a path that is only a spouse hop is the spouse itself.
 */
export function relationTerm(steps: RelationKind[], sex: Sex): RelTerm {
  const g = (m: string, f: string, n: string): string => (sex === 'M' ? m : sex === 'F' ? f : n)
  const K = 'kinship.term.'

  // Affinity through marriage: a path that hops to the SPOUSE first and then
  // walks a pure blood line reaches the SPOUSE's relatives, NOT the start
  // person's own (e.g. the wife's great-grandfather is not "your great-
  // grandfather"). Label these as "your spouse's <relation>".
  if (steps[0] === 'spouse' && steps.length > 1 && !steps.slice(1).includes('spouse')) {
    let u = 0
    let d = 0
    for (const r of steps.slice(1)) r === 'parent' ? u++ : d++
    if (d === 0) {
      if (u === 1) return { key: `${K}${g('spouseFather', 'spouseMother', 'spouseParent')}` }
      if (u === 2)
        return { key: `${K}${g('spouseGrandfather', 'spouseGrandmother', 'spouseGrandparent')}` }
      if (u === 3)
        return {
          key: `${K}${g('spouseGreatGrandfather', 'spouseGreatGrandmother', 'spouseGreatGrandparent')}`
        }
      return { key: `${K}spouseAncestor`, params: { gen: u } }
    }
    if (u === 0) {
      if (d === 1) return { key: `${K}${g('spouseSon', 'spouseDaughter', 'spouseChild')}` }
      return { key: `${K}spouseDescendant`, params: { gen: d } }
    }
    // Spouse's collateral (sibling/cousin/…) → fall through to the generic
    // in-law wrap below, which marks it "(by marriage)".
  }

  let up = 0
  let down = 0
  let spouse = 0
  for (const r of steps) {
    if (r === 'parent') up++
    else if (r === 'child') down++
    else spouse++
  }

  // The start person themselves.
  if (up === 0 && down === 0 && spouse === 0) return { key: `${K}self` }

  // A pure marriage hop → spouse (or, via several spouses, just "by marriage").
  if (up === 0 && down === 0) {
    if (spouse === 1) return { key: `${K}${g('husband', 'wife', 'spouse')}` }
    return { key: `${K}byMarriage` }
  }

  const inLaw = spouse > 0
  let core: RelTerm

  if (down === 0) {
    // Direct ancestor.
    if (up === 1) core = { key: `${K}${g('father', 'mother', 'parent')}` }
    else if (up === 2) core = { key: `${K}${g('grandfather', 'grandmother', 'grandparent')}` }
    else if (up === 3)
      core = { key: `${K}${g('greatGrandfather', 'greatGrandmother', 'greatGrandparent')}` }
    else core = { key: `${K}ancestorDeep`, params: { gen: up } }
  } else if (up === 0) {
    // Direct descendant.
    if (down === 1) core = { key: `${K}${g('son', 'daughter', 'child')}` }
    else if (down === 2) core = { key: `${K}grandchild` }
    else if (down === 3) core = { key: `${K}greatGrandchild` }
    else core = { key: `${K}descendantDeep`, params: { gen: down } }
  } else if (up === 1 && down === 1) {
    core = { key: `${K}${g('brother', 'sister', 'sibling')}` }
  } else if (down === 1 && up >= 2) {
    // Parent's sibling line (uncle / aunt → great-uncle / great-aunt).
    if (up === 2) core = { key: `${K}${g('uncle', 'aunt', 'pibling')}` }
    else core = { key: `${K}${g('greatUncle', 'greatAunt', 'greatPibling')}` }
  } else if (up === 1 && down >= 2) {
    // Sibling's descendant line (nephew / niece → grand-nephew / grand-niece).
    if (down === 2) core = { key: `${K}${g('nephew', 'niece', 'nibling')}` }
    else core = { key: `${K}${g('grandNephew', 'grandNiece', 'grandNibling')}` }
  } else {
    // Cousins: degree = generations to the common ancestor − 1; removed = the
    // generation gap between the two branches.
    const degree = Math.min(up, down) - 1
    const removed = Math.abs(up - down)
    core =
      degree === 1 && removed === 0
        ? { key: `${K}cousin` }
        : { key: `${K}cousinComplex`, params: { degree, removed } }
  }

  return inLaw ? { ...core, inLaw: true } : core
}
