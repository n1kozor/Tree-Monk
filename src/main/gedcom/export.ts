import { writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, extname, join } from 'path'
import { Aliases, Attributes, Documents, EventParticipants, Events, Families, Godparents, Occupations, People, Witnesses } from '../db/repo'
import { resolveMediaPath } from '../db/connection'
import type { Alias, DocumentRecord, EventRecord, Occupation, Person } from '@shared/types'

function line(level: number, tag: string, value?: string | null): string {
  return value ? `${level} ${tag} ${value}` : `${level} ${tag}`
}

/** A filesystem-safe, title-based base name (no extension). */
function sanitizeName(title: string): string {
  return (
    (title || 'media')
      .replace(/[\\/:*?"<>|\n\r\t]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'media'
  )
}

/** The lower-case extension (no dot) of a path or URL, defaulting to `jpg`. */
function extOf(pathOrUrl: string): string {
  const clean = pathOrUrl.split('?')[0].split('#')[0]
  return (extname(clean) || '.jpg').replace('.', '').toLowerCase() || 'jpg'
}

interface MediaRef {
  /** GEDCOM `FILE` value: a relative `media/…` path, or the original http(s) URL. */
  file: string
  form: string
  title: string
}

/**
 * Copies each person's documents next to the .ged into a `media/` folder, named by
 * their TITLE (deduped), and returns docId → GEDCOM media reference. Remote (http)
 * media is referenced by URL as-is; missing local files are skipped.
 */
function collectMedia(
  people: Person[],
  gedDir: string,
  docsByPerson: Map<string, DocumentRecord[]>
): Map<string, MediaRef> {
  const refs = new Map<string, MediaRef>()
  const usedNames = new Set<string>()
  const mediaDir = join(gedDir, 'media')

  for (const p of people) {
    const docs = Documents.listForPerson(p.id)
    if (docs.length) docsByPerson.set(p.id, docs)
    for (const d of docs) {
      if (refs.has(d.id)) continue
      if (/^https?:\/\//i.test(d.filePath)) {
        refs.set(d.id, { file: d.filePath, form: extOf(d.filePath), title: d.title })
        continue
      }
      const filePath = resolveMediaPath(d.filePath)
      if (!existsSync(filePath)) continue
      const ext = extOf(filePath)
      const base = sanitizeName(d.title)
      let name = `${base}.${ext}`
      for (let i = 2; usedNames.has(name.toLowerCase()); i++) name = `${base}_${i}.${ext}`
      usedNames.add(name.toLowerCase())
      if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true })
      try {
        copyFileSync(filePath, join(mediaDir, name))
        refs.set(d.id, { file: `media/${name}`, form: ext, title: d.title })
      } catch {
        /* unreadable source file — skip this one, keep exporting the rest */
      }
    }
  }
  return refs
}

/** GEDCOM date period for an occupation interval: `FROM x TO y` / `FROM x` / `TO y`. */
function periodValue(o: Occupation): string | null {
  if (o.startDate && o.endDate) return `FROM ${o.startDate} TO ${o.endDate}`
  if (o.startDate) return `FROM ${o.startDate}`
  if (o.endDate) return `TO ${o.endDate}`
  return null
}

/** Same period form for a life event's date + optional end date. */
function eventPeriod(e: EventRecord): string | null {
  if (e.date && e.endDate) return `FROM ${e.date} TO ${e.endDate}`
  if (e.date) return e.date
  if (e.endDate) return `TO ${e.endDate}`
  return null
}

/** Single-line NOTE payload (GEDCOM lines must not contain raw newlines). */
function flatNote(text: string | null | undefined): string | null {
  const s = (text ?? '').replace(/\s*\n\s*/g, ' ').trim()
  return s || null
}

function nameValue(p: Person): string {
  return `${p.givenName} /${p.surname}/`.trim()
}

/**
 * GEDCOM cross-reference ids must be unique across the WHOLE file. A stored
 * gedcomId is reused verbatim (stable round-trips), but only its FIRST holder
 * keeps it; duplicates and records without one get the next free generated id.
 * The previous `@I${index}@` fallback could collide with an imported id on a
 * different person — importers (Gramps, MyHeritage) then merge the two records,
 * scrambling the whole tree (people fused, parent couples multiplied).
 */
function assignXrefs<T extends { id: string; gedcomId: string | null }>(
  items: T[],
  prefix: string,
  used: Set<string>
): Map<string, string> {
  const valid = /^@[^@\s]{1,20}@$/
  const out = new Map<string, string>()
  for (const it of items) {
    const gid = it.gedcomId
    if (gid && valid.test(gid) && !used.has(gid)) {
      out.set(it.id, gid)
      used.add(gid)
    }
  }
  let n = 1
  for (const it of items) {
    if (out.has(it.id)) continue
    let cand = `@${prefix}${n}@`
    while (used.has(cand)) cand = `@${prefix}${++n}@`
    out.set(it.id, cand)
    used.add(cand)
    n++
  }
  return out
}

/**
 * Exports the database (or a subset of people) to a GEDCOM 5.5.1 string.
 * Writes it to `filePath` and returns the string.
 */
export function exportGedcom(filePath: string, personIds?: string[]): string {
  const allPeople = People.list()
  const include = personIds && personIds.length ? new Set(personIds) : null
  const people = include ? allPeople.filter((p) => include.has(p.id)) : allPeople
  const personSet = new Set(people.map((p) => p.id))

  // Assign stable, collision-free xrefs. One shared `used` set: the xref
  // namespace is global in a GEDCOM file, so a family id must never equal a
  // person id either.
  const usedXrefs = new Set<string>()
  const xref = assignXrefs(people, 'I', usedXrefs)

  const families = Families.list().filter((f) => {
    if (!include) return true
    return (
      (f.husbandId && personSet.has(f.husbandId)) ||
      (f.wifeId && personSet.has(f.wifeId)) ||
      f.childIds.some((c) => personSet.has(c))
    )
  })
  const famXref = assignXrefs(families, 'F', usedXrefs)

  // Shared-event participants as a custom sub-structure (readers ignore the
  // underscore tag; our import restores person + role).
  const pushParticipants = (eventId: string, level: number): void => {
    for (const pt of EventParticipants.forEvent(eventId)) {
      if (!personSet.has(pt.personId)) continue
      out.push(line(level, '_PART', xref.get(pt.personId)))
      if (pt.role) out.push(line(level + 1, 'ROLE', pt.role))
    }
  }

  // Reverse lookups: person -> families they belong to. Spouse families are
  // sorted (marriage order, then date) so multiple marriages export in
  // sequence — FAMS order is how GEDCOM readers infer it.
  const famsSortKey = (f: { marriageOrder: number | null; marriageDate: string | null }): string =>
    `${String(f.marriageOrder ?? 9999).padStart(4, '0')}|${f.marriageDate ?? '9999'}`
  const spouseFams = new Map<string, typeof families>()
  const childIn = new Map<string, string[]>()
  // (childId|famXref) -> adopted/foster/step, exported as FAMC/PEDI.
  const childRelation = new Map<string, string>()
  for (const f of families) {
    const fx = famXref.get(f.id)!
    for (const sid of [f.husbandId, f.wifeId]) {
      if (sid && personSet.has(sid)) {
        const arr = spouseFams.get(sid) ?? []
        arr.push(f)
        spouseFams.set(sid, arr)
      }
    }
    for (const cid of f.childIds) {
      if (personSet.has(cid)) {
        const arr = childIn.get(cid) ?? []
        arr.push(fx)
        childIn.set(cid, arr)
        const rel = f.childRelations?.[cid]
        if (rel) childRelation.set(`${cid}|${fx}`, rel)
      }
    }
  }
  const spouseIn = new Map<string, string[]>()
  for (const [pid, fams] of spouseFams) {
    spouseIn.set(
      pid,
      [...fams].sort((a, b) => famsSortKey(a).localeCompare(famsSortKey(b))).map((f) => famXref.get(f.id)!)
    )
  }

  // Occupations grouped by person (the source of truth — may be several each).
  const occByPerson = new Map<string, Occupation[]>()
  for (const o of Occupations.all()) {
    const arr = occByPerson.get(o.personId) ?? []
    arr.push(o)
    occByPerson.set(o.personId, arr)
  }
  // Name variations grouped by person → exported as extra NAME records.
  const aliasByPerson = new Map<string, Alias[]>()
  for (const a of Aliases.all()) {
    const arr = aliasByPerson.get(a.personId) ?? []
    arr.push(a)
    aliasByPerson.set(a.personId, arr)
  }

  // Multimedia: copy each person's documents into a sibling `media/` folder (named
  // by their title) and reference them as OBJE records, so the export carries images.
  const docsByPerson = new Map<string, DocumentRecord[]>()
  const mediaRefs = collectMedia(people, dirname(filePath), docsByPerson)

  const out: string[] = []
  out.push(line(0, 'HEAD'))
  out.push(line(1, 'SOUR', 'TreeMonk'))
  out.push(line(2, 'NAME', 'TreeMonk Genealogy'))
  out.push(line(1, 'GEDC'))
  out.push(line(2, 'VERS', '5.5.1'))
  out.push(line(2, 'FORM', 'LINEAGE-LINKED'))
  out.push(line(1, 'CHAR', 'UTF-8'))

  for (const p of people) {
    out.push(line(0, `${xref.get(p.id)} INDI`))
    out.push(line(1, 'NAME', nameValue(p)))
    // Name pieces: prefix/suffix as the standard NPFX/NSFX, the Rufname as the
    // _RUFNAME custom tag Gramps & the German programs (Ahnenblatt, GFAhnen) use.
    if (p.namePrefix) out.push(line(2, 'NPFX', p.namePrefix))
    if (p.nameSuffix) out.push(line(2, 'NSFX', p.nameSuffix))
    if (p.callName) out.push(line(2, '_RUFNAME', p.callName))
    // Name variations as additional NAME records.
    for (const a of aliasByPerson.get(p.id) ?? []) {
      out.push(line(1, 'NAME', `${a.givenName} /${a.surname}/`.trim()))
      if (a.kind) out.push(line(2, 'TYPE', a.kind))
    }
    if (p.sex !== 'U') out.push(line(1, 'SEX', p.sex))
    // Vital events, each with its per-fact research note when present.
    const birthNote = flatNote(p.birthNote)
    if (p.birthDate || p.birthPlace || birthNote) {
      out.push(line(1, 'BIRT'))
      if (p.birthDate) out.push(line(2, 'DATE', p.birthDate))
      if (p.birthPlace) out.push(line(2, 'PLAC', p.birthPlace))
      if (birthNote) out.push(line(2, 'NOTE', birthNote))
    }
    const chrNote = flatNote(p.christeningNote)
    if (p.christeningDate || p.christeningPlace || chrNote) {
      out.push(line(1, 'CHR'))
      if (p.christeningDate) out.push(line(2, 'DATE', p.christeningDate))
      if (p.christeningPlace) out.push(line(2, 'PLAC', p.christeningPlace))
      if (chrNote) out.push(line(2, 'NOTE', chrNote))
    }
    const deathNote = flatNote(p.deathNote)
    if (p.deceased || p.deathDate || p.deathPlace || deathNote) {
      if (p.deathDate || p.deathPlace) {
        out.push(line(1, 'DEAT'))
        if (p.deathDate) out.push(line(2, 'DATE', p.deathDate))
        if (p.deathPlace) out.push(line(2, 'PLAC', p.deathPlace))
      } else {
        // Deceased, date unknown → `1 DEAT Y` asserts the event occurred (5.5.1).
        out.push(line(1, 'DEAT', 'Y'))
      }
      if (deathNote) out.push(line(2, 'NOTE', deathNote))
    }
    const burialNote = flatNote(p.burialNote)
    if (p.burialDate || p.burialPlace || burialNote) {
      out.push(line(1, 'BURI'))
      if (p.burialDate) out.push(line(2, 'DATE', p.burialDate))
      if (p.burialPlace) out.push(line(2, 'PLAC', p.burialPlace))
      if (burialNote) out.push(line(2, 'NOTE', burialNote))
    }
    if (p.illegitimate) out.push(line(1, '_ILLEGITIMATE', 'Y'))
    if (p.stillborn) out.push(line(1, '_STILLBORN', 'Y'))
    // Confidential person → the standard 5.5.1 restriction notice.
    if (p.isPrivate) out.push(line(1, 'RESN', 'confidential'))
    if (p.religion) out.push(line(1, 'RELI', p.religion))
    // Life events: residence as the standard RESI, everything else as a typed
    // EVEN — the import side turns both back into structured events.
    for (const ev of Events.forPerson(p.id)) {
      const period = eventPeriod(ev)
      const note = flatNote(ev.note)
      if (ev.type.toLowerCase() === 'residence') {
        out.push(line(1, 'RESI'))
        if (period) out.push(line(2, 'DATE', period))
        if (ev.place) out.push(line(2, 'PLAC', ev.place))
        if (ev.value) out.push(line(2, 'NOTE', flatNote(ev.value)!))
        else if (note) out.push(line(2, 'NOTE', note))
      } else {
        out.push(line(1, 'EVEN', ev.value ? flatNote(ev.value) ?? undefined : undefined))
        out.push(line(2, 'TYPE', ev.type))
        if (period) out.push(line(2, 'DATE', period))
        if (ev.place) out.push(line(2, 'PLAC', ev.place))
        if (note) out.push(line(2, 'NOTE', note))
      }
      pushParticipants(ev.id, 2)
    }
    for (const occ of occByPerson.get(p.id) ?? []) {
      if (!occ.title) continue
      out.push(line(1, 'OCCU', occ.title))
      const period = periodValue(occ)
      if (period) out.push(line(2, 'DATE', period))
    }
    // Free-form attributes as the generic 5.5.1 attribute: FACT <value> / TYPE <key>.
    for (const attr of Attributes.forPerson(p.id)) {
      out.push(line(1, 'FACT', attr.value ? flatNote(attr.value) ?? undefined : undefined))
      out.push(line(2, 'TYPE', attr.key))
    }
    if (p.notes) out.push(line(1, 'NOTE', p.notes.replace(/\n/g, ' ')))
    // Multimedia objects (FILE → media/<title>.<ext>, or the original URL).
    for (const d of docsByPerson.get(p.id) ?? []) {
      const m = mediaRefs.get(d.id)
      if (!m) continue
      out.push(line(1, 'OBJE'))
      out.push(line(2, 'FILE', m.file))
      out.push(line(3, 'FORM', m.form))
      if (m.title) out.push(line(2, 'TITL', m.title))
    }
    // Godparents as the standard association structure (ASSO + RELA), which
    // Gramps & co. read back as an association — and our import restores it.
    for (const gid of Godparents.forPerson(p.id)) {
      if (!personSet.has(gid)) continue
      out.push(line(1, 'ASSO', xref.get(gid)))
      out.push(line(2, 'RELA', 'godparent'))
    }
    // Christening witnesses use the same ASSO structure with a witness RELA.
    for (const wid of Witnesses.forOwner('person', p.id)) {
      if (!personSet.has(wid)) continue
      out.push(line(1, 'ASSO', xref.get(wid)))
      out.push(line(2, 'RELA', 'christening witness'))
    }
    for (const fx of spouseIn.get(p.id) ?? []) out.push(line(1, 'FAMS', fx))
    for (const fx of childIn.get(p.id) ?? []) {
      out.push(line(1, 'FAMC', fx))
      // Non-birth pedigree (adopted/foster; "step" is our readable extension).
      const rel = childRelation.get(`${p.id}|${fx}`)
      if (rel) out.push(line(2, 'PEDI', rel))
    }
  }

  for (const f of families) {
    out.push(line(0, `${famXref.get(f.id)} FAM`))
    if (f.husbandId && personSet.has(f.husbandId))
      out.push(line(1, 'HUSB', xref.get(f.husbandId)))
    if (f.wifeId && personSet.has(f.wifeId)) out.push(line(1, 'WIFE', xref.get(f.wifeId)))
    for (const cid of f.childIds) {
      if (personSet.has(cid)) out.push(line(1, 'CHIL', xref.get(cid)))
    }
    if (f.marriageDate || f.marriagePlace) {
      out.push(line(1, 'MARR'))
      if (f.marriageDate) out.push(line(2, 'DATE', f.marriageDate))
      if (f.marriagePlace) out.push(line(2, 'PLAC', f.marriagePlace))
    }
    // Marriage witnesses as a custom family-level pointer (our import restores
    // it; other readers safely ignore the underscore tag).
    for (const wid of Witnesses.forOwner('family', f.id)) {
      if (personSet.has(wid)) out.push(line(1, '_WITN', xref.get(wid)))
    }
    // Family (union) events: the standard tags where one exists (DIV/ENGA/MARB),
    // everything else as a typed EVEN — the import side restores both.
    for (const ev of Events.forOwner('family', f.id)) {
      const period = eventPeriod(ev)
      const note = flatNote(ev.note)
      const value = ev.value ? flatNote(ev.value) : null
      const tl = ev.type.toLowerCase()
      const std = tl === 'divorce' ? 'DIV' : tl === 'engagement' ? 'ENGA' : tl === 'banns' ? 'MARB' : null
      if (std) out.push(line(1, std))
      else {
        out.push(line(1, 'EVEN', value ?? undefined))
        out.push(line(2, 'TYPE', ev.type))
      }
      if (period) out.push(line(2, 'DATE', period))
      if (ev.place) out.push(line(2, 'PLAC', ev.place))
      // A standard tag carries no payload — its text value travels as a NOTE.
      if (std && value) out.push(line(2, 'NOTE', value))
      if (note) out.push(line(2, 'NOTE', note))
      pushParticipants(ev.id, 2)
    }
  }

  out.push(line(0, 'TRLR'))
  const text = out.join('\n') + '\n'
  writeFileSync(filePath, text, 'utf-8')
  return text
}
