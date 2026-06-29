import { create } from 'zustand'
import type {
  FamilySearchImportOptions,
  FamilySearchStatus,
  GedcomImportResult
} from '@shared/types'
import i18n from '@/i18n'
import { runPlaceStandardization } from '@/lib/standardizePlaces'
import { useAppStore } from './useAppStore'

/**
 * Global FamilySearch import controller — now STREAMING.
 *
 * The Python engine streams nodes; the main process ingests each into SQLite
 * live and broadcasts `fs-import-node-added`. Here we (a) keep a live counter
 * for the toast and (b) throttle a DB re-read so the People list, board and the
 * Family Tree visibly GROW while the import runs in the background.
 */
interface FsImportState {
  active: boolean
  running: boolean
  /** Collapsed to a small pill so it stops covering the settings underneath. */
  minimized: boolean
  /** User pressed Stop and we're waiting for the engine to wind down + clean up. */
  stopping: boolean
  current: FamilySearchStatus | null
  log: FamilySearchStatus[]
  /** Live count of people streamed in so far (for the toast). */
  peopleAdded: number
  result: GedcomImportResult | null
  error: string | null

  start: (opts: FamilySearchImportOptions) => Promise<void>
  /** Stop the running import — the engine winds down and stub cleanup still runs. */
  stop: () => void
  setMinimized: (v: boolean) => void
  dismiss: () => void
}

let unsubStatus: (() => void) | null = null
let unsubNode: (() => void) | null = null
let lastTick = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null

/** Trailing-throttled DB re-read so the live views grow a few times per second. */
function scheduleGrow(): void {
  if (refreshTimer) return
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    const app = useAppStore.getState()
    void app.refreshPeople()
    void app.refreshFamilies()
  }, 500)
}

export const useFsImport = create<FsImportState>((set, get) => ({
  active: false,
  running: false,
  minimized: false,
  stopping: false,
  current: null,
  log: [],
  peopleAdded: 0,
  result: null,
  error: null,

  start: async (opts) => {
    if (get().running) return
    set({
      active: true,
      running: true,
      minimized: false,
      stopping: false,
      current: null,
      log: [],
      peopleAdded: 0,
      result: null,
      error: null
    })

    unsubStatus?.()
    unsubStatus = window.api.familysearch.onStatus((s) => {
      if (s.phase === 'processed') {
        const now = Date.now()
        if (now - lastTick < 150) return
        lastTick = now
        set({ current: s })
      } else {
        set((st) => ({ current: s, log: [...st.log.slice(-29), s] }))
      }
    })

    unsubNode?.()
    unsubNode = window.api.familysearch.onNode((event) => {
      if (event.kind === 'person') set((st) => ({ peopleAdded: st.peopleAdded + 1 }))
      scheduleGrow() // live "growing tree"
    })

    try {
      const res = await window.api.familysearch.import(opts)
      set({ running: false, stopping: false, result: res, current: null })
      await useAppStore.getState().refreshAll()
      // Pull any imported FamilySearch photos into local storage in the
      // background (progress shown by MediaDownloadProgress); profile photos
      // appear once localized.
      void window.api.media.downloadRemote()
      // Force the freshly-imported person to BE the tree root (overrides any
      // stale session root from before the import). A deep import (keepRoot)
      // must leave the existing global starting person untouched.
      if (!opts.keepRoot) {
        const root = useAppStore.getState().defaultRootId
        if (root) useAppStore.getState().setTreeRoot(root)
      }
      // Standardize the newly imported place names (only the new ones → fast),
      // collapsing variants like "Csány, Heves, Hungary" / "…Magyarország".
      void runPlaceStandardization(i18n.t.bind(i18n), () => useAppStore.getState().refreshAll(), true)
    } catch (e) {
      set({ running: false, stopping: false, error: (e as Error).message, current: null })
    } finally {
      unsubStatus?.()
      unsubNode?.()
      unsubStatus = null
      unsubNode = null
      if (refreshTimer) {
        clearTimeout(refreshTimer)
        refreshTimer = null
      }
    }
  },

  stop: () => {
    if (!get().running || get().stopping) return
    set({ stopping: true })
    void window.api.familysearch.cancel()
  },

  setMinimized: (v) => set({ minimized: v }),

  dismiss: () =>
    set({
      active: false,
      running: false,
      minimized: false,
      stopping: false,
      current: null,
      log: [],
      peopleAdded: 0,
      result: null,
      error: null
    })
}))
