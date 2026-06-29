import { writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, extname, join } from 'path'
import { Aliases, Documents, Families, Occupations, People } from '../db/repo'
import type { Alias, DocumentRecord, Occupation, Person } from '@shared/types'

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
      if (!existsSync(d.filePath)) continue
      const ext = extOf(d.filePath)
      const base = sanitizeName(d.title)
      let name = `${base}.${ext}`
      for (let i = 2; usedNames.has(name.toLowerCase()); i++) name = `${base}_${i}.${ext}`
      usedNames.add(name.toLowerCase())
      if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true })
      try {
        copyFileSync(d.filePath, join(mediaDir, name))
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

function nameValue(p: Person): string {
  return `${p.givenName} /${p.surname}/`.trim()
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

  // Assign stable xrefs.
  const xref = new Map<string, string>()
  people.forEach((p, i) => xref.set(p.id, p.gedcomId ?? `@I${i + 1}@`))

  const families = Families.list().filter((f) => {
    if (!include) return true
    return (
      (f.husbandId && personSet.has(f.husbandId)) ||
      (f.wifeId && personSet.has(f.wifeId)) ||
      f.childIds.some((c) => personSet.has(c))
    )
  })
  const famXref = new Map<string, string>()
  families.forEach((f, i) => famXref.set(f.id, f.gedcomId ?? `@F${i + 1}@`))

  // Reverse lookups: person -> families they belong to.
  const spouseIn = new Map<string, string[]>()
  const childIn = new Map<string, string[]>()
  for (const f of families) {
    const fx = famXref.get(f.id)!
    for (const sid of [f.husbandId, f.wifeId]) {
      if (sid && personSet.has(sid)) {
        const arr = spouseIn.get(sid) ?? []
        arr.push(fx)
        spouseIn.set(sid, arr)
      }
    }
    for (const cid of f.childIds) {
      if (personSet.has(cid)) {
        const arr = childIn.get(cid) ?? []
        arr.push(fx)
        childIn.set(cid, arr)
      }
    }
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
    // Name variations as additional NAME records.
    for (const a of aliasByPerson.get(p.id) ?? []) {
      out.push(line(1, 'NAME', `${a.givenName} /${a.surname}/`.trim()))
      if (a.kind) out.push(line(2, 'TYPE', a.kind))
    }
    if (p.sex !== 'U') out.push(line(1, 'SEX', p.sex))
    if (p.birthDate || p.birthPlace) {
      out.push(line(1, 'BIRT'))
      if (p.birthDate) out.push(line(2, 'DATE', p.birthDate))
      if (p.birthPlace) out.push(line(2, 'PLAC', p.birthPlace))
    }
    if (p.christeningDate || p.christeningPlace) {
      out.push(line(1, 'CHR'))
      if (p.christeningDate) out.push(line(2, 'DATE', p.christeningDate))
      if (p.christeningPlace) out.push(line(2, 'PLAC', p.christeningPlace))
    }
    if (p.deceased || p.deathDate || p.deathPlace) {
      if (p.deathDate || p.deathPlace) {
        out.push(line(1, 'DEAT'))
        if (p.deathDate) out.push(line(2, 'DATE', p.deathDate))
        if (p.deathPlace) out.push(line(2, 'PLAC', p.deathPlace))
      } else {
        // Deceased, date unknown → `1 DEAT Y` asserts the event occurred (5.5.1).
        out.push(line(1, 'DEAT', 'Y'))
      }
    }
    if (p.burialDate || p.burialPlace) {
      out.push(line(1, 'BURI'))
      if (p.burialDate) out.push(line(2, 'DATE', p.burialDate))
      if (p.burialPlace) out.push(line(2, 'PLAC', p.burialPlace))
    }
    if (p.religion) out.push(line(1, 'RELI', p.religion))
    for (const occ of occByPerson.get(p.id) ?? []) {
      if (!occ.title) continue
      out.push(line(1, 'OCCU', occ.title))
      const period = periodValue(occ)
      if (period) out.push(line(2, 'DATE', period))
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
    for (const fx of spouseIn.get(p.id) ?? []) out.push(line(1, 'FAMS', fx))
    for (const fx of childIn.get(p.id) ?? []) out.push(line(1, 'FAMC', fx))
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
  }

  out.push(line(0, 'TRLR'))
  const text = out.join('\n') + '\n'
  writeFileSync(filePath, text, 'utf-8')
  return text
}
