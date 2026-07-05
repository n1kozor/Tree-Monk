import type Database from 'better-sqlite3'
import { getDb } from './connection'
import { repairFamilies } from './familyRepair'
import { AppSettings, Aliases, Families, People } from './repo'
import { norm, sameNameForDup } from '@shared/nameMatch'
import { birthDateRelation } from './dupDate'
import type { DuplicateCandidate, MergeResolution, MergeResult, Person } from '@shared/types'

/**
 * Duplicate-person detection + merge. Detection blocks by surname prefix to stay
 * fast on big trees; merge repoints every relationship/attachment from the victim
 * onto the survivor inside one transaction and records a single reversible audit
 * entry (table_name '__merge__'), so the whole merge undoes from the History view.
 */

const yearNum = (d: string | null): number | null => {
  const m = d?.match(/\b(\d{4})\b/)
  return m ? Number(m[1]) : null
}
const name = (p: Person): string => `${p.givenName} ${p.surname}`.trim() || '—'
const pairKey = (a: string, b: string): string => [a, b].sort().join('|')

/**
 * Birth date for matching, falling back to the christening date when there is no
 * birth date — church records often hold ONLY a christening (≈ the birth time).
 * Without this, a person with just a christening looks "undated", so a 1876
 * christening would not be ruled out against a 1903 birth (a real false positive).
 */
const effBirth = (p: Person): string | null => p.birthDate || p.christeningDate

const SCORE_THRESHOLD = 45
const MAX_CANDIDATES = 300

// ---------------- Detection ----------------

export function scanDuplicates(): DuplicateCandidate[] {
  const db = getDb()
  const people = People.list()
  const families = Families.list()
  const dismissed = new Set(
    (db.prepare('SELECT key FROM dismissed_merges').all() as { key: string }[]).map((r) => r.key)
  )

  // Relationship lookups for the "shared parent / spouse" signals + exclusions.
  const parentsOf = new Map<string, Set<string>>()
  const spousesOf = new Map<string, Set<string>>()
  for (const f of families) {
    const par = [f.husbandId, f.wifeId].filter((x): x is string => !!x)
    for (const c of f.childIds) {
      const s = parentsOf.get(c) ?? new Set<string>()
      par.forEach((p) => s.add(p))
      parentsOf.set(c, s)
    }
    if (f.husbandId && f.wifeId) {
      for (const [a, b] of [[f.husbandId, f.wifeId], [f.wifeId, f.husbandId]] as const) {
        const s = spousesOf.get(a) ?? new Set<string>()
        s.add(b)
        spousesOf.set(a, s)
      }
    }
  }
  const directlyRelated = (a: string, b: string): boolean =>
    !!parentsOf.get(a)?.has(b) || !!parentsOf.get(b)?.has(a) || !!spousesOf.get(a)?.has(b)
  const shareParent = (a: string, b: string): boolean => {
    const pa = parentsOf.get(a)
    const pb = parentsOf.get(b)
    if (!pa || !pb) return false
    for (const x of pa) if (pb.has(x)) return true
    return false
  }

  const scorePair = (a: Person, b: Person): DuplicateCandidate | null => {
    if (a.id === b.id) return null
    if (a.sex !== 'U' && b.sex !== 'U' && a.sex !== b.sex) return null // different sex → not a dup
    if (directlyRelated(a.id, b.id)) return null // married / parent-child to each other → not a dup

    // Names must match strictly: the given name shares a canonical form (synonym
    // group / accent-folded), not a loose edit-distance neighbour — so "Margit"
    // and "Mária" are NOT the same person.
    if (!sameNameForDup(a.givenName, a.surname, b.givenName, b.surname)) return null

    // A duplicate is decided by FOUR things only: the name, the birth date, a
    // shared parent and a shared spouse — nothing else (no birthplace, no GEDCOM/FS
    // id). Birth date is a hard gate: the same name with a DIFFERENT birth date
    // means different people (a stillborn child's name was commonly reused for a
    // later sibling), so it never counts as a duplicate. The christening date
    // stands in when there is no birth date (church records often have only that).
    const rel = birthDateRelation(effBirth(a), effBirth(b))
    if (rel === 'diff') return null

    const reasons: string[] = ['name']
    let score = 40

    if (rel === 'same') {
      score += 25
      reasons.push('birthYear')
    }
    if (shareParent(a.id, b.id)) {
      score += 20
      reasons.push('sharedParent')
    } else if (
      spousesOf.get(a.id) &&
      spousesOf.get(b.id) &&
      [...(spousesOf.get(a.id) as Set<string>)].some((x) => (spousesOf.get(b.id) as Set<string>).has(x))
    ) {
      score += 15
      reasons.push('sharedSpouse')
    }

    if (score < SCORE_THRESHOLD) return null
    return { aId: a.id, bId: b.id, score: Math.round(Math.min(score, 99)), reasons }
  }

  // Block by surname prefix so we never compare the whole tree pairwise.
  const blocks = new Map<string, Person[]>()
  for (const p of people) {
    const key = norm(p.surname).slice(0, 4) || '∅'
    const arr = blocks.get(key) ?? []
    arr.push(p)
    blocks.set(key, arr)
  }

  const out: DuplicateCandidate[] = []
  for (const group of blocks.values()) {
    // Sub-bucket very large blocks by birth decade to bound the pair count.
    const buckets: Person[][] =
      group.length > 800 ? bucketByDecade(group) : [group]
    for (const bucket of buckets) {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const cand = scorePair(bucket[i], bucket[j])
          if (cand && !dismissed.has(pairKey(cand.aId, cand.bId))) out.push(cand)
        }
      }
    }
  }
  out.sort((x, y) => y.score - x.score)
  return out.slice(0, MAX_CANDIDATES)
}

function bucketByDecade(group: Person[]): Person[][] {
  const m = new Map<number, Person[]>()
  for (const p of group) {
    const y = yearNum(p.birthDate)
    const dec = y === null ? -1 : Math.floor(y / 10)
    const arr = m.get(dec) ?? []
    arr.push(p)
    m.set(dec, arr)
  }
  // Undated people could match anyone → keep them visible against every decade.
  const undated = m.get(-1) ?? []
  return [...m.entries()].filter(([d]) => d !== -1).map(([, arr]) => [...arr, ...undated])
}

export function dismissMerge(aId: string, bId: string): void {
  getDb().prepare('INSERT OR IGNORE INTO dismissed_merges (key) VALUES (?)').run(pairKey(aId, bId))
}

// ---------------- Merge ----------------

type Row = Record<string, unknown>
const ph = (arr: unknown[]): string => arr.map(() => '?').join(',')
const setAudit = (db: Database.Database, on: boolean): void => {
  db.prepare('UPDATE audit_state SET enabled = ? WHERE id = 1').run(on ? 1 : 0)
}
const insertRow = (db: Database.Database, table: string, row: Row): void => {
  const cols = Object.keys(row)
  db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${ph(cols)})`).run(...cols.map((c) => row[c]))
}
const updateByPk = (db: Database.Database, table: string, row: Row, pk: string[]): void => {
  const set = Object.keys(row).filter((c) => !pk.includes(c))
  db.prepare(`UPDATE ${table} SET ${set.map((c) => `${c}=?`).join(',')} WHERE ${pk.map((c) => `${c}=?`).join(' AND ')}`).run(
    ...set.map((c) => row[c]),
    ...pk.map((c) => row[c])
  )
}

/** Captures the full prior state of every row a merge of (S, V) will touch. */
function captureSnapshot(db: Database.Database, S: string, V: string): Row {
  const grab = (sql: string, ...args: unknown[]): Row[] => db.prepare(sql).all(...args) as Row[]
  const affectedFamilyIds = grab(
    'SELECT id FROM families WHERE husband_id IN (?,?) OR wife_id IN (?,?)',
    S, V, S, V
  ).map((r) => r.id as string)
  const famIn = affectedFamilyIds.length ? `OR family_id IN (${ph(affectedFamilyIds)})` : ''
  return {
    survivorId: S,
    victimId: V,
    affectedFamilyIds,
    people: {
      survivor: db.prepare('SELECT * FROM people WHERE id=?').get(S) as Row,
      victim: db.prepare('SELECT * FROM people WHERE id=?').get(V) as Row
    },
    families: affectedFamilyIds.length ? grab(`SELECT * FROM families WHERE id IN (${ph(affectedFamilyIds)})`, ...affectedFamilyIds) : [],
    familyChildren: grab(`SELECT * FROM family_children WHERE child_id IN (?,?) ${famIn}`, S, V, ...affectedFamilyIds),
    personDocuments: grab('SELECT * FROM person_documents WHERE person_id IN (?,?)', S, V),
    citations: grab("SELECT * FROM citations WHERE owner_type='person' AND owner_id IN (?,?)", S, V),
    noteLinks: grab("SELECT * FROM note_links WHERE owner_type='person' AND owner_id IN (?,?)", S, V),
    aliases: grab('SELECT * FROM aliases WHERE person_id IN (?,?)', S, V),
    occupations: grab('SELECT * FROM occupations WHERE person_id IN (?,?)', S, V),
    godparents: grab('SELECT * FROM godparents WHERE person_id IN (?,?) OR godparent_id IN (?,?)', S, V, S, V),
    events: grab("SELECT * FROM events WHERE owner_type='person' AND owner_id IN (?,?)", S, V),
    researchLogs: grab('SELECT * FROM research_logs WHERE person_id IN (?,?)', S, V),
    famousVerdicts: grab('SELECT * FROM famous_verdicts WHERE person_id IN (?,?)', S, V),
    boardNodes: grab('SELECT * FROM board_nodes WHERE ref_id IN (?,?)', S, V),
    defaultRoot: AppSettings.get('default_root_person_id')
  }
}

export function mergePeople(survivorId: string, victimId: string, resolution: MergeResolution): MergeResult {
  if (survivorId === victimId) throw new Error('cannot merge a person with itself')
  const db = getDb()
  const survivor = People.get(survivorId)
  const victim = People.get(victimId)
  if (!survivor || !victim) throw new Error('person not found')

  const snapshot = captureSnapshot(db, survivorId, victimId)
  const moved = { families: 0, children: 0, documents: 0, events: 0, citations: 0, other: 0 }
  let seq = 0

  setAudit(db, false)
  try {
    db.transaction(() => {
      // 1. Survivor keeps the chosen field values.
      People.update(survivorId, resolution as Parameters<typeof People.update>[1])
      // 2. Preserve the victim's name as an alias of the survivor.
      const vg = victim.givenName.trim()
      const vs = victim.surname.trim()
      const dup = db.prepare('SELECT 1 FROM aliases WHERE person_id=? AND given_name=? AND surname=?').get(survivorId, vg, vs)
      const sameName = vg === survivor.givenName.trim() && vs === survivor.surname.trim()
      if ((vg || vs) && !dup && !sameName) {
        Aliases.create(survivorId, { givenName: vg, surname: vs, kind: 'aka' })
        moved.other++
      }
      // 3. Families (husband/wife) + guard against an accidental self-marriage.
      moved.families += db.prepare('UPDATE families SET husband_id=? WHERE husband_id=?').run(survivorId, victimId).changes
      moved.families += db.prepare('UPDATE families SET wife_id=? WHERE wife_id=?').run(survivorId, victimId).changes
      db.prepare('UPDATE families SET wife_id=NULL WHERE husband_id=? AND wife_id=?').run(survivorId, survivorId)
      // 4. Children (dedupe rows that would collide on the composite PK).
      moved.children += db.prepare('UPDATE OR IGNORE family_children SET child_id=? WHERE child_id=?').run(survivorId, victimId).changes
      db.prepare('DELETE FROM family_children WHERE child_id=?').run(victimId)
      // 5. Attachments / facts.
      moved.documents += db.prepare('UPDATE OR IGNORE person_documents SET person_id=? WHERE person_id=?').run(survivorId, victimId).changes
      db.prepare('DELETE FROM person_documents WHERE person_id=?').run(victimId)
      moved.citations += db.prepare("UPDATE citations SET owner_id=? WHERE owner_type='person' AND owner_id=?").run(survivorId, victimId).changes
      db.prepare("UPDATE OR IGNORE note_links SET owner_id=? WHERE owner_type='person' AND owner_id=?").run(survivorId, victimId)
      db.prepare("DELETE FROM note_links WHERE owner_type='person' AND owner_id=?").run(victimId)
      db.prepare('UPDATE aliases SET person_id=? WHERE person_id=?').run(survivorId, victimId)
      db.prepare('UPDATE occupations SET person_id=? WHERE person_id=?').run(survivorId, victimId)
      // Godparents — repoint BOTH directions, then drop the victim's leftovers and
      // any self-link the merge would create.
      db.prepare('UPDATE OR IGNORE godparents SET person_id=? WHERE person_id=?').run(survivorId, victimId)
      db.prepare('UPDATE OR IGNORE godparents SET godparent_id=? WHERE godparent_id=?').run(survivorId, victimId)
      db.prepare('DELETE FROM godparents WHERE person_id=? OR godparent_id=? OR person_id=godparent_id').run(victimId, victimId)
      moved.events += db.prepare("UPDATE events SET owner_id=? WHERE owner_type='person' AND owner_id=?").run(survivorId, victimId).changes
      db.prepare('UPDATE research_logs SET person_id=? WHERE person_id=?').run(survivorId, victimId)
      db.prepare('UPDATE OR IGNORE famous_verdicts SET person_id=? WHERE person_id=?').run(survivorId, victimId)
      db.prepare('DELETE FROM famous_verdicts WHERE person_id=?').run(victimId)
      db.prepare('UPDATE board_nodes SET ref_id=? WHERE ref_id=?').run(survivorId, victimId)
      if (snapshot.defaultRoot === victimId) AppSettings.set('default_root_person_id', survivorId)
      // 6. Drop the victim.
      db.prepare('DELETE FROM people WHERE id=?').run(victimId)
      // 6b. Merging two people who shared a spouse leaves the survivor married to
      // the same partner twice (and any single-partner leftovers). Fold those —
      // scoped to the survivor so the merge stays fully reversible via undo.
      moved.families += repairFamilies(db, survivorId)
      // 7. One reversible audit record carrying the whole snapshot.
      const res = db
        .prepare("INSERT INTO audit_log (entity, table_name, entity_id, action, label, before) VALUES ('merge','__merge__',?, 'update', ?, ?)")
        .run(survivorId, `${name(victim)} → ${name(survivor)}`, JSON.stringify(snapshot))
      seq = Number(res.lastInsertRowid)
    })()
  } finally {
    setAudit(db, true)
  }
  return { survivorId, auditSeq: seq, moved }
}

/** Reverses a merge from its captured snapshot (called by the audit-log undo). */
export function undoMerge(snapshot: Row): void {
  const db = getDb()
  const S = snapshot.survivorId as string
  const V = snapshot.victimId as string
  const people = snapshot.people as { survivor: Row; victim: Row }
  const list = (k: string): Row[] => (snapshot[k] as Row[]) ?? []
  const affected = (snapshot.affectedFamilyIds as string[]) ?? []

  setAudit(db, false)
  try {
    db.transaction(() => {
      // Re-create the victim first so every FK below resolves, then restore S.
      insertRow(db, 'people', people.victim)
      updateByPk(db, 'people', people.survivor, ['id'])

      if (affected.length) db.prepare(`DELETE FROM families WHERE id IN (${ph(affected)})`).run(...affected)
      for (const r of list('families')) insertRow(db, 'families', r)

      // Clear every child link in the affected families (not just S/V as a
      // child) so a merge that de-duplicated couples — moving other children
      // between those families — restores exactly from the snapshot.
      if (affected.length)
        db.prepare(`DELETE FROM family_children WHERE child_id IN (?,?) OR family_id IN (${ph(affected)})`).run(S, V, ...affected)
      else db.prepare('DELETE FROM family_children WHERE child_id IN (?,?)').run(S, V)
      for (const r of list('familyChildren')) insertRow(db, 'family_children', r)

      db.prepare('DELETE FROM person_documents WHERE person_id IN (?,?)').run(S, V)
      for (const r of list('personDocuments')) insertRow(db, 'person_documents', r)

      db.prepare("DELETE FROM citations WHERE owner_type='person' AND owner_id IN (?,?)").run(S, V)
      for (const r of list('citations')) insertRow(db, 'citations', r)

      db.prepare("DELETE FROM note_links WHERE owner_type='person' AND owner_id IN (?,?)").run(S, V)
      for (const r of list('noteLinks')) insertRow(db, 'note_links', r)

      db.prepare('DELETE FROM aliases WHERE person_id IN (?,?)').run(S, V)
      for (const r of list('aliases')) insertRow(db, 'aliases', r)

      db.prepare('DELETE FROM occupations WHERE person_id IN (?,?)').run(S, V)
      for (const r of list('occupations')) insertRow(db, 'occupations', r)

      db.prepare('DELETE FROM godparents WHERE person_id IN (?,?) OR godparent_id IN (?,?)').run(S, V, S, V)
      for (const r of list('godparents')) insertRow(db, 'godparents', r)

      db.prepare("DELETE FROM events WHERE owner_type='person' AND owner_id IN (?,?)").run(S, V)
      for (const r of list('events')) insertRow(db, 'events', r)

      db.prepare('DELETE FROM research_logs WHERE person_id IN (?,?)').run(S, V)
      for (const r of list('researchLogs')) insertRow(db, 'research_logs', r)

      db.prepare('DELETE FROM famous_verdicts WHERE person_id IN (?,?)').run(S, V)
      for (const r of list('famousVerdicts')) insertRow(db, 'famous_verdicts', r)

      // Board nodes were only re-pointed (not deleted) → just restore ref_id.
      for (const r of list('boardNodes')) db.prepare('UPDATE board_nodes SET ref_id=? WHERE id=?').run(r.ref_id ?? null, r.id)

      AppSettings.set('default_root_person_id', (snapshot.defaultRoot as string | null) ?? null)
    })()
  } finally {
    setAudit(db, true)
  }
}
