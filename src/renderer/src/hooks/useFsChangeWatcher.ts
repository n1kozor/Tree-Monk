import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { isFsMode } from '@/lib/fsMode'
import { isFamilySearchId } from '@/lib/familySearchSearch'

const SWEEP_INTERVAL_MS = 90 * 1000 // full re-sweep every 90 seconds

/**
 * Background FamilySearch change watcher (FS mode only). Quietly walks every
 * FS-linked person, asks the main process what changed remotely (fields, new
 * relatives, notes/sources/photos), and flags them in the store so the tree
 * views can badge the cards. Sequential and throttled — never blocks the UI.
 */
export function useFsChangeWatcher(active: boolean): void {
  const running = useRef(false)

  useEffect(() => {
    if (!active || !isFsMode()) return
    let cancelled = false

    const sweep = async (): Promise<void> => {
      if (running.current) return
      running.current = true
      try {
        const [cfg, signedIn] = await Promise.all([
          window.api.familysearch.configured(),
          window.api.familysearch.signedIn()
        ])
        if (!cfg || !signedIn || cancelled) return
        const people = Array.from(useAppStore.getState().peopleById.values()).filter((p) =>
          isFamilySearchId(p.fsId)
        )
        let next = 0
        const worker = async (): Promise<void> => {
          for (;;) {
            if (cancelled) return
            const i = next++
            if (i >= people.length) return
            const p = people[i]
            try {
              const r = await window.api.familysearch.syncPreview(p.id)
              if (cancelled) return
              if ('error' in r) continue
              const content = Object.values(r.content).reduce((n, c) => n + Math.max(0, c.remote - c.local), 0)
              const summary = { fields: r.fields.length, relatives: r.newRelatives.length, content }
              useAppStore
                .getState()
                .setFsChange(p.id, summary.fields + summary.relatives + summary.content > 0 ? summary : null)
            } catch {
              /* per-person check is best-effort */
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(5, people.length) }, () => worker()))
      } finally {
        running.current = false
      }
    }

    void sweep()
    const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [active])
}
