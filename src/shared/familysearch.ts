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
