import { app } from 'electron'
import { basename, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import Database from 'better-sqlite3'
import { SCHEMA_SQL } from './schema'
import { applyAuditSchema, Audit } from './audit'
import { repairFamilies } from './familyRepair'
import { activeDbFile } from '../workspaces'

let db: Database.Database | null = null

/** Absolute path to the per-user data directory where DB + media live. */
export function dataDir(): string {
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function mediaDir(): string {
  const dir = join(dataDir(), 'media')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Resolves a stored local media path that may come from ANOTHER machine.
 * Documents record absolute paths, so a backup restored under a different
 * Windows username (or drive) points at the old machine's folders even though
 * the files themselves were restored fine. If the recorded path is gone but a
 * file with the same name sits in the current media folder, use that one.
 * Existing paths (and remote URLs) pass through untouched.
 */
export function resolveMediaPath(filePath: string): string {
  if (!filePath || /^https?:\/\//i.test(filePath) || existsSync(filePath)) return filePath
  const local = join(mediaDir(), basename(filePath))
  return existsSync(local) ? local : filePath
}

/** Idempotent ALTERs for columns added after a DB was first created. */
function migrate(database: Database.Database): void {
  const add = (sql: string): void => {
    try {
      database.exec(sql)
    } catch {
      /* column already exists */
    }
  }
  add('ALTER TABLE people ADD COLUMN fs_id TEXT')
  // "Deceased, date unknown": a death flag independent of death_date so a
  // person can be recorded as dead without a date (matches GEDCOM `1 DEAT`
  // and FamilySearch's `living` field). Backfill: a recorded death date
  // implies deceased.
  add('ALTER TABLE people ADD COLUMN deceased INTEGER NOT NULL DEFAULT 0')
  add("UPDATE people SET deceased = 1 WHERE deceased = 0 AND death_date IS NOT NULL AND death_date <> ''")
  // Christening (keresztelés) + religion (vallás) — from GEDCOM CHR/RELI and FS facts.
  add('ALTER TABLE people ADD COLUMN christening_date TEXT')
  add('ALTER TABLE people ADD COLUMN christening_place TEXT')
  add('ALTER TABLE people ADD COLUMN religion TEXT')
  // Burial / interment (temetés) — from GEDCOM BURI. Added in 0.6.0; these run
  // idempotently so an existing DB gains the columns on the next launch/update.
  add('ALTER TABLE people ADD COLUMN burial_date TEXT')
  add('ALTER TABLE people ADD COLUMN burial_place TEXT')
  // The record's own date for a source (FamilySearch sortKey) → chronological sort.
  add('ALTER TABLE sources ADD COLUMN record_date TEXT')
  // Profile-photo framing (pan/zoom) so a cut-off head can be repositioned. JSON
  // {x,y,scale}; null = centred. Added in 0.17.0.
  add('ALTER TABLE people ADD COLUMN profile_photo_crop TEXT')
  // Optional END date for life events (e.g. residence "moved out" vs "moved in").
  // Additive → existing DBs gain it on the next launch, nothing is lost.
  add('ALTER TABLE events ADD COLUMN end_date TEXT')
  // Per-vital research "reason" notes (FamilySearch change messages, e.g. a cause
  // of death). Additive columns → existing DBs gain them on the next launch.
  add('ALTER TABLE people ADD COLUMN birth_note TEXT')
  add('ALTER TABLE people ADD COLUMN death_note TEXT')
  add('ALTER TABLE people ADD COLUMN christening_note TEXT')
  add('ALTER TABLE people ADD COLUMN burial_note TEXT')
  // Illegitimate-child flag (pipálható jelölés). Additive + defaulted → safe.
  add('ALTER TABLE people ADD COLUMN illegitimate INTEGER NOT NULL DEFAULT 0')
  // Verified/reviewed flag (manual confirmation). Additive + defaulted → safe.
  add('ALTER TABLE people ADD COLUMN verified INTEGER NOT NULL DEFAULT 0')
  // Name pieces: Rufname / call name (_RUFNAME) plus prefix/suffix (NPFX/NSFX).
  // Additive + nullable → existing DBs gain them on the next launch.
  add('ALTER TABLE people ADD COLUMN call_name TEXT')
  add('ALTER TABLE people ADD COLUMN name_prefix TEXT')
  add('ALTER TABLE people ADD COLUMN name_suffix TEXT')
  // Stillborn + confidential flags. Additive + defaulted → safe.
  add('ALTER TABLE people ADD COLUMN stillborn INTEGER NOT NULL DEFAULT 0')
  add('ALTER TABLE people ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0')
  // Place hierarchy + GOV id (gov.genealogy.net). Additive + nullable → safe.
  add('ALTER TABLE places ADD COLUMN place_type TEXT')
  add('ALTER TABLE places ADD COLUMN parent_name TEXT')
  add('ALTER TABLE places ADD COLUMN gov_id TEXT')
  // Child↔parents relationship type (GEDCOM PEDI): NULL = birth. Additive → safe.
  add('ALTER TABLE family_children ADD COLUMN relation TEXT')
  // Per-PARENT relation (apánál/anyánál külön). The legacy couple-level value
  // seeds both sides; COALESCE keeps this idempotent on every launch.
  add('ALTER TABLE family_children ADD COLUMN father_relation TEXT')
  add('ALTER TABLE family_children ADD COLUMN mother_relation TEXT')
  add(
    `UPDATE family_children SET
       father_relation = COALESCE(father_relation, relation),
       mother_relation = COALESCE(mother_relation, relation)
     WHERE relation IS NOT NULL`
  )
  // Union relationship type: NULL = marriage; partner | none | other. Additive → safe.
  add('ALTER TABLE families ADD COLUMN relationship TEXT')
  // Which marriage this union is for the couple (1st, 2nd, …) — user-set badge.
  // Additive + nullable → existing DBs gain it on the next launch, nothing lost.
  add('ALTER TABLE families ADD COLUMN marriage_order INTEGER')
  // Manual ordering for occupations and life events: a user can drag undated
  // entries into the sequence they know, instead of the default alphabetical
  // fallback. Additive + defaulted → existing DBs gain it on the next launch.
  add('ALTER TABLE occupations ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0')
  add('ALTER TABLE events ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0')
  // One-time: lift the legacy single people.occupation into the occupations
  // table (the new source of truth). Gated by a settings flag so a user who
  // later deletes those rows doesn't get them re-created on the next launch.
  try {
    const done = database.prepare("SELECT value FROM settings WHERE key = 'occupations_migrated_v1'").get()
    if (!done) {
      database.exec(
        `INSERT INTO occupations (id, person_id, title)
         SELECT lower(hex(randomblob(16))), id, occupation
         FROM people
         WHERE occupation IS NOT NULL AND trim(occupation) <> ''`
      )
      database
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('occupations_migrated_v1', '1')")
        .run()
    }
  } catch {
    /* settings/occupations not ready yet */
  }

  // One-time: a Baptism is a christening for our model. Earlier imports filed it
  // as a loose "Baptism" event — move each into the dedicated christening field
  // (where still empty), then drop those events so it isn't shown twice. Gated so
  // a hand-added baptism event later isn't swept up on the next launch.
  try {
    const done = database
      .prepare("SELECT value FROM settings WHERE key = 'baptism_events_migrated_v1'")
      .get()
    if (!done) {
      const rows = database
        .prepare(
          `SELECT e.id AS id, e.owner_id AS owner_id, e.date AS date, e.place AS place
           FROM events e JOIN people p ON p.id = e.owner_id
           WHERE e.owner_type = 'person'
             AND (lower(e.type) LIKE '%bapti%' OR lower(e.type) LIKE '%christen%')
             AND (p.christening_date IS NULL OR p.christening_date = '')
             AND (p.christening_place IS NULL OR p.christening_place = '')
             AND ((e.date IS NOT NULL AND e.date <> '') OR (e.place IS NOT NULL AND e.place <> ''))
           ORDER BY e.ordinal, e.id`
        )
        .all() as { id: string; owner_id: string; date: string | null; place: string | null }[]
      const fill = database.prepare(
        `UPDATE people SET christening_date = COALESCE(NULLIF(christening_date, ''), @date),
           christening_place = COALESCE(NULLIF(christening_place, ''), @place) WHERE id = @id`
      )
      const drop = database.prepare('DELETE FROM events WHERE id = @id')
      const filled = new Set<string>()
      for (const r of rows) {
        if (!filled.has(r.owner_id)) {
          filled.add(r.owner_id)
          fill.run({ id: r.owner_id, date: r.date, place: r.place })
        }
        drop.run({ id: r.id })
      }
      database
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('baptism_events_migrated_v1', '1')")
        .run()
    }
  } catch {
    /* events/people not ready yet */
  }

  // One-time: heal marriage records tangled by older merges/deletes — exact
  // duplicate couples and phantom single-partner "families" that show up as a
  // stray "Unknown" spouse. Gated so a genuinely sparse family a user adds later
  // isn't swept up on the next launch.
  try {
    const done = database.prepare("SELECT value FROM settings WHERE key = 'families_repaired_v1'").get()
    if (!done) {
      database.transaction(() => repairFamilies(database))()
      database
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('families_repaired_v1', '1')")
        .run()
    }
  } catch {
    /* families/settings not ready yet */
  }

  // v2: also fold away REDUNDANT partner-less families that still hold children
  // (a spouse deleted then re-created leaves the kids in both the real family and
  // the old empty leftover → they show as both siblings and half-siblings, and
  // the real spouse stops showing as a parent). Re-runs the now-3-pass repair.
  try {
    const done = database.prepare("SELECT value FROM settings WHERE key = 'families_repaired_v2'").get()
    if (!done) {
      database.transaction(() => repairFamilies(database))()
      database
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('families_repaired_v2', '1')")
        .run()
    }
  } catch {
    /* families/settings not ready yet */
  }

  // One-time: seed a dense manual `ordinal` for occupations and life events from
  // their current chronological order. The lists now sort purely by ordinal so any
  // row — even an undated one — can be dragged anywhere; seeding keeps the default
  // order identical to the old date-based one until the user rearranges. Gated so
  // a later hand-drag is never overwritten on the next launch.
  try {
    const done = database.prepare("SELECT value FROM settings WHERE key = 'lists_ordinal_seeded_v1'").get()
    if (!done) {
      database.exec(`
        WITH r AS (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY owner_type, owner_id
            ORDER BY (date IS NULL OR date = ''), date, type, id
          ) - 1 AS rn FROM events
        )
        UPDATE events SET ordinal = (SELECT rn FROM r WHERE r.id = events.id)
        WHERE id IN (SELECT id FROM r)
      `)
      database.exec(`
        WITH r AS (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY person_id
            ORDER BY (start_date IS NULL OR start_date = ''), start_date, title, id
          ) - 1 AS rn FROM occupations
        )
        UPDATE occupations SET ordinal = (SELECT rn FROM r WHERE r.id = occupations.id)
        WHERE id IN (SELECT id FROM r)
      `)
      database
        .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('lists_ordinal_seeded_v1', '1')")
        .run()
    }
  } catch {
    /* events/occupations/settings not ready yet */
  }
}

export function getDb(): Database.Database {
  if (db) return db
  // The active workspace decides which database file we open (each family tree
  // is a separate file). dataDir() is still ensured for media/backups.
  dataDir()
  const file = activeDbFile()
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // Never block forever on a locked database (a second instance, antivirus, or a
  // cloud-sync handle holding the file): fail the query after 5s instead, so the
  // renderer surfaces an error rather than hanging on the splash indefinitely.
  db.pragma('busy_timeout = 5000')
  db.exec(SCHEMA_SQL)
  migrate(db)
  // Change-history triggers go on AFTER the one-time migrations above, and we
  // only switch logging on once init is done — so schema setup, column ALTERs and
  // data back-fills never appear in the user-facing audit log.
  applyAuditSchema(db)
  Audit.enable()
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
