import { create } from 'zustand'
import type { DashboardScope } from '@/lib/dashboardScope'

/** Every section the Dashboard can render, in their default order. */
export type WidgetId =
  | 'kpis'
  | 'demographics'
  | 'records'
  | 'timeline'
  | 'deaths'
  | 'lifespan'
  | 'surnames'
  | 'givenNames'
  | 'places'
  | 'deathPlaces'
  | 'occupations'
  | 'religions'
  | 'completeness'

export const DEFAULT_ORDER: WidgetId[] = [
  'kpis',
  'demographics',
  'records',
  'timeline',
  'deaths',
  'lifespan',
  'surnames',
  'givenNames',
  'places',
  'deathPlaces',
  'occupations',
  'religions',
  'completeness'
]

/** Widgets hidden out of the box (keeps the first run uncluttered). */
const DEFAULT_HIDDEN: WidgetId[] = ['deaths', 'givenNames', 'deathPlaces', 'religions']

export interface DashboardValues {
  /** Which slice of the tree the stats cover. */
  scope: DashboardScope
  /** The reference (root) person for scoped views. */
  rootId?: string
  /** Whether married-in spouses are folded into a scoped view. */
  includeSpouses: boolean
  /** How many entries each "top N" list shows. */
  topN: number
  /** Display order of the widgets. */
  order: WidgetId[]
  /** Widgets the user has switched off. */
  hidden: WidgetId[]
}

export interface DashboardSettings extends DashboardValues {
  set: (patch: Partial<DashboardValues>) => void
  toggleWidget: (id: WidgetId) => void
  resetLayout: () => void
  reset: () => void
}

const KEY = 'treemonk.dashboard'
/** Pre-1.0 key that stored only the widget order. */
const LEGACY_ORDER_KEY = 'treemonk.dashboard.order'

export const TOP_N_MIN = 3
export const TOP_N_MAX = 20

const DEFAULTS: DashboardValues = {
  scope: 'all',
  rootId: undefined,
  includeSpouses: false,
  topN: 8,
  order: [...DEFAULT_ORDER],
  hidden: [...DEFAULT_HIDDEN]
}

/** Reconcile a saved order with the current widget set (drop unknowns, append new). */
function normalizeOrder(saved: unknown): WidgetId[] {
  const arr = Array.isArray(saved) ? (saved as WidgetId[]) : []
  const known = arr.filter((id) => DEFAULT_ORDER.includes(id))
  return [...known, ...DEFAULT_ORDER.filter((id) => !known.includes(id))]
}

function load(): DashboardValues {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<DashboardValues>
      return {
        ...DEFAULTS,
        ...saved,
        topN: Math.min(TOP_N_MAX, Math.max(TOP_N_MIN, saved.topN ?? DEFAULTS.topN)),
        order: normalizeOrder(saved.order),
        hidden: (saved.hidden ?? DEFAULTS.hidden).filter((id) => DEFAULT_ORDER.includes(id))
      }
    }
    // Migrate the legacy order-only key, if present.
    const legacy = localStorage.getItem(LEGACY_ORDER_KEY)
    if (legacy) return { ...DEFAULTS, order: normalizeOrder(JSON.parse(legacy)), hidden: [] }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULTS, order: [...DEFAULT_ORDER], hidden: [...DEFAULT_HIDDEN] }
}

function persist(values: DashboardValues): void {
  localStorage.setItem(KEY, JSON.stringify(values))
}

export const useDashboardSettings = create<DashboardSettings>((set, get) => ({
  ...load(),
  set: (patch) => {
    const { set: _s, toggleWidget: _t, resetLayout: _r, reset: _x, ...current } = get()
    const next = { ...current, ...patch }
    persist(next)
    set(patch)
  },
  toggleWidget: (id) => {
    const hidden = get().hidden.includes(id)
      ? get().hidden.filter((w) => w !== id)
      : [...get().hidden, id]
    get().set({ hidden })
  },
  resetLayout: () => get().set({ order: [...DEFAULT_ORDER], hidden: [...DEFAULT_HIDDEN] }),
  reset: () => {
    persist(DEFAULTS)
    set({ ...DEFAULTS, order: [...DEFAULT_ORDER], hidden: [...DEFAULT_HIDDEN] })
  }
}))
