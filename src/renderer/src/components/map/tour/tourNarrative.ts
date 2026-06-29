import type { Family, Person, Sex } from '@shared/types'

export type TourLang = 'hu' | 'en' | 'de'
export type TourKind = 'patriline'

export interface TourPlace {
  lat: number
  lon: number
  place: string
  year: number | null
}

export interface TourSpouse {
  name: string
  lifespan: string
}

export interface TourStep {
  personId: string
  name: string
  lifespan: string
  sex: Sex
  birthYear: number | null
  deathYear: number | null
  place: string | null
  lat: number | null
  lon: number | null
  /** 1-based position from the oldest ancestor. */
  ordinal: number
  total: number
  /** Generations above the start person (0 = the start person themself). */
  genFromStart: number
  prose: string
  spouses: TourSpouse[]
  childrenCount: number
  occupation: string | null
}

// ---- helpers ----------------------------------------------------------------

function yearNum(d: string | null): number | null {
  if (!d) return null
  const m = d.match(/\d{4}/)
  return m ? Number(m[0]) : null
}
function displayName(p: Person, lang: TourLang): string {
  const g = (p.givenName ?? '').trim()
  const s = (p.surname ?? '').trim()
  return (lang === 'hu' ? `${s} ${g}` : `${g} ${s}`).trim() || '—'
}
function lifespan(p: Person): string {
  const b = yearNum(p.birthDate)
  const d = yearNum(p.deathDate)
  if (b && d) return `${b}–${d}`
  if (b) return `${b}–`
  if (d) return `–${d}`
  return ''
}
function age(p: Person): number | null {
  const b = yearNum(p.birthDate)
  const d = yearNum(p.deathDate)
  return b && d && d >= b && d - b < 120 ? d - b : null
}
// Hungarian inessive year suffix ("1869-ben" / "1828-ban").
function huYearLoc(y: number): string {
  const u = y % 10
  const t = y % 100
  let back: boolean
  if (u !== 0) back = [false, false, false, true, false, false, true, false, true, false][u]
  else if (t !== 0) back = [false, false, true, true, false, false, true, false, true, false][t / 10]
  else back = true
  return `${y}-${back ? 'ban' : 'ben'}`
}
const NUM: Record<TourLang, string[]> = {
  hu: ['', 'egy', 'két', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc', 'tíz', 'tizenegy', 'tizenkét'],
  en: ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'],
  de: ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf']
}
const numWord = (n: number, lang: TourLang): string => (n < NUM[lang].length ? NUM[lang][n] : String(n))

interface Graph {
  byId: Map<string, Person>
  fatherOf: Map<string, string>
  marriagesOf: Map<string, Family[]>
  childrenCountOf: Map<string, number>
}
function buildGraph(people: Person[], families: Family[]): Graph {
  const byId = new Map(people.map((p) => [p.id, p]))
  const fatherOf = new Map<string, string>()
  const marriagesOf = new Map<string, Family[]>()
  const kids = new Map<string, Set<string>>()
  for (const f of families) {
    for (const c of f.childIds) if (f.husbandId) fatherOf.set(c, f.husbandId)
    for (const pid of [f.husbandId, f.wifeId]) {
      if (!pid) continue
      ;(marriagesOf.get(pid) ?? marriagesOf.set(pid, []).get(pid)!).push(f)
      const set = kids.get(pid) ?? kids.set(pid, new Set()).get(pid)!
      for (const c of f.childIds) set.add(c)
    }
  }
  const childrenCountOf = new Map<string, number>()
  for (const [pid, set] of kids) childrenCountOf.set(pid, set.size)
  return { byId, fatherOf, marriagesOf, childrenCountOf }
}

function spousesOf(p: Person, g: Graph, lang: TourLang): TourSpouse[] {
  const out: TourSpouse[] = []
  for (const f of g.marriagesOf.get(p.id) ?? []) {
    const sid = f.husbandId === p.id ? f.wifeId : f.husbandId
    const sp = sid ? g.byId.get(sid) : null
    if (sp) out.push({ name: displayName(sp, lang), lifespan: lifespan(sp) })
  }
  return out
}

function prose(p: Person, g: Graph, genFromStart: number, lang: TourLang): string {
  const male = p.sex === 'M'
  const by = yearNum(p.birthDate)
  const dy = yearNum(p.deathDate)
  const bp = (p.birthPlace ?? '').trim()
  const occ = (p.occupation ?? '').trim()
  const spouses = spousesOf(p, g, lang)
  const kids = g.childrenCountOf.get(p.id) ?? 0
  const s: string[] = []

  if (lang === 'hu') {
    if (by) s.push(`${huYearLoc(by)} látta meg a napvilágot${bp ? ` (${bp})` : ''}.`)
    else if (bp) s.push(`Élete ${bp} községéhez kötődik.`)
    if (spouses.length === 1) s.push(`Hitvese ${spouses[0].name}${spouses[0].lifespan ? ` (${spouses[0].lifespan})` : ''} volt.`)
    else if (spouses.length > 1) s.push(`${numWord(spouses.length, 'hu')} házasságot kötött (${spouses.map((x) => x.name).join(', ')}).`)
    if (kids) s.push(`${numWord(kids, 'hu').charAt(0).toUpperCase()}${numWord(kids, 'hu').slice(1)} gyermeke született.`)
    if (occ) s.push(`Foglalkozása ${occ.toLowerCase()} volt.`)
    if (dy) {
      const a = age(p)
      s.push(`${huYearLoc(dy)}${a ? `, ${a} évesen` : ''} hunyt el.`)
    }
    s.push(genFromStart <= 1 ? 'Itt ér össze a vér veled.' : 'Innen folytatódik a vér a következő nemzedék felé.')
  } else if (lang === 'de') {
    if (by) s.push(`Geboren ${by}${bp ? ` in ${bp}` : ''}.`)
    if (spouses.length === 1) s.push(`Ehepartner: ${spouses[0].name}${spouses[0].lifespan ? ` (${spouses[0].lifespan})` : ''}.`)
    else if (spouses.length > 1) s.push(`${numWord(spouses.length, 'de')} Ehen (${spouses.map((x) => x.name).join(', ')}).`)
    if (kids) s.push(`${numWord(kids, 'de')} Kinder.`)
    if (occ) s.push(`Beruf: ${occ}.`)
    if (dy) {
      const a = age(p)
      s.push(`Gestorben ${dy}${a ? ` im Alter von ${a}` : ''}.`)
    }
    s.push(genFromStart <= 1 ? 'Hier trifft das Blut auf dich.' : 'Von hier fließt das Blut weiter zur nächsten Generation.')
  } else {
    if (by) s.push(`Born in ${by}${bp ? `, in ${bp}` : ''}.`)
    if (spouses.length === 1) s.push(`Married ${spouses[0].name}${spouses[0].lifespan ? ` (${spouses[0].lifespan})` : ''}.`)
    else if (spouses.length > 1) s.push(`Married ${numWord(spouses.length, 'en')} times (${spouses.map((x) => x.name).join(', ')}).`)
    if (kids) s.push(`Had ${numWord(kids, 'en')} children.`)
    if (occ) s.push(`Worked as ${occ.toLowerCase()}.`)
    if (dy) {
      const a = age(p)
      s.push(`Died in ${dy}${a ? `, aged ${a}` : ''}.`)
    }
    s.push(genFromStart <= 1 ? 'Here the bloodline reaches you.' : 'From here the bloodline flows on to the next generation.')
  }
  return s.join(' ')
}

// ---- public -----------------------------------------------------------------

/** Builds the paternal-line journey: the start person's father-chain, ordered
 *  from the oldest known paternal ancestor down to the start person. */
export function buildPatrilineTour(
  people: Person[],
  families: Family[],
  startId: string,
  coords: Map<string, TourPlace>,
  lang: TourLang
): TourStep[] {
  const g = buildGraph(people, families)
  if (!g.byId.has(startId)) return []

  // Walk fathers upward, guard against cycles.
  const chain: string[] = [startId]
  const seen = new Set<string>([startId])
  let cur = startId
  for (let i = 0; i < 200; i++) {
    const f = g.fatherOf.get(cur)
    if (!f || seen.has(f)) break
    chain.push(f)
    seen.add(f)
    cur = f
  }
  // chain is start → father → … → oldest. Reverse: oldest first.
  chain.reverse()
  const total = chain.length

  return chain.map((id, idx) => {
    const p = g.byId.get(id)!
    const genFromStart = total - 1 - idx
    const c = coords.get(id) ?? null
    return {
      personId: id,
      name: displayName(p, lang),
      lifespan: lifespan(p),
      sex: p.sex,
      birthYear: yearNum(p.birthDate),
      deathYear: yearNum(p.deathDate),
      place: c?.place ?? (p.birthPlace ?? p.deathPlace ?? null),
      lat: c?.lat ?? null,
      lon: c?.lon ?? null,
      ordinal: idx + 1,
      total,
      genFromStart,
      prose: prose(p, g, genFromStart, lang),
      spouses: spousesOf(p, g, lang),
      childrenCount: g.childrenCountOf.get(id) ?? 0,
      occupation: (p.occupation ?? '').trim() || null
    }
  })
}
