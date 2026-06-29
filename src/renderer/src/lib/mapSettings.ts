/**
 * Remembers the map's view settings (base mode, filters, selected person) across
 * visits — the map view unmounts on navigation, so without this every return
 * would reset the mode, filters and the person you were looking at. Persisted to
 * localStorage so it also survives an app restart. (The camera lives in
 * mapCamera.ts; the data-derived year range is intentionally not persisted, as it
 * re-derives from the tree on every load.)
 */
export interface MapSettings {
  mode?: string
  kinds?: Record<string, boolean>
  surnames?: string[]
  showMigration?: boolean
  panelOpen?: boolean
  personFilter?: string | null
  personQuery?: string
}

const KEY = 'treemonk.mapSettings'

export function loadMapSettings(): MapSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as MapSettings
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

export function saveMapSettings(s: MapSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full / unavailable — non-critical */
  }
}
