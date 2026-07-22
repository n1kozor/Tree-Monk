import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import maplibregl, { type Map as MLMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import historicalStyleRaw from '@openhistoricalmap/map-styles/dist/historical/historical.json'
import { filterByDate } from '@openhistoricalmap/maplibre-gl-dates'
import {
  Baby,
  Cross,
  Church,
  Compass,
  Flame,
  Heart,
  Home,
  Landmark,
  Layers as LayersIcon,
  Locate,
  MapPin,
  Minus,
  Mountain,
  Plus,
  Route,
  Search,
  Shovel,
  Sparkles,
  X
} from 'lucide-react'
import { cn, fullName, yearOf } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { useTheme } from '@/store/useTheme'
import { useAtlasSettings } from '@/store/useAtlasSettings'
import { PersonAvatar } from '@/components/common/PersonAvatar'
import type { AtlasKind, AtlasPoint } from '@shared/types'
import { PlacesManagerDialog } from './PlacesManagerDialog'

/**
 * Atlas — the map view, rebuilt from scratch.
 *
 * A full-bleed MapLibre canvas plotting every geocoded life event as
 * configurable layers (clustered markers / heatmap / migration paths) over
 * swappable basemaps: modern vector (OpenFreeMap), dark raster (Carto), and the
 * OpenHistoricalMap period map whose borders follow the year filter. 3D mode
 * adds terrain, sky and real building extrusions. Focusing one person turns
 * the map into their life journey — everyone else disappears and their stops
 * (birth, residences, marriages, death…) run in chronological order, numbered
 * on the map, animated along the route, and listed in a timeline panel.
 */

// ---- Event-kind palette (concrete colors — the GL canvas can't read CSS vars) ----
const KIND_COLOR: Record<AtlasKind, string> = {
  birth: '#10b981',
  christening: '#0ea5e9',
  marriage: '#f43f5e',
  residence: '#f59e0b',
  death: '#64748b',
  burial: '#8b5cf6',
  other: '#14b8a6'
}
const KIND_ICON: Record<AtlasKind, typeof Baby> = {
  birth: Baby,
  christening: Church,
  marriage: Heart,
  residence: Home,
  death: Cross,
  burial: Shovel,
  other: Sparkles
}
const KINDS: AtlasKind[] = ['birth', 'christening', 'marriage', 'residence', 'death', 'burial', 'other']

// ---- Basemaps ----
// Modern vector styles come from OpenFreeMap (no key; own working glyphs;
// "liberty" carries building heights → real 3D extrusions). The period map is
// the OpenHistoricalMap style whose features are filtered by year.
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron'
const STYLE_LIBERTY = 'https://tiles.openfreemap.org/styles/liberty'
const STYLE_HISTORICAL = historicalStyleRaw as unknown as StyleSpecification
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']

/** Key-free dark raster style (Carto) with a verified glyph endpoint. */
function darkRasterStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: OFM_GLYPHS,
    sources: {
      base: {
        type: 'raster',
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`),
        tileSize: 256,
        attribution: '© OpenStreetMap contributors © CARTO'
      }
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }]
  }
}

interface ResolvedStyle {
  key: string
  style: string | StyleSpecification
  /** Font stack that provably exists on this style's glyph server. */
  font: string
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection

/** Chronological sort: year → raw date → life-stage weight (birth first, burial last). */
const STAGE_WEIGHT: Record<AtlasKind, number> = {
  birth: 0,
  christening: 1,
  marriage: 2,
  residence: 2,
  other: 2,
  death: 8,
  burial: 9
}
function chronoSort(points: AtlasPoint[]): AtlasPoint[] {
  return [...points].sort((a, b) => {
    const ya = a.year ?? (STAGE_WEIGHT[a.kind] <= 1 ? -1 : 9999)
    const yb = b.year ?? (STAGE_WEIGHT[b.kind] <= 1 ? -1 : 9999)
    if (ya !== yb) return ya - yb
    const da = (a.date ?? '').localeCompare(b.date ?? '')
    if (da !== 0) return da
    return STAGE_WEIGHT[a.kind] - STAGE_WEIGHT[b.kind]
  })
}

/** filterByDate throws while a style is still loading — guard every call. */
function safeFilterByDate(map: MLMap, year: number): void {
  try {
    if (map.getStyle()?.layers?.length) filterByDate(map, String(year))
  } catch {
    /* style mid-swap — the next rebuild re-applies */
  }
}

export function AtlasView(): JSX.Element {
  const { t } = useTranslation()
  const theme = useTheme((s) => s.theme)
  const people = useAppStore((s) => s.people)
  const selectPerson = useAppStore((s) => s.selectPerson)
  const mapFocusPersonId = useAppStore((s) => s.mapFocusPersonId)
  const mapFocusNonce = useAppStore((s) => s.mapFocusNonce)
  const settings = useAtlasSettings()

  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const [points, setPoints] = useState<AtlasPoint[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [personQ, setPersonQ] = useState('')
  const [personMenu, setPersonMenu] = useState(false)
  const [geoProg, setGeoProg] = useState<{ done: number; total: number } | null>(null)
  const [placesOpen, setPlacesOpen] = useState(false)
  const dashRaf = useRef<number | undefined>(undefined)
  const fittedOnce = useRef(false)

  // ---- Data ----
  const loadPoints = useCallback(() => {
    void window.api.atlas
      .points()
      .then(setPoints)
      .catch(() => setPoints([]))
  }, [])
  useEffect(loadPoints, [loadPoints, people])

  // Follow "show on map" requests from the person panel: focus the person,
  // switch to the period (historical) basemap and set the time window to
  // their lifespan — so the map truly shows THEIR era. Nonce-guarded: only
  // the button press forces this, afterwards the user can switch freely.
  const lastFocusNonce = useRef(0)
  useEffect(() => {
    if (!mapFocusPersonId || mapFocusNonce === lastFocusNonce.current) return
    lastFocusNonce.current = mapFocusNonce
    setFocusId(mapFocusPersonId)
    const p = people.find((x) => x.id === mapFocusPersonId)
    const b = Number(yearOf(p?.birthDate ?? null)) || null
    const d = Number(yearOf(p?.deathDate ?? null)) || null
    // The period map follows the TOP of the window — anchor it to the BIRTH
    // year, so the map shows the world they were born into.
    const era = b ?? (d ? d - 60 : null)
    useAtlasSettings.getState().set({
      basemap: 'historical',
      ...(era ? { yearFrom: null, yearTo: era } : {})
    })
  }, [mapFocusPersonId, mapFocusNonce, people])

  const yearBounds = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const p of points) {
      if (p.year) {
        if (p.year < min) min = p.year
        if (p.year > max) max = p.year
      }
    }
    return min <= max ? { min, max } : { min: 1700, max: new Date().getFullYear() }
  }, [points])
  const yFrom = settings.yearFrom ?? yearBounds.min
  const yTo = settings.yearTo ?? yearBounds.max

  // Focus mode shows ONLY the focused person — everyone else disappears from
  // every layer (markers, heat, paths). Kind toggles still apply, but the year
  // window does NOT clip the focused person: in focus mode it drives the
  // period basemap (anchored to their birth year), not their life events.
  const filtered = useMemo(
    () =>
      points.filter((p) => {
        if (focusId && p.personId !== focusId) return false
        if (!settings.kinds[p.kind]) return false
        if (!focusId && p.year && (p.year < yFrom || p.year > yTo)) return false
        return true
      }),
    [points, settings.kinds, yFrom, yTo, focusId]
  )

  const journey = useMemo(() => {
    if (!focusId) return []
    return chronoSort(points.filter((p) => p.personId === focusId))
  }, [points, focusId])

  const focusPerson = focusId ? people.find((p) => p.id === focusId) : undefined

  // ---- GeoJSON builders ----
  const pointsFC = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: filtered.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          kind: p.kind,
          color: KIND_COLOR[p.kind],
          personId: p.personId,
          personName: p.personName,
          year: p.year ?? '',
          place: p.place,
          detail: p.detail ?? ''
        }
      }))
    }),
    [filtered]
  )

  const linesFC = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!settings.showPaths || focusId) return EMPTY_FC // focus mode draws the journey instead
    const byPerson = new Map<string, AtlasPoint[]>()
    for (const p of filtered) {
      const arr = byPerson.get(p.personId) ?? []
      arr.push(p)
      byPerson.set(p.personId, arr)
    }
    const features: GeoJSON.Feature[] = []
    for (const arr of byPerson.values()) {
      const path = chronoSort(arr).filter(
        (p, i, a) => i === 0 || p.lat !== a[i - 1].lat || p.lon !== a[i - 1].lon
      )
      if (path.length < 2) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: path.map((p) => [p.lon, p.lat]) },
        properties: {}
      })
    }
    return { type: 'FeatureCollection', features }
  }, [filtered, settings.showPaths, focusId])

  const journeyFC = useMemo<{ line: GeoJSON.FeatureCollection; stops: GeoJSON.FeatureCollection }>(() => {
    const stops = journey.filter(
      (p, i, a) => i === 0 || p.lat !== a[i - 1].lat || p.lon !== a[i - 1].lon || p.kind !== a[i - 1].kind
    )
    return {
      line:
        stops.length >= 2
          ? {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: stops.map((p) => [p.lon, p.lat]) },
                  properties: {}
                }
              ]
            }
          : EMPTY_FC,
      stops: {
        type: 'FeatureCollection',
        features: stops.map((p, i) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: { n: i + 1, color: KIND_COLOR[p.kind] }
        }))
      }
    }
  }, [journey])

  // ---- Basemap resolution ----
  // 3D over the modern basemaps switches to "liberty" (building heights).
  const resolved = useMemo<ResolvedStyle>(() => {
    const b = settings.basemap
    if (b === 'historical')
      return { key: 'historical', style: STYLE_HISTORICAL, font: 'OpenHistorical Bold' }
    const dark = b === 'dark' || (b === 'auto' && theme === 'dark')
    if (settings.mode === '3d') return { key: 'liberty', style: STYLE_LIBERTY, font: 'Noto Sans Bold' }
    if (dark) return { key: 'dark', style: darkRasterStyle(), font: 'Noto Sans Bold' }
    return { key: 'light', style: STYLE_LIGHT, font: 'Noto Sans Bold' }
  }, [settings.basemap, settings.mode, theme])
  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved

  /**
   * Builds every atlas source + layer from scratch, with the data inline.
   * Sources created empty inside MapLibre's load events proved unreliable
   * (worker-poisoned, rendered nothing) — creating them lazily WITH their
   * data, and rebuilding on any change, is rock solid.
   */
  // Data version: bumped on every input change; ensure() rebuilds only when
  // the applied version is stale, so the styledata storm terminates (the old
  // map's proven idempotent-on-styledata architecture).
  const dataVer = useRef(0)
  const appliedVer = useRef(-1)
  const ensureRef = useRef<() => void>(() => undefined)
  ensureRef.current = (): void => {
    const map = mapRef.current
    // Style object present is enough — addSource/addLayer work while tiles load.
    if (!map || !map.getStyle()?.layers?.length) return
    const font = resolvedRef.current.font
    const fresh = appliedVer.current !== dataVer.current || !map.getSource('points')
    if (!fresh) return
    appliedVer.current = dataVer.current

    for (const id of [
      'atlas-heat',
      'atlas-lines',
      'atlas-clusters',
      'atlas-cluster-count',
      'atlas-pts',
      'atlas-pts-hit',
      'atlas-journey',
      'atlas-journey-dash',
      'atlas-jstops',
      'atlas-jstop-nums',
      'atlas-buildings'
    ])
      if (map.getLayer(id)) map.removeLayer(id)
    for (const id of ['points', 'heat', 'lines', 'journey', 'jstops'])
      if (map.getSource(id)) map.removeSource(id)

    // Terrain sources (hosted styles don't carry them).
    if (!map.getSource('dem'))
      map.addSource('dem', {
        type: 'raster-dem',
        tiles: DEM_TILES,
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 13,
        // The AWS Terrain Tiles dataset requires crediting its DEM sources.
        attribution: 'Terrain: Mapzen/AWS Terrain Tiles (SRTM/NASA, GMTED, ETOPO1)'
      })

    // Period map follows the TO end of the year window.
    if (resolvedRef.current.key === 'historical') safeFilterByDate(map, yTo)

    // 3D buildings — derive the vector source from the style itself (liberty
    // carries render_height; other styles simply have no 'building' layer).
    if (settings.mode === '3d') {
      const styleRoot = map.getStyle()
      const buildingLayer = styleRoot?.layers?.find(
        (l) => (l as { 'source-layer'?: string })['source-layer'] === 'building' && 'source' in l
      ) as { source?: string } | undefined
      const firstSymbol = styleRoot?.layers?.find((l) => l.type === 'symbol')?.id
      if (buildingLayer?.source && map.getSource(buildingLayer.source)) {
        map.addLayer(
          {
            id: 'atlas-buildings',
            type: 'fill-extrusion',
            source: buildingLayer.source,
            'source-layer': 'building',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['get', 'render_height'],
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
    }

    map.addSource('heat', { type: 'geojson', data: settings.showHeat ? pointsFC : EMPTY_FC })
    map.addSource('lines', { type: 'geojson', data: linesFC })
    map.addSource('points', {
      type: 'geojson',
      data: settings.showMarkers ? pointsFC : EMPTY_FC,
      cluster: settings.cluster && !focusId,
      clusterRadius: 44,
      clusterMaxZoom: 11
    })
    map.addSource('journey', { type: 'geojson', data: journeyFC.line, lineMetrics: true })
    map.addSource('jstops', { type: 'geojson', data: journeyFC.stops })

    map.addLayer({
      id: 'atlas-heat',
      type: 'heatmap',
      source: 'heat',
      paint: {
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 18, 10, 34],
        'heatmap-intensity': 0.8,
        'heatmap-opacity': 0.75,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(20,184,166,0)',
          0.25, 'rgba(20,184,166,0.35)',
          0.5, 'rgba(16,185,129,0.55)',
          0.75, 'rgba(245,158,11,0.75)',
          1, 'rgba(244,63,94,0.9)'
        ]
      }
    })
    map.addLayer({
      id: 'atlas-lines',
      type: 'line',
      source: 'lines',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#14b8a6', 'line-width': 1.4, 'line-opacity': 0.35 }
    })
    map.addLayer({
      id: 'atlas-clusters',
      type: 'circle',
      source: 'points',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#0d9488',
        'circle-opacity': 0.85,
        'circle-radius': ['step', ['get', 'point_count'], 14, 25, 19, 100, 25],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.85)'
      }
    })
    map.addLayer({
      id: 'atlas-cluster-count',
      type: 'symbol',
      source: 'points',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': [font],
        'text-size': 12
      },
      paint: { 'text-color': '#ffffff' }
    })
    map.addLayer({
      id: 'atlas-pts',
      type: 'circle',
      source: 'points',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 10, 7.5],
        'circle-stroke-width': 1.6,
        'circle-stroke-color': 'rgba(255,255,255,0.9)'
      }
    })
    // Invisible, generous hit-halo so the small dots are easy to hover and click
    // (the visible circles stay small). All point interactions target this layer.
    map.addLayer({
      id: 'atlas-pts-hit',
      type: 'circle',
      source: 'points',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 12, 10, 16]
      }
    })
    map.addLayer({
      id: 'atlas-journey',
      type: 'line',
      source: 'journey',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-width': 3.5,
        'line-gradient': [
          'interpolate',
          ['linear'],
          ['line-progress'],
          0, '#10b981',
          0.55, '#f59e0b',
          1, '#64748b'
        ]
      }
    })
    map.addLayer({
      id: 'atlas-journey-dash',
      type: 'line',
      source: 'journey',
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': 'rgba(255,255,255,0.9)',
        'line-width': 1.6,
        'line-dasharray': [0, 3, 2]
      }
    })
    map.addLayer({
      id: 'atlas-jstops',
      type: 'circle',
      source: 'jstops',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': 11,
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff'
      }
    })
    map.addLayer({
      id: 'atlas-jstop-nums',
      type: 'symbol',
      source: 'jstops',
      layout: {
        'text-field': ['to-string', ['get', 'n']],
        'text-font': [font],
        'text-size': 11,
        'text-allow-overlap': true
      },
      paint: { 'text-color': '#ffffff' }
    })

    // Terrain + sky belong to the freshly-built style too (the mode effect only
    // animates the pitch — applying here keeps the order race-free).
    try {
      if (settings.mode === '3d' && map.getSource('dem')) {
        map.setTerrain({ source: 'dem', exaggeration: 1.3 })
        try {
          map.setSky({
            'sky-color': theme === 'dark' ? '#0b1220' : '#87b2d9',
            'sky-horizon-blend': 0.6,
            'horizon-color': theme === 'dark' ? '#5b6b8c' : '#e8eef7',
            'horizon-fog-blend': 0.6,
            'fog-color': theme === 'dark' ? '#0b1220' : '#cdd6e6',
            'fog-ground-blend': 0.7,
            'atmosphere-blend': 0.8
          })
        } catch {
          /* older maplibre without sky */
        }
      } else {
        map.setTerrain(null)
      }
    } catch {
      /* terrain unavailable — stay flat */
    }
  }

  /** Marks the atlas data stale and re-applies it right away if possible. */
  const invalidate = useCallback((): void => {
    dataVer.current++
    ensureRef.current()
  }, [])

  // Create the map once.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || mapRef.current) return
    const map = new maplibregl.Map({
      container: el,
      style: resolvedRef.current.style as StyleSpecification,
      center: [12, 50],
      zoom: 4,
      // Always-visible attribution: the OSM/ODbL (and Carto/OHM) licences
      // require the credit to be VISIBLE, not hidden behind a compact ⓘ toggle.
      attributionControl: { compact: false },
      maxPitch: 72
    })
    mapRef.current = map
    // Exposed for e2e/debug probes (queryRenderedFeatures etc.).
    ;(window as unknown as { __atlasMap?: MLMap }).__atlasMap = map
    map.on('load', () => {
      setReady(true)
      ensureRef.current()
    })
    // styledata fires on every style mutation (incl. basemap swaps). ensure()
    // is versioned/idempotent, so re-running it here is cheap and terminates.
    map.on('styledata', () => ensureRef.current())

    map.on('click', 'atlas-clusters', (e) => {
      const f = e.features?.[0]
      if (!f) return
      const src = map.getSource('points') as maplibregl.GeoJSONSource
      void src.getClusterExpansionZoom(f.properties?.cluster_id).then((z) => {
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.5 })
      })
    })
    map.on('click', 'atlas-pts-hit', (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: ['atlas-pts-hit'] })
      if (!feats.length) return
      const box = document.createElement('div')
      box.className = 'space-y-1'
      const title = document.createElement('p')
      title.className = 'text-xs font-semibold'
      title.textContent = String(feats[0].properties?.place ?? '')
      box.appendChild(title)
      for (const f of feats.slice(0, 8)) {
        const row = document.createElement('button')
        row.className =
          'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] hover:bg-black/10'
        const dot = document.createElement('span')
        dot.style.cssText = `width:8px;height:8px;border-radius:99px;flex:none;background:${f.properties?.color}`
        const label = document.createElement('span')
        label.className = 'truncate'
        label.textContent = `${f.properties?.personName}${f.properties?.year ? ` · ${f.properties?.year}` : ''}`
        row.append(dot, label)
        const pid = String(f.properties?.personId ?? '')
        row.onclick = () => pid && selectPerson(pid)
        box.appendChild(row)
      }
      if (feats.length > 8) {
        const more = document.createElement('p')
        more.className = 'px-1 text-[10px] opacity-60'
        more.textContent = `+${feats.length - 8}`
        box.appendChild(more)
      }
      new maplibregl.Popup({ closeButton: false, maxWidth: '260px', className: 'tm-map-popup' })
        .setLngLat(e.lngLat)
        .setDOMContent(box)
        .addTo(map)
    })
    for (const layer of ['atlas-pts-hit', 'atlas-clusters']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }

    return () => {
      if (dashRaf.current) cancelAnimationFrame(dashRaf.current)
      // Null the ref FIRST so any concurrent effect (basemap swap, rebuild) bails
      // instead of touching a map mid-teardown.
      mapRef.current = null
      ;(window as unknown as { __atlasMap?: MLMap }).__atlasMap = undefined
      try {
        map.remove()
      } catch {
        /* MapLibre can throw an abort DOMException when the map is removed while
           its style/sprite is still loading (React StrictMode's mount→unmount in
           dev, or a very fast route switch) — harmless, it's going away anyway. */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Basemap swap (style replacement; our layers restored via style.load).
  const styleKey = useRef(resolved.key)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || styleKey.current === resolved.key) return
    styleKey.current = resolved.key
    try {
      map.setStyle(resolved.style as StyleSpecification)
    } catch {
      /* MapLibre throws "signal is aborted" if a basemap/theme swap lands while
         the previous style is still loading — the swap still applies, harmless. */
    }
  }, [resolved, ready])

  // Any data / visibility / cluster / focus change → rebuild the atlas layers.
  // A full rebuild is cheap at this data size and dodges MapLibre's flaky
  // setData-into-empty-source path entirely. Retries until the style is ready.
  useEffect(() => {
    invalidate()
  }, [pointsFC, linesFC, journeyFC, settings.showMarkers, settings.showHeat, settings.cluster, settings.mode, theme, invalidate])

  // The period map's year filter follows the TO end of the time window.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || resolved.key !== 'historical') return
    safeFilterByDate(map, yTo)
  }, [yTo, resolved.key, ready])

  // First fit: frame all plotted events once data arrives.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || fittedOnce.current || filtered.length === 0) return
    fittedOnce.current = true
    const b = new maplibregl.LngLatBounds()
    for (const p of filtered) b.extend([p.lon, p.lat])
    map.fitBounds(b, { padding: 80, maxZoom: 8, duration: 900 })
  }, [filtered, ready])

  // Focused journey: frame the route.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (journey.length > 0) {
      const b = new maplibregl.LngLatBounds()
      for (const p of journey) b.extend([p.lon, p.lat])
      map.fitBounds(b, { padding: { top: 90, right: 340, bottom: 90, left: 360 }, maxZoom: 10, duration: 1000 })
    }
  }, [journey, ready])

  // Marching dash along the journey line — the animated migration route.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (journeyFC.line.features.length === 0) return
    const seq = [
      [0, 4, 3],
      [0.5, 4, 2.5],
      [1, 4, 2],
      [1.5, 4, 1.5],
      [2, 4, 1],
      [2.5, 4, 0.5],
      [3, 4, 0],
      [0, 0.5, 3, 3.5]
    ]
    let step = 0
    let last = 0
    const tick = (now: number): void => {
      dashRaf.current = requestAnimationFrame(tick)
      if (now - last < 90) return
      last = now
      step = (step + 1) % seq.length
      if (map.getLayer('atlas-journey-dash'))
        map.setPaintProperty('atlas-journey-dash', 'line-dasharray', seq[step])
    }
    dashRaf.current = requestAnimationFrame(tick)
    return () => {
      if (dashRaf.current) cancelAnimationFrame(dashRaf.current)
    }
  }, [journeyFC, ready])

  // Flat ↔ 3D: terrain + sky + pitch (buildings are added in rebuild).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (settings.mode === '3d') map.easeTo({ pitch: 60, duration: 1200 })
    else map.easeTo({ pitch: 0, bearing: 0, duration: 900 })
  }, [settings.mode, ready, resolved.key, theme])

  // ---- Geocoding CTA (places table empty but people exist) ----
  const geocode = async (): Promise<void> => {
    if (!window.api.geo?.geocodeAll) return
    setGeoProg({ done: 0, total: 1 })
    const unsub = window.api.geo.onGeocodeProgress?.((p) => setGeoProg({ done: p.done, total: p.total }))
    try {
      await window.api.geo.geocodeAll()
    } finally {
      unsub?.()
      setGeoProg(null)
      loadPoints()
    }
  }

  const personMatches = useMemo(() => {
    const q = personQ.trim().toLowerCase()
    if (!q) return []
    return people.filter((p) => fullName(p).toLowerCase().includes(q)).slice(0, 40)
  }, [people, personQ])

  const kindCount = useMemo(() => {
    const m = new Map<AtlasKind, number>()
    for (const p of points) m.set(p.kind, (m.get(p.kind) ?? 0) + 1)
    return m
  }, [points])

  const S = settings
  const lifespan = (p: { birthDate: string | null; deathDate: string | null }): string => {
    const b = yearOf(p.birthDate)
    const d = yearOf(p.deathDate)
    return b || d ? `${b || '?'}–${d || ''}` : ''
  }

  return (
    <div
      className={cn('relative h-full w-full overflow-hidden', resolved.key === 'historical' && 'map-vintage')}
      data-testid="atlas"
    >
      <div ref={wrapRef} className="absolute inset-0" />

      {/* ---- Zoom / compass (bottom-right, glass) ---- */}
      <div className="glass-strong absolute bottom-6 right-3 z-10 flex flex-col overflow-hidden rounded-2xl">
        {[
          { icon: Plus, run: () => mapRef.current?.zoomIn() },
          { icon: Minus, run: () => mapRef.current?.zoomOut() },
          { icon: Compass, run: () => mapRef.current?.easeTo({ bearing: 0, pitch: S.mode === '3d' ? 60 : 0 }) },
          {
            icon: Locate,
            run: () => {
              fittedOnce.current = false
              setFocusId(null)
            }
          }
        ].map(({ icon: Icon, run }, i) => (
          <button
            key={i}
            onClick={run}
            className="flex h-9 w-9 items-center justify-center text-foreground/80 transition-colors hover:bg-accent/60 hover:text-primary"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {/* ---- Control rail (right, glass) ---- */}
      <div className="glass-strong absolute right-3 top-3 z-10 flex max-h-[calc(100%-6.5rem)] w-72 flex-col overflow-hidden rounded-2xl text-foreground">
        <div className="min-h-0 space-y-4 overflow-y-auto p-3.5">
          {/* Person focus — FIRST so the dropdown never needs scrolling. */}
          <section className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('atlas.journey')}
            </p>
            {focusPerson ? (
              <div className="flex items-center gap-2 rounded-xl bg-primary/10 p-1.5 ring-1 ring-primary/25">
                <PersonAvatar
                  personId={focusPerson.id}
                  name={fullName(focusPerson)}
                  sex={focusPerson.sex}
                  className="h-6 w-6 text-[9px]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{fullName(focusPerson)}</span>
                  <span className="block text-[10px] tabular-nums text-muted-foreground">
                    {lifespan(focusPerson)}
                  </span>
                </span>
                <button
                  onClick={() => setFocusId(null)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  title={t('common.close')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={personQ}
                  onChange={(e) => {
                    setPersonQ(e.target.value)
                    setPersonMenu(true)
                  }}
                  onFocus={() => setPersonMenu(true)}
                  placeholder={t('atlas.searchPerson')}
                  className="h-8 w-full rounded-xl border border-border/40 bg-background/50 pl-8 pr-2 text-xs outline-none transition-colors focus:border-primary/60"
                />
                {personMenu && personMatches.length > 0 && (
                  <div className="glass-strong absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl p-1">
                    {personMatches.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setFocusId(p.id)
                          setPersonQ('')
                          setPersonMenu(false)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs hover:bg-accent/60"
                      >
                        <PersonAvatar
                          personId={p.id}
                          name={fullName(p)}
                          sex={p.sex}
                          className="h-6 w-6 shrink-0 text-[8px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{fullName(p)}</span>
                          <span className="block text-[10px] tabular-nums text-muted-foreground">
                            {lifespan(p)}
                            {p.birthPlace ? ` · ${p.birthPlace}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Mode + basemap */}
          <section className="space-y-2">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/40 p-1">
              {(['flat', '3d'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => S.set({ mode: m })}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all',
                    S.mode === m
                      ? 'bg-background/80 text-primary shadow-[inset_0_1px_0_hsl(var(--glass-highlight)/0.4)] ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {m === 'flat' ? <MapPin className="h-3.5 w-3.5" /> : <Mountain className="h-3.5 w-3.5" />}
                  {t(m === 'flat' ? 'atlas.flat' : 'atlas.threeD')}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {(['auto', 'light', 'dark', 'historical'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => S.set({ basemap: b })}
                  className={cn(
                    'rounded-lg px-2 py-1 text-[10px] font-medium transition-colors',
                    S.basemap === b
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/25'
                      : 'bg-secondary/40 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(`atlas.base.${b}`)}
                </button>
              ))}
            </div>
          </section>

          {/* Layers */}
          <section className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <LayersIcon className="h-3 w-3" /> {t('atlas.layers')}
            </p>
            {(
              [
                { key: 'showMarkers', icon: MapPin, label: 'atlas.markers' },
                { key: 'showHeat', icon: Flame, label: 'atlas.heatmap' },
                { key: 'showPaths', icon: Route, label: 'atlas.paths' },
                { key: 'cluster', icon: Sparkles, label: 'atlas.clustering' }
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => {
                  const next = !S[key]
                  // The heatmap replaces the markers: turning it on switches
                  // markers + clustering off (and off brings the markers back).
                  if (key === 'showHeat')
                    S.set(
                      next
                        ? { showHeat: true, showMarkers: false, cluster: false }
                        : { showHeat: false, showMarkers: true }
                    )
                  else if (key === 'showMarkers' && next && S.showHeat)
                    S.set({ showMarkers: true, showHeat: false })
                  else S.set({ [key]: next } as never)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-accent/50"
              >
                <Icon className={cn('h-3.5 w-3.5', S[key] ? 'text-primary' : 'text-muted-foreground/60')} />
                <span className={cn('flex-1 text-left', !S[key] && 'text-muted-foreground')}>{t(label)}</span>
                <span
                  className={cn(
                    'relative h-4 w-7 rounded-full transition-colors',
                    S[key] ? 'bg-primary/80' : 'bg-secondary'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all',
                      S[key] ? 'left-3.5' : 'left-0.5'
                    )}
                  />
                </span>
              </button>
            ))}
          </section>

          {/* Event kinds */}
          <section className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('atlas.events')}
            </p>
            <div className="flex flex-wrap gap-1">
              {KINDS.map((k) => {
                const Icon = KIND_ICON[k]
                const on = S.kinds[k]
                const n = kindCount.get(k) ?? 0
                return (
                  <button
                    key={k}
                    onClick={() => S.setKind(k, !on)}
                    title={`${t(`atlas.kind.${k}`)}${n ? ` (${n})` : ''}`}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all',
                      on
                        ? 'border-transparent text-white shadow-sm'
                        : 'border-border/50 bg-secondary/30 text-muted-foreground opacity-60 hover:opacity-100'
                    )}
                    style={on ? { background: KIND_COLOR[k] } : undefined}
                  >
                    <Icon className="h-3 w-3" />
                    {t(`atlas.kind.${k}`)}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Time window (drives the period map's year too) */}
          <section className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('atlas.time')}
              </p>
              <span className="text-[11px] font-semibold tabular-nums text-primary">
                {yFrom}–{yTo}
              </span>
            </div>
            <div className="relative h-5">
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-secondary" />
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/60"
                style={{
                  left: `${((yFrom - yearBounds.min) / Math.max(1, yearBounds.max - yearBounds.min)) * 100}%`,
                  right: `${100 - ((yTo - yearBounds.min) / Math.max(1, yearBounds.max - yearBounds.min)) * 100}%`
                }}
              />
              <input
                type="range"
                min={yearBounds.min}
                max={yearBounds.max}
                value={yFrom}
                onChange={(e) => S.set({ yearFrom: Math.min(Number(e.target.value), yTo) })}
                className="tm-range pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
              />
              <input
                type="range"
                min={yearBounds.min}
                max={yearBounds.max}
                value={yTo}
                onChange={(e) => S.set({ yearTo: Math.max(Number(e.target.value), yFrom) })}
                className="tm-range pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
              />
            </div>
            {(S.yearFrom !== null || S.yearTo !== null) && (
              <button
                onClick={() => S.set({ yearFrom: null, yearTo: null })}
                className="text-[10px] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
              >
                {t('atlas.allTime')}
              </button>
            )}
          </section>

          {/* ---- Place manager (hierarchy + GOV) ---- */}
          <section className="border-t border-border/40 pt-2">
            <button
              onClick={() => setPlacesOpen(true)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-border/40 px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <Landmark className="h-3.5 w-3.5" /> {t('places.manage')}
            </button>
          </section>
        </div>
      </div>

      <PlacesManagerDialog open={placesOpen} onOpenChange={setPlacesOpen} />

      {/* ---- Journey timeline (left, glass) ---- */}
      {focusPerson && (
        <div className="glass-strong absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-80 flex-col overflow-hidden rounded-2xl text-foreground">
          <div className="flex items-center gap-2 border-b border-border/40 p-3">
            <PersonAvatar
              personId={focusPerson.id}
              name={fullName(focusPerson)}
              sex={focusPerson.sex}
              className="h-8 w-8 text-[10px]"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{fullName(focusPerson)}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('atlas.journeyOf', { count: journey.length })}
              </p>
            </div>
            <button
              onClick={() => setFocusId(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {journey.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t('atlas.noPlaces')}</p>
            )}
            <ol className="relative ml-3 space-y-0.5 border-l border-border/50">
              {journey.map((p, i) => {
                const Icon = KIND_ICON[p.kind]
                return (
                  <li key={i}>
                    <button
                      onClick={() =>
                        mapRef.current?.flyTo({ center: [p.lon, p.lat], zoom: 10, duration: 900 })
                      }
                      className="group flex w-full items-start gap-2.5 rounded-lg py-1.5 pl-4 pr-2 text-left transition-colors hover:bg-accent/50"
                    >
                      <span
                        className="absolute -left-[9px] mt-1 flex h-[18px] w-[18px] items-center justify-center rounded-full text-white ring-2 ring-background"
                        style={{ background: KIND_COLOR[p.kind] }}
                      >
                        <Icon className="h-2.5 w-2.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-1.5">
                          <span className="text-xs font-semibold tabular-nums">
                            {p.year ?? '—'}
                            {p.endYear ? `–${p.endYear}` : ''}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t(`atlas.kind.${p.kind}`)}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-foreground/90">{p.place}</span>
                        {p.detail && (
                          <span className="block truncate text-[10px] italic text-muted-foreground">{p.detail}</span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}

      {/* ---- Empty state: nothing geocoded yet ---- */}
      {ready && points.length === 0 && people.length > 0 && (
        <div className="glass-strong absolute left-1/2 top-1/2 z-10 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 text-center">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="text-sm font-semibold">{t('atlas.emptyTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('atlas.emptyHint')}</p>
          {typeof window.api.geo?.geocodeAll === 'function' && (
            <button
              onClick={() => void geocode()}
              disabled={!!geoProg}
              className="mt-3 w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {geoProg ? `${geoProg.done} / ${geoProg.total}` : t('atlas.geocode')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
