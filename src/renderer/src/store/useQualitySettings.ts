import { create } from 'zustand'
import { DEFAULT_QUALITY_WEIGHTS, QUALITY_FIELDS, type QualityField, type QualityWeights } from '@/lib/completeness'

const KEY = 'treemonk.quality'

/** Allowed weight steps: 0 = the field does not count at all. */
export const QUALITY_WEIGHT_STEPS = [0, 1, 2, 3] as const
export type QualityWeightStep = (typeof QUALITY_WEIGHT_STEPS)[number]

interface QualitySettings {
  weights: QualityWeights
  setWeight: (field: QualityField, weight: QualityWeightStep) => void
  reset: () => void
}

function load(): QualityWeights {
  const out: QualityWeights = { ...DEFAULT_QUALITY_WEIGHTS }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Record<QualityField, unknown>>
      for (const f of QUALITY_FIELDS) {
        const v = p[f]
        if (typeof v === 'number' && (QUALITY_WEIGHT_STEPS as readonly number[]).includes(v)) out[f] = v
      }
    }
  } catch {
    /* ignore */
  }
  return out
}

/**
 * Per-field weights behind the data-quality score. A 10-generation tree has
 * plenty of people for whom a portrait cannot exist — with "photo" at 0 they
 * stop looking incomplete, and a field can be made to count double or triple
 * when it matters more for a given research goal. Persisted per browser/app.
 */
export const useQualitySettings = create<QualitySettings>((set, get) => ({
  weights: load(),
  setWeight: (field, weight) => {
    const weights = { ...get().weights, [field]: weight }
    localStorage.setItem(KEY, JSON.stringify(weights))
    set({ weights })
  },
  reset: () => {
    localStorage.removeItem(KEY)
    set({ weights: { ...DEFAULT_QUALITY_WEIGHTS } })
  }
}))
