/**
 * Linguistic name matching for historical Central-European genealogy.
 *
 * Handles the reality that one ancestor appears under many spellings/languages:
 * Latin (Joannes), German (Johann), Hungarian (János), etc. Matching combines
 * diacritic-insensitive normalization, a synonym dictionary of equivalent name
 * roots, and a small edit-distance tolerance for spelling drift (Kovács/Kovats).
 */

/** Lowercase, strip diacritics & punctuation → a comparable token. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Groups of historically-equivalent given names (Latin / German / Hungarian /
// English / Slavic). First entry is the canonical key for the group.
const SYNONYM_GROUPS: string[][] = [
  ['johann', 'joannes', 'johannes', 'janos', 'john', 'jan', 'ivan', 'hans', 'jean', 'giovanni', 'juan'],
  ['georg', 'georgius', 'gyorgy', 'george', 'jiri', 'jurij', 'gyuri'],
  ['stephan', 'stephanus', 'istvan', 'steven', 'stefan', 'stephen', 'pista'],
  ['joseph', 'josephus', 'jozsef', 'josef', 'jozef', 'giuseppe', 'jozsi'],
  ['michael', 'mihaly', 'michal', 'mikhail', 'michel', 'misi'],
  ['nicholas', 'nicolaus', 'miklos', 'nikolaus', 'nikola', 'mikulas'],
  ['peter', 'petrus', 'peter', 'pietro', 'pedro', 'petr'],
  ['paul', 'paulus', 'pal', 'paolo', 'pavel', 'pablo'],
  ['andrew', 'andreas', 'andras', 'andre', 'andrej', 'andi'],
  ['anthony', 'antonius', 'antal', 'anton', 'antonio', 'antonin'],
  ['francis', 'franciscus', 'ferenc', 'franz', 'francesco', 'frantisek', 'feri'],
  ['ladislaus', 'laszlo', 'ladislav', 'laci'],
  ['emeric', 'emericus', 'imre'],
  ['matthias', 'mathias', 'matyas', 'matthew', 'matej', 'mate'],
  ['thomas', 'tamas', 'tomas', 'tom'],
  ['martin', 'martinus', 'marton', 'marci'],
  ['gregory', 'gregorius', 'gergely', 'gregor', 'gergo'],
  ['alexander', 'sandor', 'aleksandr', 'alexius'],
  ['charles', 'carolus', 'karoly', 'karl', 'carlo', 'karcsi'],
  ['louis', 'ludovicus', 'lajos', 'ludwig', 'luigi'],
  ['william', 'guilelmus', 'vilmos', 'wilhelm'],
  ['mary', 'maria', 'marie', 'mari', 'mariska'],
  ['elizabeth', 'elisabetha', 'erzsebet', 'elisabeth', 'erzsi', 'bozsi'],
  ['catherine', 'catharina', 'katalin', 'katharina', 'kata', 'kati'],
  ['anne', 'anna', 'anci', 'annus'],
  ['margaret', 'margaretha', 'margit', 'margarethe', 'manci'],
  ['helen', 'helena', 'ilona', 'helene', 'ilus'],
  ['barbara', 'borbala', 'barbora', 'bori'],
  ['theresa', 'theresia', 'terez', 'teresa', 'teri'],
  ['eve', 'eva', 'evi'],
  ['julia', 'julianna', 'juliana', 'juli'],
  ['rosalia', 'rozalia', 'rozsa', 'rosa'],
  ['agnes', 'agnesa', 'agi'],
  ['susanna', 'zsuzsanna', 'susan', 'zsuzsa']
]

const CANON = new Map<string, string>()
for (const group of SYNONYM_GROUPS) {
  const key = group[0]
  for (const name of group) CANON.set(norm(name), key)
}

/** Maps a token to its synonym-group key (or its normalized self). Exported so
 *  the famous-relatives matcher can equate cross-language given names (Ferenc =
 *  Franz, György = George) that FamilySearch stores anglicized. */
export function canon(token: string): string {
  const n = norm(token)
  return CANON.get(n) ?? n
}

/** Bounded Levenshtein (early-outs above `max`). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      best = Math.min(best, cur[j])
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/** True if a query token corresponds to a target token. */
function tokenMatch(q: string, t: string): boolean {
  const nq = norm(q)
  const nt = norm(t)
  if (!nq || !nt) return false
  if (nq === nt) return true
  if (canon(q) === canon(t)) return true // linguistic synonym
  if (nt.startsWith(nq) || nq.startsWith(nt)) return true // prefix (live typing)
  const tol = nq.length <= 4 ? 1 : 2
  return editDistance(nq, nt, tol) <= tol // spelling drift
}

/**
 * Whether `query` matches `fullName` linguistically — every query word must map
 * to some word in the name. "Kovács János" matches "Joannes Kovats".
 */
export function matchesName(query: string, fullName: string): boolean {
  const qs = query.trim().split(/\s+/).filter(Boolean)
  if (!qs.length) return true
  const ts = fullName.split(/\s+/).filter(Boolean)
  if (!ts.length) return false
  return qs.every((q) => ts.some((t) => tokenMatch(q, t)))
}

/** Split a name field into trimmed, non-empty word tokens. */
function nameTokens(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean)
}

/**
 * Strict name equivalence for DUPLICATE detection — deliberately tighter than the
 * fuzzy search matcher above. A given name matches ONLY when it shares a canonical
 * form (a synonym group, or an accent-folded exact match); there is NO
 * edit-distance bridging, so "Margit" never equals "Mária" (they are
 * edit-distance 2 apart but are different names). Surnames still tolerate genuine
 * spelling drift (Kovács / Kováts / Kovats). Both a given and a surname token must
 * line up for the pair to count as the same name.
 */
export function sameNameForDup(
  givenA: string,
  surnameA: string,
  givenB: string,
  surnameB: string
): boolean {
  const givenMatch = nameTokens(givenA).some((x) =>
    nameTokens(givenB).some((y) => canon(x) === canon(y))
  )
  if (!givenMatch) return false

  const sa = nameTokens(surnameA).map(norm).filter(Boolean)
  const sb = nameTokens(surnameB).map(norm).filter(Boolean)
  if (!sa.length || !sb.length) return false
  return sa.some((x) =>
    sb.some((y) => {
      if (x === y) return true
      const tol = Math.min(x.length, y.length) <= 4 ? 1 : 2
      return editDistance(x, y, tol) <= tol
    })
  )
}

/** Relevance score for ranking matches (higher = better). 0 = no match. */
export function nameScore(query: string, fullName: string): number {
  const qs = query.trim().split(/\s+/).filter(Boolean)
  if (!qs.length) return 1
  const ts = fullName.split(/\s+/).filter(Boolean)
  let score = 0
  for (const q of qs) {
    const nq = norm(q)
    let best = 0
    for (const t of ts) {
      const nt = norm(t)
      if (nq === nt) best = Math.max(best, 3)
      else if (nt.startsWith(nq)) best = Math.max(best, 2.5)
      else if (canon(q) === canon(t)) best = Math.max(best, 2)
      else if (tokenMatch(q, t)) best = Math.max(best, 1)
    }
    if (best === 0) return 0
    score += best
  }
  return score
}
