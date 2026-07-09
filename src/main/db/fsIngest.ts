import { getDb } from './connection'
import { Aliases, Citations, Collaborations, Documents, Events, Families, Godparents, Occupations, People, Places, Sources } from './repo'
import { mediaDocId } from '../mediaId'
import type { Family, FsImportNodeEvent, Person, PersonInput } from '@shared/types'

export type FsIngestEvent = FsImportNodeEvent

/** Alternate names → aliases, deduped against what's already on the person. */
export function applyFsAliases(personId: string, alt?: { g: string; s: string }[]): void {
  if (!alt?.length) return
  const have = new Set(Aliases.forPerson(personId).map((a) => `${a.givenName}|${a.surname}`))
  for (const a of alt) {
    const g = (a.g ?? '').trim()
    const s = (a.s ?? '').trim()
    if ((!g && !s) || have.has(`${g}|${s}`)) continue
    have.add(`${g}|${s}`)
    Aliases.create(personId, { givenName: g, surname: s, kind: 'aka' })
  }
}

/** Occupation facts → occupations table, deduped by title (case-insensitive). */
export function applyFsOccupations(
  personId: string,
  oc?: { title: string; date: string | null; place: string | null; note?: string | null }[]
): void {
  if (!oc?.length) return
  const have = new Set(Occupations.forPerson(personId).map((o) => o.title.trim().toLowerCase()))
  for (const o of oc) {
    const title = (o.title ?? '').trim()
    if (!title || have.has(title.toLowerCase())) continue
    have.add(title.toLowerCase())
    Occupations.create(personId, {
      title,
      startDate: o.date ?? null,
      // No place column on occupations — keep the place AND the user's reason in
      // the note so nothing is lost.
      note: [o.place, o.note].filter(Boolean).join(' · ') || null
    })
  }
}

/** Non-vital facts (residence, military, nationality, …) → events, deduped per fact.
 *  A Baptism / Christening fact is routed to the dedicated christening field (when
 *  empty) rather than listed as a loose event. */
export function applyFsEvents(
  personId: string,
  ev?: { type: string; date: string | null; place: string | null; value: string | null; no?: string | null }[]
): void {
  if (!ev?.length) return
  for (const e of ev) {
    const type = (e.type ?? 'other').trim() || 'other'
    // Baptism == christening for our model — fill the christening field when it's
    // still empty, then skip the event so the same thing isn't shown twice.
    // Loose match so variants ("Baptism", "LDS Baptism", "Christening") all count.
    if (/bapti|christen/i.test(type) && (e.date || e.place)) {
      const p = People.get(personId)
      if (p && !p.christeningDate && !p.christeningPlace) {
        People.update(personId, { christeningDate: e.date ?? null, christeningPlace: e.place ?? null })
        continue
      }
    }
    const key = `${type}|${e.date ?? ''}|${e.place ?? ''}|${e.value ?? ''}`
    Events.importOnce('person', personId, key, {
      type,
      date: e.date ?? null,
      place: e.place ?? null,
      value: e.value ?? null,
      note: e.no ?? null
    })
  }
}

/** FamilySearch notes → appended into the person's notes, non-destructively
 *  (each note added at most once, so a re-import never duplicates or overwrites). */
export function applyFsNotes(personId: string, notes?: string[]): void {
  if (!notes?.length) return
  const p = People.get(personId)
  if (!p) return
  const existing = (p.notes ?? '').trim()
  const fresh = notes.map((n) => (n ?? '').trim()).filter((n) => n && !existing.includes(n))
  if (!fresh.length) return
  const combined = existing ? `${existing}\n\n${fresh.join('\n\n')}` : fresh.join('\n\n')
  People.update(personId, { notes: combined })
}

/** FamilySearch "Collaboration" discussions → the person's own collaborations
 *  table (read-only mirror). FamilySearch is the source of truth, so a re-import
 *  replaces the set (stable FS ids keep it idempotent). Only runs when the engine
 *  actually returned discussions, so an older engine / transient empty never wipes. */
export function applyFsCollaborations(
  personId: string,
  di?: { id?: string | null; ti?: string | null; bo?: string; cr?: number | null }[]
): void {
  if (!di?.length) return
  Collaborations.replaceForPerson(
    personId,
    di.map((d) => ({
      id: d.id ?? null,
      title: d.ti ?? null,
      body: d.bo ?? '',
      createdAt: typeof d.cr === 'number' ? new Date(d.cr).toISOString() : null
    }))
  )
}

/**
 * Attach FamilySearch source nodes to a person (deduped source + citation),
 * carrying the record date so the sources sort chronologically. Used by the
 * single-person sync (the bulk importer streams these through FsIngester).
 */
export function applyFsSources(personId: string, nodes: FsNode[]): void {
  const db = getDb()
  for (const n of nodes) {
    if (n.t !== 's') continue
    db.transaction(() => {
      const s = Sources.upsert({
        gedcomId: n.sid || null,
        title: n.ti || 'Source',
        author: n.au || null,
        publication: n.pu || null,
        repositoryId: null,
        text: null,
        recordDate: n.dt ?? null
      })
      const dup = db
        .prepare(
          "SELECT id, note, page, event_tag FROM citations WHERE owner_type='person' AND owner_id=? AND source_id=?"
        )
        .get(personId, s.id) as { id: string; note: string | null; page: string | null; event_tag: string | null } | undefined
      if (!dup) {
        Citations.create({
          sourceId: s.id,
          ownerType: 'person',
          ownerId: personId,
          eventTag: n.ft || null,
          page: n.pg || null,
          quality: null,
          note: n.no || null
        })
      } else if (
        (n.no || null) !== dup.note ||
        (n.pg || null) !== dup.page ||
        (n.ft || null) !== dup.event_tag
      ) {
        // The source's citation changed on FamilySearch → refresh our copy.
        db.prepare('UPDATE citations SET note=?, page=?, event_tag=? WHERE id=?').run(
          n.no || null,
          n.pg || null,
          n.ft || null,
          dup.id
        )
      }
    })()
  }
}

/** A FamilySearch memory "title" that is really just an auto-generated artifact id
 *  — a UUID, or a bare uploaded filename. FS fills these in when the user set no
 *  real caption, so such an image is still the person's PORTRAIT, not a titled
 *  document scan. (This is why some people's FS photo wasn't picked as the avatar:
 *  their portrait carried a UUID "title" like "1848…-…056 (1)".) */
function isAutoMemoryTitle(t?: string | null): boolean {
  const s = (t ?? '').trim()
  if (!s) return true
  if (/\.(jpe?g|png|gif|webp|bmp|tiff?|heic)$/i.test(s)) return true // a bare filename
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\s*\(\d+\))?$/i.test(s)) return true // a UUID
  return false
}

/**
 * FamilySearch memories (photos / scans) → link-documents + profile photo.
 * Deduped by a content-derived id shared with the GEDCOM importer (no cross-path
 * duplicates). Heuristic: the portrait is the first image with no MEANINGFUL
 * caption (untitled, or an auto-generated UUID / filename); images with a real
 * title are treated as document scans. The avatar renders once the background
 * download localizes the file. Never overrides an avatar that's already set.
 */
export function applyFsMedia(personId: string, media?: { u: string; t: string | null }[]): void {
  if (!media?.length) return
  let firstPortrait: string | null = null
  for (const m of media) {
    const url = (m.u ?? '').trim()
    if (!/^https?:\/\//i.test(url)) continue
    const docId = mediaDocId(url)
    const isImg = /\.(jpe?g|png|gif|webp|bmp|tiff?)(\?|$)/i.test(url)
    const existing = Documents.get(docId)
    if (existing) {
      Documents.attach(docId, personId)
    } else {
      Documents.create(
        {
          title: m.t ?? (isImg ? 'FamilySearch kép' : 'FamilySearch hivatkozás'),
          kind: isImg ? 'photo' : 'other',
          filePath: url,
          mimeType: 'text/uri-list',
          personIds: [personId]
        },
        docId
      )
    }
    if (isImg && !firstPortrait && isAutoMemoryTitle(m.t)) firstPortrait = docId
  }
  if (firstPortrait) {
    const p = People.get(personId)
    if (p && !p.profilePhotoId) People.update(personId, { profilePhotoId: firstPortrait })
  }
}

/**
 * Link FamilySearch godparents ("Other Relationships") for a just-synced person.
 * The engine streams each godparent as its own person node plus a `gp` edge, so we
 * upsert those people (by fs id) and connect them in the godparents table. Used by
 * the single-person sync — the bulk importer handles `gp` nodes via FsIngester.
 */
export function applyFsGodparents(nodes: FsNode[], mainFid: string, mainPersonId: string): void {
  const gpEdges = nodes.filter((n): n is GodparentNode => n.t === 'gp')
  if (!gpEdges.length) return
  const idByFid = new Map<string, string>([[mainFid, mainPersonId]])
  for (const n of nodes) {
    if (n.t !== 'i' || n.fid === mainFid || idByFid.has(n.fid)) continue
    const found = People.findByFsId(n.fid)
    const id = found
      ? found.id
      : People.create({
          givenName: n.g,
          surname: n.s,
          sex: n.x,
          fsId: n.fid,
          birthDate: n.bd ?? null,
          birthPlace: n.bp ?? null,
          deathDate: n.dd ?? null,
          deathPlace: n.dp ?? null,
          deceased: !!n.dc || !!n.dd,
          christeningDate: n.cd ?? null,
          christeningPlace: n.cp ?? null,
          burialDate: n.bud ?? null,
          burialPlace: n.bup ?? null,
          religion: n.re ?? null,
          birthNote: n.bn ?? null,
          deathNote: n.dn ?? null,
          christeningNote: n.cn ?? null,
          burialNote: n.un ?? null
        }).id
    idByFid.set(n.fid, id)
  }
  for (const e of gpEdges) {
    const childId = idByFid.get(e.c)
    const gpId = idByFid.get(e.p)
    if (childId && gpId && childId !== gpId) Godparents.add(childId, gpId)
  }
}

/** Streamed node shapes emitted by fs_engine.py (`FS_NODE_JSON:` lines). */
interface PersonNode {
  t: 'i'
  fid: string
  g: string
  s: string
  x: 'M' | 'F' | 'U'
  bd: string | null
  bp: string | null
  dd: string | null
  dp: string | null
  /** 1 = known deceased (date may be unknown). Absent on older engine output. */
  dc?: number
  /** Christening date/place, religion, and alternate names (FS facts). */
  cd?: string | null
  cp?: string | null
  /** Burial date/place (FS /Burial fact). Absent on older engine output. */
  bud?: string | null
  bup?: string | null
  re?: string | null
  /** Per-vital "reason" notes (FamilySearch change messages, e.g. a cause of death). */
  bn?: string | null
  dn?: string | null
  cn?: string | null
  un?: string | null
  alt?: { g: string; s: string }[]
  /** Memories (photos / document scans): { u: url, t: title }. */
  media?: { u: string; t: string | null }[]
  /** Occupation facts (a person may hold several). `note` carries the user's reason. */
  oc?: { title: string; date: string | null; place: string | null; note?: string | null }[]
  /** Non-vital life events (residence, military, …). `no` carries the user's reason. */
  ev?: { type: string; date: string | null; place: string | null; value: string | null; no?: string | null }[]
  /** Person notes (incl. Life Sketch). */
  no?: string[]
  /** Collaboration discussions (Együttműködés): id, title, body, created (ms). */
  di?: { id?: string | null; ti?: string | null; bo?: string; cr?: number | null }[]
}
interface CoupleNode {
  t: 'f'
  a: string
  b: string
  /** Marriage date / place / note from the couple-relationship record (may be null). */
  md?: string | null
  mp?: string | null
  mn?: string | null
}
interface ChildNode {
  t: 'c'
  f: string | null
  m: string | null
  c: string
}
interface SourceNode {
  t: 's'
  /** person fid the source is cited from. */
  p: string
  /** FamilySearch source id (for dedup). */
  sid: string
  ti: string | null
  au: string | null
  pu: string | null
  pg: string | null
  /** The record's own date (FamilySearch sortKey) for chronological sorting. */
  dt?: string | null
  /** Citation event tag (GEDCOM, e.g. BIRT/CHR/MARR) mapped from the record's factType. */
  ft?: string | null
  /** The user's note written on the source. */
  no?: string | null
}
/** A place FamilySearch ships coordinates for → straight into the gazetteer. */
interface PlaceNode {
  t: 'pl'
  n: string
  la: string
  lo: string
}
/** Godparent ("Other Relationship") edge: `c` is the godchild fid, `p` the godparent. */
interface GodparentNode {
  t: 'gp'
  c: string
  p: string
}
export type FsNode = PersonNode | CoupleNode | ChildNode | SourceNode | PlaceNode | GodparentNode

/**
 * Stateful, streaming ingester. Each call writes ONE node into SQLite in a
 * micro-transaction and returns what changed so the caller can broadcast it.
 *
 * The importer streams every person (as a COMPLETE record) before any
 * relationship edge, so a person is inserted whole in a single step — no empty
 * placeholder that gets filled in later. `ensurePerson` only ever creates a stub
 * as a fallback for a relative the engine referenced but never sent (e.g. a
 * married-in spouse beyond the requested depth); those nameless stubs are swept
 * up by `removeNamelessStubs` once the import finishes.
 */
export class FsIngester {
  private db = getDb()
  private fsToPerson = new Map<string, string>() // fid -> person id
  private sexByFid = new Map<string, 'M' | 'F' | 'U'>()
  private famByKey = new Map<string, string>() // sorted-fid-pair -> family id
  private famChildren = new Map<string, Set<string>>() // family id -> child person ids
  private famHasParents = new Set<string>() // families with authoritative father/mother
  private sourceByKey = new Map<string, string>() // fs source id (or title) -> source id
  private citationSeen = new Set<string>() // `${personId}:${sourceId}` already cited
  private placeSeen = new Set<string>() // place names already upserted this run
  private preExisting = new Set<string>() // fids that already existed in the DB before this import
  private newThisRun = new Set<string>() // fids first created during this import

  // Live tallies surfaced to the user (created vs. merged), never wiping curated data.
  created = 0
  updated = 0
  familiesCreated = 0
  familiesUpdated = 0

  private ensurePerson(fid: string): string {
    const cached = this.fsToPerson.get(fid)
    if (cached) return cached
    const existing = People.findByFsId(fid)
    if (existing) {
      this.fsToPerson.set(fid, existing.id)
      this.preExisting.add(fid)
      return existing.id
    }
    const p = People.create({ givenName: '', surname: '', fsId: fid })
    this.fsToPerson.set(fid, p.id)
    this.newThisRun.add(fid)
    this.created++
    return p.id
  }

  private pairKey(a: string | null, b: string | null): string {
    return [a ?? '', b ?? ''].sort().join('|')
  }

  ingest(node: FsNode): FsIngestEvent | null {
    if (node.t === 'i') return this.ingestPerson(node)
    if (node.t === 'f') return this.ingestCouple(node)
    if (node.t === 'c') return this.ingestChild(node)
    if (node.t === 's') return this.ingestSource(node)
    if (node.t === 'pl') return this.ingestPlace(node)
    if (node.t === 'gp') return this.ingestGodparent(node)
    return null
  }

  /** FamilySearch godparent ("Other Relationship") edge → godparents table. Both
   *  the godchild and the godparent are streamed as full people first, so by the
   *  time this edge arrives they already resolve to local ids. */
  private ingestGodparent(n: GodparentNode): null {
    const childId = this.fsToPerson.get(n.c)
    const gpId = this.fsToPerson.get(n.p)
    if (childId && gpId && childId !== gpId) Godparents.add(childId, gpId)
    return null
  }

  /** FamilySearch-provided place coordinates → gazetteer (keyed by exact name). */
  private ingestPlace(n: PlaceNode): null {
    const name = (n.n ?? '').trim()
    const lat = Number(n.la)
    const lon = Number(n.lo)
    if (name && Number.isFinite(lat) && Number.isFinite(lon)) {
      if (!this.placeSeen.has(name)) {
        this.placeSeen.add(name)
        Places.upsert(name, lat, lon)
      }
    }
    return null
  }

  /** Attach a FamilySearch source to a person (deduped source + citation). */
  private ingestSource(n: SourceNode): null {
    this.db.transaction(() => {
      const personId = this.ensurePerson(n.p)
      const key = n.sid || `t:${n.ti ?? ''}`
      let sourceId = this.sourceByKey.get(key)
      if (!sourceId) {
        const s = Sources.upsert({
          gedcomId: n.sid || null,
          title: n.ti || 'Source',
          author: n.au || null,
          publication: n.pu || null,
          repositoryId: null,
          text: null,
          recordDate: n.dt ?? null
        })
        sourceId = s.id
        this.sourceByKey.set(key, sourceId)
      }
      const ck = `${personId}:${sourceId}`
      if (!this.citationSeen.has(ck)) {
        this.citationSeen.add(ck)
        Citations.create({
          sourceId,
          ownerType: 'person',
          ownerId: personId,
          eventTag: n.ft || null,
          page: n.pg || null,
          quality: null,
          note: n.no || null
        })
      }
    })()
    return null
  }

  private ingestPerson(n: PersonNode): FsIngestEvent {
    const input: PersonInput = {
      givenName: n.g,
      surname: n.s,
      sex: n.x,
      fsId: n.fid,
      birthDate: n.bd,
      birthPlace: n.bp,
      deathDate: n.dd,
      deathPlace: n.dp,
      deceased: !!n.dc || !!n.dd,
      christeningDate: n.cd ?? null,
      christeningPlace: n.cp ?? null,
      burialDate: n.bud ?? null,
      burialPlace: n.bup ?? null,
      religion: n.re ?? null,
      birthNote: n.bn ?? null,
      deathNote: n.dn ?? null,
      christeningNote: n.cn ?? null,
      burialNote: n.un ?? null
    }
    const person = this.db.transaction((): Person => {
      this.sexByFid.set(n.fid, n.x)
      // Resolve an already-known row: cached this run, a person from a previous
      // import, or — defensively — a stub a relationship edge created earlier.
      let id = this.fsToPerson.get(n.fid)
      if (!id) {
        const existing = People.findByFsId(n.fid)
        if (existing) {
          id = existing.id
          this.preExisting.add(n.fid)
          this.fsToPerson.set(n.fid, id)
        }
      }
      if (id) {
        // Known person → fill ONLY empty fields (keeps anything the user curated).
        const changed = People.fillFrom(id, input)
        if (changed && this.preExisting.has(n.fid)) this.updated++
      } else {
        // Brand-new → insert the COMPLETE person in one step. Because the importer
        // streams every person before any relationship edge, the
        // relatives this person links to already exist too — so no edge ever has
        // to invent an empty placeholder that gets filled in later.
        id = People.create(input).id
        this.fsToPerson.set(n.fid, id)
        this.newThisRun.add(n.fid)
        this.created++
      }
      applyFsAliases(id, n.alt)
      return People.get(id)!
    })()
    // Memories, occupations, events and notes → done OUTSIDE the per-person
    // transaction (separate tables); each is non-destructive / deduped so a
    // re-import never duplicates or overwrites curated data.
    applyFsMedia(person.id, n.media)
    applyFsOccupations(person.id, n.oc)
    applyFsEvents(person.id, n.ev)
    applyFsNotes(person.id, n.no)
    applyFsCollaborations(person.id, n.di)
    return { kind: 'person', person }
  }

  /** Couple edge — unordered; guess father/mother by known gender, non-authoritative. */
  /** Sex of a fid: this run's stream first, then the database (relatives synced
   *  later reference persons that were ingested in an earlier run). */
  private sexOfFid(fid: string | null): 'M' | 'F' | 'U' | undefined {
    if (!fid) return undefined
    const inRun = this.sexByFid.get(fid)
    if (inRun) return inRun
    return People.findByFsId(fid)?.sex
  }

  private ingestCouple(n: CoupleNode): FsIngestEvent {
    const sexA = this.sexOfFid(n.a)
    const sexB = this.sexOfFid(n.b)
    let father = n.a
    let mother = n.b
    if (sexA === 'F' || sexB === 'M') {
      father = n.b
      mother = n.a
    }
    const family = this.db.transaction((): Family => {
      const fam = this.upsertFamily(father, mother, false, { date: n.md ?? null, place: n.mp ?? null })
      // Non-destructively attach the FS marriage note (only if none recorded yet).
      if (n.mn && !fam.notes) return Families.update(fam.id, { notes: n.mn })
      return fam
    })()
    return { kind: 'family', family }
  }

  /** Parent/child edge — father/mother are authoritative; also files the child. */
  private ingestChild(n: ChildNode): FsIngestEvent {
    // Defensive: make sure the father/mother slots match the persons' sexes.
    let f = n.f
    let m = n.m
    if ((f && this.sexOfFid(f) === 'F') || (m && this.sexOfFid(m) === 'M')) {
      const tmp = f
      f = m
      m = tmp
    }
    const family = this.db.transaction((): Family => {
      const fam = this.upsertFamily(f, m, true)
      const childId = this.ensurePerson(n.c)
      // Fold HALF-families away: if this child was filed earlier under a family
      // that has just ONE of the same parents (the other slot empty — e.g. a
      // numbering-derived edge before the spouse was known), move the child
      // into the authoritative two-parent family and drop the empty leftover.
      if (fam.husbandId && fam.wifeId) {
        const halves = this.db
          .prepare(
            `SELECT f.id, f.husband_id, f.wife_id FROM families f
             JOIN family_children fc ON fc.family_id = f.id
             WHERE fc.child_id = ? AND f.id != ?`
          )
          .all(childId, fam.id) as { id: string; husband_id: string | null; wife_id: string | null }[]
        for (const h of halves) {
          const matchesHalf =
            (h.husband_id === fam.husbandId && !h.wife_id) ||
            (h.wife_id === fam.wifeId && !h.husband_id) ||
            (!h.husband_id && !h.wife_id)
          if (!matchesHalf) continue
          this.db.prepare('DELETE FROM family_children WHERE family_id = ? AND child_id = ?').run(h.id, childId)
          const left = (
            this.db.prepare('SELECT COUNT(*) AS n FROM family_children WHERE family_id = ?').get(h.id) as { n: number }
          ).n
          if (left === 0) this.db.prepare('DELETE FROM families WHERE id = ?').run(h.id)
          this.famChildren.delete(h.id)
        }
      }
      const set = this.famChildren.get(fam.id) ?? new Set<string>()
      if (!set.has(childId)) {
        set.add(childId)
        this.famChildren.set(fam.id, set)
        return Families.update(fam.id, { childIds: [...set] })
      }
      return fam
    })()
    return { kind: 'family', family }
  }

  private upsertFamily(
    fatherFid: string | null,
    motherFid: string | null,
    authoritative: boolean,
    marriage?: { date: string | null; place: string | null }
  ): Family {
    const key = this.pairKey(fatherFid, motherFid)
    const husbandId = fatherFid ? this.ensurePerson(fatherFid) : null
    const wifeId = motherFid ? this.ensurePerson(motherFid) : null
    // Only carry marriage fields that actually have a value, so a later edge
    // without marriage data never wipes a date we already captured.
    const marr: { marriageDate?: string; marriagePlace?: string } = {}
    if (marriage?.date) marr.marriageDate = marriage.date
    if (marriage?.place) marr.marriagePlace = marriage.place

    // Resolve the family: in-memory cache first, then the DB by parent pair so
    // a RE-IMPORT merges into the existing family instead of duplicating it.
    let existingId = this.famByKey.get(key)
    // Guard against a STALE cache entry: half-family folding (or an earlier merge)
    // can delete a family whose id is still cached here — using it would crash on
    // a null lookup below. Forget it and re-resolve / re-create instead.
    if (existingId && !Families.get(existingId)) {
      this.famByKey.delete(key)
      this.famChildren.delete(existingId)
      this.famHasParents.delete(existingId)
      existingId = undefined
    }
    if (!existingId) {
      // Match the family in EITHER parent order — an earlier run may have stored
      // the couple swapped (e.g. before sexes were known).
      const dbFam =
        Families.findByParents(husbandId, wifeId) ?? Families.findByParents(wifeId, husbandId)
      if (dbFam) {
        existingId = dbFam.id
        this.famByKey.set(key, dbFam.id)
        this.famChildren.set(dbFam.id, new Set(dbFam.childIds))
        if (dbFam.husbandId || dbFam.wifeId) this.famHasParents.add(dbFam.id)
      }
    }

    if (existingId) {
      const ex = Families.get(existingId)!
      // Non-destructive: only set parents/marriage where the family lacks them.
      const setParents = authoritative && !this.famHasParents.has(existingId) && !ex.husbandId && !ex.wifeId
      const patch: Partial<{ husbandId: string | null; wifeId: string | null; marriageDate: string; marriagePlace: string }> = {}
      if (setParents) {
        patch.husbandId = husbandId
        patch.wifeId = wifeId
        this.famHasParents.add(existingId)
      }
      if (marr.marriageDate && !ex.marriageDate) patch.marriageDate = marr.marriageDate
      if (marr.marriagePlace && !ex.marriagePlace) patch.marriagePlace = marr.marriagePlace
      if (Object.keys(patch).length > 0) {
        this.familiesUpdated++
        return Families.update(existingId, patch)
      }
      return ex
    }

    const fam = Families.create({ husbandId, wifeId, childIds: [], ...marr })
    this.famByKey.set(key, fam.id)
    this.famChildren.set(fam.id, new Set())
    if (authoritative) this.famHasParents.add(fam.id)
    this.familiesCreated++
    return fam
  }
}
