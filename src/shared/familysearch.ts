/**
 * A genuine FamilySearch Family Tree person id looks like `LZ1B-2CD` — four
 * uppercase alphanumerics, a hyphen, then three or four more (e.g. `KWQS-BBQ`).
 *
 * GEDCOM files can carry a foreign record id in their `RIN` field that is NOT a
 * FamilySearch id — e.g. a MyHeritage export uses values like `MH:I512`. Offering
 * "open in FamilySearch" / "sync from FamilySearch" for such a person fails with
 * *"FamilySearch returned no person for id …"*. So FamilySearch actions must be
 * gated on this format, and only `_FSFTID` (never `RIN`) may seed `fsId`.
 */
const FS_ID_RE = /^[A-Z0-9]{4}-[A-Z0-9]{3,4}$/

export function isFamilySearchId(id: string | null | undefined): boolean {
  const v = id?.trim().toUpperCase()
  return !!v && FS_ID_RE.test(v)
}

// ---- Import limits (shared by the dialog and the traversal) ----------------
// The FREE edition imports a bounded slice of the shared tree. The ceiling is
// not arbitrary: at roughly 2-3 persons per second (six requests each, politely
// throttled) 3 000 people already take ~20 minutes, and every person pulled in
// also makes the live tree refresh more expensive. Beyond that the import stops
// being something you wait for and becomes something you abandon.
export const MAX_IMPORT_PERSONS = 3000
export const DEFAULT_IMPORT_PERSONS = 3000

/** Sensible starting point: four ancestor generations, two of descendants, and
 *  TWO levels of side branches — the ancestors' siblings AND their children,
 *  which is what makes a tree feel complete without exploding it. */
export const DEFAULT_ASCEND = 4
export const DEFAULT_DESCEND = 2
export const DEFAULT_COLLATERAL = 2
/** Side branches multiply combinatorially — this is where imports explode. */
export const MAX_COLLATERAL = 3
/** Slider ceilings. Ancestors are cheap (the direct line thins out on its own),
 *  descendants are not — hence the far lower bound. */
export const MAX_ASCEND = 20
export const MAX_DESCEND = 10

/** Default depth for change scans around the current tree root. */
export const DEFAULT_FS_SCAN_DEPTH = 6
/** User-facing ceiling for depth-limited change scans. */
export const MAX_FS_SCAN_DEPTH = 20
