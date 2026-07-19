import { readFileSync } from 'fs'
import { isFamilySearchId } from '@shared/familysearch'
import { mediaDocId } from '../mediaId'
import { getDb } from '../db/connection'
import { removeNamelessStubs } from '../db/admin'
import { Aliases, Citations, Documents, Events, Families, Godparents, Notes, Occupations, People, Places, Repositories, Sources } from '../db/repo'
import {
  child,
  childValue,
  collectPlaces,
  eventDetails,
  parseGedcom,
  type GedNode
} from './parser'
import type { Family, GedcomImportResult, Person, Sex } from '@shared/types'

function parseName(value: string | null): { given: string; surname: string } {
  if (!value) return { given: '', surname: '' }
  const m = value.match(/^(.*?)\/(.*?)\/(.*)$/)
  if (m) return { given: (m[1] + m[3]).trim(), surname: m[2].trim() }
  return { given: value.trim(), surname: '' }
}

function mapSex(value: string | null): Sex {
  if (value === 'M' || value === 'F') return value
  return 'U'
}

/** Splits a GEDCOM occupation DATE into start/end (`FROM x TO y`, `FROM x`, `TO y`, or a single date). */
function parseOccupationPeriod(raw: string | null): { startDate: string | null; endDate: string | null } {
  const s = (raw ?? '').trim()
  if (!s) return { startDate: null, endDate: null }
  const both = /^FROM\s+(.+?)\s+TO\s+(.+)$/i.exec(s)
  if (both) return { startDate: both[1].trim(), endDate: both[2].trim() }
  const from = /^FROM\s+(.+)$/i.exec(s)
  if (from) return { startDate: from[1].trim(), endDate: null }
  const to = /^TO\s+(.+)$/i.exec(s)
  if (to) return { startDate: null, endDate: to[1].trim() }
  return { startDate: s, endDate: null }
}

const EVENT_TAGS = ['BIRT', 'DEAT', 'CHR', 'BURI', 'MARR', 'RESI', 'OCCU', 'EVEN', 'CENS', 'DIV', 'BAPM', 'NATU', 'IMMI']

/** First generic `EVEN` whose `TYPE` matches `re` (e.g. baptism), with its date/place. */
function eventByType(node: GedNode, re: RegExp): { date: string | null; place: string | null } | null {
  for (const ev of node.children) {
    if (ev.tag !== 'EVEN') continue
    if (re.test(childValue(ev, 'TYPE') ?? '')) return { date: childValue(ev, 'DATE'), place: childValue(ev, 'PLAC') }
  }
  return null
}

// EVEN TYPEs already captured as a structured field (christening) — not re-imported as a note.
const HANDLED_EVENT_TYPE = /bapt|christen|keresz/i

/** RELA values that mean "godparent" across the languages we meet. */
const GODPARENT_RELA = /god\s*(parent|father|mother)|kereszt|taufpat|pate|patin|witness.*bapt/i

/** The inline (non-pointer) NOTE directly under an event node, e.g. `2 NOTE …` inside `1 BIRT`. */
function eventNote(indi: GedNode, tag: string): string | null {
  const ev = child(indi, tag)
  if (!ev) return null
  for (const c of ev.children) {
    if (c.tag === 'NOTE' && !/^@.+@$/.test(c.value) && c.value.trim()) return c.value.trim()
  }
  return null
}


/** Collects the http(s) media URLs referenced by a record's `OBJE > FILE`
 *  children. `primary` marks the GEDCOM "preferred"/portrait image (`_PRIM Y`,
 *  the Ancestry/FamilySearch extension), so it can become the profile photo. */
function mediaUrls(node: GedNode): { url: string; title: string | null; primary: boolean }[] {
  const out: { url: string; title: string | null; primary: boolean }[] = []
  for (const obje of node.children) {
    if (obje.tag !== 'OBJE') continue
    const primary = /^y/i.test(childValue(obje, '_PRIM') ?? childValue(obje, '_PRIMARY') ?? '')
    const files = obje.children.filter((c) => c.tag === 'FILE')
    const raws = files.length ? files.map((f) => f.value) : obje.value ? [obje.value] : []
    for (const raw of raws) {
      const url = raw.trim()
      if (/^https?:\/\//i.test(url)) out.push({ url, title: childValue(obje, 'TITL'), primary })
    }
  }
  return out
}

/** Imports a GEDCOM file into the database. Returns counts. */
export function importGedcomFile(filePath: string): GedcomImportResult {
  return importGedcomText(readFileSync(filePath, 'utf-8'))
}

/** Imports GEDCOM content, extracting people, families, sources, notes & citations. */
export function importGedcomText(text: string): GedcomImportResult {
  const roots = parseGedcom(text)
  const result = {
    people: 0,
    families: 0,
    skipped: 0,
    sources: 0,
    notes: 0,
    citations: 0,
    documents: 0,
    peopleCreated: 0,
    peopleUpdated: 0,
    familiesCreated: 0,
    familiesUpdated: 0
  }

  const run = getDb().transaction(() => {
    // --- Places from MAP/LATI/LONG ---
    for (const p of collectPlaces(roots)) Places.upsert(p.name, p.lat, p.lon)

    // --- Repositories (REPO) ---
    for (const r of roots.filter((n) => n.tag === 'REPO' && n.xref)) {
      Repositories.upsert({
        gedcomId: r.xref,
        name: childValue(r, 'NAME') ?? '',
        address: childValue(r, 'ADDR')
      })
    }

    // --- Notes (@N@ NOTE records) ---
    const noteByXref = new Map<string, string>()
    for (const n of roots.filter((x) => x.tag === 'NOTE' && x.xref)) {
      const existing = Notes.findByGedcomId(n.xref!)
      const note = existing
        ? (Notes.create(n.value, n.xref, existing.id), existing)
        : Notes.create(n.value, n.xref)
      noteByXref.set(n.xref!, note.id)
      result.notes++
    }

    // --- Sources (@S@ SOUR records) ---
    const sourceByXref = new Map<string, string>()
    for (const s of roots.filter((x) => x.tag === 'SOUR' && x.xref)) {
      const repoPtr = childValue(s, 'REPO')
      const repo = repoPtr ? Repositories.findByGedcomId(repoPtr) : null
      // A source's own date (1 DATA / 2 DATE, or a direct 1 DATE) → chronological sort.
      const dataNode = s.children.find((c) => c.tag === 'DATA')
      const recordDate = (dataNode ? childValue(dataNode, 'DATE') : null) ?? childValue(s, 'DATE') ?? null
      const src = Sources.upsert({
        gedcomId: s.xref,
        title: childValue(s, 'TITL') ?? '',
        author: childValue(s, 'AUTH'),
        publication: childValue(s, 'PUBL'),
        repositoryId: repo?.id ?? null,
        text: childValue(s, 'TEXT'),
        recordDate
      })
      sourceByXref.set(s.xref!, src.id)
      result.sources++
    }

    const processNotes = (node: GedNode, ownerType: string, ownerId: string): void => {
      for (const c of node.children) {
        if (c.tag !== 'NOTE') continue
        const ptr = /^@.+@$/.test(c.value) ? c.value : null
        if (ptr) {
          const nid = noteByXref.get(ptr)
          if (nid) Notes.link(nid, ownerType, ownerId)
        } else if (c.value.trim()) {
          const note = Notes.create(c.value)
          Notes.link(note.id, ownerType, ownerId)
          result.notes++
        }
      }
    }

    // Existing citation keys per owner, so a re-import never piles up duplicates.
    const citeSeen = new Map<string, Set<string>>()
    const citeKeyset = (ownerType: 'person' | 'family', ownerId: string): Set<string> => {
      const mapKey = `${ownerType}:${ownerId}`
      let set = citeSeen.get(mapKey)
      if (!set) {
        set = new Set(
          Citations.forOwner(ownerType, ownerId).map((c) => `${c.sourceId ?? ''}|${c.eventTag ?? ''}|${c.page ?? ''}`)
        )
        citeSeen.set(mapKey, set)
      }
      return set
    }

    const addCitation = (
      sourNode: GedNode,
      ownerType: 'person' | 'family',
      ownerId: string,
      eventTag: string | null
    ): void => {
      const ptr = /^@.+@$/.test(sourNode.value) ? sourNode.value : null
      const sourceId = ptr ? sourceByXref.get(ptr) ?? null : null
      const page = childValue(sourNode, 'PAGE')
      const key = `${sourceId ?? ''}|${eventTag ?? ''}|${page ?? ''}`
      const seen = citeKeyset(ownerType, ownerId)
      if (seen.has(key)) return // identical citation already present — skip
      seen.add(key)
      const data = child(sourNode, 'DATA')
      Citations.create({
        sourceId,
        ownerType,
        ownerId,
        eventTag,
        page,
        quality: childValue(sourNode, 'QUAY'),
        note: data ? childValue(data, 'TEXT') : childValue(sourNode, 'NOTE')
      })
      result.citations++
    }

    const processCitations = (node: GedNode, ownerType: 'person' | 'family', ownerId: string): void => {
      for (const c of node.children) if (c.tag === 'SOUR') addCitation(c, ownerType, ownerId, null)
      for (const ev of node.children) {
        if (!EVENT_TAGS.includes(ev.tag)) continue
        for (const c of ev.children) if (c.tag === 'SOUR') addCitation(c, ownerType, ownerId, ev.tag)
      }
    }

    // Multimedia (OBJE → FILE URL) → link-documents attached to the given people.
    // Deduped by URL across the targets so a re-import never piles up copies.
    const importMedia = (node: GedNode, personIds: string[]): void => {
      const targets = personIds.filter(Boolean)
      if (!targets.length) return
      let primaryPortrait: string | null = null // `_PRIM Y` flagged image
      let firstUntitled: string | null = null // first untitled image = the portrait
      for (const { url, title, primary } of mediaUrls(node)) {
        const docId = mediaDocId(url)
        const isImg = /\.(jpe?g|png|gif|webp|bmp|tiff?)(\?|$)/i.test(url)
        // Deterministic id makes this idempotent: an existing doc (possibly
        // already downloaded → local path) is reused, never re-created, and just
        // (re-)linked to the people referencing it. `attach` is INSERT OR IGNORE.
        const existing = Documents.get(docId)
        if (existing) {
          for (const pid of targets) Documents.attach(docId, pid)
        } else {
          Documents.create(
            {
              title: title ?? (isImg ? 'GEDCOM kép' : 'GEDCOM hivatkozás'),
              kind: isImg ? 'photo' : 'other',
              filePath: url,
              mimeType: 'text/uri-list',
              personIds: targets
            },
            docId
          )
          result.documents++
        }
        // Portrait detection. There is rarely a `_PRIM` flag, so we treat the
        // first UNTITLED image as the profile photo: in FamilySearch GEDCOMs a
        // titled OBJE is a document scan (e.g. "A. Henrik halálozás"), while the
        // person's portrait carries no title.
        if (isImg) {
          if (primary) primaryPortrait = docId
          else if (!firstUntitled && !title?.trim()) firstUntitled = docId
        }
      }
      // Set the profile photo for a single person (INDI media), but never override
      // an avatar that's already set — keeps re-imports idempotent and respects a
      // user's manual choice. It renders once the background download localizes it.
      const portrait = primaryPortrait ?? firstUntitled
      if (portrait && targets.length === 1) {
        const p = People.get(targets[0])
        if (p && !p.profilePhotoId) People.update(targets[0], { profilePhotoId: portrait })
      }
    }

    // Life events. `RESI` and typed `EVEN`s become STRUCTURED events (the same
    // "Events" list the app edits, and what our export writes) instead of the
    // note-dump they used to be — so residence/military/etc. survive a
    // round-trip. Baptism EVENs already became the christening field. Deduped
    // so a re-import never duplicates.
    const importEvents = (indi: GedNode, personId: string): void => {
      let existing: Set<string> | null = null
      const keyOf = (e: { type: string; date: string | null; endDate: string | null; place: string | null; value: string | null }): string =>
        `${e.type}|${e.date ?? ''}|${e.endDate ?? ''}|${e.place ?? ''}|${e.value ?? ''}`
      const addEvent = (input: {
        type: string
        date: string | null
        endDate: string | null
        place: string | null
        value: string | null
        note: string | null
      }): void => {
        if (!input.date && !input.endDate && !input.place && !input.value && !input.note) return
        if (!existing) existing = new Set(Events.forPerson(personId).map(keyOf))
        const key = keyOf(input)
        if (existing.has(key)) return
        existing.add(key)
        Events.create('person', personId, input)
      }
      const inlineNote = (ev: GedNode): string | null => {
        for (const c of ev.children) {
          if (c.tag === 'NOTE' && !/^@.+@$/.test(c.value) && c.value.trim()) return c.value.trim()
        }
        return null
      }
      for (const ev of indi.children) {
        if (ev.tag === 'RESI') {
          const { startDate, endDate } = parseOccupationPeriod(childValue(ev, 'DATE'))
          addEvent({
            type: 'residence',
            date: startDate,
            endDate,
            place: childValue(ev, 'PLAC'),
            value: null,
            note: inlineNote(ev)
          })
        } else if (ev.tag === 'EVEN') {
          const rawType = (childValue(ev, 'TYPE') ?? '').trim()
          if (HANDLED_EVENT_TYPE.test(rawType)) continue
          const { startDate, endDate } = parseOccupationPeriod(childValue(ev, 'DATE'))
          addEvent({
            type: rawType || 'other',
            date: startDate,
            endDate,
            place: childValue(ev, 'PLAC'),
            value: ev.value.trim() || null,
            note: inlineNote(ev)
          })
        }
      }
    }

    // --- Individuals ---
    const indis = roots.filter((r) => r.tag === 'INDI' && r.xref)
    const personByXref = new Map<string, string>()
    for (const indi of indis) {
      const xref = indi.xref!
      const { given, surname } = parseName(child(indi, 'NAME')?.value ?? null)
      const birth = eventDetails(indi, 'BIRT')
      const death = eventDetails(indi, 'DEAT')
      const burial = eventDetails(indi, 'BURI')
      // A `DEAT` event marks the person dead even with no DATE (e.g. `1 DEAT Y`).
      // A burial likewise implies death. And someone born long enough ago that they
      // cannot plausibly be alive is presumed deceased — Ancestry exports often omit
      // any death/burial for clearly-historical people, which would otherwise flood
      // the data-issue checker with false "probably deceased" flags. Threshold kept in
      // sync with sanity.ts MAX_LIVING_AGE (110).
      const hasDeath = !!child(indi, 'DEAT')
      const hasBurial = !!child(indi, 'BURI')
      const birthYearM = /(\d{4})/.exec(birth.date ?? '')
      const presumedDead = birthYearM !== null && new Date().getFullYear() - Number(birthYearM[1]) > 110
      // Some exporters (FamilySearch) record the christening as a generic
      // `EVEN` with `TYPE Baptism/Christening` instead of a `CHR`/`BAPM` tag.
      const evenChristening = eventByType(indi, /bapt|christen|keresz/i)
      const input = {
        gedcomId: xref,
        // FamilySearch person id, so the default-root can be resolved post-import.
        // ONLY `_FSFTID` is a real FamilySearch tree id (and only when it matches
        // the FS format). A GEDCOM `RIN` is a foreign record id other tools emit
        // (e.g. MyHeritage "MH:I512"); storing it as fsId wrongly enabled
        // FamilySearch sync/open on non-FS people, which fails.
        fsId: isFamilySearchId(childValue(indi, '_FSFTID'))
          ? childValue(indi, '_FSFTID')
          : null,
        givenName: given,
        surname,
        sex: mapSex(childValue(indi, 'SEX')),
        birthDate: birth.date,
        birthPlace: birth.place,
        deathDate: death.date,
        deathPlace: death.place,
        deceased: hasDeath || hasBurial || presumedDead,
        burialDate: burial.date,
        burialPlace: burial.place,
        // Christening: CHR → BAPM → generic EVEN/TYPE Baptism. religion (RELI).
        christeningDate:
          eventDetails(indi, 'CHR').date ?? eventDetails(indi, 'BAPM').date ?? evenChristening?.date ?? null,
        christeningPlace:
          eventDetails(indi, 'CHR').place ?? eventDetails(indi, 'BAPM').place ?? evenChristening?.place ?? null,
        religion: childValue(indi, 'RELI'),
        // Per-fact research notes (`2 NOTE` under the vital event) round-trip
        // into the same field our export writes them from.
        birthNote: eventNote(indi, 'BIRT'),
        deathNote: eventNote(indi, 'DEAT'),
        christeningNote: eventNote(indi, 'CHR') ?? eventNote(indi, 'BAPM'),
        burialNote: eventNote(indi, 'BURI'),
        illegitimate: /^y/i.test(childValue(indi, '_ILLEGITIMATE') ?? '') || undefined,
        notes: null
      }
      // Match a stable id FIRST (fs_id), then the file-local xref. Existing
      // people are merged NON-destructively (curated fields are never wiped).
      const matched = (input.fsId && People.findByFsId(input.fsId)) || People.findByGedcomId(xref)
      let person: Person
      if (matched) {
        People.fillFrom(matched.id, input)
        person = People.get(matched.id)!
        result.peopleUpdated++
      } else {
        person = People.create(input)
        result.peopleCreated++
      }
      personByXref.set(xref, person.id)
      // Occupations: add each `OCCU` (single date or FROM..TO period), skipping
      // any that already exist for this person so a re-import never duplicates.
      const haveOcc = new Set(
        Occupations.forPerson(person.id).map((o) => `${o.title}|${o.startDate ?? ''}|${o.endDate ?? ''}`)
      )
      for (const occ of indi.children.filter((c) => c.tag === 'OCCU')) {
        const title = occ.value.trim()
        if (!title) continue
        const { startDate, endDate } = parseOccupationPeriod(childValue(occ, 'DATE'))
        const key = `${title}|${startDate ?? ''}|${endDate ?? ''}`
        if (haveOcc.has(key)) continue
        haveOcc.add(key)
        Occupations.create(person.id, { title, startDate, endDate })
      }
      // Name variations → aliases. The FIRST NAME is the primary; extra NAME
      // records plus _AKA / NICK become aliases (deduped so re-import is safe).
      const haveAlias = new Set(
        Aliases.forPerson(person.id).map((a) => `${a.givenName}|${a.surname}`)
      )
      const nameNodes = indi.children.filter((c) => c.tag === 'NAME')
      const variantNodes = [
        ...nameNodes.slice(1),
        ...indi.children.filter((c) => c.tag === '_AKA' || c.tag === 'NICK')
      ]
      for (const node of variantNodes) {
        const { given, surname: aliasSurname } = parseName(node.value)
        if (!given && !aliasSurname) continue
        const key = `${given}|${aliasSurname}`
        if (haveAlias.has(key)) continue
        haveAlias.add(key)
        Aliases.create(person.id, { givenName: given, surname: aliasSurname, kind: childValue(node, 'TYPE') })
      }
      processNotes(indi, 'person', person.id)
      processCitations(indi, 'person', person.id)
      importMedia(indi, [person.id])
      importEvents(indi, person.id)
    }
    result.people = personByXref.size

    // --- Godparents (ASSO @X@ / RELA godparent) --- second pass, so the
    // association target exists no matter where it sits in the file.
    // `Godparents.add` is INSERT OR IGNORE → re-imports never duplicate.
    for (const indi of indis) {
      const personId = personByXref.get(indi.xref!)
      if (!personId) continue
      for (const asso of indi.children) {
        if (asso.tag !== 'ASSO') continue
        if (!GODPARENT_RELA.test(childValue(asso, 'RELA') ?? '')) continue
        const target = /^@.+@$/.test(asso.value) ? personByXref.get(asso.value) : null
        if (target) Godparents.add(personId, target)
      }
    }

    // --- Families ---
    const resolve = (x: string | null): string | null => (x ? personByXref.get(x) ?? null : null)
    for (const fam of roots.filter((r) => r.tag === 'FAM' && r.xref)) {
      const xref = fam.xref!
      const marr = eventDetails(fam, 'MARR')
      const input = {
        gedcomId: xref,
        husbandId: resolve(childValue(fam, 'HUSB')),
        wifeId: resolve(childValue(fam, 'WIFE')),
        marriageDate: marr.date,
        marriagePlace: marr.place,
        notes: null,
        childIds: fam.children
          .filter((c) => c.tag === 'CHIL')
          .map((c) => resolve(c.value))
          .filter((id): id is string => !!id)
      }
      // Match by xref first, then by parent pair, so re-imports merge instead
      // of duplicating. Existing families are filled NON-destructively and their
      // children are UNIONed (never dropped).
      const matched = Families.findByGedcomId(xref) || Families.findByParents(input.husbandId, input.wifeId)
      let family: Family
      if (matched) {
        const childIds = Array.from(new Set([...matched.childIds, ...input.childIds]))
        family = Families.update(matched.id, {
          gedcomId: matched.gedcomId ?? xref,
          husbandId: matched.husbandId ?? input.husbandId,
          wifeId: matched.wifeId ?? input.wifeId,
          marriageDate: matched.marriageDate ?? input.marriageDate,
          marriagePlace: matched.marriagePlace ?? input.marriagePlace,
          childIds
        })
        result.familiesUpdated++
      } else {
        family = Families.create(input)
        result.familiesCreated++
      }
      processNotes(fam, 'family', family.id)
      processCitations(fam, 'family', family.id)
      // Family-level media (e.g. a marriage record image) → attached to both spouses.
      importMedia(fam, [family.husbandId, family.wifeId].filter((x): x is string => !!x))
    }
    result.people = result.peopleCreated + result.peopleUpdated
    result.families = result.familiesCreated + result.familiesUpdated
  })

  run()
  // Drop nameless married-in stubs (no name, no dates, no ancestry).
  removeNamelessStubs()
  return result
}
