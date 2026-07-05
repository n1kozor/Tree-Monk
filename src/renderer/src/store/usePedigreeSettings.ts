import { create } from 'zustand'

/** Accent presets for the pedigree (card ring + connector lines). */
export const PEDIGREE_ACCENTS: { key: string; color: string }[] = [
  { key: 'default', color: 'hsl(var(--primary))' },
  { key: 'emerald', color: '#10b981' },
  { key: 'teal', color: '#14b8a6' },
  { key: 'amber', color: '#f59e0b' },
  { key: 'orange', color: '#f97316' },
  { key: 'rose', color: '#f43f5e' },
  { key: 'red', color: '#ef4444' },
  { key: 'fuchsia', color: '#d946ef' },
  { key: 'violet', color: '#8b5cf6' },
  { key: 'indigo', color: '#6366f1' },
  { key: 'sky', color: '#0ea5e9' },
  { key: 'lime', color: '#84cc16' },
  { key: 'slate', color: '#64748b' }
]

/** Card background presets. `auto` follows the app theme (bg-card). */
export const CARD_BACKGROUNDS: { key: string; color: string }[] = [
  { key: 'auto', color: 'auto' },
  { key: 'white', color: '#ffffff' },
  { key: 'cream', color: '#fbf7ee' },
  { key: 'mint', color: '#eafaf1' },
  { key: 'sky', color: '#eaf2fb' },
  { key: 'rose', color: '#fdeef2' },
  { key: 'graphite', color: '#1f2430' },
  { key: 'ink', color: '#0f1118' }
]

/** Card frame (border) presets. `auto` = themed border, `accent` = follow the
 *  accent colour, otherwise an explicit colour. */
export const CARD_BORDERS: { key: string; color: string }[] = [
  { key: 'auto', color: 'auto' },
  { key: 'accent', color: 'accent' },
  { key: 'emerald', color: '#10b981' },
  { key: 'amber', color: '#f59e0b' },
  { key: 'rose', color: '#f43f5e' },
  { key: 'violet', color: '#8b5cf6' },
  { key: 'sky', color: '#0ea5e9' },
  { key: 'slate', color: '#64748b' },
  { key: 'ink', color: '#0f1118' }
]

/** Canvas backdrop presets behind the tree. `auto` follows the app light/dark
 *  theme; everything else is an explicit colour. A custom colour can be picked
 *  separately in the settings panel. Light options come first. */
export const CANVAS_BACKGROUNDS: { key: string; color: string }[] = [
  { key: 'auto', color: 'auto' },
  { key: 'white', color: '#ffffff' },
  { key: 'paper', color: '#f6f3ec' },
  { key: 'mist', color: '#eceff3' },
  { key: 'sky', color: '#e7eef6' },
  { key: 'sand', color: '#efe7d6' },
  { key: 'slate', color: '#334155' },
  { key: 'ink', color: '#0b0b12' }
]

export type TreeViewKind = 'landscape' | 'portrait' | 'fan' | 'descendants'

/** Fan chart sweep (degrees): full wheel, three-quarter, or classic semicircle. */
export type FanSweep = 360 | 270 | 180
/** Fan wedge colouring. */
export type FanColorMode = 'sex' | 'generation' | 'mono'

/** The persisted, user-tweakable look of the pedigree canvas. */
export interface PedigreeValues {
  /** Active tree sub-view (survives navigation away and back). */
  viewKind: TreeViewKind
  /** Fan chart generation depth. */
  fanGenerations: number
  /** Fan chart angular sweep in degrees (360 = full wheel). */
  fanSweep: FanSweep
  /** How fan wedges are coloured. */
  fanColorMode: FanColorMode
  /** Show birth/death years on the fan. */
  fanShowYears: boolean
  /** Horizontal spacing between generations (px). */
  colGap: number
  /** Vertical spacing between sibling cards (px). */
  rowGap: number
  /** Accent color (card ring + connectors). */
  accent: string
  /** Connector line thickness (px). */
  connectorWidth: number
  /** Connector line opacity (0–1). */
  connectorOpacity: number
  /** Canvas backdrop color behind the tree. */
  background: string
  /** CSS contrast applied to the whole canvas (1 = unchanged). */
  contrast: number
  /** CSS brightness applied to the whole canvas (1 = unchanged). */
  brightness: number
  /** CSS saturation applied to the whole canvas (1 = unchanged). */
  saturation: number
  /** CSS sepia applied to the whole canvas (0 = none → "vintage" look). */
  sepia: number
  /** Card background: 'auto' (themed) or a CSS colour. */
  cardBg: string
  /** Card frame colour: 'auto' (themed), 'accent', or a CSS colour. */
  cardBorder: string
  /** Card frame thickness (px). */
  cardBorderWidth: number
  /** Card corner radius (px). */
  cardRadius: number
  /** Drop shadow under cards. */
  cardShadow: boolean
  /** Persisted schema version — bump to auto-migrate existing users' defaults. */
  settingsVersion: number
}

export interface PedigreeSettings extends PedigreeValues {
  /** Patch one or more values (persisted immediately). */
  set: (patch: Partial<PedigreeValues>) => void
  reset: () => void
}

const KEY = 'treemonk.pedigree'
const DEFAULTS: PedigreeValues = {
  viewKind: 'landscape',
  fanGenerations: 5,
  fanSweep: 360,
  fanColorMode: 'sex',
  fanShowYears: true,
  colGap: 320,
  rowGap: 188,
  accent: PEDIGREE_ACCENTS[0].color,
  connectorWidth: 5,
  connectorOpacity: 1,
  // Default to the themed app background so light mode starts light.
  background: 'auto',
  contrast: 1,
  brightness: 1,
  saturation: 1,
  sepia: 0,
  cardBg: 'auto',
  cardBorder: 'auto',
  cardBorderWidth: 4,
  cardRadius: 24,
  cardShadow: true,
  settingsVersion: 2
}

function load(): PedigreeValues {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const merged: PedigreeValues = { ...DEFAULTS, ...JSON.parse(raw) }
    // Migrate the previous hard dark default to the theme-following backdrop.
    if (merged.background === '#0b0b0f') merged.background = 'auto'
    // 'custom' is no longer a separate view — it became an in-pedigree filter.
    if (!['landscape', 'portrait', 'fan', 'descendants'].includes(merged.viewKind))
      merged.viewKind = 'landscape'
    // Fan chart is capped at 13 generations; pull older, larger saved values down.
    merged.fanGenerations = Math.min(13, Math.max(2, merged.fanGenerations))
    // v2: standardise the tree-view frame/line look — switch EXISTING users to
    // the new defaults once (frame 4, corner 24, line 5, opacity 100%). After
    // this they can freely re-tune; the version stamp stops it re-applying.
    if ((merged.settingsVersion ?? 0) < 2) {
      merged.cardBorderWidth = 4
      merged.cardRadius = 24
      merged.connectorWidth = 5
      merged.connectorOpacity = 1
      merged.settingsVersion = 2
      try {
        localStorage.setItem(KEY, JSON.stringify(merged))
      } catch {
        /* persistence is best-effort */
      }
    }
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

export const usePedigreeSettings = create<PedigreeSettings>((set, get) => ({
  ...load(),
  set: (patch) => {
    // Persist all VALUE fields (everything except the action functions).
    const { set: _set, reset: _reset, ...current } = get()
    const next: PedigreeValues = { ...current, ...patch }
    localStorage.setItem(KEY, JSON.stringify(next))
    set(patch)
  },
  reset: () => {
    localStorage.setItem(KEY, JSON.stringify(DEFAULTS))
    set({ ...DEFAULTS })
  }
}))
