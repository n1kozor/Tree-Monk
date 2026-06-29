/**
 * Remembers the map camera (center / zoom / tilt) across visits. The map view
 * unmounts when you navigate away (e.g. to open a person), so without this every
 * return would snap back to the default view. Persisted to localStorage so it
 * also survives an app restart.
 */
export interface MapCamera {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

const KEY = 'treemonk.mapCamera'

export function loadCamera(): MapCamera | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<MapCamera>
    if (
      Array.isArray(o.center) &&
      o.center.length === 2 &&
      o.center.every((n) => Number.isFinite(n)) &&
      typeof o.zoom === 'number'
    ) {
      return {
        center: [o.center[0], o.center[1]],
        zoom: o.zoom,
        pitch: typeof o.pitch === 'number' ? o.pitch : 0,
        bearing: typeof o.bearing === 'number' ? o.bearing : 0
      }
    }
    return null
  } catch {
    return null
  }
}

export function saveCamera(c: MapCamera): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* storage full / unavailable — non-critical */
  }
}
