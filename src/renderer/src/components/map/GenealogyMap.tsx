import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { filterByDate } from '@openhistoricalmap/maplibre-gl-dates'
import { bezierSpline } from '@turf/bezier-spline'
import { along } from '@turf/along'
import { length } from '@turf/length'
import { featureCollection, lineString, point } from '@turf/helpers'
import type { Feature, LineString } from 'geojson'
import historicalStyleRaw from '@openhistoricalmap/map-styles/dist/historical/historical.json'
import { useTranslation } from 'react-i18next'
import { Box, ChevronDown, Clock, Compass, Droplet, Flame, Footprints, Landmark, Layers, MapPin, Route, Search, SlidersHorizontal, UserRound, Users, X } from 'lucide-react'
import { cn, fullName, yearOf } from '@/lib/utils'
import { matchesName, norm } from '@/lib/nameMatch'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import { useAppStore } from '@/store/useAppStore'
import { scopePeople } from '@/lib/dashboardScope'
import { TourSetupModal } from './tour/TourSetupModal'
import { TourOverlay, type TourHistItem } from './tour/TourOverlay'
import { buildPatrilineTour, type TourLang, type TourPlace, type TourStep } from './tour/tourNarrative'
import { useTheme } from '@/store/useTheme'
import { TimeSlider } from './TimeSlider'
import { loadCamera, saveCamera } from '@/lib/mapCamera'
import { loadMapSettings, saveMapSettings } from '@/lib/mapSettings'
import { worldEventsInRange, worldEventTitle, worldEventYears, type WorldEvent } from '@/lib/worldEvents'
import type { HistEvent, MapEventKind, MapMarker } from '@shared/types'

// ---- Base maps ----------------------------------------------------------
// OpenFreeMap (https://openfreemap.org) — free vector tiles, no API key.
// "liberty" carries OpenMapTiles building heights → real 3D city extrusions.
const STYLE_3D = 'https://tiles.openfreemap.org/styles/liberty'
const STYLE_FLAT = 'https://tiles.openfreemap.org/styles/positron'

/** Relabel every symbol layer to the UI language (OpenMapTiles carries
 *  name:de / name:en / name:latin). Falls back gracefully to the local name. */
function localizeMapLabels(map: maplibregl.Map, lang: string): void {
  const code = (lang || 'en').slice(0, 2)
  const field = [
    'coalesce',
    ['get', `name:${code}`],
    ['get', 'name:latin'],
    ['get', 'name:nonlatin'],
    ['get', 'name']
  ]
  try {
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.type !== 'symbol') continue
      const tf = (layer.layout as { 'text-field'?: unknown } | undefined)?.['text-field']
      if (tf === undefined) continue
      map.setLayoutProperty(layer.id, 'text-field', field as unknown as maplibregl.ExpressionSpecification)
    }
  } catch {
    /* some styles have no localizable labels — ignore */
  }
}
// Use the bundled OpenHistoricalMap style as-is. A couple of its asset URLs
// (a land-cover raster + the font CDN) 404, but those are harmless console noise
// — the vector base map itself loads fine. The marker-persistence fix lives in
// the `styleimagemissing` handler below, independent of this style.
const STYLE_HISTORICAL = historicalStyleRaw as unknown as StyleSpecification

type BaseMode = 'city3d' | 'flat' | 'historical' | 'heatmap'

/** Show the density heatmap (and hide the pins/clusters) only in heatmap mode. */
function applyModeVisibility(map: maplibregl.Map, mode: BaseMode): void {
  const heat = mode === 'heatmap'
  const set = (id: string, v: 'visible' | 'none'): void => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v)
  }
  set('heat', heat ? 'visible' : 'none')
  for (const id of ['pts', 'clusters', 'cluster-count']) set(id, heat ? 'none' : 'visible')
}

/** Base map style + its "style group" key (flat & heatmap share one). */
const styleForMode = (m: BaseMode): StyleSpecification | string =>
  m === 'historical' ? STYLE_HISTORICAL : m === 'flat' || m === 'heatmap' ? STYLE_FLAT : STYLE_3D
const styleKeyForMode = (m: BaseMode): string =>
  m === 'historical' ? 'hist' : m === 'city3d' ? 'city3d' : 'flat'

const KIND_COLOR: Record<MapEventKind, string> = { birth: '#22c55e', marriage: '#6366f1', death: '#ef4444' }
const KIND_ORDER: Record<MapEventKind, number> = { birth: 0, marriage: 1, death: 2 }
const FONT = ['Noto Sans Regular']

/** filterByDate throws if the style isn't fully loaded — guard every call. */
function safeFilterByDate(map: maplibregl.Map, year: string): void {
  try {
    // Don't gate on isStyleLoaded(): when a person is shown the migration
    // animation keeps a source perpetually "loading", so isStyleLoaded() stays
    // false and the year filter would never apply. The layers exist once the
    // style is set; the try/catch covers the brief mid-swap window.
    if (map.getStyle()?.layers?.length) filterByDate(map, year)
  } catch {
    /* style mid-swap — ignore, buildLayers re-applies on styledata */
  }
}

interface MEvent {
  kind: MapEventKind
  personId: string
  personName: string
  surname: string
  year: number | null
  lat: number
  lon: number
  place: string
}

// Canvas-generated teardrop pins — crisp at any zoom and clearly visible even
// over 3D buildings (unlike tiny circle dots).
const PIN_CACHE: Record<string, ImageData> = {}
function makePin(color: string): ImageData {
  if (PIN_CACHE[color]) return PIN_CACHE[color]
  const W = 52
  const H = 68
  const s = 2
  const c = document.createElement('canvas')
  c.width = W * s
  c.height = H * s
  const ctx = c.getContext('2d')!
  ctx.scale(s, s)
  const cx = W / 2
  const cy = W / 2
  const r = W / 2 - 7
  // Drop shadow on the silhouette.
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 5
  ctx.shadowOffsetY = 3
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx, H - 3)
  ctx.lineTo(cx - r * 0.8, cy + r * 0.5)
  ctx.lineTo(cx + r * 0.8, cy + r * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // White ring + inner dot.
  ctx.lineWidth = 3.5
  ctx.strokeStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2)
  ctx.fill()
  const img = ctx.getImageData(0, 0, W * s, H * s)
  PIN_CACHE[color] = img
  return img
}

/** Sweeping bezier arc through a person's chronological event coordinates. */
function arcFeature(points: [number, number][], personName: string): Feature<LineString> | null {
  if (points.length < 2) return null
  const coords: number[][] = []
  for (let i = 0; i < points.length; i++) {
    coords.push(points[i])
    if (i < points.length - 1) {
      const [ax, ay] = points[i]
      const [bx, by] = points[i + 1]
      const dx = bx - ax
      const dy = by - ay
      coords.push([(ax + bx) / 2 - dy * 0.18, (ay + by) / 2 + dx * 0.18])
    }
  }
  const spline = bezierSpline(lineString(coords), { resolution: 12000, sharpness: 0.9 }) as Feature<LineString>
  spline.properties = { name: personName, _len: length(spline, { units: 'kilometers' }) }
  return spline
}

export function GenealogyMap(): JSX.Element {
  const { t, i18n } = useTranslation()
  const theme = useTheme((s) => s.theme)
  const people = useAppStore((s) => s.people)
  const families = useAppStore((s) => s.families)
  const defaultRootId = useAppStore((s) => s.defaultRootId)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const mapFocusNonce = useAppStore((s) => s.mapFocusNonce)
  const selectRef = useRef(selectPerson)
  selectRef.current = selectPerson

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [offline, setOffline] = useState(false)
  // Opening the map via a profile's "Show on map" starts it directly in the
  // period view, so there's no 3D→historical flash (and no race that would skip
  // the date filter / the jump-to-person).
  // Restore the last view settings (mode, filters, selected person) — unless we
  // were opened via a profile's "Show on map", which takes over the view.
  const savedView = useRef(loadMapSettings()).current
  const fromFocus = !!useAppStore.getState().mapFocusPersonId
  const validMode = (m: unknown): m is BaseMode =>
    m === 'city3d' || m === 'flat' || m === 'historical' || m === 'heatmap'
  const [mode, setMode] = useState<BaseMode>(() =>
    fromFocus ? 'historical' : validMode(savedView.mode) ? savedView.mode : 'city3d'
  )
  const modeRef = useRef(mode)
  modeRef.current = mode
  // Which base map style is currently loaded (flat & heatmap share it), so a
  // flat↔heatmap toggle just shows/hides the density layer instead of a teardown.
  const prevStyleKey = useRef(styleKeyForMode(mode))

  // ---- Data pipeline ----
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const [markersVersion, setMarkersVersion] = useState(0)
  // Limit the map to the starting person's blood relatives (drop married-in
  // spouses and their imported ancestry, which otherwise clutter the map).
  const [bloodOnly, setBloodOnly] = useState(false)
  const bloodSet = useMemo<Set<string> | null>(
    () =>
      bloodOnly
        ? scopePeople(people, families, { scope: 'blood', rootId: defaultRootId ?? undefined, includeSpouses: false }).ids
        : null,
    [bloodOnly, people, families, defaultRootId]
  )
  useEffect(() => {
    window.api.map?.markers().then(setMarkers)
  }, [people, families, markersVersion])

  // ---- Bulk geocoding of imported place names ----
  const [geocoding, setGeocoding] = useState(false)
  const [geoProg, setGeoProg] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const runGeocode = async (): Promise<void> => {
    if (geocoding) return
    setGeocoding(true)
    setGeoProg({ done: 0, total: 0 })
    const unsub = window.api.geo.onGeocodeProgress((p) => setGeoProg({ done: p.done, total: p.total }))
    try {
      await window.api.geo.geocodeAll()
      setMarkersVersion((v) => v + 1) // refresh markers with the new coordinates
    } finally {
      unsub()
      setGeocoding(false)
    }
  }

  const surnameById = useMemo(() => new Map(people.map((p) => [p.id, p.surname || '—'])), [people])
  // Locale-aware display names (Hungarian = surname first), so map labels/popups
  // match the rest of the app rather than the backend-combined order.
  const nameById = useMemo(() => new Map(people.map((p) => [p.id, fullName(p)])), [people])
  const allEvents = useMemo<MEvent[]>(
    () =>
      markers.flatMap((m) =>
        m.events.map((e) => ({
          kind: e.kind,
          personId: e.personId,
          personName: nameById.get(e.personId) || e.personName,
          surname: surnameById.get(e.personId) || '—',
          year: e.year ? Number(e.year) || null : null,
          lat: m.lat,
          lon: m.lon,
          place: m.name
        }))
      ),
    [markers, surnameById, nameById]
  )

  const [minYear, maxYear] = useMemo(() => {
    const ys = allEvents.map((e) => e.year).filter((y): y is number => y != null)
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : [1700, 2026]
  }, [allEvents])

  const [range, setRange] = useState<[number, number]>([minYear, maxYear])
  useEffect(() => setRange([minYear, maxYear]), [minYear, maxYear])
  // Decoupled OHM tile year — drives ONLY the historical base map borders.
  const [tileYear, setTileYear] = useState(maxYear)
  useEffect(() => setTileYear(maxYear), [maxYear])
  const tileYearRef = useRef(tileYear)
  tileYearRef.current = tileYear

  // ---- Tour mode (guided journey along a predefined route) ----
  const tourLang = (['hu', 'en', 'de'].includes(i18n.language) ? i18n.language : 'hu') as TourLang
  const [tourSetupOpen, setTourSetupOpen] = useState(false)
  const [tourSteps, setTourSteps] = useState<TourStep[]>([])
  const [tourIndex, setTourIndex] = useState(0)
  const [tourHist, setTourHist] = useState<Map<string, TourHistItem[]>>(new Map())
  const [tourHistLoading, setTourHistLoading] = useState(false)
  const touring = tourSteps.length > 0
  const coordsByPerson = useMemo(() => {
    const m = new Map<string, TourPlace>()
    for (const e of allEvents) {
      if (!m.has(e.personId) || e.kind === 'birth') m.set(e.personId, { lat: e.lat, lon: e.lon, place: e.place, year: e.year })
    }
    return m
  }, [allEvents])

  const startTour = (startId: string): void => {
    setTourSetupOpen(false)
    const steps = buildPatrilineTour(people, families, startId, coordsByPerson, tourLang)
    if (!steps.length) return
    setTourHist(new Map())
    setTourSteps(steps)
    setTourIndex(0)
    setMode('historical')
  }
  const endTour = (): void => {
    setTourSteps([])
    setTourIndex(0)
    clearMapPerson()
  }

  const [kinds, setKinds] = useState<Record<MapEventKind, boolean>>(() => ({
    birth: savedView.kinds?.birth ?? true,
    marriage: savedView.kinds?.marriage ?? true,
    death: savedView.kinds?.death ?? true
  }))
  const [surnames, setSurnames] = useState<Set<string>>(() => new Set(savedView.surnames ?? []))
  const [showMigration, setShowMigration] = useState(() => !fromFocus && !!savedView.showMigration)
  const [panelOpen, setPanelOpen] = useState(() => savedView.panelOpen ?? true)
  // The previously-selected person (kept across visits) — but only if they still
  // exist, and not when "Show on map" is taking over the view.
  const restoredPerson =
    !fromFocus && savedView.personFilter && useAppStore.getState().peopleById.has(savedView.personFilter)
      ? savedView.personFilter
      : null
  const [personFilter, setPersonFilter] = useState<string | null>(restoredPerson)
  const [personQuery, setPersonQuery] = useState(() => (restoredPerson ? savedView.personQuery ?? '' : ''))
  const [personMenu, setPersonMenu] = useState(false)
  const [surnameQuery, setSurnameQuery] = useState('')

  // Persist the view settings + selected person whenever they change, so the next
  // visit to the map restores exactly where you were.
  useEffect(() => {
    saveMapSettings({
      mode,
      kinds,
      surnames: [...surnames],
      showMigration,
      panelOpen,
      personFilter,
      personQuery
    })
  }, [mode, kinds, surnames, showMigration, panelOpen, personFilter, personQuery])

  // Historical events (Wikidata) for the "what was happening" overlay + panel.
  const [histEvents, setHistEvents] = useState<HistEvent[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histPanelOpen, setHistPanelOpen] = useState(false)
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>([])
  const histEventsFC = useMemo(
    () =>
      featureCollection(
        histEvents.map((e) => point([e.lon, e.lat], { id: e.id, title: e.title, year: e.year ?? 0, url: e.url }))
      ),
    [histEvents]
  )
  const histRef = useRef(histEventsFC)
  histRef.current = histEventsFC

  const allSurnames = useMemo(
    () => [...new Set(allEvents.map((e) => e.surname))].filter((s) => s !== '—').sort(),
    [allEvents]
  )
  const mappedPeople = useMemo(() => {
    const ids = new Set(allEvents.map((e) => e.personId))
    return people.filter((p) => ids.has(p.id))
  }, [allEvents, people])
  const personMatches = useMemo(() => {
    const q = personQuery.trim()
    if (!q) return []
    const nq = norm(q)
    // Accent-insensitive match on the name, plus the birth place so you can
    // narrow same-named people by where they were born.
    return mappedPeople
      .filter((p) => norm(fullName(p)).includes(nq) || norm(p.birthPlace ?? '').includes(nq))
      .slice(0, 8)
  }, [mappedPeople, personQuery])

  const filtered = useMemo(
    () =>
      allEvents.filter((e) => {
        if (bloodSet && !bloodSet.has(e.personId)) return false
        if (!kinds[e.kind]) return false
        if (personFilter) return e.personId === personFilter
        return (
          (surnames.size === 0 || surnames.has(e.surname)) &&
          (e.year == null || (e.year >= range[0] && e.year <= range[1]))
        )
      }),
    [allEvents, kinds, surnames, range, personFilter, bloodSet]
  )

  const migActive = showMigration || !!personFilter
  const migActiveRef = useRef(migActive)
  migActiveRef.current = migActive

  // ---- GeoJSON sources ----
  const eventsFC = useMemo(() => {
    // Spread events that share the EXACT same coordinates (e.g. 20 people born
    // in the same village) onto a tiny spiral, so they all become visible when
    // you zoom in — instead of perfectly overlapping into a single dot.
    const seen = new Map<string, number>()
    return featureCollection(
      filtered.map((e) => {
        const key = `${e.lon.toFixed(5)},${e.lat.toFixed(5)}`
        const n = seen.get(key) ?? 0
        seen.set(key, n + 1)
        let lon = e.lon
        let lat = e.lat
        if (n > 0) {
          // ~12m per ring step — invisible when zoomed out, fans out up close.
          const ring = Math.ceil(Math.sqrt(n))
          const angle = n * 2.399963 // golden angle → even distribution
          const r = 0.00011 * ring
          lon += (r * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180)
          lat += r * Math.sin(angle)
        }
        return point([lon, lat], {
          kind: e.kind,
          personId: e.personId,
          personName: e.personName,
          year: e.year,
          place: e.place
        })
      })
    )
  }, [filtered])
  const eventsRef = useRef(eventsFC)
  eventsRef.current = eventsFC

  const migFeatures = useMemo<Feature<LineString>[]>(() => {
    const byPerson = new Map<string, { name: string; evs: MEvent[] }>()
    for (const e of filtered) {
      const entry = byPerson.get(e.personId) ?? { name: e.personName, evs: [] }
      entry.evs.push(e)
      byPerson.set(e.personId, entry)
    }
    const out: Feature<LineString>[] = []
    for (const { name, evs } of byPerson.values()) {
      const ordered = evs.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.year ?? 0) - (b.year ?? 0))
      const pts: [number, number][] = []
      for (const e of ordered) {
        const last = pts[pts.length - 1]
        if (!last || last[0] !== e.lon || last[1] !== e.lat) pts.push([e.lon, e.lat])
      }
      const f = arcFeature(pts, name)
      if (f) out.push(f)
    }
    return out
  }, [filtered])
  const migRef = useRef<Feature<LineString>[]>([])
  migRef.current = migFeatures

  const selectedFC = useMemo(
    () => featureCollection(personFilter ? filtered.filter((e) => e.personId === personFilter).map((e) => point([e.lon, e.lat])) : []),
    [filtered, personFilter]
  )
  const selectedRef = useRef(selectedFC)
  selectedRef.current = selectedFC

  // ---- (Re)build all custom layers on top of whatever base style is loaded ----
  function buildLayers(map: maplibregl.Map): void {
    const styleRoot = map.getStyle()
    if (!styleRoot) return // mid-swap — will be retried on the next styledata/idle
    // 3D buildings + atmospheric sky (only in the city mode).
    if (modeRef.current === 'city3d') {
      map.setSky({
        'sky-color': '#0b1220',
        'sky-horizon-blend': 0.6,
        'horizon-color': '#5b6b8c',
        'horizon-fog-blend': 0.6,
        'fog-color': theme === 'dark' ? '#0b1220' : '#cdd6e6',
        'fog-ground-blend': 0.7,
        'atmosphere-blend': 0.8
      })
      // Derive the building vector source from the style itself (don't assume a
      // source id) so 3D works regardless of the base style's internals.
      const buildingLayer = styleRoot.layers?.find(
        (l) => (l as { 'source-layer'?: string })['source-layer'] === 'building' && 'source' in l
      ) as { source?: string } | undefined
      const buildingSource = buildingLayer?.source
      if (!map.getLayer('tm-buildings') && buildingSource && map.getSource(buildingSource)) {
        // Insert below the first symbol layer so labels stay readable.
        const firstSymbol = styleRoot.layers?.find((l) => l.type === 'symbol')?.id
        map.addLayer(
          {
            id: 'tm-buildings',
            type: 'fill-extrusion',
            source: buildingSource,
            'source-layer': 'building',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': [
                'interpolate', ['linear'], ['get', 'render_height'],
                0, theme === 'dark' ? '#2a3550' : '#d9dfec',
                60, theme === 'dark' ? '#3c4a72' : '#aeb8d6',
                200, theme === 'dark' ? '#5566a0' : '#8a97c4'
              ],
              'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['get', 'render_height']],
              'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 15.5, ['get', 'render_min_height']],
              'fill-extrusion-opacity': 0.9
            }
          },
          firstSymbol
        )
      }
    } else {
      map.setPitch(0)
    }

    if (!map.getSource('events'))
      map.addSource('events', { type: 'geojson', data: eventsRef.current, cluster: true, clusterRadius: 38, clusterMaxZoom: 7 })
    // Un-clustered copy of the same points, feeding the density heatmap.
    if (!map.getSource('heat')) map.addSource('heat', { type: 'geojson', data: eventsRef.current })
    if (!map.getSource('histevents')) map.addSource('histevents', { type: 'geojson', data: histRef.current })
    if (!map.getSource('migration')) map.addSource('migration', { type: 'geojson', data: featureCollection([]) })
    if (!map.getSource('comet')) map.addSource('comet', { type: 'geojson', data: featureCollection([]) })
    if (!map.getSource('selected')) map.addSource('selected', { type: 'geojson', data: selectedRef.current })

    // Migration ribbons — bright, bold, glowing.
    if (!map.getLayer('mig-glow'))
      map.addLayer({ id: 'mig-glow', type: 'line', source: 'migration', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#38bdf8', 'line-width': 16, 'line-blur': 10, 'line-opacity': 0.35 } })
    if (!map.getLayer('mig-core'))
      map.addLayer({ id: 'mig-core', type: 'line', source: 'migration', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#e0f2fe', 'line-width': 3.4, 'line-opacity': 1 } })
    if (!map.getLayer('comet'))
      map.addLayer({ id: 'comet', type: 'circle', source: 'comet', paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-blur': 0.3, 'circle-stroke-color': '#38bdf8', 'circle-stroke-width': 2, 'circle-opacity': 1 } })

    // Density heatmap (hidden unless in heatmap mode — see applyModeVisibility).
    if (!map.getLayer('heat'))
      map.addLayer({
        id: 'heat',
        type: 'heatmap',
        source: 'heat',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 10, 6, 24, 12, 42],
          'heatmap-opacity': 0.82,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(33,102,172,0)',
            0.2,
            'rgb(103,169,207)',
            0.4,
            'rgb(166,217,106)',
            0.6,
            'rgb(255,221,90)',
            0.8,
            'rgb(253,141,60)',
            1,
            'rgb(227,26,28)'
          ]
        }
      })

    // Selected-person highlight halo (under the pins).
    if (!map.getLayer('sel-halo'))
      map.addLayer({ id: 'sel-halo', type: 'circle', source: 'selected', paint: { 'circle-radius': 24, 'circle-color': '#fbbf24', 'circle-blur': 0.6, 'circle-opacity': 0.6 } })

    // Bold teardrop pins per event kind.
    for (const [k, col] of [
      ['birth', KIND_COLOR.birth],
      ['marriage', KIND_COLOR.marriage],
      ['death', KIND_COLOR.death]
    ] as [string, string][])
      if (!map.hasImage(`pin-${k}`)) map.addImage(`pin-${k}`, makePin(col), { pixelRatio: 2 })

    if (!map.getLayer('pts'))
      map.addLayer({
        id: 'pts',
        type: 'symbol',
        source: 'events',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['concat', 'pin-', ['get', 'kind']],
          // Bigger when zoomed out so individual pins stay visible from afar.
          'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.85, 10, 0.55],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-pitch-alignment': 'viewport',
          'icon-rotation-alignment': 'viewport'
        }
      })

    // Clusters: bold gradient bubbles + count.
    if (!map.getLayer('clusters'))
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'events',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#6366f1', 25, '#8b5cf6', 100, '#d946ef'],
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
          'circle-radius': ['step', ['get', 'point_count'], 19, 10, 26, 50, 34]
        }
      })
    if (!map.getLayer('cluster-count'))
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'events', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': FONT, 'text-size': 14 }, paint: { 'text-color': '#ffffff' } })

    // Historical-event dots (amber, distinct from the genealogy pins).
    if (!map.getLayer('hist-glow'))
      map.addLayer({ id: 'hist-glow', type: 'circle', source: 'histevents', paint: { 'circle-radius': 14, 'circle-color': '#f59e0b', 'circle-blur': 1, 'circle-opacity': 0.5 } })
    if (!map.getLayer('hist-dot'))
      map.addLayer({ id: 'hist-dot', type: 'circle', source: 'histevents', paint: { 'circle-radius': 6, 'circle-color': '#f59e0b', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2, 'circle-opacity': 1 } })

    // Push current data.
    ;(map.getSource('events') as maplibregl.GeoJSONSource)?.setData(eventsRef.current)
    ;(map.getSource('heat') as maplibregl.GeoJSONSource)?.setData(eventsRef.current)
    ;(map.getSource('histevents') as maplibregl.GeoJSONSource)?.setData(histRef.current)
    ;(map.getSource('selected') as maplibregl.GeoJSONSource)?.setData(selectedRef.current)
    ;(map.getSource('migration') as maplibregl.GeoJSONSource)?.setData(featureCollection(migActiveRef.current ? migRef.current : []))
    if (modeRef.current === 'historical') safeFilterByDate(map, String(tileYearRef.current))
    applyModeVisibility(map, modeRef.current)
  }

  // ---- Map init (once) ----
  useEffect(() => {
    if (!containerRef.current) return
    // Restore the last camera so returning from a person's profile lands back on
    // the same view (the map unmounts on navigation, so this is what preserves it).
    const saved = loadCamera()
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleForMode(mode),
      center: saved?.center ?? [19.05, 47.5],
      zoom: saved?.zoom ?? 4.2,
      pitch: saved?.pitch ?? (mode === 'city3d' ? 55 : 0),
      bearing: saved?.bearing ?? (mode === 'city3d' ? -14 : 0),
      attributionControl: { compact: true },
      maxPitch: 75
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    mapRef.current = map
    // Remember the camera after any pan / zoom / tilt so the next visit restores it.
    map.on('moveend', () => {
      const c = map.getCenter()
      saveCamera({ center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() })
    })

    map.on('load', () => {
      buildLayers(map)
      localizeMapLabels(map, i18n.language)
      setReady(true)
    })
    // Re-apply custom layers whenever the base style is swapped.
    map.on('styledata', () => {
      if (map.isStyleLoaded()) {
        buildLayers(map)
        localizeMapLabels(map, i18n.language)
      }
    })
    // setStyle() wipes images added via addImage, but `hasImage` can still report
    // them as present — so the pin icons silently vanish after a base-map switch
    // (and never come back). Re-provide any missing pin on demand: the canonical
    // maplibre fix that keeps markers visible across every style change.
    map.on('styleimagemissing', (e) => {
      const id = e.id
      if (!id.startsWith('pin-') || map.hasImage(id)) return
      const col = KIND_COLOR[id.slice(4) as MapEventKind]
      if (col) map.addImage(id, makePin(col), { pixelRatio: 2 })
    })
    // Surface a genuinely broken base map (offline / blocked). Only core-style
    // failures count — NOT individual historical tiles, which 404 for sparse
    // areas and would otherwise raise a false "tiles didn't load" on a live map.
    map.on('error', (e) => {
      const msg = String((e as { error?: { message?: string } })?.error?.message ?? '')
      if (/openfreemap|sprite|glyph/i.test(msg)) setOffline(true)
    })
    map.on('idle', () => setOffline(false))
    map.on('sourcedata', (e) => {
      if ((e as { isSourceLoaded?: boolean }).isSourceLoaded) setOffline(false)
    })

    // Interactions registered ONCE (fire only once their layer exists).
    map.on('click', 'clusters', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]
      const id = f?.properties?.cluster_id
      if (id == null) return
      ;(map.getSource('events') as maplibregl.GeoJSONSource).getClusterExpansionZoom(id).then((z) => {
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z })
      })
    })
    map.on('click', 'pts', (e) => {
      const pid = e.features?.[0]?.properties?.personId
      if (pid) selectRef.current(String(pid))
    })
    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'tm-map-popup' })
    for (const layer of ['pts', 'clusters']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }
    map.on('mouseenter', 'pts', (e) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      hover
        .setLngLat((e.features![0].geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div style="font:600 12px sans-serif">${p.personName}</div><div style="font:11px sans-serif;opacity:.7">${p.place}${p.year ? ' · ' + p.year : ''}</div>`)
        .addTo(map)
    })
    map.on('mouseleave', 'pts', () => hover.remove())

    // Historical-event dots: hover shows the title/year, click opens Wikipedia.
    map.on('mouseenter', 'hist-dot', (e) => {
      map.getCanvas().style.cursor = 'pointer'
      const p = e.features?.[0]?.properties
      if (!p) return
      hover
        .setLngLat((e.features![0].geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<div style="font:600 12px sans-serif">🏛️ ${p.title}</div><div style="font:11px sans-serif;opacity:.7">${p.year || ''}</div>`
        )
        .addTo(map)
    })
    map.on('mouseleave', 'hist-dot', () => {
      map.getCanvas().style.cursor = ''
      hover.remove()
    })
    map.on('click', 'hist-dot', (e) => {
      const url = e.features?.[0]?.properties?.url
      if (url) void window.api.app.openExternal(String(url))
    })

    return () => {
      map.remove()
      mapRef.current = null
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Base-map switching ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    // flat & heatmap share the same base map → just toggle the density layer.
    const styleKey = styleKeyForMode(mode)
    if (prevStyleKey.current === styleKey) {
      applyModeVisibility(map, mode)
      return
    }
    prevStyleKey.current = styleKey
    map.setStyle(styleForMode(mode), { diff: false })
    // Only the 3D city view is tilted; flat, heatmap & historical are top-down.
    map.easeTo({ pitch: mode === 'city3d' ? 55 : 0, bearing: mode === 'city3d' ? -14 : 0, duration: 300 })
    // Re-add the custom layers once the new style settles. When a person is
    // shown the migration animation blocks `idle`, so also rebuild on the next
    // `styledata` (fired once, so applyModeVisibility can't loop it).
    const rebuild = (): void => {
      if (map.getStyle()?.layers?.length) buildLayers(map)
    }
    map.once('idle', rebuild)
    map.once('styledata', rebuild)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ---- Data updates ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('events') as maplibregl.GeoJSONSource)?.setData(eventsFC)
    ;(map.getSource('heat') as maplibregl.GeoJSONSource)?.setData(eventsFC)
  }, [eventsFC, ready])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('selected') as maplibregl.GeoJSONSource)?.setData(selectedFC)
  }, [selectedFC, ready])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('histevents') as maplibregl.GeoJSONSource)?.setData(histEventsFC)
  }, [histEventsFC, ready])

  // ---- Historical borders via the dedicated tile-year slider ----
  // Applies immediately when the style is loaded; right after a manual mode
  // switch the style is mid-swap and buildLayers re-applies it on `idle`.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || mode !== 'historical') return
    safeFilterByDate(map, String(tileYear))
  }, [tileYear, ready, mode])

  // ---- Migration + comet animation ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource('migration') as maplibregl.GeoJSONSource)?.setData(featureCollection(migActive ? migRef.current : []))
    if (!migActive) {
      ;(map.getSource('comet') as maplibregl.GeoJSONSource)?.setData(featureCollection([]))
      return
    }
    let raf = 0
    let tprog = 0
    const tick = (): void => {
      tprog = (tprog + 0.005) % 1
      const feats = migRef.current.slice(0, 80).map((f, i) => {
        const len = (f.properties?._len as number) || 1
        return along(f, ((tprog + i * 0.11) % 1) * len, { units: 'kilometers' })
      })
      ;(map.getSource('comet') as maplibregl.GeoJSONSource)?.setData(featureCollection(feats))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [migActive, migFeatures, ready])

  // ---- Actions ----
  const selectMapPerson = (id: string): void => {
    setPersonFilter(id)
    setPersonMenu(false)
    const p = people.find((pp) => pp.id === id)
    setPersonQuery(p ? fullName(p) : '')
    const evs = allEvents.filter((e) => e.personId === id)
    const map = mapRef.current
    if (map && evs.length) {
      const lons = evs.map((e) => e.lon)
      const lats = evs.map((e) => e.lat)
      map.fitBounds(new maplibregl.LngLatBounds([Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]), {
        padding: 160,
        maxZoom: 8,
        duration: 900
      })
    }
  }
  const clearMapPerson = (): void => {
    setPersonFilter(null)
    setPersonQuery('')
    setPersonMenu(false)
  }

  const loadHist = async (lat: number, lon: number, fromY: number, toY: number): Promise<void> => {
    setHistLoading(true)
    try {
      const evs = await window.api.wiki.eventsNear(lat, lon, fromY, toY, i18n.language)
      setHistEvents(evs)
      setHistPanelOpen(evs.length > 0)
    } catch {
      setHistEvents([])
    } finally {
      setHistLoading(false)
    }
  }

  // Tour playback: each step flies to the person's place, sets the historical map
  // to their era, highlights them, and lazily loads the era's world events.
  useEffect(() => {
    if (!touring || !ready) return
    const step = tourSteps[tourIndex]
    if (!step) return
    const map = mapRef.current
    if (map && step.lat != null && step.lon != null) {
      map.flyTo({ center: [step.lon, step.lat], zoom: 6.6, duration: 2600, essential: true })
    }
    const era = step.birthYear ?? step.deathYear
    if (era) setTileYear(era)
    setPersonFilter(step.personId)
    if (step.lat != null && step.lon != null && era != null && !tourHist.has(step.personId)) {
      setTourHistLoading(true)
      window.api.wiki
        .eventsNear(step.lat, step.lon, era - 15, era + 15, i18n.language)
        .then((evs) =>
          setTourHist((m) => new Map(m).set(step.personId, evs.map((e) => ({ title: e.title, year: e.year }))))
        )
        .catch(() => setTourHist((m) => new Map(m).set(step.personId, [])))
        .finally(() => setTourHistLoading(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourIndex, touring, ready])

  // "Show on map" from a profile: focus the person, switch to the period map at
  // their era, and load nearby historical events. Consumed (cleared) so a later
  // plain visit to the map doesn't re-trigger it.
  useEffect(() => {
    if (!ready) return
    const pid = useAppStore.getState().mapFocusPersonId
    if (!pid) return
    useAppStore.setState({ mapFocusPersonId: undefined })
    selectMapPerson(pid)
    const evs = allEvents.filter((e) => e.personId === pid)
    const years = evs.map((e) => e.year).filter((y): y is number => y != null)
    if (!evs.length || !years.length) return
    const minY = Math.min(...years)
    const maxY = Math.max(...years)
    setMode('historical')
    setTileYear(Math.round((minY + maxY) / 2))
    const lat = evs.reduce((a, e) => a + e.lat, 0) / evs.length
    const lon = evs.reduce((a, e) => a + e.lon, 0) / evs.length
    // Curated world events spanning the lifetime (wars etc. have no coordinate,
    // so they live in a separate panel section, not on the map).
    setWorldEvents(worldEventsInRange(minY, maxY))
    setHistPanelOpen(true)
    void loadHist(lat, lon, minY - 15, maxY + 15)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFocusNonce, ready])
  const resetView = (): void => {
    mapRef.current?.easeTo({ center: [19.05, 47.5], zoom: 4.2, pitch: mode === 'city3d' ? 55 : 0, bearing: mode === 'city3d' ? -14 : 0, duration: 800 })
  }
  const toggleSurname = (s: string): void =>
    setSurnames((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  const MODES: { key: BaseMode; icon: typeof Box; label: string }[] = [
    { key: 'city3d', icon: Box, label: t('map.base3d') },
    { key: 'flat', icon: Layers, label: t('map.baseFlat') },
    { key: 'historical', icon: Landmark, label: t('map.baseHistorical') },
    { key: 'heatmap', icon: Flame, label: t('map.baseHeatmap') }
  ]

  return (
    <div
      className={cn(
        'relative h-full w-full',
        theme === 'dark' && 'map-dark',
        mode === 'historical' && 'map-vintage'
      )}
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* ---- Base-map segmented switcher (top center) ---- */}
      <div className="glass-strong absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full p-1.5">
        {MODES.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={cn(
              'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all',
              mode === key ? 'bg-primary text-primary-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ---- Reset / orient ---- */}
      <button
        onClick={resetView}
        title={t('map.resetView')}
        className="glass-strong absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-2xl text-foreground transition-all hover:scale-105 hover:text-primary"
      >
        <Compass className="h-5 w-5" />
      </button>

      {/* ---- Historical-events panel (Wikidata) ---- */}
      {histLoading && (
        <div className="glass-strong absolute right-3 top-16 z-30 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-foreground">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          {t('map.histLoading')}
        </div>
      )}
      {!histLoading && (histEvents.length > 0 || worldEvents.length > 0) && !histPanelOpen && (
        <button
          onClick={() => setHistPanelOpen(true)}
          className="glass-strong absolute right-3 top-16 z-30 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground transition-transform hover:scale-105"
        >
          <Landmark className="h-4 w-4 text-amber-500" /> {histEvents.length + worldEvents.length}
        </button>
      )}
      {!histLoading && (histEvents.length > 0 || worldEvents.length > 0) && histPanelOpen && (
        <div className="glass-strong absolute right-3 top-16 z-30 flex max-h-[62vh] w-72 flex-col overflow-hidden rounded-2xl text-foreground">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Landmark className="h-4 w-4 text-amber-500" /> {t('map.histTitle')}
            </span>
            <button
              onClick={() => setHistPanelOpen(false)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              title={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {/* World events (wars etc.) — separate section, no map markers. */}
            {worldEvents.length > 0 && (
              <>
                <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  🌍 {t('map.histWorld')}
                </div>
                {worldEvents.map((e, i) => (
                  <div
                    key={`w${i}`}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
                  >
                    <span className="mt-px shrink-0 font-semibold tabular-nums text-sky-600">{worldEventYears(e)}</span>
                    <span className="flex-1 leading-snug">{worldEventTitle(e, i18n.language)}</span>
                  </div>
                ))}
              </>
            )}
            {/* Nearby events (Wikidata, geo-located → click to fly). */}
            {histEvents.length > 0 && (
              <>
                <div className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  📍 {t('map.histNearby')}
                </div>
                {histEvents.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => mapRef.current?.flyTo({ center: [e.lon, e.lat], zoom: 9, duration: 900 })}
                    title={e.title}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <span className="mt-px shrink-0 font-semibold tabular-nums text-amber-600">{e.year ?? '—'}</span>
                    <span className="flex-1 leading-snug">{e.title}</span>
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground">
            {t('map.histSource')}
          </div>
        </div>
      )}

      {/* ---- Control panel ---- */}
      <div className="glass-strong absolute left-3 top-3 z-30 flex max-h-[calc(100%-1.5rem)] w-80 flex-col overflow-hidden rounded-2xl text-foreground">
        <div className="space-y-3 overflow-y-auto p-4">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={personQuery}
              onChange={(e) => {
                setPersonQuery(e.target.value)
                setPersonMenu(true)
                if (personFilter) setPersonFilter(null)
              }}
              onFocus={() => setPersonMenu(true)}
              placeholder={t('map.searchPerson')}
              className="h-9 w-full rounded-xl border border-border/40 bg-background/50 pl-9 pr-8 text-sm outline-none transition-colors focus:border-primary/60"
            />
            {(personQuery || personFilter) && (
              <button
                onClick={clearMapPerson}
                title={t('map.clearPerson')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {personMenu && personMatches.length > 0 && !personFilter && (
              <div className="glass-strong absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl p-1">
                {personMatches.map((p) => {
                  const by = yearOf(p.birthDate)
                  const dy = yearOf(p.deathDate)
                  const span = by || dy ? `${by || '?'}${dy ? `–${dy}` : ''}` : ''
                  const meta = [span, p.birthPlace].filter(Boolean).join(' · ')
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectMapPerson(p.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <PersonAvatar personId={p.id} name={fullName(p)} sex={p.sex} className="h-6 w-6 shrink-0 text-[9px]" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-medium">{fullName(p)}</span>
                        {meta && <span className="truncate text-[10px] text-muted-foreground">{meta}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {personFilter && (
            <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
              <UserRound className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1 truncate font-medium">{t('map.onlyPerson', { name: personQuery })}</span>
              <button onClick={clearMapPerson} className="shrink-0 text-[11px] font-medium text-primary hover:underline">
                {t('map.clearPerson')}
              </button>
            </div>
          )}

          {/* Filters toggle */}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className="flex w-full items-center justify-between border-t border-border/40 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t('map.filters')}
            </span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', !panelOpen && '-rotate-90')} />
          </button>

          {/* Bloodline-only toggle — exclude married-in people + their ancestry. */}
          <button
            onClick={() => setBloodOnly((v) => !v)}
            title={t('map.bloodlineOnlyHint', { defaultValue: '' })}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              bloodOnly
                ? 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'border-border/40 text-muted-foreground hover:text-foreground'
            )}
          >
            <Droplet className="h-3.5 w-3.5" />
            {t('map.bloodlineOnly')}
            {bloodOnly && <span className="ml-auto text-[10px]">●</span>}
          </button>

          {panelOpen && (
            <div className="space-y-4">
              {/* Event kinds — double as a colour legend */}
              <div className="flex gap-1.5">
                {(['birth', 'marriage', 'death'] as MapEventKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKinds((p) => ({ ...p, [k]: !p[k] }))}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors',
                      kinds[k] ? 'border-transparent text-white' : 'border-border/40 bg-background/40 text-muted-foreground hover:text-foreground'
                    )}
                    style={kinds[k] ? { background: KIND_COLOR[k] } : undefined}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: kinds[k] ? '#fff' : KIND_COLOR[k] }} />
                    {t(`map.${k}`)}
                  </button>
                ))}
              </div>

              {/* Historical base-map year (decoupled) */}
              {mode === 'historical' && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5" />
                      {t('map.mapYear')}
                    </span>
                    <span className="tabular-nums text-foreground">{tileYear}</span>
                  </div>
                  <input
                    type="range"
                    min={minYear}
                    max={maxYear}
                    value={tileYear}
                    onChange={(e) => setTileYear(Number(e.target.value))}
                    className="tm-slider w-full cursor-pointer appearance-none bg-transparent"
                  />
                  <p className="mt-0.5 text-center text-[10px] text-muted-foreground">{t('map.bordersAt', { year: tileYear })}</p>
                </div>
              )}

              {/* Event-data time range */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {t('map.timeMachine')}
                </p>
                <TimeSlider min={minYear} max={maxYear} lo={range[0]} hi={range[1]} onChange={(lo, hi) => setRange([lo, hi])} />
                {personFilter && <p className="mt-1 text-center text-[10px] text-muted-foreground/70">{t('map.rangeIgnored')}</p>}
              </div>

              {/* Family / surname chips */}
              {allSurnames.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {t('map.families')}
                    </span>
                    {surnames.size > 0 && (
                      <button onClick={() => setSurnames(new Set())} className="text-[11px] font-medium text-primary hover:underline">
                        {t('map.clearSurnames')}
                      </button>
                    )}
                  </div>
                  <div className="relative mb-1.5">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={surnameQuery}
                      onChange={(e) => setSurnameQuery(e.target.value)}
                      placeholder={t('map.searchSurname')}
                      className="h-7 w-full rounded-xl border border-border/40 bg-background/50 pl-7 pr-2 text-xs outline-none focus:border-primary/60"
                    />
                  </div>
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {allSurnames
                      .filter((s) => {
                        const sq = surnameQuery.trim()
                        return !sq || norm(s).includes(norm(sq)) || matchesName(sq, s)
                      })
                      .map((s) => (
                        <button
                          key={s}
                          onClick={() => toggleSurname(s)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                            surnames.has(s)
                              ? 'border-primary bg-primary/20 text-primary'
                              : 'border-border/40 bg-background/40 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {s}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Migration toggle */}
              <button
                onClick={() => setShowMigration((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs font-medium transition-colors hover:bg-accent/40"
              >
                <span className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-sky-400" />
                  {t('map.migration')}
                </span>
                <span className={cn('flex h-4 w-7 items-center rounded-full p-0.5 transition-colors', showMigration ? 'bg-sky-500' : 'bg-muted')}>
                  <span className={cn('h-3 w-3 rounded-full bg-background shadow-sm transition-transform', showMigration && 'translate-x-3')} />
                </span>
              </button>

              {/* Bulk geocode imported places → markers */}
              <button
                onClick={runGeocode}
                disabled={geocoding}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs font-medium transition-colors hover:bg-accent/40 disabled:opacity-70"
              >
                <MapPin className={cn('h-4 w-4 text-emerald-400', geocoding && 'animate-pulse')} />
                {geocoding
                  ? t('map.geocoding', { done: geoProg.done, total: geoProg.total })
                  : t('map.geocode')}
              </button>

              <p className="text-center text-[10px] text-muted-foreground">{t('map.showingEvents', { count: filtered.length })}</p>
            </div>
          )}
        </div>
      </div>

      {offline && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
          <p className="rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-200 shadow-lg backdrop-blur">
            {t('map.offline')}
          </p>
        </div>
      )}

      {filtered.length === 0 && !touring && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <p className="glass-strong max-w-sm rounded-2xl px-4 py-3 text-center text-sm text-muted-foreground">{t('map.empty')}</p>
        </div>
      )}

      {/* Tour-mode launcher — hidden while a tour is running. */}
      {!touring && (
        <button
          onClick={() => setTourSetupOpen(true)}
          title={t('tour.title')}
          className="glass-strong absolute bottom-4 left-3 z-30 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground transition-transform hover:scale-105 hover:text-primary"
        >
          <Footprints className="h-4 w-4 text-primary" />
          {t('tour.title')}
        </button>
      )}

      <TourSetupModal
        open={tourSetupOpen}
        onOpenChange={setTourSetupOpen}
        people={people}
        defaultRootId={defaultRootId ?? undefined}
        onStart={startTour}
      />

      {touring && tourSteps[tourIndex] && (
        <TourOverlay
          step={tourSteps[tourIndex]}
          history={tourHist.get(tourSteps[tourIndex].personId) ?? []}
          loadingHistory={tourHistLoading && !tourHist.has(tourSteps[tourIndex].personId)}
          onPrev={() => setTourIndex((i) => Math.max(0, i - 1))}
          onNext={() => setTourIndex((i) => Math.min(tourSteps.length - 1, i + 1))}
          onClose={endTour}
          onSelect={(id) => selectRef.current(id)}
        />
      )}
    </div>
  )
}
