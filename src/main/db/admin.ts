import { existsSync, unlinkSync } from 'fs'
import { getDb, mediaDir } from './connection'

// EVERY data table the wipe must clear. The full reset has to leave nothing
// behind — not just people/families, but also their facts, the boards, the
// research log AND the change history (audit_log). The wipe runs with
// foreign_keys OFF, so the order is irrelevant. Only true app preferences
// (the `settings` and `audit_state` config rows) are intentionally kept.
const TABLES = [
  // Person-owned facts
  'aliases',
  'occupations',
  'events',
  'godparents',
  'research_logs',
  'famous_verdicts',
  // Sources / citations / notes / attachments
  'note_links',
  'citations',
  'notes',
  'sources',
  'repositories',
  'person_documents',
  'documents',
  // Families
  'family_children',
  'families',
  // Investigation boards
  'board_edges',
  'board_nodes',
  'boards',
  // Gazetteer
  'places',
  // History, dismissals & the famous-relatives cache
  'audit_log',
  'dismissed_merges',
  'dismissed_issues',
  'famous_custom',
  // Core
  'people'
]

/**
 * Removes nameless "stub" people left by imports — typically married-in spouses
 * FamilySearch/GEDCOM referenced but never named. Only deletes people who have
 * NO name, NO dates, AND are NOT a child of any family (i.e. leaf stubs with no
 * ancestry), so people who connect generations are never severed. Also drops
 * families left completely empty. Returns how many people were removed.
 */
export function removeNamelessStubs(): number {
  const db = getDb()
  const res = db
    .prepare(
      `DELETE FROM people
       WHERE trim(coalesce(given_name, '')) = '' AND trim(coalesce(surname, '')) = ''
         AND coalesce(birth_date, '') = '' AND coalesce(death_date, '') = ''
         AND coalesce(christening_date, '') = ''
         AND coalesce(fs_id, '') = ''
         AND id NOT IN (SELECT child_id FROM family_children)`
    )
    .run()
  db.prepare(
    `DELETE FROM families
     WHERE husband_id IS NULL AND wife_id IS NULL
       AND id NOT IN (SELECT family_id FROM family_children)`
  ).run()
  return res.changes
}

/**
 * Thorough "delete empty people" for the Settings button. Removes a person that
 * carries NO data at all — no name, no dates/places, no religion/occupation/notes/
 * photo, and no attached records (occupations, events, aliases, documents,
 * citations, research) — INCLUDING empty child placeholders (their family link
 * just cascades away). It deliberately keeps anyone who is a PARENT of a family
 * that has children, so no real lineage is ever orphaned. Then drops the families
 * left with neither parents nor children.
 */
export function removeEmptyPeople(): number {
  const db = getDb()
  const res = db
    .prepare(
      `DELETE FROM people
       WHERE trim(coalesce(given_name, '')) = '' AND trim(coalesce(surname, '')) = ''
         AND coalesce(birth_date, '') = '' AND coalesce(birth_place, '') = ''
         AND coalesce(death_date, '') = '' AND coalesce(death_place, '') = ''
         AND coalesce(christening_date, '') = '' AND coalesce(christening_place, '') = ''
         AND coalesce(burial_date, '') = '' AND coalesce(burial_place, '') = ''
         AND coalesce(religion, '') = '' AND coalesce(occupation, '') = '' AND coalesce(notes, '') = ''
         AND profile_photo_id IS NULL
         AND id NOT IN (SELECT person_id FROM occupations)
         AND id NOT IN (SELECT owner_id FROM events WHERE owner_type = 'person')
         AND id NOT IN (SELECT person_id FROM aliases)
         AND id NOT IN (SELECT person_id FROM person_documents)
         AND id NOT IN (SELECT owner_id FROM citations WHERE owner_type = 'person')
         AND id NOT IN (SELECT person_id FROM research_logs WHERE person_id IS NOT NULL)
         AND id NOT IN (
           SELECT f.husband_id FROM families f
             WHERE f.husband_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM family_children fc WHERE fc.family_id = f.id)
           UNION
           SELECT f.wife_id FROM families f
             WHERE f.wife_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM family_children fc WHERE fc.family_id = f.id)
         )`
    )
    .run()
  db.prepare(
    `DELETE FROM families
     WHERE husband_id IS NULL AND wife_id IS NULL
       AND id NOT IN (SELECT family_id FROM family_children)`
  ).run()
  return res.changes
}

/** Deletes ALL data (people, families, sources, boards, …). Schema is kept. */
export function wipeDatabase(): void {
  const db = getDb()
  // Delete this tree's media files from disk too — otherwise a "wipe" leaves the
  // photos/documents orphaned in the media folder. That folder is SHARED across
  // workspaces, so we only remove files THIS tree references (guarded to paths
  // inside the media dir) — never a blanket wipe of the folder. Done first, while
  // the document rows still exist.
  try {
    const dir = mediaDir()
    const rows = db.prepare('SELECT file_path FROM documents').all() as { file_path: string | null }[]
    for (const r of rows) {
      const p = r.file_path
      if (p && p.startsWith(dir) && existsSync(p)) {
        try {
          unlinkSync(p)
        } catch {
          /* file already gone / locked — ignore */
        }
      }
    }
  } catch {
    /* documents table not ready — nothing to clean */
  }
  // The change history is written by SQL triggers gated on `audit_state.enabled`.
  // If audit is left on, deleting people/families would FIRE those triggers and
  // immediately re-fill the audit_log we're trying to clear — so suspend audit
  // for the wipe, then restore the previous flag.
  const prevAudit =
    (db.prepare('SELECT enabled FROM audit_state WHERE id = 1').get() as { enabled: number } | undefined)?.enabled ?? 1
  const tx = db.transaction(() => {
    db.prepare('UPDATE audit_state SET enabled = 0 WHERE id = 1').run()
    db.pragma('foreign_keys = OFF')
    for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run()
    // Drop the "starting person" pointer too — it would otherwise dangle on a
    // now-deleted id. App preferences (language, theme, login) are left intact.
    db.prepare("DELETE FROM settings WHERE key = 'default_root_person_id'").run()
    db.pragma('foreign_keys = ON')
    db.prepare('UPDATE audit_state SET enabled = ? WHERE id = 1').run(prevAudit)
  })
  tx()
  db.pragma('wal_checkpoint(TRUNCATE)')
}
