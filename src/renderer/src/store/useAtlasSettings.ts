import { create } from 'zustand'
import type { AtlasKind } from '@shared/types'

/** Basemap choices — 'auto' follows the app theme (light/dark). */
export type AtlasBasemap = 'auto' | 'light' | 'dark' | 'satellite' | 'historical'

export interface AtlasSettings {
  /** Flat map or tilted 3D terrain. */
  mode: 'flat' | '3d'
  basemap: AtlasBasemap
  /** Layer toggles. */
  showMarkers: boolean
  showHeat: boolean
  showPaths: boolean
  cluster: boolean
  /** Which event kinds are plotted. */
  kinds: Record<AtlasKind, boolean>
  /** Year window (null = open end). */
  yearFrom: number | null
  yearTo: number | null
  set: (patch: Partial<Omit<AtlasSettings, 'set' | 'setKind'>>) => void
  setKind: (kind: AtlasKind, on: boolean) => void
}

const KEY = 'treemonk.atlas'

export const DEFAULT_KINDS: Record<AtlasKind, boolean> = {
  birth: true,
  christening: false,
  marriage: true,
  residence: true,
  death: true,
  burial: false,
  other: false
}

const DEFAULTS = {
  mode: 'flat' as const,
  basemap: 'auto' as const,
  showMarkers: true,
  showHeat: false,
  showPaths: false,
  cluster: true,
  kinds: DEFAULT_KINDS,
  yearFrom: null,
  yearTo: null
}

function load(): typeof DEFAULTS {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw)
    return {
      ...DEFAULTS,
      ...saved,
      kinds: { ...DEFAULT_KINDS, ...(saved.kinds ?? {}) },
      // Heatmap + migration paths always start OFF — session-only layers.
      showHeat: false,
      showPaths: false
    }
  } catch {
    return DEFAULTS
  }
}

function save(s: AtlasSettings): void {
  const { set: _s, setKind: _k, ...data } = s
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* storage full/blocked — settings just won't persist */
  }
}

export const useAtlasSettings = create<AtlasSettings>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch)
    save(get())
  },
  setKind: (kind, on) => {
    set((s) => ({ kinds: { ...s.kinds, [kind]: on } }))
    save(get())
  }
}))
