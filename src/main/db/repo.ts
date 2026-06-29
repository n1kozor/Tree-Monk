import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { getDb } from './connection'
import type {
  BoardEdge,
  BoardNode,
  BoardState,
  Collaboration,
  DocumentInput,
  DocumentKind,
  DocumentRecord,
  Family,
  FamilyInput,
  Person,
  PersonInput,
  Sex
} from '@shared/types'

const now = (): string => new Date().toISOString()
const uuid = (): string => randomUUID()

// ---------- People ----------

interface PersonRow {
  id: string
  gedcom_id: string | null
  fs_id: string | null
  given_name: string
  surname: string
  sex: string
  birth_date: string | null
  birth_place: string | null
  death_date: string | null
  death_place: string | null
  deceased: number
  burial_date: string | null
  burial_place: string | null
  christening_date: string | null
  christening_place: string | null
  religion: string | null
  birth_note: string | null
  death_note: string | null
  christening_note: string | null
  burial_note: string | null
  occupation: string | null
  notes: string | null
  profile_photo_id: string | null
  profile_photo_crop: string | null
  created_at: string
  updated_at: string
}

/** A person is deceased if explicitly flagged OR a death date is recorded. */
function isDeceased(input: Pick<PersonInput, 'deceased' | 'deathDate'>): boolean {
  return Boolean(input.deceased) || Boolean(input.deathDate)
}

function mapPerson(r: PersonRow): Person {
  return {
    id: r.id,
    gedcomId: r.gedcom_id,
    fsId: r.fs_id,
    givenName: r.given_name,
    surname: r.surname,
    sex: (r.sex as Sex) ?? 'U',
    birthDate: r.birth_date,
    birthPlace: r.birth_place,
    deathDate: r.death_date,
    deathPlace: r.death_place,
    deceased: Boolean(r.deceased) || Boolean(r.death_date),
    burialDate: r.burial_date,
    burialPlace: r.burial_place,
    christeningDate: r.christening_date,
    christeningPlace: r.christening_place,
    religion: r.religion,
    birthNote: r.birth_note,
    deathNote: r.death_note,
    christeningNote: r.christening_note,
    burialNote: r.burial_note,
    occupation: r.occupation,
    notes: r.notes,
    profilePhotoId: r.profile_photo_id,
    profilePhotoCrop: r.profile_photo_crop,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export const People = {
  list(): Person[] {
    return getDb()
      .prepare('SELECT * FROM people ORDER BY surname, given_name')
      .all()
      .map((r) => mapPerson(r as PersonRow))
  },
  get(id: string): Person | null {
    const row = getDb().prepare('SELECT * FROM people WHERE id = ?').get(id) as
      | PersonRow
      | undefined
    return row ? mapPerson(row) : null
  },
  findByFsId(fsId: string): Person | null {
    const row = getDb().prepare('SELECT * FROM people WHERE fs_id = ?').get(fsId) as
      | PersonRow
      | undefined
    return row ? mapPerson(row) : null
  },
  create(input: PersonInput, id = uuid()): Person {
    const ts = now()
    getDb()
      .prepare(
        `INSERT INTO people (id, gedcom_id, fs_id, given_name, surname, sex, birth_date, birth_place,
          death_date, death_place, deceased, burial_date, burial_place, christening_date, christening_place, religion, birth_note, death_note, christening_note, burial_note, occupation, notes, profile_photo_id, profile_photo_crop, created_at, updated_at)
         VALUES (@id, @gedcom_id, @fs_id, @given_name, @surname, @sex, @birth_date, @birth_place,
          @death_date, @death_place, @deceased, @burial_date, @burial_place, @christening_date, @christening_place, @religion, @birth_note, @death_note, @christening_note, @burial_note, @occupation, @notes, @profile_photo_id, @profile_photo_crop, @created_at, @updated_at)`
      )
      .run({
        id,
        gedcom_id: input.gedcomId ?? null,
        fs_id: input.fsId ?? null,
        given_name: input.givenName ?? '',
        surname: input.surname ?? '',
        sex: input.sex ?? 'U',
        birth_date: input.birthDate ?? null,
        birth_place: input.birthPlace ?? null,
        death_date: input.deathDate ?? null,
        death_place: input.deathPlace ?? null,
        deceased: isDeceased(input) ? 1 : 0,
        burial_date: input.burialDate ?? null,
        burial_place: input.burialPlace ?? null,
        christening_date: input.christeningDate ?? null,
        christening_place: input.christeningPlace ?? null,
        religion: input.religion ?? null,
        birth_note: input.birthNote ?? null,
        death_note: input.deathNote ?? null,
        christening_note: input.christeningNote ?? null,
        burial_note: input.burialNote ?? null,
        occupation: input.occupation ?? null,
        notes: input.notes ?? null,
        profile_photo_id: input.profilePhotoId ?? null,
        profile_photo_crop: input.profilePhotoCrop ?? null,
        created_at: ts,
        updated_at: ts
      })
    return this.get(id)!
  },
  update(id: string, input: PersonInput): Person {
    const existing = this.get(id)
    if (!existing) throw new Error(`Person ${id} not found`)
    const merged = { ...existing, ...input }
    getDb()
      .prepare(
        `UPDATE people SET given_name=@given_name, surname=@surname, sex=@sex, birth_date=@birth_date,
          birth_place=@birth_place, death_date=@death_date, death_place=@death_place, deceased=@deceased,
          burial_date=@burial_date, burial_place=@burial_place,
          christening_date=@christening_date, christening_place=@christening_place, religion=@religion,
          birth_note=@birth_note, death_note=@death_note, christening_note=@christening_note, burial_note=@burial_note,
          occupation=@occupation, notes=@notes, profile_photo_id=@profile_photo_id,
          profile_photo_crop=@profile_photo_crop, gedcom_id=@gedcom_id,
          fs_id=@fs_id, updated_at=@updated_at WHERE id=@id`
      )
      .run({
        id,
        fs_id: merged.fsId ?? null,
        given_name: merged.givenName,
        surname: merged.surname,
        sex: merged.sex,
        birth_date: merged.birthDate,
        birth_place: merged.birthPlace,
        death_date: merged.deathDate,
        death_place: merged.deathPlace,
        deceased: isDeceased(merged) ? 1 : 0,
        burial_date: merged.burialDate,
        burial_place: merged.burialPlace,
        christening_date: merged.christeningDate,
        christening_place: merged.christeningPlace,
        religion: merged.religion,
        birth_note: merged.birthNote ?? null,
        death_note: merged.deathNote ?? null,
        christening_note: merged.christeningNote ?? null,
        burial_note: merged.burialNote ?? null,
        occupation: merged.occupation,
        notes: merged.notes,
        profile_photo_id: merged.profilePhotoId,
        profile_photo_crop: merged.profilePhotoCrop ?? null,
        gedcom_id: merged.gedcomId,
        updated_at: now()
      })
    return this.get(id)!
  },
  /**
   * Non-destructive merge for imports: fills ONLY empty fields from `input`,
   * never overwriting values the user already curated (e.g. geo-standardized
   * places). Also links stable ids (fs_id / gedcom_id) and lets `deceased`
   * advance to true. Returns true if anything actually changed.
   */
  fillFrom(id: string, input: PersonInput): boolean {
    const e = this.get(id)
    if (!e) return false
    const empty = (v: string | null): boolean => v === null || v === ''
    const next = {
      given_name: empty(e.givenName) && input.givenName ? input.givenName : e.givenName,
      surname: empty(e.surname) && input.surname ? input.surname : e.surname,
      sex: e.sex === 'U' && input.sex && input.sex !== 'U' ? input.sex : e.sex,
      birth_date: empty(e.birthDate) && input.birthDate ? input.birthDate : e.birthDate,
      birth_place: empty(e.birthPlace) && input.birthPlace ? input.birthPlace : e.birthPlace,
      death_date: empty(e.deathDate) && input.deathDate ? input.deathDate : e.deathDate,
      death_place: empty(e.deathPlace) && input.deathPlace ? input.deathPlace : e.deathPlace,
      deceased: e.deceased || input.deceased || !!input.deathDate ? 1 : 0,
      burial_date: empty(e.burialDate) && input.burialDate ? input.burialDate : e.burialDate,
      burial_place: empty(e.burialPlace) && input.burialPlace ? input.burialPlace : e.burialPlace,
      christening_date: empty(e.christeningDate) && input.christeningDate ? input.christeningDate : e.christeningDate,
      christening_place: empty(e.christeningPlace) && input.christeningPlace ? input.christeningPlace : e.christeningPlace,
      religion: empty(e.religion) && input.religion ? input.religion : e.religion,
      birth_note: empty(e.birthNote) && input.birthNote ? input.birthNote : e.birthNote,
      death_note: empty(e.deathNote) && input.deathNote ? input.deathNote : e.deathNote,
      christening_note: empty(e.christeningNote) && input.christeningNote ? input.christeningNote : e.christeningNote,
      burial_note: empty(e.burialNote) && input.burialNote ? input.burialNote : e.burialNote,
      fs_id: e.fsId ?? input.fsId ?? null,
      gedcom_id: e.gedcomId ?? input.gedcomId ?? null
    }
    const changed =
      next.given_name !== e.givenName ||
      next.surname !== e.surname ||
      next.sex !== e.sex ||
      next.birth_date !== e.birthDate ||
      next.birth_place !== e.birthPlace ||
      next.death_date !== e.deathDate ||
      next.death_place !== e.deathPlace ||
      Boolean(next.deceased) !== e.deceased ||
      next.burial_date !== e.burialDate ||
      next.burial_place !== e.burialPlace ||
      next.christening_date !== e.christeningDate ||
      next.christening_place !== e.christeningPlace ||
      next.religion !== e.religion ||
      next.birth_note !== e.birthNote ||
      next.death_note !== e.deathNote ||
      next.christening_note !== e.christeningNote ||
      next.burial_note !== e.burialNote ||
      next.fs_id !== e.fsId ||
      next.gedcom_id !== e.gedcomId
    if (!changed) return false
    getDb()
      .prepare(
        `UPDATE people SET given_name=@given_name, surname=@surname, sex=@sex, birth_date=@birth_date,
          birth_place=@birth_place, death_date=@death_date, death_place=@death_place, deceased=@deceased,
          burial_date=@burial_date, burial_place=@burial_place,
          christening_date=@christening_date, christening_place=@christening_place, religion=@religion,
          birth_note=@birth_note, death_note=@death_note, christening_note=@christening_note, burial_note=@burial_note,
          fs_id=@fs_id, gedcom_id=@gedcom_id, updated_at=@updated_at WHERE id=@id`
      )
      .run({ id, ...next, updated_at: now() })
    return true
  },
  /**
   * Authoritative merge for an EXPLICIT single-person sync: the source WINS for
   * every field it provides a value for (so a change on FamilySearch is pulled
   * in), but never wipes a local value with an empty source value. Returns true
   * if anything changed.
   */
  overwriteFrom(id: string, input: PersonInput): boolean {
    const e = this.get(id)
    if (!e) return false
    const pick = (val: string | null | undefined, cur: string | null): string | null =>
      val ? val : cur
    const next = {
      given_name: pick(input.givenName, e.givenName),
      surname: pick(input.surname, e.surname),
      sex: input.sex && input.sex !== 'U' ? input.sex : e.sex,
      birth_date: pick(input.birthDate, e.birthDate),
      birth_place: pick(input.birthPlace, e.birthPlace),
      death_date: pick(input.deathDate, e.deathDate),
      death_place: pick(input.deathPlace, e.deathPlace),
      deceased: e.deceased || input.deceased || !!input.deathDate ? 1 : 0,
      burial_date: pick(input.burialDate, e.burialDate),
      burial_place: pick(input.burialPlace, e.burialPlace),
      christening_date: pick(input.christeningDate, e.christeningDate),
      christening_place: pick(input.christeningPlace, e.christeningPlace),
      religion: pick(input.religion, e.religion),
      birth_note: pick(input.birthNote, e.birthNote),
      death_note: pick(input.deathNote, e.deathNote),
      christening_note: pick(input.christeningNote, e.christeningNote),
      burial_note: pick(input.burialNote, e.burialNote),
      fs_id: input.fsId ?? e.fsId ?? null,
      gedcom_id: e.gedcomId ?? input.gedcomId ?? null
    }
    const changed =
      next.given_name !== e.givenName ||
      next.surname !== e.surname ||
      next.sex !== e.sex ||
      next.birth_date !== e.birthDate ||
      next.birth_place !== e.birthPlace ||
      next.death_date !== e.deathDate ||
      next.death_place !== e.deathPlace ||
      Boolean(next.deceased) !== e.deceased ||
      next.burial_date !== e.burialDate ||
      next.burial_place !== e.burialPlace ||
      next.christening_date !== e.christeningDate ||
      next.christening_place !== e.christeningPlace ||
      next.religion !== e.religion ||
      next.birth_note !== e.birthNote ||
      next.death_note !== e.deathNote ||
      next.christening_note !== e.christeningNote ||
      next.burial_note !== e.burialNote ||
      next.fs_id !== e.fsId
    if (!changed) return false
    getDb()
      .prepare(
        `UPDATE people SET given_name=@given_name, surname=@surname, sex=@sex, birth_date=@birth_date,
          birth_place=@birth_place, death_date=@death_date, death_place=@death_place, deceased=@deceased,
          burial_date=@burial_date, burial_place=@burial_place,
          christening_date=@christening_date, christening_place=@christening_place, religion=@religion,
          birth_note=@birth_note, death_note=@death_note, christening_note=@christening_note, burial_note=@burial_note,
          fs_id=@fs_id, gedcom_id=@gedcom_id, updated_at=@updated_at WHERE id=@id`
      )
      .run({ id, ...next, updated_at: now() })
    return true
  },
  /** Deletes a person, returning a full snapshot so the action can be undone. */
  remove(id: string): PersonSnapshot | null {
    const db = getDb()
    const person = this.get(id)
    if (!person) return null
    const ids = (rows: unknown[]): string[] => rows.map((r) => (r as { id: string }).id)
    const snapshot: PersonSnapshot = {
      person,
      husbandOf: ids(db.prepare('SELECT id FROM families WHERE husband_id = ?').all(id)),
      wifeOf: ids(db.prepare('SELECT id FROM families WHERE wife_id = ?').all(id)),
      childOf: (db.prepare('SELECT family_id, ordinal FROM family_children WHERE child_id = ?').all(id) as {
        family_id: string
        ordinal: number
      }[]).map((r) => ({ familyId: r.family_id, ordinal: r.ordinal })),
      documentIds: ids(db.prepare('SELECT document_id AS id FROM person_documents WHERE person_id = ?').all(id)),
      citations: db
        .prepare("SELECT * FROM citations WHERE owner_type='person' AND owner_id = ?")
        .all(id)
        .map((x) => {
          const r = x as Record<string, unknown>
          return {
            id: r.id as string,
            sourceId: (r.source_id as string) ?? null,
            ownerType: 'person' as const,
            ownerId: id,
            eventTag: (r.event_tag as string) ?? null,
            page: (r.page as string) ?? null,
            quality: (r.quality as string) ?? null,
            note: (r.note as string) ?? null
          }
        }),
      noteIds: (db.prepare("SELECT note_id FROM note_links WHERE owner_type='person' AND owner_id = ?").all(id) as {
        note_id: string
      }[]).map((r) => r.note_id)
    }
    db.prepare('DELETE FROM people WHERE id = ?').run(id)
    // Deleting the person nulls their husband_id/wife_id (ON DELETE SET NULL) and
    // cascades their child links. Any family that is now completely empty — no
    // husband, no wife, no children — is an orphan "ghost" couple that would
    // otherwise linger on the tree, so remove it (and remember it for undo).
    const emptiedFamilies: Family[] = []
    for (const fid of [...new Set([...snapshot.husbandOf, ...snapshot.wifeOf])]) {
      const f = db.prepare('SELECT * FROM families WHERE id = ?').get(fid) as FamilyRow | undefined
      if (!f) continue
      const hasChild = db.prepare('SELECT 1 FROM family_children WHERE family_id = ? LIMIT 1').get(fid)
      if (!f.husband_id && !f.wife_id && !hasChild) {
        emptiedFamilies.push(mapFamily(db, f))
        db.prepare('DELETE FROM families WHERE id = ?').run(fid)
      }
    }
    snapshot.emptiedFamilies = emptiedFamilies
    return snapshot
  },
  /** Re-creates a person and all their relationships from a snapshot. */
  restore(snap: PersonSnapshot): void {
    const db = getDb()
    const p = snap.person
    this.create(
      {
        gedcomId: p.gedcomId,
        givenName: p.givenName,
        surname: p.surname,
        sex: p.sex,
        birthDate: p.birthDate,
        birthPlace: p.birthPlace,
        deathDate: p.deathDate,
        deathPlace: p.deathPlace,
        deceased: p.deceased,
        burialDate: p.burialDate,
        burialPlace: p.burialPlace,
        christeningDate: p.christeningDate,
        christeningPlace: p.christeningPlace,
        religion: p.religion,
        occupation: p.occupation,
        notes: p.notes,
        profilePhotoId: p.profilePhotoId
      },
      p.id
    )
    // Recreate any families that were removed because they became empty, before
    // re-attaching this person to them below.
    for (const f of snap.emptiedFamilies ?? [])
      db.prepare(
        'INSERT OR IGNORE INTO families (id, gedcom_id, husband_id, wife_id, marriage_date, marriage_place, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(f.id, f.gedcomId, null, null, f.marriageDate, f.marriagePlace, f.notes)
    for (const fid of snap.husbandOf)
      db.prepare('UPDATE families SET husband_id = ? WHERE id = ?').run(p.id, fid)
    for (const fid of snap.wifeOf)
      db.prepare('UPDATE families SET wife_id = ? WHERE id = ?').run(p.id, fid)
    for (const c of snap.childOf)
      db.prepare('INSERT OR IGNORE INTO family_children (family_id, child_id, ordinal) VALUES (?, ?, ?)').run(
        c.familyId,
        p.id,
        c.ordinal
      )
    for (const did of snap.documentIds)
      db.prepare('INSERT OR IGNORE INTO person_documents (person_id, document_id) VALUES (?, ?)').run(p.id, did)
    for (const cit of snap.citations) Citations.create(cit, cit.id)
    for (const nid of snap.noteIds) Notes.link(nid, 'person', p.id)
  },
  findByGedcomId(gedcomId: string): Person | null {
    const row = getDb()
      .prepare('SELECT * FROM people WHERE gedcom_id = ?')
      .get(gedcomId) as PersonRow | undefined
    return row ? mapPerson(row) : null
  }
}

// ---------- Families ----------

interface FamilyRow {
  id: string
  gedcom_id: string | null
  husband_id: string | null
  wife_id: string | null
  marriage_date: string | null
  marriage_place: string | null
  notes: string | null
}

function childIdsOf(db: Database.Database, familyId: string): string[] {
  return db
    .prepare('SELECT child_id FROM family_children WHERE family_id = ? ORDER BY ordinal')
    .all(familyId)
    .map((r) => (r as { child_id: string }).child_id)
}

function mapFamily(db: Database.Database, r: FamilyRow): Family {
  return {
    id: r.id,
    gedcomId: r.gedcom_id,
    husbandId: r.husband_id,
    wifeId: r.wife_id,
    marriageDate: r.marriage_date,
    marriagePlace: r.marriage_place,
    notes: r.notes,
    childIds: childIdsOf(db, r.id)
  }
}

function writeChildren(db: Database.Database, familyId: string, childIds: string[]): void {
  db.prepare('DELETE FROM family_children WHERE family_id = ?').run(familyId)
  const ins = db.prepare(
    'INSERT OR IGNORE INTO family_children (family_id, child_id, ordinal) VALUES (?, ?, ?)'
  )
  childIds.forEach((cid, i) => ins.run(familyId, cid, i))
}

export const Families = {
  list(): Family[] {
    const db = getDb()
    return db
      .prepare('SELECT * FROM families')
      .all()
      .map((r) => mapFamily(db, r as FamilyRow))
  },
  get(id: string): Family | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM families WHERE id = ?').get(id) as
      | FamilyRow
      | undefined
    return row ? mapFamily(db, row) : null
  },
  create(input: FamilyInput, id = uuid()): Family {
    const db = getDb()
    db.prepare(
      `INSERT INTO families (id, gedcom_id, husband_id, wife_id, marriage_date, marriage_place, notes)
       VALUES (@id, @gedcom_id, @husband_id, @wife_id, @marriage_date, @marriage_place, @notes)`
    ).run({
      id,
      gedcom_id: input.gedcomId ?? null,
      husband_id: input.husbandId ?? null,
      wife_id: input.wifeId ?? null,
      marriage_date: input.marriageDate ?? null,
      marriage_place: input.marriagePlace ?? null,
      notes: input.notes ?? null
    })
    if (input.childIds) writeChildren(db, id, input.childIds)
    return this.get(id)!
  },
  update(id: string, input: FamilyInput): Family {
    const db = getDb()
    const existing = this.get(id)
    if (!existing) throw new Error(`Family ${id} not found`)
    const merged = { ...existing, ...input }
    db.prepare(
      `UPDATE families SET gedcom_id=@gedcom_id, husband_id=@husband_id, wife_id=@wife_id,
        marriage_date=@marriage_date, marriage_place=@marriage_place, notes=@notes WHERE id=@id`
    ).run({
      id,
      gedcom_id: merged.gedcomId,
      husband_id: merged.husbandId,
      wife_id: merged.wifeId,
      marriage_date: merged.marriageDate,
      marriage_place: merged.marriagePlace,
      notes: merged.notes
    })
    if (input.childIds) writeChildren(db, id, input.childIds)
    return this.get(id)!
  },
  remove(id: string): void {
    getDb().prepare('DELETE FROM families WHERE id = ?').run(id)
  },
  findByGedcomId(gedcomId: string): Family | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM families WHERE gedcom_id = ?').get(gedcomId) as
      | FamilyRow
      | undefined
    return row ? mapFamily(db, row) : null
  },
  /** Finds a family by its (husband, wife) pair — used to dedup on re-import. */
  findByParents(husbandId: string | null, wifeId: string | null): Family | null {
    if (!husbandId && !wifeId) return null
    const db = getDb()
    // `IS` so NULL parents compare correctly (unlike `=`).
    const row = db
      .prepare('SELECT * FROM families WHERE husband_id IS ? AND wife_id IS ?')
      .get(husbandId, wifeId) as FamilyRow | undefined
    return row ? mapFamily(db, row) : null
  }
}

// ---------- Documents ----------

interface DocumentRow {
  id: string
  title: string
  kind: string
  file_path: string
  mime_type: string | null
  date: string | null
  description: string | null
  created_at: string
}

function personIdsOf(db: Database.Database, documentId: string): string[] {
  return db
    .prepare('SELECT person_id FROM person_documents WHERE document_id = ?')
    .all(documentId)
    .map((r) => (r as { person_id: string }).person_id)
}

function mapDocument(db: Database.Database, r: DocumentRow): DocumentRecord {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind as DocumentRecord['kind'],
    filePath: r.file_path,
    mimeType: r.mime_type,
    date: r.date,
    description: r.description,
    createdAt: r.created_at,
    personIds: personIdsOf(db, r.id)
  }
}

export const Documents = {
  list(): DocumentRecord[] {
    const db = getDb()
    return db
      .prepare('SELECT * FROM documents ORDER BY created_at DESC')
      .all()
      .map((r) => mapDocument(db, r as DocumentRow))
  },
  get(id: string): DocumentRecord | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
      | DocumentRow
      | undefined
    return row ? mapDocument(db, row) : null
  },
  listForPerson(personId: string): DocumentRecord[] {
    const db = getDb()
    return db
      .prepare(
        `SELECT d.* FROM documents d
         JOIN person_documents pd ON pd.document_id = d.id
         WHERE pd.person_id = ? ORDER BY d.created_at DESC`
      )
      .all(personId)
      .map((r) => mapDocument(db, r as DocumentRow))
  },
  create(
    input: DocumentInput & { filePath: string },
    id = uuid()
  ): DocumentRecord {
    const db = getDb()
    db.prepare(
      `INSERT INTO documents (id, title, kind, file_path, mime_type, date, description, created_at)
       VALUES (@id, @title, @kind, @file_path, @mime_type, @date, @description, @created_at)`
    ).run({
      id,
      title: input.title ?? '',
      kind: input.kind ?? 'other',
      file_path: input.filePath,
      mime_type: input.mimeType ?? null,
      date: input.date ?? null,
      description: input.description ?? null,
      created_at: now()
    })
    if (input.personIds) input.personIds.forEach((pid) => this.attach(id, pid))
    return this.get(id)!
  },
  update(id: string, input: DocumentInput): DocumentRecord {
    const db = getDb()
    const existing = this.get(id)
    if (!existing) throw new Error(`Document ${id} not found`)
    const merged = { ...existing, ...input }
    db.prepare(
      `UPDATE documents SET title=@title, kind=@kind, date=@date, description=@description WHERE id=@id`
    ).run({
      id,
      title: merged.title,
      kind: merged.kind,
      date: merged.date,
      description: merged.description
    })
    return this.get(id)!
  },
  /** Photo documents whose file is still a remote http(s) URL (awaiting download). */
  remotePhotos(): DocumentRecord[] {
    const db = getDb()
    return db
      .prepare("SELECT * FROM documents WHERE kind = 'photo' AND file_path LIKE 'http%' ORDER BY created_at")
      .all()
      .map((r) => mapDocument(db, r as DocumentRow))
  },
  /** Points a document at a now-local file (after a remote media download). */
  setFile(id: string, filePath: string, mimeType: string, kind: DocumentKind): void {
    getDb()
      .prepare('UPDATE documents SET file_path=@file_path, mime_type=@mime_type, kind=@kind WHERE id=@id')
      .run({ id, file_path: filePath, mime_type: mimeType, kind })
  },
  /** Deletes a document row (keeping the media file) and returns a snapshot. */
  remove(id: string): DocumentSnapshot | null {
    const doc = this.get(id)
    if (!doc) return null
    getDb().prepare('DELETE FROM documents WHERE id = ?').run(id)
    return { document: doc }
  },
  restore(snap: DocumentSnapshot): void {
    const d = snap.document
    this.create(
      {
        title: d.title,
        kind: d.kind,
        filePath: d.filePath,
        mimeType: d.mimeType,
        date: d.date,
        description: d.description,
        personIds: d.personIds
      },
      d.id
    )
  },
  attach(documentId: string, personId: string): void {
    getDb()
      .prepare(
        'INSERT OR IGNORE INTO person_documents (person_id, document_id) VALUES (?, ?)'
      )
      .run(personId, documentId)
  },
  detach(documentId: string, personId: string): void {
    getDb()
      .prepare('DELETE FROM person_documents WHERE person_id = ? AND document_id = ?')
      .run(personId, documentId)
  },
  countForPerson(personId: string): number {
    const row = getDb()
      .prepare('SELECT COUNT(*) as n FROM person_documents WHERE person_id = ?')
      .get(personId) as { n: number }
    return row.n
  }
}

// ---------- Board ----------

interface BoardNodeRow {
  id: string
  board_id: string
  kind: string
  ref_id: string | null
  label: string | null
  content: string | null
  pos_x: number
  pos_y: number
  width: number | null
  height: number | null
  data: string
}

interface BoardEdgeRow {
  id: string
  board_id: string
  source: string
  target: string
  label: string | null
  data: string
}

function mapBoardNode(r: BoardNodeRow): BoardNode {
  return {
    id: r.id,
    boardId: r.board_id,
    kind: r.kind as BoardNode['kind'],
    refId: r.ref_id,
    label: r.label,
    content: r.content,
    posX: r.pos_x,
    posY: r.pos_y,
    width: r.width,
    height: r.height,
    data: safeJson(r.data)
  }
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    return {}
  }
}

export const Board = {
  get(boardId = 'main'): BoardState {
    const db = getDb()
    const nodes = db
      .prepare('SELECT * FROM board_nodes WHERE board_id = ?')
      .all(boardId)
      .map((r) => mapBoardNode(r as BoardNodeRow))
    const edges = db
      .prepare('SELECT * FROM board_edges WHERE board_id = ?')
      .all(boardId)
      .map((r) => {
        const e = r as BoardEdgeRow
        return {
          id: e.id,
          boardId: e.board_id,
          source: e.source,
          target: e.target,
          label: e.label,
          data: safeJson(e.data)
        } satisfies BoardEdge
      })
    return { nodes, edges }
  },
  saveNode(node: BoardNode): void {
    getDb()
      .prepare(
        `INSERT INTO board_nodes (id, board_id, kind, ref_id, label, content, pos_x, pos_y, width, height, data)
         VALUES (@id, @board_id, @kind, @ref_id, @label, @content, @pos_x, @pos_y, @width, @height, @data)
         ON CONFLICT(id) DO UPDATE SET kind=@kind, ref_id=@ref_id, label=@label, content=@content,
           pos_x=@pos_x, pos_y=@pos_y, width=@width, height=@height, data=@data`
      )
      .run({
        id: node.id,
        board_id: node.boardId,
        kind: node.kind,
        ref_id: node.refId,
        label: node.label,
        content: node.content,
        pos_x: node.posX,
        pos_y: node.posY,
        width: node.width,
        height: node.height,
        data: JSON.stringify(node.data ?? {})
      })
  },
  saveNodes(nodes: BoardNode[]): void {
    const db = getDb()
    const tx = db.transaction((items: BoardNode[]) => {
      for (const n of items) this.saveNode(n)
    })
    tx(nodes)
  },
  removeNode(id: string): void {
    const db = getDb()
    db.prepare('DELETE FROM board_nodes WHERE id = ?').run(id)
    db.prepare('DELETE FROM board_edges WHERE source = ? OR target = ?').run(id, id)
  },
  saveEdge(edge: BoardEdge): void {
    getDb()
      .prepare(
        `INSERT INTO board_edges (id, board_id, source, target, label, data)
         VALUES (@id, @board_id, @source, @target, @label, @data)
         ON CONFLICT(id) DO UPDATE SET source=@source, target=@target, label=@label, data=@data`
      )
      .run({
        id: edge.id,
        board_id: edge.boardId,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        data: JSON.stringify(edge.data ?? {})
      })
  },
  removeEdge(id: string): void {
    getDb().prepare('DELETE FROM board_edges WHERE id = ?').run(id)
  }
}

// ---------- Places (gazetteer from GEDCOM coordinates) ----------

export interface PlaceRow {
  name: string
  lat: number
  lon: number
}

// ---------- App settings (key/value) ----------

export const AppSettings = {
  get(key: string): string | null {
    const r = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string | null }
      | undefined
    return r?.value ?? null
  },
  set(key: string, value: string | null): void {
    getDb()
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      )
      .run(key, value)
  }
}

// ---------- Boards ----------

import type {
  Alias,
  AliasInput,
  BoardMeta,
  Citation,
  CitationDetail,
  CustomFamous,
  CustomFamousInput,
  DocumentSnapshot,
  EventInput,
  EventRecord,
  NoteRecord,
  Occupation,
  OccupationInput,
  PersonSnapshot,
  Repository,
  ResearchLog,
  ResearchLogInput,
  ResearchResult,
  Source
} from '@shared/types'

export const Boards = {
  list(): BoardMeta[] {
    const rows = getDb()
      .prepare('SELECT id, name, ordinal, created_at FROM boards ORDER BY ordinal, created_at')
      .all() as { id: string; name: string; ordinal: number; created_at: string }[]
    if (rows.length === 0) {
      // Seed the default board on first use.
      const ts = now()
      getDb()
        .prepare('INSERT INTO boards (id, name, ordinal, created_at) VALUES (?, ?, 0, ?)')
        .run('main', 'Board 1', ts)
      return [{ id: 'main', name: 'Board 1', ordinal: 0, createdAt: ts }]
    }
    return rows.map((r) => ({ id: r.id, name: r.name, ordinal: r.ordinal, createdAt: r.created_at }))
  },
  create(name: string): BoardMeta {
    const id = uuid()
    const ts = now()
    const ord =
      (getDb().prepare('SELECT COALESCE(MAX(ordinal), -1) + 1 AS n FROM boards').get() as { n: number })
        .n ?? 0
    getDb()
      .prepare('INSERT INTO boards (id, name, ordinal, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, ord, ts)
    return { id, name, ordinal: ord, createdAt: ts }
  },
  rename(id: string, name: string): void {
    getDb().prepare('UPDATE boards SET name = ? WHERE id = ?').run(name, id)
  },
  remove(id: string): void {
    const db = getDb()
    db.prepare('DELETE FROM board_nodes WHERE board_id = ?').run(id)
    db.prepare('DELETE FROM board_edges WHERE board_id = ?').run(id)
    db.prepare('DELETE FROM boards WHERE id = ?').run(id)
  },
  /** Duplicates a board with all its nodes and edges (remapping ids). */
  duplicate(srcId: string, name: string): BoardMeta {
    const db = getDb()
    const board = this.create(name)
    const idMap = new Map<string, string>()
    const nodes = db.prepare('SELECT * FROM board_nodes WHERE board_id = ?').all(srcId) as Record<
      string,
      unknown
    >[]
    const insN = db.prepare(
      `INSERT INTO board_nodes (id, board_id, kind, ref_id, label, content, pos_x, pos_y, width, height, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const n of nodes) {
      const nid = uuid()
      idMap.set(n.id as string, nid)
      insN.run(
        nid,
        board.id,
        n.kind,
        n.ref_id,
        n.label,
        n.content,
        n.pos_x,
        n.pos_y,
        n.width,
        n.height,
        n.data
      )
    }
    const edges = db.prepare('SELECT * FROM board_edges WHERE board_id = ?').all(srcId) as Record<
      string,
      unknown
    >[]
    const insE = db.prepare(
      'INSERT INTO board_edges (id, board_id, source, target, label, data) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const e of edges) {
      const s = idMap.get(e.source as string)
      const t = idMap.get(e.target as string)
      if (s && t) insE.run(uuid(), board.id, s, t, e.label, e.data)
    }
    return board
  }
}

// ---------- Repositories / Sources / Notes / Citations ----------

export const Repositories = {
  upsert(input: Omit<Repository, 'id'> & { id?: string }): Repository {
    const db = getDb()
    const existing = input.gedcomId
      ? (db.prepare('SELECT id FROM repositories WHERE gedcom_id = ?').get(input.gedcomId) as
          | { id: string }
          | undefined)
      : undefined
    const id = existing?.id ?? input.id ?? uuid()
    db.prepare(
      `INSERT INTO repositories (id, gedcom_id, name, address) VALUES (@id, @gedcom_id, @name, @address)
       ON CONFLICT(id) DO UPDATE SET gedcom_id=@gedcom_id, name=@name, address=@address`
    ).run({ id, gedcom_id: input.gedcomId ?? null, name: input.name ?? '', address: input.address ?? null })
    return { id, gedcomId: input.gedcomId ?? null, name: input.name ?? '', address: input.address ?? null }
  },
  findByGedcomId(gedcomId: string): Repository | null {
    const r = getDb().prepare('SELECT * FROM repositories WHERE gedcom_id = ?').get(gedcomId) as
      | { id: string; gedcom_id: string | null; name: string; address: string | null }
      | undefined
    return r ? { id: r.id, gedcomId: r.gedcom_id, name: r.name, address: r.address } : null
  }
}

export const Sources = {
  upsert(input: Omit<Source, 'id'> & { id?: string }): Source {
    const db = getDb()
    const existing = input.gedcomId
      ? (db.prepare('SELECT id FROM sources WHERE gedcom_id = ?').get(input.gedcomId) as
          | { id: string }
          | undefined)
      : undefined
    const id = existing?.id ?? input.id ?? uuid()
    db.prepare(
      `INSERT INTO sources (id, gedcom_id, title, author, publication, repository_id, text, record_date)
       VALUES (@id, @gedcom_id, @title, @author, @publication, @repository_id, @text, @record_date)
       ON CONFLICT(id) DO UPDATE SET gedcom_id=@gedcom_id, title=@title, author=@author,
         publication=@publication, repository_id=@repository_id, text=@text,
         record_date=COALESCE(@record_date, record_date)`
    ).run({
      id,
      gedcom_id: input.gedcomId ?? null,
      title: input.title ?? '',
      author: input.author ?? null,
      publication: input.publication ?? null,
      repository_id: input.repositoryId ?? null,
      text: input.text ?? null,
      record_date: input.recordDate ?? null
    })
    return { ...input, id, gedcomId: input.gedcomId ?? null } as Source
  },
  /** Patch selected columns of a source (only the provided keys are written). */
  update(
    id: string,
    f: Partial<Pick<Source, 'title' | 'author' | 'publication' | 'text' | 'recordDate'>>
  ): void {
    const set: string[] = []
    const vals: Record<string, unknown> = { id }
    if (f.title !== undefined) (set.push('title=@title'), (vals.title = f.title ?? ''))
    if (f.author !== undefined) (set.push('author=@author'), (vals.author = f.author ?? null))
    if (f.publication !== undefined)
      (set.push('publication=@publication'), (vals.publication = f.publication ?? null))
    if (f.text !== undefined) (set.push('text=@text'), (vals.text = f.text ?? null))
    if (f.recordDate !== undefined)
      (set.push('record_date=@record_date'), (vals.record_date = f.recordDate ?? null))
    if (!set.length) return
    getDb()
      .prepare(`UPDATE sources SET ${set.join(', ')} WHERE id=@id`)
      .run(vals)
  },
  findByGedcomId(gedcomId: string): Source | null {
    const r = getDb().prepare('SELECT * FROM sources WHERE gedcom_id = ?').get(gedcomId) as
      | {
          id: string
          gedcom_id: string | null
          title: string
          author: string | null
          publication: string | null
          repository_id: string | null
          text: string | null
        }
      | undefined
    return r
      ? {
          id: r.id,
          gedcomId: r.gedcom_id,
          title: r.title,
          author: r.author,
          publication: r.publication,
          repositoryId: r.repository_id,
          text: r.text
        }
      : null
  }
}

export const Notes = {
  create(text: string, gedcomId: string | null = null, id = uuid()): NoteRecord {
    getDb()
      .prepare('INSERT OR REPLACE INTO notes (id, gedcom_id, text) VALUES (?, ?, ?)')
      .run(id, gedcomId, text)
    return { id, gedcomId, text }
  },
  findByGedcomId(gedcomId: string): NoteRecord | null {
    const r = getDb().prepare('SELECT * FROM notes WHERE gedcom_id = ?').get(gedcomId) as
      | { id: string; gedcom_id: string | null; text: string }
      | undefined
    return r ? { id: r.id, gedcomId: r.gedcom_id, text: r.text } : null
  },
  link(noteId: string, ownerType: string, ownerId: string): void {
    getDb()
      .prepare('INSERT OR IGNORE INTO note_links (note_id, owner_type, owner_id) VALUES (?, ?, ?)')
      .run(noteId, ownerType, ownerId)
  },
  forOwner(ownerType: string, ownerId: string): NoteRecord[] {
    return getDb()
      .prepare(
        `SELECT n.* FROM notes n JOIN note_links l ON l.note_id = n.id
         WHERE l.owner_type = ? AND l.owner_id = ?`
      )
      .all(ownerType, ownerId)
      .map((x) => {
        const r = x as { id: string; gedcom_id: string | null; text: string }
        return { id: r.id, gedcomId: r.gedcom_id, text: r.text }
      })
  }
}

export const Citations = {
  create(c: Omit<Citation, 'id'>, id = uuid()): Citation {
    getDb()
      .prepare(
        `INSERT INTO citations (id, source_id, owner_type, owner_id, event_tag, page, quality, note)
         VALUES (@id, @source_id, @owner_type, @owner_id, @event_tag, @page, @quality, @note)`
      )
      .run({
        id,
        source_id: c.sourceId ?? null,
        owner_type: c.ownerType,
        owner_id: c.ownerId,
        event_tag: c.eventTag ?? null,
        page: c.page ?? null,
        quality: c.quality ?? null,
        note: c.note ?? null
      })
    return { ...c, id }
  },
  forOwner(ownerType: string, ownerId: string): CitationDetail[] {
    return getDb()
      .prepare(
        `SELECT c.*, s.title AS s_title, s.author AS s_author, s.publication AS s_pub,
                s.text AS s_text, s.record_date AS s_date, r.name AS r_name
         FROM citations c
         LEFT JOIN sources s ON s.id = c.source_id
         LEFT JOIN repositories r ON r.id = s.repository_id
         WHERE c.owner_type = ? AND c.owner_id = ?
         ORDER BY c.event_tag`
      )
      .all(ownerType, ownerId)
      .map((x) => {
        const r = x as Record<string, unknown>
        return {
          id: r.id as string,
          sourceId: (r.source_id as string) ?? null,
          ownerType: r.owner_type as 'person' | 'family',
          ownerId: r.owner_id as string,
          eventTag: (r.event_tag as string) ?? null,
          page: (r.page as string) ?? null,
          quality: (r.quality as string) ?? null,
          note: (r.note as string) ?? null,
          sourceTitle: (r.s_title as string) ?? 'Untitled source',
          sourceAuthor: (r.s_author as string) ?? null,
          sourcePublication: (r.s_pub as string) ?? null,
          sourceText: (r.s_text as string) ?? null,
          repositoryName: (r.r_name as string) ?? null,
          recordDate: (r.s_date as string) ?? null
        }
      })
  },
  /** The source id a citation points to (null when it has none). */
  sourceIdOf(id: string): string | null {
    const r = getDb().prepare('SELECT source_id FROM citations WHERE id = ?').get(id) as
      | { source_id: string | null }
      | undefined
    return r?.source_id ?? null
  },
  /** Patch selected citation columns (only the provided keys are written). */
  update(
    id: string,
    f: Partial<Pick<Citation, 'sourceId' | 'eventTag' | 'page' | 'quality' | 'note'>>
  ): void {
    const set: string[] = []
    const vals: Record<string, unknown> = { id }
    if (f.sourceId !== undefined) (set.push('source_id=@source_id'), (vals.source_id = f.sourceId ?? null))
    if (f.eventTag !== undefined) (set.push('event_tag=@event_tag'), (vals.event_tag = f.eventTag ?? null))
    if (f.page !== undefined) (set.push('page=@page'), (vals.page = f.page ?? null))
    if (f.quality !== undefined) (set.push('quality=@quality'), (vals.quality = f.quality ?? null))
    if (f.note !== undefined) (set.push('note=@note'), (vals.note = f.note ?? null))
    if (!set.length) return
    getDb()
      .prepare(`UPDATE citations SET ${set.join(', ')} WHERE id=@id`)
      .run(vals)
  },
  /** Delete a citation. The source row is kept (it may be shared). */
  remove(id: string): void {
    getDb().prepare('DELETE FROM citations WHERE id = ?').run(id)
  }
}

export const Places = {
  upsert(name: string, lat: number, lon: number): void {
    const key = name.trim()
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) return
    getDb()
      .prepare(
        `INSERT INTO places (name, lat, lon) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET lat=excluded.lat, lon=excluded.lon`
      )
      .run(key, lat, lon)
  },
  list(): PlaceRow[] {
    return getDb().prepare('SELECT name, lat, lon FROM places').all() as PlaceRow[]
  },
  get(name: string): PlaceRow | null {
    return (
      (getDb().prepare('SELECT name, lat, lon FROM places WHERE name = ?').get(name.trim()) as
        | PlaceRow
        | undefined) ?? null
    )
  }
}

// ---------- Aliases ----------

interface AliasRow {
  id: string
  person_id: string
  given_name: string
  surname: string
  kind: string | null
  note: string | null
}
const mapAlias = (r: AliasRow): Alias => ({
  id: r.id,
  personId: r.person_id,
  givenName: r.given_name,
  surname: r.surname,
  kind: r.kind,
  note: r.note
})

export const Aliases = {
  all(): Alias[] {
    return getDb().prepare('SELECT * FROM aliases').all().map((r) => mapAlias(r as AliasRow))
  },
  forPerson(personId: string): Alias[] {
    return getDb()
      .prepare('SELECT * FROM aliases WHERE person_id = ? ORDER BY surname, given_name')
      .all(personId)
      .map((r) => mapAlias(r as AliasRow))
  },
  create(personId: string, input: AliasInput, id = uuid()): Alias {
    getDb()
      .prepare(
        `INSERT INTO aliases (id, person_id, given_name, surname, kind, note)
         VALUES (@id, @person_id, @given_name, @surname, @kind, @note)`
      )
      .run({
        id,
        person_id: personId,
        given_name: input.givenName ?? '',
        surname: input.surname ?? '',
        kind: input.kind ?? null,
        note: input.note ?? null
      })
    return { id, personId, givenName: input.givenName ?? '', surname: input.surname ?? '', kind: input.kind ?? null, note: input.note ?? null }
  },
  remove(id: string): void {
    getDb().prepare('DELETE FROM aliases WHERE id = ?').run(id)
  }
}

// ---------- Godparents (keresztszülők) ----------
// A pure join: a person → the people who are their godparents. The reverse
// direction (whose godparent is this person) is read with `godchildrenOf`.

export const Godparents = {
  /** The godparent person-ids for a person, in display order. */
  forPerson(personId: string): string[] {
    return getDb()
      .prepare('SELECT godparent_id FROM godparents WHERE person_id = ? ORDER BY ordinal, rowid')
      .all(personId)
      .map((r) => (r as { godparent_id: string }).godparent_id)
  },
  /** The people for whom this person is a godparent. */
  godchildrenOf(personId: string): string[] {
    return getDb()
      .prepare('SELECT person_id FROM godparents WHERE godparent_id = ? ORDER BY rowid')
      .all(personId)
      .map((r) => (r as { person_id: string }).person_id)
  },
  add(personId: string, godparentId: string): void {
    if (personId === godparentId) return // a person can't be their own godparent
    const ord =
      (getDb().prepare('SELECT COALESCE(MAX(ordinal), -1) + 1 AS n FROM godparents WHERE person_id = ?').get(personId) as {
        n: number
      }).n
    getDb()
      .prepare('INSERT OR IGNORE INTO godparents (person_id, godparent_id, ordinal) VALUES (?, ?, ?)')
      .run(personId, godparentId, ord)
  },
  remove(personId: string, godparentId: string): void {
    getDb().prepare('DELETE FROM godparents WHERE person_id = ? AND godparent_id = ?').run(personId, godparentId)
  }
}

// ---------- Occupations ----------

interface OccupationRow {
  id: string
  person_id: string
  title: string
  start_date: string | null
  end_date: string | null
  note: string | null
}
const mapOccupation = (r: OccupationRow): Occupation => ({
  id: r.id,
  personId: r.person_id,
  title: r.title,
  startDate: r.start_date,
  endDate: r.end_date,
  note: r.note
})

export const Occupations = {
  all(): Occupation[] {
    return getDb().prepare('SELECT * FROM occupations').all().map((r) => mapOccupation(r as OccupationRow))
  },
  forPerson(personId: string): Occupation[] {
    // Undated entries sort last; otherwise chronological by start date.
    return getDb()
      .prepare('SELECT * FROM occupations WHERE person_id = ? ORDER BY (start_date IS NULL), start_date, title')
      .all(personId)
      .map((r) => mapOccupation(r as OccupationRow))
  },
  create(personId: string, input: OccupationInput, id = uuid()): Occupation {
    getDb()
      .prepare(
        `INSERT INTO occupations (id, person_id, title, start_date, end_date, note)
         VALUES (@id, @person_id, @title, @start_date, @end_date, @note)`
      )
      .run({
        id,
        person_id: personId,
        title: input.title ?? '',
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
        note: input.note ?? null
      })
    return this.get(id)!
  },
  get(id: string): Occupation | null {
    const row = getDb().prepare('SELECT * FROM occupations WHERE id = ?').get(id) as
      | OccupationRow
      | undefined
    return row ? mapOccupation(row) : null
  },
  update(id: string, input: OccupationInput): Occupation {
    const existing = this.get(id)
    if (!existing) throw new Error(`Occupation ${id} not found`)
    const merged = { ...existing, ...input }
    getDb()
      .prepare(
        `UPDATE occupations SET title=@title, start_date=@start_date, end_date=@end_date, note=@note WHERE id=@id`
      )
      .run({
        id,
        title: merged.title,
        start_date: merged.startDate,
        end_date: merged.endDate,
        note: merged.note
      })
    return this.get(id)!
  },
  remove(id: string): void {
    getDb().prepare('DELETE FROM occupations WHERE id = ?').run(id)
  },
  /** Drops every occupation of a person — used before a re-import to avoid dupes. */
  removeForPerson(personId: string): void {
    getDb().prepare('DELETE FROM occupations WHERE person_id = ?').run(personId)
  }
}

// ---------- Collaboration (FamilySearch discussions) ----------

interface CollaborationRow {
  id: string
  person_id: string
  title: string | null
  body: string
  created_at: string | null
}
const mapCollaboration = (r: CollaborationRow): Collaboration => ({
  id: r.id,
  personId: r.person_id,
  title: r.title,
  body: r.body,
  createdAt: r.created_at
})

export const Collaborations = {
  forPerson(personId: string): Collaboration[] {
    return getDb()
      .prepare('SELECT * FROM collaborations WHERE person_id = ? ORDER BY (created_at IS NULL), created_at DESC')
      .all(personId)
      .map((r) => mapCollaboration(r as CollaborationRow))
  },
  removeForPerson(personId: string): void {
    getDb().prepare('DELETE FROM collaborations WHERE person_id = ?').run(personId)
  },
  /** Replace a person's discussions with a fresh set (FamilySearch is the source
   *  of truth; ids come from FamilySearch so re-imports stay stable). */
  replaceForPerson(
    personId: string,
    items: { id?: string | null; title?: string | null; body: string; createdAt?: string | null }[]
  ): void {
    const db = getDb()
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM collaborations WHERE person_id = ?').run(personId)
      const ins = db.prepare(
        `INSERT OR REPLACE INTO collaborations (id, person_id, title, body, created_at)
         VALUES (@id, @person_id, @title, @body, @created_at)`
      )
      for (const it of items) {
        const body = (it.body ?? '').trim()
        if (!body) continue
        ins.run({
          id: it.id || uuid(),
          person_id: personId,
          title: it.title ?? null,
          body,
          created_at: it.createdAt ?? null
        })
      }
    })
    tx()
  }
}

// ---------- Life events / facts ----------

interface EventRow {
  id: string
  owner_type: string
  owner_id: string
  type: string
  date: string | null
  place: string | null
  value: string | null
  note: string | null
}

const mapEvent = (r: EventRow): EventRecord => ({
  id: r.id,
  ownerType: r.owner_type === 'family' ? 'family' : 'person',
  ownerId: r.owner_id,
  type: r.type,
  date: r.date,
  place: r.place,
  value: r.value,
  note: r.note
})

export const Events = {
  forOwner(ownerType: 'person' | 'family', ownerId: string): EventRecord[] {
    return getDb()
      .prepare(
        `SELECT * FROM events WHERE owner_type = ? AND owner_id = ?
         ORDER BY (date IS NULL OR date = ''), date, ordinal, type`
      )
      .all(ownerType, ownerId)
      .map((r) => mapEvent(r as EventRow))
  },
  forPerson(personId: string): EventRecord[] {
    return this.forOwner('person', personId)
  },
  create(ownerType: 'person' | 'family', ownerId: string, input: EventInput, id = uuid()): EventRecord {
    getDb()
      .prepare(
        `INSERT INTO events (id, owner_type, owner_id, type, date, place, value, note, fs_key)
         VALUES (@id, @owner_type, @owner_id, @type, @date, @place, @value, @note, @fs_key)`
      )
      .run({
        id,
        owner_type: ownerType,
        owner_id: ownerId,
        type: input.type ?? 'other',
        date: input.date ?? null,
        place: input.place ?? null,
        value: input.value ?? null,
        note: input.note ?? null,
        fs_key: null
      })
    return this.get(id)!
  },
  get(id: string): EventRecord | null {
    const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined
    return row ? mapEvent(row) : null
  },
  update(id: string, input: EventInput): EventRecord {
    const existing = this.get(id)
    if (!existing) throw new Error(`Event ${id} not found`)
    const merged = { ...existing, ...input }
    getDb()
      .prepare(`UPDATE events SET type=@type, date=@date, place=@place, value=@value, note=@note WHERE id=@id`)
      .run({ id, type: merged.type, date: merged.date, place: merged.place, value: merged.value, note: merged.note })
    return this.get(id)!
  },
  remove(id: string): void {
    getDb().prepare('DELETE FROM events WHERE id = ?').run(id)
  },
  /**
   * Idempotent import insert: skips a row that already exists for this owner with
   * the same fs_key, so a re-import never duplicates events. Returns true if a row
   * was inserted.
   */
  importOnce(ownerType: 'person' | 'family', ownerId: string, fsKey: string, input: EventInput): boolean {
    const db = getDb()
    const dup = db
      .prepare('SELECT 1 FROM events WHERE owner_type = ? AND owner_id = ? AND fs_key = ? LIMIT 1')
      .get(ownerType, ownerId, fsKey)
    if (dup) return false
    db.prepare(
      `INSERT INTO events (id, owner_type, owner_id, type, date, place, value, note, fs_key)
       VALUES (@id, @owner_type, @owner_id, @type, @date, @place, @value, @note, @fs_key)`
    ).run({
      id: uuid(),
      owner_type: ownerType,
      owner_id: ownerId,
      type: input.type ?? 'other',
      date: input.date ?? null,
      place: input.place ?? null,
      value: input.value ?? null,
      note: input.note ?? null,
      fs_key: fsKey
    })
    return true
  }
}

// ---------- Famous-relatives verdicts ----------

export const FamousVerdicts = {
  /** person id → 'confirmed' | 'rejected'. */
  all(): Record<string, 'confirmed' | 'rejected'> {
    const rows = getDb().prepare('SELECT person_id, verdict FROM famous_verdicts').all() as {
      person_id: string
      verdict: string
    }[]
    const out: Record<string, 'confirmed' | 'rejected'> = {}
    for (const r of rows) {
      if (r.verdict === 'confirmed' || r.verdict === 'rejected') out[r.person_id] = r.verdict
    }
    return out
  },
  /** Set (or clear, when verdict is null) a person's famous-match verdict. */
  set(personId: string, verdict: 'confirmed' | 'rejected' | null, famous?: string): void {
    const db = getDb()
    if (!verdict) {
      db.prepare('DELETE FROM famous_verdicts WHERE person_id = ?').run(personId)
      return
    }
    db.prepare(
      `INSERT INTO famous_verdicts (person_id, verdict, famous) VALUES (?, ?, ?)
       ON CONFLICT(person_id) DO UPDATE SET verdict = excluded.verdict, famous = excluded.famous`
    ).run(personId, verdict, famous ?? null)
  }
}

// ---------- Custom famous people ----------

interface CustomFamousRow {
  id: string
  name: string
  birth_year: number | null
  death_year: number | null
  occupation: string | null
  url: string | null
}
export const FamousCustom = {
  all(): CustomFamous[] {
    return getDb()
      .prepare('SELECT * FROM famous_custom ORDER BY name')
      .all()
      .map((r) => {
        const x = r as CustomFamousRow
        return {
          id: x.id,
          name: x.name,
          birthYear: x.birth_year,
          deathYear: x.death_year,
          occupation: x.occupation,
          url: x.url
        }
      })
  },
  create(input: CustomFamousInput): CustomFamous {
    const id = uuid()
    getDb()
      .prepare(
        `INSERT INTO famous_custom (id, name, birth_year, death_year, occupation, url)
         VALUES (@id, @name, @birth_year, @death_year, @occupation, @url)`
      )
      .run({
        id,
        name: input.name ?? '',
        birth_year: input.birthYear ?? null,
        death_year: input.deathYear ?? null,
        occupation: input.occupation ?? null,
        url: input.url ?? null
      })
    return { id, ...input, name: input.name ?? '' }
  },
  remove(id: string): void {
    getDb().prepare('DELETE FROM famous_custom WHERE id = ?').run(id)
  }
}

// ---------- Dismissed data-issue anomalies ----------

export const DismissedIssues = {
  all(): Set<string> {
    return new Set(
      getDb()
        .prepare('SELECT key FROM dismissed_issues')
        .all()
        .map((r) => (r as { key: string }).key)
    )
  },
  add(key: string): void {
    getDb().prepare('INSERT OR IGNORE INTO dismissed_issues (key) VALUES (?)').run(key)
  }
}

// ---------- Research logs ----------

interface ResearchRow {
  id: string
  person_id: string | null
  date: string
  title: string
  repository: string | null
  source_desc: string | null
  date_range: string | null
  result: string
  detail: string | null
  created_at: string
}
const mapResearch = (r: ResearchRow): ResearchLog => ({
  id: r.id,
  personId: r.person_id,
  date: r.date,
  title: r.title,
  repository: r.repository,
  sourceDesc: r.source_desc,
  dateRange: r.date_range,
  result: (r.result as ResearchResult) ?? 'negative',
  detail: r.detail,
  createdAt: r.created_at
})

export const ResearchLogs = {
  all(): ResearchLog[] {
    return getDb().prepare('SELECT * FROM research_logs ORDER BY date DESC').all().map((r) => mapResearch(r as ResearchRow))
  },
  forPerson(personId: string): ResearchLog[] {
    return getDb()
      .prepare('SELECT * FROM research_logs WHERE person_id = ? ORDER BY date DESC')
      .all(personId)
      .map((r) => mapResearch(r as ResearchRow))
  },
  create(input: ResearchLogInput, id = uuid()): ResearchLog {
    const createdAt = now()
    getDb()
      .prepare(
        `INSERT INTO research_logs (id, person_id, date, title, repository, source_desc, date_range, result, detail, created_at)
         VALUES (@id, @person_id, @date, @title, @repository, @source_desc, @date_range, @result, @detail, @created_at)`
      )
      .run({
        id,
        person_id: input.personId ?? null,
        date: input.date ?? createdAt.slice(0, 10),
        title: input.title ?? '',
        repository: input.repository ?? null,
        source_desc: input.sourceDesc ?? null,
        date_range: input.dateRange ?? null,
        result: input.result ?? 'negative',
        detail: input.detail ?? null,
        created_at: createdAt
      })
    return mapResearch(getDb().prepare('SELECT * FROM research_logs WHERE id = ?').get(id) as ResearchRow)
  },
  remove(id: string): void {
    getDb().prepare('DELETE FROM research_logs WHERE id = ?').run(id)
  }
}
