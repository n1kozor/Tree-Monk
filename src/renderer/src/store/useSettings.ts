import { create } from 'zustand'

export type FontSize = 'small' | 'medium' | 'large'
export type DateFormat = 'iso' | 'eu' | 'us'

const KEY = 'treemonk.settings'
const FONT_PX: Record<FontSize, string> = { small: '14px', medium: '16px', large: '18px' }

interface SettingsState {
  fontSize: FontSize
  animations: boolean
  dateFormat: DateFormat
  /** Whether the left navigation rail is collapsed to icons only (default: open). */
  sidebarCollapsed: boolean
  /** Show a green/orange "verified" mark on every person (default: OFF). */
  verificationMarks: boolean
  setFontSize: (f: FontSize) => void
  setAnimations: (v: boolean) => void
  setDateFormat: (d: DateFormat) => void
  setSidebarCollapsed: (v: boolean) => void
  setVerificationMarks: (v: boolean) => void
}

type Persisted = Pick<
  SettingsState,
  'fontSize' | 'animations' | 'dateFormat' | 'sidebarCollapsed' | 'verificationMarks'
>

function persist(s: Persisted): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

function apply(s: Pick<SettingsState, 'fontSize' | 'animations'>): void {
  document.documentElement.style.fontSize = FONT_PX[s.fontSize]
  document.documentElement.classList.toggle('no-anim', !s.animations)
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        fontSize: p.fontSize ?? 'medium',
        animations: p.animations ?? true,
        dateFormat: p.dateFormat ?? 'iso',
        sidebarCollapsed: p.sidebarCollapsed ?? false,
        verificationMarks: p.verificationMarks ?? false
      }
    }
  } catch {
    /* ignore */
  }
  return { fontSize: 'medium', animations: true, dateFormat: 'iso', sidebarCollapsed: false, verificationMarks: false }
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  setFontSize: (fontSize) => {
    set({ fontSize })
    apply({ fontSize, animations: get().animations })
    persist({ ...current(get), fontSize })
  },
  setAnimations: (animations) => {
    set({ animations })
    apply({ fontSize: get().fontSize, animations })
    persist({ ...current(get), animations })
  },
  setDateFormat: (dateFormat) => {
    set({ dateFormat })
    persist({ ...current(get), dateFormat })
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    set({ sidebarCollapsed })
    persist({ ...current(get), sidebarCollapsed })
  },
  setVerificationMarks: (verificationMarks) => {
    set({ verificationMarks })
    persist({ ...current(get), verificationMarks })
  }
}))

/** Snapshot of just the persistable fields from the current store. */
function current(get: () => SettingsState): Persisted {
  const s = get()
  return {
    fontSize: s.fontSize,
    animations: s.animations,
    dateFormat: s.dateFormat,
    sidebarCollapsed: s.sidebarCollapsed,
    verificationMarks: s.verificationMarks
  }
}

/** Applies persisted settings before first paint. */
export function initSettings(): void {
  const s = load()
  apply(s)
  useSettings.setState(s)
}
