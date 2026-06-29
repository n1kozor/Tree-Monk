import type { Person } from '@shared/types'

/** Dimension the custom view colour-codes person cards by. */
export type ColorBy = 'none' | 'sex' | 'century' | 'surname' | 'place'

export interface ColoringLegendItem {
  label: string
  color: string
}
export interface Coloring {
  /** Person id → card colour (absent = no colour). */
  colorById: Map<string, string>
  /** What each colour means, for the on-screen legend. */
  legend: ColoringLegendItem[]
}

/** A spread of distinct, readable hues for categorical colouring. */
const PALETTE = [
  '#0ea5e9', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316',
  '#06b6d4', '#a855f7'
]
const OTHER_COLOR = '#94a3b8'

const SEX_COLOR: Record<string, string> = { M: '#0ea5e9', F: '#f43f5e', U: '#64748b' }

const yearOf = (d: string | null): number | null => {
  const m = d?.match(/\b(\d{3,4})\b/)
  return m ? Number(m[1]) : null
}
const firstSeg = (s: string | null | undefined): string => (s ?? '').split(',')[0].trim()

type Tr = (key: string, opts?: Record<string, unknown>) => string

/**
 * Builds a person→colour map (plus a legend) for the custom view's colour-coding.
 * Categorical dimensions (surname / place) keep the most frequent values distinct
 * and fold the long tail into "Other".
 */
export function buildColoring(people: Person[], by: ColorBy, t: Tr): Coloring {
  const colorById = new Map<string, string>()
  const legend: ColoringLegendItem[] = []
  if (by === 'none') return { colorById, legend }

  if (by === 'sex') {
    for (const p of people) colorById.set(p.id, SEX_COLOR[p.sex] ?? SEX_COLOR.U)
    legend.push(
      { label: t('person.male'), color: SEX_COLOR.M },
      { label: t('person.female'), color: SEX_COLOR.F },
      { label: t('common.unknown'), color: SEX_COLOR.U }
    )
    return { colorById, legend }
  }

  if (by === 'century') {
    const centuryOf = (p: Person): number | null => {
      const y = yearOf(p.birthDate)
      return y === null ? null : Math.floor(y / 100) * 100
    }
    const centuries = [...new Set(people.map(centuryOf).filter((c): c is number => c !== null))].sort(
      (a, b) => a - b
    )
    const cmap = new Map(centuries.map((c, i) => [c, PALETTE[i % PALETTE.length]]))
    for (const p of people) {
      const c = centuryOf(p)
      if (c !== null) colorById.set(p.id, cmap.get(c)!)
    }
    for (const c of centuries) legend.push({ label: t('tree.custom.century', { c }), color: cmap.get(c)! })
    return { colorById, legend }
  }

  // surname | place — categorical, top values distinct, rest "Other".
  const keyOf = by === 'surname' ? (p: Person): string => p.surname.trim() : (p: Person): string => firstSeg(p.birthPlace)
  const counts = new Map<string, number>()
  for (const p of people) {
    const k = keyOf(p)
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, PALETTE.length)
  const kmap = new Map(top.map(([k], i) => [k, PALETTE[i]]))
  let usedOther = false
  for (const p of people) {
    const k = keyOf(p)
    if (!k) continue
    const c = kmap.get(k)
    if (c) colorById.set(p.id, c)
    else {
      colorById.set(p.id, OTHER_COLOR)
      usedOther = true
    }
  }
  for (const [k] of top) legend.push({ label: k, color: kmap.get(k)! })
  if (usedOther) legend.push({ label: t('tree.custom.other'), color: OTHER_COLOR })
  return { colorById, legend }
}
