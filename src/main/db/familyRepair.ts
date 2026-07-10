import type Database from 'better-sqlite3'

/**
 * Heal tangled marriage records left behind by merges and deletes.
 *
 * Three safe passes:
 *  1. **De-duplicate the same couple** — when several `families` rows share the
 *     exact same husband_id + wife_id (e.g. after merging two men who were both
 *     linked to the same wife), fold their children and marriage facts into the
 *     single best row and drop the extras.
 *  2. **Drop redundant partner-less families WITH children** — a one-parent
 *     family whose EVERY child also belongs to another family of that same
 *     parent. Left behind when a spouse is deleted and then re-created (the kids
 *     end up in both the real family and the old partner-less leftover, so they
 *     show as BOTH siblings and half-siblings, and the real spouse stops showing
 *     as a parent). Safe: no child is orphaned — each stays in the other family.
 *  3. **Drop phantom half-families** — a row with only one partner and nothing
 *     else (no second partner, no children, no marriage date/place/notes). A
 *     person deletion leaves these behind (the FK is `ON DELETE SET NULL`) and
 *     they render as a stray "Unknown" spouse card on the Family tab.
 *
 * `scopePartnerId` limits both passes to families where that person is a
 * partner — used right after a merge so only the survivor's records are touched
 * (keeping the merge fully reversible). With no scope the whole tree is swept
 * (the one-time startup heal).
 *
 * The caller owns the transaction. Returns how many family rows were removed.
 */
export function repairFamilies(db: Database.Database, scopePartnerId?: string): number {
  const scopeSql = scopePartnerId ? ' AND (husband_id = ? OR wife_id = ?)' : ''
  const scopeArgs = scopePartnerId ? [scopePartnerId, scopePartnerId] : []
  let removed = 0

  // 1) De-duplicate exact couples.
  const dupes = db
    .prepare(
      `SELECT husband_id AS h, wife_id AS w
         FROM families
        WHERE husband_id IS NOT NULL AND wife_id IS NOT NULL${scopeSql}
        GROUP BY husband_id, wife_id
       HAVING COUNT(*) > 1`
    )
    .all(...scopeArgs) as { h: string; w: string }[]

  for (const d of dupes) {
    const rows = db
      .prepare(
        `SELECT f.id AS id, f.marriage_date AS md, f.marriage_place AS mp,
                (SELECT COUNT(*) FROM family_children fc WHERE fc.family_id = f.id) AS kids
           FROM families f
          WHERE f.husband_id = ? AND f.wife_id = ?`
      )
      .all(d.h, d.w) as { id: string; md: string | null; mp: string | null; kids: number }[]
    // Keeper = the row carrying the most (children first, then marriage detail).
    rows.sort(
      (a, b) =>
        b.kids - a.kids ||
        (b.md ? 1 : 0) + (b.mp ? 1 : 0) - ((a.md ? 1 : 0) + (a.mp ? 1 : 0))
    )
    const keep = rows[0]
    for (const r of rows.slice(1)) {
      // Move children onto the keeper (ignore any that would collide), then fill
      // in any marriage fact the keeper is missing, then drop the duplicate.
      db.prepare('UPDATE OR IGNORE family_children SET family_id = ? WHERE family_id = ?').run(keep.id, r.id)
      db.prepare('DELETE FROM family_children WHERE family_id = ?').run(r.id)
      db.prepare(
        `UPDATE families
            SET marriage_date  = COALESCE(NULLIF(marriage_date, ''), ?),
                marriage_place = COALESCE(NULLIF(marriage_place, ''), ?)
          WHERE id = ?`
      ).run(r.md, r.mp, keep.id)
      db.prepare('DELETE FROM families WHERE id = ?').run(r.id)
      removed++
    }
  }

  // 2) Drop REDUNDANT partner-less families that still hold children — every one
  //    of which already belongs to another family of the same remaining parent.
  const singles = db
    .prepare(
      `SELECT id, husband_id AS h, wife_id AS w FROM families
        WHERE ((husband_id IS NULL) <> (wife_id IS NULL))${scopeSql}`
    )
    .all(...scopeArgs) as { id: string; h: string | null; w: string | null }[]
  for (const b of singles) {
    const parent = b.h ?? b.w
    if (!parent) continue
    const kids = db
      .prepare('SELECT child_id FROM family_children WHERE family_id = ?')
      .all(b.id) as { child_id: string }[]
    if (kids.length === 0) continue // childless phantoms are handled by pass 3
    const allElsewhere = kids.every(
      (k) =>
        db
          .prepare(
            `SELECT 1 FROM family_children fc JOIN families f ON f.id = fc.family_id
              WHERE fc.child_id = ? AND fc.family_id <> ? AND (f.husband_id = ? OR f.wife_id = ?)
              LIMIT 1`
          )
          .get(k.child_id, b.id, parent, parent) !== undefined
    )
    if (allElsewhere) {
      db.prepare('DELETE FROM family_children WHERE family_id = ?').run(b.id)
      db.prepare('DELETE FROM families WHERE id = ?').run(b.id)
      removed++
    }
  }

  // 3) Drop phantom half-families (one partner, nothing else).
  removed += db
    .prepare(
      `DELETE FROM families
        WHERE (husband_id IS NULL OR wife_id IS NULL)${scopeSql}
          AND coalesce(marriage_date, '') = ''
          AND coalesce(marriage_place, '') = ''
          AND coalesce(notes, '') = ''
          AND id NOT IN (SELECT family_id FROM family_children)`
    )
    .run(...scopeArgs).changes

  return removed
}
