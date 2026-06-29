/**
 * Maps FamilySearch's official GEDCOM-X responses (the /platform/tree/* API)
 * into the app's existing `FsNode` stream, so the proven `FsIngester` DB writer
 * is reused unchanged.
 *
 * Only the fields the importer needs are typed here; the GEDCOM-X documents are
 * large, so everything is read defensively (any shape that doesn't match is just
 * skipped rather than throwing).
 *
 * NOTE: validated against the documented schema; real-response edge cases are
 * refined once a developer key is available to exercise the live API.
 */
import type { FsNode } from '../db/fsIngest'

// ---- Minimal GEDCOM-X shapes (only what we read) ---------------------------
interface GxConclusionDate {
  original?: string
  formal?: string
}
interface GxFact {
  type?: string
  value?: string
  date?: GxConclusionDate
  place?: { original?: string }
}
interface GxNamePart {
  type?: string
  value?: string
}
interface GxName {
  preferred?: boolean
  nameForms?: { fullText?: string; parts?: GxNamePart[] }[]
}
interface GxDisplay {
  name?: string
  gender?: string
  lifespan?: string
  birthDate?: string
  birthPlace?: string
  deathDate?: string
  deathPlace?: string
  ascendancyNumber?: string
}
export interface GxPerson {
  id?: string
  living?: boolean
  gender?: { type?: string }
  names?: GxName[]
  facts?: GxFact[]
  display?: GxDisplay
}
interface GxResourceRef {
  resourceId?: string
  resource?: string
}
interface GxCoupleRelationship {
  type?: string
  person1?: GxResourceRef
  person2?: GxResourceRef
  facts?: GxFact[]
}
interface GxChildAndParents {
  child?: GxResourceRef
  parent1?: GxResourceRef
  parent2?: GxResourceRef
}
export interface GxDocument {
  persons?: GxPerson[]
  relationships?: GxCoupleRelationship[]
  childAndParentsRelationships?: GxChildAndParents[]
}

// ---- Helpers ---------------------------------------------------------------
const GX = 'http://gedcomx.org/'
const refId = (r?: GxResourceRef): string | null =>
  r?.resourceId ?? (r?.resource ? r.resource.replace(/^.*[/#]/, '') : null)

/** GEDCOM-X gender type → our M/F/U. */
function sexOf(p: GxPerson): 'M' | 'F' | 'U' {
  const t = p.gender?.type ?? p.display?.gender ?? ''
  if (/Male$/i.test(t) || /^male$/i.test(t)) return 'M'
  if (/Female$/i.test(t) || /^female$/i.test(t)) return 'F'
  return 'U'
}

/** A fact's date: prefer the human-readable original, else the formal value. */
const factDate = (f?: GxFact): string | null => f?.date?.original ?? f?.date?.formal?.replace(/^\+/, '') ?? null
const factPlace = (f?: GxFact): string | null => f?.place?.original ?? null
const findFact = (p: GxPerson, suffix: string): GxFact | undefined =>
  p.facts?.find((f) => f.type === GX + suffix)

/** Given + surname from the preferred name (falls back to any name / display). */
function nameOf(p: GxPerson): { g: string; s: string; alt: { g: string; s: string }[] } {
  const names = p.names ?? []
  const pick = (n: GxName): { g: string; s: string } => {
    const parts = n.nameForms?.[0]?.parts ?? []
    const g = parts.filter((x) => x.type === GX + 'Given').map((x) => x.value ?? '').join(' ').trim()
    const s = parts.filter((x) => x.type === GX + 'Surname').map((x) => x.value ?? '').join(' ').trim()
    if (g || s) return { g, s }
    // No typed parts → split the full text (surname last token, best-effort).
    const full = (n.nameForms?.[0]?.fullText ?? '').trim()
    const toks = full.split(/\s+/).filter(Boolean)
    return toks.length > 1 ? { g: toks.slice(0, -1).join(' '), s: toks.at(-1)! } : { g: full, s: '' }
  }
  const preferred = names.find((n) => n.preferred) ?? names[0]
  const main = preferred ? pick(preferred) : { g: p.display?.name ?? '', s: '' }
  const alt: { g: string; s: string }[] = []
  for (const n of names) {
    if (n === preferred) continue
    const a = pick(n)
    if ((a.g || a.s) && !(a.g === main.g && a.s === main.s)) alt.push(a)
  }
  return { ...main, alt }
}

// ---- Mapping ---------------------------------------------------------------
/** One GEDCOM-X person → a PersonNode (`t:'i'`) for the ingester. */
export function personToNode(p: GxPerson): FsNode | null {
  const fid = p.id
  if (!fid) return null
  const { g, s, alt } = nameOf(p)
  const d = p.display ?? {}
  const birth = findFact(p, 'Birth')
  const death = findFact(p, 'Death')
  const chr = findFact(p, 'Christening')
  const burial = findFact(p, 'Burial')
  const religion = findFact(p, 'Religion')

  // Occupations (a person may hold several).
  const oc = (p.facts ?? [])
    .filter((f) => f.type === GX + 'Occupation')
    .map((f) => ({ title: (f.value ?? '').trim(), date: factDate(f), place: factPlace(f) }))
    .filter((o) => o.title)

  // Any other non-vital fact → a generic life event.
  const VITAL = new Set(['Birth', 'Death', 'Christening', 'Burial', 'Occupation', 'Religion'].map((x) => GX + x))
  const ev = (p.facts ?? [])
    .filter((f) => f.type && !VITAL.has(f.type))
    .map((f) => ({
      type: (f.type ?? '').replace(GX, '').replace(/^.*[/#]/, '') || 'other',
      date: factDate(f),
      place: factPlace(f),
      value: f.value ?? null
    }))

  return {
    t: 'i',
    fid,
    g,
    s,
    x: sexOf(p),
    bd: factDate(birth) ?? d.birthDate ?? null,
    bp: factPlace(birth) ?? d.birthPlace ?? null,
    dd: factDate(death) ?? d.deathDate ?? null,
    dp: factPlace(death) ?? d.deathPlace ?? null,
    dc: p.living === false || death ? 1 : undefined,
    cd: factDate(chr),
    cp: factPlace(chr),
    bud: factDate(burial),
    bup: factPlace(burial),
    re: religion?.value ?? null,
    alt: alt.length ? alt : undefined,
    oc: oc.length ? oc : undefined,
    ev: ev.length ? ev : undefined
  }
}

/** Couple + child-and-parents relationships → CoupleNode / ChildNode stream. */
export function relationshipNodes(doc: GxDocument): FsNode[] {
  const out: FsNode[] = []
  for (const r of doc.relationships ?? []) {
    if (r.type && !/Couple$/i.test(r.type)) continue
    const a = refId(r.person1)
    const b = refId(r.person2)
    if (!a || !b) continue
    const marr = r.facts?.find((f) => f.type === GX + 'Marriage')
    out.push({ t: 'f', a, b, md: factDate(marr), mp: factPlace(marr) })
  }
  for (const cap of doc.childAndParentsRelationships ?? []) {
    const c = refId(cap.child)
    if (!c) continue
    out.push({ t: 'c', f: refId(cap.parent1), m: refId(cap.parent2), c })
  }
  return out
}

/** Stream EVERY node from an ancestry/person document: people first, then edges
 *  (the ingester expects complete persons before the relationships). */
export function documentToNodes(doc: GxDocument): FsNode[] {
  const nodes: FsNode[] = []
  for (const p of doc.persons ?? []) {
    const n = personToNode(p)
    if (n) nodes.push(n)
  }
  nodes.push(...relationshipNodes(doc))
  return nodes
}
