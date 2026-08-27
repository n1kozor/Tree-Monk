// Precision-aware birth-date comparison for duplicate detection. Kept free of any
// database / native imports so it stays unit-testable in isolation.
import { monthNumber } from '@shared/months'

interface DParts {
  y: number
  m: number | null
  d: number | null
}
/** Year (+ month/day only when confidently known: ISO digits or a named month). */
function dateParts(date: string | null): DParts | null {
  if (!date) return null
  const iso = date.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) }
  const ym = date.match(/\b(\d{4})\b/)
  if (!ym) return null
  let m: number | null = null
  for (const tok of date.toLowerCase().split(/[^\p{L}]+/u)) {
    const month = monthNumber(tok)
    if (month !== null) {
      m = month
      break
    }
  }
  return { y: Number(ym[1]), m, d: null }
}

export type DateRelation = 'same' | 'diff' | 'unknown'

/**
 * How two birth dates relate:
 *  - 'diff'    they contradict (different year, or a confidently different month/day),
 *  - 'same'    identical at the finest precision both state,
 *  - 'unknown' at least one has no parseable date.
 *
 * Never reports 'diff' from ambiguous numeric day/month order — only a clear
 * contradiction. Two people with DIFFERENT birth dates are never duplicates
 * (a stillborn child's name was commonly reused for a later sibling).
 */
export function birthDateRelation(a: string | null, b: string | null): DateRelation {
  const pa = dateParts(a)
  const pb = dateParts(b)
  if (!pa || !pb) return 'unknown'
  if (pa.y !== pb.y) return 'diff'
  if (pa.m !== null && pb.m !== null && pa.m !== pb.m) return 'diff'
  if (pa.d !== null && pb.d !== null && pa.d !== pb.d) return 'diff'
  return 'same'
}
