import { Families } from './repo'
import type { KinshipFlag } from '@shared/types'

/**
 * Scans the family graph for unusual marriages and returns, per person id, the
 * flags that apply to them:
 *
 *  - `consanguineous`     — the two spouses share a blood ancestor (cousin
 *                           marriage, uncle/niece, …).
 *  - `stepSiblingMarriage` — the two spouses are step-siblings: a parent of one
 *                           is/was married to a parent of the other, yet they
 *                           share no biological parent. (E.g. a man's child by a
 *                           first wife marries the child his second wife had with
 *                           a previous husband.)
 */
export function detectKinship(): Record<string, KinshipFlag[]> {
  const families = Families.list()

  const childParents = new Map<string, string[]>() // child id → its parents
  const spouses = new Map<string, Set<string>>() // person id → their spouses
  const link = (a: string, b: string): void => {
    let s = spouses.get(a)
    if (!s) spouses.set(a, (s = new Set()))
    s.add(b)
  }
  for (const f of families) {
    const couple = [f.husbandId, f.wifeId].filter((x): x is string => !!x)
    if (f.husbandId && f.wifeId) {
      link(f.husbandId, f.wifeId)
      link(f.wifeId, f.husbandId)
    }
    for (const c of f.childIds) {
      const cur = childParents.get(c)
      if (cur) {
        for (const p of couple) if (!cur.includes(p)) cur.push(p)
      } else childParents.set(c, [...couple])
    }
  }

  const parentsOf = (id: string): string[] => childParents.get(id) ?? []
  const areSpouses = (a: string, b: string): boolean => spouses.get(a)?.has(b) ?? false
  // Ancestor id → fewest generations up to reach them. Depth lets us ignore
  // negligibly-distant blood links (e.g. 6th cousins sharing a 1700s ancestor),
  // which are NOT a meaningful "consanguineous marriage".
  const ancestors = (id: string): Map<string, number> => {
    const res = new Map<string, number>()
    const stack: [string, number][] = [[id, 0]]
    while (stack.length) {
      const [x, d] = stack.pop()!
      for (const p of parentsOf(x)) {
        const nd = d + 1
        const prev = res.get(p)
        if (prev === undefined || nd < prev) {
          res.set(p, nd)
          stack.push([p, nd])
        }
      }
    }
    return res
  }
  // Flag only when the shared ancestor is within this many generations of BOTH
  // spouses — 4 ⇒ up to third cousins (a great-great-grandparent in common).
  const MAX_CONSANG_GEN = 4

  const out = new Map<string, KinshipFlag[]>()
  const add = (id: string, fl: KinshipFlag): void => {
    const arr = out.get(id) ?? []
    if (!arr.some((x) => x.kind === fl.kind && x.withId === fl.withId)) {
      arr.push(fl)
      out.set(id, arr)
    }
  }

  for (const f of families) {
    const h = f.husbandId
    const w = f.wifeId
    if (!h || !w) continue

    // (1) consanguinity — the spouses share a CLOSE blood ancestor (within
    //     MAX_CONSANG_GEN generations of each). relatedIds = the nearest one.
    const ah = ancestors(h)
    const aw = ancestors(w)
    let common: { id: string; gen: number } | null = null
    for (const [a, dw] of aw) {
      const dh = ah.get(a)
      if (dh === undefined || dh > MAX_CONSANG_GEN || dw > MAX_CONSANG_GEN) continue
      const gen = Math.max(dh, dw)
      if (!common || gen < common.gen) common = { id: a, gen }
    }
    if (common) {
      add(h, { kind: 'consanguineous', withId: w, relatedIds: [common.id] })
      add(w, { kind: 'consanguineous', withId: h, relatedIds: [common.id] })
    }

    // (2) step-sibling marriage — a parent of each is married to the other's
    //     parent, but they have no parent in common.
    const ph = parentsOf(h)
    const pw = parentsOf(w)
    if (!ph.some((x) => pw.includes(x))) {
      let sp: [string, string] | null = null
      for (const a of ph) {
        for (const b of pw)
          if (areSpouses(a, b)) {
            sp = [a, b]
            break
          }
        if (sp) break
      }
      if (sp) {
        add(h, { kind: 'stepSiblingMarriage', withId: w, relatedIds: sp })
        add(w, { kind: 'stepSiblingMarriage', withId: h, relatedIds: sp })
      }
    }
  }

  return Object.fromEntries(out)
}
