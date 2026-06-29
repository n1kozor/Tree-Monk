import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'treemonk.theme'

function apply(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

function initial(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  // Light is the default look; respect an explicit OS dark preference.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface ThemeStore {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

export const useTheme = create<ThemeStore>((set, get) => ({
  theme: 'light',
  setTheme: (theme) => {
    apply(theme)
    localStorage.setItem(STORAGE_KEY, theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
}))

/** Applies the persisted theme before first paint. Call once at startup. */
export function initTheme(): void {
  const theme = initial()
  apply(theme)
  useTheme.setState({ theme })
}
