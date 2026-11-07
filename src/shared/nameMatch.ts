/**
 * Linguistic name matching for historical Central-European genealogy.
 *
 * Handles the reality that one ancestor appears under many spellings/languages:
 * Latin (Joannes), German (Johann), Hungarian (János), etc. Matching combines
 * diacritic-insensitive normalization, a synonym dictionary of equivalent name
 * roots, and a small edit-distance tolerance for spelling drift (Kovács/Kovats).
 */

/** Latin letters NFD does not decompose, folded to plain Latin so "Łukasz" /
 *  "Lukasz", "Weiß" / "Weiss" and "Søren" / "Soren" still meet. */
const FOLD: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ħ: 'h',
  ı: 'i'
}

/**
 * Lowercase, strip diacritics & punctuation → a comparable token. Letters of
 * every script must survive (Cyrillic, Greek, …): a key that comes out empty
 * would make every such name look identical to every other.
 */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ßæœøłđðþħı]/g, (c) => FOLD[c] ?? c)
    .replace(/[^\p{L}\p{N}]/gu, '')
}

// Groups of historically-equivalent given names (Latin / German / Hungarian /
// English / Slavic, Cyrillic forms included). First entry is the canonical key.
const SYNONYM_GROUPS: string[][] = [
  ['johann', 'joannes', 'johannes', 'janos', 'john', 'jan', 'ivan', 'hans', 'jean', 'giovanni', 'juan', 'иван', 'иоанн', 'іван', 'ян'],
  ['georg', 'georgius', 'gyorgy', 'george', 'jiri', 'jurij', 'gyuri', 'jerzy', 'георгий', 'юрий', 'егор'],
  ['stephan', 'stephanus', 'istvan', 'steven', 'stefan', 'stephen', 'pista', 'szczepan', 'степан', 'стефан'],
  ['joseph', 'josephus', 'jozsef', 'josef', 'jozef', 'giuseppe', 'jozsi', 'иосиф', 'осип'],
  ['michael', 'mihaly', 'michal', 'mikhail', 'michel', 'misi', 'михаил', 'михайло'],
  ['nicholas', 'nicolaus', 'miklos', 'nikolaus', 'nikola', 'mikulas', 'mikolaj', 'николай', 'микола'],
  ['peter', 'petrus', 'peter', 'pietro', 'pedro', 'petr', 'piotr', 'пётр', 'петро'],
  ['paul', 'paulus', 'pal', 'paolo', 'pavel', 'pablo', 'pawel', 'павел', 'павло'],
  ['andrew', 'andreas', 'andras', 'andre', 'andrej', 'andi', 'andrzej', 'андрей', 'андрій'],
  ['anthony', 'antonius', 'antal', 'anton', 'antonio', 'antonin', 'antoni', 'антон', 'антоний'],
  ['francis', 'franciscus', 'ferenc', 'franz', 'francesco', 'frantisek', 'feri', 'franciszek', 'франц'],
  ['ladislaus', 'laszlo', 'ladislav', 'laci', 'wladyslaw', 'владислав'],
  ['emeric', 'emericus', 'imre'],
  ['matthias', 'mathias', 'matyas', 'matthew', 'matej', 'mate', 'maciej', 'mateusz', 'матвей'],
  ['thomas', 'tamas', 'tomas', 'tom', 'tomasz', 'фома'],
  ['martin', 'martinus', 'marton', 'marci', 'marcin', 'мартин'],
  ['gregory', 'gregorius', 'gergely', 'gregor', 'gergo', 'grzegorz', 'григорий'],
  ['alexander', 'sandor', 'aleksandr', 'alexius', 'aleksander', 'александр'],
  ['charles', 'carolus', 'karoly', 'karl', 'carlo', 'karcsi', 'karol', 'карл'],
  ['louis', 'ludovicus', 'lajos', 'ludwig', 'luigi', 'ludwik', 'людвиг'],
  ['william', 'guilelmus', 'vilmos', 'wilhelm', 'вильгельм'],
  ['mary', 'maria', 'marie', 'mari', 'mariska', 'мария', 'марья'],
  ['elizabeth', 'elisabetha', 'erzsebet', 'elisabeth', 'erzsi', 'bozsi', 'elzbieta', 'елизавета'],
  ['catherine', 'catharina', 'katalin', 'katharina', 'kata', 'kati', 'katarzyna', 'екатерина', 'катерина'],
  ['anne', 'anna', 'anci', 'annus', 'анна'],
  ['margaret', 'margaretha', 'margit', 'margarethe', 'manci', 'malgorzata', 'маргарита'],
  ['helen', 'helena', 'ilona', 'helene', 'ilus', 'елена', 'олена'],
  ['barbara', 'borbala', 'barbora', 'bori', 'варвара'],
  ['theresa', 'theresia', 'terez', 'teresa', 'teri', 'тереза'],
  ['eve', 'eva', 'evi', 'ewa', 'ева'],
  ['julia', 'julianna', 'juliana', 'juli', 'юлия', 'юлиания'],
  ['rosalia', 'rozalia', 'rozsa', 'rosa', 'розалия'],
  ['agnes', 'agnesa', 'agi', 'agnieszka', 'агнесса'],
  ['susanna', 'zsuzsanna', 'susan', 'zsuzsa', 'zuzanna', 'сусанна']
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

/** Split a name field into trimmed, non-empty word tokens. */
function nameTokens(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean)
}

/** Word tokens that still carry letters or digits after normalization — a
 *  stray "-" or "&" in a query must neither match nor block a name. */
function meaningfulTokens(s: string): string[] {
  return nameTokens(s).filter((tok) => norm(tok) !== '')
}

/**
 * Whether `query` matches `fullName` linguistically — every query word must map
 * to some word in the name. "Kovács János" matches "Joannes Kovats".
 */
export function matchesName(query: string, fullName: string): boolean {
  if (!query.trim()) return true
  const qs = meaningfulTokens(query)
  if (!qs.length) return false
  const ts = meaningfulTokens(fullName)
  if (!ts.length) return false
  return qs.every((q) => ts.some((t) => tokenMatch(q, t)))
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
  const givenMatch = meaningfulTokens(givenA).some((x) =>
    meaningfulTokens(givenB).some((y) => canon(x) === canon(y))
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
  if (!query.trim()) return 1
  const qs = meaningfulTokens(query)
  if (!qs.length) return 0
  const ts = meaningfulTokens(fullName)
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
